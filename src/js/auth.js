// KI-Log Nr. [eintragen]: Login- und Registrierungsmaske mit KI erstellt, von Mert Eminel geprüft (FE #4, US-01)

import { registerUser, loginUser, logoutUser, ApiError } from "./api.js";

// Regeln laut API-Design und Kurzformat-Tabellen Sprint 2 (US-01)
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_EMAIL_LENGTH = 255;
// Gleiches Muster wie im Backend (AuthService, BE #30), damit Frontend und Backend gleich entscheiden
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Schlüssel, unter dem die Anmeldung im Browser gespeichert wird
export const SESSION_KEY = "lookupstock.session";

// Seiten, auf die nach dem Login zurückgeleitet werden darf (keine fremden Adressen)
const ALLOWED_NEXT_PAGES = ["index.html", "portfolio.html", "dashboard.html"];
export const DEFAULT_NEXT_PAGE = "portfolio.html";

// Texte laut API-Design und PO-Entscheidungen E12 bis E14
export const MESSAGES = {
  invalidEmail: "Bitte gib eine gültige E-Mail-Adresse ein.",
  passwordTooShort: "Das Passwort muss mindestens 8 Zeichen haben.",
  missingCredentials: "Bitte E-Mail-Adresse und Passwort eingeben.",
  registered: "Registrierung erfolgreich. Bitte melde dich jetzt an.",
  expired: "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.",
  notLoggedIn: "Bitte melde dich an.",
  loggedOut: "Du hast dich abgemeldet.",
  unexpected: "Ein unerwarteter Fehler ist aufgetreten.",
};

// Grund für die Weiterleitung zur Anmeldung (Parameter "grund" in login.html)
export const REASONS = {
  expired: "abgelaufen",
  notLoggedIn: "anmelden",
  loggedOut: "abgemeldet",
};

// ===== Logik: ohne Browser testbar =====

// Leerzeichen entfernen und klein schreiben (E11: Groß- und Kleinschreibung spielen keine Rolle)
export function normalizeEmail(input) {
  return (input ?? "").trim().toLowerCase();
}

// E12: gültiges E-Mail-Format; liefert die Fehlermeldung oder null
export function validateEmail(email) {
  const value = normalizeEmail(email);
  if (value.length === 0 || value.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(value)) {
    return MESSAGES.invalidEmail;
  }
  return null;
}

// Passwort mit mindestens 8 Zeichen; die Obergrenze von 72 Byte prüft das Backend
export function validatePassword(password) {
  if ((password ?? "").length < MIN_PASSWORD_LENGTH) {
    return MESSAGES.passwordTooShort;
  }
  return null;
}

// Prüft beide Felder der Registrierung vor dem Absenden
export function validateRegistration(email, password) {
  const errors = { email: validateEmail(email), password: validatePassword(password) };
  return { valid: !errors.email && !errors.password, errors };
}

// Beim Login nur prüfen, ob beide Felder ausgefüllt sind; alles andere entscheidet das Backend
export function validateLogin(email, password) {
  if (normalizeEmail(email).length === 0 || (password ?? "").length === 0) {
    return MESSAGES.missingCredentials;
  }
  return null;
}

// Speicher im Browser; in Tests wird ein eigener Speicher übergeben
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Anmeldung nach dem Login speichern
export function saveSession(loginResponse, email, storage = browserStorage()) {
  const session = { token: loginResponse.token, expiresAt: loginResponse.expiresAt, email };
  if (loginResponse.role !== undefined) session.role = loginResponse.role;
  if (loginResponse.roles !== undefined) session.roles = loginResponse.roles;
  storage?.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

// Management navigation is shown only when the API supplied a recognized role.
export function hasManagementRole(session) {
  const roles = [session?.role, ...(Array.isArray(session?.roles) ? session.roles : [])]
    .filter((role) => typeof role === "string")
    .map((role) => role.trim().toUpperCase().replace(/[Ä]/g, "AE").replace(/[^A-Z0-9]/g, ""));
  return roles.some((role) => ["GESCHAEFTSFUEHRUNG", "MANAGEMENT", "BUSINESSMANAGEMENT"].includes(role));
}

export function clearSession(storage = browserStorage()) {
  storage?.removeItem(SESSION_KEY);
}

// Liest die gespeicherte Anmeldung und prüft den Ablauf über expiresAt (E14, NF-16).
// Ergebnis: { status: "none" } | { status: "expired" } | { status: "valid", token, expiresAt, email }
// Eine abgelaufene Anmeldung wird dabei gelöscht.
export function readSession(storage = browserStorage(), now = Date.now()) {
  const raw = storage?.getItem(SESSION_KEY);
  if (!raw) {
    return { status: "none" };
  }

  let session;
  try {
    session = JSON.parse(raw);
  } catch {
    clearSession(storage);
    return { status: "none" };
  }

  const expiresAt = Date.parse(session?.expiresAt);
  if (!session?.token || Number.isNaN(expiresAt)) {
    clearSession(storage);
    return { status: "none" };
  }

  // Genau auf dem Ablaufzeitpunkt gilt die Anmeldung als abgelaufen (wie im Backend)
  if (now >= expiresAt) {
    clearSession(storage);
    return { status: "expired" };
  }

  return { status: "valid", ...session };
}

// Token für geschützte Anfragen (z. B. Portfolio speichern); null, wenn nicht angemeldet
export function getToken(storage = browserStorage(), now = Date.now()) {
  const session = readSession(storage, now);
  return session.status === "valid" ? session.token : null;
}

// true, wenn das Backend die Anmeldung abgelehnt hat (401); andere Module leiten dann zur Anmeldung
export function isUnauthorized(error) {
  return error instanceof ApiError && error.status === 401;
}

// Nur bekannte Seiten als Rücksprungziel zulassen
export function safeNextPage(page) {
  return ALLOWED_NEXT_PAGES.includes(page) ? page : DEFAULT_NEXT_PAGE;
}

export function loginPageUrl(reason, nextPage) {
  const params = new URLSearchParams();
  if (reason) {
    params.set("grund", reason);
  }
  if (nextPage) {
    params.set("weiter", safeNextPage(nextPage));
  }
  const query = params.toString();
  return query ? `login.html?${query}` : "login.html";
}

// Für geschützte Seiten: null, wenn angemeldet; sonst die Adresse der Anmeldeseite mit Grund
export function loginRedirectFor(session, currentPage) {
  if (session.status === "valid") {
    return null;
  }
  const reason = session.status === "expired" ? REASONS.expired : REASONS.notLoggedIn;
  return loginPageUrl(reason, currentPage);
}

// Hinweistext zum Grund der Weiterleitung
export function reasonMessage(reason) {
  switch (reason) {
    case REASONS.expired:
      return MESSAGES.expired;
    case REASONS.notLoggedIn:
      return MESSAGES.notLoggedIn;
    case REASONS.loggedOut:
      return MESSAGES.loggedOut;
    default:
      return "";
  }
}

function messageFrom(error) {
  // Bei ApiError kommt die Meldung bereits auf Deutsch vom Backend (z. B. 409, 401)
  return error instanceof ApiError ? error.message : MESSAGES.unexpected;
}

// Registrierung: erst im Browser prüfen, dann an das Backend senden.
// Nach Erfolg ist der Nutzer noch nicht angemeldet (E13).
export async function submitRegistration(email, password, register = registerUser) {
  const check = validateRegistration(email, password);
  if (!check.valid) {
    return { status: "invalid", errors: check.errors };
  }

  const normalized = normalizeEmail(email);
  try {
    await register(normalized, password);
    return { status: "registered", email: normalized };
  } catch (error) {
    return { status: "error", message: messageFrom(error) };
  }
}

// Anmeldung: bei Erfolg Token und Ablaufzeitpunkt speichern
export async function submitLogin(email, password, { login = loginUser, storage = browserStorage() } = {}) {
  const missing = validateLogin(email, password);
  if (missing) {
    return { status: "invalid", message: missing };
  }

  const normalized = normalizeEmail(email);
  try {
    const response = await login(normalized, password);
    const session = saveSession(response, normalized, storage);
    return { status: "logged-in", session };
  } catch (error) {
    return { status: "error", message: messageFrom(error) };
  }
}

// Abmelden: Token beim Backend sperren und lokal löschen.
// Lokal wird auch gelöscht, wenn das Backend nicht erreichbar ist.
export async function submitLogout({ logout = logoutUser, storage = browserStorage() } = {}) {
  const raw = storage?.getItem(SESSION_KEY);
  let token = null;
  try {
    token = raw ? JSON.parse(raw).token : null;
  } catch {
    token = null;
  }

  clearSession(storage);
  if (token) {
    try {
      await logout(token);
    } catch (error) {
      console.error("Abmelden beim Backend fehlgeschlagen:", error);
    }
  }
}

// ===== Anzeige: verbindet die Logik mit der Seite =====

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

// Kopfzeile: "Anmelden" oder "angemeldet als … · Abmelden"
export function renderAuthStatus(container, session) {
  if (!container) {
    return;
  }
  container.replaceChildren();

  if (session.status === "valid") {
    const user = document.createElement("span");
    user.className = "auth-user";
    user.textContent = session.email;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button-link";
    button.textContent = "Abmelden";
    button.addEventListener("click", async () => {
      button.disabled = true;
      await submitLogout();
      window.location.assign(loginPageUrl(REASONS.loggedOut));
    });

    container.append(user, button);
    return;
  }

  const link = document.createElement("a");
  link.href = "login.html";
  link.className = "nav-link";
  link.textContent = "Anmelden";
  if (window.location.pathname.endsWith("login.html")) {
    link.classList.add("active");
  }
  container.append(link);
}

// Geschützte Seite (z. B. Simulation): ohne gültige Anmeldung zur Anmeldeseite weiterleiten
export function requireLogin(session, currentPage) {
  const target = loginRedirectFor(session, currentPage);
  if (target) {
    window.location.replace(target);
    return false;
  }
  return true;
}

// Geschützter Bereich auf einer öffentlichen Seite (Portfolio-Editor):
// ohne Anmeldung wird der Inhalt ausgeblendet und ein Hinweis mit Link angezeigt
export function protectSection(section, session, currentPage) {
  const target = loginRedirectFor(session, currentPage);
  if (!section || !target) {
    return;
  }

  for (const child of section.children) {
    if (child.tagName !== "H2") {
      child.hidden = true;
    }
  }

  const hint = document.createElement("p");
  hint.className = "auth-notice";
  const text = session.status === "expired" ? MESSAGES.expired : MESSAGES.notLoggedIn;
  const link = document.createElement("a");
  link.href = target;
  link.textContent = "Zur Anmeldung";
  hint.append(`${text} `, link);
  section.append(hint);
}

// Anmeldeseite (login.html): beide Formulare und Hinweis zum Grund der Weiterleitung
export function initLoginPage(root = document) {
  const params = new URLSearchParams(window.location.search);
  const nextPage = safeNextPage(params.get("weiter"));

  const notice = root.getElementById("auth-notice");
  const reasonText = reasonMessage(params.get("grund"));
  if (notice && reasonText) {
    notice.textContent = reasonText;
    notice.hidden = false;
  }

  // Bereits angemeldet: direkt weiter
  if (readSession().status === "valid") {
    window.location.replace(nextPage);
    return;
  }

  const loginForm = root.getElementById("login-form");
  const loginEmail = root.getElementById("login-email");
  const loginPassword = root.getElementById("login-password");
  const loginError = root.getElementById("login-error");

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setText(loginError, "");
    const button = loginForm.querySelector("button[type=submit]");
    button.disabled = true;

    const result = await submitLogin(loginEmail.value, loginPassword.value);
    button.disabled = false;

    if (result.status === "logged-in") {
      window.location.assign(nextPage);
      return;
    }
    // Gleiche Meldung bei falscher E-Mail und falschem Passwort (kommt vom Backend)
    setText(loginError, result.message);
    loginPassword.value = "";
  });

  const registerForm = root.getElementById("register-form");
  const registerEmail = root.getElementById("register-email");
  const registerPassword = root.getElementById("register-password");
  const registerEmailError = root.getElementById("register-email-error");
  const registerPasswordError = root.getElementById("register-password-error");
  const registerError = root.getElementById("register-error");

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setText(registerEmailError, "");
    setText(registerPasswordError, "");
    setText(registerError, "");

    const button = registerForm.querySelector("button[type=submit]");
    button.disabled = true;
    const result = await submitRegistration(registerEmail.value, registerPassword.value);
    button.disabled = false;

    if (result.status === "invalid") {
      setText(registerEmailError, result.errors.email ?? "");
      setText(registerPasswordError, result.errors.password ?? "");
      return;
    }
    if (result.status === "error") {
      setText(registerError, result.message);
      return;
    }

    // E13: nicht automatisch anmelden, sondern E-Mail ins Anmeldeformular übernehmen
    registerForm.reset();
    if (notice) {
      notice.textContent = MESSAGES.registered;
      notice.classList.add("auth-notice-success");
      notice.hidden = false;
    }
    loginEmail.value = result.email;
    loginPassword.focus();
  });
}
