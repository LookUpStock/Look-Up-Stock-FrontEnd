import { API_BASE_URL, API_PREFIX } from "./config.js";

export { API_BASE_URL };

export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function request(path, options = {}) {
  const { method = "GET", body, token } = options;
  const hasBody = body !== undefined;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const headers = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${normalizedPath}`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    throw new ApiError(0, "NETWORK_ERROR", "Der Server ist gerade nicht erreichbar.");
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
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

// For 422 INSUFFICIENT_DATA the message already names every asset, so details are not appended.
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

export function fetchHealth() {
  return getJson("/ping");
}

export function fetchPing() {
  return fetchHealth();
}

export function searchAssets(query, limit) {
  const params = new URLSearchParams({ q: query });
  if (limit !== undefined) {
    params.set("limit", String(limit));
  }
  return request(`/assets/search?${params}`);
}

export function registerUser(email, password) {
  return request("/auth/register", { method: "POST", body: { email, password } });
}

export function loginUser(email, password) {
  return request("/auth/login", { method: "POST", body: { email, password } });
}

export function logoutUser(token) {
  return request("/auth/logout", { method: "POST", token });
}

export function savePortfolio(token, name, positions) {
  return request("/portfolios", {
    method: "POST",
    token,
    body: { name, positions: positions.map((p) => ({ assetId: p.assetId, weight: p.weightPct })) },
  });
}

export function updatePortfolio(token, id, name, positions) {
  return request(`/portfolios/${id}`, {
    method: "PUT",
    token,
    body: { name, positions: positions.map((p) => ({ assetId: p.assetId, weight: p.weightPct })) },
  });
}

export function deletePortfolio(token, id) {
  return request(`/portfolios/${id}`, { method: "DELETE", token });
}

export function listPortfolios(token) {
  return request("/portfolios", { token });
}

export function fetchPortfolio(token, portfolioId) {
  return request(`/portfolios/${encodeURIComponent(portfolioId)}`, { token });
}

export function saveSimulation(token, portfolioId, parameters, name) {
  return request("/simulations", { method: "POST", token, body: { portfolioId, parameters, save: true, name } });
}

export function listSavedSimulations(token) {
  return request("/simulations", { token });
}

export function fetchSavedSimulation(token, simulationId) {
  return request(`/simulations/${encodeURIComponent(simulationId)}`, { token });
}

export function deleteSavedSimulation(token, simulationId) {
  return request(`/simulations/${encodeURIComponent(simulationId)}`, { method: "DELETE", token });
}

export function runSimulation(token, portfolioId, parameters) {
  return request("/simulations", { method: "POST", token, body: { portfolioId, parameters } });
}

export function runComparison(token, items, parameters) {
  return request("/comparisons", { method: "POST", token, body: { items, parameters, save: false, name: null } });
}

export function fetchDemoPortfolios() {
  return request("/demo/portfolios");
}

export function runDemoSimulation(portfolioId, parameters) {
  return request("/demo/simulations", { method: "POST", body: { portfolioId, parameters } });
}

export function fetchUsageReport(token, month) {
  const params = new URLSearchParams({ month });
  return request(`/reports/usage?${params}`, { token });
}
