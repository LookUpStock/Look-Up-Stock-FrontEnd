import { fetchUsageReport } from "./api.js";
import { hasManagementRole, loginPageUrl, REASONS } from "./auth.js";

export const DASHBOARD_METRICS = [
  ["registrations", "Neue Registrierungen"],
  ["logins", "Anmeldungen"],
  ["portfoliosCreated", "Angelegte Portfolios"],
  ["simulationsRun", "Durchgeführte Simulationen"],
  ["simulationsSaved", "Gespeicherte Simulationen"],
  ["comparisonsRun", "Durchgeführte Vergleiche"],
  ["demoSimulationsRun", "Beispielsimulationen (Gäste)"],
  ["assetSearches", "Anlagensuchen"],
  ["totalAccounts", "Nutzerkonten insgesamt am Monatsende"],
];

export function currentBerlinMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}`;
}

export function formatMonth(month) {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, number - 1, 1)));
}

export function formatTrackingDate(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "–";
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

export function normalizeUsageMetrics(metrics) {
  const byKey = Array.isArray(metrics)
    ? Object.fromEntries(metrics.map((metric) => [metric.key, metric]))
    : metrics ?? {};
  return DASHBOARD_METRICS.map(([key, fallbackLabel]) => {
    const metric = byKey[key];
    return {
      key,
      label: metric?.label ?? fallbackLabel,
      value: typeof metric === "number" ? metric : metric?.value,
    };
  });
}

function renderMetrics(target, metrics, createElement) {
  target.replaceChildren();
  for (const metric of normalizeUsageMetrics(metrics)) {
    const row = createElement("tr");
    const name = createElement("th");
    const value = createElement("td");
    name.scope = "row";
    name.textContent = metric.label;
    value.textContent = Number.isFinite(metric.value)
      ? new Intl.NumberFormat("de-DE").format(metric.value)
      : "–";
    row.append(name, value);
    target.append(row);
  }
}

export function initDashboard({ root = document, session, loadMetrics = fetchUsageReport } = {}) {
  if (session?.status !== "valid") {
    window.location.replace(loginPageUrl(session?.status === "expired" ? REASONS.expired : REASONS.notLoggedIn, "dashboard.html"));
    return;
  }

  if (!hasManagementRole(session)) {
    root.getElementById("dashboard-content").hidden = true;
    const denial = root.getElementById("dashboard-denied");
    denial.hidden = false;
    return;
  }

  const monthInput = root.getElementById("dashboard-month");
  const monthLabel = root.getElementById("dashboard-month-label");
  const provisional = root.getElementById("dashboard-provisional");
  const trackingSince = root.getElementById("dashboard-tracking-since");
  const tbody = root.getElementById("dashboard-metrics");
  const notice = root.getElementById("dashboard-notice");
  const setNotice = (message) => {
    notice.textContent = message;
    notice.hidden = !message;
  };
  const nowMonth = currentBerlinMonth();
  let requestVersion = 0;
  monthInput.max = nowMonth;
  monthInput.value = nowMonth;

  async function update() {
    const version = ++requestVersion;
    const month = monthInput.value;
    monthLabel.textContent = month ? formatMonth(month) : "";
    provisional.hidden = true;
    trackingSince.textContent = "";
    tbody.replaceChildren();
    setNotice("");

    if (!month) {
      setNotice("Bitte wähle einen Monat aus.");
      return;
    }

    setNotice("Auswertungen werden geladen …");
    try {
      const result = await loadMetrics(session.token, month);
      if (version !== requestVersion) return;
      provisional.hidden = !result.preliminary;
      trackingSince.textContent = `Erfassung seit ${formatTrackingDate(result.trackingSince)}`;
      renderMetrics(tbody, result.metrics, root.createElement.bind(root));
      setNotice("");
    } catch (error) {
      if (version !== requestVersion) return;
      tbody.replaceChildren();
      setNotice(error?.status === 400
        ? error.message
        : error?.status === 401
          ? "Bitte melde dich erneut an."
          : error?.status === 403
            ? "Dafür fehlt die Berechtigung."
            : "Die Auswertungen konnten nicht geladen werden.");
    }
  }

  monthInput.addEventListener("change", update);
  update();
}
