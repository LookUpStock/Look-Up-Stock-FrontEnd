// Hash-Router für den SPA-Touchpoint (Docs #160, FE #53).

const ROUTE_TITLES = {
  portfolios: "Portfolios",
  portfolio: "Portfolio",
  simulations: "Gespeicherte Simulationen",
  simulation: "Gespeicherte Simulation",
  "not-found": "Seite nicht gefunden",
};

// Übersetzt den aktuellen Hash in eine Ansicht und ihre Parameter.
export function resolveRoute(hash = "") {
  const rawPath = String(hash).replace(/^#/, "") || "/portfolios";
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;

  if (path === "/portfolios") {
    return { name: "portfolios", params: {} };
  }
  if (path === "/simulations") {
    return { name: "simulations", params: {} };
  }

  const portfolioMatch = path.match(/^\/portfolios\/([^/]+)$/);
  if (portfolioMatch) {
    const id = decodeRouteId(portfolioMatch[1]);
    return id ? { name: "portfolio", params: { id } } : notFoundRoute();
  }

  const simulationMatch = path.match(/^\/simulations\/([^/]+)$/);
  if (simulationMatch) {
    const id = decodeRouteId(simulationMatch[1]);
    return id ? { name: "simulation", params: { id } } : notFoundRoute();
  }

  return notFoundRoute();
}

function decodeRouteId(rawId) {
  try {
    const id = decodeURIComponent(rawId);
    return /^\d+$/.test(id) && Number(id) > 0 ? id : null;
  } catch {
    return null;
  }
}

function notFoundRoute() {
  return { name: "not-found", params: {} };
}

// Startet die Navigation, aktualisiert den Titel und setzt den Fokus auf die neue Überschrift.
export function createHashRouter({ window: browserWindow = globalThis.window, render }) {
  let navigation = 0;
  let lastHash = null;

  async function handleNavigation() {
    const hash = browserWindow.location.hash;
    if (hash === lastHash) return;
    lastHash = hash;
    const currentNavigation = ++navigation;
    const route = resolveRoute(hash);
    browserWindow.document.title = `${ROUTE_TITLES[route.name]} – LookUpStock (SPA)`;
    await render(route);

    if (currentNavigation !== navigation) {
      return;
    }
    browserWindow.document.querySelector("#route-view h1")?.focus();
  }

  function start() {
    if (!browserWindow.location.hash) {
      browserWindow.location.hash = "/portfolios";
    }
    browserWindow.addEventListener("hashchange", handleNavigation);
    return handleNavigation();
  }

  function stop() {
    browserWindow.removeEventListener("hashchange", handleNavigation);
    lastHash = null;
  }

  return { start, stop, handleNavigation };
}
