import { initializeAssistant } from "./assistant.mjs";
import {
  loadDashboard,
  loadRecruiterSection,
  loadSummarySection,
} from "./dashboard.mjs";

export function activateView(viewName) {
  const overviewOnly = document.querySelectorAll(
    "#summary-region, #funnel-region, .attention-card",
  );
  const isOverview = viewName === "overview";
  const isTeam = viewName === "team";
  const isAssistant = viewName === "assistant";
  const assistantRegion = document.getElementById("assistant-region");

  document.getElementById("app").dataset.activeView = viewName;
  for (const element of overviewOnly) element.hidden = !isOverview;
  document.getElementById("recruiter-region").hidden = !(isOverview || isTeam);
  document.getElementById("main-content").hidden = isAssistant;
  assistantRegion.setAttribute("role", isAssistant ? "main" : "complementary");
  assistantRegion.classList.toggle("is-focused", isAssistant);

  for (const button of document.querySelectorAll("[data-view]")) {
    const active = button.dataset.view === viewName;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }

  const labels = {
    overview: ["Vue d’ensemble", "Pilotage recrutement"],
    team: ["Équipe", "Comparatif équipe"],
    assistant: ["Assistant", "Assistant RH"],
  };
  document.querySelector(".workspace > .page-header .eyebrow").textContent = labels[viewName][0];
  document.getElementById("page-title").textContent = labels[viewName][1];
  document.getElementById(isAssistant ? "assistant-title" : "page-title").focus();
}

export function bootApplication() {
  document.documentElement.dataset.uiReady = "true";
  document.getElementById("summary-retry").addEventListener("click", () => loadSummarySection());
  document.getElementById("recruiter-retry").addEventListener("click", () => loadRecruiterSection());
  document.getElementById("home-link").addEventListener("click", (event) => {
    event.preventDefault();
    activateView("overview");
  });
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => activateView(button.dataset.view));
  }
  initializeAssistant();
  return loadDashboard();
}

bootApplication();
