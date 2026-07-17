import json
import os

from dotenv import load_dotenv
from openai import OpenAI

from backend.app.errors import LlmServiceError
from backend.app.prompts import (
    ANALYSIS_SYSTEM_MESSAGE,
    KPI_SYSTEM_MESSAGE,
    ROUTER_SYSTEM_MESSAGE,
    WEB_SYSTEM_MESSAGE,
    build_kpi_analysis_prompt,
    build_kpi_answer_prompt,
    build_route_classification_prompt,
    build_web_answer_prompt,
)

from opentelemetry import metrics


meter = metrics.get_meter("nsi-hr-llm")

llm_calls_counter = meter.create_counter(
    "llm_calls_total",
    description="Number of LLM calls",
)


load_dotenv()


def get_nvidia_client() -> OpenAI:
    api_key = os.getenv("NVIDIA_API_KEY")

    if not api_key:
        raise LlmServiceError("NVIDIA_API_KEY is missing in .env file")

    return OpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=api_key,
        timeout=30.0,
        max_retries=1,
    )


def create_chat_completion(client: OpenAI, **kwargs):
    try:
        return client.chat.completions.create(**kwargs)
    except LlmServiceError:
        raise
    except Exception as exc:
        raise LlmServiceError(f"NVIDIA chat completion failed: {exc}") from exc


def generate_llm_text(
    system_message: str,
    user_message: str,
    max_tokens: int,
    temperature: float = 0.2,
    top_p: float | None = 0.7,
    stream: bool | None = None,
) -> str:
    llm_calls_counter.add(1)

    completion_kwargs = {
        "model": os.getenv("NVIDIA_MODEL", "meta/llama-3.1-8b-instruct"),
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if top_p is not None:
        completion_kwargs["top_p"] = top_p
    if stream is not None:
        completion_kwargs["stream"] = stream

    completion = create_chat_completion(get_nvidia_client(), **completion_kwargs)
    return completion.choices[0].message.content


def generate_kpi_answer(question: str, kpi_summary: dict) -> str:
    return generate_llm_text(
        system_message=KPI_SYSTEM_MESSAGE,
        user_message=build_kpi_answer_prompt(question, kpi_summary),
        max_tokens=600,
        stream=False,
    )


def generate_kpi_analysis(question: str, kpi_summary: dict) -> str:
    return generate_llm_text(
        system_message=ANALYSIS_SYSTEM_MESSAGE,
        user_message=build_kpi_analysis_prompt(question, kpi_summary),
        max_tokens=800,
    )


def generate_web_answer(question: str, kpi_summary: dict, web_results: dict) -> str:
    return generate_llm_text(
        system_message=WEB_SYSTEM_MESSAGE,
        user_message=build_web_answer_prompt(question, kpi_summary, web_results),
        max_tokens=900,
    )


def classify_route_with_llm(question: str) -> dict:
    content = generate_llm_text(
        system_message=ROUTER_SYSTEM_MESSAGE,
        user_message=build_route_classification_prompt(question),
        temperature=0,
        max_tokens=150,
        top_p=None,
    )

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return {
            "route": "kpi_agent",
            "reason": "Fallback: invalid JSON from router LLM",
            "search_query": "",
        }

    route = parsed.get("route")

    allowed_routes = {"kpi_agent", "analysis_agent", "web_agent"}

    if route not in allowed_routes:
        return {
            "route": "kpi_agent",
            "reason": "Fallback: unknown route from router LLM",
            "search_query": "",
        }

    search_query = parsed.get("search_query", "")
    if route == "web_agent":
        if not isinstance(search_query, str) or not search_query.strip():
            search_query = question
        else:
            search_query = search_query.strip()
    else:
        search_query = ""

    return {
        "route": route,
        "reason": parsed.get("reason", ""),
        "search_query": search_query,
    }
