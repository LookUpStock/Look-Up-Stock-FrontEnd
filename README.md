# LookUpStock – Frontend

Benutzeroberfläche für LookUpStock: Anlagen suchen, Portfolios zusammenstellen, mögliche Wertverläufe per Monte-Carlo-Simulation anzeigen, zwei Einträge vergleichen, Simulationen speichern, eine Beispielsimulation für Gäste und das Dashboard der Geschäftsführung mit CSV-Export. Die Berechnung übernimmt das Backend (Repository `Look-Up-Stock-BackEnd`, core-service).

Die Oberfläche gibt es als MPA (eine HTML-Seite je Funktion) und als SPA-Touchpoint mit Hash-Routing (ADR-08). Online: https://lookupstockfrontend-96a9998805cb.herokuapp.com

## Tech-Stack

- HTML, CSS, JavaScript (ES-Module, ohne Framework und ohne Build-Schritt)
- Node.js für die Tests (eingebauter Test-Runner `node:test`) und für den Start auf Heroku; Abhängigkeiten sind `serve` und `serve-handler`

## Voraussetzungen

- VS Code mit der Extension **Live Server** (Ritwick Dey)
- Node.js 24 (`node -v`)
- Laufendes Backend unter der lokalen Standard-URL aus `src/js/config.js` (siehe README im Backend-Repository)

## Starten

1. Backend starten (im Backend-Repository):

```powershell
   .\mvnw.cmd spring-boot:run
```

2. In VS Code Rechtsklick auf `src/index.html` → **Open with Live Server**.
3. Die Statusleiste oben zeigt „Backend: verbunden“, wenn die Verbindung steht.

Der SPA-Touchpoint startet separat über `src/app.html`. Er verwendet Hash-Routen wie `app.html#/portfolios/5`; Hash-Routing hält Direktaufrufe auf dem statischen `serve`-Deployment funktionsfähig, ohne Server-Rewrite-Regeln. Auf Heroku leitet `serve` `app.html` mit `301` auf `/app` um (saubere URLs); der Hash bleibt erhalten, die SPA ist dort also unter `/app#/…` erreichbar, z. B. `/app#/portfolios` (ADR-08). Die MPA-Seiten bleiben unverändert erreichbar und verlinken zur SPA.

Live Server muss auf **Port 5500** laufen. Die Seite sollte über `http://localhost:5500` geöffnet werden. Wenn Live Server `127.0.0.1:5500` verwendet, leitet das Frontend automatisch auf `localhost` um. Die Seiten nicht per Doppelklick öffnen (`file://`), da ES-Module und API-Aufrufe dann nicht funktionieren.

## Testen

Alle Befehle im Hauptordner dieses Repos ausführen:

```powershell
npm install               # einmalig, installiert serve (für die Tests nicht nötig)
npm test                  # Unit-Tests ausführen
npm run test:coverage     # Tests mit Testabdeckung
```

Die Tests ersetzen `fetch` durch simulierte Antworten und brauchen daher kein laufendes Backend.

Falls PowerShell `npm` blockiert („running scripts is disabled“): einmalig `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` ausführen oder `npm.cmd` statt `npm` verwenden.

## Konfiguration

| Wert | Ort | Standard |
|---|---|---|
| Backend-Adresse | `API_BASE_URL` in `src/js/config.js` | lokal (`localhost`, `127.0.0.1`) `http://localhost:8080`, sonst `https://lookupstock-da2951e42089.herokuapp.com` |
| Pfad der Endpunkte | `API_PREFIX` in `src/js/config.js` | `/api/v1` |

Die Adresse wird beim Laden anhand des Hostnamens gewählt; eine Umgebungsvariable gibt es dafür nicht.

## Deployment (Heroku)

Die Heroku-App des Frontends wird aus `main` dieses Repositorys bereitgestellt. Heroku installiert die Abhängigkeiten und startet `npm start`, also `node server.js`. Der kleine Server in `server.js` leitet Aufrufe über http mit `308` auf https um (NF-05, FE #81; maßgeblich ist der Header `X-Forwarded-Proto` des Heroku-Routers) und liefert sonst `src/` mit `serve-handler` aus, mit denselben Einstellungen wie zuvor `serve src`. Ein Build-Schritt ist nicht nötig.

## Projektstruktur

```
src/
├── index.html             Simulationsseite (Startseite) mit Beispielsimulation für Gäste
├── portfolio.html         Anlagensuche, Portfolio-Editor, eigene Portfolios
├── compare.html           Vergleich zweier Portfolios oder Anlagen
├── dashboard.html         Nutzungskennzahlen und CSV-Export (nur Rolle MANAGER)
├── login.html             Anmeldung und Registrierung
├── app.html               SPA-Touchpoint (Hash-Routing, ADR-08)
├── css/style.css          Gemeinsame Styles (Farben als Variablen in :root)
└── js/
    ├── config.js            Backend-Adresse und Pfad der Endpunkte
    ├── api.js               Alle Backend-Aufrufe, einheitliche Fehlerbehandlung (ApiError)
    ├── auth.js              Anmeldung, Registrierung, Token und Ablauf (E14)
    ├── main.js              Einstiegspunkt der MPA-Seiten: Backend-Verbindung, Navigation nach Rolle
    ├── search.js            Anlagensuche
    ├── portfolio.js         Prüfregeln des Portfolios (Gewichtungen)
    ├── portfolio-ui.js      Portfolio-Editor mit Feldmeldungen
    ├── portfolio-save.js    Speichern, Laden, Bearbeiten und Löschen von Portfolios
    ├── simulation.js        Eingabemaske, Prüfung und Ergebnis der Simulation
    ├── saved-simulations.js Gespeicherte Simulationen
    ├── chart.js             Fächerdiagramm als SVG, gemeinsame Y-Achse
    ├── comparison.js        Vergleichsseite
    ├── demo.js              Beispielsimulation für Gäste
    ├── dashboard.js         Dashboard der Nutzungskennzahlen
    ├── dashboard-export.js  CSV-Export des Dashboards
    └── spa/
        ├── app.js           SPA-Ansichten für Portfolios und Simulationen
        └── router.js        Hash-Routen und clientseitige Navigation
tests/                       Unit-Tests je Modul (*.test.js), z. B. api.test.js, router.test.js
```

## Hinweise für die Umsetzung

- Neue Backend-Aufrufe nur in `api.js` über `request()` ergänzen.
- API-Fehler als `ApiError` abfangen und den Text aus `apiErrorText()` anzeigen; er kommt bereits auf Deutsch vom Backend.
- Bezeichner (IDs, Klassen, Funktionen) auf Englisch, Kommentare auf Deutsch.
- Schnittstelle zum Backend: API-Design im Repository `Look-Up-Stock-Docs`.

## Mitarbeit

Branches, Commits und Pull Requests nach der `CONTRIBUTING.md` im Repository `Look-Up-Stock-Docs`.
