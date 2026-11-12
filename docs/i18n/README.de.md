<!-- [LAYER: UI] -->
# HEAV3NS-JOY: Framework für Architektursouveränität und Strukturentropie-Kontrolle

[English](../../README.md) · [Andere Sprachen](README.md) · [Erste Schritte](../GETTING_STARTED.md) · [Agenten-Protokoll](../../AGENTS.md)

> *„Baut nicht noch einen Ort, an dem Agenten laufen. Baut etwas, von dem Agenten lernen, das sie mitnehmen und überall unabhängig reproduzieren können.“*

**In einem Satz:** HEAV3NS-JOY hält Codebasen (von Menschen und KI-Agenten) architektonisch sauber – mit einer minimalen Konvention und einem abhängigkeitsfreien Checker.

---

## Die Idee in 60 Sekunden

| Dimension | Detail |
| :--- | :--- |
| **Was ist es** | Eine Konvention plus ein abhängigkeitsfreies Audit-Tool. Jede Datei deklariert in der ersten Zeile eine von fünf kanonischen Zonen (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`). |
| **Warum** | Architektur erodiert schleichend, und KI-Coding-Agenten beschleunigen diese Erosion. Struktur maschinenprüfbar zu machen, stoppt den Zerfall beim Commit. |
| **Wie** | Datei im passenden Zonenordner ablegen, Importe nur in erlaubter Richtung zulassen, `node bin/joy-check.mjs .` ausführen. Exit-Code `0` garantiert Konformität. |
| **Kosten** | **Null externe Abhängigkeiten**, keine Accounts, kein Netzwerk, standardmäßig schreibgeschützt. |

### Die Restaurant-Analogie

Betrachte die Codebasis wie ein Restaurant:
- **Die Küche (`DOMAIN`)**: Zubereitung reiner Rezepte und Geschäftsregeln; Anrufe bei Lieferanten während des Kochens sind streng verboten.
- **Die Koordination (`CORE`)**: Steuert Bestellungen und Anwendungsfallabläufe.
- **Die Lieferanten (`INFRASTRUCTURE`)**: Dateisystem-, HTTP- und Datenbank-Adapter.
- **Der Gastraum (`UI`)**: Bedient Gäste und zeichnet Oberflächen; betritt niemals die Vorratskammer.
- **Die Haustechnik (`PLUMBING`)**: Reine, zustandslose Hilfsfunktionen, vollständig isoliert.

---

## Die fünf kanonischen Zonen

| Zone | Verzeichnis | Verantwortung | Strenge Regel |
| :--- | :--- | :--- | :--- |
| `DOMAIN` | `src/domain/` | Geschäftsregeln, Entitäten, Verträge `I*` | **0% I/O-Entropie**; Import von Infra oder UI verboten |
| `CORE` | `src/core/` | Use-Case-Orchestrierung, State Machines | Import von UI verboten; bindet Infra nur über Schnittstellen |
| `INFRASTRUCTURE` | `src/infrastructure/` | fs-, HTTP-, DB-Adapter | Import von UI verboten; implementiert Domain-Verträge |
| `PLUMBING` | `src/plumbing/` | Kryptographie, zustandslose Utilities | Blatt-Schicht; darf keine andere Zone importieren |
| `UI` | `src/ui/` | CLI-Presenter, HTTP-Routen, Views | Direkter Import von Infrastruktur verboten |

---

## Schnellstart (2 Minuten)

Kein `npm install` erforderlich (nur Node.js 18+ und git):

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY

# 1. Testsuite ausführen (196 Tests erfolgreich)
npm test

# 2. Architektur auditieren
npm run joy-check

# 3. Agenten-Setup konfigurieren (Claude, Cursor, Antigravity etc.)
npx heav3ns-joy init
```

Weitere Details im [Dokumentationsportal](../README.md) und im [Kanonischen Modell](../../spec/00-CANONICAL-MODEL.md).

