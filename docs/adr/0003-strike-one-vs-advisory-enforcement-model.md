<!-- [LAYER: UI] -->
# ADR-0003: Strike-1 Blocking vs. Non-Blocking Advisory Enforcement

- **Status**: Accepted
- **Date**: 2026-02-18
- **Deciders**: HEAV3NS-JOY Core Architecture Team
- **Technical Story**: [`spec/04-ENFORCEMENT-AND-LENIENCY.md`](../../spec/04-ENFORCEMENT-AND-LENIENCY.md) · [`PM-001`](../postmortems/PM-001-agent-infinite-repair-loop-on-advisory-warnings.md)

---

## Status

Accepted — Core Constitutional Law #4 of [`docs/CONSTITUTION.md`](../CONSTITUTION.md).

## Context

When autonomous coding agents are gated by a static analysis tool after every edit (such as via `joy hook post-edit` or CI), treating heuristic or stylistic metrics (cognitive complexity, file length warnings, Tarjan articulation bridges, unused imports) as hard build-failing errors causes **agent repair deadlocks** (documented in [`PM-001`](../postmortems/PM-001-agent-infinite-repair-loop-on-advisory-warnings.md)):
- An agent fixing a 2-line bug in an existing 850-line file or a Tarjan bridge node (`SPI-207`) gets blocked by a pre-existing structural smell unrelated to its task.
- The agent attempts an unrequested large-scale decomposition, introducing regressions or burning its context budget in an oscillatory loop.

Conversely, if true architectural corruption (runtime import cycles, `DOMAIN` importing `node:fs`, `UI` importing `INFRASTRUCTURE`) is treated as a mere warning, agents routinely ignore it.

### Decision drivers

- **Zero False-Positive Deadlocks**: Agents must never get trapped in infinite refactoring loops over heuristic telemetry.
- **Uncompromising Structural Integrity**: True boundary violations and runtime cycles must fail deterministically (`exit 1`).
- **Progressive Brownfield Adoption**: Teams migrating legacy repositories need graduated enforcement (`strict`, `relaxed`, `safety`).

### Considered options

1. **All Diagnostics Fail the Build (`--max-warnings 0`)**: Caused autonomous agent oscillation loops on `SPI-207` bridges and `SPI-203` size warnings ([`PM-001`](../postmortems/PM-001-agent-infinite-repair-loop-on-advisory-warnings.md)).
2. **All Diagnostics Are Advisory (`exit 0`)**: Failed to prevent `DOMAIN` I/O leaks and circular dependencies in CI.
3. **Two-Tier Strike-1 Blocking vs. Advisory Telemetry (`[INFO]`) + 3 Policy Themes (`strict`, `relaxed`, `safety`) + 3-Attempt Escalation Rule**: Only hard structural invariants exit `1`; graph forensics and complexity signals emit non-blocking advisories (`[INFO]`).

## Decision

We chose **Option 3**, partitioning all diagnostics into two strict classes in [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs) and [`src/core/SpiderEngine.mjs`](../../src/core/SpiderEngine.mjs):

### 1. Strike-1 Blocking Violations (`severity: "error"`, exits `1` in `strict` mode)
- `SPI-201`: Runtime Circular Dependency (`A -> ... -> A`, excluding compile-time `import type`)
- `SPI-205`: Mutable Top-Level `let`/`var` State in `[LAYER: PLUMBING]`
- `SPI-206`: Axiomatic Layer Leakage & `DOMAIN` I/O Impurity
- `SPI-208`: Missing `[LAYER: <ZONE>]` Header or Geographic Misalignment (`warning` in `relaxed`)
- `SPI-209`: Relative Import Depth `> 3` (`../../..`, `warning` in `relaxed`)
- `SPI-401..403`: Security Anti-Patterns (`eval`/`new Function`, unsanitized `innerHTML`, hardcoded credentials)
- `SPI-006`: Disk Parity Drift (when baseline hashes are supplied to `runSpiderCheck`)

### 2. Non-Blocking Advisories (`severity: "warning" | "info"`, never alters exit code `0`)
- `SPI-101..112`: Barrel Sovereignty, Ghost Symbols, Deep Nesting, Type-Only Cycles, Cognitive Complexity, Magic Numbers, Temporal Ghost Coupling (`SPI-108`), Domain Drift (`SPI-111`), Unused Imports (`SPI-112`)
- `SPI-202..204`: Systemic Blast Radius, Fat Module (`> 800` lines), Orphaned Module
- `SPI-207`: Tarjan Articulation Bridge
- `SPI-300`: Ripple Prophecy

Additionally, agents are instructed by [`SOUL.md`](../../SOUL.md) and [`AGENTS.md`](../../AGENTS.md) to **stop after 3 failed attempts** on the same blocking finding and escalate with evidence rather than looping indefinitely or weakening config.

## Consequences

### Positive

- CI gates (`joy-check`) and live agent hooks (`joy hook post-edit`) have a 100% signal-to-noise ratio on blocking failures.
- Forensics (`--doctor`, `--stats`) remain available for deliberate refactoring sprints without blocking routine feature delivery.

### Negative / trade-offs

- Advisory warnings can accumulate if never reviewed; mitigated by `joy-check --doctor` Build Health grading (`A`–`F`) and priority queues in `runSpiderCheck`.

## Verification

```bash
node ./bin/joy-check.mjs . --theme strict
node ./bin/joy-check.mjs . --theme relaxed
node ./bin/joy-check.mjs --explain SPI-201
```

- **Code**: [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs) · [`src/core/SpiderEngine.mjs`](../../src/core/SpiderEngine.mjs) · [`src/domain/broccoliRules.mjs`](../../src/domain/broccoliRules.mjs)
- **Postmortem**: [PM-001: Agent Infinite Repair Loop on Advisory Warnings](../postmortems/PM-001-agent-infinite-repair-loop-on-advisory-warnings.md)

