from backend.app.presentation import build_presentation, sanitize_presentation


SUMMARY = {
    "candidates_contacted": 809,
    "total_interviews": 162,
    "client_presentations": 8,
    "total_recruitments": 3,
    "client_presentation_rate": 5,
    "signature_rate": 38,
    "recruiters": {
        "Inès": {
            "candidates_contacted": 236,
            "total_interviews": 50,
            "client_presentations": 1,
            "total_recruitments": 1,
            "client_presentation_rate": 2,
            "signature_rate": 100,
        },
        "Pauline": {
            "candidates_contacted": 199,
            "total_interviews": 40,
            "client_presentations": 5,
            "total_recruitments": 2,
            "client_presentation_rate": 12.5,
            "signature_rate": 40,
        },
    },
}


def result(route="kpi_agent"):
    return {"route": route, "kpi_summary": SUMMARY, "final_answer": "809 faux 9999"}


def test_global_summary_uses_exact_kpi_payload_values():
    blocks = build_presentation("Donne-moi les 4 KPI clés du T3 2024", result())
    assert blocks[0]["type"] == "metrics"
    assert [item["value"] for item in blocks[0]["items"]] == [809, 162, 8, 3]
    assert "9999" not in str(blocks)


def test_global_summary_matching_is_accent_insensitive():
    blocks = build_presentation("Resume les KPI cles du trimestre", result())
    assert blocks[0]["type"] == "metrics"


def test_named_recruiter_comparison_uses_same_indicators():
    blocks = build_presentation("Compare Inès et Pauline", result())
    table = next(block for block in blocks if block["type"] == "table")
    assert table["columns"] == ["Indicateur", "Inès", "Pauline"]
    assert table["rows"][0] == ["Contactés", 236, 199]
    assert table["rows"][3] == ["Recrutements", 1, 2]


def test_partial_recruiter_names_are_not_matched():
    assert build_presentation("Compare Inè et Paul", result()) == []


def test_analysis_route_uses_exact_conversion_values():
    blocks = build_presentation(
        "Où se situe la principale friction du parcours de recrutement ?",
        result(route="analysis_agent"),
    )
    assert blocks == [
        {
            "type": "metrics",
            "title": "Conversions du parcours",
            "items": [
                {"label": "Entretiens → présentations (%)", "value": 5},
                {"label": "Présentations → recrutements (%)", "value": 38},
            ],
        }
    ]


def test_simple_fact_does_not_add_decorative_blocks():
    assert build_presentation("Combien de recrutements ?", result()) == []


def test_invalid_optional_blocks_are_omitted_individually():
    assert sanitize_presentation([
        {"type": "insight", "tone": "attention", "title": "Point", "text": "Texte"},
        {"type": "script", "html": "<script>alert(1)</script>"},
    ]) == [{"type": "insight", "tone": "attention", "title": "Point", "text": "Texte"}]


def test_malformed_table_does_not_discard_other_valid_blocks():
    assert sanitize_presentation([
        {
            "type": "table",
            "title": "Comparaison",
            "columns": ["Indicateur", "Inès"],
            "rows": [["Contactés"]],
        },
        {
            "type": "actions",
            "title": "Actions",
            "items": ["Suivre le taux chaque semaine"],
        },
    ]) == [
        {
            "type": "actions",
            "title": "Actions",
            "items": ["Suivre le taux chaque semaine"],
        }
    ]


def test_malformed_recruiter_payload_falls_back_to_plain_answer():
    malformed_result = result()
    malformed_result["kpi_summary"] = {
        **SUMMARY,
        "recruiters": {
            **SUMMARY["recruiters"],
            "Pauline": None,
        },
    }

    assert build_presentation(
        "Compare Inès et Pauline",
        malformed_result,
    ) == []
