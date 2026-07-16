import {
  assistantErrorMessage,
  normalizePresentation,
  routeLabel,
  safeExternalUrl,
} from "./models.mjs";

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (typeof text === "string") node.textContent = text;
  return node;
}

function displayPrimitive(value) {
  return typeof value === "number" ? `${value}` : value;
}

const KNOWN_ANSWER_HEADINGS = new Set([
  "Faits observés",
  "Hypothèses",
  "Recommandations",
]);

function knownAnswerHeading(line) {
  const bold = line.match(/^\*\*(.+)\*\*$/);
  const colon = line.match(/^(.+):$/);
  const heading = (bold ?? colon)?.[1];
  return KNOWN_ANSWER_HEADINGS.has(heading) ? heading : null;
}

function knownAnswerHeadingPrefix(line) {
  for (const heading of KNOWN_ANSWER_HEADINGS) {
    const separator = line[heading.length];
    if (!line.startsWith(heading) || (separator !== " " && separator !== "\t")) continue;

    const body = line.slice(heading.length).trimStart();
    if (body) return { heading, body };
  }
  return null;
}

export function renderFormattedText(container, answer) {
  if (typeof answer !== "string") return;

  let paragraphLines = [];
  let list = null;
  let listType = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    container.append(element("p", "", paragraphLines.join(" ")));
    paragraphLines = [];
  };
  const flushList = () => {
    if (!list) return;
    container.append(list);
    list = null;
    listType = null;
  };

  for (const line of answer.split(/\r?\n/)) {
    const heading = knownAnswerHeading(line);
    if (heading) {
      flushParagraph();
      flushList();
      container.append(element("h4", "", heading));
      continue;
    }

    const headingPrefix = knownAnswerHeadingPrefix(line);
    if (headingPrefix) {
      flushParagraph();
      flushList();
      container.append(element("h4", "", headingPrefix.heading));
      paragraphLines.push(headingPrefix.body);
      continue;
    }

    const unordered = line.match(/^-\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    const nextListType = unordered ? "ul" : ordered ? "ol" : null;

    if (nextListType) {
      flushParagraph();
      if (listType !== nextListType) {
        flushList();
        list = element(nextListType);
        listType = nextListType;
      }
      list.append(element("li", "", (unordered ?? ordered)[1]));
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }

  flushParagraph();
  flushList();
}

function renderMetrics(container, block) {
  const section = element("section", "presentation-block metrics-block");
  section.append(element("h4", "presentation-title", block.title));
  const grid = element("div", "metrics-grid");
  for (const item of block.items) {
    const card = element("article", "metric-card");
    card.append(
      element("span", "metric-label", item.label),
      element("strong", "metric-value", displayPrimitive(item.value)),
    );
    grid.append(card);
  }
  section.append(grid);
  container.append(section);
}

function renderTable(container, block) {
  const section = element("section", "presentation-block table-block");
  const scroll = element("div", "table-scroll");
  const table = element("table");
  table.append(element("caption", "", block.title));

  const head = element("thead");
  const headerRow = element("tr");
  for (const column of block.columns) {
    const header = element("th", "", column);
    header.setAttribute("scope", "col");
    headerRow.append(header);
  }
  head.append(headerRow);
  table.append(head);

  const body = element("tbody");
  for (const row of block.rows) {
    const tableRow = element("tr");
    row.forEach((value, index) => {
      const cell = element(index === 0 ? "th" : "td", "", displayPrimitive(value));
      if (index === 0) cell.setAttribute("scope", "row");
      tableRow.append(cell);
    });
    body.append(tableRow);
  }
  table.append(body);
  scroll.append(table);
  section.append(scroll);
  container.append(section);
}

function renderInsight(container, block) {
  const section = element("aside", `presentation-block insight-block insight-${block.tone}`);
  section.append(
    element("h4", "presentation-title", block.title),
    element("p", "insight-copy", block.text),
  );
  container.append(section);
}

function renderActions(container, block) {
  const section = element("section", "presentation-block actions-block");
  section.append(element("h4", "presentation-title", block.title));
  const list = element("ol", "actions-list");
  for (const action of block.items) list.append(element("li", "", action));
  section.append(list);
  container.append(section);
}

export function renderPresentation(container, blocks) {
  for (const block of normalizePresentation(blocks)) {
    if (block.type === "metrics") renderMetrics(container, block);
    else if (block.type === "table") renderTable(container, block);
    else if (block.type === "insight") renderInsight(container, block);
    else if (block.type === "actions") renderActions(container, block);
  }
}

export function renderSources(container, sources) {
  if (!Array.isArray(sources)) return;

  const list = element("ul", "source-list");
  for (const source of sources) {
    if (source === null || typeof source !== "object" || Array.isArray(source)) continue;

    const safeUrl = typeof source.url === "string" ? safeExternalUrl(source.url) : null;
    const title = typeof source.title === "string" && source.title.trim()
      ? source.title
      : safeUrl ?? "Source non renseignée";
    const item = element("li");
    if (safeUrl) {
      const link = element("a", "", title);
      link.href = safeUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.append(link);
    } else {
      item.textContent = title;
    }
    list.append(item);
  }

  if (list.children.length > 0) container.append(list);
}

function appendTimestamp(container, createdAt) {
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) return;
  const timestamp = element(
    "time",
    "turn-time",
    new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(createdAt),
  );
  timestamp.setAttribute("datetime", createdAt.toISOString());
  container.append(timestamp);
}

function renderSuccess(container, turn) {
  const payload = turn.payload && typeof turn.payload === "object" && !Array.isArray(turn.payload)
    ? turn.payload
    : {};
  const response = element("section", "assistant-message assistant-success");
  response.setAttribute("aria-label", "Réponse de l’assistant RH");
  response.append(element(
    "span",
    "agent-badge",
    routeLabel(typeof payload.route === "string" ? payload.route : ""),
  ));

  const answer = element("div", "answer-copy");
  renderFormattedText(answer, payload.answer);
  response.append(answer);
  renderPresentation(response, payload.presentation);

  const details = element("details", "execution-disclosure");
  details.append(element("summary", "", "Sources et parcours agentique"));
  if (typeof payload.route_reason === "string" && payload.route_reason.trim()) {
    details.append(element("p", "route-reason", payload.route_reason));
  }
  renderSources(details, payload.sources);

  if (Array.isArray(payload.agent_path)) {
    const publicSteps = payload.agent_path.filter((step) => typeof step === "string");
    if (publicSteps.length > 0) {
      const path = element("ol", "execution-path");
      for (const step of publicSteps) path.append(element("li", "", step));
      details.append(path);
    }
  }

  response.append(details);
  appendTimestamp(response, turn.createdAt);
  container.append(response);
}

function renderPending(container) {
  const pending = element(
    "section",
    "assistant-message assistant-pending",
    "Sélection de l’agent et analyse des données…",
  );
  pending.setAttribute("role", "status");
  pending.setAttribute("aria-live", "polite");
  container.append(pending);
}

function renderError(container, turn, onRetry) {
  const error = element("section", "assistant-message assistant-error");
  error.setAttribute("role", "alert");
  error.append(element("p", "error-copy", assistantErrorMessage(turn.error)));
  const retry = element("button", "retry-button", "Réessayer");
  retry.setAttribute("type", "button");
  retry.setAttribute("aria-label", "Réessayer cette question");
  retry.addEventListener("click", (event) => {
    if (typeof onRetry === "function" && typeof turn.id === "string") onRetry(turn.id, event);
  });
  error.append(retry);
  appendTimestamp(error, turn.createdAt);
  container.append(error);
}

export function renderTurn(turn, { onRetry } = {}) {
  const safeTurn = turn && typeof turn === "object" && !Array.isArray(turn) ? turn : {};
  const article = element("article", "conversation-turn");
  if (typeof safeTurn.id === "string") article.setAttribute("data-turn-id", safeTurn.id);

  const user = element("section", "user-bubble");
  user.setAttribute("aria-label", "Votre question");
  user.append(element(
    "p",
    "user-message",
    typeof safeTurn.question === "string" ? safeTurn.question : "",
  ));
  article.append(user);

  if (safeTurn.state === "success") renderSuccess(article, safeTurn);
  else if (safeTurn.state === "error") renderError(article, safeTurn, onRetry);
  else renderPending(article);

  return article;
}

export function focusTurn(turnElement) {
  if (!turnElement || typeof turnElement.setAttribute !== "function") return;
  turnElement.setAttribute("tabindex", "-1");
  if (typeof turnElement.focus === "function") turnElement.focus({ preventScroll: true });
}
