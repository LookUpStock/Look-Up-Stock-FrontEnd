import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { searchAssets, ApiError, API_BASE_URL } from "../src/js/api.js";
import { findAssets, formatAssetDetails, normalizeQuery, searchHint, MESSAGES } from "../src/js/search.js";

afterEach(() => {
  mock.restoreAll();
});

const EUNL = {
  id: 17,
  symbol: "EUNL",
  isin: "IE00B4L5Y983",
  name: "iShares Core MSCI World UCITS ETF",
  exchange: "XETRA",
  currency: "EUR",
  type: "ETF",
};

test("searchAssets calls the search endpoint with encoded query", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ query: "msci world", results: [] }), { status: 200 })
  );

  await searchAssets("msci world");

  assert.equal(fetchMock.mock.calls[0].arguments[0], `${API_BASE_URL}/api/v1/assets/search?q=msci+world`);
});

test("searchAssets adds limit only when given", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ results: [] }), { status: 200 })
  );

  await searchAssets("EUNL", 25);

  assert.equal(fetchMock.mock.calls[0].arguments[0], `${API_BASE_URL}/api/v1/assets/search?q=EUNL&limit=25`);
});

test("search does not start with fewer than two characters", async () => {
  const search = mock.fn(async () => ({ results: [EUNL] }));

  for (const input of ["", "E", " E "]) {
    const state = await findAssets(input, search);
    assert.equal(state.status, "too-short");
  }
  assert.equal(search.mock.callCount(), 0);
});

test("search starts with exactly two characters", async () => {
  const search = mock.fn(async () => ({ results: [EUNL] }));

  const state = await findAssets("EU", search);

  assert.equal(state.status, "results");
  assert.equal(search.mock.callCount(), 1);
});

test("search sends the query without surrounding spaces", async () => {
  const search = mock.fn(async () => ({ results: [] }));

  await findAssets("  msci  ", search);

  assert.equal(search.mock.calls[0].arguments[0], "msci");
});

test("search returns the result list with name, ticker, exchange and currency", async () => {
  const state = await findAssets("EUNL", async () => ({ results: [EUNL] }));

  assert.equal(state.status, "results");
  assert.equal(state.results[0].name, "iShares Core MSCI World UCITS ETF");
  assert.equal(formatAssetDetails(state.results[0]), "EUNL · XETRA · EUR");
});

test("search reports no results with the agreed hint (E10)", async () => {
  const state = await findAssets("xyzabc", async () => ({ query: "xyzabc", results: [] }));

  assert.equal(state.status, "empty");
  assert.equal(MESSAGES.noResults, "Keine passende Anlage gefunden.");
});

test("search shows the backend message when the financial data API is down", async () => {
  const unavailable = async () => {
    throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Kursdaten sind gerade nicht verfügbar.");
  };

  const state = await findAssets("EUNL", unavailable);

  assert.equal(state.status, "error");
  assert.equal(state.message, "Kursdaten sind gerade nicht verfügbar.");
});

test("search uses a fallback message for unexpected errors", async () => {
  const state = await findAssets("EUNL", async () => {
    throw new Error("kaputt");
  });

  assert.equal(state.status, "error");
  assert.equal(state.message, MESSAGES.unexpected);
});

test("formatAssetDetails skips missing values", () => {
  assert.equal(formatAssetDetails({ symbol: "AAPL", exchange: "NASDAQ" }), "AAPL · NASDAQ");
});

test("search result contains the asset id needed by the portfolio editor", async () => {
  const state = await findAssets("EUNL", async () => ({ results: [EUNL] }));

  assert.equal(state.results[0].id, 17);
});

test("normalizeQuery handles empty input", () => {
  assert.equal(normalizeQuery(undefined), "");
  assert.equal(normalizeQuery("  EUNL "), "EUNL");
});

test("search hint shows the error message next to the search field (B6)", async () => {
  const serverError = async () => {
    throw new ApiError(500, "INTERNAL_ERROR", "Ein unerwarteter Fehler ist aufgetreten.");
  };

  const state = await findAssets("ETHA", serverError);

  assert.equal(searchHint(state), "Ein unerwarteter Fehler ist aufgetreten.");
});

test("search hint shows the backend message when the financial data API is down (B6)", async () => {
  const unavailable = async () => {
    throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Kursdaten sind gerade nicht verfügbar.");
  };

  const state = await findAssets("ETHA", unavailable);

  assert.equal(searchHint(state), "Kursdaten sind gerade nicht verfügbar.");
});

test("search hint matches the state for short input, no results and results", async () => {
  assert.equal(searchHint(await findAssets("E")), MESSAGES.tooShort);
  assert.equal(searchHint(await findAssets("xyzabc", async () => ({ results: [] }))), MESSAGES.noResults);
  assert.equal(searchHint(await findAssets("EUNL", async () => ({ results: [EUNL] }))), "");
});