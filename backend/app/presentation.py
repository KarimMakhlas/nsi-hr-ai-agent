import re
import unicodedata
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter, ValidationError


ShortText = Annotated[str, Field(min_length=1, max_length=120)]
BodyText = Annotated[str, Field(min_length=1, max_length=500)]
Primitive = str | int | float


class MetricItem(BaseModel):
    label: ShortText
    value: Primitive


class MetricsBlock(BaseModel):
    type: Literal["metrics"]
    title: ShortText
    items: Annotated[list[MetricItem], Field(min_length=1, max_length=4)]


class TableBlock(BaseModel):
    type: Literal["table"]
    title: ShortText
    columns: Annotated[list[ShortText], Field(min_length=2, max_length=6)]
    rows: Annotated[list[list[Primitive]], Field(min_length=1, max_length=8)]


class InsightBlock(BaseModel):
    type: Literal["insight"]
    tone: Literal["neutral", "attention", "positive"]
    title: ShortText
    text: BodyText


class ActionsBlock(BaseModel):
    type: Literal["actions"]
    title: ShortText
    items: Annotated[list[BodyText], Field(min_length=1, max_length=3)]


PresentationBlock = Annotated[
    Union[MetricsBlock, TableBlock, InsightBlock, ActionsBlock],
    Field(discriminator="type"),
]
BLOCK_ADAPTER = TypeAdapter(PresentationBlock)


GLOBAL_SUMMARY_TERMS = {
    "cles",
    "global",
    "principaux",
    "resume",
    "synthese",
}

GLOBAL_METRICS = (
    ("Contactés", "candidates_contacted"),
    ("Entretiens", "total_interviews"),
    ("Présentations clients", "client_presentations"),
    ("Recrutements", "total_recruitments"),
)

RECRUITER_INDICATORS = (
    ("Contactés", "candidates_contacted"),
    ("Entretiens", "total_interviews"),
    ("Présentations clients", "client_presentations"),
    ("Recrutements", "total_recruitments"),
    ("Taux de présentation client (%)", "client_presentation_rate"),
    ("Taux de signature (%)", "signature_rate"),
)


def sanitize_presentation(blocks: list[dict]) -> list[dict]:
    valid = []

    for block in blocks:
        try:
            parsed = BLOCK_ADAPTER.validate_python(block)
        except ValidationError:
            continue

        dumped = parsed.model_dump()

        if dumped["type"] == "table" and any(
            len(row) != len(dumped["columns"]) for row in dumped["rows"]
        ):
            continue

        valid.append(dumped)

    return valid


def normalize_question(question: str) -> str:
    decomposed = unicodedata.normalize("NFKD", question)
    without_accents = "".join(
        character
        for character in decomposed
        if not unicodedata.combining(character)
    )
    return " ".join(without_accents.casefold().split())


def find_named_recruiters(question: str, recruiters: dict) -> list[str]:
    normalized_question = normalize_question(question)
    matches = []

    for recruiter_name in recruiters:
        if not isinstance(recruiter_name, str):
            continue

        normalized_name = normalize_question(recruiter_name)
        match = re.search(
            rf"(?<!\w){re.escape(normalized_name)}(?!\w)",
            normalized_question,
        )

        if match:
            matches.append((match.start(), recruiter_name))

    return [name for _, name in sorted(matches)[:5]]


def is_global_summary_question(question: str) -> bool:
    normalized_question = normalize_question(question)
    words = set(re.findall(r"\w+", normalized_question))
    return "kpi" in words and bool(words & GLOBAL_SUMMARY_TERMS)


def build_global_metrics(summary: dict) -> dict:
    return {
        "type": "metrics",
        "title": "Le trimestre en bref",
        "items": [
            {"label": label, "value": summary.get(field)}
            for label, field in GLOBAL_METRICS
        ],
    }


def build_recruiter_table(summary: dict, recruiter_names: list[str]) -> dict:
    recruiters = summary["recruiters"]
    return {
        "type": "table",
        "title": "Comparaison des recruteuses",
        "columns": ["Indicateur", *recruiter_names],
        "rows": [
            [
                label,
                *(recruiters[name].get(field) for name in recruiter_names),
            ]
            for label, field in RECRUITER_INDICATORS
        ],
    }


def build_analysis_metrics(summary: dict) -> dict:
    return {
        "type": "metrics",
        "title": "Conversions du parcours",
        "items": [
            {
                "label": "Entretiens → présentations (%)",
                "value": summary.get("client_presentation_rate"),
            },
            {
                "label": "Présentations → recrutements (%)",
                "value": summary.get("signature_rate"),
            },
        ],
    }


def build_presentation(question: str, result: dict) -> list[dict]:
    if not isinstance(question, str) or not isinstance(result, dict):
        return []

    summary = result.get("kpi_summary")

    if not isinstance(summary, dict) or result.get("route") == "web_agent":
        return []

    recruiters = summary.get("recruiters")

    if isinstance(recruiters, dict):
        recruiter_names = find_named_recruiters(question, recruiters)

        if len(recruiter_names) >= 2:
            if any(
                not isinstance(recruiters[name], dict)
                for name in recruiter_names
            ):
                return []

            return sanitize_presentation([
                build_recruiter_table(summary, recruiter_names),
            ])

    if result.get("route") == "analysis_agent":
        return sanitize_presentation([build_analysis_metrics(summary)])

    if is_global_summary_question(question):
        return sanitize_presentation([build_global_metrics(summary)])

    return []
