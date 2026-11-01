// KI-Log ME-[Nr.]: CSV-Export im Dashboard mit KI erstellt, von Mert Eminel geprüft (FE #52, US-12)
// Lädt die Nutzungskennzahlen des im Dashboard gewählten Monats als CSV-Datei herunter (E41).
// Weil das Token im Header steht (ADR-06), reicht ein einfacher Link nicht: Die Datei wird per fetch
// geladen und als Blob zum Download angeboten (API-Design, Abschnitt „Auswertungen“).

import { API_BASE_URL, API_PREFIX } from "./config.js";
import { ApiError, apiErrorText } from "./api.js";

export const EXPORT_MESSAGES = {
  running: "CSV-Datei wird erstellt …",
  noMonth: "Bitte einen Monat auswählen.",
  unauthorized: "Bitte melde dich erneut an.",
  failed: "Die CSV-Datei konnte nicht erstellt werden.",
};

// Dateiname laut E41, wenn der Header Content-Disposition fehlt oder nicht lesbar ist
export function defaultExportFilename(month) {
  return `lookupstock-nutzung-${month}.csv`;
}

// Liest den Dateinamen aus „attachment; filename="lookupstock-nutzung-2026-11.csv"“
export function filenameFromDisposition(header, month) {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header ?? "");
  return match ? decodeURIComponent(match[1].trim()) : defaultExportFilename(month);
}

// GET /api/v1/reports/usage/export?month=JJJJ-MM mit Bearer-Token.
// Ergebnis: { blob, filename }; Fehler (400, 401, 403) kommen als JSON und werden zu ApiError.
export async function fetchUsageExport(token, month, fetchFn = globalThis.fetch) {
  const params = new URLSearchParams({ month });
  let response;
  try {
    response = await fetchFn(`${API_BASE_URL}${API_PREFIX}/reports/usage/export?${params}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Der Server ist gerade nicht erreichbar.");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const error = data?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? EXPORT_MESSAGES.failed,
      error?.details ?? []
    );
  }

  const blob = await response.blob();
  const filename = filenameFromDisposition(response.headers.get("Content-Disposition"), month);
  return { blob, filename };
}

// Meldung für die Statuszeile unter dem Button
export function exportErrorMessage(error) {
  if (error?.status === 401) return EXPORT_MESSAGES.unauthorized;
  return apiErrorText(error) ?? EXPORT_MESSAGES.failed;
}

// Bietet den Blob im Browser als Datei an (unsichtbarer Link mit download-Attribut)
function saveFile(root, blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = root.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  root.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Verbindet den Button „CSV herunterladen“ mit dem Export. Der Monat kommt aus der Monatsauswahl
// des Dashboards (FE #51); ohne die Rolle Geschäftsführung ist der ganze Bereich ausgeblendet.
export function initDashboardExport({ root = document, session, load = fetchUsageExport } = {}) {
  const button = root.getElementById("dashboard-export");
  const status = root.getElementById("dashboard-export-status");
  const monthInput = root.getElementById("dashboard-month");
  if (!button || !status || !monthInput) {
    return;
  }

  function setStatus(text, isError = false) {
    status.textContent = text;
    status.classList.toggle("summary-status-invalid", isError);
  }

  button.addEventListener("click", async () => {
    const month = monthInput.value;
    if (!month) {
      setStatus(EXPORT_MESSAGES.noMonth, true);
      return;
    }
    button.disabled = true;
    setStatus(EXPORT_MESSAGES.running);
    try {
      const { blob, filename } = await load(session?.token, month);
      saveFile(root, blob, filename);
      setStatus("");
    } catch (error) {
      setStatus(exportErrorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });
}
