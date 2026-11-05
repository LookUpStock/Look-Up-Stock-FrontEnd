const SVG_NS = "http://www.w3.org/2000/svg";

export const CHART_SIZE = { width: 720, height: 360, top: 16, right: 16, bottom: 40, left: 96 };

// Estimated y-label width: a digit is about 0.6 × the font size of .fan-chart-label.
const LABEL_FONT_SIZE = 20;
const LABEL_CHAR_WIDTH_RATIO = 0.6;
const LABEL_GAP = 8;
const LABEL_PADDING = 4;

const MAX_Y_TICKS = 5;
const MAX_X_TICKS = 8;

const euroFormat = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function formatEuro(value) {
  return euroFormat.format(value);
}

export function niceStep(rawStep) {
  if (!(rawStep > 0)) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

export function buildFanChartYScale(timelines) {
  const maxValue = Math.max(0, ...timelines.flatMap((timeline) =>
    (timeline ?? []).map((point) => point.p95)));
  const yStep = niceStep(maxValue / MAX_Y_TICKS);
  const yMax = Math.max(yStep, Math.ceil(maxValue / yStep) * yStep);
  return { yMax, yStep };
}

export function yearStep(horizonYears) {
  return [1, 2, 5, 10].find((step) => horizonYears / step <= MAX_X_TICKS) ?? 10;
}

function toPath(points) {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export function leftMarginForLabels(labels, minLeft = CHART_SIZE.left) {
  const longest = Math.max(0, ...labels.map((label) => label.length));
  const labelWidth = Math.ceil(longest * LABEL_FONT_SIZE * LABEL_CHAR_WIDTH_RATIO);
  return Math.max(minLeft, labelWidth + LABEL_GAP + LABEL_PADDING);
}

export function buildFanChartGeometry(timeline, size = CHART_SIZE, yScale = null) {
  const lastMonth = Math.max(1, timeline[timeline.length - 1]?.month ?? 0);

  const { yMax, yStep } = yScale ?? buildFanChartYScale([timeline]);

  const yValues = [];
  for (let value = 0; value <= yMax + yStep / 2; value += yStep) {
    yValues.push(value);
  }
  const left = leftMarginForLabels(yValues.map(formatEuro), size.left);

  const plotWidth = size.width - left - size.right;
  const plotHeight = size.height - size.top - size.bottom;

  const x = (month) => left + (month / lastMonth) * plotWidth;
  const y = (value) => size.top + plotHeight - (value / yMax) * plotHeight;

  const upper = timeline.map((point) => [x(point.month), y(point.p95)]);
  const lower = timeline.map((point) => [x(point.month), y(point.p5)]);

  const yTicks = yValues.map((value) => ({ value, y: y(value), label: formatEuro(value) }));

  const horizonYears = lastMonth / 12;
  const everyYears = yearStep(horizonYears);
  const xTicks = [];
  for (let year = 0; year <= horizonYears; year += everyYears) {
    xTicks.push({ year, x: x(year * 12), label: `${year} J.` });
  }

  return {
    band: `${toPath(upper)} ${toPath(lower.reverse()).replace(/^M/, "L")} Z`,
    p5: toPath(timeline.map((point) => [x(point.month), y(point.p5)])),
    p50: toPath(timeline.map((point) => [x(point.month), y(point.p50)])),
    p95: toPath(upper),
    yTicks,
    xTicks,
    plot: { left, right: size.width - size.right, top: size.top, bottom: size.top + plotHeight },
  };
}

export function describeFanChart(timeline) {
  const last = timeline[timeline.length - 1];
  if (!last) {
    return "Keine Daten.";
  }
  return `Nach ${last.month / 12} Jahren: ungünstig ${formatEuro(last.p5)}, mittel ${formatEuro(last.p50)}, günstig ${formatEuro(last.p95)}.`;
}

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

export function renderFanChart(container, timeline, yScale = null) {
  container.replaceChildren();
  if (!timeline?.length) {
    container.textContent = "Keine Daten für das Diagramm.";
    return;
  }

  const geometry = buildFanChartGeometry(timeline, CHART_SIZE, yScale);
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
