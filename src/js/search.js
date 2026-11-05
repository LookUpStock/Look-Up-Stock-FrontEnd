import { searchAssets, ApiError } from "./api.js";

export const MIN_QUERY_LENGTH = 2;

// Debounce so not every keystroke sends a request.
export const SEARCH_DELAY_MS = 300;

export const MESSAGES = {
  tooShort: "Bitte mindestens 2 Zeichen eingeben.",
  noResults: "Keine passende Anlage gefunden.",
  loading: "Suche läuft …",
  unexpected: "Ein unerwarteter Fehler ist aufgetreten.",
};

export function normalizeQuery(input) {
  return (input ?? "").trim();
}

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
    const message = error instanceof ApiError ? error.message : MESSAGES.unexpected;
    return { status: "error", query, results: [], message };
  }
}

export function searchHint(state) {
  switch (state.status) {
    case "too-short":
      return MESSAGES.tooShort;
    case "empty":
      return MESSAGES.noResults;
    case "error":
      return state.message;
    default:
      return "";
  }
}

export function formatAssetDetails(asset) {
  return [asset.symbol, asset.exchange, asset.currency].filter(Boolean).join(" · ");
}

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

      // textContent, not innerHTML: names from the API are never interpreted as HTML.
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

    // Only render the response to the latest input; older responses are discarded.
    if (searchId !== latestSearch) {
      return;
    }

    if (state.status === "error") {
      list.replaceChildren();
      showHint(searchHint(state));
      showError(state.message);
      return;
    }

    clearError();
    renderResults(state.results);
    showHint(searchHint(state));
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, SEARCH_DELAY_MS);
  });

  showHint(MESSAGES.tooShort);
}