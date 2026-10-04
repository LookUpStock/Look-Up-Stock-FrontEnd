import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateTotalWeight,
  createPortfolio,
  createPosition,
  equalizePortfolioWeights,
  formatWeightInput,
  normalizePortfolioWeights,
  parseWeightInput,
  validatePortfolio,
  validatePosition,
} from "../src/js/portfolio.js";

test("parseWeightInput accepts comma and point", () => {
  assert.equal(parseWeightInput("12,5"), 12.5);
  assert.equal(parseWeightInput("12.5"), 12.5);
});

test("validatePosition rejects missing and invalid values", () => {
  const errors = validatePosition({ symbol: "", name: "", weightPct: 101.234 });

  assert.equal(errors.symbol, "Das Symbol ist erforderlich.");
  assert.equal(errors.name, "Der Name ist erforderlich.");
  assert.equal(errors.weightPct, "Das Gewicht muss zwischen 0 und 100 % liegen.");
});

test("validatePortfolio reports duplicate symbols and incorrect sum", () => {
  const portfolio = createPortfolio("Mein Portfolio", [
    createPosition({ id: "1", symbol: "SAP", name: "SAP SE", weightPct: 60 }),
    createPosition({ id: "2", symbol: "sap", name: "SAP Zweitposition", weightPct: 30 }),
  ]);

  const result = validatePortfolio(portfolio);

  assert.equal(result.valid, false);
  assert.equal(result.errors.positions[0].symbol, "Das Symbol darf nicht doppelt vorkommen.");
  assert.equal(result.errors.positions[1].symbol, "Das Symbol darf nicht doppelt vorkommen.");
  assert.equal(result.errors.totalWeightPct, "Die Gewichtssumme muss genau 100 % ergeben. Aktuell: 90,00 %." );
});

test("calculateTotalWeight sums all positions", () => {
  const portfolio = createPortfolio("Test", [
    createPosition({ id: "1", symbol: "A", name: "A", weightPct: 20.25 }),
    createPosition({ id: "2", symbol: "B", name: "B", weightPct: 79.75 }),
  ]);

  assert.equal(calculateTotalWeight(portfolio), 100);
});

test("normalizePortfolioWeights scales weights to 100 percent", () => {
  const portfolio = createPortfolio("Test", [
    createPosition({ id: "1", symbol: "A", name: "A", weightPct: 10 }),
    createPosition({ id: "2", symbol: "B", name: "B", weightPct: 30 }),
    createPosition({ id: "3", symbol: "C", name: "C", weightPct: 60 }),
  ]);

  const normalized = normalizePortfolioWeights(portfolio);

  assert.deepEqual(normalized.positions.map((position) => position.weightPct), [10, 30, 60]);
  assert.equal(calculateTotalWeight(normalized), 100);
});

test("normalizePortfolioWeights preserves proportions with rounding", () => {
  const portfolio = createPortfolio("Test", [
    createPosition({ id: "1", symbol: "A", name: "A", weightPct: 1 }),
    createPosition({ id: "2", symbol: "B", name: "B", weightPct: 1 }),
    createPosition({ id: "3", symbol: "C", name: "C", weightPct: 1 }),
  ]);

  const normalized = normalizePortfolioWeights(portfolio);

  assert.equal(calculateTotalWeight(normalized), 100);
  assert.deepEqual(normalized.positions.map((position) => position.weightPct), [33.34, 33.33, 33.33]);
});

test("equalizePortfolioWeights distributes the total evenly", () => {
  const portfolio = createPortfolio("Test", [
    createPosition({ id: "1", symbol: "A", name: "A", weightPct: 70 }),
    createPosition({ id: "2", symbol: "B", name: "B", weightPct: 30 }),
    createPosition({ id: "3", symbol: "C", name: "C", weightPct: 0 }),
  ]);

  const equalized = equalizePortfolioWeights(portfolio);

  assert.equal(calculateTotalWeight(equalized), 100);
  assert.deepEqual(equalized.positions.map((position) => position.weightPct), [33.34, 33.33, 33.33]);
});

test("formatWeightInput prints German decimal formatting", () => {
  assert.equal(formatWeightInput(12.5), "12,50");
});