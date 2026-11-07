<!-- [LAYER: UI] -->
# Getting Started

A 10-minute tutorial: audit a project, fix what the audit finds, and wire it into CI.

**Prerequisites:** Node.js 18+ (`node -v`) and git. Nothing to install.

## 1. Get the tool

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY
npm run verify        # tests + self-audit + docs check; all should pass
```

## 2. Audit your project

```bash
node bin/joy-check.mjs /path/to/your/project
```

Read the output top to bottom:

| Section | Meaning |
| :--- | :--- |
| Zone Breakdown | How many files landed in each of the five zones |
| Stability Index / Build Health | Overall structural health (higher is better) |
| **Blocking Violations** | Must be fixed. These make the command exit non-zero |
| Non-Blocking Advisories | Hints only; never fail a build |

## 3. Scaffold configuration

```bash
node bin/joy-check.mjs /path/to/your/project --init
```

This writes `stability.config.json` and `.joyignore`. Use the config to map your existing folders to zones (no renames needed) and `.joyignore` to exclude vendored or generated code.

## 4. Fix violations

```bash
node bin/joy-check.mjs /path/to/your/project --heal --dry-run   # preview header fixes
node bin/joy-check.mjs /path/to/your/project --heal             # apply them
node bin/joy-check.mjs --explain SPI-206                        # why / how to fix any code
```

Headers are auto-healable. Structural problems (cycles, zone leaks) need a design change; `--explain` gives before/after recipes and [`workflows/02-TACTICAL-REFACTORING-SOPS.md`](../workflows/02-TACTICAL-REFACTORING-SOPS.md) has the playbook. For a legacy codebase, follow [`workflows/03-ADOPTING-IN-EXISTING-PROJECTS.md`](../workflows/03-ADOPTING-IN-EXISTING-PROJECTS.md) to adopt incrementally.

## 5. Enforce it

See [CI_INTEGRATION.md](CI_INTEGRATION.md) for GitHub Actions, GitLab CI, pre-commit hooks, and editor/agent integration.

## Next

- Learn the vocabulary: [GLOSSARY.md](GLOSSARY.md)
- See good and bad code side by side: [`examples/typescript/violations-and-fixes.md`](../examples/typescript/violations-and-fixes.md)
- Using an AI agent? Point it at [`AGENTS.md`](../AGENTS.md).
