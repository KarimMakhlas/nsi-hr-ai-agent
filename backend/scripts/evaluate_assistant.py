import argparse
from dataclasses import dataclass

import requests

API_URL = "http://127.0.0.1:8000/assistant/ask"


@dataclass
class EvaluationResult:
    question: str
    expected_route: str
    actual_route: str | None
    route_ok: bool
    error: str | None = None


EVALUATION_QUESTIONS = [
    {
        "question": "Combien de candidats avons-nous contactés ?",
        "expected_route": "kpi_agent",
    },
    {
        "question": "Combien d’entretiens avons-nous réalisés au total ?",
        "expected_route": "kpi_agent",
    },
    {
        "question": "Combien de candidats ont été recrutés ?",
        "expected_route": "kpi_agent",
    },
    {
        "question": "Quel est notre taux de présentation client ?",
        "expected_route": "kpi_agent",
    },
    {
        "question": "Quel est notre taux de signature ?",
        "expected_route": "kpi_agent",
    },
    {
        "question": "Quelle est la différence entre les KO candidats et les KO clients ?",
        "expected_route": "kpi_agent",
    },
    {
        "question": "Analyse notre parcours de recrutement.",
        "expected_route": "analysis_agent",
    },
    {
        "question": "Pourquoi avons-nous seulement 8 présentations sur 162 entretiens ?",
        "expected_route": "analysis_agent",
    },
    {
        "question": "Quels sont les principaux points de friction ?",
        "expected_route": "analysis_agent",
    },
    {
        "question": "Que recommandes-tu pour améliorer nos résultats ?",
        "expected_route": "analysis_agent",
    },
    {
        "question": "Est-ce que 38% signifie que la moitié des présentations échouent ?",
        "expected_route": "kpi_agent",
    },
    {
        "question": "Compare nos KPI avec les tendances du recrutement en France.",
        "expected_route": "web_agent",
    },
    {
        "question": "Combien avons-nous recruté en octobre 2024 ?",
        "expected_route": "kpi_agent",
    },
    {
        "question": "Quel recruteur a obtenu les meilleurs résultats ?",
        "expected_route": "kpi_agent",
    },
    {
        "question": "Compare Inès et Pauline",
        "expected_route": "kpi_agent",
    },
    {
        "question": "Quel âge ont les candidats recrutés ?",
        "expected_route": "kpi_agent",
    },
]


def call_assistant(api_url: str, question: str) -> dict:
    response = requests.post(
        api_url,
        json={"question": question},
        timeout=90,
    )
    response.raise_for_status()
    return response.json()


def print_answer_preview(answer: str, max_chars: int = 700) -> None:
    if len(answer) <= max_chars:
        print(answer)
        return

    print(answer[:max_chars].rstrip())
    print("... [answer truncated for demo readability]")


def run_evaluation(api_url: str, show_answers: bool) -> list[EvaluationResult]:
    results = []
    passed_routes = 0

    for index, item in enumerate(EVALUATION_QUESTIONS, start=1):
        question = item["question"]
        expected_route = item["expected_route"]

        print("\n" + "=" * 90)
        print(f"TEST {index}")
        print(f"Question: {question}")
        print(f"Expected route: {expected_route}")

        try:
            data = call_assistant(api_url, question)

        except Exception as exc:
            print(f"ERROR: {exc}")
            results.append(
                EvaluationResult(
                    question=question,
                    expected_route=expected_route,
                    actual_route=None,
                    route_ok=False,
                    error=str(exc),
                )
            )
            continue

        actual_route = data.get("route")
        route_ok = actual_route == expected_route

        if route_ok:
            passed_routes += 1

        print(f"Actual route: {actual_route} {'✅' if route_ok else '❌'}")
        print(f"Route reason: {data.get('route_reason')}")
        print(f"Agent path: {data.get('agent_path')}")
        print(f"Sources: {data.get('sources')}")

        if show_answers:
            print("\nAnswer:")
            print_answer_preview(data.get("answer", ""))

        results.append(
            EvaluationResult(
                question=question,
                expected_route=expected_route,
                actual_route=actual_route,
                route_ok=route_ok,
            )
        )

    print("\n" + "=" * 90)
    print(f"ROUTING SCORE: {passed_routes}/{len(EVALUATION_QUESTIONS)}")

    failed = [result for result in results if not result.route_ok]

    if failed:
        print("\nRoutes to review:")

        for result in failed:
            print(
                f"- {result.question} "
                f"(expected {result.expected_route}, got {result.actual_route})"
            )

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Manual demo/evaluation script for the assistant API."
    )
    parser.add_argument(
        "--api-url",
        default=API_URL,
        help="Assistant endpoint to call.",
    )
    parser.add_argument(
        "--show-answers",
        action="store_true",
        help="Print answer previews. Without this, only routing is shown.",
    )
    args = parser.parse_args()

    run_evaluation(args.api_url, args.show_answers)


if __name__ == "__main__":
    main()
