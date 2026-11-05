import { runSimulation, apiErrorText } from "./api.js";
import { clearSession, getToken, isUnauthorized, loginPageUrl, REASONS, MESSAGES as AUTH_MESSAGES } from "./auth.js";
import { loadSavedPortfolios } from "./portfolio-save.js";
import { formatEuro, renderFanChart } from "./chart.js";
import { initSavedSimulations } from "./saved-simulations.js";

export const LIMITS = { minHorizon: 1, maxHorizon: 40, minPaths: 1000, maxPaths: 50000 };
export const DEFAULTS = { startCapital: "10000", monthlyContribution: "200", horizonYears: "20", paths: "10000", seed: "", targetAmount: "" };

export const MESSAGES = {
  portfolioRequired: "Bitte ein Portfolio auswählen.",
  amountInvalid: "Bitte einen Betrag ab 0 eingeben.",
  bothZero: "Startkapital und Sparrate dürfen nicht beide 0 sein.",
  horizonInvalid: "Der Anlagehorizont muss eine ganze Zahl von 1 bis 40 Jahren sein.",
  pathsInvalid: "Die Anzahl der Simulationspfade muss zwischen 1.000 und 50.000 liegen.",
  seedInvalid: "Der Seed muss eine ganze Zahl sein.",
  targetInvalid: "Der Zielbetrag muss größer als 0 sein.",
  loadingPortfolios: "Portfolios werden geladen …",
  noPortfolios: "Noch kein Portfolio gespeichert. Lege zuerst eines an:",
  running: "Simulation läuft …",
  unexpected: "Ein unerwarteter Fehler ist aufgetreten.",
};

export function parseNumberInput(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  return text === "" ? Number.NaN : Number(text);
}

export function parseTargetAmount(text) {
  if (String(text ?? "").trim() === "") {
    return { value: null };
  }
  const value = parseNumberInput(text);
  if (!Number.isFinite(value) || value <= 0) {
    return { value: null, error: MESSAGES.targetInvalid };
  }
  return { value };
}

export function targetProbabilityRow(metrics, targetAmount) {
  const probability = metrics?.targetProbability;
  if (targetAmount == null || !Number.isFinite(probability)) {
    return null;
  }
  return [`Zielwahrscheinlichkeit (${formatEuro(targetAmount)})`, formatPercent(probability)];
}

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
  const target = parseTargetAmount(input.targetAmount);
  if (target.error) {
    errors.targetAmount = target.error;
  }

  const parameters = { startCapital, monthlyContribution, horizonYears, paths };
  // Without a seed the backend picks one and returns it.
  if (seed !== null) {
    parameters.seed = seed;
  }
  if (target.value !== null) {
    parameters.targetAmount = target.value;
  }

  return { valid: Object.keys(errors).length === 0, errors, portfolioId, parameters };
}

export function simulationErrorMessage(error) {
  return apiErrorText(error) ?? MESSAGES.unexpected;
}

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

// After an error the previous result is hidden so it does not appear to belong to the invalid input.
export function isResultVisibleAfter(status) {
  return status === "done";
}

export function showStatus(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("summary-status-invalid", isError);
}

export function summarizeSimulation(result) {
  const last = result.timeline[result.timeline.length - 1];
  const { startCapital, monthlyContribution, horizonYears, seed } = result.parameters;
  const totalContributions = result.metrics?.totalContributions
    ?? startCapital + monthlyContribution * horizonYears * 12;
  const rows = [
    ["Eingezahlt", formatEuro(totalContributions)],
    ["Ungünstiger Endwert (p5)", formatEuro(result.metrics?.p5EndValue ?? last.p5)],
    ["Median-Endwert", formatEuro(result.metrics?.medianEndValue ?? last.p50)],
    ["Günstiger Endwert (p95)", formatEuro(result.metrics?.p95EndValue ?? last.p95)],
    ["Value at Risk (95 %)", formatEuro(result.metrics?.valueAtRisk95 ?? Math.max(0, totalContributions - last.p5))],
    ["Maximaler Drawdown (Median)", formatPercent(result.metrics?.maxDrawdownMedian)],
  ];
  const targetRow = targetProbabilityRow(result.metrics, result.parameters.targetAmount);
  if (targetRow) {
    rows.push(targetRow);
  }

  const from = result.estimates?.historyFrom;
  const to = result.estimates?.historyTo;
  const notes = [`${result.parameters.paths.toLocaleString("de-DE")} Pfade`, `Seed ${seed}`];
  if (from && to) {
    notes.push(`Kursdaten ${formatDate(from)} bis ${formatDate(to)}`);
  }
  notes.push(`Rechenzeit ${result.runtimeMs} ms`);

  return { rows, note: notes.join(" · ") };
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 2 }).format(value);
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

const FIELDS = ["portfolioId", "startCapital", "monthlyContribution", "horizonYears", "paths", "seed", "targetAmount"];

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

  const savedSimulations = initSavedSimulations(root, {
    getToken,
    onUnauthorized: redirectToLogin,
    onOpen: showSavedSimulation,
    confirm: (text) => window.confirm(text),
  });

  function showErrors(errors = {}) {
    for (const field of FIELDS) {
      const errorElement = root.getElementById(`simulation-${field}-error`);
      errorElement.textContent = errors[field] ?? "";
      inputs[field].setAttribute("aria-invalid", errors[field] ? "true" : "false");
    }
  }

  function setStatus(text, isError = false) {
    showStatus(statusElement, text, isError);
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
      savedSimulations.refresh();
      return;
    }

    for (const saved of result.portfolios) {
      const option = root.createElement("option");
      option.value = String(saved.id);
      option.textContent = saved.name;
      select.append(option);
    }

    savedSimulations.setPortfolioNames(new Map(result.portfolios.map((saved) => [saved.id, saved.name])));
    savedSimulations.refresh();

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

  function showResult(result) {
    resultSection.hidden = false;
    renderFanChart(chartContainer, result.timeline);
    renderSummary(result);
  }

  function showSavedSimulation(simulation) {
    const { startCapital, monthlyContribution, horizonYears, paths, seed, targetAmount } = simulation.parameters;
    inputs.portfolioId.value = String(simulation.portfolioId);
    inputs.startCapital.value = String(startCapital);
    inputs.monthlyContribution.value = String(monthlyContribution);
    inputs.horizonYears.value = String(horizonYears);
    inputs.paths.value = String(paths);
    inputs.seed.value = String(seed);
    inputs.targetAmount.value = targetAmount == null ? "" : String(targetAmount);
    showErrors();
    setStatus("");
    showResult(simulation);
    resultSection.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = Object.fromEntries(FIELDS.map((field) => [field, inputs[field].value]));

    showErrors();
    submitButton.disabled = true;
    setStatus(MESSAGES.running);
    const outcome = await startSimulation(input, getToken());
    submitButton.disabled = false;

    if (!isResultVisibleAfter(outcome.status)) {
      resultSection.hidden = true;
    }

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
    showResult(outcome.result);
    savedSimulations.offerSave(outcome.result);
  });

  loadPortfolios();
}
