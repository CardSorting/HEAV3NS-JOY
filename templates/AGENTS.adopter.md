<!-- [LAYER: UI] -->
# AGENTS.md (Joyzoning)

Copy this file into the root of any repository to make AI agents and new contributors follow Joyzoning. Replace paths if your folders differ and map them in `stability.config.json`.

## Zones

Every source file belongs to exactly one zone, declared by a header in its first 10,000 characters and matched by its folder:

| Zone | Folder | Owns | Must never |
| :--- | :--- | :--- | :--- |
| DOMAIN | `src/domain/` | Business rules, entities, `I*` contracts | Do I/O; import infrastructure or ui |
| CORE | `src/core/` | Use-case orchestration | Import ui |
| INFRASTRUCTURE | `src/infrastructure/` | DB, http, filesystem, SDK adapters | Import ui; hold business rules |
| PLUMBING | `src/plumbing/` | Stateless helpers | Import any zone; hold mutable state |
| UI | `src/ui/` | Presenters, CLI, views | Import infrastructure |

Header syntax: `/** [LAYER: DOMAIN] */` (JS/TS/Java), `# [LAYER: DOMAIN]` (Python/Shell/YAML), `// [LAYER: DOMAIN]` (Go/Rust/C), `<!-- [LAYER: UI] -->` (Markdown/HTML).

## Rules

1. Add the correct `[LAYER]` header to every file you create.
2. Keep files in the folder that matches their zone.
3. At most three `../` in a relative import. No import cycles.
4. When core needs infrastructure, define `I<Name>` in `src/domain/interfaces/` and depend on that.
5. Keep modules under 800 lines.

## Verify & Operate

```bash
node <path-to>/HEAV3NS-JOY/bin/joy-check.mjs .                 # exit 0 pass, 1 violations, 2 usage error
node <path-to>/HEAV3NS-JOY/bin/joy-check.mjs --explain SPI-206 # why and how to fix a code
node <path-to>/HEAV3NS-JOY/bin/joy.mjs init . --yes --hooks    # install native agent skills, SOUL.md, hooks, & MCP
node <path-to>/HEAV3NS-JOY/bin/joy-trinity.mjs selftest        # verify portable BroccoliQueue + BufferedDb + AgentSwarm
```

Do not weaken configuration to make a check pass. Report suspected false positives instead.

Full framework: https://github.com/CardSorting/HEAV3NS-JOY
