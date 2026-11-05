import { test } from "node:test";
import assert from "node:assert/strict";
import { validateComparisonParameters } from "../src/js/comparison.js";

const baseInput = { startCapital: "10000", monthlyContribution: "200", horizonYears: "20", paths: "10000", seed: "" };

test("validateComparisonParameters sends no targetAmount when the field is empty (B1)", () => {
  const check = validateComparisonParameters({ ...baseInput, targetAmount: "" });

  assert.equal(check.valid, true);
  assert.deepEqual(check.parameters, { startCapital: 10000, monthlyContribution: 200, horizonYears: 20, paths: 10000 });
});

test("validateComparisonParameters passes a given target amount (B1, AT-07-02)", () => {
  const check = validateComparisonParameters({ ...baseInput, targetAmount: "150000" });

  assert.equal(check.valid, true);
  assert.equal(check.parameters.targetAmount, 150000);
});

test("validateComparisonParameters rejects a target amount of 0 or below with the backend message (B1, E27)", () => {
  for (const targetAmount of ["0", "-1"]) {
    const check = validateComparisonParameters({ ...baseInput, targetAmount });
    assert.equal(check.valid, false, targetAmount);
    assert.equal(check.errors.targetAmount, "Der Zielbetrag muss größer als 0 sein.");
  }
});
