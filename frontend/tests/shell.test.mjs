import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const shell = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("shell uses the NSI logo and removes the static attention copy", () => {
  assert.equal(existsSync(new URL("../assets/nsi-logo.svg", import.meta.url)), true);
  assert.match(shell, /<img[^>]+src="\/static\/assets\/nsi-logo\.svg"/);
  assert.doesNotMatch(shell, /NSI Pulse|Point d’attention|attention-copy/);
  assert.doesNotMatch(shell, /Chaque question lance une analyse indépendante|Interrogez les KPI RH/);
});
