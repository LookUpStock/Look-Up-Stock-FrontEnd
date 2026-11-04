// KI-Log Nr. [eintragen]: Tests zum Speichern und Laden von Portfolios mit KI erstellt, vom Team zu prüfen (US-03)

import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  deletePortfolio,
  listPortfolios,
  savePortfolio,
  updatePortfolio,
  ApiError,
  API_BASE_URL,
} from "../src/js/api.js";
import { createPortfolio, createPosition } from "../src/js/portfolio.js";
import {
  MESSAGES,
  errorMessageFrom,
  formatPositionCount,
  formatSavedDetails,
  loadSavedPortfolios,
  missingAssetErrors,
  submitPortfolio,
  toEditorDraft,
} from "../src/js/portfolio-save.js";

afterEach(() => {
  mock.restoreAll();
});

function mockFetchResponse(status, body) {
  return mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
}

const portfolio = createPortfolio("Welt", [
  createPosition({ id: "1", assetId: 3, symbol: "EUNL", name: "iShares Core MSCI World", weightPct: 70 }),
  createPosition({ id: "2", assetId: 8, symbol: "IS3N", name: "iShares Core MSCI EM IMI", weightPct: 30 }),
]);

test("savePortfolio sends token header, name and positions with assetId and weight", async () => {
  const fetchMock = mockFetchResponse(201, { id: 1 });

  await savePortfolio("abc", portfolio.name, portfolio.positions);

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/portfolios`);
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer abc");
  assert.deepEqual(JSON.parse(options.body), {
    name: "Welt",
    positions: [
      { assetId: 3, weight: 70 },
      { assetId: 8, weight: 30 },
    ],
  });
});

test("listPortfolios loads the portfolios with GET and the token header", async () => {
  const fetchMock = mockFetchResponse(200, { portfolios: [] });

  const result = await listPortfolios("abc");

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/portfolios`);
  assert.equal(options.method, "GET");
  assert.equal(options.headers.Authorization, "Bearer abc");
  assert.equal(options.body, undefined);
  assert.deepEqual(result, { portfolios: [] });
});

test("updatePortfolio sends the portfolio id, token header and positions", async () => {
  const fetchMock = mockFetchResponse(200, { id: 1 });

  await updatePortfolio("abc", 1, portfolio.name, portfolio.positions);

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/portfolios/1`);
  assert.equal(options.method, "PUT");
  assert.equal(options.headers.Authorization, "Bearer abc");
  assert.deepEqual(JSON.parse(options.body), {
    name: "Welt",
    positions: [
      { assetId: 3, weight: 70 },
      { assetId: 8, weight: 30 },
    ],
  });
});

test("deletePortfolio sends DELETE with the token header and no body", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));

  await deletePortfolio("abc", 1);

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/portfolios/1`);
  assert.equal(options.method, "DELETE");
  assert.equal(options.headers.Authorization, "Bearer abc");
  assert.equal(options.body, undefined);
});

test("createPosition keeps the assetId from the search", () => {
  assert.equal(portfolio.positions[0].assetId, 3);
  assert.equal(createPosition({ symbol: "X" }).assetId, null);
});

test("missingAssetErrors marks positions without assetId", () => {
  const draft = createPortfolio("Test", [
    createPosition({ id: "1", assetId: 3, symbol: "EUNL", name: "A", weightPct: 50 }),
    createPosition({ id: "2", symbol: "SAP", name: "SAP SE", weightPct: 50 }),
  ]);

  assert.deepEqual(missingAssetErrors(draft), ["", MESSAGES.missingAsset]);
});

test("submitPortfolio returns the saved portfolio", async () => {
  const save = mock.fn(async () => ({ id: 1, name: "Welt" }));

  const result = await submitPortfolio(portfolio, "abc", save);

  assert.deepEqual(result, { status: "saved", portfolio: { id: 1, name: "Welt" } });
  assert.deepEqual(save.mock.calls[0].arguments, ["abc", "Welt", portfolio.positions]);
});

test("submitPortfolio without token does not call the backend", async () => {
  const save = mock.fn();

  assert.deepEqual(await submitPortfolio(portfolio, null, save), { status: "unauthorized" });
  assert.equal(save.mock.callCount(), 0);
});

test("submitPortfolio reports 401 as unauthorized", async () => {
  const save = async () => {
    throw new ApiError(401, "UNAUTHORIZED", "Nicht angemeldet.");
  };

  assert.deepEqual(await submitPortfolio(portfolio, "abc", save), { status: "unauthorized" });
});

test("submitPortfolio shows backend message with details", async () => {
  const save = async () => {
    throw new ApiError(400, "VALIDATION_ERROR", "Eine Anlage wurde nicht gefunden.", [
      { field: "positions", message: "Unbekannte assetId 99." },
    ]);
  };

  const result = await submitPortfolio(portfolio, "abc", save);

  assert.deepEqual(result, {
    status: "error",
    message: "Eine Anlage wurde nicht gefunden. Unbekannte assetId 99.",
  });
});

test("errorMessageFrom uses a general text for unknown errors", () => {
  assert.equal(errorMessageFrom(new Error("kaputt")), MESSAGES.unexpected);
});

test("loadSavedPortfolios returns the list", async () => {
  const result = await loadSavedPortfolios("abc", async () => ({ portfolios: [{ id: 1 }] }));

  assert.deepEqual(result, { status: "loaded", portfolios: [{ id: 1 }] });
});

test("loadSavedPortfolios reports 401 as unauthorized", async () => {
  const list = async () => {
    throw new ApiError(401, "UNAUTHORIZED", "Nicht angemeldet.");
  };

  assert.deepEqual(await loadSavedPortfolios("abc", list), { status: "unauthorized" });
});

test("toEditorDraft converts a saved portfolio into editor fields", () => {
  const draft = toEditorDraft({
    id: 1,
    name: "Welt",
    positions: [{ assetId: 3, symbol: "EUNL", name: "iShares Core MSCI World", weight: 33.5 }],
  });

  assert.deepEqual(draft, {
    name: "Welt",
    positions: [{ assetId: 3, symbol: "EUNL", name: "iShares Core MSCI World", weightInput: "33,50" }],
  });
});

test("formatSavedDetails shows position count and date", () => {
  assert.equal(
    formatSavedDetails({ positions: [{}, {}], createdAt: "2026-10-11T08:00:00Z" }),
    "2 Positionen · gespeichert am 11.10.2026"
  );
  assert.equal(formatSavedDetails({ positions: [{}] }), "1 Position");
});

test("formatPositionCount uses the singular for exactly one position (FE #71, H12)", () => {
  assert.equal(formatPositionCount(1), "1 Position");
  assert.equal(formatPositionCount(0), "0 Positionen");
  assert.equal(formatPositionCount(2), "2 Positionen");
});
