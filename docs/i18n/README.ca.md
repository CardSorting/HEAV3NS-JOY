<!-- [LAYER: UI] -->
# HEAV3NS-JOY: Marc de Sobirania Arquitectònica i Control de l'Entropia Estructural

[English](../../README.md) · [Altres Llengües](README.md) · [Guia d'Inici](../GETTING_STARTED.md) · [Protocol d'Agents](../../AGENTS.md)

> *«No construïu un altre lloc on els agents s'executin. Construïu quelcom del qual els agents puguin aprendre, emportar-se i reproduir de manera independent a qualsevol lloc.»*

**En una frase:** HEAV3NS-JOY manté els vostres repositoris arquitectònicament nets (tant codi humà com generat per IA) mitjançant una convenció mínima i un verificador sense dependències.

---

## La idea en 60 segons

| Dimensió | Detall |
| :--- | :--- |
| **Què és** | Una convenció i una eina d'auditoria estàtica sense dependències. Cada fitxer declara una de cinc zones canòniques (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) a la primera línia de la capçalera. |
| **Per què** | L'arquitectura es degrada en silenci, i els agents de codificació d'IA acceleren aquesta erosió. Fer l'estructura verificable per màquines atura el deteriorament en el commit, no en una costosa reescriptura. |
| **Com** | Col·loqueu cada fitxer a la carpeta de la seva zona, importeu només en les direccions permeses i executeu `node bin/joy-check.mjs .`. Sortida `0` significa integritat total. |
| **Cost** | **Zero dependències externes**, sense comptes, sense xarxa, només lectura per defecte. |

### L'analogia del restaurant

Imagineu la base de codi com un restaurant:
- **La cuina (`DOMAIN`)**: Elabora receptes pures i regles de negoci; està totalment prohibit trucar als proveïdors a mitja cocció.
- **La coordinació (`CORE`)**: Gestiona les comandes i l'orquestració dels casos d'ús.
- **Els proveïdors (`INFRASTRUCTURE`)**: Adaptadors per al sistema de fitxers, HTTP i bases de dades.
- **La sala (`UI`)**: Atén els clients i dibuixa les interfícies; no entra mai al rebost.
- **Les canonades (`PLUMBING`)**: Utilitats funcionals sense estat i totalment aïllades.

---

## Les cinc zones canòniques

| Zona | Directori | Responsabilitat | Regla absoluta |
| :--- | :--- | :--- | :--- |
| `DOMAIN` | `src/domain/` | Regles de negoci, entitats, contractes `I*` | **0% d'entropia d'E/S**; prohibit importar infra o UI |
| `CORE` | `src/core/` | Orquestració de casos d'ús, màquines d'estats | Prohibit importar UI; connecta amb infra només mitjançant interfícies |
| `INFRASTRUCTURE` | `src/infrastructure/` | Adaptadors fs, HTTP, base de dades | Prohibit importar UI; implementa contractes de Domain |
| `PLUMBING` | `src/plumbing/` | Criptografia, utilitats sense estat | Capa fulla; prohibit importar cap altra zona |
| `UI` | `src/ui/` | Presentadors CLI, rutes HTTP, vistes | Prohibit importar directament infraestructura |

---

## Inici Ràpid (2 Minuts)

No cal cap `npm install` (només Node.js 18+ i git):

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY

# 1. Executar les proves (196 proves superades)
npm test

# 2. Auditar la conformitat arquitectònica
npm run joy-check

# 3. Configurar els agents d'IA (Claude, Cursor, Antigravity, etc.)
npx heav3ns-joy init
```

Més detalls al [Portal de Documentació](../README.md) i al [Model Canònic](../../spec/00-CANONICAL-MODEL.md).

