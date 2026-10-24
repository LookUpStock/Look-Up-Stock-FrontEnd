// KI-Log ME-40: Tests zum Speichern und Aufrufen von Simulationen mit KI erstellt, von Mert Eminel geprüft (FE #17, US-08)

import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  API_BASE_URL,
  deleteSavedSimulation,
  fetchSavedSimulation,
  listSavedSimulations,
  saveSimulation,
} from "../src/js/api.js";
import {
  MESSAGES,
  buildSaveParameters,
  confirmDeleteMessage,
  describeOpenedSimulation,
  formatSavedSimulationDetails,
  loadSavedSimulations,
  openSavedSimulation,
  removeSavedSimulation,
  saveCurrentSimulation,
  savedMessage,
  validateSimulationName,
} from "../src/js/saved-simulations.js";

afterEach(() => {
  mock.restoreAll();
});

// Antwort von POST /simulations ohne save, wie sie auf der Seite angezeigt wird
const result = {
  id: null,
  name: null,
  portfolioId: 4,
  parameters: { startCapital: 10000, monthlyContribution: 200, horizonYears: 20, paths: 10000, seed: 42, targetAmount: null },
  timeline: [{ month: 0, p5: 10000, p50: 10000, p95: 10000 }],
  runtimeMs: 85,
};

// ===== API (Format laut API-Design) =====

test("saveSimulation posts parameters with save true and name", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("{}", { status: 201 }));

  await saveSimulation("abc", 4, { startCapital: 10000, seed: 42 }, "Sparplan");

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/simulations`);
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer abc");
  assert.deepEqual(JSON.parse(options.body), {
    portfolioId: 4,
    parameters: { startCapital: 10000, seed: 42 },
    save: true,
    name: "Sparplan",
  });
});

test("listSavedSimulations loads /simulations with GET and the token header", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response('{"simulations":[]}', { status: 200 }));

  const data = await listSavedSimulations("abc");

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/simulations`);
  assert.equal(options.method, "GET");
  assert.equal(options.headers.Authorization, "Bearer abc");
  assert.equal(options.body, undefined);
  assert.deepEqual(data, { simulations: [] });
});

test("fetchSavedSimulation loads /simulations/{id} with GET and the token header", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("{}", { status: 200 }));

  await fetchSavedSimulation("abc", 17);

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/simulations/17`);
  assert.equal(options.method, "GET");
  assert.equal(options.headers.Authorization, "Bearer abc");
  assert.equal(options.body, undefined);
});

test("deleteSavedSimulation sends DELETE with the token header and accepts 204", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));

  const data = await deleteSavedSimulation("abc", 17);

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/simulations/17`);
  assert.equal(options.method, "DELETE");
  assert.equal(options.headers.Authorization, "Bearer abc");
  assert.equal(options.body, undefined);
  assert.equal(data, null);
});

// ===== Name (E32: Pflicht, höchstens 100 Zeichen) =====

test("validateSimulationName rejects empty and whitespace-only names", () => {
  assert.deepEqual(validateSimulationName(""), { valid: false, name: "", error: MESSAGES.nameInvalid });
  assert.equal(validateSimulationName("   ").valid, false);
  assert.equal(validateSimulationName(undefined).valid, false);
});

test("validateSimulationName accepts 100 characters and rejects 101", () => {
  assert.equal(validateSimulationName("a".repeat(100)).valid, true);
  assert.equal(validateSimulationName("a".repeat(101)).error, MESSAGES.nameInvalid);
});

test("validateSimulationName trims the name before checking the length", () => {
  const check = validateSimulationName(`  ${"a".repeat(100)}  `);
  assert.equal(check.valid, true);
  assert.equal(check.name.length, 100);
});

// ===== Parameter für das Speichern =====

test("buildSaveParameters keeps the seed of the shown simulation and omits a missing target amount", () => {
  assert.deepEqual(buildSaveParameters(result), {
    startCapital: 10000,
    monthlyContribution: 200,
    horizonYears: 20,
    paths: 10000,
    seed: 42,
  });
});

test("buildSaveParameters includes a target amount when it is set", () => {
  const withTarget = { ...result, parameters: { ...result.parameters, targetAmount: 100000 } };
  assert.equal(buildSaveParameters(withTarget).targetAmount, 100000);
});

// ===== Ablauf =====

test("saveCurrentSimulation does not call the backend for an invalid name", async () => {
  const save = mock.fn();

  const outcome = await saveCurrentSimulation(result, " ", "abc", save);

  assert.deepEqual(outcome, { status: "invalid", error: MESSAGES.nameInvalid });
  assert.equal(save.mock.callCount(), 0);
});

test("saveCurrentSimulation sends portfolio, parameters with seed and trimmed name", async () => {
  const save = mock.fn(async () => ({ id: 9, name: "Sparplan" }));

  const outcome = await saveCurrentSimulation(result, "  Sparplan ", "abc", save);

  assert.deepEqual(outcome, { status: "saved", simulation: { id: 9, name: "Sparplan" } });
  const [token, portfolioId, parameters, name] = save.mock.calls[0].arguments;
  assert.equal(token, "abc");
  assert.equal(portfolioId, 4);
  assert.equal(parameters.seed, 42);
  assert.equal(name, "Sparplan");
});

test("saveCurrentSimulation reports unauthorized without token and on 401", async () => {
  assert.deepEqual(await saveCurrentSimulation(result, "Sparplan", null, mock.fn()), { status: "unauthorized" });

  const save = async () => {
    throw new ApiError(401, "UNAUTHORIZED", "Bitte melde dich an.");
  };
  assert.deepEqual(await saveCurrentSimulation(result, "Sparplan", "abc", save), { status: "unauthorized" });
});

test("saveCurrentSimulation shows the backend message with details", async () => {
  const save = async () => {
    throw new ApiError(400, "VALIDATION_ERROR", MESSAGES.nameInvalid, [{ field: "name", message: MESSAGES.nameInvalid }]);
  };

  const outcome = await saveCurrentSimulation(result, "Sparplan", "abc", save);

  assert.equal(outcome.status, "error");
  assert.equal(outcome.message, `${MESSAGES.nameInvalid} ${MESSAGES.nameInvalid}`);
});

test("loadSavedSimulations returns the list in backend order", async () => {
  const list = async () => ({ simulations: [{ id: 2, name: "Neu" }, { id: 1, name: "Alt" }] });

  const outcome = await loadSavedSimulations("abc", list);

  assert.equal(outcome.status, "loaded");
  assert.deepEqual(outcome.simulations.map((s) => s.name), ["Neu", "Alt"]);
});

test("loadSavedSimulations treats a missing list as empty", async () => {
  const outcome = await loadSavedSimulations("abc", async () => ({}));
  assert.deepEqual(outcome, { status: "loaded", simulations: [] });
});

test("openSavedSimulation returns the stored result without recalculation", async () => {
  const stored = { ...result, id: 9, name: "Sparplan", createdAt: "2026-10-18T14:20:00Z" };
  const details = mock.fn(async () => stored);

  const outcome = await openSavedSimulation(9, "abc", details);

  assert.deepEqual(outcome, { status: "opened", simulation: stored });
  assert.deepEqual(details.mock.calls[0].arguments, ["abc", 9]);
});

test("removeSavedSimulation reports 404 for a foreign or unknown simulation", async () => {
  const remove = async () => {
    throw new ApiError(404, "NOT_FOUND", "Simulation nicht gefunden.");
  };

  const outcome = await removeSavedSimulation(9, "abc", remove);

  assert.deepEqual(outcome, { status: "error", message: "Simulation nicht gefunden." });
});

test("removeSavedSimulation reports deleted after 204", async () => {
  const remove = mock.fn(async () => null);
  assert.deepEqual(await removeSavedSimulation(9, "abc", remove), { status: "deleted" });
  assert.deepEqual(remove.mock.calls[0].arguments, ["abc", 9]);
});

// ===== Anzeige-Texte =====

test("formatSavedSimulationDetails shows portfolio name and save time", () => {
  const entry = { id: 9, name: "Sparplan", portfolioId: 4, createdAt: "2026-10-18T14:20:00Z" };
  const text = formatSavedSimulationDetails(entry, new Map([[4, "Weltportfolio"]]));

  assert.match(text, /^Weltportfolio · gespeichert am 18\.10\.2026, \d{2}:20$/);
});

test("formatSavedSimulationDetails falls back to the portfolio id", () => {
  const text = formatSavedSimulationDetails({ portfolioId: 4, createdAt: "kein Datum" });
  assert.equal(text, "Portfolio 4");
});

test("describeOpenedSimulation names the simulation and its parameters", () => {
  const text = describeOpenedSimulation({ ...result, name: "Sparplan", createdAt: null });

  assert.ok(text.startsWith("Gespeicherte Simulation „Sparplan“: Startkapital"));
  assert.ok(text.includes("Anlagehorizont 20 Jahre"));
  assert.ok(text.endsWith("Ergebnis ohne Neuberechnung."));
});

test("messages for saving and deleting name the simulation", () => {
  assert.equal(savedMessage("Sparplan"), "Simulation als „Sparplan“ gespeichert.");
  assert.equal(confirmDeleteMessage("Sparplan"), "Gespeicherte Simulation „Sparplan“ wirklich löschen?");
});
