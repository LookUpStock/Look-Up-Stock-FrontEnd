import http from 'node:http';
import { pathToFileURL } from 'node:url';
import handler from 'serve-handler';

// Returns the https URL when the Heroku router reports http; without X-Forwarded-Proto (local, tests) nothing is redirected.
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
      // 308 instead of 301 keeps the method and body.
      response.writeHead(308, { Location: target });
      response.end();
      return;
    }
    handler(request, response, { public: 'src', etag: true });
  });
}

// Start only when run directly (npm start), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`Frontend läuft auf Port ${port}`));
}
