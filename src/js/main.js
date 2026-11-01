// KI-Log Nr. 23: Einstiegspunkt mit KI erstellt, vom Team geprüft und angepasst

import { fetchHealth } from "./api.js";

function normalizeLocalhostOrigin() {
  if (window.location.hostname !== "127.0.0.1") {
    return;
  }

  const targetUrl = new URL(window.location.href);
  targetUrl.hostname = "localhost";
  window.location.replace(targetUrl.toString());
}

normalizeLocalhostOrigin();

import { initAssetSearch } from "./search.js";
import { initPortfolioEditor } from "./portfolio-ui.js";
import { initSimulationPage } from "./simulation.js";
import { initComparisonPage } from "./comparison.js";
import { initDemoPage } from "./demo.js";

import { readSession, renderAuthStatus, requireLogin, protectSection, initLoginPage, hasManagementRole } from "./auth.js";
import { initDashboard } from "./dashboard.js";
import { initDashboardExport } from "./dashboard-export.js";

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

// US-11: Der Navigationspunkt wird nur bei einer vom Backend gelieferten Management-Rolle angezeigt.
if (session.status === "valid" && hasManagementRole(session)) {
  const nav = document.querySelector(".main-nav");
  const link = document.createElement("a");
  link.href = "dashboard.html";
  link.className = "nav-link";
  link.textContent = "Auswertungen";
  if (currentPage === "dashboard.html") link.classList.add("active");
  nav?.insertBefore(link, document.getElementById("auth-status"));
}

if (document.getElementById("dashboard-content")) {
  initDashboard({ session });
  // US-12 (FE #52): CSV-Export des gewählten Monats
  initDashboardExport({ session });
}

// Portfolio-Editor nur mit Anmeldung (US-03); die Anlagensuche bleibt öffentlich (US-02)
protectSection(document.getElementById("portfolio-editor"), session, currentPage);

// Startseite (FE #38, US-09): Eigene Simulation und gespeicherte Simulationen nur mit Anmeldung;
// ohne Anmeldung erscheint dort ein Hinweis mit Link, dafür ist die Beispielsimulation sichtbar.
protectSection(document.getElementById("simulation-input"), session, currentPage);
protectSection(document.getElementById("saved-simulations"), session, currentPage);
if (document.getElementById("demo-simulation") && session.status !== "valid") {
  initDemoPage();
}

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
    await fetchHealth();
    statusElement.textContent = "Backend verbunden";
    statusElement.className = "status-ok";
  } catch (error) {
    statusElement.textContent = error.message;
    statusElement.className = "status-error";
    // Details für die Fehlersuche in der Konsole
    console.error("Health-Check fehlgeschlagen:", error);
  }
}

checkBackendStatus();


// Anlagensuche nur auf Seiten mit Suchbereich starten (portfolio.html, FE #1)
const searchSection = document.getElementById("asset-search");
const portfolioEditor = document.getElementById("portfolio-editor");
if (portfolioEditor) {
  // Der Editor muss vor der Suche auf das asset-selected-Ereignis warten.
  initPortfolioEditor();
}
if (searchSection) {
  initAssetSearch(searchSection);
}

// Simulation nur auf der Simulationsseite starten (index.html, FE #3, US-04)
if (document.getElementById("simulation-form") && session.status === "valid") {
  initSimulationPage();
}

if (document.getElementById("comparison-form") && session.status === "valid") {
  initComparisonPage();
}
