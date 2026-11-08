<!-- [LAYER: UI] -->
# Deep Technical FAQ, Edge Cases, & Escape Hatch Patterns

<p align="center">
  <a href="README.md">Knowledge Base Hub</a> ·
  <a href="../README.md">Docs Hub</a> ·
  <a href="../../spec/04-ENFORCEMENT-AND-LENIENCY.md">Spec 04: Leniency</a> ·
  <a href="../wiki/polyglot-recipes.md">Polyglot Cookbook</a> ·
  <a href="../playbooks/brownfield-migration-and-monorepo-rollout.md">Brownfield Playbook</a>
</p>

Detailed answers to architectural edge cases, language quirks, escape hatches, and operational scenarios.

---

## 1. Architecture & Dependency Rules

### Q: Can `INFRASTRUCTURE` import from `DOMAIN`?
**Yes, for contracts and types (`src/domain/interfaces/I*`)**: `INFRASTRUCTURE` adapters exist to implement `DOMAIN` port interfaces (`IWorkspaceScanner`, `ICasStorage`, `IBufferedStore`). In [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs), `INFRASTRUCTURE -> DOMAIN` is legal so adapters can implement interfaces and reference domain value types. However, `DOMAIN -> INFRASTRUCTURE` is strictly forbidden (`SPI-206`).

### Q: Why does `src/index.mjs` or `bin/joy.mjs` import both `CORE` and `INFRASTRUCTURE` without triggering `SPI-206`?
Because they are **Composition Roots**! In Dependency Inversion, at least one entrypoint module at the top of the application must instantiate concrete `INFRASTRUCTURE` adapters (`new NodeWorkspaceScanner()`) and inject them into `CORE` services (`new SpiderEngine(scanner)`). Files listed in `stability.config.json` under `"compositionRoots"` (or matching `bin/*` / `src/index.*` / `src/main.*`) are recognized as Composition Roots.

### Q: Does a TypeScript `import type { Foo } from ...` count as a runtime circular dependency (`SPI-201`)?
**No.** [`sourceScanner.mjs`](../../src/plumbing/sourceScanner.mjs) distinguishes runtime imports from compile-time `import type` / `export type` statements. A cycle formed solely by type-only imports is downgraded from a blocking `SPI-201` error to a non-blocking `SPI-104` (`Type-Only Circular Dependency`) advisory because TypeScript erases type imports completely before runtime execution.

### Q: What is the difference between `[LAYER: PLUMBING]` and `[LAYER: UTILS]`?
They are synonyms. `[LAYER: UTILS]` is an accepted alias in [`commentStyles.mjs`](../../src/plumbing/commentStyles.mjs) that normalizes to `plumbing`. Both `src/plumbing/` and `src/utils/` map to the `PLUMBING` zone (0% upward imports, 0% I/O, 0% mutable top-level `let`/`var` state).

---

## 2. Escape Hatches & Leniency Directives

### Q: How do I suppress a specific rule on a legitimate architectural exception (e.g., a platform host bridge or generated wire file)?
First, if the entire file or directory is third-party/generated, add its glob pattern to `.joyignore` or `stability.config.json` `"exclude"`.

If a first-party file requires a documented inline exception, use one of the two auditable directives defined in [`spec/04-ENFORCEMENT-AND-LENIENCY.md`](../../spec/04-ENFORCEMENT-AND-LENIENCY.md):
- **File-level bypass with mandatory reason**:
  ```js
  // @joyzoning-bypass Legacy host bridge scheduled for extraction in Q3
  ```
- **Rule-specific suppression**:
  ```js
  // @sovereign-ignore SPI-206
  ```
All bypassed items are still recorded in `report.bypassedItems` so they are never silently hidden from audits.

---

## 3. Portable Trinity & Swarm Knowledge Edge Cases

### Q: Why was my `Heuristic: ...` note skipped (`rejected: 1`) when running `joy-trinity swarm knowledge store`?
Run `swarm knowledge store` and inspect the returned `rejectedReasons` array in the JSON output:
- `EMPTY_OR_NOT_STRING`: The note was blank.
- `TOO_LONG`: The note exceeded `500` characters (`MAX_LEGION_OBSERVATION_LENGTH`).
- `CONTROL_OR_MULTILINE`: The note contained newlines or ASCII control characters.
- `SENSITIVE_KEYWORD`: The note contained words like `password`, `secret`, `api_key`, `access_token`, `bearer`, or `private_key`.
- `CREDENTIAL_PATTERN`: The note matched a token pattern (GitHub PAT, `sk-proj-*`, AWS `AKIA*`, JWT `eyJ*`, etc.).
- **Duplicate**: If `rejectedReasons` is absent and `stored: 0`, the exact heuristic (case-insensitive) is already stored and unexpired for that `--cwd`.

### Q: How do I delete a stale or inaccurate heuristic from a workspace?
Use `swarm knowledge search` and `swarm knowledge prune`:
```bash
# Search matching heuristics first:
node bin/joy-trinity.mjs swarm knowledge search --cwd . --query "old command"

# Delete only heuristics matching the substring:
node bin/joy-trinity.mjs swarm knowledge prune --cwd . --query "old command"

# Or clear all heuristics for the current workspace:
node bin/joy-trinity.mjs swarm knowledge prune --cwd . --all
```

### Q: Can I run `joy-trinity` or `joy-check` in an air-gapped CI container with a read-only source checkout?
- **`joy-check`**: 100% read-only by default (writes nothing unless `--init`, `--heal`, or `--heal-stateless` is passed). Works on a read-only filesystem.
- **`joy-trinity`**: Needs a writable state directory for `.joy-lock` and `.broccolidb`. Point `--root /tmp/joy-state` (or set `JOY_STATE_ROOT=/tmp/joy-state`) when the source repository mount is read-only.

