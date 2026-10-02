# LookUpStock – Frontend

Benutzeroberfläche für LookUpStock: Anlagen suchen, Portfolios zusammenstellen und mögliche Wertverläufe per Monte-Carlo-Simulation anzeigen. Die Berechnung übernimmt das Backend (Repository `Look-Up-Stock-BackEnd`).

## Tech-Stack

- HTML, CSS, JavaScript (ES-Module, ohne Framework und ohne Build-Schritt)
- Node.js nur für die Tests (eingebauter Test-Runner `node:test`, keine Abhängigkeiten)

## Voraussetzungen

- VS Code mit der Extension **Live Server** (Ritwick Dey)
- Node.js 24 (`node -v`)
- Laufendes Backend unter `http://localhost:8080` (siehe README im Backend-Repository)

## Starten

1. Backend starten (im Backend-Repository):

```powershell
   .\mvnw.cmd spring-boot:run
```

2. In VS Code Rechtsklick auf `src/index.html` → **Open with Live Server**.
3. Die Statusleiste oben zeigt „Backend: verbunden“, wenn die Verbindung steht.

Live Server muss auf **Port 5500** laufen. Das Backend erlaubt per CORS nur `http://localhost:5500` und `http://127.0.0.1:5500`. Die Seiten nicht per Doppelklick öffnen (`file://`), da ES-Module und API-Aufrufe dann nicht funktionieren.

## Testen

Alle Befehle im Hauptordner dieses Repos ausführen:

```powershell
npm install               # einmalig, erzeugt keine Abhängigkeiten
npm test                  # Unit-Tests ausführen
npm run test:coverage     # Tests mit Testabdeckung
```

Die Tests ersetzen `fetch` durch simulierte Antworten und brauchen daher kein laufendes Backend.

Falls PowerShell `npm` blockiert („running scripts is disabled“): einmalig `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` ausführen oder `npm.cmd` statt `npm` verwenden.

## Konfiguration

| Wert | Ort | Standard |
|---|---|---|
| Backend-Adresse | `API_BASE_URL` in `src/js/api.js` | `http://localhost:8080/api/v1` |

Für das Deployment auf dem Server wird `API_BASE_URL` angepasst.

## Projektstruktur

```
src/
├── index.html        Simulationsseite (Startseite)
├── portfolio.html    Anlagensuche und Portfolio-Editor
├── css/style.css     Gemeinsame Styles (Farben als Variablen in :root)
└── js/
    ├── api.js        Alle Backend-Aufrufe, einheitliche Fehlerbehandlung (ApiError)
    ├── main.js       Einstiegspunkt beider Seiten, prüft die Backend-Verbindung
    └── chart.js      Fächerdiagramm der Simulation
tests/
└── api.test.js       Unit-Tests der API-Schicht
```

## Hinweise für die Umsetzung

- Neue Backend-Aufrufe nur in `api.js` über `request()` ergänzen.
- API-Fehler als `ApiError` abfangen und `error.message` im Bereich `#error-message` anzeigen; der Text kommt bereits auf Deutsch vom Backend.
- Bezeichner (IDs, Klassen, Funktionen) auf Englisch, Kommentare auf Deutsch.
- Schnittstelle zum Backend: API-Design im Repository `Look-Up-Stock-Docs`.

## Mitarbeit

Branches, Commits und Pull Requests nach der `CONTRIBUTING.md` im Repository `Look-Up-Stock-Docs`.