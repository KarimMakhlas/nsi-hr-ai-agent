function requiredNumber(payload, key) {
  const value = payload?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Champ KPI invalide ou absent : ${key}`);
  }
  return value;
}

export function normalizeSummary(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("Réponse KPI invalide");
  }
  return {
    period: String(payload.period ?? ""),
    source: String(payload.source ?? ""),
    candidatesContacted: requiredNumber(payload, "candidates_contacted"),
    employeeInterviews: requiredNumber(payload, "employee_interviews"),
    freelanceInterviews: requiredNumber(payload, "freelance_interviews"),
    totalInterviews: requiredNumber(payload, "total_interviews"),
    clientPresentations: requiredNumber(payload, "client_presentations"),
    totalRecruitments: requiredNumber(payload, "total_recruitments"),
    clientPresentationRate: requiredNumber(payload, "client_presentation_rate"),
    signatureRate: requiredNumber(payload, "signature_rate"),
  };
}

export function normalizeRecruiters(payload) {
  if (
    !payload
    || typeof payload !== "object"
    || !payload.recruiters
    || typeof payload.recruiters !== "object"
    || Array.isArray(payload.recruiters)
  ) {
    throw new TypeError("Collection de recruteurs invalide");
  }
  const entries = Object.entries(payload.recruiters);
  return entries.map(([name, values]) => ({
    name,
    candidatesContacted: requiredNumber(values, "candidates_contacted"),
    totalInterviews: requiredNumber(values, "total_interviews"),
    clientPresentations: requiredNumber(values, "client_presentations"),
    totalRecruitments: requiredNumber(values, "total_recruitments"),
    clientPresentationRate: requiredNumber(values, "client_presentation_rate"),
    signatureRate: requiredNumber(values, "signature_rate"),
  }));
}

const ROUTE_LABELS = {
  kpi_agent: "Agent KPI",
  analysis_agent: "Agent Analyse",
  web_agent: "Agent Web",
};

export function routeLabel(route) {
  return ROUTE_LABELS[route] ?? "Assistant RH";
}

export function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

export function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const SHORT_TEXT_MAX_LENGTH = 120;
const BODY_TEXT_MAX_LENGTH = 500;
const INSIGHT_TONES = new Set(["neutral", "attention", "positive"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRequiredText(value, maximumLength) {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= maximumLength;
}

function isDisplayPrimitive(value) {
  return typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value));
}

function normalizeMetrics(block) {
  if (
    !isRequiredText(block.title, SHORT_TEXT_MAX_LENGTH)
    || !Array.isArray(block.items)
    || block.items.length < 1
    || block.items.length > 4
    || !block.items.every((item) => (
      isRecord(item)
      && isRequiredText(item.label, SHORT_TEXT_MAX_LENGTH)
      && isDisplayPrimitive(item.value)
    ))
  ) {
    return null;
  }

  return {
    type: "metrics",
    title: block.title,
    items: block.items.map((item) => ({ label: item.label, value: item.value })),
  };
}

function normalizeTable(block) {
  if (
    !isRequiredText(block.title, SHORT_TEXT_MAX_LENGTH)
    || !Array.isArray(block.columns)
    || block.columns.length < 2
    || block.columns.length > 6
    || !block.columns.every((column) => isRequiredText(column, SHORT_TEXT_MAX_LENGTH))
    || !Array.isArray(block.rows)
    || block.rows.length < 1
    || block.rows.length > 8
    || !block.rows.every((row) => (
      Array.isArray(row)
      && row.length === block.columns.length
      && row.every(isDisplayPrimitive)
    ))
  ) {
    return null;
  }

  return {
    type: "table",
    title: block.title,
    columns: [...block.columns],
    rows: block.rows.map((row) => [...row]),
  };
}

function normalizeInsight(block) {
  if (
    !INSIGHT_TONES.has(block.tone)
    || !isRequiredText(block.title, SHORT_TEXT_MAX_LENGTH)
    || !isRequiredText(block.text, BODY_TEXT_MAX_LENGTH)
  ) {
    return null;
  }

  return {
    type: "insight",
    tone: block.tone,
    title: block.title,
    text: block.text,
  };
}

function normalizeActions(block) {
  if (
    !isRequiredText(block.title, SHORT_TEXT_MAX_LENGTH)
    || !Array.isArray(block.items)
    || block.items.length < 1
    || block.items.length > 3
    || !block.items.every((item) => isRequiredText(item, BODY_TEXT_MAX_LENGTH))
  ) {
    return null;
  }

  return {
    type: "actions",
    title: block.title,
    items: [...block.items],
  };
}

export function normalizePresentation(blocks) {
  if (!Array.isArray(blocks)) return [];

  const normalized = [];
  for (const block of blocks) {
    if (!isRecord(block) || typeof block.type !== "string") continue;

    let validBlock = null;
    if (block.type === "metrics") validBlock = normalizeMetrics(block);
    else if (block.type === "table") validBlock = normalizeTable(block);
    else if (block.type === "insight") validBlock = normalizeInsight(block);
    else if (block.type === "actions") validBlock = normalizeActions(block);

    if (validBlock) normalized.push(validBlock);
  }
  return normalized;
}

export function assistantErrorMessage(error) {
  if (error?.status === 422) return "Votre question doit contenir entre 3 et 500 caractères.";
  if (error?.code === "timeout") return "L’assistant met trop de temps à répondre. Réessayez.";
  if (error?.code === "mcp_tool_failed") return "Les outils KPI sont momentanément indisponibles.";
  if (error?.code === "llm_service_unavailable") return "L’assistant IA est momentanément indisponible.";
  return "Impossible d’obtenir une réponse pour le moment. Réessayez.";
}
