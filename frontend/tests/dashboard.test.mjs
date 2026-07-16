import test from "node:test";
import assert from "node:assert/strict";

import {
  loadRecruiterSection,
  loadSummarySection,
  renderRecruiters,
  renderSummary,
} from "../js/dashboard.mjs";


class FakeElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName;
    this.id = id;
    this.attributes = new Map();
    this.children = [];
    this.className = "";
    this.classList = {
      toggle: (name, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force === undefined ? !classes.has(name) : force;
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(" ");
        return shouldAdd;
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
    this.dataset = {};
    this.focused = false;
    this.hidden = false;
    this.listeners = new Map();
    this.style = {};
    this.textContent = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  append(...children) {
    this.children.push(...children);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  focus() {
    this.focused = true;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  replaceChildren(...children) {
    this.children = [...children];
    this.textContent = "";
  }

  querySelectorAll() {
    return [];
  }

  get lastElementChild() {
    return this.children.at(-1) ?? null;
  }
}

const dashboardIds = [
  "summary-region",
  "summary-error",
  "summary-retry",
  "funnel-region",
  "funnel-bars",
  "recruiter-region",
  "recruiter-error",
  "recruiter-retry",
  "recruiter-list",
  "kpi-contacted",
  "kpi-interviews",
  "kpi-presentations",
  "kpi-recruitments",
  "kpi-source",
  "kpi-interview-split",
  "kpi-presentation-rate",
  "kpi-signature-rate",
  "rate-presentation",
  "rate-signature",
  "attention-copy",
  "system-status",
  "global-status",
  "assistant-clear",
  "assistant-conversation",
  "assistant-empty",
  "assistant-form",
  "assistant-input",
  "assistant-live-status",
  "assistant-submit",
  "app",
  "page-title",
  "assistant-title",
  "assistant-region",
  "main-content",
  "home-link",
];

function installDocument() {
  const elements = new Map(
    dashboardIds.map((id) => [id, new FakeElement("div", id)]),
  );
  elements.get("system-status").append(
    new FakeElement("span"),
    new FakeElement("span"),
  );
  elements.get("app").dataset.activeView = "overview";
  elements.get("assistant-region").setAttribute("role", "complementary");
  const eyebrow = new FakeElement("p");
  eyebrow.textContent = "Vue d’ensemble";
  const overviewOnly = [
    elements.get("summary-region"),
    elements.get("funnel-region"),
    new FakeElement("aside"),
  ];
  const navButtons = ["overview", "team", "assistant"].map((viewName) => {
    const button = new FakeElement("button");
    button.dataset.view = viewName;
    button.className = viewName === "overview" ? "nav-item is-active" : "nav-item";
    if (viewName === "overview") button.setAttribute("aria-current", "page");
    return button;
  });
  globalThis.document = {
    documentElement: { dataset: {} },
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => elements.get(id) ?? null,
    querySelector: (selector) => selector === ".workspace > .page-header .eyebrow" ? eyebrow : null,
    querySelectorAll: (selector) => {
      if (selector === "#summary-region, #funnel-region, .attention-card") return overviewOnly;
      if (selector === "[data-view]") return navButtons;
      return [];
    },
  };
  elements.eyebrow = eyebrow;
  elements.overviewOnly = overviewOnly;
  elements.navButtons = navButtons;
  return elements;
}

const summaryPayload = {
  period: "T3 2024",
  source: "Excel KPI RH Q3 2024",
  candidates_contacted: 809,
  employee_interviews: 27,
  freelance_interviews: 135,
  total_interviews: 162,
  client_presentations: 8,
  total_recruitments: 3,
  client_presentation_rate: 5,
  signature_rate: 38,
};

const recruiterPayload = {
  recruiters: {
    "<img src=x onerror=alert(1)>": {
      candidates_contacted: 236,
      total_interviews: 50,
      client_presentations: 1,
      total_recruitments: 1,
      client_presentation_rate: 2,
      signature_rate: 100,
    },
  },
};

test("renderSummary maps live KPI fields and conversion rates", () => {
  const elements = installDocument();

  renderSummary(summaryPayload);

  assert.equal(elements.get("kpi-contacted").textContent, "809");
  assert.equal(elements.get("kpi-interviews").textContent, "162");
  assert.equal(elements.get("kpi-presentations").textContent, "8");
  assert.equal(elements.get("kpi-recruitments").textContent, "3");
  assert.equal(elements.get("kpi-interview-split").textContent, "27 salariés · 135 freelance");
  assert.equal(elements.get("rate-presentation").textContent, "5%");
  assert.equal(elements.get("rate-signature").textContent, "38%");
  assert.equal(elements.get("funnel-bars").children.length, 4);
  assert.equal(elements.get("summary-region").getAttribute("aria-busy"), "false");
});

test("renderRecruiters treats recruiter names as text", () => {
  const elements = installDocument();

  renderRecruiters(recruiterPayload);

  const row = elements.get("recruiter-list").children[0];
  const identity = row.children[0];
  assert.equal(identity.children[0].textContent, "<");
  assert.equal(identity.children[1].textContent, "<img src=x onerror=alert(1)>");
  assert.equal(row.children[2].textContent, "1 recrut.");
});

test("renderRecruiters exposes comparable exact metrics without ranking language", () => {
  const elements = installDocument();

  renderRecruiters(recruiterPayload);

  const row = elements.get("recruiter-list").children[0];
  const details = row.children[3];
  assert.equal(details.className, "recruiter-details");
  assert.deepEqual(
    details.children.map((metric) => [
      metric.children[0].textContent,
      metric.children[1].textContent,
    ]),
    [
      ["Contactés", "236"],
      ["Entretiens", "50"],
      ["Présentations", "1"],
      ["Recrutements", "1"],
      ["Taux présentation", "2%"],
      ["Taux signature", "100%"],
    ],
  );
  assert.doesNotMatch(row.textContent, /meilleur|meilleure|best/i);
});

test("a summary failure exposes only the summary retry state", async () => {
  const elements = installDocument();
  elements.get("recruiter-region").setAttribute("aria-busy", "true");

  await loadSummarySection(async () => {
    throw new Error("controlled summary failure");
  });

  assert.equal(elements.get("summary-region").getAttribute("aria-busy"), "false");
  assert.equal(elements.get("funnel-region").getAttribute("aria-busy"), "false");
  assert.equal(elements.get("summary-retry").hidden, false);
  assert.match(elements.get("summary-error").textContent, /Impossible de charger/);
  assert.equal(elements.get("recruiter-region").getAttribute("aria-busy"), "true");
});

test("a failed summary refresh preserves the complete last good summary", async () => {
  const elements = installDocument();
  renderSummary(summaryPayload);
  const previousFunnel = [...elements.get("funnel-bars").children];

  await loadSummarySection(async () => {
    throw new Error("controlled refresh failure");
  });

  assert.deepEqual(elements.get("funnel-bars").children, previousFunnel);
  assert.equal(elements.get("funnel-bars").textContent, "");
  assert.equal(elements.get("kpi-contacted").textContent, "809");
  assert.equal(elements.get("rate-presentation").textContent, "5%");
  assert.equal(elements.get("summary-retry").hidden, false);
});

test("a recruiter failure preserves already-rendered summary KPI", async () => {
  const elements = installDocument();
  renderSummary(summaryPayload);

  await loadRecruiterSection(async () => {
    throw new Error("controlled recruiter failure");
  });

  assert.equal(elements.get("kpi-contacted").textContent, "809");
  assert.equal(elements.get("summary-region").getAttribute("aria-busy"), "false");
  assert.equal(elements.get("recruiter-region").getAttribute("aria-busy"), "false");
  assert.equal(elements.get("recruiter-retry").hidden, false);
  assert.match(elements.get("recruiter-error").textContent, /données de l’équipe/);
});

test("bootApplication binds navigation with one visible main landmark and preserves loaded state", async () => {
  const elements = installDocument();
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (path) => {
    requests.push(path);
    return {
      ok: true,
      async json() {
        return path === "/kpis/summary" ? summaryPayload : recruiterPayload;
      },
    };
  };

  try {
    const appUrl = new URL("../js/app.mjs", import.meta.url);
    appUrl.searchParams.set("test", String(Date.now()));
    await import(appUrl);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(document.documentElement.dataset.uiReady, "true");
    assert.equal(elements.get("summary-retry").listeners.get("click")?.length, 1);
    assert.equal(elements.get("recruiter-retry").listeners.get("click")?.length, 1);
    assert.equal(elements.get("assistant-form").listeners.get("submit")?.length, 1);
    assert.equal(elements.get("kpi-contacted").textContent, "809");

    elements.navButtons[1].dispatch("click");
    assert.equal(elements.get("app").dataset.activeView, "team");
    assert.ok(elements.overviewOnly.every((element) => element.hidden));
    assert.equal(elements.get("recruiter-region").hidden, false);
    assert.equal(elements.get("page-title").textContent, "Comparatif équipe");
    assert.equal(elements.get("page-title").focused, true);
    assert.equal(elements.navButtons[1].getAttribute("aria-current"), "page");

    elements.navButtons[2].dispatch("click");
    assert.equal(elements.get("app").dataset.activeView, "assistant");
    assert.equal(elements.get("recruiter-region").hidden, true);
    assert.equal(elements.get("main-content").hidden, true);
    assert.equal(elements.get("assistant-region").getAttribute("role"), "main");
    assert.equal(elements.get("assistant-title").focused, true);
    assert.equal(elements.get("assistant-region").classList.contains("is-focused"), true);

    let homeDefaultPrevented = false;
    elements.get("home-link").dispatch("click", {
      preventDefault() {
        homeDefaultPrevented = true;
      },
    });
    assert.equal(homeDefaultPrevented, true);
    assert.equal(elements.get("app").dataset.activeView, "overview");
    assert.equal(elements.get("main-content").hidden, false);
    assert.equal(elements.get("assistant-region").getAttribute("role"), "complementary");
    assert.equal(elements.get("page-title").focused, true);

    assert.equal(elements.get("kpi-contacted").textContent, "809");
    assert.deepEqual(requests, ["/kpis/summary", "/kpis/recruiters"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
