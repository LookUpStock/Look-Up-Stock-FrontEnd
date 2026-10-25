// KI-Log ME-[Nr.]: Tests der Beispielsimulation mit KI erstellt, von Mert Eminel geprüft (FE #38, US-09)

import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ApiError, API_BASE_URL, fetchDemoPortfolios, runDemoSimulation } from "../src/js/api.js";
import {
  DEMO_MESSAGES,
  DEMO_PARAMETERS,
  describeDemoParameters,
  describeDemoPortfolio,
  loadDemoPortfolios,
  startDemoSimulation,
} from "../src/js/demo.js";
import { formatEuro } from "../src/js/chart.js";

afterEach(() => {
  mock.restoreAll();
});

const worldPortfolio = {
  id: 901,
  name: "Beispiel: Welt 70 / Schwellenländer 30",
  positions: [
    { symbol: "URTH", name: "iShares MSCI World ETF", weight: 70 },
    { symbol: "IEMG", name: "iShares Core MSCI Emerging Markets ETF", weight: 30 },
  ],
};

test("fetchDemoPortfolios uses GET /demo/portfolios without Authorization header (US-09)", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response('{"portfolios":[]}', { status: 200 }));

  await fetchDemoPortfolios();

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/demo/portfolios`);
  assert.equal(options.method, "GET");
  assert.equal(options.headers.Authorization, undefined);
});

test("runDemoSimulation posts portfolioId and parameters without Authorization header (US-09)", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("{}", { status: 200 }));

  await runDemoSimulation(900, DEMO_PARAMETERS);

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/demo/simulations`);
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(options.body), {
    portfolioId: 900,
    parameters: { startCapital: 5000, monthlyContribution: 100, horizonYears: 15, paths: 10000 },
  });
});

test("DEMO_PARAMETERS are fixed, stay within the guest limit and contain no seed", () => {
  assert.deepEqual({ ...DEMO_PARAMETERS }, { startCapital: 5000, monthlyContribution: 100, horizonYears: 15, paths: 10000 });
  assert.ok(DEMO_PARAMETERS.paths <= 10000);
  assert.equal("seed" in DEMO_PARAMETERS, false);
  assert.ok(Object.isFrozen(DEMO_PARAMETERS));
});

test("describeDemoParameters and describeDemoPortfolio show the fixed values and the composition", () => {
  assert.equal(
    describeDemoParameters(),
    `Startkapital ${formatEuro(5000)} · Sparrate ${formatEuro(100)} pro Monat · 15 Jahre · 10.000 Pfade`
  );
  assert.equal(
    describeDemoPortfolio(worldPortfolio),
    "iShares MSCI World ETF (URTH) 70 % · iShares Core MSCI Emerging Markets ETF (IEMG) 30 %"
  );
  assert.equal(describeDemoPortfolio(undefined), "");
});

test("loadDemoPortfolios returns the list or the backend message", async () => {
  assert.deepEqual(await loadDemoPortfolios(async () => ({ portfolios: [worldPortfolio] })), {
    status: "loaded",
    portfolios: [worldPortfolio],
  });

  const failing = async () => {
    throw new ApiError(503, "UPSTREAM_UNAVAILABLE", "Kursdaten sind gerade nicht verfügbar.");
  };
  assert.deepEqual(await loadDemoPortfolios(failing), { status: "error", message: "Kursdaten sind gerade nicht verfügbar." });
  assert.deepEqual(await loadDemoPortfolios(async () => { throw new Error("x"); }), { status: "error", message: DEMO_MESSAGES.unexpected });
});

test("startDemoSimulation runs with the fixed parameters and returns the result", async () => {
  let call;
  const run = async (portfolioId, parameters) => {
    call = { portfolioId, parameters };
    return { portfolioId, timeline: [] };
  };

  const outcome = await startDemoSimulation("901", run);

  assert.deepEqual(call, { portfolioId: 901, parameters: { ...DEMO_PARAMETERS } });
  assert.equal(outcome.status, "done");
});

test("startDemoSimulation reports missing selection and backend errors", async () => {
  assert.deepEqual(await startDemoSimulation("", async () => ({})), {
    status: "error",
    message: "Bitte ein Beispielportfolio auswählen.",
  });

  const failing = async () => {
    throw new ApiError(422, "INSUFFICIENT_DATA", "Für folgende Anlagen liefert der Kursdatenanbieter keine Kurse: X.");
  };
  assert.deepEqual(await startDemoSimulation("900", failing), {
    status: "error",
    message: "Für folgende Anlagen liefert der Kursdatenanbieter keine Kurse: X.",
  });
});
