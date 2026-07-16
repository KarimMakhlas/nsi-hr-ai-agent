import logging
from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from opentelemetry import metrics
from pydantic import BaseModel, StringConstraints

from backend.app.agents.graph import run_agentic_workflow
from backend.app.errors import AssistantServiceError
from backend.app.observability.logging_config import setup_logging
from backend.app.observability.telemetry import setup_telemetry
from backend.app.presentation import build_presentation
from backend.app.services.kpi_service import get_kpi_summary, get_kpis_by_recruiter


WEB_ROOT = Path(__file__).resolve().parents[2] / "frontend"


app = FastAPI(
    title="NSI HR KPI Agentic System",
    description="Mini-système pour exposer et analyser les KPI RH du T3 2024",
    version="1.0.0",
)

app.mount(
    "/static",
    StaticFiles(directory=WEB_ROOT),
    name="static",
)

setup_telemetry(app)


setup_logging()

logger = logging.getLogger("nsi-hr-api")


meter = metrics.get_meter("nsi-hr-api")

assistant_requests_counter = meter.create_counter(
    "assistant_requests_total",
    description="Number of assistant questions received",
)


QuestionText = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=3,
        max_length=500,
    ),
]

class AssistantRequest(BaseModel):
    question: QuestionText


def is_http_url(value: object) -> bool:
    if not isinstance(value, str):
        return False

    try:
        parsed = urlsplit(value)
    except ValueError:
        return False

    return parsed.scheme.lower() in {"http", "https"} and bool(parsed.netloc)


def build_response_sources(result: dict) -> list[dict]:
    sources = []

    kpi_source = result["kpi_summary"].get("source")

    if kpi_source:
        sources.append({
            "type": "kpi",
            "title": kpi_source,
        })

    if result["route"] != "web_agent":
        return sources

    seen_urls = set()

    for item in result["web_results"].get("results", []):
        url = item.get("url")

        if not is_http_url(url) or url in seen_urls:
            continue

        seen_urls.add(url)
        sources.append({
            "type": "web",
            "title": item.get("title") or url,
            "url": url,
        })

    return sources


@app.get("/", include_in_schema=False)
def get_cockpit():
    return FileResponse(WEB_ROOT / "index.html")


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "nsi-hr-ai-business-case"
    }


@app.get("/kpis/summary")
def get_summary():
    return get_kpi_summary()


@app.get("/kpis/rates")
def get_rates():
    summary = get_kpi_summary()

    return {
        "client_presentation_rate": summary["client_presentation_rate"],
        "signature_rate": summary["signature_rate"],
    }


@app.get("/kpis/recruiters")
def get_recruiters_kpis():
    return get_kpis_by_recruiter()


@app.post("/assistant/ask")
def ask_assistant(request: AssistantRequest):
    assistant_requests_counter.add(1)

    logger.info({
        "event": "assistant_request_received",
        "question_length": len(request.question),
    })

    try:
        result = run_agentic_workflow(request.question)
    except AssistantServiceError as exc:
        logger.exception({
            "event": "assistant_workflow_failed",
            "error_code": exc.code,
        })

        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "code": exc.code,
                "message": exc.public_message,
            },
        ) from exc
    except Exception as exc:
        logger.exception({
            "event": "assistant_workflow_failed",
            "error_code": "unexpected_error",
        })

        raise HTTPException(
            status_code=503,
            detail={
                "code": "assistant_service_unavailable",
                "message": "Assistant service is temporarily unavailable",
            },
        ) from exc

    logger.info({
        "event": "assistant_response_generated",
        "route": result["route"],
        "route_reason": result.get("route_reason", ""),
        "agent_path": result["agent_path"],
    })

    try:
        presentation = build_presentation(request.question, result)
    except Exception:
        logger.exception({
            "event": "assistant_presentation_failed",
            "route": result["route"],
        })
        presentation = []

    return {
        "question": request.question,
        "answer": result["final_answer"],
        "route": result["route"],
        "route_reason": result.get("route_reason", ""),
        "agent_path": result["agent_path"],
        "sources": build_response_sources(result),
        "presentation": presentation,
        "mode": "langgraph_agentic_workflow"
    }
