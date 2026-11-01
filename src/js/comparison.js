import { runComparison, searchAssets, apiErrorText } from "./api.js";
import { clearSession, getToken, isUnauthorized, loginPageUrl, REASONS } from "./auth.js";
import { loadSavedPortfolios } from "./portfolio-save.js";
import { renderFanChart, formatEuro, buildFanChartYScale } from "./chart.js";
import { parseTargetAmount, targetProbabilityRow, isResultVisibleAfter } from "./simulation.js";

const DEFAULTS = { startCapital: "10000", monthlyContribution: "200", horizonYears: "20", paths: "10000", seed: "", targetAmount: "" };

function number(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  return normalized === "" ? Number.NaN : Number(normalized);
}

export function validateComparisonParameters(input) {
  const errors = {};
  const startCapital = number(input.startCapital);
  const monthlyContribution = number(input.monthlyContribution);
  const horizonYears = number(input.horizonYears);
  const paths = number(input.paths);
  const seedText = String(input.seed ?? "").trim();
  const seed = seedText === "" ? null : Number(seedText);
  if (!Number.isFinite(startCapital) || startCapital < 0) errors.startCapital = "Bitte einen Betrag ab 0 eingeben.";
  if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0) errors.monthlyContribution = "Bitte einen Betrag ab 0 eingeben.";
  if (!errors.startCapital && !errors.monthlyContribution && startCapital === 0 && monthlyContribution === 0) {
    errors.startCapital = "Startkapital und Sparrate dürfen nicht beide 0 sein.";
  }
  if (!Number.isInteger(horizonYears) || horizonYears < 1 || horizonYears > 40) errors.horizonYears = "Der Anlagehorizont muss eine ganze Zahl von 1 bis 40 Jahren sein.";
  if (!Number.isInteger(paths) || paths < 1000 || paths > 50000) errors.paths = "Die Anzahl der Simulationspfade muss zwischen 1.000 und 50.000 liegen.";
  if (seed !== null && !Number.isSafeInteger(seed)) errors.seed = "Der Seed muss eine ganze Zahl sein.";
  // Optionaler Zielbetrag wie bei der Simulation (FE #30, B1, E27)
  const target = parseTargetAmount(input.targetAmount);
  if (target.error) errors.targetAmount = target.error;
  const parameters = { startCapital, monthlyContribution, horizonYears, paths };
  if (seed !== null) parameters.seed = seed;
  if (target.value !== null) parameters.targetAmount = target.value;
  return { valid: Object.keys(errors).length === 0, errors, parameters };
}

// Bei 422 INSUFFICIENT_DATA wird jede Anlage genau einmal genannt (B7, FE #34)
function displayError(error) {
  return apiErrorText(error) ?? "Der Vergleich konnte nicht berechnet werden.";
}

export function initComparisonPage(root = document) {
  const form = root.getElementById("comparison-form");
  if (!form) return;
  const status = root.getElementById("comparison-status");
  const resultSection = root.getElementById("comparison-result");
  const metadata = root.getElementById("comparison-metadata");
  const resultsContainer = root.getElementById("comparison-results");
  const pairwise = root.getElementById("comparison-pairwise");
  const submit = form.querySelector("button[type=submit]");
  const fields = ["startCapital", "monthlyContribution", "horizonYears", "paths", "seed", "targetAmount"];
  for (const field of fields) form.elements[field].value = DEFAULTS[field];

  function redirectToLogin() {
    clearSession();
    window.location.assign(loginPageUrl(REASONS.expired, "compare.html"));
  }

  function showErrors(errors = {}) {
    for (const field of fields) {
      const error = root.getElementById(`compare-${field}-error`);
      error.textContent = errors[field] ?? "";
      form.elements[field].setAttribute("aria-invalid", errors[field] ? "true" : "false");
    }
  }

  function renderPortfolios(portfolios) {
    for (const choice of form.querySelectorAll(".comparison-choice")) {
      const select = choice.querySelector('[name="portfolioId"]');
      for (const portfolio of portfolios) {
        const option = root.createElement("option");
        option.value = String(portfolio.id);
        option.textContent = portfolio.name;
        select.append(option);
      }
    }
  }

  async function loadPortfolios() {
    const loaded = await loadSavedPortfolios(getToken());
    if (loaded.status === "unauthorized") return redirectToLogin();
    if (loaded.status === "error") {
      root.getElementById("comparison-load-hint").textContent = loaded.message;
      return;
    }
    renderPortfolios(loaded.portfolios);
    if (!loaded.portfolios.length) root.getElementById("comparison-load-hint").textContent = "Keine gespeicherten Portfolios gefunden. Du kannst stattdessen einzelne Anlagen auswählen.";
  }

  for (const choice of form.querySelectorAll(".comparison-choice")) {
    const type = choice.querySelector('[name="itemType"]');
    const portfolioPanel = choice.querySelector(".portfolio-choice");
    const assetPanel = choice.querySelector(".asset-choice");
    type.addEventListener("change", () => {
      const assetSelected = type.value === "asset";
      portfolioPanel.hidden = assetSelected;
      assetPanel.hidden = !assetSelected;
    });
    choice.querySelector(".asset-search-button").addEventListener("click", async () => {
      const query = choice.querySelector('[name="assetQuery"]').value.trim();
      const hint = choice.querySelector(".asset-search-hint");
      const results = choice.querySelector('[name="assetId"]');
      results.replaceChildren();
      if (query.length < 2) {
        hint.textContent = "Bitte mindestens 2 Zeichen eingeben.";
        return;
      }
      hint.textContent = "Suche läuft …";
      try {
        const response = await searchAssets(query);
        for (const asset of response.results ?? []) {
          const option = root.createElement("option");
          option.value = String(asset.id);
          option.textContent = `${asset.name} (${asset.symbol}${asset.exchange ? ` · ${asset.exchange}` : ""})`;
          results.append(option);
        }
        hint.textContent = results.options.length ? "Anlage auswählen." : "Keine passende Anlage gefunden.";
      } catch (error) {
        hint.textContent = displayError(error);
      }
    });
  }

  function selections() {
    const items = [];
    for (const [index, choice] of [...form.querySelectorAll(".comparison-choice")].entries()) {
      const type = choice.querySelector('[name="itemType"]').value;
      const customLabel = choice.querySelector('[name="customLabel"]').value.trim();
      if (type === "portfolio") {
        const select = choice.querySelector('[name="portfolioId"]');
        if (!select.value) return { error: `Bitte Portfolio ${index + 1} auswählen.` };
        items.push({ label: customLabel || select.selectedOptions[0].textContent, portfolioId: Number(select.value) });
      } else {
        const select = choice.querySelector('[name="assetId"]');
        if (!select.value) return { error: `Bitte Anlage ${index + 1} suchen und auswählen.` };
        items.push({ label: customLabel || select.selectedOptions[0].textContent, assetId: Number(select.value) });
      }
    }
    return { items };
  }

  function renderResults(data) {
    resultsContainer.replaceChildren();
    const seed = data.parameters?.seed;
    const from = formatDate(data.estimates?.historyFrom);
    const to = formatDate(data.estimates?.historyTo);
    const period = from && to ? `${from} bis ${to}` : "nicht verfügbar";
    metadata.textContent = `Gemeinsamer Schätzzeitraum: ${period} · Seed: ${seed ?? "nicht verfügbar"}`;
    const results = data.results ?? [];
    const yScale = buildFanChartYScale(results.map((result) => result.timeline));
    for (const result of results) {
      const card = root.createElement("article");
      card.className = "card comparison-result-card";
      const heading = root.createElement("h3");
      heading.textContent = result.label;
      const chart = root.createElement("div");
      chart.className = "fan-chart-container";
      renderFanChart(chart, result.timeline, yScale);
      const metrics = result.metrics ?? {};
      // Zielwahrscheinlichkeit nur mit Zielbetrag (FE #30, B1, E27)
      const targetRow = targetProbabilityRow(metrics, data.parameters?.targetAmount);
      const summary = root.createElement("dl");
      summary.className = "simulation-summary";
      for (const [label, value] of [
        ["Einzahlungen", formatEuro(metrics.totalContributions)],
        ["Median-Endwert", formatEuro(metrics.medianEndValue)],
        ["p5-Endwert", formatEuro(metrics.p5EndValue)],
        ["p95-Endwert", formatEuro(metrics.p95EndValue)],
        ["Value at Risk (95 %)", formatEuro(metrics.valueAtRisk95)],
        ["Maximaler Drawdown (Median)", Number.isFinite(metrics.maxDrawdownMedian)
          ? new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 2 }).format(metrics.maxDrawdownMedian) : "–"],
        ...(targetRow ? [targetRow] : []),
      ]) {
        const row = root.createElement("div");
        const term = root.createElement("dt"); term.textContent = label;
        const definition = root.createElement("dd"); definition.textContent = value;
        row.append(term, definition); summary.append(row);
      }
      card.append(heading, chart, summary);
      resultsContainer.append(card);
    }
    const chance = data.pairwise?.[0]?.probabilityAOutperformsB;
    pairwise.textContent = Number.isFinite(chance)
      ? `„${data.results[0].label}“ schneidet in ${(chance * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} % der gemeinsamen Simulationspfade besser ab.`
      : "";
    resultSection.hidden = false;
  }

  function hideResult(outcomeStatus) {
    if (!isResultVisibleAfter(outcomeStatus)) resultSection.hidden = true;
  }

  function formatDate(isoDate) {
    if (typeof isoDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
    const [year, month, day] = isoDate.split("-");
    return `${day}.${month}.${year}`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showErrors();
    const selection = selections();
    // H2 (FE #54): Nach einem Fehler das Ergebnis des vorherigen Vergleichs ausblenden
    if (selection.error) { hideResult("invalid"); status.textContent = selection.error; return; }
    const input = Object.fromEntries(fields.map((field) => [field, form.elements[field].value]));
    const validated = validateComparisonParameters(input);
    if (!validated.valid) { hideResult("invalid"); showErrors(validated.errors); status.textContent = "Bitte die markierten Eingaben prüfen."; return; }
    if (!getToken()) return redirectToLogin();
    submit.disabled = true;
    status.textContent = "Vergleich wird berechnet …";
    try {
      const response = await runComparison(getToken(), selection.items, validated.parameters);
      renderResults(response);
      status.textContent = "";
    } catch (error) {
      if (isUnauthorized(error)) return redirectToLogin();
      hideResult("error");
      status.textContent = displayError(error);
    } finally {
      submit.disabled = false;
    }
  });

  loadPortfolios();
}
