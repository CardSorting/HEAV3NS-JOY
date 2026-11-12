<!-- [LAYER: UI] -->
# HEAV3NS-JOY: Framework per la Sovranità Architetturale e il Controllo dell'Entropia Strutturale

[English](../../README.md) · [Altre lingue](README.md) · [Guida Introduttiva](../GETTING_STARTED.md) · [Protocollo Agenti](../../AGENTS.md)

> *“Non costruite un altro luogo in cui gli agenti vengono eseguiti. Costruite qualcosa da cui gli agenti possano imparare, portare con sé e riprodurre autonomamente ovunque.”*

**In una frase:** HEAV3NS-JOY mantiene le codebase (umane e generate da agenti IA) architetturalmente integre grazie a una micro-convenzione e a un checker a zero dipendenze.

---

## L'idea in 60 secondi

| Dimensione | Dettaglio |
| :--- | :--- |
| **Cos'è** | Una convenzione e uno strumento di audit a zero dipendenze. Ogni file dichiara una delle cinque zone canoniche (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) nella prima riga dell'intestazione. |
| **Perché** | L'architettura degrada silenziosamente e gli agenti di coding IA accelerano tale deriva. Rendere la struttura verificabile da macchine blocca il decadimento al commit, non in costosi refactoring. |
| **Come** | Posiziona ogni file nella cartella della sua zona, importa solo nelle direzioni permesse ed esegui `node bin/joy-check.mjs .`. Il codice `0` certifica la conformità totale. |
| **Costo** | **Zero dipendenze esterne**, nessun account, nessuna rete, sola lettura per impostazione predefinita. |

### L'analogia del ristorante

Pensa alla codebase come a un ristorante:
- **La cucina (`DOMAIN`)**: Elabora ricette pure e logica di business; è severamente vietato chiamare i fornitori a metà cottura.
- **La regia (`CORE`)**: Coordina le comande e l'orchestrazione dei casi d'uso.
- **I fornitori (`INFRASTRUCTURE`)**: Adattatori per file system, HTTP e database.
- **La sala (`UI`)**: Accoglie gli utenti e renderizza le viste; non entra mai nella dispensa degli ingredienti.
- **Gli impianti idraulici (`PLUMBING`)**: Funzioni di utilità pure senza stato e isolate.

---

## Le cinque zone canoniche

| Zona | Cartella | Responsabilità | Regola assoluta |
| :--- | :--- | :--- | :--- |
| `DOMAIN` | `src/domain/` | Logica di business, entità, contratti `I*` | **0% entropia I/O**; vietato importare infrastruttura o UI |
| `CORE` | `src/core/` | Casi d'uso, orchestrazione, macchine a stati | Vietato importare UI; interagisce con l'infrastruttura solo tramite contratti |
| `INFRASTRUCTURE` | `src/infrastructure/` | Adattatori fs, HTTP, database | Vietato importare UI; implementa i contratti di Domain |
| `PLUMBING` | `src/plumbing/` | Crittografia, utility senza stato | Livello foglia; vietato importare qualsiasi altra zona |
| `UI` | `src/ui/` | Presenter CLI, route HTTP, viste | Vietato importare direttamente l'infrastruttura |

---

## Avvio rapido (2 minuti)

Nessun `npm install` necessario (bastano Node.js 18+ e git):

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY

# 1. Esegui la suite di test (196 test superati)
npm test

# 2. Esegui l'audit di conformità architetturale
npm run joy-check

# 3. Configura gli agenti IA (Claude, Cursor, Antigravity, ecc.)
npx heav3ns-joy init
```

Consulta il [Portale di Documentazione](../README.md) e il [Modello Canonico](../../spec/00-CANONICAL-MODEL.md).

