// KI-Log ME-[Nr.]: Beispielsimulation für Gäste auf der Startseite mit KI erstellt, von Mert Eminel geprüft (FE #38, US-09)

import { fetchDemoPortfolios, runDemoSimulation, apiErrorText } from "./api.js";
import { renderFanChart, formatEuro } from "./chart.js";
import { summarizeSimulation } from "./simulation.js";

// Feste Parameter der Beispielsimulation (US-09, Beispiel aus dem API-Design „Gastmodus“).
// 10.000 Pfade sind die Obergrenze für Gäste; ohne Seed erzeugt das Backend einen und zeigt ihn an (NF-08).
export const DEMO_PARAMETERS = Object.freeze({ startCapital: 5000, monthlyContribution: 100, horizonYears: 15, paths: 10000 });

export const DEMO_MESSAGES = {
  loading: "Beispielportfolios werden geladen …",
  noPortfolios: "Gerade sind keine Beispielportfolios verfügbar.",
  running: "Beispielsimulation läuft …",
  unexpected: "Die Beispielsimulation konnte nicht berechnet werden.",
};

// ===== Logik: ohne Browser testbar =====

// Feste Parameter als Text, z. B. „Startkapital 5.000 € · Sparrate 100 € pro Monat · 15 Jahre · 10.000 Pfade“
export function describeDemoParameters(parameters = DEMO_PARAMETERS) {
  return [
    `Startkapital ${formatEuro(parameters.startCapital)}`,
    `Sparrate ${formatEuro(parameters.monthlyContribution)} pro Monat`,
    `${parameters.horizonYears} Jahre`,
    `${parameters.paths.toLocaleString("de-DE")} Pfade`,
  ].join(" · ");
}

// Zusammensetzung eines Beispielportfolios, z. B. „iShares MSCI World ETF (URTH) 70 % · …“
export function describeDemoPortfolio(portfolio) {
  return (portfolio?.positions ?? [])
    .map((position) => `${position.name} (${position.symbol}) ${Number(position.weight).toLocaleString("de-DE")} %`)
    .join(" · ");
}

// Beispielportfolios laden. Ergebnis: { status: "loaded", portfolios } | { status: "error", message }
export async function loadDemoPortfolios(load = fetchDemoPortfolios) {
  try {
    const response = await load();
    return { status: "loaded", portfolios: response?.portfolios ?? [] };
  } catch (error) {
    return { status: "error", message: apiErrorText(error) ?? DEMO_MESSAGES.unexpected };
  }
}

// Beispielsimulation mit den festen Parametern starten.
// Ergebnis: { status: "done", result } | { status: "error", message }
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

// ===== Anzeige: verbindet die Logik mit der Startseite =====

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
