// KI-Log ME-[Nr.]: Tests zum Ausblenden des alten Ergebnisses mit KI erstellt, von Mert Eminel geprüft (FE #54, H2)

import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/js/api.js";
import { DEFAULTS, isResultVisibleAfter, startSimulation } from "../src/js/simulation.js";

const validInput = { ...DEFAULTS, portfolioId: "5" };
const result = { timeline: [], parameters: {}, metrics: {} };

test("result stays visible only after a successful run (H2)", () => {
  assert.equal(isResultVisibleAfter("done"), true);
  for (const status of ["invalid", "error", "unauthorized"]) {
    assert.equal(isResultVisibleAfter(status), false, status);
  }
});

test("invalid input hides the previous result (H2, AT-07-04)", async () => {
  const outcome = await startSimulation({ ...validInput, horizonYears: "0" }, "token", async () => result);

  assert.equal(outcome.status, "invalid");
  assert.equal(isResultVisibleAfter(outcome.status), false);
});

test("an error message from the backend hides the previous result (H2, AT-04-08)", async () => {
  const failing = async () => {
    throw new ApiError(422, "INSUFFICIENT_DATA", "Für folgende Anlagen liegen weniger als 3 Jahre Kursdaten vor: ETHA.");
  };
  const outcome = await startSimulation(validInput, "token", failing);

  assert.equal(outcome.status, "error");
  assert.equal(isResultVisibleAfter(outcome.status), false);
});

test("a successful run after an error shows the result again (H2)", async () => {
  const outcome = await startSimulation(validInput, "token", async () => result);

  assert.equal(outcome.status, "done");
  assert.equal(isResultVisibleAfter(outcome.status), true);
});
