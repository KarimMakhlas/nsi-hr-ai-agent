import os
from collections import defaultdict
from numbers import Number

import pandas as pd

from backend.app.errors import KpiDataError


EXCEL_PATH = os.getenv(
    "EXCEL_FILE_PATH",
    "data/Data Reporting KPI RH Q32024 (1).xlsx"
)

PERIOD = "T3 2024"
SOURCE = "Excel KPI RH Q3 2024"


KPI_MAPPING = {
    "Nb de candidats contactés": "candidates_contacted",
    "Nb d'entretiens candidats Salariés": "employee_interviews",
    "Nb d'entretiens candidats Sous-Traitants": "freelance_interviews",
    "Nb de candidats recrutés Salariés": "employee_recruitments",
    "Nb de candidats intégrés Sous Traitants": "freelance_recruitments",
    "Nombre de présentations clients": "client_presentations",
    "Nb de refus CDI Salariés": "employee_refusals",
    "Nombre de KO candidat à la suite d'une présentation client": "candidate_ko_after_client_presentation",
    "Nombre de KO client à la suite d'une présentation client": "client_ko_after_client_presentation",
}


def calculate_rate(numerator: int, denominator: int) -> int:
    if denominator == 0:
        return 0

    return round((numerator / denominator) * 100)


def open_excel_file() -> pd.ExcelFile:
    try:
        return pd.ExcelFile(EXCEL_PATH)
    except FileNotFoundError as exc:
        raise KpiDataError(f"KPI Excel file not found: {EXCEL_PATH}") from exc
    except Exception as exc:
        raise KpiDataError(f"Unable to read KPI Excel file: {EXCEL_PATH}") from exc


def read_sheet_kpis(sheet_name: str) -> dict:
    try:
        df = pd.read_excel(EXCEL_PATH, sheet_name=sheet_name, header=None)
    except FileNotFoundError as exc:
        raise KpiDataError(f"KPI Excel file not found: {EXCEL_PATH}") from exc
    except Exception as exc:
        raise KpiDataError(f"Unable to read KPI sheet: {sheet_name}") from exc

    kpi_col = 1
    total_col = 10

    kpis = defaultdict(int)

    for _, row in df.iterrows():
        kpi_name = row[kpi_col]
        total_value = row[total_col]

        if pd.isna(kpi_name) or pd.isna(total_value):
            continue

        if not isinstance(total_value, Number):
            continue

        clean_name = str(kpi_name).strip()

        # If the same KPI label appears twice, we add instead of overwriting.
        kpis[clean_name] += int(total_value)

    return dict(kpis)


def validate_required_kpis(raw_kpis: dict) -> None:
    missing_kpis = [
        french_name
        for french_name in KPI_MAPPING.keys()
        if french_name not in raw_kpis
    ]

    if missing_kpis:
        raise KpiDataError(
            f"Missing required KPI(s) in Excel file: {missing_kpis}"
        )


def build_clean_summary_from_raw(raw_kpis: dict) -> dict:
    validate_required_kpis(raw_kpis)

    summary = {
        "period": PERIOD,
        "source": SOURCE,
    }

    for french_name, english_name in KPI_MAPPING.items():
        summary[english_name] = raw_kpis[french_name]

    summary["total_interviews"] = (
        summary["employee_interviews"] + summary["freelance_interviews"]
    )

    summary["total_recruitments"] = (
        summary["employee_recruitments"] + summary["freelance_recruitments"]
    )

    summary["client_presentation_rate"] = calculate_rate(
        summary["client_presentations"],
        summary["total_interviews"],
    )

    summary["signature_rate"] = calculate_rate(
        summary["total_recruitments"],
        summary["client_presentations"],
    )

    return summary


def get_kpi_summary() -> dict:
    excel_file = open_excel_file()

    raw_global_kpis = defaultdict(int)

    for sheet_name in excel_file.sheet_names:
        sheet_kpis = read_sheet_kpis(sheet_name)

        for kpi_name, value in sheet_kpis.items():
            raw_global_kpis[kpi_name] += value

    return build_clean_summary_from_raw(dict(raw_global_kpis))


def get_kpis_by_recruiter() -> dict:
    excel_file = open_excel_file()

    recruiters = {}

    for sheet_name in excel_file.sheet_names:
        sheet_kpis = read_sheet_kpis(sheet_name)
        recruiters[sheet_name] = build_clean_summary_from_raw(sheet_kpis)

    return {
        "period": PERIOD,
        "source": SOURCE,
        "recruiters": recruiters,
    }
