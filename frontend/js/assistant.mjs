import { askAssistant } from "./api.mjs";
import { focusTurn, renderTurn } from "./assistant-view.mjs";

function validQuestion(rawQuestion) {
  if (typeof rawQuestion !== "string") return null;
  const question = rawQuestion.trim();
  return question.length >= 3 && question.length <= 500 ? question : null;
}

function isKeyboardActivation(event) {
  return event?.detail === 0;
}

export function createConversationController({ ask, render, now, makeId }) {
  const turns = [];
  let busy = false;

  const snapshot = () => turns.map((turn) => ({ ...turn }));
  const update = (meta = {}) => render(snapshot(), { busy, ...meta });

  async function run(turn, { keyboardInitiated = false } = {}) {
    busy = true;
    update({ activeTurnId: turn.id });
    try {
      turn.payload = await ask(turn.question);
      turn.state = "success";
      delete turn.error;
    } catch (error) {
      turn.state = "error";
      turn.error = error;
      delete turn.payload;
    } finally {
      busy = false;
      update({
        completedTurnId: turn.id,
        focusCompleted: keyboardInitiated,
      });
    }
    return true;
  }

  return {
    getTurns: snapshot,
    isBusy: () => busy,

    async submit(rawQuestion, { keyboardInitiated = false } = {}) {
      const question = validQuestion(rawQuestion);
      if (busy || question === null) return false;

      const turn = {
        id: makeId(),
        question,
        state: "pending",
        createdAt: now(),
      };
      turns.push(turn);
      return run(turn, { keyboardInitiated });
    },

    async retry(turnId, { keyboardInitiated = false } = {}) {
      if (busy) return false;
      const turn = turns.find(({ id }) => id === turnId);
      if (!turn || turn.state !== "error") return false;

      turn.state = "retrying";
      delete turn.error;
      delete turn.payload;
      return run(turn, { keyboardInitiated });
    },

    clear() {
      if (busy) return false;
      turns.splice(0, turns.length);
      update({ cleared: true });
      return true;
    },
  };
}

const byId = (id) => document.getElementById(id);

function setSubmitLabel(button, busy) {
  if (button?.firstChild) button.firstChild.nodeValue = busy ? "Analyse…" : "Envoyer";
}

function scrollConversation(conversation) {
  const reducedMotion = typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof conversation.scrollTo === "function") {
    conversation.scrollTo({
      top: conversation.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  } else if (typeof conversation.lastElementChild?.scrollIntoView === "function") {
    conversation.lastElementChild.scrollIntoView({
      block: "end",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }
}

export function initializeAssistant() {
  const form = byId("assistant-form");
  const input = byId("assistant-input");
  const submit = byId("assistant-submit");
  const clear = byId("assistant-clear");
  const empty = byId("assistant-empty");
  const conversation = byId("assistant-conversation");
  const liveStatus = byId("assistant-live-status");
  const suggestions = [...document.querySelectorAll("[data-question]")];
  let nextId = 0;
  let submitKeyboardInitiated = false;
  let controller;

  const renderConversation = (turns, meta) => {
    const nodes = turns.map((turn) => renderTurn(turn, {
      onRetry: (turnId, event) => {
        void controller.retry(turnId, { keyboardInitiated: isKeyboardActivation(event) });
      },
    }));
    conversation.replaceChildren(...nodes);

    empty.hidden = turns.length > 0;
    clear.disabled = meta.busy || turns.length === 0;
    input.disabled = meta.busy;
    submit.disabled = meta.busy;
    setSubmitLabel(submit, meta.busy);
    for (const button of suggestions) button.disabled = meta.busy;
    for (const button of conversation.querySelectorAll(".retry-button")) {
      button.disabled = meta.busy;
    }

    if (meta.cleared) {
      liveStatus.textContent = "Conversation effacée.";
    } else if (meta.activeTurnId) {
      liveStatus.textContent = "Analyse en cours.";
    } else if (meta.completedTurnId) {
      const completed = turns.find(({ id }) => id === meta.completedTurnId);
      liveStatus.textContent = completed?.state === "error"
        ? "La réponse n’a pas pu être chargée."
        : "Réponse ajoutée.";
      scrollConversation(conversation);

      if (meta.focusCompleted) {
        const turnElement = nodes.find(
          (node) => node.getAttribute?.("data-turn-id") === meta.completedTurnId,
        );
        focusTurn(turnElement);
      }
    }
  };

  controller = createConversationController({
    ask: askAssistant,
    render: renderConversation,
    now: () => new Date(),
    makeId: () => `turn-${++nextId}`,
  });

  const submitInput = (keyboardInitiated) => {
    if (controller.isBusy()) return;
    if (validQuestion(input.value) === null) {
      liveStatus.textContent = "Votre question doit contenir entre 3 et 500 caractères.";
      return;
    }
    void controller.submit(input.value, { keyboardInitiated });
  };

  submit.addEventListener("click", (event) => {
    submitKeyboardInitiated = isKeyboardActivation(event);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyboardInitiated = submitKeyboardInitiated;
    submitKeyboardInitiated = false;
    submitInput(keyboardInitiated);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submitInput(true);
  });

  for (const button of suggestions) {
    button.addEventListener("click", (event) => {
      if (controller.isBusy()) return;
      input.value = button.dataset.question;
      void controller.submit(button.dataset.question, {
        keyboardInitiated: isKeyboardActivation(event),
      });
    });
  }

  clear.addEventListener("click", () => {
    if (controller.clear()) input.value = "";
  });

  renderConversation([], { busy: false });
  return controller;
}
