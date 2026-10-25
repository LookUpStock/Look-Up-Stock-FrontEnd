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
  const { method = "GET", body, token } = options;
  const hasBody = body !== undefined;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // Content-Type nur bei Anfragen mit Body setzen
  const headers = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  // Token nur bei geschützten Endpunkten als Bearer-Header mitschicken (ADR-06)
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${normalizedPath}`, {
      method,
      headers,
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

// KI-Log ME-[Nr.]: gemeinsame Fehlermeldung mit KI erstellt, von Mert Eminel geprüft (FE #34, B7)
// Anzeigetext zu einem ApiError: message und die Meldungen aus details.
// Bei 422 INSUFFICIENT_DATA nennt message bereits alle betroffenen Anlagen (E6),
// deshalb werden die details dort nicht angehängt, sonst stünde jede Anlage doppelt da (B7).
// Andere Fehler ergeben null, damit der Aufrufer seinen eigenen Text verwenden kann.
export function apiErrorText(error) {
  if (!(error instanceof ApiError)) {
    return null;
  }
  if (error.code === "INSUFFICIENT_DATA") {
    return error.message;
  }
  const details = (error.details ?? []).map((detail) => detail?.message).filter(Boolean);
  return [error.message, ...details].join(" ");
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

// Abmelden (POST /api/v1/auth/logout); Token im Authorization-Header, Antwort 204 ohne Body
export function logoutUser(token) {
  return request("/auth/logout", { method: "POST", token });
}

// Portfolio speichern (POST /api/v1/portfolios, US-03); liefert das gespeicherte Portfolio (201).
// Das Backend erwartet je Position die Datenbank-id der Anlage (assetId) und das Gewicht in Prozent.
export function savePortfolio(token, name, positions) {
  return request("/portfolios", {
    method: "POST",
    token,
    body: { name, positions: positions.map((p) => ({ assetId: p.assetId, weight: p.weightPct })) },
  });
}

// Portfolio ändern (PUT /api/v1/portfolios/{id})
export function updatePortfolio(token, id, name, positions) {
  return request(`/portfolios/${id}`, {
    method: "PUT",
    token,
    body: { name, positions: positions.map((p) => ({ assetId: p.assetId, weight: p.weightPct })) },
  });
}

// Portfolio löschen (DELETE /api/v1/portfolios/{id})
export function deletePortfolio(token, id) {
  return request(`/portfolios/${id}`, { method: "DELETE", token });
}

// Eigene Portfolios laden (GET /api/v1/portfolios); liefert { portfolios: [...] }, neueste zuerst
export function listPortfolios(token) {
  return request("/portfolios", { token });
}

// KI-Log ME-40: Endpunkte für gespeicherte Simulationen mit KI erstellt, von Mert Eminel geprüft (FE #17, US-08)
// Simulation berechnen und unter einem Namen speichern (POST /api/v1/simulations mit save: true, 201).
// Mit dem Seed der angezeigten Simulation entsteht dasselbe Ergebnis (E32, NF-08).
export function saveSimulation(token, portfolioId, parameters, name) {
  return request("/simulations", { method: "POST", token, body: { portfolioId, parameters, save: true, name } });
}

// Eigene gespeicherte Simulationen laden (GET /api/v1/simulations); liefert { simulations: [...] }, neueste zuerst
export function listSavedSimulations(token) {
  return request("/simulations", { token });
}

// Gespeicherte Simulation ohne Neuberechnung abrufen (GET /api/v1/simulations/{id})
export function fetchSavedSimulation(token, simulationId) {
  return request(`/simulations/${encodeURIComponent(simulationId)}`, { token });
}

// Gespeicherte Simulation löschen (DELETE /api/v1/simulations/{id}); Antwort 204
export function deleteSavedSimulation(token, simulationId) {
  return request(`/simulations/${encodeURIComponent(simulationId)}`, { method: "DELETE", token });
}

// Monte-Carlo-Simulation starten (POST /api/v1/simulations, US-04).
// parameters: { startCapital, monthlyContribution, horizonYears, paths, seed }; seed darf fehlen.
// Liefert u. a. timeline: [{ month, p5, p50, p95 }] für das Fächerdiagramm.
export function runSimulation(token, portfolioId, parameters) {
  return request("/simulations", { method: "POST", token, body: { portfolioId, parameters } });
}

// Zwei Portfolios oder Einzelanlagen mit denselben Parametern vergleichen (US-07).
export function runComparison(token, items, parameters) {
  return request("/comparisons", { method: "POST", token, body: { items, parameters, save: false, name: null } });
}
