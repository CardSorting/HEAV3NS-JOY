<!-- [LAYER: UI] -->
# HEAV3NS-JOY : Cadre de Souveraineté Architecturale et de Contrôle de l'Entropie

[English](../../README.md) · [Autres langues](README.md) · [Guide de démarrage](../GETTING_STARTED.md) · [Protocole Agents](../../AGENTS.md)

> *« Ne construisez pas un endroit de plus où les agents s'exécutent. Construisez quelque chose dont les agents peuvent apprendre, qu'ils peuvent emporter et reproduire de manière autonome n'importe où. »*

**En une phrase :** HEAV3NS-JOY préserve l'intégrité architecturale de vos bases de code (écrites par des humains ou générées par des agents IA) grâce à une micro-convention et un vérificateur sans dépendance.

---

## L'idée en 60 secondes

| Dimension | Détail |
| :--- | :--- |
| **Qu'est-ce que c'est** | Une convention et un outil d'audit statique sans dépendance. Chaque fichier déclare l'une des cinq zones canoniques (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) dans son en-tête. |
| **Pourquoi** | L'architecture dérive silencieusement, et les agents de codage IA accélèrent cette dérive. Rendre la structure vérifiable par machine stoppe la pourriture logicielle dès le commit. |
| **Comment** | Placez chaque fichier dans le répertoire de sa zone, importez uniquement dans les directions autorisées et lancez `node bin/joy-check.mjs .`. Le code `0` certifie la conformité. |
| **Coût** | **Zéro dépendance externe**, aucun compte, aucun réseau, lecture seule par défaut. |

### L'analogie du restaurant

Considérez la base de code comme un restaurant :
- **La cuisine (`DOMAIN`)** : Élabore les recettes pures et les règles métier ; interdiction absolue d'appeler les fournisseurs pendant la cuisson.
- **La régie (`CORE`)** : Coordonne les commandes et l'orchestration des cas d'utilisation.
- **Les fournisseurs (`INFRASTRUCTURE`)** : Adaptateurs de fichiers, réseau et base de données.
- **La salle (`UI`)** : Accueille les utilisateurs et affiche les interfaces ; ne pénètre jamais dans le garde-manger.
- **La plomberie (`PLUMBING`)** : Utilitaires fonctionnels sans état et complètement isolés.

---

## Les cinq zones canoniques

| Zone | Répertoire | Responsabilités | Règle absolue |
| :--- | :--- | :--- | :--- |
| `DOMAIN` | `src/domain/` | Règles métier, entités, contrats `I*` | **0% d'entropie I/O** ; interdiction d'importer l'infrastructure ou l'UI |
| `CORE` | `src/core/` | Orchestration des cas d'utilisation, machines d'états | Interdiction d'importer l'UI ; dialogue avec l'infra via des interfaces |
| `INFRASTRUCTURE` | `src/infrastructure/` | Adaptateurs fs, HTTP, base de données | Interdiction d'importer l'UI ; implémente les contrats du Domain |
| `PLUMBING` | `src/plumbing/` | Cryptographie, utilitaires sans état | Couche feuille ; interdiction d'importer toute autre zone |
| `UI` | `src/ui/` | Présentateurs CLI, routes HTTP, vues | Interdiction d'importer directement l'infrastructure |

---

## Démarrage rapide (2 minutes)

Aucun `npm install` requis (Node.js 18+ et git suffisent) :

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY

# 1. Lancer les tests (196 tests réussis)
npm test

# 2. Auditer la conformité architecturale
npm run joy-check

# 3. Configurer les agents IA (Claude, Cursor, Antigravity, etc.)
npx heav3ns-joy init
```

Consultez le [Portail de Documentation](../README.md) et le [Modèle Canonique](../../spec/00-CANONICAL-MODEL.md).

