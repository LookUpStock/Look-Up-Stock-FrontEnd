// Startet das Frontend auf Heroku: leitet http auf https um (NF-05, FE #81)
// und liefert sonst die Dateien aus src/ wie bisher `serve src` aus.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import handler from 'serve-handler';

/**
 * Liefert die https-Adresse, wenn der Heroku-Router http meldet, sonst null.
 * Ohne den Header X-Forwarded-Proto (lokal, Tests) wird nichts umgeleitet.
 */
export function httpsRedirectTarget(headers, url) {
  const proto = String(headers['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase();
  if (proto !== 'http' || !headers.host) {
    return null;
  }
  return `https://${headers.host}${url ?? '/'}`;
}

export function createServer() {
  return http.createServer((request, response) => {
    const target = httpsRedirectTarget(request.headers, request.url);
    if (target) {
      // 308 statt 301: Methode und Body bleiben bei der Umleitung erhalten
      response.writeHead(308, { Location: target });
      response.end();
      return;
    }
    // gleiche Einstellungen wie `serve src`: saubere URLs (app.html -> /app), ETag
    handler(request, response, { public: 'src', etag: true });
  });
}

// Nur starten, wenn die Datei direkt ausgeführt wird (npm start), nicht beim Import im Test
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`Frontend läuft auf Port ${port}`));
}
