import test from "node:test";
import assert from "node:assert/strict";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.className = "";
    this.listeners = new Map();
    this.open = false;
    this.focused = false;
    this._textContent = "";
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join("");
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append(...children) {
    this.children.push(...children);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  click() {
    for (const listener of this.listeners.get("click") ?? []) listener({ currentTarget: this });
  }

  focus() {
    this.focused = true;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (matchesSelector(child, selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

function matchesSelector(element, selector) {
  if (selector.startsWith(".")) {
    return element.className.split(/\s+/).includes(selector.slice(1));
  }

  const attributeSelector = selector.match(/^([a-z]+)\[([^=]+)="([^"]+)"\]$/i);
  if (attributeSelector) {
    const [, tagName, name, value] = attributeSelector;
    return element.tagName === tagName.toUpperCase() && element.getAttribute(name) === value;
  }

  return element.tagName === selector.toUpperCase();
}

globalThis.document = {
  createElement: (tagName) => new FakeElement(tagName),
};

const {
  focusTurn,
  renderFormattedText,
  renderTurn,
} = await import("../js/assistant-view.mjs");

function successTurn(overrides = {}) {
  return {
    id: "turn-1",
    question: "Quels sont les KPI ?",
    state: "success",
    createdAt: new Date("2026-07-16T10:00:00Z"),
    payload: {
      answer: "Réponse synthétique.",
      route: "kpi_agent",
      route_reason: "Question KPI",
      presentation: [],
      sources: [],
      agent_path: [],
    },
    ...overrides,
  };
}

test("success turn renders text safely and ignores unknown presentation blocks", () => {
  const turn = renderTurn({
    id: "turn-1",
    question: "<img src=x>",
    state: "success",
    createdAt: new Date("2026-07-16T10:00:00Z"),
    payload: {
      answer: "<script>alert(1)</script>\n\n- Premier point",
      route: "kpi_agent",
      presentation: [
        { type: "metrics", title: "KPI", items: [{ label: "Contactés", value: 809 }] },
        { type: "html", value: "<iframe>" },
      ],
      sources: [],
      agent_path: [],
    },
  }, { onRetry() {} });

  assert.equal(turn.tagName, "ARTICLE");
  assert.equal(turn.className, "conversation-turn");
  assert.equal(turn.querySelector(".user-message").textContent, "<img src=x>");
  assert.equal(turn.querySelector(".answer-copy").textContent.includes("<script>"), true);
  assert.equal(turn.querySelectorAll("script").length, 0);
  assert.equal(turn.querySelectorAll(".metric-card").length, 1);
  assert.equal(turn.querySelectorAll("iframe").length, 0);
});

test("formatted answers allow only paragraphs and plain-text lists", () => {
  const container = document.createElement("div");
  renderFormattedText(container, "Introduction <b>sûre</b>\n\n1. Un\n2. Deux\n\n- Trois");

  assert.deepEqual(container.children.map((child) => child.tagName), ["P", "OL", "UL"]);
  assert.equal(container.querySelectorAll("b").length, 0);
  assert.equal(container.textContent.includes("<b>sûre</b>"), true);
});

test("formatted answers render only known standalone heading forms as safe h4 elements", () => {
  const container = document.createElement("div");
  renderFormattedText(
    container,
    "**Faits observés**\nUne observation.\n\nHypothèses:\nUne hypothèse.\n\n**Recommandations**\n- Une action",
  );

  assert.deepEqual(
    container.querySelectorAll("h4").map((heading) => heading.textContent),
    ["Faits observés", "Hypothèses", "Recommandations"],
  );
  assert.equal(container.textContent.includes("**"), false);
  assert.equal(container.textContent.includes("Hypothèses:"), false);
});

test("formatted answers split allowlisted heading prefixes from their body text", () => {
  const container = document.createElement("div");
  renderFormattedText(
    container,
    "Faits observés 162 entretiens ont été réalisés.\nHypothèses Le ciblage peut être affiné.\nRecommandations Suivre les conversions.",
  );

  assert.deepEqual(
    container.children.map((child) => [child.tagName, child.textContent]),
    [
      ["H4", "Faits observés"],
      ["P", "162 entretiens ont été réalisés."],
      ["H4", "Hypothèses"],
      ["P", "Le ciblage peut être affiné."],
      ["H4", "Recommandations"],
      ["P", "Suivre les conversions."],
    ],
  );
});

test("formatted answers keep inline, unknown, and list heading-like text literal", () => {
  const container = document.createElement("div");
  renderFormattedText(
    container,
    "Texte avec **Faits observés** en ligne.\nAvant Hypothèses après.\n\n**Résumé**\n\nRésumé: Une synthèse.\n\n- Faits observés dans une puce",
  );

  assert.equal(container.querySelectorAll("h4").length, 0);
  assert.equal(container.querySelectorAll("strong").length, 0);
  assert.equal(container.textContent.includes("**Faits observés**"), true);
  assert.equal(container.textContent.includes("Avant Hypothèses après."), true);
  assert.equal(container.textContent.includes("**Résumé**"), true);
  assert.equal(container.textContent.includes("Résumé: Une synthèse."), true);
  assert.equal(container.querySelector("li").textContent, "Faits observés dans une puce");
});

test("pending and retrying turns expose an honest public status", () => {
  for (const state of ["pending", "retrying"]) {
    const turn = renderTurn({
      id: `turn-${state}`,
      question: "Analyse les KPI",
      state,
      createdAt: new Date("2026-07-16T10:00:00Z"),
    }, { onRetry() {} });

    assert.match(turn.querySelector(".assistant-pending").textContent, /Sélection de l.agent et analyse des données/);
    assert.equal(turn.querySelector(".assistant-pending").getAttribute("role"), "status");
  }
});

test("error turn retries only its own stable identifier", () => {
  const retries = [];
  const turn = renderTurn({
    id: "turn-error",
    question: "Analyse les KPI",
    state: "error",
    error: { code: "timeout" },
    createdAt: new Date("2026-07-16T10:00:00Z"),
  }, { onRetry: (turnId) => retries.push(turnId) });

  assert.match(turn.querySelector(".assistant-error").textContent, /trop de temps/);
  assert.equal(turn.querySelector("button").textContent, "Réessayer");
  turn.querySelector("button").click();
  assert.deepEqual(retries, ["turn-error"]);
});

test("comparison table has a caption, column headers, and row headers", () => {
  const turn = renderTurn(successTurn({
    payload: {
      answer: "Comparaison.",
      route: "analysis_agent",
      presentation: [{
        type: "table",
        title: "Comparaison des recruteuses",
        columns: ["Indicateur", "Inès", "Pauline"],
        rows: [["Contactés", 236, 199], ["Recrutements", 1, 2]],
      }],
      sources: [],
      agent_path: [],
    },
  }), { onRetry() {} });

  assert.equal(turn.querySelector("caption").textContent, "Comparaison des recruteuses");
  assert.deepEqual(
    turn.querySelectorAll('th[scope="col"]').map((header) => header.textContent),
    ["Indicateur", "Inès", "Pauline"],
  );
  assert.deepEqual(
    turn.querySelectorAll('th[scope="row"]').map((header) => header.textContent),
    ["Contactés", "Recrutements"],
  );
});

test("actions are capped at three and oversized blocks are omitted", () => {
  const turn = renderTurn(successTurn({
    payload: {
      answer: "Plan d’action.",
      route: "analysis_agent",
      presentation: [
        { type: "actions", title: "Actions", items: ["Un", "Deux", "Trois"] },
        { type: "actions", title: "Trop d’actions", items: ["1", "2", "3", "4"] },
      ],
      sources: [],
      agent_path: [],
    },
  }), { onRetry() {} });

  assert.deepEqual(
    turn.querySelector(".actions-list").querySelectorAll("li").map((item) => item.textContent),
    ["Un", "Deux", "Trois"],
  );
  assert.equal(turn.querySelectorAll(".actions-block").length, 1);
});

test("sources link only safe HTTP(S) URLs and render unsafe titles as text", () => {
  const turn = renderTurn(successTurn({
    payload: {
      answer: "Avec sources.",
      route: "web_agent",
      presentation: [],
      sources: [
        { type: "web", title: "HTTPS <b>", url: "https://example.com/source" },
        { type: "web", title: "HTTP", url: "http://example.org/source" },
        { type: "web", title: "Refusée <script>", url: "javascript:alert(1)" },
      ],
      agent_path: [],
    },
  }), { onRetry() {} });

  const links = turn.querySelectorAll("a");
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((link) => link.href), ["https://example.com/source", "http://example.org/source"]);
  assert.ok(links.every((link) => link.target === "_blank" && link.rel === "noopener noreferrer"));
  assert.equal(turn.querySelectorAll("script").length, 0);
  assert.equal(turn.textContent.includes("Refusée <script>"), true);
});

test("success details are collapsed and disclose only public execution metadata", () => {
  const turn = renderTurn(successTurn({
    payload: {
      answer: "Réponse.",
      route: "analysis_agent",
      route_reason: "Une analyse est nécessaire.",
      presentation: [],
      sources: [],
      agent_path: ["supervisor_agent", "analysis_agent"],
      chain_of_thought: "Secret à ne jamais afficher",
    },
  }), { onRetry() {} });

  const details = turn.querySelector("details");
  assert.equal(details.open, false);
  assert.match(details.querySelector("summary").textContent, /Sources et parcours agentique/);
  assert.match(details.textContent, /Une analyse est nécessaire/);
  assert.match(details.textContent, /supervisor_agent/);
  assert.equal(turn.textContent.includes("Secret à ne jamais afficher"), false);
});

test("focusTurn makes a completed turn programmatically focusable", () => {
  const turn = document.createElement("article");
  focusTurn(turn);

  assert.equal(turn.getAttribute("tabindex"), "-1");
  assert.equal(turn.focused, true);
});
