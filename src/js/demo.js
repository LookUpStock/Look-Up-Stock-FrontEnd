import { fetchDemoPortfolios, runDemoSimulation, apiErrorText } from "./api.js";
import { renderFanChart, formatEuro } from "./chart.js";
import { summarizeSimulation } from "./simulation.js";

export const DEMO_PARAMETERS = Object.freeze({ startCapital: 5000, monthlyContribution: 100, horizonYears: 15, paths: 10000 });

export const DEMO_MESSAGES = {
  loading: "Beispielportfolios werden geladen …",
  noPortfolios: "Gerade sind keine Beispielportfolios verfügbar.",
  running: "Beispielsimulation läuft …",
  unexpected: "Die Beispielsimulation konnte nicht berechnet werden.",
};

export function describeDemoParameters(parameters = DEMO_PARAMETERS) {
  return [
    `Startkapital ${formatEuro(parameters.startCapital)}`,
    `Sparrate ${formatEuro(parameters.monthlyContribution)} pro Monat`,
    `${parameters.horizonYears} Jahre`,
    `${parameters.paths.toLocaleString("de-DE")} Pfade`,
  ].join(" · ");
}

export function describeDemoPortfolio(portfolio) {
  return (portfolio?.positions ?? [])
    .map((position) => `${position.name} (${position.symbol}) ${Number(position.weight).toLocaleString("de-DE")} %`)
    .join(" · ");
}

export async function loadDemoPortfolios(load = fetchDemoPortfolios) {
  try {
    const response = await load();
    return { status: "loaded", portfolios: response?.portfolios ?? [] };
  } catch (error) {
    return { status: "error", message: apiErrorText(error) ?? DEMO_MESSAGES.unexpected };
  }
}

export async function startDemoSimulation(portfolioId, run = runDemoSimulation) {
  const text = String(portfolioId ?? "").trim();
  const id = Number(text);
  if (text === "" || !Number.isInteger(id)) {
    return { status: "error", message: "Bitte ein Beispielportfolio auswählen." };
  }
  try {
    const result = await run(id, { ...DEMO_PARAMETERS });
    return { status: "done", result };
  } catch (error) {
    return { status: "error", message: apiErrorText(error) ?? DEMO_MESSAGES.unexpected };
  }
}

export function initDemoPage(root = document) {
  const section = root.getElementById("demo-simulation");
  if (!section) {
    return;
  }
  section.hidden = false;

  const form = root.getElementById("demo-form");
  const select = root.getElementById("demo-portfolio");
  const composition = root.getElementById("demo-portfolio-composition");
  const statusElement = root.getElementById("demo-status");
  const resultElement = root.getElementById("demo-result");
  const chartContainer = root.getElementById("demo-chart");
  const summaryElement = root.getElementById("demo-summary");
  const noteElement = root.getElementById("demo-note");
  const submitButton = form.querySelector("button[type=submit]");
  let portfolios = [];

  root.getElementById("demo-parameters").textContent = describeDemoParameters();

  function setStatus(text, isError = false) {
    statusElement.textContent = text;
    statusElement.classList.toggle("summary-status-invalid", isError);
  }

  function showComposition() {
    const selected = portfolios.find((portfolio) => String(portfolio.id) === select.value);
    composition.textContent = selected ? describeDemoPortfolio(selected) : "";
  }

  function showResult(result) {
    const summary = summarizeSimulation(result);
    renderFanChart(chartContainer, result.timeline);
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
    resultElement.hidden = false;
  }

  async function loadPortfolios() {
    setStatus(DEMO_MESSAGES.loading);
    submitButton.disabled = true;
    const outcome = await loadDemoPortfolios();
    if (outcome.status === "error") {
      setStatus(outcome.message, true);
      return;
    }
    portfolios = outcome.portfolios;
    if (portfolios.length === 0) {
      setStatus(DEMO_MESSAGES.noPortfolios, true);
      return;
    }
    for (const portfolio of portfolios) {
      const option = root.createElement("option");
      option.value = String(portfolio.id);
      option.textContent = portfolio.name;
      select.append(option);
    }
    select.value = String(portfolios[0].id);
    showComposition();
    setStatus("");
    submitButton.disabled = false;
  }

  select.addEventListener("change", showComposition);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    setStatus(DEMO_MESSAGES.running);
    const outcome = await startDemoSimulation(select.value);
    submitButton.disabled = false;
    if (outcome.status === "error") {
      setStatus(outcome.message, true);
      return;
    }
    setStatus("");
    showResult(outcome.result);
  });

  loadPortfolios();
}
