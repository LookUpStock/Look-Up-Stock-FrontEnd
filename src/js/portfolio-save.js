// KI-Log Nr. [eintragen]: Speichern und Laden von Portfolios mit KI erstellt, vom Team zu prüfen (US-03)

import { savePortfolio, updatePortfolio, deletePortfolio, listPortfolios, apiErrorText } from "./api.js";
import { isUnauthorized } from "./auth.js";
import { formatWeightInput } from "./portfolio.js";

export const MESSAGES = {
  missingAsset: "Bitte die Anlage über die Suche auswählen.",
  fixErrors: "Bitte zuerst die markierten Fehler beheben.",
  saving: "Portfolio wird gespeichert …",
  saved: "Portfolio gespeichert.",
  updated: "Portfolio aktualisiert.",
  deleted: "Portfolio gelöscht.",
  loading: "Gespeicherte Portfolios werden geladen …",
  noPortfolios: "Noch keine Portfolios gespeichert.",
  unexpected: "Ein unerwarteter Fehler ist aufgetreten.",
};

// ===== Logik: ohne Browser testbar =====

// Je Position eine Meldung, wenn die Anlage nicht aus der Suche stammt (sonst ASSET_NOT_FOUND im Backend)
export function missingAssetErrors(portfolio) {
  return portfolio.positions.map((position) => (position.assetId == null ? MESSAGES.missingAsset : ""));
}

// Meldung vom Backend samt Details (z. B. "Unbekannte assetId 7."); sonst allgemeiner Text
export function errorMessageFrom(error) {
  return apiErrorText(error) ?? MESSAGES.unexpected;
}

// Portfolio an das Backend senden.
// Ergebnis: { status: "saved", portfolio } | { status: "unauthorized" } | { status: "error", message }
export async function submitPortfolio(portfolio, token, save = savePortfolio) {
  if (!token) {
    return { status: "unauthorized" };
  }
  try {
    const saved = await save(token, portfolio.name, portfolio.positions);
    return { status: "saved", portfolio: saved };
  } catch (error) {
    if (isUnauthorized(error)) {
      return { status: "unauthorized" };
    }
    return { status: "error", message: errorMessageFrom(error) };
  }
}

export async function editPortfolio(id, portfolio, token, update = updatePortfolio) {
  if (!token) {
    return { status: "unauthorized" };
  }
  try {
    return { status: "saved", portfolio: await update(token, id, portfolio.name, portfolio.positions) };
  } catch (error) {
    if (isUnauthorized(error)) {
      return { status: "unauthorized" };
    }
    return { status: "error", message: errorMessageFrom(error) };
  }
}

export async function removePortfolio(id, token, remove = deletePortfolio) {
  if (!token) {
    return { status: "unauthorized" };
  }
  try {
    await remove(token, id);
    return { status: "deleted" };
  } catch (error) {
    if (isUnauthorized(error)) {
      return { status: "unauthorized" };
    }
    return { status: "error", message: errorMessageFrom(error) };
  }
}

// Eigene Portfolios laden.
// Ergebnis: { status: "loaded", portfolios } | { status: "unauthorized" } | { status: "error", message }
export async function loadSavedPortfolios(token, list = listPortfolios) {
  if (!token) {
    return { status: "unauthorized" };
  }
  try {
    const data = await list(token);
    return { status: "loaded", portfolios: data?.portfolios ?? [] };
  } catch (error) {
    if (isUnauthorized(error)) {
      return { status: "unauthorized" };
    }
    return { status: "error", message: errorMessageFrom(error) };
  }
}

// Gespeichertes Portfolio (PortfolioResponse) in die Felder des Editors übernehmen
export function toEditorDraft(saved) {
  return {
    name: saved?.name ?? "",
    positions: (saved?.positions ?? []).map((position) => ({
      assetId: position.assetId,
      symbol: position.symbol ?? "",
      name: position.name ?? "",
      weightInput: formatWeightInput(Number(position.weight)),
    })),
  };
}

// Anzahl der Positionen mit Singular bei genau einer Position; gemeinsam für MPA und SPA (FE #71, H12)
export function formatPositionCount(count) {
  return count === 1 ? "1 Position" : `${count} Positionen`;
}

// Zweite Zeile eines gespeicherten Portfolios: Anzahl Positionen und Datum
export function formatSavedDetails(saved) {
  const parts = [formatPositionCount(saved?.positions?.length ?? 0)];
  const createdAt = Date.parse(saved?.createdAt);
  if (!Number.isNaN(createdAt)) {
    parts.push(`gespeichert am ${new Date(createdAt).toLocaleDateString("de-DE")}`);
  }
  return parts.join(" · ");
}
