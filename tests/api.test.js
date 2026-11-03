// KI-Log Nr. 23: Unit-Tests der API-Schicht mit KI erstellt, vom Team geprüft und angepasst

import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { request, fetchHealth, fetchPortfolio, fetchUsageReport, ApiError, API_BASE_URL, apiErrorText } from "../src/js/api.js";

// Nach jedem Test das echte fetch wiederherstellen
afterEach(() => {
  mock.restoreAll();
});

// Ersetzt fetch durch eine simulierte Antwort des Backends
function mockFetchResponse(status, body) {
  return mock.method(globalThis, "fetch", async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

test("fetchHealth calls the health endpoint and returns the response", async () => {
  const fetchMock = mockFetchResponse(200, { status: "ok" });

  const result = await fetchHealth();

  assert.deepEqual(result, { status: "ok" });
  assert.equal(fetchMock.mock.calls[0].arguments[0], `${API_BASE_URL}/api/v1/ping`);
});

test("fetchPortfolio requests one portfolio with its bearer token", async () => {
  const fetchMock = mockFetchResponse(200, { id: 5, name: "Langfristig", positions: [] });

  const result = await fetchPortfolio("session-token", 5);

  assert.equal(result.id, 5);
  assert.equal(fetchMock.mock.calls[0].arguments[0], `${API_BASE_URL}/api/v1/portfolios/5`);
  assert.equal(fetchMock.mock.calls[0].arguments[1].headers.Authorization, "Bearer session-token");
});

test("request sends method, JSON header and body for POST", async () => {
  const fetchMock = mockFetchResponse(201, { id: 5 });

  await request("/api/portfolios", { method: "POST", body: { name: "Test" } });

  const options = fetchMock.mock.calls[0].arguments[1];
  assert.equal(options.method, "POST");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.equal(options.body, JSON.stringify({ name: "Test" }));
});

test("request sends the token as Bearer Authorization header", async () => {
  const fetchMock = mockFetchResponse(200, {});

  await request("/portfolios", { token: "abc123" });

  const options = fetchMock.mock.calls[0].arguments[1];
  assert.equal(options.headers.Authorization, "Bearer abc123");
});

test("request without token sends no Authorization header (public endpoints)", async () => {
  const fetchMock = mockFetchResponse(200, {});

  await request("/assets/search?q=msci");
  await request("/auth/login", { method: "POST", body: { email: "a@b.de", password: "x" } });

  for (const call of fetchMock.mock.calls) {
    assert.equal("Authorization" in call.arguments[1].headers, false);
  }
});

test("request returns null for 204 No Content", async () => {
  mockFetchResponse(204);

  const result = await request("/api/portfolios/5", { method: "DELETE" });

  assert.equal(result, null);
});

test("request throws ApiError with backend error format", async () => {
  mockFetchResponse(400, {
    error: {
      code: "VALIDATION_ERROR",
      message: "Bitte mindestens 2 Zeichen eingeben.",
      details: [],
    },
  });

  await assert.rejects(request("/api/assets/search?q=a"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.equal(error.message, "Bitte mindestens 2 Zeichen eingeben.");
    return true;
  });
});

test("request throws ApiError with fallback message for unknown error format", async () => {
  mockFetchResponse(500, { unexpected: true });

  await assert.rejects(request("/ping"), (error) => {
    assert.equal(error.status, 500);
    assert.equal(error.code, "UNKNOWN_ERROR");
    assert.equal(error.message, "Ein unerwarteter Fehler ist aufgetreten.");
    return true;
  });
});

test("request throws NETWORK_ERROR when the backend is unreachable", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(fetchHealth(), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 0);
    assert.equal(error.code, "NETWORK_ERROR");
    return true;
  });
});

// KI-Log ME-[Nr.]: Tests der gemeinsamen Fehlermeldung mit KI erstellt, von Mert Eminel geprüft (FE #34, B7)
test("apiErrorText names every asset exactly once for 422 INSUFFICIENT_DATA (B7)", () => {
  const error = new ApiError(
    422,
    "INSUFFICIENT_DATA",
    "Für folgende Anlagen liegen weniger als 3 Jahre Kursdaten vor: iShares Bitcoin Trust ETF, iShares Ethereum Trust ETF.",
    [
      { field: "assetId", assetId: 1, name: "iShares Bitcoin Trust ETF", message: "Weniger als 3 Jahre Kursdaten." },
      { field: "assetId", assetId: 2, name: "iShares Ethereum Trust ETF", message: "Weniger als 3 Jahre Kursdaten." },
    ]
  );

  const text = apiErrorText(error);

  assert.equal(text, error.message);
  for (const name of ["iShares Bitcoin Trust ETF", "iShares Ethereum Trust ETF"]) {
    assert.equal(text.split(name).length - 1, 1, name);
  }
});

test("apiErrorText keeps both parts when assets have no data and too short a history (422)", () => {
  const message =
    "Für folgende Anlagen liefert der Kursdatenanbieter keine Kurse: iShares Core MSCI World. Bitte die Anlage an einer anderen Börse auswählen. " +
    "Für folgende Anlagen liegen weniger als 3 Jahre Kursdaten vor: iShares Ethereum Trust ETF.";
  const error = new ApiError(422, "INSUFFICIENT_DATA", message, [
    { field: "assetId", assetId: 3, name: "iShares Core MSCI World", message: "Keine Kursdaten beim Anbieter verfügbar." },
    { field: "assetId", assetId: 2, name: "iShares Ethereum Trust ETF", message: "Weniger als 3 Jahre Kursdaten." },
  ]);

  assert.equal(apiErrorText(error), message);
});

test("apiErrorText appends the detail messages for other errors", () => {
  const error = new ApiError(400, "VALIDATION_ERROR", "Eine Anlage wurde nicht gefunden.", [
    { field: "positions", message: "Unbekannte assetId 99." },
  ]);

  assert.equal(apiErrorText(error), "Eine Anlage wurde nicht gefunden. Unbekannte assetId 99.");
  assert.equal(apiErrorText(new ApiError(503, "UPSTREAM_UNAVAILABLE", "Kursdaten sind gerade nicht verfügbar.")), "Kursdaten sind gerade nicht verfügbar.");
});

test("apiErrorText returns null for errors that do not come from the API", () => {
  assert.equal(apiErrorText(new Error("kaputt")), null);
  assert.equal(apiErrorText(undefined), null);
});
test("fetchUsageReport requests the selected month with the management bearer token", async () => {
  const fetchMock = mockFetchResponse(200, { month: "2026-11", preliminary: true, trackingSince: "2026-10-27", metrics: [] });

  const result = await fetchUsageReport("manager-token", "2026-11");

  assert.equal(result.month, "2026-11");
  assert.equal(fetchMock.mock.calls[0].arguments[0], `${API_BASE_URL}/api/v1/reports/usage?month=2026-11`);
  assert.equal(fetchMock.mock.calls[0].arguments[1].headers.Authorization, "Bearer manager-token");
});
