<!-- [LAYER: CORE] -->
# 03 — Adopting Joyzoning in Existing (Brownfield) Projects

You do not need to rewrite an existing codebase from scratch to adopt Joyzoning. This playbook provides a zero-downtime, incremental adoption path for any existing repository in TypeScript/JavaScript, Python, Go, Rust, or Java.

---

## Phase 1: Baseline Forensic Scan (Read-Only)

Run the reference validator in `relaxed` mode against the target repository to establish a baseline Structural Entropy Score ($E_S$) and Stability Index ($SI$):

```bash
node /path/to/HEAV3NS-JOY/bin/joy-check.mjs /path/to/target-project --theme relaxed
```

What this tells you immediately:
- Total tracked source files and current directory depth.
- Which files already live in recognizable zone folders (`domain`, `core`, `infrastructure`/`services`/`adapters`, `utils`/`plumbing`, `ui`/`cli`/`views`).
- Existing circular dependencies (`SPI-201`), cross-layer leaks (`SPI-206`), and monoliths (`SPI-203`).

---

## Phase 2: Map Existing Directories (`spider.spec.json`)

If the brownfield project uses framework-specific directory names (for example, `src/models`, `src/controllers`, `src/db`, `src/helpers`, `src/components`), map them to the 5 canonical Joyzoning zones by placing a `spider.spec.json` (or `stability.config.json`) at the project root:

```json
{
  "layers": {
    "domain": ["src/domain", "src/models", "src/entities", "src/contracts"],
    "core": ["src/core", "src/controllers", "src/usecases", "src/application"],
    "infrastructure": ["src/infrastructure", "src/db", "src/adapters", "src/services", "src/clients"],
    "plumbing": ["src/plumbing", "src/utils", "src/helpers", "src/lib"],
    "ui": ["src/ui", "src/components", "src/views", "src/cli", "src/pages"]
  }
}
```

This brings the project under geographic alignment immediately without breaking existing import paths or open pull requests.

---

## Phase 3: Automated Header Tag Stamping (`--heal`)

Stamp `[LAYER: <ZONE>]` header tags across all mapped files in a single pass:

```bash
node /path/to/HEAV3NS-JOY/bin/joy-check.mjs /path/to/target-project --heal
```

- Every file receives its language-appropriate header comment (`/** [LAYER: ... ] */`, `# [LAYER: ... ]`, `// [LAYER: ... ]`, etc.).
- Shebangs (`#!`) and YAML frontmatter (`---`) are preserved intact.
- Run your existing test suite immediately after `--heal` to confirm 0 functional regressions (header comments are no-ops at runtime).

---

## Phase 4: Surgical Decoupling (High-Value Targets First)

Do not attempt to fix every legacy warning in one commit. Prioritize fixes in this exact order:

1. **Purify `DOMAIN` (`SPI-206`)**:
   - Find any file in `domain` (or `models`/`entities`) that imports database drivers, HTTP clients, or `fs`.
   - Extract the I/O operations into an `infrastructure` repository and leave only pure business validation/calculation and an `I<Name>Repository` interface in `domain`.
2. **Break Runtime Circular Dependencies (`SPI-201`)**:
   - Identify every runtime cycle $A \leftrightarrow B$.
   - Extract shared interfaces/types into `domain/interfaces/` or shared pure functions into `plumbing/`.
3. **Sever Direct `UI -> INFRASTRUCTURE` Shortcuts (`SPI-206`)**:
   - If UI components or CLI entrypoints import database or HTTP adapters directly, route those calls through a `core` controller or use-case service.
4. **Flatten Deep Relative Imports (`SPI-209`)**:
   - Replace `../../../../` imports with path aliases (`@domain/`, `@core/`, `@infrastructure/`, `@plumbing/`, `@ui/`).

---

## Phase 5: Lock In Conformance (`strict` Mode)

Once blocking `SPI-201`, `SPI-206`, `SPI-208`, and `SPI-209` violations reach `0`:
1. Copy [`AGENTS.md`](../AGENTS.md) into the target project root so every future coding agent session automatically follows Joyzoning rules.
2. Add `joy-check` (or the 8-point self-check rubric) to pre-commit or CI checks in `strict` mode.

