<!-- [LAYER: UI] -->
# ADR-0001: Five Canonical Zones & Principle of Geographic Alignment (PGA)

- **Status**: Accepted
- **Date**: 2026-01-15
- **Deciders**: HEAV3NS-JOY Core Architecture Team
- **Technical Story**: [`spec/00-CANONICAL-MODEL.md`](../../spec/00-CANONICAL-MODEL.md) · [`spec/01-SYNTAX-AND-HEADERS.md`](../../spec/01-SYNTAX-AND-HEADERS.md) · [`spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md`](../../spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md)

---

## Status

Accepted — Core Constitutional Law #1, #2, and #3 of [`docs/CONSTITUTION.md`](../CONSTITUTION.md).

## Context

In fast-moving repositories—especially those co-authored by AI coding agents that only inspect a narrow slice of the codebase at a time—architectural boundaries erode silently:
- Database/filesystem calls (`node:fs`, `fetch`, SQL drivers) leak into pure domain entities.
- Shared utility folders (`utils/`, `helpers/`) accumulate upward imports into business logic and mutable module-level caches (`let cache = {}`), creating hidden circular dependencies (`SPI-201`).
- UI components bypass application controllers and import infrastructure adapters directly.
- Folder names drift from file responsibilities, forcing humans and LLMs to read an entire file just to infer its architectural role.

### Decision drivers

- **60-Second Agent Acquisition**: A coding agent must know a file's architectural role and legal imports from line 1 without loading the entire dependency graph into its context window.
- **Deterministic Static Verification**: Boundaries must be checkable by a fast, language-agnostic static analyzer (`joy-check`).
- **Universal Applicability**: The zone taxonomy must be rich enough for real systems yet small enough (5 zones) to hold in working memory.

### Considered options

1. **Unzoned Lint Rules (`eslint-plugin-import` / ad-hoc regexes)**: Highly project-specific, invisible inside the source file itself, and fragile when files move.
2. **Unbounded Feature/Hexagonal Rings (8–12 custom layers)**: Too many ambiguous boundaries; agents frequently misclassify files between adjacent rings.
3. **Five Canonical Zones + Top-of-File `[LAYER: <ZONE>]` Header + Principle of Geographic Alignment (PGA)**: Every file belongs to `DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, or `UI`; declares its identity in the first 10KB; and resides in a matching physical directory.

## Decision

We chose **Option 3: Five Canonical Zones governed by the Principle of Geographic Alignment (PGA)** and the **Sovereign Dependency Matrix** implemented in [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs):

1. **`DOMAIN` (`src/domain/`)**: Pure business rules, value objects, and `I<ClassName>` port interfaces (`src/domain/interfaces/`). **0% I/O** (`FORBIDDEN_DOMAIN_IO_SPECIFIERS`, `SPI-206`). May only import `domain` and `plumbing`.
2. **`CORE` (`src/core/`)**: Use-case orchestration, state machines, and policy engines. Coordinates `domain` and `infrastructure` via `I*` contracts. Never imports `ui`.
3. **`INFRASTRUCTURE` (`src/infrastructure/`)**: Concrete I/O adapters implementing `domain/interfaces/I*`. Never imports `ui`.
4. **`PLUMBING` (`src/plumbing/` or `src/utils/`)**: Stateless leaf primitives (`0` upward imports, `0` mutable top-level `let`/`var` bindings enforced by `SPI-205`). `[LAYER: UTILS]` normalizes to `PLUMBING`.
5. **`UI` (`src/ui/`, `bin/`)**: Presenters, CLI entrypoints, views, and Composition Roots. Never imports `infrastructure` directly (except explicitly registered `compositionRoots`).

Every file must declare `[LAYER: <ZONE>]` within its first 10,000 characters (`SPI-208`), match its folder geography (or `stability.config.json` / `spider.spec.json` mapping), and keep relative parent traversals `<= 3` (`../../..`, `SPI-209`).

## Consequences

### Positive

- **Zero-ambiguity file identity**: Both humans and LLMs immediately know what a file may and may not import from its first line and directory path.
- **Self-healing onboarding**: `node bin/joy-check.mjs <dir> --heal --heal-stateless` (`RefactorHealer.mjs`) can automatically stamp or align `[LAYER]` headers and convert un-reassigned `let`/`var` bindings in `PLUMBING` to `const`.
- **Brownfield flexibility**: Legacy directory trees map to the 5 zones via `stability.config.json` or `spider.spec.json` without mandatory folder renames.

### Negative / trade-offs

- Every new source and markdown file requires a 1-line `[LAYER: <ZONE>]` header. Mitigated by `joy-check --heal` and `joy hook post-edit`.

## Verification

```bash
node ./bin/joy-check.mjs . --theme strict
node ./bin/joy-check.mjs --explain SPI-206
node ./bin/joy-check.mjs --explain SPI-208
```

- **Code**: [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs) · [`src/plumbing/commentStyles.mjs`](../../src/plumbing/commentStyles.mjs) · [`src/core/RefactorHealer.mjs`](../../src/core/RefactorHealer.mjs)
- **Playbook**: [PB-01: Architectural Violation Remediation](../playbooks/architectural-violation-remediation.md)

