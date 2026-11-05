import { registerUser, loginUser, logoutUser, ApiError } from "./api.js";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_EMAIL_LENGTH = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const SESSION_KEY = "lookupstock.session";

const ALLOWED_NEXT_PAGES = ["index.html", "portfolio.html", "dashboard.html"];
export const DEFAULT_NEXT_PAGE = "portfolio.html";

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

export const REASONS = {
  expired: "abgelaufen",
  notLoggedIn: "anmelden",
  loggedOut: "abgemeldet",
};

export function normalizeEmail(input) {
  return (input ?? "").trim().toLowerCase();
}

export function validateEmail(email) {
  const value = normalizeEmail(email);
  if (value.length === 0 || value.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(value)) {
    return MESSAGES.invalidEmail;
  }
  return null;
}

export function validatePassword(password) {
  if ((password ?? "").length < MIN_PASSWORD_LENGTH) {
    return MESSAGES.passwordTooShort;
  }
  return null;
}

export function validateRegistration(email, password) {
  const errors = { email: validateEmail(email), password: validatePassword(password) };
  return { valid: !errors.email && !errors.password, errors };
}

export function validateLogin(email, password) {
  if (normalizeEmail(email).length === 0 || (password ?? "").length === 0) {
    return MESSAGES.missingCredentials;
  }
  return null;
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function saveSession(loginResponse, email, storage = browserStorage()) {
  const session = { token: loginResponse.token, expiresAt: loginResponse.expiresAt, email };
  if (loginResponse.role !== undefined) session.role = loginResponse.role;
  storage?.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function hasManagementRole(session) {
  return session?.role === "MANAGER";
}

export function clearSession(storage = browserStorage()) {
  storage?.removeItem(SESSION_KEY);
}

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

  // Exactly at expiresAt the session counts as expired, as in the backend.
  if (now >= expiresAt) {
    clearSession(storage);
    return { status: "expired" };
  }

  return { status: "valid", ...session };
}

export function getToken(storage = browserStorage(), now = Date.now()) {
  const session = readSession(storage, now);
  return session.status === "valid" ? session.token : null;
}

export function isUnauthorized(error) {
  return error instanceof ApiError && error.status === 401;
}

// Only known pages are allowed as redirect targets (no open redirect).
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

export function loginRedirectFor(session, currentPage) {
  if (session.status === "valid") {
    return null;
  }
  const reason = session.status === "expired" ? REASONS.expired : REASONS.notLoggedIn;
  return loginPageUrl(reason, currentPage);
}

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
  return error instanceof ApiError ? error.message : MESSAGES.unexpected;
}

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

// The local session is cleared even if the backend is unreachable.
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

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

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

export function requireLogin(session, currentPage) {
  const target = loginRedirectFor(session, currentPage);
  if (target) {
    window.location.replace(target);
    return false;
  }
  return true;
}

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

export function initLoginPage(root = document) {
  const params = new URLSearchParams(window.location.search);
  const nextPage = safeNextPage(params.get("weiter"));

  const notice = root.getElementById("auth-notice");
  const reasonText = reasonMessage(params.get("grund"));
  if (notice && reasonText) {
    notice.textContent = reasonText;
    notice.hidden = false;
  }

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
