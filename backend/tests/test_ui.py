import os
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["NSI_TELEMETRY_DISABLED"] = "1"

from backend.app.main import WEB_ROOT, app


client = TestClient(app)


def test_frontend_is_served_from_a_standalone_project_directory():
    assert WEB_ROOT.name == "frontend"
    assert (WEB_ROOT.parent / "README.md").is_file()


def test_cockpit_route_serves_application_shell():
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert 'id="app"' in response.text
    assert 'href="/static/styles.css"' in response.text
    assert 'src="/static/js/app.mjs"' in response.text


def test_cockpit_static_assets_are_served():
    stylesheet = client.get("/static/styles.css")
    script = client.get("/static/js/app.mjs")

    assert stylesheet.status_code == 200
    assert "--color-navy" in stylesheet.text
    assert script.status_code == 200
    assert "bootApplication" in script.text


def test_cockpit_declares_live_dashboard_regions_without_fallback_values():
    response = client.get("/")

    assert 'id="summary-region"' in response.text
    assert 'id="funnel-region"' in response.text
    assert 'id="recruiter-region"' in response.text
    assert 'id="summary-retry"' in response.text
    assert 'id="recruiter-retry"' in response.text
    assert "809" not in response.text
    assert "162" not in response.text


def test_cockpit_serves_the_three_column_dashboard_assets():
    stylesheet = client.get("/static/styles.css")
    dashboard = client.get("/static/js/dashboard.mjs")

    assert "grid-template-columns: 200px minmax(620px, 1fr) 340px" in stylesheet.text
    assert ".funnel-bars" in stylesheet.text
    assert ".recruiter-row" in stylesheet.text
    assert dashboard.status_code == 200
    assert "Promise.allSettled" in dashboard.text


def test_cockpit_declares_accessible_assistant_controls():
    response = client.get("/")

    assert 'id="assistant-form"' in response.text
    assert 'id="assistant-input"' in response.text
    assert 'id="assistant-submit"' in response.text
    assert 'id="assistant-conversation"' in response.text
    assert 'id="assistant-clear"' in response.text
    assert 'role="log"' in response.text
    assert 'id="assistant-live-status"' in response.text
    assert 'data-question="Donne-moi les 4 KPI clés du T3 2024."' in response.text
    assert 'data-question="Compare Inès et Pauline sur les mêmes indicateurs."' in response.text
    assert 'data-question="Où se situe la principale friction du parcours de recrutement ?"' in response.text
    assert 'data-question="Compare nos KPI aux tendances du recrutement IA/Data en France."' in response.text
    assert 'id="assistant-answer"' not in response.text
    assert 'id="assistant-error"' not in response.text


def test_cockpit_has_accessible_status_and_navigation_contracts():
    response = client.get("/")

    assert 'lang="fr"' in response.text
    assert 'aria-label="Navigation principale"' in response.text
    assert 'id="main-content"' in response.text
    assert 'aria-live="polite"' in response.text
    assert 'for="assistant-input"' in response.text
    assert "prefers-reduced-motion" in client.get("/static/styles.css").text


def test_assistant_conversation_styles_keep_the_log_readable_and_composer_reachable():
    stylesheet = client.get("/static/styles.css").text

    assert "max-height: 100vh" in stylesheet
    assert ".assistant-conversation" in stylesheet
    assert "overflow-y: auto" in stylesheet
    assert "align-content: start" in stylesheet
    assert "max-width: 84%" in stylesheet
    assert ".metrics-grid" in stylesheet
    assert "grid-template-columns: repeat(2, minmax(0, 1fr))" in stylesheet
    assert ".table-scroll" in stylesheet
    assert "position: sticky" in stylesheet
    assert "@media (max-width: 420px)" in stylesheet


def test_recruiter_identity_layout_does_not_override_team_detail_grid():
    stylesheet = client.get("/static/styles.css").text

    assert ".recruiter-row > div:not(.recruiter-details)" in stylesheet


def test_cockpit_declares_switchable_workspace_and_assistant_landmarks():
    response = client.get("/")

    assert '<main class="workspace" id="main-content">' in response.text
    assert '<div id="assistant-region" class="copilot" role="complementary"' in response.text
    assert 'id="home-link"' in response.text
    assert 'href="#main-content"' in response.text


def test_phone_recruiter_rows_are_fully_single_column():
    stylesheet = client.get("/static/styles.css").text

    assert ".recruiter-row { grid-template-columns: 1fr; }" in stylesheet
    assert ".recruiter-track { grid-column: 1; }" in stylesheet


def test_readme_documents_the_cockpit_entrypoint():
    readme = Path("README.md").read_text(encoding="utf-8")

    assert "Cockpit RH" in readme
    assert "http://127.0.0.1:8000/" in readme
    assert "Parcours d’exécution" in readme
