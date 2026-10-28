import { hasManagementRole, loginPageUrl, REASONS } from "./auth.js";

export const DASHBOARD_METRICS = [
  ["registrations", "Neue Registrierungen"],
  ["logins", "Anmeldungen"],
  ["portfoliosCreated", "Angelegte Portfolios"],
  ["simulationsRun", "Durchgeführte Simulationen"],
  ["simulationsSaved", "Gespeicherte Simulationen"],
  ["comparisonsRun", "Durchgeführte Vergleiche"],
  ["guestSimulations", "Beispielsimulationen (Gäste)"],
  ["assetSearches", "Anlagensuchen"],
  ["accountsAtMonthEnd", "Nutzerkonten insgesamt am Monatsende"],
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

function renderMetrics(target, metrics) {
  target.replaceChildren();
  for (const [key, label] of DASHBOARD_METRICS) {
    const row = document.createElement("tr");
    const name = document.createElement("th");
    const value = document.createElement("td");
    name.scope = "row";
    name.textContent = label;
    const metric = metrics?.[key];
    value.textContent = Number.isFinite(metric) ? new Intl.NumberFormat("de-DE").format(metric) : "–";
    row.append(name, value);
    target.append(row);
  }
}

export function initDashboard({ root = document, session, loadMetrics } = {}) {
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
  const tbody = root.getElementById("dashboard-metrics");
  const notice = root.getElementById("dashboard-notice");
  const nowMonth = currentBerlinMonth();
  monthInput.max = nowMonth;
  monthInput.value = nowMonth;

  async function update() {
    monthLabel.textContent = formatMonth(monthInput.value);
    const isCurrentMonth = monthInput.value === nowMonth;
    root.getElementById("dashboard-provisional").hidden = !isCurrentMonth;
    notice.textContent = "";
    try {
      const result = loadMetrics ? await loadMetrics(monthInput.value, session.token) : null;
      if (!result || result.available === false) {
        tbody.replaceChildren();
        notice.textContent = "Für diesen Monat liegen keine Auswertungen vor.";
        return;
      }
      renderMetrics(tbody, result.metrics ?? result);
    } catch (error) {
      tbody.replaceChildren();
      notice.textContent = error?.status === 401
        ? "Bitte melde dich erneut an."
        : error?.status === 403
          ? "Dafür fehlt die Berechtigung."
          : "Die Auswertungen konnten nicht geladen werden.";
    }
  }

  monthInput.addEventListener("change", update);
  update();
}
