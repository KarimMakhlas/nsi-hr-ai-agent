import test from "node:test";
import assert from "node:assert/strict";

import { createConversationController } from "../js/assistant.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeController({ ask, render = () => {} } = {}) {
  let id = 0;
  return createConversationController({
    ask: ask ?? (async (question) => ({ answer: `Réponse ${question}` })),
    render,
    now: () => new Date("2026-07-16T10:00:00Z"),
    makeId: () => `turn-${++id}`,
  });
}

test("successive questions append independent turns and send no history", async () => {
  const requests = [];
  const controller = makeController({
    ask: async (question) => {
      requests.push(question);
      return { answer: `Réponse ${question}`, route: "kpi_agent", sources: [], agent_path: [] };
    },
  });

  await controller.submit("Première question");
  await controller.submit("Seconde question");

  assert.deepEqual(requests, ["Première question", "Seconde question"]);
  assert.deepEqual(controller.getTurns().map(({ state }) => state), ["success", "success"]);
  assert.deepEqual(controller.getTurns().map(({ question }) => question), [
    "Première question",
    "Seconde question",
  ]);
});

test("a pending turn is replaced in place by its successful result", async () => {
  const request = deferred();
  const renders = [];
  const controller = makeController({
    ask: () => request.promise,
    render: (turns, meta) => renders.push({ turns, meta }),
  });

  const submission = controller.submit("  Analyse les KPI  ", { keyboardInitiated: true });
  assert.deepEqual(controller.getTurns().map(({ id, question, state }) => ({ id, question, state })), [
    { id: "turn-1", question: "Analyse les KPI", state: "pending" },
  ]);
  assert.equal(controller.isBusy(), true);

  request.resolve({ answer: "Analyse terminée", route: "analysis_agent" });
  await submission;

  assert.equal(controller.getTurns().length, 1);
  assert.equal(controller.getTurns()[0].id, "turn-1");
  assert.equal(controller.getTurns()[0].state, "success");
  assert.equal(controller.getTurns()[0].payload.answer, "Analyse terminée");
  assert.equal(controller.isBusy(), false);
  assert.equal(renders.at(-1).meta.completedTurnId, "turn-1");
  assert.equal(renders.at(-1).meta.focusCompleted, true);
});

test("only one request may be active", async () => {
  const request = deferred();
  const calls = [];
  const controller = makeController({
    ask: (question) => {
      calls.push(question);
      return request.promise;
    },
  });

  const first = controller.submit("Première question");
  const secondAccepted = await controller.submit("Seconde question");

  assert.equal(secondAccepted, false);
  assert.deepEqual(calls, ["Première question"]);
  assert.equal(controller.getTurns().length, 1);

  request.resolve({ answer: "Réponse" });
  await first;
});

test("a later failure preserves an earlier successful turn", async () => {
  let call = 0;
  const failure = new Error("offline");
  const controller = makeController({
    ask: async () => {
      call += 1;
      if (call === 2) throw failure;
      return { answer: "Réponse conservée", route: "kpi_agent" };
    },
  });

  await controller.submit("Première question");
  await controller.submit("Question suivante");

  const turns = controller.getTurns();
  assert.equal(turns[0].state, "success");
  assert.equal(turns[0].payload.answer, "Réponse conservée");
  assert.equal(turns[1].state, "error");
  assert.equal(turns[1].error, failure);
});

test("retry reuses the failed turn id and original question", async () => {
  const requests = [];
  let call = 0;
  const renders = [];
  const controller = makeController({
    ask: async (question) => {
      requests.push(question);
      call += 1;
      if (call === 1) throw new Error("offline");
      return { answer: "Réponse après relance", route: "kpi_agent" };
    },
    render: (turns, meta) => renders.push({ turns, meta }),
  });

  await controller.submit("Question à relancer");
  const accepted = await controller.retry("turn-1", { keyboardInitiated: true });

  assert.equal(accepted, true);
  assert.deepEqual(requests, ["Question à relancer", "Question à relancer"]);
  assert.equal(controller.getTurns().length, 1);
  assert.equal(controller.getTurns()[0].id, "turn-1");
  assert.equal(controller.getTurns()[0].state, "success");
  assert.ok(renders.some(({ turns }) => turns[0]?.state === "retrying"));
  assert.equal(renders.at(-1).meta.focusCompleted, true);
});

test("retry ignores missing and non-error turns", async () => {
  const controller = makeController();
  await controller.submit("Question valide");

  assert.equal(await controller.retry("turn-1"), false);
  assert.equal(await controller.retry("turn-404"), false);
  assert.equal(controller.getTurns().length, 1);
});

test("clear restores empty state without calling the backend", async () => {
  let calls = 0;
  const renders = [];
  const controller = makeController({
    ask: async () => {
      calls += 1;
      return { answer: "Réponse" };
    },
    render: (turns, meta) => renders.push({ turns, meta }),
  });
  await controller.submit("Question valide");

  assert.equal(controller.clear(), true);

  assert.deepEqual(controller.getTurns(), []);
  assert.equal(calls, 1);
  assert.deepEqual(renders.at(-1).turns, []);
  assert.equal(renders.at(-1).meta.cleared, true);
});

test("clear is disabled while a request is active", async () => {
  const request = deferred();
  const controller = makeController({ ask: () => request.promise });

  const submission = controller.submit("Question active");
  assert.equal(controller.clear(), false);
  assert.equal(controller.getTurns().length, 1);
  assert.equal(controller.getTurns()[0].state, "pending");

  request.resolve({ answer: "Réponse" });
  await submission;
});

test("invalid trimmed questions create no turn and no request", async () => {
  let calls = 0;
  const controller = makeController({ ask: async () => { calls += 1; } });

  assert.equal(await controller.submit("  x "), false);
  assert.equal(await controller.submit(` ${"x".repeat(501)} `), false);
  assert.equal(calls, 0);
  assert.deepEqual(controller.getTurns(), []);
});

class FakeElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.attributes = new Map();
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.disabled = false;
    this.firstChild = { nodeValue: id === "assistant-submit" ? "Envoyer" : "" };
    this.focused = false;
    this.hidden = false;
    this.listeners = new Map();
    this.scrollCalls = [];
    this.scrollHeight = 400;
    this.value = "";
    this._textContent = "";
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "data-turn-id") this.dataset.turnId = String(value);
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
    this._textContent = "";
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    return (this.listeners.get(type) ?? []).map((listener) => listener(event));
  }

  focus(options) {
    this.focused = true;
    this.focusOptions = options;
  }

  scrollTo(options) {
    this.scrollCalls.push(options);
  }

  querySelectorAll(selector) {
    const matches = [];
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    const visit = (node) => {
      if (className && node.className?.split(/\s+/).includes(className)) matches.push(node);
      for (const child of node.children ?? []) visit(child);
    };
    for (const child of this.children) visit(child);
    return matches;
  }

  get lastElementChild() {
    return this.children.at(-1) ?? null;
  }
}

function installAssistantDocument({ reducedMotion = false } = {}) {
  const ids = [
    "assistant-clear",
    "assistant-conversation",
    "assistant-empty",
    "assistant-form",
    "assistant-input",
    "assistant-live-status",
    "assistant-submit",
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement("div", id)]));
  const suggestions = [new FakeElement("button"), new FakeElement("button")];
  suggestions[0].dataset.question = "Première question KPI";
  suggestions[1].dataset.question = "Seconde question KPI";
  elements.suggestions = suggestions;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => elements.get(id) ?? null,
    querySelectorAll: (selector) => selector === "[data-question]" ? suggestions : [],
  };
  globalThis.matchMedia = () => ({ matches: reducedMotion });
  return elements;
}

function assistantResponse(answer = "Réponse") {
  return {
    ok: true,
    async json() {
      return {
        answer,
        route: "kpi_agent",
        route_reason: "Question KPI",
        sources: [],
        agent_path: ["kpi_agent"],
      };
    },
  };
}

test("initializeAssistant appends turns, locks controls during work, and clears the log", async () => {
  const elements = installAssistantDocument();
  const request = deferred();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => request.promise;

  try {
    const { initializeAssistant } = await import("../js/assistant.mjs");
    const controller = initializeAssistant();
    elements.get("assistant-input").value = "Première question KPI";
    elements.get("assistant-form").dispatch("submit", { preventDefault() {} });

    assert.equal(controller.isBusy(), true);
    assert.equal(elements.get("assistant-conversation").children.length, 1);
    assert.equal(elements.get("assistant-clear").disabled, true);
    assert.equal(elements.get("assistant-input").disabled, true);
    assert.ok(elements.suggestions.every(({ disabled }) => disabled));

    elements.suggestions[1].dispatch("click");
    assert.equal(elements.get("assistant-input").value, "Première question KPI");
    assert.equal(controller.getTurns().length, 1);

    request.resolve(assistantResponse("Première réponse"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controller.getTurns()[0].state, "success");
    assert.equal(elements.get("assistant-conversation").children[0].focused, false);
    assert.equal(elements.get("assistant-clear").disabled, false);
    assert.equal(elements.get("assistant-empty").hidden, true);

    elements.get("assistant-clear").dispatch("click");
    assert.deepEqual(controller.getTurns(), []);
    assert.equal(elements.get("assistant-conversation").children.length, 0);
    assert.equal(elements.get("assistant-empty").hidden, false);
    assert.equal(elements.get("assistant-clear").disabled, true);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.matchMedia;
  }
});

test("keyboard submission focuses the completed turn and smooth-scrolls the conversation", async () => {
  const elements = installAssistantDocument();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => assistantResponse("Réponse clavier");

  try {
    const { initializeAssistant } = await import("../js/assistant.mjs");
    initializeAssistant();
    elements.get("assistant-input").value = "Question au clavier";
    let prevented = false;
    elements.get("assistant-input").dispatch("keydown", {
      key: "Enter",
      shiftKey: false,
      preventDefault() { prevented = true; },
    });
    await new Promise((resolve) => setImmediate(resolve));

    const completedTurn = elements.get("assistant-conversation").children[0];
    assert.equal(prevented, true);
    assert.equal(completedTurn.focused, true);
    assert.deepEqual(elements.get("assistant-conversation").scrollCalls.at(-1), {
      top: 400,
      behavior: "smooth",
    });
    assert.equal(elements.get("assistant-live-status").textContent, "Réponse ajoutée.");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.matchMedia;
  }
});

test("keyboard activation of the submit button focuses the completed turn", async () => {
  const elements = installAssistantDocument();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => assistantResponse("Réponse bouton clavier");

  try {
    const { initializeAssistant } = await import("../js/assistant.mjs");
    initializeAssistant();
    elements.get("assistant-input").value = "Question via bouton";
    elements.get("assistant-submit").dispatch("click", { detail: 0 });
    elements.get("assistant-form").dispatch("submit", {
      submitter: elements.get("assistant-submit"),
      preventDefault() {},
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(elements.get("assistant-conversation").children[0].focused, true);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.matchMedia;
  }
});

test("pointer suggestion activation keeps focus while keyboard activation moves it", async () => {
  const elements = installAssistantDocument();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => assistantResponse("Réponse suggérée");

  try {
    const { initializeAssistant } = await import("../js/assistant.mjs");
    const controller = initializeAssistant();
    elements.suggestions[0].dispatch("click", { detail: 1 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(elements.get("assistant-conversation").children[0].focused, false);

    controller.clear();
    elements.suggestions[1].dispatch("click", { detail: 0 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(elements.get("assistant-conversation").children[0].focused, true);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.matchMedia;
  }
});

test("retry replaces an error in place and reduced motion disables smooth scrolling", async () => {
  const elements = installAssistantDocument({ reducedMotion: true });
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) throw new Error("offline");
    return assistantResponse("Réponse après relance");
  };

  try {
    const { initializeAssistant } = await import("../js/assistant.mjs");
    const controller = initializeAssistant();
    elements.suggestions[0].dispatch("click");
    await new Promise((resolve) => setImmediate(resolve));
    const retry = elements.get("assistant-conversation").querySelectorAll(".retry-button")[0];
    assert.ok(retry);

    retry.dispatch("click", { detail: 0 });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(call, 2);
    assert.equal(controller.getTurns().length, 1);
    assert.equal(controller.getTurns()[0].state, "success");
    assert.equal(elements.get("assistant-conversation").children[0].focused, true);
    assert.equal(elements.get("assistant-conversation").scrollCalls.at(-1).behavior, "auto");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.matchMedia;
  }
});

test("pointer retry replaces the error without moving completion focus", async () => {
  const elements = installAssistantDocument();
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) throw new Error("offline");
    return assistantResponse("Réponse après clic");
  };

  try {
    const { initializeAssistant } = await import("../js/assistant.mjs");
    initializeAssistant();
    elements.suggestions[0].dispatch("click", { detail: 1 });
    await new Promise((resolve) => setImmediate(resolve));
    const retry = elements.get("assistant-conversation").querySelectorAll(".retry-button")[0];

    retry.dispatch("click", { detail: 1 });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(call, 2);
    assert.equal(elements.get("assistant-conversation").children[0].focused, false);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.matchMedia;
  }
});
