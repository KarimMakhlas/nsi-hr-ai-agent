import test from "node:test";
import assert from "node:assert/strict";

import { askAssistant } from "../js/api.mjs";


test("assistant requests allow the complete multi-agent workflow to finish", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let capturedDelay = null;

  globalThis.setTimeout = (_callback, delay) => {
    capturedDelay = delay;
    return 1;
  };
  globalThis.clearTimeout = () => {};
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { answer: "Réponse agentique" };
    },
  });

  try {
    await askAssistant("Analyse le parcours de recrutement");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }

  assert.equal(capturedDelay, 90_000);
});
