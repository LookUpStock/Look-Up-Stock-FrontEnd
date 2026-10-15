import {
  calculateTotalWeight,
  createPortfolio,
  equalizePortfolioWeights,
  formatWeightInput,
  normalizePortfolioWeights,
  parseWeightInput,
  validatePortfolio,
} from "./portfolio.js";
import { clearSession, getToken, loginPageUrl, REASONS, MESSAGES as AUTH_MESSAGES } from "./auth.js";
import {
  MESSAGES,
  formatSavedDetails,
  loadSavedPortfolios,
  missingAssetErrors,
  submitPortfolio,
  toEditorDraft,
} from "./portfolio-save.js";

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `position-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDraftPosition(position = {}) {
  return {
    id: position.id ?? createId(),
    assetId: position.assetId ?? null,
    symbol: position.symbol ?? "",
    name: position.name ?? "",
    weightInput: position.weightInput ?? "",
  };
}

// Ergebnis von Normalisieren/Gleichgewichten zurück in Eingabefelder übernehmen
function toDraftPositions(portfolio) {
  return portfolio.positions.map((position) => createDraftPosition({
    id: position.id,
    assetId: position.assetId,
    symbol: position.symbol,
    name: position.name,
    weightInput: formatWeightInput(position.weightPct),
  }));
}

function createInitialState() {
  return {
    name: "",
    positions: [createDraftPosition()],
  };
}

function buildPortfolioModel(state) {
  return createPortfolio(
    state.name,
    state.positions.map((position) => ({
      id: position.id,
      assetId: position.assetId,
      symbol: position.symbol,
      name: position.name,
      weightPct: parseWeightInput(position.weightInput),
    }))
  );
}

function setFieldError(inputElement, errorElement, message) {
  errorElement.textContent = message;
  inputElement.setAttribute("aria-invalid", message ? "true" : "false");
}

function setSummaryState(summaryStatusElement, hasErrors) {
  summaryStatusElement.classList.toggle("summary-status-valid", !hasErrors);
  summaryStatusElement.classList.toggle("summary-status-invalid", hasErrors);
}

export function initPortfolioEditor(rootDocument = document) {
  const editor = rootDocument.getElementById("portfolio-editor");

  if (!editor) {
    return;
  }

  const state = createInitialState();
  const portfolioNameInput = rootDocument.getElementById("portfolio-name");
  const portfolioNameError = rootDocument.getElementById("portfolio-name-error");
  const positionsList = rootDocument.getElementById("positions-list");
  const addPositionButton = rootDocument.getElementById("add-position");
  const normalizeButton = rootDocument.getElementById("normalize-weights");
  const equalizeButton = rootDocument.getElementById("equalize-weights");
  const totalValueElement = rootDocument.getElementById("portfolio-total-value");
  const totalStatusElement = rootDocument.getElementById("portfolio-total-status");
  const totalErrorElement = rootDocument.getElementById("portfolio-total-error");
  const saveButton = rootDocument.getElementById("save-portfolio");
  const saveStatusElement = rootDocument.getElementById("portfolio-save-status");
  const savedHintElement = rootDocument.getElementById("saved-portfolios-hint");
  const savedListElement = rootDocument.getElementById("saved-portfolios-list");

  // Fehlende Anlagen erst nach dem ersten Speicherversuch markieren, nicht schon beim Tippen
  let showAssetErrors = false;

  function setSaveStatus(message, isError) {
    saveStatusElement.textContent = message;
    saveStatusElement.classList.toggle("summary-status-valid", Boolean(message) && !isError);
    saveStatusElement.classList.toggle("summary-status-invalid", Boolean(message) && isError);
  }

  // Anmeldung abgelaufen oder vom Backend abgelehnt (401): neu anmelden, danach zurück zum Editor
  function redirectToLogin() {
    clearSession();
    window.location.assign(loginPageUrl(REASONS.expired, "portfolio.html"));
  }

  function updateSummaryAndErrors() {
    const portfolio = buildPortfolioModel(state);
    const validation = validatePortfolio(portfolio);
    const assetErrors = showAssetErrors ? missingAssetErrors(portfolio) : [];
    const totalWeightPct = calculateTotalWeight(portfolio);
    const hasErrors = !validation.valid;
    const hasInvalidWeights = validation.errors.positions.some((positionErrors) => positionErrors.weightPct);

    portfolioNameInput.value = state.name;
    totalValueElement.textContent = hasInvalidWeights ? "—" : `${formatWeightInput(totalWeightPct)} %`;
    totalStatusElement.textContent = hasErrors ? "ungültig" : "gültig";
    setSummaryState(totalStatusElement, hasErrors);
    totalErrorElement.textContent = validation.errors.totalWeightPct;
    portfolioNameError.textContent = validation.errors.name;
    portfolioNameInput.setAttribute("aria-invalid", validation.errors.name ? "true" : "false");

    const positionRows = positionsList.querySelectorAll("[data-position-id]");

    positionRows.forEach((rowElement, index) => {
      const positionErrors = validation.errors.positions[index];
      const positionId = rowElement.getAttribute("data-position-id");
      const rowState = state.positions.find((position) => position.id === positionId);

      if (!rowState || !positionErrors) {
        return;
      }

      const symbolInput = rowElement.querySelector(`[data-position-field="symbol"]`);
      const nameInput = rowElement.querySelector(`[data-position-field="name"]`);
      const weightInput = rowElement.querySelector(`[data-position-field="weightPct"]`);
      const symbolError = rowElement.querySelector(`[data-position-error="symbol"]`);
      const nameError = rowElement.querySelector(`[data-position-error="name"]`);
      const weightError = rowElement.querySelector(`[data-position-error="weightPct"]`);

      symbolInput.value = rowState.symbol;
      nameInput.value = rowState.name;
      weightInput.value = rowState.weightInput;

      setFieldError(symbolInput, symbolError, positionErrors.symbol || assetErrors[index] || "");
      setFieldError(nameInput, nameError, positionErrors.name);
      setFieldError(weightInput, weightError, positionErrors.weightPct);
    });

    normalizeButton.disabled = positionsList.children.length === 0 || state.positions.some((position) => !Number.isFinite(parseWeightInput(position.weightInput)));
    equalizeButton.disabled = positionsList.children.length === 0;

    return validation;
  }

  function renderPositions(focusPositionId = null, focusField = "symbol") {
    positionsList.innerHTML = "";

    state.positions.forEach((position, index) => {
      const rowElement = rootDocument.createElement("div");
      rowElement.className = "position-item";
      rowElement.setAttribute("role", "group");
      rowElement.setAttribute("data-position-id", position.id);

      rowElement.innerHTML = `
        <div class="position-item-header">
          <h4 class="position-item-title" id="position-title-${position.id}">Position ${index + 1}</h4>
          <button type="button" class="button-danger" data-remove-position="${position.id}">Entfernen</button>
        </div>
        <div class="position-grid">
          <div class="field-group">
            <label for="position-symbol-${position.id}">Symbol</label>
            <input id="position-symbol-${position.id}" data-position-field="symbol" type="text" autocomplete="off" required>
            <p class="field-error" data-position-error="symbol" aria-live="polite"></p>
          </div>
          <div class="field-group">
            <label for="position-name-${position.id}">Name</label>
            <input id="position-name-${position.id}" data-position-field="name" type="text" autocomplete="off" required>
            <p class="field-error" data-position-error="name" aria-live="polite"></p>
          </div>
          <div class="field-group">
            <label for="position-weight-${position.id}">Gewicht in %</label>
            <input id="position-weight-${position.id}" data-position-field="weightPct" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" required>
            <p class="field-error" data-position-error="weightPct" aria-live="polite"></p>
          </div>
        </div>
      `;

      const symbolInput = rowElement.querySelector(`[data-position-field="symbol"]`);
      const nameInput = rowElement.querySelector(`[data-position-field="name"]`);
      const weightInput = rowElement.querySelector(`[data-position-field="weightPct"]`);
      const removeButton = rowElement.querySelector(`[data-remove-position="${position.id}"]`);

      symbolInput.value = position.symbol;
      nameInput.value = position.name;
      weightInput.value = position.weightInput;

      symbolInput.addEventListener("input", (event) => {
        position.symbol = event.target.value;
        // Von Hand geändertes Symbol passt nicht mehr zur Anlage aus der Suche
        position.assetId = null;
        updateSummaryAndErrors();
      });

      nameInput.addEventListener("input", (event) => {
        position.name = event.target.value;
        updateSummaryAndErrors();
      });

      weightInput.addEventListener("input", (event) => {
        position.weightInput = event.target.value;
        updateSummaryAndErrors();
      });

      removeButton.addEventListener("click", () => {
        state.positions = state.positions.filter((item) => item.id !== position.id);
        renderPositions();

        const nextFocus = positionsList.querySelector(`[data-position-id] input`);
        if (nextFocus) {
          nextFocus.focus();
        } else {
          addPositionButton.focus();
        }

        updateSummaryAndErrors();
      });

      positionsList.appendChild(rowElement);
    });

    if (focusPositionId) {
      const focusInput = positionsList.querySelector(`[data-position-id="${focusPositionId}"] [data-position-field="${focusField}"]`);
      if (focusInput) {
        focusInput.focus();
      }
    }

    updateSummaryAndErrors();
  }

  portfolioNameInput.value = state.name;
  portfolioNameInput.addEventListener("input", (event) => {
    state.name = event.target.value;
    updateSummaryAndErrors();
  });

  addPositionButton.addEventListener("click", () => {
    const position = createDraftPosition();
    state.positions.push(position);
    renderPositions(position.id);
  });

  normalizeButton.addEventListener("click", () => {
    const portfolio = buildPortfolioModel(state);

    if (state.positions.some((position) => !Number.isFinite(parseWeightInput(position.weightInput)))) {
      updateSummaryAndErrors();
      return;
    }

    state.positions = toDraftPositions(normalizePortfolioWeights(portfolio));
    renderPositions();
  });

  equalizeButton.addEventListener("click", () => {
    state.positions = toDraftPositions(equalizePortfolioWeights(buildPortfolioModel(state)));
    renderPositions();
  });

  // Treffer aus der Anlagensuche (search.js, Ereignis "asset-selected") als Position übernehmen.
  // Die id der Anlage wird als assetId gespeichert; ohne sie lehnt das Backend das Portfolio ab.
  rootDocument.addEventListener("asset-selected", (event) => {
    const asset = event.detail;
    const existing = state.positions.find((position) => position.assetId === asset.id);

    if (existing) {
      renderPositions(existing.id, "weightPct");
      return;
    }

    let target = state.positions.find((position) => !position.symbol.trim() && !position.name.trim());
    if (!target) {
      target = createDraftPosition();
      state.positions.push(target);
    }

    target.assetId = asset.id;
    target.symbol = asset.symbol ?? "";
    target.name = asset.name ?? "";
    renderPositions(target.id, "weightPct");
  });

  saveButton.addEventListener("click", async () => {
    showAssetErrors = true;
    const validation = updateSummaryAndErrors();
    const portfolio = buildPortfolioModel(state);

    if (!validation.valid || missingAssetErrors(portfolio).some(Boolean)) {
      setSaveStatus(MESSAGES.fixErrors, true);
      return;
    }

    saveButton.disabled = true;
    setSaveStatus(MESSAGES.saving, false);
    const result = await submitPortfolio(portfolio, getToken());
    saveButton.disabled = false;

    if (result.status === "unauthorized") {
      redirectToLogin();
      return;
    }
    if (result.status === "error") {
      setSaveStatus(result.message, true);
      return;
    }

    setSaveStatus(MESSAGES.saved, false);
    refreshSavedPortfolios();
  });

  function loadIntoEditor(saved) {
    const draft = toEditorDraft(saved);
    state.name = draft.name;
    state.positions = draft.positions.map(createDraftPosition);
    setSaveStatus("", false);
    renderPositions();
    portfolioNameInput.focus();
  }

  function renderSavedPortfolios(portfolios) {
    savedListElement.replaceChildren();

    for (const saved of portfolios) {
      const item = rootDocument.createElement("li");
      item.className = "saved-portfolio";

      // textContent statt innerHTML: Namen aus der API werden nie als HTML ausgeführt
      const text = rootDocument.createElement("div");
      const name = rootDocument.createElement("span");
      name.className = "saved-portfolio-name";
      name.textContent = saved.name;
      const details = rootDocument.createElement("span");
      details.className = "saved-portfolio-details";
      details.textContent = formatSavedDetails(saved);
      text.append(name, details);

      const button = rootDocument.createElement("button");
      button.type = "button";
      button.textContent = "Laden";
      button.addEventListener("click", () => loadIntoEditor(saved));

      item.append(text, button);
      savedListElement.append(item);
    }
  }

  async function refreshSavedPortfolios() {
    const token = getToken();
    // Ohne Anmeldung ist der Editor ausgeblendet (protectSection); nichts laden
    if (!token) {
      return;
    }

    savedHintElement.textContent = MESSAGES.loading;
    const result = await loadSavedPortfolios(token);

    if (result.status === "unauthorized") {
      savedListElement.replaceChildren();
      savedHintElement.textContent = AUTH_MESSAGES.expired;
      return;
    }
    if (result.status === "error") {
      savedHintElement.textContent = result.message;
      return;
    }

    renderSavedPortfolios(result.portfolios);
    savedHintElement.textContent = result.portfolios.length === 0 ? MESSAGES.noPortfolios : "";
  }

  renderPositions();
  refreshSavedPortfolios();
}
