// KI-Log Nr. 23: API-Schicht mit KI erstellt, vom Team geprüft und angepasst

import { API_BASE_URL, API_PREFIX } from "./config.js";

export { API_BASE_URL };

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
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${normalizedPath}`, {
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

export function getJson(path) {
  return request(path, { method: "GET" });
}

export function postJson(path, body) {
  return request(path, { method: "POST", body });
}

// Erreichbarkeit des Backends prüfen (GET /api/v1/ping)
export function fetchHealth() {
  return getJson("/ping");
}

export function fetchPing() {
  return fetchHealth();
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

// KI-Log Nr. [eintragen]: Anmelde-Endpunkte mit KI erstellt, von Mert Eminel geprüft (FE #4, US-01)
// Konto anlegen (POST /api/v1/auth/register); liefert { id, email }, aber keinen Token (E13)
export function registerUser(email, password) {
  return request("/auth/register", { method: "POST", body: { email, password } });
}

// Anmelden (POST /api/v1/auth/login); liefert { token, expiresAt }
export function loginUser(email, password) {
  return request("/auth/login", { method: "POST", body: { email, password } });
}

// Abmelden (POST /api/v1/auth/logout); Token steht laut API-Design im Body, Antwort 204 ohne Body
export function logoutUser(token) {
  return request("/auth/logout", { method: "POST", body: { token } });
}

// Portfolio speichern (POST /api/v1/portfolios, US-03); liefert das gespeicherte Portfolio (201).
// Das Backend erwartet je Position die Datenbank-id der Anlage (assetId) und das Gewicht in Prozent.
export function savePortfolio(token, name, positions) {
  return request("/portfolios", {
    method: "POST",
    body: { token, name, positions: positions.map((p) => ({ assetId: p.assetId, weight: p.weightPct })) },
  });
}

// Eigene Portfolios laden (POST /api/v1/portfolios/list); liefert { portfolios: [...] }, neueste zuerst
export function listPortfolios(token) {
  return request("/portfolios/list", { method: "POST", body: { token } });
}
