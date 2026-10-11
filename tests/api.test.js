// KI-Log Nr. 23: Unit-Tests der API-Schicht mit KI erstellt, vom Team geprüft und angepasst

import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { request, fetchHealth, ApiError, API_BASE_URL } from "../src/js/api.js";

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
  assert.equal(fetchMock.mock.calls[0].arguments[0], `${API_BASE_URL}/api/health`);
});

test("request sends method, JSON header and body for POST", async () => {
  const fetchMock = mockFetchResponse(201, { id: 5 });

  await request("/api/portfolios", { method: "POST", body: { name: "Test" } });

  const options = fetchMock.mock.calls[0].arguments[1];
  assert.equal(options.method, "POST");
  assert.equal(options.headers["Content-Type"], "application/json");
  assert.equal(options.body, JSON.stringify({ name: "Test" }));
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

  await assert.rejects(request("/api/health"), (error) => {
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