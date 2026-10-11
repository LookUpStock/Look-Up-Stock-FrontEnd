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