import { fetchHealth } from "./api.js";
import { addDashboardNavigationLink } from "./dashboard-navigation.js";

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

import { readSession, renderAuthStatus, requireLogin, protectSection, initLoginPage } from "./auth.js";
import { initDashboard } from "./dashboard.js";
import { initDashboardExport } from "./dashboard-export.js";

const session = readSession();
const currentPage = window.location.pathname.split("/").pop() || "index.html";

if (document.body.dataset.requiresLogin === "true") {
  requireLogin(session, currentPage);
}

renderAuthStatus(document.getElementById("auth-status"), session);

addDashboardNavigationLink(document, session, currentPage);

if (document.getElementById("dashboard-content")) {
  initDashboard({ session });
  initDashboardExport({ session });
}

protectSection(document.getElementById("portfolio-editor"), session, currentPage);

protectSection(document.getElementById("simulation-input"), session, currentPage);
protectSection(document.getElementById("saved-simulations"), session, currentPage);
if (document.getElementById("demo-simulation") && session.status !== "valid") {
  initDemoPage();
}

if (document.getElementById("login-form")) {
  initLoginPage();
}

async function checkBackendStatus() {
  const statusElement = document.getElementById("backend-status");

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
    console.error("Health-Check fehlgeschlagen:", error);
  }
}

checkBackendStatus();


const searchSection = document.getElementById("asset-search");
const portfolioEditor = document.getElementById("portfolio-editor");
if (portfolioEditor) {
  initPortfolioEditor();
}
if (searchSection) {
  initAssetSearch(searchSection);
}

if (document.getElementById("simulation-form") && session.status === "valid") {
  initSimulationPage();
}

if (document.getElementById("comparison-form") && session.status === "valid") {
  initComparisonPage();
}
