from typing import TypedDict, List, Dict, Any

from langgraph.graph import StateGraph, END

from backend.app.errors import KpiDataError
from backend.app.mcp_server.client import call_mcp_tool_sync
from backend.app.services.llm_service import (
    generate_kpi_answer,
    generate_kpi_analysis,
    generate_web_answer,
    classify_route_with_llm,
)

from opentelemetry import trace


tracer = trace.get_tracer("nsi-hr-agents")


class AgentState(TypedDict):
    question: str
    route: str
    route_reason: str
    search_query: str
    kpi_summary: Dict[str, Any]
    analysis: str
    web_results: Dict[str, Any]
    web_answer: str
    final_answer: str
    agent_path: List[str]


def supervisor_agent(state: AgentState) -> AgentState:
    with tracer.start_as_current_span("agent.supervisor") as span:
        routing = classify_route_with_llm(state["question"])

        route = routing["route"]
        reason = routing["reason"]
        search_query = routing.get("search_query", "")

        span.set_attribute("agent.name", "supervisor_agent")
        span.set_attribute("agent.route", route)
        span.set_attribute("agent.route_reason", reason)
        if search_query:
            span.set_attribute("agent.search_query", search_query)

        return {
            **state,
            "route": route,
            "route_reason": reason,
            "search_query": search_query,
            "agent_path": state["agent_path"] + ["supervisor_agent"],
        }


def route_from_supervisor(state: AgentState) -> str:
    return state["route"]


def build_flat_kpi_summary(summary: dict, by_recruiter: dict) -> dict:
    if "recruiters" not in by_recruiter:
        raise KpiDataError("MCP recruiter KPI payload is missing 'recruiters'")

    return {
        **summary,
        "recruiters": by_recruiter["recruiters"],
    }


def build_web_unavailable_answer(web_results: dict) -> str:
    error = web_results.get("error", "erreur inconnue")

    return (
        "Je peux lire les KPI internes, mais la recherche web est indisponible "
        f"pour le moment ({error}). Je ne peux donc pas comparer ces KPI avec "
        "le marché externe dans cette réponse."
    )


def kpi_agent(state: AgentState) -> AgentState:
    with tracer.start_as_current_span("agent.kpi") as span:
        span.set_attribute("agent.name", "kpi_agent")
        span.set_attribute("mcp.tools", "get_hr_kpi_summary,get_kpis_by_recruiter")

        summary = call_mcp_tool_sync("get_hr_kpi_summary")
        by_recruiter = call_mcp_tool_sync("get_kpis_by_recruiter")

        return {
            **state,
            "kpi_summary": build_flat_kpi_summary(summary, by_recruiter),
            "agent_path": state["agent_path"] + [
                "kpi_agent",
                "mcp:get_hr_kpi_summary",
                "mcp:get_kpis_by_recruiter",
            ],
        }


def analysis_agent(state: AgentState) -> AgentState:
    with tracer.start_as_current_span("agent.analysis") as span:
        span.set_attribute("agent.name", "analysis_agent")
        span.set_attribute("mcp.tool", "get_hr_kpi_summary")

        summary = call_mcp_tool_sync("get_hr_kpi_summary")

        analysis = generate_kpi_analysis(
            question=state["question"],
            kpi_summary=summary,
        )

        return {
            **state,
            "kpi_summary": summary,
            "analysis": analysis,
            "agent_path": state["agent_path"] + ["analysis_agent", "mcp:get_hr_kpi_summary"],
        }


def web_agent(state: AgentState) -> AgentState:
    with tracer.start_as_current_span("agent.web") as span:
        span.set_attribute("agent.name", "web_agent")
        span.set_attribute("mcp.tools", "get_hr_kpi_summary,web_search")

        summary = call_mcp_tool_sync("get_hr_kpi_summary")

        web_results = call_mcp_tool_sync(
            "web_search",
            {
                "query": state["search_query"] or state["question"]
            }
        )

        if web_results.get("error"):
            return {
                **state,
                "kpi_summary": summary,
                "web_results": web_results,
                "web_answer": build_web_unavailable_answer(web_results),
                "agent_path": state["agent_path"] + [
                    "web_agent",
                    "mcp:get_hr_kpi_summary",
                    "mcp:web_search:error",
                ],
            }

        web_answer = generate_web_answer(
            question=state["question"],
            kpi_summary=summary,
            web_results=web_results,
        )

        return {
            **state,
            "kpi_summary": summary,
            "web_results": web_results,
            "web_answer": web_answer,
            "agent_path": state["agent_path"] + [
                "web_agent",
                "mcp:get_hr_kpi_summary",
                "mcp:web_search",
            ],
        }


def final_answer_agent(state: AgentState) -> AgentState:
    with tracer.start_as_current_span("agent.final_answer") as span:
        span.set_attribute("agent.name", "final_answer_agent")
        span.set_attribute("agent.route", state["route"])

        if state["route"] == "analysis_agent":
            answer = state["analysis"]
        elif state["route"] == "web_agent":
            answer = state["web_answer"]
        else:
            answer = generate_kpi_answer(
                question=state["question"],
                kpi_summary=state["kpi_summary"],
            )

        return {
            **state,
            "final_answer": answer,
            "agent_path": state["agent_path"] + ["final_answer_agent"],
        }


def build_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("supervisor_agent", supervisor_agent)
    workflow.add_node("kpi_agent", kpi_agent)
    workflow.add_node("analysis_agent", analysis_agent)
    workflow.add_node("web_agent", web_agent)
    workflow.add_node("final_answer_agent", final_answer_agent)

    workflow.set_entry_point("supervisor_agent")

    workflow.add_conditional_edges(
        "supervisor_agent",
        route_from_supervisor,
        {
            "kpi_agent": "kpi_agent",
            "analysis_agent": "analysis_agent",
            "web_agent": "web_agent",
        },
    )

    workflow.add_edge("kpi_agent", "final_answer_agent")
    workflow.add_edge("analysis_agent", "final_answer_agent")
    workflow.add_edge("web_agent", "final_answer_agent")
    workflow.add_edge("final_answer_agent", END)

    return workflow.compile()


agent_graph = build_graph()


def run_agentic_workflow(question: str) -> AgentState:
    initial_state: AgentState = {
        "question": question,
        "route": "",
        "route_reason": "",
        "search_query": "",
        "kpi_summary": {},
        "analysis": "",
        "web_results": {},
        "web_answer": "",
        "final_answer": "",
        "agent_path": [],
    }

    return agent_graph.invoke(initial_state)
