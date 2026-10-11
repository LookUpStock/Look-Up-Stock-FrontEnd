const LOCAL_API_BASE_URL = "http://localhost:8080";

function normalizeBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/$/, "");
}

function getRuntimeOverride() {
  if (typeof window === "undefined") {
    return "";
  }

  const explicitOverride = window.LOOKUPSTOCK_API_BASE_URL ?? window.__LOOKUPSTOCK_API_BASE_URL__;

  return normalizeBaseUrl(explicitOverride);
}

function isLocalDevelopmentHost() {
  if (typeof window === "undefined") {
    return true;
  }

  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function getDefaultApiBaseUrl() {
  if (typeof window === "undefined") {
    return LOCAL_API_BASE_URL;
  }

  if (isLocalDevelopmentHost()) {
    return LOCAL_API_BASE_URL;
  }

  return normalizeBaseUrl(window.location.origin);
}

export const API_BASE_URL = getRuntimeOverride() || getDefaultApiBaseUrl();
