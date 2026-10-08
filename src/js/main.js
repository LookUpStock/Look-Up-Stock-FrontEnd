// KI-Log Nr. 23: Einstiegspunkt mit KI erstellt, vom Team geprüft und angepasst

import { fetchPing } from "./api.js";

import { initAssetSearch } from "./search.js";

import { readSession, renderAuthStatus, requireLogin, protectSection, initLoginPage } from "./auth.js";

// ===== Anmeldung (FE #4, US-01) =====
// Die Anmeldung wird einmal gelesen und an alle Stellen weitergegeben, damit eine
// abgelaufene Anmeldung (E14) überall gleich erkannt wird.
const session = readSession();
const currentPage = window.location.pathname.split("/").pop() || "index.html";

// Geschützte Seite (Simulation, body data-requires-login="true"): ohne Anmeldung zur Anmeldeseite
if (document.body.dataset.requiresLogin === "true") {
  requireLogin(session, currentPage);
}

// Kopfzeile: "Anmelden" bzw. "angemeldet als … · Abmelden"
renderAuthStatus(document.getElementById("auth-status"), session);

// Portfolio-Editor nur mit Anmeldung (US-03); die Anlagensuche bleibt öffentlich (US-02)
protectSection(document.getElementById("portfolio-editor"), session, currentPage);

// Anmeldeseite (login.html)
if (document.getElementById("login-form")) {
  initLoginPage();
}

// Verbindung zum Backend prüfen und Ergebnis in der Statusleiste anzeigen
async function checkBackendStatus() {
  const statusElement = document.getElementById("backend-status");

  // Seite ohne Statusleiste: nichts zu tun
  if (!statusElement) {
    return;
  }

  try {
    await fetchPing();
    statusElement.textContent = "verbunden";
    statusElement.className = "status-ok";
  } catch (error) {
    statusElement.textContent = "nicht erreichbar";
    statusElement.className = "status-error";
    // Details für die Fehlersuche in der Konsole
    console.error("Ping fehlgeschlagen:", error);
  }
}

checkBackendStatus();


// Anlagensuche nur auf Seiten mit Suchbereich starten (portfolio.html, FE #1)
const searchSection = document.getElementById("asset-search");
if (searchSection) {
  initAssetSearch(searchSection);
}