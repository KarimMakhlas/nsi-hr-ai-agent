import pytest

from backend.app.agents.graph import build_flat_kpi_summary
from backend.app.errors import KpiDataError
from backend.app.services.kpi_service import (
    KPI_MAPPING,
    build_clean_summary_from_raw,
    calculate_rate,
    get_kpi_summary,
    get_kpis_by_recruiter,
)


def test_calculate_rate():
    assert calculate_rate(3, 8) == 38
    assert calculate_rate(5, 0) == 0


def test_global_kpi_summary_matches_excel_totals():
    summary = get_kpi_summary()

    assert summary["period"] == "T3 2024"
    assert summary["source"] == "Excel KPI RH Q3 2024"
    assert summary["candidates_contacted"] == 809
    assert summary["employee_interviews"] == 27
    assert summary["freelance_interviews"] == 135
    assert summary["total_interviews"] == 162
    assert summary["client_presentations"] == 8
    assert summary["employee_recruitments"] == 1
    assert summary["freelance_recruitments"] == 2
    assert summary["total_recruitments"] == 3
    assert summary["client_presentation_rate"] == 5
    assert summary["signature_rate"] == 38


def test_recruiter_kpis_match_excel_totals():
    by_recruiter = get_kpis_by_recruiter()

    assert by_recruiter["period"] == "T3 2024"
    assert by_recruiter["source"] == "Excel KPI RH Q3 2024"

    recruiters = by_recruiter["recruiters"]

    assert recruiters["Inès"]["candidates_contacted"] == 236
    assert recruiters["Inès"]["total_interviews"] == 50
    assert recruiters["Inès"]["client_presentations"] == 1
    assert recruiters["Inès"]["total_recruitments"] == 1

    assert recruiters["Pauline"]["candidates_contacted"] == 199
    assert recruiters["Pauline"]["total_interviews"] == 40
    assert recruiters["Pauline"]["client_presentations"] == 5
    assert recruiters["Pauline"]["total_recruitments"] == 2


def test_missing_required_kpis_raise_clear_data_error():
    raw_kpis = {french_name: 1 for french_name in KPI_MAPPING}
    raw_kpis.pop("Nb de candidats contactés")

    with pytest.raises(KpiDataError, match="Missing required KPI"):
        build_clean_summary_from_raw(raw_kpis)


def test_build_flat_kpi_summary_keeps_global_fields_top_level():
    summary = {
        "period": "T3 2024",
        "source": "Excel KPI RH Q3 2024",
        "candidates_contacted": 809,
    }
    by_recruiter = {
        "recruiters": {
            "Inès": {
                "candidates_contacted": 236,
            },
        },
    }

    flat_summary = build_flat_kpi_summary(summary, by_recruiter)

    assert flat_summary["source"] == "Excel KPI RH Q3 2024"
    assert flat_summary["candidates_contacted"] == 809
    assert flat_summary["recruiters"]["Inès"]["candidates_contacted"] == 236


def test_build_flat_kpi_summary_requires_recruiters_payload():
    with pytest.raises(KpiDataError, match="missing 'recruiters'"):
        build_flat_kpi_summary({"source": "Excel KPI RH Q3 2024"}, {})
