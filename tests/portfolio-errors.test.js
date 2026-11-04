// KI-Log ME-[Nr.]: Tests zur Anzeige der Feldmeldungen im Portfolio-Editor mit KI erstellt, von Mert Eminel geprüft (FE #56, H4)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createPortfolio, validatePortfolio } from "../src/js/portfolio.js";
import { totalStatusDisplay, visibleEditorErrors } from "../src/js/portfolio-ui.js";

// Leerer Editor direkt nach dem Laden: kein Name, eine leere Position
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
