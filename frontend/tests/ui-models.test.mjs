import test from "node:test";
import assert from "node:assert/strict";

import {
  assistantErrorMessage,
  formatNumber,
  normalizePresentation,
  normalizeRecruiters,
  normalizeSummary,
  routeLabel,
  safeExternalUrl,
} from "../js/models.mjs";


test("normalizeSummary accepts the KPI fields consumed by the cockpit", () => {
  const summary = normalizeSummary({
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
  });

  assert.equal(summary.totalInterviews, 162);
  assert.equal(summary.clientPresentationRate, 5);
  assert.equal(summary.source, "Excel KPI RH Q3 2024");
});

test("normalizeSummary rejects a missing number instead of turning it into zero", () => {
  assert.throws(
    () => normalizeSummary({ period: "T3 2024" }),
    /candidates_contacted/,
  );
});

test("normalizeRecruiters preserves names, volumes, and rates", () => {
  const recruiters = normalizeRecruiters({
    recruiters: {
      "Inès": {
        candidates_contacted: 236,
        total_interviews: 50,
        client_presentations: 1,
        total_recruitments: 1,
        client_presentation_rate: 2,
        signature_rate: 100,
      },
    },
  });

  assert.deepEqual(recruiters[0], {
    name: "Inès",
    candidatesContacted: 236,
    totalInterviews: 50,
    clientPresentations: 1,
    totalRecruitments: 1,
    clientPresentationRate: 2,
    signatureRate: 100,
  });
});

test("normalizeRecruiters rejects a malformed collection but accepts an explicit empty one", () => {
  assert.throws(() => normalizeRecruiters({}), /recruteurs invalide/i);
  assert.throws(() => normalizeRecruiters({ recruiters: null }), /recruteurs invalide/i);
  assert.deepEqual(normalizeRecruiters({ recruiters: {} }), []);
});

test("presentation helpers use French labels and safe links", () => {
  assert.equal(formatNumber(809), "809");
  assert.equal(routeLabel("analysis_agent"), "Agent Analyse");
  assert.equal(safeExternalUrl("https://example.com/source"), "https://example.com/source");
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("not a url"), null);
});

test("assistant errors map to concise French recovery copy", () => {
  assert.equal(
    assistantErrorMessage({ status: 422, code: "http_error" }),
    "Votre question doit contenir entre 3 et 500 caractères.",
  );
  assert.equal(
    assistantErrorMessage({ code: "timeout" }),
    "L’assistant met trop de temps à répondre. Réessayez.",
  );
  assert.equal(
    assistantErrorMessage({ code: "mcp_tool_failed" }),
    "Les outils KPI sont momentanément indisponibles.",
  );
});

test("normalizePresentation keeps only strict allowlisted blocks", () => {
  assert.deepEqual(normalizePresentation([
    { type: "metrics", title: "KPI", items: [{ label: "Contactés", value: 809 }] },
    {
      type: "table",
      title: "Comparaison",
      columns: ["Indicateur", "Inès"],
      rows: [["Contactés", 236]],
    },
    { type: "insight", tone: "attention", title: "Point", text: "Conversion faible." },
    { type: "actions", title: "Actions", items: ["Mesurer chaque semaine"] },
    { type: "html", value: "<iframe>" },
  ]), [
    { type: "metrics", title: "KPI", items: [{ label: "Contactés", value: 809 }] },
    {
      type: "table",
      title: "Comparaison",
      columns: ["Indicateur", "Inès"],
      rows: [["Contactés", 236]],
    },
    { type: "insight", tone: "attention", title: "Point", text: "Conversion faible." },
    { type: "actions", title: "Actions", items: ["Mesurer chaque semaine"] },
  ]);
});

test("normalizePresentation rejects unsafe values, bad widths, and oversized collections", () => {
  const objectValue = { toString: () => "must not be coerced" };
  assert.deepEqual(normalizePresentation([
    { type: "metrics", title: "KPI", items: [{ label: "Objet", value: objectValue }] },
    { type: "metrics", title: "KPI", items: [{ label: "Infini", value: Infinity }] },
    { type: "metrics", title: "KPI", items: [1, 2, 3, 4, 5].map((value) => ({ label: `${value}`, value })) },
    { type: "table", title: "Large", columns: ["A", "B"], rows: [["A"]] },
    { type: "table", title: "Trop de colonnes", columns: ["1", "2", "3", "4", "5", "6", "7"], rows: [] },
    { type: "insight", tone: "danger", title: "Point", text: "Texte" },
    { type: "insight", tone: "neutral", title: "", text: "Texte" },
    { type: "actions", title: "Actions", items: ["1", "2", "3", "4"] },
    null,
  ]), []);
});
