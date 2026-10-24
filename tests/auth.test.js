// KI-Log Nr. [eintragen]: Unit-Tests der Anmeldung mit KI erstellt, von Mert Eminel geprüft (FE #4, US-01)
// Abnahmetestfälle: AT-01-06 (abgelaufene Anmeldung), AT-01-08 (Passwortlänge), AT-01-09 (E-Mail-Format)

import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { registerUser, loginUser, logoutUser, ApiError, API_BASE_URL } from "../src/js/api.js";
import {
  MESSAGES,
  REASONS,
  SESSION_KEY,
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateLogin,
  saveSession,
  readSession,
  getToken,
  isUnauthorized,
  safeNextPage,
  loginRedirectFor,
  reasonMessage,
  submitRegistration,
  submitLogin,
  submitLogout,
} from "../src/js/auth.js";

afterEach(() => {
  mock.restoreAll();
});

// Einfacher Speicher statt localStorage, damit die Tests ohne Browser laufen
function createStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

// Feste Zeitpunkte statt der aktuellen Uhrzeit (wie die vorgegebene Uhr im Backend)
const LOGIN_TIME = Date.parse("2026-10-08T10:00:00Z");
const EXPIRES_AT = "2026-10-09T10:00:00Z"; // 24 h später (NF-16)
const EXPIRES_MS = Date.parse(EXPIRES_AT);

function loggedInStorage() {
  const storage = createStorage();
  saveSession({ token: "abc123", expiresAt: EXPIRES_AT }, "anna@example.com", storage);
  return storage;
}

// ===== api.js: Anmelde-Endpunkte laut API-Design =====

function mockFetch(status, body) {
  return mock.method(globalThis, "fetch", async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

test("registerUser sends email and password to POST /auth/register", async () => {
  const fetchMock = mockFetch(201, { id: 3, email: "anna@example.com" });

  await registerUser("anna@example.com", "geheim123");

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/auth/register`);
  assert.equal(options.method, "POST");
  assert.deepEqual(JSON.parse(options.body), { email: "anna@example.com", password: "geheim123" });
});

test("loginUser sends credentials to POST /auth/login", async () => {
  const fetchMock = mockFetch(200, { token: "abc123", expiresAt: EXPIRES_AT });

  const result = await loginUser("anna@example.com", "geheim123");

  assert.equal(fetchMock.mock.calls[0].arguments[0], `${API_BASE_URL}/api/v1/auth/login`);
  assert.deepEqual(result, { token: "abc123", expiresAt: EXPIRES_AT });
});

test("logoutUser sends the token as Bearer header to POST /auth/logout", async () => {
  const fetchMock = mockFetch(204);

  const result = await logoutUser("abc123");

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/auth/logout`);
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer abc123");
  assert.equal(options.body, undefined);
  assert.equal(result, null);
});

// ===== AT-01-09: E-Mail-Format (E12) =====

test("invalid email addresses are rejected before sending (AT-01-09)", () => {
  const tooLong = "a".repeat(256 - "@example.de".length) + "@example.de";
  assert.equal(tooLong.length, 256);

  for (const email of ["", "anna", "anna@", "anna@example", "anna @example.com", tooLong]) {
    assert.equal(validateEmail(email), MESSAGES.invalidEmail, `"${email}" sollte ungültig sein`);
  }
});

test("valid email addresses are accepted, including 255 characters (AT-01-09)", () => {
  const maxLength = "a".repeat(255 - "@example.de".length) + "@example.de";
  assert.equal(maxLength.length, 255);

  for (const email of ["a@b.de", "anna@example.com", maxLength]) {
    assert.equal(validateEmail(email), null, `"${email}" sollte gültig sein`);
  }
});

test("email is compared without upper and lower case (E11)", () => {
  assert.equal(normalizeEmail("  Anna@Example.COM "), "anna@example.com");
});

// ===== AT-01-08: Passwortlänge =====

test("password with 7 characters is rejected, 8 characters are accepted (AT-01-08)", () => {
  assert.equal(validatePassword("1234567"), MESSAGES.passwordTooShort);
  assert.equal(validatePassword("12345678"), null);
  assert.equal(MESSAGES.passwordTooShort, "Das Passwort muss mindestens 8 Zeichen haben.");
});

test("registration with invalid input does not call the backend (AT-01-08)", async () => {
  const register = mock.fn(async () => ({}));

  const result = await submitRegistration("anna", "1234567", register);

  assert.equal(result.status, "invalid");
  assert.equal(result.errors.email, MESSAGES.invalidEmail);
  assert.equal(result.errors.password, MESSAGES.passwordTooShort);
  assert.equal(register.mock.callCount(), 0);
});

// ===== Registrierung (AT-01-01, AT-01-04) =====

test("successful registration does not log the user in (E13, AT-01-01)", async () => {
  const register = mock.fn(async () => ({ id: 3, email: "anna@example.com" }));

  const result = await submitRegistration(" Anna@Example.com ", "geheim123", register);

  assert.equal(result.status, "registered");
  assert.equal(result.email, "anna@example.com");
  assert.deepEqual(register.mock.calls[0].arguments, ["anna@example.com", "geheim123"]);
});

test("already registered email shows the message from the backend (AT-01-04)", async () => {
  const register = mock.fn(async () => {
    throw new ApiError(409, "CONFLICT", "Diese E-Mail ist bereits registriert.");
  });

  const result = await submitRegistration("anna@example.com", "geheim123", register);

  assert.deepEqual(result, { status: "error", message: "Diese E-Mail ist bereits registriert." });
});

// ===== Anmelden und Abmelden (AT-01-02, AT-01-03, AT-01-05) =====

test("successful login stores token, expiry and email (AT-01-02)", async () => {
  const storage = createStorage();
  const login = mock.fn(async () => ({ token: "abc123", expiresAt: EXPIRES_AT }));

  const result = await submitLogin("ANNA@example.com", "geheim123", { login, storage });

  assert.equal(result.status, "logged-in");
  assert.deepEqual(login.mock.calls[0].arguments, ["anna@example.com", "geheim123"]);
  assert.deepEqual(JSON.parse(storage.getItem(SESSION_KEY)), {
    token: "abc123",
    expiresAt: EXPIRES_AT,
    email: "anna@example.com",
  });
});

test("wrong credentials show the backend message and store nothing (AT-01-05)", async () => {
  const storage = createStorage();
  const login = mock.fn(async () => {
    throw new ApiError(401, "UNAUTHORIZED", "E-Mail oder Passwort ist falsch.");
  });

  const result = await submitLogin("anna@example.com", "falsch123", { login, storage });

  assert.deepEqual(result, { status: "error", message: "E-Mail oder Passwort ist falsch." });
  assert.equal(storage.getItem(SESSION_KEY), null);
});

test("login with empty fields does not call the backend", async () => {
  const login = mock.fn(async () => ({}));

  const result = await submitLogin("", "", { login, storage: createStorage() });

  assert.deepEqual(result, { status: "invalid", message: MESSAGES.missingCredentials });
  assert.equal(login.mock.callCount(), 0);
  assert.equal(validateLogin("anna@example.com", "geheim123"), null);
});

test("logout sends the token and removes the session (AT-01-03)", async () => {
  const storage = loggedInStorage();
  const logout = mock.fn(async () => null);

  await submitLogout({ logout, storage });

  assert.deepEqual(logout.mock.calls[0].arguments, ["abc123"]);
  assert.equal(storage.getItem(SESSION_KEY), null);
});

test("logout removes the session even if the backend is not reachable", async () => {
  const storage = loggedInStorage();
  mock.method(console, "error", () => {});
  const logout = mock.fn(async () => {
    throw new ApiError(0, "NETWORK_ERROR", "Der Server ist gerade nicht erreichbar.");
  });

  await submitLogout({ logout, storage });

  assert.equal(storage.getItem(SESSION_KEY), null);
});

// ===== AT-01-06: abgelaufene Anmeldung (E14, NF-16) =====

test("session is valid one second before expiry", () => {
  const storage = loggedInStorage();

  const session = readSession(storage, EXPIRES_MS - 1000);

  assert.equal(session.status, "valid");
  assert.equal(getToken(storage, EXPIRES_MS - 1000), "abc123");
});

test("session is expired exactly at expiry and is removed (AT-01-06)", () => {
  const storage = loggedInStorage();

  const session = readSession(storage, EXPIRES_MS);

  assert.equal(session.status, "expired");
  assert.equal(storage.getItem(SESSION_KEY), null);
});

test("expired session leads to the login page with the expiry message and no token (AT-01-06)", () => {
  const storage = loggedInStorage();
  const session = readSession(storage, EXPIRES_MS + 1000);

  const target = loginRedirectFor(session, "index.html");

  assert.equal(target, "login.html?grund=abgelaufen&weiter=index.html");
  assert.equal(reasonMessage(REASONS.expired), "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.");
  // Ohne Token wird keine geschützte Anfrage an das Backend gesendet
  assert.equal(getToken(storage, EXPIRES_MS + 1000), null);
});

test("without session the login page asks to log in (E14)", () => {
  const target = loginRedirectFor(readSession(createStorage(), LOGIN_TIME), "portfolio.html");

  assert.equal(target, "login.html?grund=anmelden&weiter=portfolio.html");
  assert.equal(reasonMessage(REASONS.notLoggedIn), "Bitte melde dich an.");
});

test("valid session needs no redirect", () => {
  const session = readSession(loggedInStorage(), LOGIN_TIME);

  assert.equal(loginRedirectFor(session, "index.html"), null);
});

test("damaged session data is treated as not logged in", () => {
  const storage = createStorage();
  storage.setItem(SESSION_KEY, "kein JSON");

  assert.equal(readSession(storage, LOGIN_TIME).status, "none");
  assert.equal(storage.getItem(SESSION_KEY), null);
});

// ===== Hilfsfunktionen =====

test("only known pages are allowed as return target", () => {
  assert.equal(safeNextPage("index.html"), "index.html");
  assert.equal(safeNextPage("https://example.com"), "portfolio.html");
  assert.equal(safeNextPage(null), "portfolio.html");
});

test("401 from the backend is recognised as missing login", () => {
  assert.equal(isUnauthorized(new ApiError(401, "UNAUTHORIZED", "Bitte melde dich an.")), true);
  assert.equal(isUnauthorized(new ApiError(404, "NOT_FOUND", "Portfolio nicht gefunden.")), false);
});
