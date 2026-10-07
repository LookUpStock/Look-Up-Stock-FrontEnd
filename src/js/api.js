// KI-Log Nr. 23: API-Schicht mit KI erstellt, vom Team geprüft und angepasst

// Basis-URL des Backends; für das Deployment auf dem Server später anpassen
export const API_BASE_URL = "http://localhost:8080/api/v1";

// Fehler aus der API mit HTTP-Status, Fehlercode, deutscher Meldung und Details
export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Zentrale Funktion für alle Anfragen an das Backend
export async function request(path, options = {}) {
  const { method = "GET", body } = options;
  const hasBody = body !== undefined;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      // Content-Type nur bei Anfragen mit Body setzen
      headers: hasBody ? { "Content-Type": "application/json" } : {},
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    // Backend nicht gestartet, falsche Adresse oder CORS abgelehnt
    throw new ApiError(0, "NETWORK_ERROR", "Der Server ist gerade nicht erreichbar.");
  }

  // 204 No Content liefert keinen Body (z. B. beim Löschen)
  if (response.status === 204) {
    return null;
  }

  // Antwort als JSON lesen; bei leerem oder ungültigem Body null
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // Fehlerformat laut API-Design: { "error": { "code", "message", "details" } }
    const error = data?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? "Ein unerwarteter Fehler ist aufgetreten.",
      error?.details ?? []
    );
  }

  return data;
}

// Erreichbarkeit des Backends prüfen (GET /api/v1/ping)
export function fetchPing() {
  return request("/ping");
}

// KI-Log Nr. 19: Suchfunktion mit KI erstellt, von Mert Eminel geprüft (FE #1)
// Anlagen nach Ticker, ISIN oder Name suchen (GET /api/v1/assets/search, US-02)
// Ohne limit gilt der Standard des Backends (10 Treffer, erlaubt sind 1 bis 25)
export function searchAssets(query, limit) {
  const params = new URLSearchParams({ q: query });
  if (limit !== undefined) {
    params.set("limit", String(limit));
  }
  return request(`/assets/search?${params}`);
}