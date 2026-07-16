import { getRecruiters, getSummary } from "./api.mjs";
import { formatNumber, normalizeRecruiters, normalizeSummary } from "./models.mjs";

const byId = (id) => document.getElementById(id);

function setSectionError(regionId, errorId, retryId, message) {
  byId(regionId).setAttribute("aria-busy", "false");
  byId(errorId).textContent = message;
  byId(errorId).hidden = false;
  byId(retryId).hidden = false;
}

function clearSectionError(errorId, retryId) {
  byId(errorId).hidden = true;
  byId(retryId).hidden = true;
}

function renderFunnel(summary) {
  const stages = [
    ["Contactés", summary.candidatesContacted],
    ["Entretiens", summary.totalInterviews],
    ["Présentations", summary.clientPresentations],
    ["Recrutements", summary.totalRecruitments],
  ];
  const maximum = Math.max(...stages.map(([, value]) => value), 1);
  const container = byId("funnel-bars");
  container.replaceChildren();
  for (const [label, value] of stages) {
    const stage = document.createElement("div");
    stage.className = "funnel-stage";
    const number = document.createElement("strong");
    number.textContent = formatNumber(value);
    const bar = document.createElement("span");
    bar.className = "funnel-bar";
    bar.style.height = `${Math.max(10, (value / maximum) * 100)}%`;
    const caption = document.createElement("span");
    caption.textContent = label;
    stage.append(number, bar, caption);
    container.append(stage);
  }
}

export function renderSummary(payload) {
  const summary = normalizeSummary(payload);
  byId("kpi-contacted").textContent = formatNumber(summary.candidatesContacted);
  byId("kpi-interviews").textContent = formatNumber(summary.totalInterviews);
  byId("kpi-presentations").textContent = formatNumber(summary.clientPresentations);
  byId("kpi-recruitments").textContent = formatNumber(summary.totalRecruitments);
  byId("kpi-source").textContent = summary.source;
  byId("kpi-interview-split").textContent = `${summary.employeeInterviews} salariés · ${summary.freelanceInterviews} freelance`;
  byId("kpi-presentation-rate").textContent = `${summary.clientPresentationRate}% des entretiens`;
  byId("kpi-signature-rate").textContent = `${summary.signatureRate}% des présentations`;
  byId("rate-presentation").textContent = `${summary.clientPresentationRate}%`;
  byId("rate-signature").textContent = `${summary.signatureRate}%`;
  byId("attention-copy").textContent = `Le passage entretien → présentation client affiche un taux de ${summary.clientPresentationRate}%. Les données ne permettent pas d’en établir la cause.`;
  renderFunnel(summary);
  byId("summary-region").setAttribute("aria-busy", "false");
  byId("funnel-region").setAttribute("aria-busy", "false");
  byId("system-status").lastElementChild.textContent = "Données KPI connectées";
  byId("global-status").textContent = "Indicateurs KPI chargés.";
}

export function renderRecruiters(payload) {
  const recruiters = normalizeRecruiters(payload);
  const list = byId("recruiter-list");
  list.replaceChildren();
  if (recruiters.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Aucune donnée recruteuse disponible.";
    list.append(empty);
  }
  const maxRecruitments = Math.max(
    ...recruiters.map((item) => item.totalRecruitments),
    1,
  );
  for (const recruiter of recruiters) {
    const row = document.createElement("article");
    row.className = "recruiter-row";
    const identity = document.createElement("div");
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = recruiter.name.slice(0, 1);
    const name = document.createElement("strong");
    name.textContent = recruiter.name;
    identity.append(avatar, name);
    const track = document.createElement("span");
    track.className = "recruiter-track";
    const fill = document.createElement("span");
    fill.style.width = `${(recruiter.totalRecruitments / maxRecruitments) * 100}%`;
    track.append(fill);
    const value = document.createElement("span");
    value.textContent = `${recruiter.totalRecruitments} recrut.`;
    const details = document.createElement("div");
    details.className = "recruiter-details";
    const metrics = [
      ["Contactés", recruiter.candidatesContacted],
      ["Entretiens", recruiter.totalInterviews],
      ["Présentations", recruiter.clientPresentations],
      ["Recrutements", recruiter.totalRecruitments],
      ["Taux présentation", `${recruiter.clientPresentationRate}%`],
      ["Taux signature", `${recruiter.signatureRate}%`],
    ];
    for (const [label, metricValue] of metrics) {
      const metric = document.createElement("span");
      const metricLabel = document.createElement("small");
      const metricNumber = document.createElement("strong");
      metricLabel.textContent = label;
      metricNumber.textContent = String(metricValue);
      metric.append(metricLabel, metricNumber);
      details.append(metric);
    }
    row.append(identity, track, value, details);
    list.append(row);
  }
  byId("recruiter-region").setAttribute("aria-busy", "false");
  byId("global-status").textContent = "Données de l’équipe chargées.";
}

export async function loadSummarySection(getSummaryImpl = getSummary) {
  clearSectionError("summary-error", "summary-retry");
  byId("summary-region").setAttribute("aria-busy", "true");
  try {
    renderSummary(await getSummaryImpl());
  } catch {
    setSectionError(
      "summary-region",
      "summary-error",
      "summary-retry",
      "Impossible de charger les indicateurs. Réessayez dans un instant.",
    );
    byId("funnel-region").setAttribute("aria-busy", "false");
    if (byId("funnel-bars").children.length === 0) {
      byId("funnel-bars").textContent = "Parcours de conversion indisponible.";
    }
    byId("system-status").lastElementChild.textContent = "Données KPI partiellement indisponibles";
  }
}

export async function loadRecruiterSection(getRecruitersImpl = getRecruiters) {
  clearSectionError("recruiter-error", "recruiter-retry");
  byId("recruiter-region").setAttribute("aria-busy", "true");
  try {
    renderRecruiters(await getRecruitersImpl());
  } catch {
    setSectionError(
      "recruiter-region",
      "recruiter-error",
      "recruiter-retry",
      "Impossible de charger les données de l’équipe.",
    );
  }
}

export function loadDashboard() {
  return Promise.allSettled([loadSummarySection(), loadRecruiterSection()]);
}
