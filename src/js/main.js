// KI-Log Nr. 23: Einstiegspunkt mit KI erstellt, vom Team geprüft und angepasst

import { fetchPing } from "./api.js";

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