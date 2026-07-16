from backend.app.prompts import (
    ANALYSIS_SYSTEM_MESSAGE,
    build_kpi_analysis_prompt,
    build_kpi_answer_prompt,
    build_route_classification_prompt,
    build_web_answer_prompt,
)


def test_kpi_prompt_leads_with_direct_answer_and_forbids_repetition():
    prompt = build_kpi_answer_prompt("Combien ?", {"total_recruitments": 3})
    assert "Commence par la réponse directe" in prompt
    assert "Ne répète pas la question" in prompt
    assert "1 à 3 phrases" in prompt


def test_analysis_prompt_separates_facts_hypotheses_and_actions():
    prompt = build_kpi_analysis_prompt("Pourquoi ?", {"signature_rate": 38})
    assert "Faits observés" in prompt
    assert "Hypothèses" in prompt
    assert "3 recommandations" in prompt


def test_analysis_prompt_forbids_technical_field_names():
    prompt = build_kpi_analysis_prompt("Pourquoi ?", {"signature_rate": 38})

    assert "N’utilise jamais les noms techniques des champs" in prompt


def test_analysis_system_message_forbids_technical_names_and_unbenchmarked_judgments():
    assert "noms techniques des champs" in ANALYSIS_SYSTEM_MESSAGE
    assert all(
        judgment in ANALYSIS_SYSTEM_MESSAGE
        for judgment in ("élevé", "faible", "bon", "mauvais")
    )
    assert "sans objectif explicite ou benchmark comparable" in ANALYSIS_SYSTEM_MESSAGE


def test_analysis_prompt_requires_exact_plain_standalone_headings():
    prompt = build_kpi_analysis_prompt("Pourquoi ?", {"signature_rate": 38})
    prompt_lines = prompt.splitlines()

    assert "Utilise exactement ces trois titres" in prompt
    assert "sans marqueur Markdown" in prompt
    assert "Faits observés" in prompt_lines
    assert "Hypothèses" in prompt_lines
    assert "Recommandations" in prompt_lines


def test_web_prompt_labels_internal_and_external_evidence():
    prompt = build_web_answer_prompt("Marché ?", {}, {"results": []})
    assert "Données internes" in prompt
    assert "Contexte externe" in prompt
    assert "comparaison chiffrée directe" in prompt


def test_web_prompt_answers_in_first_section_and_only_summarizes_in_conclusion():
    prompt = build_web_answer_prompt("Marché ?", {}, {"results": []})
    internal_start = prompt.index("1. Données internes")
    external_start = prompt.index("2. Contexte externe")
    conclusion_start = prompt.index("3. Conclusion")

    assert internal_start < external_start < conclusion_start
    internal_section = prompt[internal_start:external_start]
    conclusion_section = prompt[conclusion_start:]
    assert "commence par la réponse directe à la question" in internal_section
    assert "synthèse brève" in conclusion_section
    assert "sans répéter la réponse directe" in conclusion_section
    assert "déjà avoir été donnée dans la première section" in conclusion_section


def test_router_keeps_three_routes_and_resolves_ambiguous_examples():
    prompt = build_route_classification_prompt("Analyse le taux")
    assert all(route in prompt for route in ("kpi_agent", "analysis_agent", "web_agent"))
    assert "Quel est le taux de signature ?" in prompt
    assert "Que signifie ce taux de signature ?" in prompt
