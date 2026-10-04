import {
  calculateTotalWeight,
  createPortfolio,
  equalizePortfolioWeights,
  formatWeightInput,
  normalizePortfolioWeights,
  parseWeightInput,
  validatePortfolio,
} from "./portfolio.js";

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `position-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDraftPosition(position = {}) {
  return {
    id: position.id ?? createId(),
    symbol: position.symbol ?? "",
    name: position.name ?? "",
    weightInput: position.weightInput ?? "",
  };
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

  function updateSummaryAndErrors() {
    const portfolio = buildPortfolioModel(state);
    const validation = validatePortfolio(portfolio);
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

      setFieldError(symbolInput, symbolError, positionErrors.symbol);
      setFieldError(nameInput, nameError, positionErrors.name);
      setFieldError(weightInput, weightError, positionErrors.weightPct);
    });

    normalizeButton.disabled = positionsList.children.length === 0 || state.positions.some((position) => !Number.isFinite(parseWeightInput(position.weightInput)));
    equalizeButton.disabled = positionsList.children.length === 0;

    return validation;
  }

  function renderPositions(focusPositionId = null) {
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
      const focusInput = positionsList.querySelector(`[data-position-id="${focusPositionId}"] [data-position-field="symbol"]`);
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

    const normalizedPortfolio = normalizePortfolioWeights(portfolio);

    state.positions = normalizedPortfolio.positions.map((position) => createDraftPosition({
      id: position.id,
      symbol: position.symbol,
      name: position.name,
      weightInput: formatWeightInput(position.weightPct),
    }));

    renderPositions();
  });

  equalizeButton.addEventListener("click", () => {
    const portfolio = buildPortfolioModel(state);
    const equalizedPortfolio = equalizePortfolioWeights(portfolio);

    state.positions = equalizedPortfolio.positions.map((position) => createDraftPosition({
      id: position.id,
      symbol: position.symbol,
      name: position.name,
      weightInput: formatWeightInput(position.weightPct),
    }));

    renderPositions();
  });

  renderPositions();
}

initPortfolioEditor();