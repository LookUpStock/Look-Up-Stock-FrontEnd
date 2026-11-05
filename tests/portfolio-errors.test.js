import { test } from "node:test";
import assert from "node:assert/strict";
import { createPortfolio, validatePortfolio } from "../src/js/portfolio.js";
import { hasWeightErrors, totalStatusDisplay, visibleEditorErrors } from "../src/js/portfolio-ui.js";

const emptyErrors = validatePortfolio(createPortfolio("", [{ id: "p1", symbol: "", name: "", weightPct: Number.NaN }])).errors;
const ids = ["p1"];

test("the empty editor shows no field messages before anything was entered (H4)", () => {
  const visible = visibleEditorErrors(emptyErrors, { positionIds: ids });

  assert.equal(visible.name, "");
  assert.equal(visible.totalWeightPct, "");
  assert.deepEqual(visible.positions, [{ symbol: "", name: "", weightPct: "" }]);
});

test("the validation itself still finds the errors (H4 changes only the display)", () => {
  assert.equal(emptyErrors.name, "Der Portfolio-Name ist erforderlich.");
  assert.notEqual(emptyErrors.positions[0].symbol, "");
});

test("after the first save attempt all messages are shown (H4)", () => {
  const visible = visibleEditorErrors(emptyErrors, { submitted: true, positionIds: ids });

  assert.equal(visible.name, emptyErrors.name);
  assert.equal(visible.totalWeightPct, emptyErrors.totalWeightPct);
  assert.deepEqual(visible.positions, emptyErrors.positions);
});

test("leaving a field shows only the message of that field (H4)", () => {
  const visible = visibleEditorErrors(emptyErrors, { touched: new Set(["name"]), positionIds: ids });

  assert.equal(visible.name, "Der Portfolio-Name ist erforderlich.");
  assert.equal(visible.positions[0].symbol, "");
  assert.equal(visible.totalWeightPct, "");
});

test("leaving a weight field shows its message and the sum message (H4)", () => {
  const visible = visibleEditorErrors(emptyErrors, { touched: new Set(["p1:weightPct", "total"]), positionIds: ids });

  assert.equal(visible.positions[0].weightPct, emptyErrors.positions[0].weightPct);
  assert.equal(visible.totalWeightPct, emptyErrors.totalWeightPct);
  assert.equal(visible.positions[0].symbol, "");
});

test("a valid portfolio shows no messages even after saving (H4)", () => {
  const errors = validatePortfolio(createPortfolio("Mein Weltportfolio", [{ id: "p1", symbol: "URTH", name: "iShares MSCI World ETF", weightPct: 100 }])).errors;
  const visible = visibleEditorErrors(errors, { submitted: true, positionIds: ids });

  assert.equal(visible.name, "");
  assert.equal(visible.totalWeightPct, "");
  assert.deepEqual(visible.positions, [{ symbol: "", name: "", weightPct: "" }]);
});

test("the empty editor shows a neutral weight sum status (FE #69, H9)", () => {
  const status = totalStatusDisplay({ hasErrors: true, weightInputs: [""] });

  assert.deepEqual(status, { text: "—", state: "neutral" });
});

test("entering a weight shows the weight sum status (FE #69, H9)", () => {
  assert.deepEqual(totalStatusDisplay({ hasErrors: true, weightInputs: ["40"] }), { text: "ungültig", state: "invalid" });
  assert.deepEqual(totalStatusDisplay({ hasErrors: false, weightInputs: ["100"] }), { text: "gültig", state: "valid" });
});

test("saving or editing the sum ends the neutral status even without weights (FE #69, H9)", () => {
  assert.equal(totalStatusDisplay({ hasErrors: true, submitted: true, weightInputs: [""] }).state, "invalid");
  assert.equal(totalStatusDisplay({ hasErrors: true, touched: new Set(["total"]), weightInputs: [""] }).state, "invalid");
});

test("whitespace in the weight field counts as no input (FE #69, H9)", () => {
  assert.equal(totalStatusDisplay({ hasErrors: true, weightInputs: ["  "] }).state, "neutral");
});


function weightSumStatus(name, weightPct, weightInput = String(weightPct)) {
  const errors = validatePortfolio(createPortfolio(name, [{ id: "p1", symbol: "URTH", name: "iShares MSCI World ETF", weightPct }])).errors;
  return { errors, status: totalStatusDisplay({ hasErrors: hasWeightErrors(errors), weightInputs: [weightInput] }) };
}

test("100 % without a portfolio name shows a valid weight sum (FE #83, H13)", () => {
  const { errors, status } = weightSumStatus("", 100);

  assert.deepEqual(status, { text: "gültig", state: "valid" });
  assert.equal(visibleEditorErrors(errors, { submitted: true, positionIds: ids }).name, "Der Portfolio-Name ist erforderlich.");
  assert.equal(validatePortfolio(createPortfolio("", [{ id: "p1", symbol: "URTH", name: "iShares MSCI World ETF", weightPct: 100 }])).valid, false);
});

test("40 % shows an invalid weight sum with the sum message (FE #83, H13)", () => {
  const { errors, status } = weightSumStatus("", 40);

  assert.deepEqual(status, { text: "ungültig", state: "invalid" });
  assert.equal(errors.totalWeightPct, "Die Gewichtssumme muss genau 100 % ergeben. Aktuell: 40,00 %.");
});

test("an invalid single weight makes the weight sum invalid (FE #83, H13)", () => {
  assert.equal(weightSumStatus("Mein Weltportfolio", 100.123).status.state, "invalid");
});

test("the empty editor stays neutral (FE #83, H9 unchanged)", () => {
  assert.deepEqual(totalStatusDisplay({ hasErrors: hasWeightErrors(emptyErrors), weightInputs: [""] }), { text: "—", state: "neutral" });
});
