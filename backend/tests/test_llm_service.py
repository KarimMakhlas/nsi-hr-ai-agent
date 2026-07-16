import json

import pytest

from backend.app.services import llm_service


class FakeMessage:
    def __init__(self, content: str):
        self.content = content


class FakeChoice:
    def __init__(self, content: str):
        self.message = FakeMessage(content)


class FakeCompletion:
    def __init__(self, content: str):
        self.choices = [FakeChoice(content)]


def patch_router_completion(monkeypatch, content: str):
    monkeypatch.setattr(llm_service, "get_nvidia_client", lambda: object())
    monkeypatch.setattr(
        llm_service,
        "create_chat_completion",
        lambda client, **kwargs: FakeCompletion(content),
    )


def test_classify_route_with_llm_parses_valid_json(monkeypatch):
    patch_router_completion(
        monkeypatch,
        json.dumps({
            "route": "analysis_agent",
            "reason": "La question demande une analyse.",
        }),
    )

    result = llm_service.classify_route_with_llm(
        "Quels sont les principaux points de friction ?"
    )

    assert result == {
        "route": "analysis_agent",
        "reason": "La question demande une analyse.",
    }


def test_classify_route_with_llm_falls_back_on_invalid_json(monkeypatch):
    patch_router_completion(monkeypatch, "not json")

    result = llm_service.classify_route_with_llm("Compare Inès et Pauline")

    assert result == {
        "route": "kpi_agent",
        "reason": "Fallback: invalid JSON from router LLM",
    }


def test_classify_route_with_llm_falls_back_on_unknown_route(monkeypatch):
    patch_router_completion(
        monkeypatch,
        json.dumps({
            "route": "unknown_agent",
            "reason": "Bad route.",
        }),
    )

    result = llm_service.classify_route_with_llm("Compare Inès et Pauline")

    assert result == {
        "route": "kpi_agent",
        "reason": "Fallback: unknown route from router LLM",
    }


def test_generate_llm_text_uses_shared_completion_configuration(monkeypatch):
    calls = []
    client = object()
    monkeypatch.setenv("NVIDIA_MODEL", "configured/nvidia-model")
    monkeypatch.setattr(llm_service, "get_nvidia_client", lambda: client)

    def record_completion(received_client, **kwargs):
        calls.append((received_client, kwargs))
        return FakeCompletion("Réponse")

    monkeypatch.setattr(llm_service, "create_chat_completion", record_completion)

    result = llm_service.generate_llm_text(
        system_message="Instructions",
        user_message="Question",
        max_tokens=600,
        stream=False,
    )

    assert result == "Réponse"
    assert calls == [
        (
            client,
            {
                "model": "configured/nvidia-model",
                "messages": [
                    {"role": "system", "content": "Instructions"},
                    {"role": "user", "content": "Question"},
                ],
                "temperature": 0.2,
                "top_p": 0.7,
                "max_tokens": 600,
                "stream": False,
            },
        ),
    ]


@pytest.mark.parametrize(
    ("generate", "arguments", "max_tokens", "stream"),
    [
        (llm_service.generate_kpi_answer, ("Combien ?", {}), 600, False),
        (llm_service.generate_kpi_analysis, ("Pourquoi ?", {}), 800, None),
        (llm_service.generate_web_answer, ("Marché ?", {}, {}), 900, None),
    ],
)
def test_generation_calls_keep_configured_model_temperature_and_token_ceiling(
    monkeypatch,
    generate,
    arguments,
    max_tokens,
    stream,
):
    calls = []
    client = object()
    monkeypatch.setenv("NVIDIA_MODEL", "configured/nvidia-model")
    monkeypatch.setattr(llm_service, "get_nvidia_client", lambda: client)

    def record_completion(received_client, **kwargs):
        calls.append((received_client, kwargs))
        return FakeCompletion("Réponse")

    monkeypatch.setattr(llm_service, "create_chat_completion", record_completion)

    assert generate(*arguments) == "Réponse"
    assert len(calls) == 1

    received_client, kwargs = calls[0]
    assert received_client is client
    assert kwargs["model"] == "configured/nvidia-model"
    assert kwargs["temperature"] == 0.2
    assert kwargs["max_tokens"] == max_tokens
    assert [message["role"] for message in kwargs["messages"]] == ["system", "user"]
    if stream is None:
        assert "stream" not in kwargs
    else:
        assert kwargs["stream"] is stream
