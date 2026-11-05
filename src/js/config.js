const LOCAL_API_BASE_URL = "http://localhost:8080";
const REMOTE_API_BASE_URL = "https://lookupstock-da2951e42089.herokuapp.com";

function isLocalDevelopmentHost() {
  if (typeof window === "undefined") {
    return true;
  }

  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

export const API_BASE_URL = isLocalDevelopmentHost() ? LOCAL_API_BASE_URL : REMOTE_API_BASE_URL;

export const API_PREFIX = "/api/v1";
