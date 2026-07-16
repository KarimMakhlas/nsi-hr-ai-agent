const DEFAULT_TIMEOUT_MS = 30_000;
const ASSISTANT_TIMEOUT_MS = 90_000;

export class ApiError extends Error {
  constructor(message, { status = 0, code = "network_error" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseError(response) {
  try {
    const payload = await response.json();
    const detail = payload?.detail;
    return new ApiError(
      detail?.message || "Le service a renvoyé une erreur.",
      { status: response.status, code: detail?.code || "http_error" },
    );
  } catch {
    return new ApiError("Le service a renvoyé une réponse invalide.", {
      status: response.status,
      code: "invalid_error_response",
    });
  }
}

export async function requestJson(
  path,
  options = {},
  { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(path, { ...options, signal: controller.signal });
    if (!response.ok) throw await parseError(response);
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === "AbortError") {
      throw new ApiError("La requête a expiré.", { code: "timeout" });
    }
    throw new ApiError("Impossible de joindre le service.", { code: "network_error" });
  } finally {
    clearTimeout(timeout);
  }
}

export function getSummary(options) {
  return requestJson("/kpis/summary", {}, options);
}

export function getRecruiters(options) {
  return requestJson("/kpis/recruiters", {}, options);
}

export function askAssistant(question, options) {
  return requestJson(
    "/assistant/ask",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    },
    { timeoutMs: ASSISTANT_TIMEOUT_MS, ...options },
  );
}
