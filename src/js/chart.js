// KI-Log Nr. [eintragen]: Fächerdiagramm mit KI erstellt, vom Team zu prüfen (FE #3, US-04)

// Fächerdiagramm der Simulation als SVG, ohne externe Bibliothek.
//
// Erwartete Eingabe ist das Feld "timeline" aus der Antwort der Simulation:
//   [
//     { "month": 0,   "p5": 10000,   "p50": 10000,     "p95": 10000 },
//     { "month": 240, "p5": 61200.1, "p50": 112340.55, "p95": 205880.9 }
//   ]
// Ein Punkt pro Monat (0 bis horizonYears × 12).
// p5, p50, p95 = pessimistischer, mittlerer und optimistischer Verlauf.

const SVG_NS = "http://www.w3.org/2000/svg";

// Größe der Zeichenfläche; das SVG skaliert über viewBox auf die Breite der Karte
export const CHART_SIZE = { width: 720, height: 360, top: 16, right: 16, bottom: 40, left: 96 };

const MAX_Y_TICKS = 5;
const MAX_X_TICKS = 8;

const euroFormat = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function formatEuro(value) {
  return euroFormat.format(value);
}

// ===== Logik: ohne Browser testbar =====

// Runde Schrittweite für die Achse (1, 2, 5, 10 × Zehnerpotenz)
export function niceStep(rawStep) {
  if (!(rawStep > 0)) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

// Abstand der Jahresbeschriftung, damit höchstens MAX_X_TICKS Beschriftungen entstehen
export function yearStep(horizonYears) {
  return [1, 2, 5, 10].find((step) => horizonYears / step <= MAX_X_TICKS) ?? 10;
}

function toPath(points) {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

// Berechnet Linien, Fläche und Achsen in Koordinaten der Zeichenfläche
export function buildFanChartGeometry(timeline, size = CHART_SIZE) {
  const plotWidth = size.width - size.left - size.right;
  const plotHeight = size.height - size.top - size.bottom;
  const lastMonth = Math.max(1, timeline[timeline.length - 1]?.month ?? 0);

  const maxValue = Math.max(0, ...timeline.map((point) => point.p95));
  const step = niceStep(maxValue / MAX_Y_TICKS);
  const yMax = Math.max(step, Math.ceil(maxValue / step) * step);

  const x = (month) => size.left + (month / lastMonth) * plotWidth;
  const y = (value) => size.top + plotHeight - (value / yMax) * plotHeight;

  const upper = timeline.map((point) => [x(point.month), y(point.p95)]);
  const lower = timeline.map((point) => [x(point.month), y(point.p5)]);

  const yTicks = [];
  for (let value = 0; value <= yMax + step / 2; value += step) {
    yTicks.push({ value, y: y(value), label: formatEuro(value) });
  }

  const horizonYears = lastMonth / 12;
  const everyYears = yearStep(horizonYears);
  const xTicks = [];
  for (let year = 0; year <= horizonYears; year += everyYears) {
    xTicks.push({ year, x: x(year * 12), label: `${year} J.` });
  }

  return {
    // Fläche von p5 bis p95: oben nach rechts, unten zurück nach links
    band: `${toPath(upper)} ${toPath(lower.reverse()).replace(/^M/, "L")} Z`,
    p5: toPath(timeline.map((point) => [x(point.month), y(point.p5)])),
    p50: toPath(timeline.map((point) => [x(point.month), y(point.p50)])),
    p95: toPath(upper),
    yTicks,
    xTicks,
    plot: { left: size.left, right: size.width - size.right, top: size.top, bottom: size.top + plotHeight },
  };
}

// Kurzbeschreibung für Screenreader
export function describeFanChart(timeline) {
  const last = timeline[timeline.length - 1];
  if (!last) {
    return "Keine Daten.";
  }
  return `Nach ${last.month / 12} Jahren: ungünstig ${formatEuro(last.p5)}, mittel ${formatEuro(last.p50)}, günstig ${formatEuro(last.p95)}.`;
}

// ===== Anzeige =====

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function svgText(text, attributes) {
  const element = svgElement("text", attributes);
  element.textContent = text;
  return element;
}

// Zeichnet das Fächerdiagramm in den übergebenen Container
export function renderFanChart(container, timeline) {
  container.replaceChildren();
  if (!timeline?.length) {
    container.textContent = "Keine Daten für das Diagramm.";
    return;
  }

  const geometry = buildFanChartGeometry(timeline);
  const { plot } = geometry;

  const svg = svgElement("svg", {
    viewBox: `0 0 ${CHART_SIZE.width} ${CHART_SIZE.height}`,
    class: "fan-chart",
    role: "img",
    "aria-label": `Fächerdiagramm der möglichen Wertverläufe. ${describeFanChart(timeline)}`,
  });

  for (const tick of geometry.yTicks) {
    svg.append(
      svgElement("line", { x1: plot.left, x2: plot.right, y1: tick.y, y2: tick.y, class: "fan-chart-grid" }),
      svgText(tick.label, { x: plot.left - 8, y: tick.y + 4, "text-anchor": "end", class: "fan-chart-label" })
    );
  }
  for (const tick of geometry.xTicks) {
    svg.append(svgText(tick.label, { x: tick.x, y: plot.bottom + 24, "text-anchor": "middle", class: "fan-chart-label" }));
  }

  svg.append(
    svgElement("line", { x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, class: "fan-chart-axis" }),
    svgElement("path", { d: geometry.band, class: "fan-chart-band" }),
    svgElement("path", { d: geometry.p5, class: "fan-chart-edge" }),
    svgElement("path", { d: geometry.p95, class: "fan-chart-edge" }),
    svgElement("path", { d: geometry.p50, class: "fan-chart-median" })
  );

  const legend = document.createElement("ul");
  legend.className = "fan-chart-legend";
  for (const [className, text] of [
    ["legend-median", "Mittlerer Verlauf (Median, p50)"],
    ["legend-band", "90 % der Verläufe (p5 bis p95)"],
  ]) {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = `legend-swatch ${className}`;
    item.append(swatch, text);
    legend.append(item);
  }

  container.append(svg, legend);
}
