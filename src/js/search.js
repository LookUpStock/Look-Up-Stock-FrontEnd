// KI-Log Nr. 19: Anlagensuche mit KI erstellt, von Mert Eminel geprüft (FE #1, US-02)

import { searchAssets, ApiError } from "./api.js";

// Akzeptanzkriterium US-02: Suche erst ab zwei Zeichen
export const MIN_QUERY_LENGTH = 2;

// Wartezeit nach dem letzten Tastendruck, damit nicht jeder Buchstabe eine Anfrage auslöst
export const SEARCH_DELAY_MS = 300;

// Texte laut Akzeptanzkriterien und API-Design (E10)
export const MESSAGES = {
  tooShort: "Bitte mindestens 2 Zeichen eingeben.",
  noResults: "Keine passende Anlage gefunden.",
  loading: "Suche läuft …",
  unexpected: "Ein unerwarteter Fehler ist aufgetreten.",
};

// Leerzeichen am Anfang und Ende entfernen
export function normalizeQuery(input) {
  return (input ?? "").trim();
}

// ===== Logik: ohne Browser testbar =====

// Führt eine Suche aus und liefert einen Zustand, den die Anzeige nur noch darstellt:
// "too-short" | "results" | "empty" | "error"
export async function findAssets(input, search = searchAssets) {
  const query = normalizeQuery(input);

  if (query.length < MIN_QUERY_LENGTH) {
    return { status: "too-short", query, results: [] };
  }

  try {
    const data = await search(query);
    const results = data?.results ?? [];
    return { status: results.length > 0 ? "results" : "empty", query, results };
  } catch (error) {
    // Meldung kommt bei ApiError bereits auf Deutsch vom Backend (z. B. bei 503)
    const message = error instanceof ApiError ? error.message : MESSAGES.unexpected;
    return { status: "error", query, results: [], message };
  }
}

// Zweite Zeile eines Treffers: Ticker, Börse und Währung (Akzeptanzkriterium US-02)
export function formatAssetDetails(asset) {
  return [asset.symbol, asset.exchange, asset.currency].filter(Boolean).join(" · ");
}

// ===== Anzeige: verbindet die Logik mit der Seite =====

// Startet die Anlagensuche im übergebenen Bereich (portfolio.html, #asset-search).
// Bei Auswahl eines Treffers wird das Ereignis "asset-selected" mit der Anlage
// in event.detail ausgelöst; der Portfolio-Editor (FE #2) kann darauf reagieren.
export function initAssetSearch(container) {
  const input = container.querySelector("#asset-search-input");
  const hint = container.querySelector("#asset-search-hint");
  const list = container.querySelector("#asset-search-results");
  const errorArea = document.getElementById("error-message");

  if (!input || !hint || !list) {
    return;
  }

  let timer = null;
  let latestSearch = 0;

  function showHint(text) {
    hint.textContent = text;
  }

  function showError(message) {
    if (errorArea) {
      errorArea.textContent = message;
      errorArea.hidden = false;
    }
  }

  function clearError() {
    if (errorArea) {
      errorArea.textContent = "";
      errorArea.hidden = true;
    }
  }

  function renderResults(results) {
    list.replaceChildren();
    for (const asset of results) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";

      // textContent statt innerHTML: Namen aus der API werden nie als HTML ausgeführt
      const name = document.createElement("span");
      name.className = "search-result-name";
      name.textContent = asset.name;
      const details = document.createElement("span");
      details.className = "search-result-details";
      details.textContent = formatAssetDetails(asset);

      button.append(name, details);
      button.addEventListener("click", () => selectAsset(asset, button));
      item.append(button);
      list.append(item);
    }
  }

  function selectAsset(asset, button) {
    for (const other of list.querySelectorAll(".search-result")) {
      other.classList.remove("selected");
    }
    button.classList.add("selected");
    container.dispatchEvent(new CustomEvent("asset-selected", { detail: asset, bubbles: true }));
  }

  async function runSearch() {
    const searchId = ++latestSearch;
    const query = normalizeQuery(input.value);

    if (query.length >= MIN_QUERY_LENGTH) {
      showHint(MESSAGES.loading);
    }

    const state = await findAssets(input.value);

    // Nur die Antwort auf die neueste Eingabe anzeigen, ältere Antworten verwerfen
    if (searchId !== latestSearch) {
      return;
    }

    if (state.status === "error") {
      list.replaceChildren();
      showHint("");
      showError(state.message);
      return;
    }

    clearError();
    renderResults(state.results);

    if (state.status === "too-short") {
      showHint(MESSAGES.tooShort);
    } else if (state.status === "empty") {
      showHint(MESSAGES.noResults);
    } else {
      showHint("");
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, SEARCH_DELAY_MS);
  });

  showHint(MESSAGES.tooShort);
}
