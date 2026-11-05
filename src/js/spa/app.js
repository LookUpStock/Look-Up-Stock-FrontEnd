import {
  apiErrorText,
  fetchPortfolio,
  fetchSavedSimulation,
  listPortfolios,
  listSavedSimulations,
  runSimulation,
} from "../api.js";
import { clearSession, readSession, renderAuthStatus } from "../auth.js";
import { renderFanChart } from "../chart.js";
import { startSimulation, summarizeSimulation, validateSimulationInput } from "../simulation.js";
import { describeOpenedSimulation, formatSavedSimulationDetails } from "../saved-simulations.js";
import { formatPositionCount } from "../portfolio-save.js";
import { createHashRouter } from "./router.js";

const root = document.getElementById("route-view");
let session = readSession();
let renderVersion = 0;

renderAuthStatus(document.getElementById("auth-status"), session);

function node(tagName, text = "", className = "") {
  const element = document.createElement(tagName);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function link(href, text, className = "") {
  const element = node("a", text, className);
  element.href = href;
  return element;
}

function createPage(title, version) {
  const section = node("section", "", "card spa-page");
  const heading = node("h1", title);
  heading.tabIndex = -1;
  section.append(heading);
  root.replaceChildren(section);
  return { section, heading, isCurrent: () => version === renderVersion };
}

function showLoginPrompt(section, message = "Bitte melde dich an, um deine Portfolios und Simulationen zu sehen.") {
  const prompt = node("p", message, "auth-notice");
  prompt.append(" ", link("login.html", "Zur Anmeldung"));
  section.append(prompt);
}

function showApiError(section, error, version) {
  if (!section.isCurrent()) return;
  section.section.querySelector(".search-hint")?.remove();
  const message = apiErrorText(error) ?? "Ein unerwarteter Fehler ist aufgetreten.";
  const notice = node("p", message, "error-message");
  section.section.append(notice);
  if (error?.status === 401) {
    clearSession();
    session = readSession();
    renderAuthStatus(document.getElementById("auth-status"), session);
    showLoginPrompt(section.section, "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.");
  }
}

function appendBackLink(section, href, text) {
  section.append(link(href, text, "spa-back-link"));
}

function renderPortfolioList(section, portfolios) {
  if (portfolios.length === 0) {
    section.append(node("p", "Noch keine Portfolios gespeichert."));
    return;
  }

  const list = node("ul", "", "spa-list");
  for (const portfolio of portfolios) {
    const item = node("li", "", "spa-list-item");
    const title = link(`#/portfolios/${encodeURIComponent(portfolio.id)}`, portfolio.name);
    title.className = "saved-portfolio-name";
    const details = node("p", formatPositionCount(portfolio.positions?.length ?? 0), "saved-portfolio-details");
    item.append(title, details);
    list.append(item);
  }
  section.append(list);
}

async function showPortfolios(version) {
  const page = createPage("Deine Portfolios", version);
  if (session.status !== "valid") {
    showLoginPrompt(page.section, session.status === "expired"
      ? "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an."
      : undefined);
    return;
  }

  const loading = node("p", "Portfolios werden geladen …", "search-hint");
  page.section.append(loading);
  try {
    const data = await listPortfolios(session.token);
    if (!page.isCurrent()) return;
    loading.remove();
    renderPortfolioList(page.section, data?.portfolios ?? []);
  } catch (error) {
    showApiError(page, error, version);
  }
}

function renderPositionList(section, positions = []) {
  const heading = node("h2", "Positionen");
  section.append(heading);
  if (positions.length === 0) {
    section.append(node("p", "Dieses Portfolio enthält keine Positionen."));
    return;
  }
  const list = node("ul", "", "spa-list");
  for (const position of positions) {
    const item = node("li", "", "spa-list-item");
    const name = node("strong", `${position.symbol} · ${position.name}`);
    const weight = node("span", `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(position.weight))} %`);
    item.append(name, weight);
    list.append(item);
  }
  section.append(list);
}

function createSimulationForm(portfolioId, section) {
  const form = node("form", "", "simulation-form card spa-simulation-form");
  form.noValidate = true;
  form.append(node("h2", "Portfolio simulieren"));

  const fields = [
    ["startCapital", "Startkapital in €", "10000", "decimal"],
    ["monthlyContribution", "Monatliche Sparrate in €", "200", "decimal"],
    ["horizonYears", "Anlagehorizont in Jahren (1–40)", "20", "numeric"],
    ["paths", "Simulationspfade (1.000–50.000)", "10000", "numeric"],
    ["seed", "Seed (optional)", "", "numeric"],
    ["targetAmount", "Zielbetrag in € (optional)", "", "decimal"],
  ];
  const inputs = {};
  const grid = node("div", "", "simulation-grid");
  for (const [name, labelText, value, inputMode] of fields) {
    const group = node("div", "", "field-group");
    const label = node("label", labelText);
    const input = node("input");
    input.name = name;
    input.type = "text";
    input.inputMode = inputMode;
    input.autocomplete = "off";
    input.value = value;
    label.htmlFor = `spa-${name}`;
    input.id = `spa-${name}`;
    if (name !== "seed" && name !== "targetAmount") input.required = true;
    const error = node("p", "", "field-error");
    error.id = `spa-${name}-error`;
    error.setAttribute("aria-live", "polite");
    group.append(label, input, error);
    grid.append(group);
    inputs[name] = { input, error };
  }
  form.append(grid);
  const status = node("p", "", "summary-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const actions = node("div", "", "action-row");
  const submit = node("button", "Simulation starten");
  submit.type = "submit";
  actions.append(submit);
  form.append(actions, status);

  const resultPanel = node("section", "", "spa-result");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resultPanel.replaceChildren();
    status.textContent = "";
    const input = Object.fromEntries(Object.entries(inputs).map(([name, field]) => [name, field.input.value]));
    input.portfolioId = String(portfolioId);
    const validation = validateSimulationInput(input);
    for (const [name, field] of Object.entries(inputs)) {
      const message = validation.errors[name] ?? "";
      field.error.textContent = message;
      field.input.setAttribute("aria-invalid", message ? "true" : "false");
    }
    if (!validation.valid) return;

    submit.disabled = true;
    status.textContent = "Simulation läuft …";
    const outcome = await startSimulation(input, session.token, runSimulation);
    submit.disabled = false;
    if (outcome.status === "invalid") {
      for (const [name, message] of Object.entries(outcome.errors)) {
        if (inputs[name]) {
          inputs[name].error.textContent = message;
          inputs[name].input.setAttribute("aria-invalid", "true");
        }
      }
      status.textContent = "";
      return;
    }
    if (outcome.status === "unauthorized") {
      clearSession();
      session = readSession();
      renderAuthStatus(document.getElementById("auth-status"), session);
      showLoginPrompt(section, "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.");
      status.textContent = "";
      return;
    }
    if (outcome.status === "error") {
      status.textContent = outcome.message;
      status.classList.add("summary-status-invalid");
      return;
    }
    status.textContent = "";
    renderSimulationResult(resultPanel, outcome.result);
  });

  section.append(form, resultPanel);
}

function renderSimulationResult(container, result) {
  const section = node("section", "", "card");
  section.append(node("h2", "Mögliche Wertverläufe"));
  const chart = node("div", "", "fan-chart-container");
  renderFanChart(chart, result.timeline);
  section.append(chart);

  const summary = summarizeSimulation(result);
  const definitionList = node("dl", "", "simulation-summary");
  for (const [label, value] of summary.rows) {
    const pair = node("div");
    pair.append(node("dt", label), node("dd", value));
    definitionList.append(pair);
  }
  section.append(definitionList, node("p", summary.note, "search-hint"));
  section.append(node("p", "Wechselkursschwankungen werden nicht berücksichtigt.", "search-hint"));
  section.append(node("p", "Die Werte sind nominal und berücksichtigen keine Kosten, Steuern und Inflation. Keine Anlageberatung.", "search-hint"));
  container.replaceChildren(section);
}

async function showPortfolio(version, id) {
  const page = createPage("Portfolio", version);
  if (session.status !== "valid") {
    showLoginPrompt(page.section, session.status === "expired"
      ? "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an."
      : undefined);
    return;
  }
  page.section.append(node("p", "Portfolio wird geladen …", "search-hint"));
  try {
    const portfolio = await fetchPortfolio(session.token, id);
    if (!page.isCurrent()) return;
    document.title = `${portfolio.name} – LookUpStock (SPA)`;
    const content = createPage(portfolio.name, version);
    appendBackLink(content.section, "#/portfolios", "Zur Portfolioliste");
    renderPositionList(content.section, portfolio.positions);
    createSimulationForm(portfolio.id, content.section);
  } catch (error) {
    showApiError(page, error, version);
  }
}

async function showSimulations(version) {
  const page = createPage("Gespeicherte Simulationen", version);
  if (session.status !== "valid") {
    showLoginPrompt(page.section, session.status === "expired"
      ? "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an."
      : undefined);
    return;
  }
  page.section.append(node("p", "Simulationen werden geladen …", "search-hint"));
  try {
    const data = await listSavedSimulations(session.token);
    if (!page.isCurrent()) return;
    const content = createPage("Gespeicherte Simulationen", version);
    const simulations = data?.simulations ?? [];
    if (simulations.length === 0) {
      content.section.append(node("p", "Noch keine Simulation gespeichert."));
      return;
    }
    const list = node("ul", "", "spa-list");
    for (const simulation of simulations) {
      const item = node("li", "", "spa-list-item");
      const title = link(`#/simulations/${encodeURIComponent(simulation.id)}`, simulation.name);
      title.className = "saved-portfolio-name";
      const details = node("p", formatSavedSimulationDetails(simulation), "saved-portfolio-details");
      item.append(title, details);
      list.append(item);
    }
    content.section.append(list);
  } catch (error) {
    showApiError(page, error, version);
  }
}

async function showSimulation(version, id) {
  const page = createPage("Gespeicherte Simulation", version);
  if (session.status !== "valid") {
    showLoginPrompt(page.section, session.status === "expired"
      ? "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an."
      : undefined);
    return;
  }
  page.section.append(node("p", "Simulation wird geladen …", "search-hint"));
  try {
    const simulation = await fetchSavedSimulation(session.token, id);
    if (!page.isCurrent()) return;
    document.title = `${simulation.name} – LookUpStock (SPA)`;
    const content = createPage(simulation.name || "Gespeicherte Simulation", version);
    appendBackLink(content.section, "#/simulations", "Zur Simulationsliste");
    content.section.append(node("p", describeOpenedSimulation(simulation), "simulation-opened-info"));
    renderSimulationResult(content.section, simulation);
  } catch (error) {
    showApiError(page, error, version);
  }
}

async function renderRoute(route) {
  const version = ++renderVersion;
  switch (route.name) {
    case "portfolios":
      return showPortfolios(version);
    case "portfolio":
      return showPortfolio(version, route.params.id);
    case "simulations":
      return showSimulations(version);
    case "simulation":
      return showSimulation(version, route.params.id);
    default: {
      const page = createPage("Seite nicht gefunden", version);
      page.section.append(node("p", "Diese Ansicht gibt es nicht."));
      appendBackLink(page.section, "#/portfolios", "Zu den Portfolios");
    }
  }
}

createHashRouter({ render: renderRoute }).start();
