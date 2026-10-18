// KI-Log ME-40: Speichern und Aufrufen von Simulationen mit KI erstellt, von Mert Eminel geprüft (FE #17, US-08)

import {
  ApiError,
  deleteSavedSimulation,
  fetchSavedSimulation,
  listSavedSimulations,
  saveSimulation,
} from "./api.js";
import { isUnauthorized } from "./auth.js";
import { formatEuro } from "./chart.js";

// Name wie beim Portfolio höchstens 100 Zeichen (API-Design, E32)
export const MAX_NAME_LENGTH = 100;

// Texte wie im Backend bzw. in den Kurzformat-Tabellen Sprint 3 (US-08)
export const MESSAGES = {
  nameInvalid: "Bitte einen Namen mit höchstens 100 Zeichen eingeben.",
  saving: "Simulation wird gespeichert …",
  loading: "Gespeicherte Simulationen werden geladen …",
  empty: "Noch keine Simulation gespeichert.",
  deleted: "Gespeicherte Simulation gelöscht.",
  unexpected: "Ein unerwarteter Fehler ist aufgetreten.",
};

export function savedMessage(name) {
  return `Simulation als „${name}“ gespeichert.`;
}

export function confirmDeleteMessage(name) {
  return `Gespeicherte Simulation „${name}“ wirklich löschen?`;
}

// ===== Logik: ohne Browser testbar =====

// Prüft den Namen wie das Backend: getrimmt, nicht leer, höchstens 100 Zeichen.
// Ergebnis: { valid, name, error }
export function validateSimulationName(input) {
  const name = String(input ?? "").trim();
  if (name === "" || name.length > MAX_NAME_LENGTH) {
    return { valid: false, name, error: MESSAGES.nameInvalid };
  }
  return { valid: true, name, error: "" };
}

// Parameter der angezeigten Simulation für das Speichern, einschließlich ihres Seeds (E32, NF-08).
// targetAmount wird nur mitgeschickt, wenn er gesetzt ist.
export function buildSaveParameters(result) {
  const { startCapital, monthlyContribution, horizonYears, paths, seed, targetAmount } = result.parameters;
  const parameters = { startCapital, monthlyContribution, horizonYears, paths, seed };
  if (targetAmount != null) {
    parameters.targetAmount = targetAmount;
  }
  return parameters;
}

// Meldung vom Backend samt Details; sonst allgemeiner Text
export function errorMessageFrom(error) {
  if (!(error instanceof ApiError)) {
    return MESSAGES.unexpected;
  }
  const details = error.details.map((detail) => detail?.message).filter(Boolean);
  return [error.message, ...details].join(" ");
}

// Gemeinsame Fehlerbehandlung: 401 führt zur Anmeldung, alles andere wird als Meldung angezeigt
async function call(token, action) {
  if (!token) {
    return { status: "unauthorized" };
  }
  try {
    return await action();
  } catch (error) {
    if (isUnauthorized(error)) {
      return { status: "unauthorized" };
    }
    return { status: "error", message: errorMessageFrom(error) };
  }
}

// Angezeigte Simulation unter einem Namen speichern.
// Ergebnis: { status: "saved", simulation } | { status: "invalid", error } | { status: "unauthorized" } | { status: "error", message }
export async function saveCurrentSimulation(result, nameInput, token, save = saveSimulation) {
  const check = validateSimulationName(nameInput);
  if (!check.valid) {
    return { status: "invalid", error: check.error };
  }
  return call(token, async () => {
    const simulation = await save(token, result.portfolioId, buildSaveParameters(result), check.name);
    return { status: "saved", simulation };
  });
}

// Ergebnis: { status: "loaded", simulations } | { status: "unauthorized" } | { status: "error", message }
export async function loadSavedSimulations(token, list = listSavedSimulations) {
  return call(token, async () => {
    const data = await list(token);
    return { status: "loaded", simulations: data?.simulations ?? [] };
  });
}

// Ergebnis: { status: "opened", simulation } | { status: "unauthorized" } | { status: "error", message }
export async function openSavedSimulation(simulationId, token, details = fetchSavedSimulation) {
  return call(token, async () => {
    const simulation = await details(token, simulationId);
    return { status: "opened", simulation };
  });
}

// Ergebnis: { status: "deleted" } | { status: "unauthorized" } | { status: "error", message }
export async function removeSavedSimulation(simulationId, token, remove = deleteSavedSimulation) {
  return call(token, async () => {
    await remove(token, simulationId);
    return { status: "deleted" };
  });
}

// Datum und Uhrzeit des Speicherns, z. B. "18.10.2026, 16:20"
export function formatSavedAt(isoTimestamp) {
  const time = Date.parse(isoTimestamp);
  if (Number.isNaN(time)) {
    return "";
  }
  return new Date(time).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

// Zweite Zeile eines Listeneintrags: Portfolio und Speicherzeitpunkt (Akzeptanzkriterium US-08)
export function formatSavedSimulationDetails(entry, portfolioNames = new Map()) {
  const portfolio = portfolioNames.get(entry?.portfolioId) ?? `Portfolio ${entry?.portfolioId}`;
  const savedAt = formatSavedAt(entry?.createdAt);
  return savedAt ? `${portfolio} · gespeichert am ${savedAt}` : portfolio;
}

// Hinweis über dem Ergebnis einer geöffneten Simulation: Name, Speicherzeitpunkt und Parameter
export function describeOpenedSimulation(simulation) {
  const { startCapital, monthlyContribution, horizonYears } = simulation.parameters;
  const savedAt = formatSavedAt(simulation.createdAt);
  const head = savedAt
    ? `Gespeicherte Simulation „${simulation.name}“ vom ${savedAt}`
    : `Gespeicherte Simulation „${simulation.name}“`;
  return `${head}: Startkapital ${formatEuro(startCapital)}, Sparrate ${formatEuro(monthlyContribution)}, `
    + `Anlagehorizont ${horizonYears} ${horizonYears === 1 ? "Jahr" : "Jahre"}. Ergebnis ohne Neuberechnung.`;
}

// ===== Anzeige: verbindet die Logik mit der Seite =====

// deps: { getToken, onUnauthorized, onOpen(simulation), confirm(text) }
// Rückgabe: { offerSave(result), showOpened(simulation), setPortfolioNames(map), refresh() }
export function initSavedSimulations(root, deps) {
  const saveForm = root.getElementById("simulation-save-form");
  const nameInput = root.getElementById("simulation-save-name");
  const nameError = root.getElementById("simulation-save-name-error");
  const saveStatus = root.getElementById("simulation-save-status");
  const openedInfo = root.getElementById("simulation-opened-info");
  const listHint = root.getElementById("saved-simulations-hint");
  const listElement = root.getElementById("saved-simulations-list");
  const saveButton = saveForm.querySelector("button[type=submit]");

  let currentResult = null;
  let portfolioNames = new Map();

  function setText(element, text, isError = false) {
    element.textContent = text;
    element.classList.toggle("summary-status-invalid", isError);
  }

  function showNameError(text) {
    nameError.textContent = text;
    nameInput.setAttribute("aria-invalid", text ? "true" : "false");
  }

  // Nach einer neu berechneten Simulation: Speichern anbieten
  function offerSave(result) {
    currentResult = result;
    openedInfo.hidden = true;
    saveForm.hidden = false;
    nameInput.value = "";
    showNameError("");
    setText(saveStatus, "");
  }

  // Nach dem Öffnen einer gespeicherten Simulation: Hinweis statt Speichern
  function showOpened(simulation) {
    currentResult = null;
    saveForm.hidden = true;
    openedInfo.textContent = describeOpenedSimulation(simulation);
    openedInfo.hidden = false;
  }

  function renderList(simulations) {
    listElement.replaceChildren();
    for (const entry of simulations) {
      const item = root.createElement("li");
      item.className = "saved-portfolio";

      const text = root.createElement("div");
      const name = root.createElement("span");
      name.className = "saved-portfolio-name";
      name.textContent = entry.name;
      const details = root.createElement("span");
      details.className = "saved-portfolio-details";
      details.textContent = formatSavedSimulationDetails(entry, portfolioNames);
      text.append(name, details);

      const actions = root.createElement("div");
      actions.className = "saved-simulation-actions";
      const openButton = root.createElement("button");
      openButton.type = "button";
      openButton.textContent = "Öffnen";
      openButton.addEventListener("click", () => open(entry));
      const deleteButton = root.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button-danger";
      deleteButton.textContent = "Löschen";
      deleteButton.addEventListener("click", () => remove(entry));
      actions.append(openButton, deleteButton);

      item.append(text, actions);
      listElement.append(item);
    }
  }

  async function refresh() {
    setText(listHint, MESSAGES.loading);
    const outcome = await loadSavedSimulations(deps.getToken());
    if (outcome.status === "unauthorized") {
      deps.onUnauthorized();
      return false;
    }
    if (outcome.status === "error") {
      setText(listHint, outcome.message, true);
      return false;
    }
    renderList(outcome.simulations);
    setText(listHint, outcome.simulations.length === 0 ? MESSAGES.empty : "");
    return true;
  }

  async function open(entry) {
    const outcome = await openSavedSimulation(entry.id, deps.getToken());
    if (outcome.status === "unauthorized") {
      deps.onUnauthorized();
      return;
    }
    if (outcome.status === "error") {
      setText(listHint, outcome.message, true);
      return;
    }
    setText(listHint, "");
    deps.onOpen(outcome.simulation);
    showOpened(outcome.simulation);
  }

  async function remove(entry) {
    // Bestätigung vor dem Löschen, wie beim Portfolio (US-06, US-08)
    if (!deps.confirm(confirmDeleteMessage(entry.name))) {
      return;
    }
    const outcome = await removeSavedSimulation(entry.id, deps.getToken());
    if (outcome.status === "unauthorized") {
      deps.onUnauthorized();
      return;
    }
    if (outcome.status === "error") {
      setText(listHint, outcome.message, true);
      return;
    }
    // Bei leerer Liste bleibt der Hinweis „Noch keine Simulation gespeichert.“ stehen
    if (await refresh() && listElement.children.length > 0) {
      setText(listHint, MESSAGES.deleted);
    }
  }

  saveForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentResult) {
      return;
    }
    showNameError("");
    saveButton.disabled = true;
    setText(saveStatus, MESSAGES.saving);
    const outcome = await saveCurrentSimulation(currentResult, nameInput.value, deps.getToken());
    saveButton.disabled = false;

    if (outcome.status === "invalid") {
      setText(saveStatus, "");
      showNameError(outcome.error);
      return;
    }
    if (outcome.status === "unauthorized") {
      deps.onUnauthorized();
      return;
    }
    if (outcome.status === "error") {
      setText(saveStatus, outcome.message, true);
      return;
    }
    setText(saveStatus, savedMessage(outcome.simulation.name));
    nameInput.value = "";
    await refresh();
  });

  return {
    offerSave,
    showOpened,
    refresh,
    setPortfolioNames(map) {
      portfolioNames = map;
    },
  };
}
