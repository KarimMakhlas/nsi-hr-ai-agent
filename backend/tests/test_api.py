import os

from fastapi.testclient import TestClient
import pytest

os.environ["NSI_TELEMETRY_DISABLED"] = "1"

from backend.app import main
from backend.app.errors import LlmServiceError


SUMMARY = {
    "source": "Excel KPI RH Q3 2024",
    "candidates_contacted": 809,
    "total_interviews": 162,
    "client_presentations": 8,
    "total_recruitments": 3,
    "client_presentation_rate": 5,
    "signature_rate": 38,
    "recruiters": {},
}


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "not a URL",
        "https:///missing-host",
        123,
    ],
)
def test_response_sources_reject_non_http_and_malformed_urls(url):
    result = {
        "route": "web_agent",
        "kpi_summary": {},
        "web_results": {
            "results": [
                {
                    "title": "Unsafe source",
                    "url": url,
                }
            ],
        },
    }

    assert main.build_response_sources(result) == []


def test_assistant_endpoint_returns_route_reason_and_structured_sources(monkeypatch):
    def fake_workflow(question: str) -> dict:
        return {
            "question": question,
            "route": "web_agent",
            "route_reason": "La question demande une comparaison externe.",
            "kpi_summary": SUMMARY,
            "analysis": "",
            "web_results": {
                "results": [
                    {
                        "title": "Recruiting trends",
                        "url": "https://example.com/trends",
                    },
                    {
                        "title": "Recruiting trends duplicate",
                        "url": "https://example.com/trends",
                    },
                ],
            },
            "web_answer": "Réponse web",
            "final_answer": "Réponse web",
            "agent_path": [
                "supervisor_agent",
                "web_agent",
                "mcp:get_hr_kpi_summary",
                "mcp:web_search",
                "final_answer_agent",
            ],
        }

    monkeypatch.setattr(main, "run_agentic_workflow", fake_workflow)

    client = TestClient(main.app)
    response = client.post(
        "/assistant/ask",
        json={"question": "Compare nos KPI avec les tendances du recrutement."},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["route"] == "web_agent"
    assert data["route_reason"] == "La question demande une comparaison externe."
    assert data["sources"] == [
        {
            "type": "kpi",
            "title": "Excel KPI RH Q3 2024",
        },
        {
            "type": "web",
            "title": "Recruiting trends",
            "url": "https://example.com/trends",
        },
    ]
    assert data["presentation"] == []


def test_assistant_endpoint_preserves_fields_and_adds_presentation(monkeypatch):
    def fake_workflow(question: str) -> dict:
        return {
            "question": question,
            "route": "kpi_agent",
            "route_reason": "La question porte sur les KPI internes.",
            "kpi_summary": SUMMARY,
            "final_answer": "809 faux 9999",
            "agent_path": [
                "supervisor_agent",
                "kpi_agent",
                "mcp:get_hr_kpi_summary",
                "final_answer_agent",
            ],
        }

    monkeypatch.setattr(main, "run_agentic_workflow", fake_workflow)

    client = TestClient(main.app)
    response = client.post(
        "/assistant/ask",
        json={"question": "Donne-moi les 4 KPI clés du T3 2024"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "question": "Donne-moi les 4 KPI clés du T3 2024",
        "answer": "809 faux 9999",
        "route": "kpi_agent",
        "route_reason": "La question porte sur les KPI internes.",
        "agent_path": [
            "supervisor_agent",
            "kpi_agent",
            "mcp:get_hr_kpi_summary",
            "final_answer_agent",
        ],
        "sources": [
            {
                "type": "kpi",
                "title": "Excel KPI RH Q3 2024",
            }
        ],
        "presentation": [
            {
                "type": "metrics",
                "title": "Le trimestre en bref",
                "items": [
                    {"label": "Contactés", "value": 809},
                    {"label": "Entretiens", "value": 162},
                    {"label": "Présentations clients", "value": 8},
                    {"label": "Recrutements", "value": 3},
                ],
            }
        ],
        "mode": "langgraph_agentic_workflow",
    }


def test_assistant_endpoint_keeps_valid_answer_when_presentation_fails(monkeypatch):
    def fake_workflow(question: str) -> dict:
        return {
            "question": question,
            "route": "kpi_agent",
            "route_reason": "La question porte sur les KPI internes.",
            "kpi_summary": SUMMARY,
            "final_answer": "Réponse valide",
            "agent_path": ["supervisor_agent", "kpi_agent", "final_answer_agent"],
        }

    def broken_presentation(question: str, result: dict) -> list[dict]:
        raise RuntimeError("unexpected presentation failure")

    monkeypatch.setattr(main, "run_agentic_workflow", fake_workflow)
    monkeypatch.setattr(main, "build_presentation", broken_presentation)

    client = TestClient(main.app, raise_server_exceptions=False)
    response = client.post(
        "/assistant/ask",
        json={"question": "Donne-moi les KPI clés"},
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "Réponse valide"
    assert response.json()["presentation"] == []


def test_assistant_endpoint_maps_known_service_errors(monkeypatch):
    def fake_workflow(question: str) -> dict:
        raise LlmServiceError("NVIDIA_API_KEY is missing in .env file")

    monkeypatch.setattr(main, "run_agentic_workflow", fake_workflow)

    client = TestClient(main.app)
    response = client.post(
        "/assistant/ask",
        json={"question": "Combien de candidats Inès a contactés ?"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == {
        "code": "llm_service_unavailable",
        "message": "AI generation is temporarily unavailable",
    }


def test_assistant_endpoint_validates_short_questions():
    client = TestClient(main.app)
    response = client.post("/assistant/ask", json={"question": "ok"})

    assert response.status_code == 422
