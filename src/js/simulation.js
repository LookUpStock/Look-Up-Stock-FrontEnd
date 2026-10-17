// KI-Log Nr. [eintragen]: Eingabemaske der Simulation mit KI erstellt, vom Team zu prüfen (FE #3, US-04)

import { runSimulation, ApiError } from "./api.js";
import { clearSession, getToken, isUnauthorized, loginPageUrl, REASONS, MESSAGES as AUTH_MESSAGES } from "./auth.js";
import { loadSavedPortfolios } from "./portfolio-save.js";
import { formatEuro, renderFanChart } from "./chart.js";

// Grenzwerte und Standardwerte laut API-Design (wie SimulationParameters im Backend)
export const LIMITS = { minHorizon: 1, maxHorizon: 40, minPaths: 1000, maxPaths: 50000 };
export const DEFAULTS = { startCapital: "10000", monthlyContribution: "200", horizonYears: "20", paths: "10000", seed: "" };

// Texte wie im Backend, damit dieselbe Eingabe dieselbe Meldung ergibt
export const MESSAGES = {
  portfolioRequired: "Bitte ein Portfolio auswählen.",
  amountInvalid: "Bitte einen Betrag ab 0 eingeben.",
  bothZero: "Startkapital und Sparrate dürfen nicht beide 0 sein.",
  horizonInvalid: "Der Anlagehorizont muss eine ganze Zahl von 1 bis 40 Jahren sein.",
  pathsInvalid: "Die Anzahl der Simulationspfade muss zwischen 1.000 und 50.000 liegen.",
  seedInvalid: "Der Seed muss eine ganze Zahl sein.",
  loadingPortfolios: "Portfolios werden geladen …",
  noPortfolios: "Noch kein Portfolio gespeichert. Lege zuerst eines an:",
  running: "Simulation läuft …",
  unexpected: "Ein unerwarteter Fehler ist aufgetreten.",
};

// ===== Logik: ohne Browser testbar =====

// Zahl aus einem Eingabefeld; Komma als Dezimaltrennzeichen erlaubt, leer = NaN
export function parseNumberInput(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  return text === "" ? Number.NaN : Number(text);
}

// Prüft die Eingaben vor dem Absenden.
// Ergebnis: { valid, errors: { feld: Meldung }, portfolioId, parameters }
export function validateSimulationInput(input) {
  const errors = {};
  const portfolioId = Number(input.portfolioId);
  const startCapital = parseNumberInput(input.startCapital);
  const monthlyContribution = parseNumberInput(input.monthlyContribution);
  const horizonYears = parseNumberInput(input.horizonYears);
  const paths = parseNumberInput(input.paths);
  const seedText = String(input.seed ?? "").trim();
  const seed = seedText === "" ? null : Number(seedText);

  if (!input.portfolioId || !Number.isInteger(portfolioId)) {
    errors.portfolioId = MESSAGES.portfolioRequired;
  }
  if (!Number.isFinite(startCapital) || startCapital < 0) {
    errors.startCapital = MESSAGES.amountInvalid;
  }
  if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0) {
    errors.monthlyContribution = MESSAGES.amountInvalid;
  }
  if (!errors.startCapital && !errors.monthlyContribution && startCapital === 0 && monthlyContribution === 0) {
    errors.startCapital = MESSAGES.bothZero;
    errors.monthlyContribution = MESSAGES.bothZero;
  }
  if (!Number.isInteger(horizonYears) || horizonYears < LIMITS.minHorizon || horizonYears > LIMITS.maxHorizon) {
    errors.horizonYears = MESSAGES.horizonInvalid;
  }
  if (!Number.isInteger(paths) || paths < LIMITS.minPaths || paths > LIMITS.maxPaths) {
    errors.paths = MESSAGES.pathsInvalid;
  }
  if (seed !== null && !Number.isSafeInteger(seed)) {
    errors.seed = MESSAGES.seedInvalid;
  }

  const parameters = { startCapital, monthlyContribution, horizonYears, paths };
  // Ohne Seed wählt das Backend selbst einen und gibt ihn in der Antwort zurück
  if (seed !== null) {
    parameters.seed = seed;
  }

  return { valid: Object.keys(errors).length === 0, errors, portfolioId, parameters };
}

// Meldung vom Backend samt Details; bei 422 INSUFFICIENT_DATA mit dem Namen der Anlage
export function simulationErrorMessage(error) {
  if (!(error instanceof ApiError)) {
    return MESSAGES.unexpected;
  }
  const details = error.details
    .filter((detail) => detail?.message)
    .map((detail) => (detail.name ? `${detail.name}: ${detail.message}` : detail.message));
  return [error.message, ...details].join(" ");
}

// Simulation prüfen und starten.
// Ergebnis: { status: "done", result } | { status: "invalid", errors } | { status: "unauthorized" } | { status: "error", message }
export async function startSimulation(input, token, run = runSimulation) {
  const check = validateSimulationInput(input);
  if (!check.valid) {
    return { status: "invalid", errors: check.errors };
  }
  if (!token) {
    return { status: "unauthorized" };
  }
  try {
    const result = await run(token, check.portfolioId, check.parameters);
    return { status: "done", result };
  } catch (error) {
    if (isUnauthorized(error)) {
      return { status: "unauthorized" };
    }
    return { status: "error", message: simulationErrorMessage(error) };
  }
}

// Kennzahlen unter dem Diagramm: Endwerte, eingezahlter Betrag und Datengrundlage
export function summarizeSimulation(result) {
  const last = result.timeline[result.timeline.length - 1];
  const { startCapital, monthlyContribution, horizonYears, seed } = result.parameters;
  const rows = [
    ["Eingezahlt", formatEuro(startCapital + monthlyContribution * horizonYears * 12)],
    ["Ungünstiger Verlauf (p5)", formatEuro(last.p5)],
    ["Mittlerer Verlauf (p50)", formatEuro(last.p50)],
    ["Günstiger Verlauf (p95)", formatEuro(last.p95)],
  ];

  const from = result.estimates?.historyFrom;
  const to = result.estimates?.historyTo;
  const notes = [`${result.parameters.paths.toLocaleString("de-DE")} Pfade`, `Seed ${seed}`];
  if (from && to) {
    notes.push(`Kursdaten ${formatDate(from)} bis ${formatDate(to)}`);
  }
  notes.push(`Rechenzeit ${result.runtimeMs} ms`);

  return { rows, note: notes.join(" · ") };
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

// ===== Anzeige: verbindet die Logik mit der Seite =====

const FIELDS = ["portfolioId", "startCapital", "monthlyContribution", "horizonYears", "paths", "seed"];

export function initSimulationPage(root = document) {
  const form = root.getElementById("simulation-form");
  if (!form) {
    return;
  }

  const select = root.getElementById("simulation-portfolio");
  const portfolioHint = root.getElementById("simulation-portfolio-hint");
  const statusElement = root.getElementById("simulation-status");
  const resultSection = root.getElementById("simulation-result");
  const chartContainer = root.getElementById("simulation-chart");
  const summaryElement = root.getElementById("simulation-summary");
  const noteElement = root.getElementById("simulation-note");
  const submitButton = form.querySelector("button[type=submit]");

  const inputs = Object.fromEntries(FIELDS.map((field) => [field, form.elements[field]]));
  for (const [field, value] of Object.entries(DEFAULTS)) {
    inputs[field].value = value;
  }

  function redirectToLogin() {
    clearSession();
    window.location.assign(loginPageUrl(REASONS.expired, "index.html"));
  }

  function showErrors(errors = {}) {
    for (const field of FIELDS) {
      const errorElement = root.getElementById(`simulation-${field}-error`);
      errorElement.textContent = errors[field] ?? "";
      inputs[field].setAttribute("aria-invalid", errors[field] ? "true" : "false");
    }
  }

  function setStatus(text, isError = false) {
    statusElement.textContent = text;
    statusElement.classList.toggle("summary-status-invalid", isError);
  }

  async function loadPortfolios() {
    const token = getToken();
    if (!token) {
      return;
    }
    portfolioHint.textContent = MESSAGES.loadingPortfolios;
    const result = await loadSavedPortfolios(token);

    if (result.status === "unauthorized") {
      portfolioHint.textContent = AUTH_MESSAGES.expired;
      return;
    }
    if (result.status === "error") {
      portfolioHint.textContent = result.message;
      return;
    }

    // Die Auswahl verwendet die Backend-ID, die der Simulations-Endpunkt erwartet.
    for (const saved of result.portfolios) {
      const option = root.createElement("option");
      option.value = String(saved.id);
      option.textContent = saved.name;
      select.append(option);
    }

    if (result.portfolios.length === 0) {
      const link = root.createElement("a");
      link.href = "portfolio.html";
      link.textContent = "Zu den Portfolios";
      portfolioHint.replaceChildren(`${MESSAGES.noPortfolios} `, link);
      submitButton.disabled = true;
      return;
    }
    portfolioHint.textContent = "";
  }

  function renderSummary(result) {
    const summary = summarizeSimulation(result);
    summaryElement.replaceChildren();
    for (const [label, value] of summary.rows) {
      const term = root.createElement("dt");
      term.textContent = label;
      const definition = root.createElement("dd");
      definition.textContent = value;
      const pair = root.createElement("div");
      pair.append(term, definition);
      summaryElement.append(pair);
    }
    noteElement.textContent = summary.note;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = Object.fromEntries(FIELDS.map((field) => [field, inputs[field].value]));

    showErrors();
    submitButton.disabled = true;
    setStatus(MESSAGES.running);
    const outcome = await startSimulation(input, getToken());
    submitButton.disabled = false;

    if (outcome.status === "invalid") {
      setStatus("");
      showErrors(outcome.errors);
      return;
    }
    if (outcome.status === "unauthorized") {
      redirectToLogin();
      return;
    }
    if (outcome.status === "error") {
      setStatus(outcome.message, true);
      return;
    }

    setStatus("");
    resultSection.hidden = false;
    renderFanChart(chartContainer, outcome.result.timeline);
    renderSummary(outcome.result);
  });

  loadPortfolios();
}
