// KI-Log Nr. 23: Platzhalter mit KI erstellt, vom Team geprüft und angepasst

// Platzhalter für das Fächerdiagramm der Simulation (Umsetzung in FE #3, US-04).
//
// Erwartete Eingabe ist das Feld "timeline" aus der Antwort der Simulation:
//   [
//     { "month": 0,   "p5": 10000,   "p50": 10000,     "p95": 10000 },
//     { "month": 240, "p5": 61200.1, "p50": 112340.55, "p95": 205880.9 }
//   ]
// Ein Punkt pro Monat (0 bis horizonYears × 12).
// p5, p50, p95 = pessimistischer, mittlerer und optimistischer Verlauf.

// Zeichnet das Fächerdiagramm in den übergebenen Container
export function renderFanChart(container, timeline) {
  // Wird in FE #3 umgesetzt; bis dahin nur ein Hinweis im Container
  container.textContent = `Diagramm folgt in FE #3 (${timeline.length} Datenpunkte erhalten).`;
}