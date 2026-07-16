from backend.app.agents import graph


def base_state(question: str, route: str = "") -> dict:
    return {
        "question": question,
        "route": route,
        "route_reason": "",
        "kpi_summary": {},
        "analysis": "",
        "web_results": {},
        "web_answer": "",
        "final_answer": "",
        "agent_path": [],
    }


def test_supervisor_agent_uses_llm_route_and_reason(monkeypatch):
    def fake_classifier(question: str) -> dict:
        return {
            "route": "analysis_agent",
            "reason": "La question demande une analyse interne.",
        }

    monkeypatch.setattr(graph, "classify_route_with_llm", fake_classifier)

    result = graph.supervisor_agent(base_state("Pourquoi ce taux est faible ?"))

    assert result["route"] == "analysis_agent"
    assert result["route_reason"] == "La question demande une analyse interne."
    assert result["agent_path"] == ["supervisor_agent"]


def test_kpi_agent_combines_global_and_recruiter_mcp_payloads(monkeypatch):
    def fake_mcp_tool(tool_name: str, arguments: dict | None = None):
        if tool_name == "get_hr_kpi_summary":
            return {
                "period": "T3 2024",
                "source": "Excel KPI RH Q3 2024",
                "candidates_contacted": 809,
            }

        if tool_name == "get_kpis_by_recruiter":
            return {
                "period": "T3 2024",
                "source": "Excel KPI RH Q3 2024",
                "recruiters": {
                    "Inès": {
                        "candidates_contacted": 236,
                    },
                },
            }

        raise AssertionError(f"Unexpected MCP tool: {tool_name}")

    monkeypatch.setattr(graph, "call_mcp_tool_sync", fake_mcp_tool)

    result = graph.kpi_agent(
        base_state("Combien de candidats Inès a contactés ?", route="kpi_agent")
    )

    assert result["kpi_summary"]["source"] == "Excel KPI RH Q3 2024"
    assert result["kpi_summary"]["candidates_contacted"] == 809
    assert result["kpi_summary"]["recruiters"]["Inès"]["candidates_contacted"] == 236
    assert result["agent_path"] == [
        "kpi_agent",
        "mcp:get_hr_kpi_summary",
        "mcp:get_kpis_by_recruiter",
    ]


def test_web_agent_degrades_when_web_search_is_unavailable(monkeypatch):
    def fake_mcp_tool(tool_name: str, arguments: dict | None = None):
        if tool_name == "get_hr_kpi_summary":
            return {
                "period": "T3 2024",
                "source": "Excel KPI RH Q3 2024",
                "candidates_contacted": 809,
            }

        if tool_name == "web_search":
            return {
                "query": arguments["query"],
                "error": "TAVILY_API_KEY is missing.",
                "results": [],
            }

        raise AssertionError(f"Unexpected MCP tool: {tool_name}")

    def fail_if_web_llm_is_called(*args, **kwargs):
        raise AssertionError("web LLM should not run when search returns an error")

    monkeypatch.setattr(graph, "call_mcp_tool_sync", fake_mcp_tool)
    monkeypatch.setattr(graph, "generate_web_answer", fail_if_web_llm_is_called)

    result = graph.web_agent(
        base_state(
            "Compare nos KPI avec les tendances du recrutement.",
            route="web_agent",
        )
    )

    assert result["kpi_summary"]["source"] == "Excel KPI RH Q3 2024"
    assert "recherche web est indisponible" in result["web_answer"]
    assert result["agent_path"] == [
        "web_agent",
        "mcp:get_hr_kpi_summary",
        "mcp:web_search:error",
    ]


def test_final_answer_agent_reuses_analysis_and_web_outputs():
    analysis_state = base_state("Analyse notre parcours", route="analysis_agent")
    analysis_state["analysis"] = "Analyse prête."

    analysis_result = graph.final_answer_agent(analysis_state)

    assert analysis_result["final_answer"] == "Analyse prête."

    web_state = base_state("Compare avec le marché", route="web_agent")
    web_state["web_answer"] = "Réponse web prête."

    web_result = graph.final_answer_agent(web_state)

    assert web_result["final_answer"] == "Réponse web prête."
