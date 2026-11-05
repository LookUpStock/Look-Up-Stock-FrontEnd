// The token is sent as a header, so a plain link cannot download the file: it is fetched and offered as a blob.

import { API_BASE_URL, API_PREFIX } from "./config.js";
import { ApiError, apiErrorText } from "./api.js";

export const EXPORT_MESSAGES = {
  running: "CSV-Datei wird erstellt …",
  noMonth: "Bitte einen Monat auswählen.",
  unauthorized: "Bitte melde dich erneut an.",
  failed: "Die CSV-Datei konnte nicht erstellt werden.",
};

export function defaultExportFilename(month) {
  return `lookupstock-nutzung-${month}.csv`;
}

export function filenameFromDisposition(header, month) {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header ?? "");
  return match ? decodeURIComponent(match[1].trim()) : defaultExportFilename(month);
}

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

export function exportErrorMessage(error) {
  if (error?.status === 401) return EXPORT_MESSAGES.unauthorized;
  return apiErrorText(error) ?? EXPORT_MESSAGES.failed;
}

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
