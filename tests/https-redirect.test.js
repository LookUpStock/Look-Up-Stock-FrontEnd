import { test } from 'node:test';
import assert from 'node:assert/strict';
import { httpsRedirectTarget, createServer } from '../server.js';

test('http hinter dem Heroku-Router wird auf https umgeleitet', () => {
  const target = httpsRedirectTarget(
    { 'x-forwarded-proto': 'http', host: 'lookupstock.example' }, '/portfolio.html?id=5');
  assert.equal(target, 'https://lookupstock.example/portfolio.html?id=5');
});

test('https wird nicht umgeleitet', () => {
  assert.equal(httpsRedirectTarget({ 'x-forwarded-proto': 'https', host: 'lookupstock.example' }, '/'), null);
});

test('ohne X-Forwarded-Proto (lokal) wird nicht umgeleitet', () => {
  assert.equal(httpsRedirectTarget({ host: 'localhost:3000' }, '/'), null);
});

test('bei mehreren Werten zählt der erste', () => {
  assert.equal(
    httpsRedirectTarget({ 'x-forwarded-proto': 'http, https', host: 'lookupstock.example' }, '/'),
    'https://lookupstock.example/');
});

test('Server antwortet bei http mit 308 und liefert sonst die Startseite', async () => {
  const server = createServer().listen(0);
  const { port } = server.address();
  try {
    const redirect = await fetch(`http://127.0.0.1:${port}/index.html`, {
      headers: { 'X-Forwarded-Proto': 'http' }, redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), `https://127.0.0.1:${port}/index.html`);

    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<html/i);
  } finally {
    server.close();
  }
});
