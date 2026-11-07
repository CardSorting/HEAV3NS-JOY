<!-- [LAYER: UI] -->
# HEAV3NS-JOY: A Philosophy of Sovereign Agency

*Design values grounded in the self-hosting reference implementation (`src/`, `bin/`, `spec/`, `workflows/`).*

> **Related:** [Agent stack](../AGENT_STACK.md) · [Companion brief](companion-brief.md) · [Whitepaper](whitepaper.md)

---

## I. Thesis

**Do not build another place where agents run. Build something agents can learn from, carry away, and independently reproduce.**

Most agentic coding tools attempt to control software quality by trapping the agent inside a proprietary runtime harness, custom model router, or mandatory MCP server. When the agent leaves that harness, its discipline vanishes.

**HEAV3NS-JOY** (`heav3ns-joy` v1.0.0) takes the opposite approach: the repository itself is the propagation substrate. By encoding architectural boundaries directly into source files (`[LAYER: <ZONE>]`), physical directory geography, mathematical graph forensics (**Spider**), bounded execution caching (**JoyRide**), and causal state graphs (**BroccoliDB**), any coding agent or human engineer can acquire and verify the discipline in under 60 seconds with **zero external dependencies**.

---

## II. The chain (implemented, not metaphor)

Every principle in HEAV3NS-JOY maps directly to zero-dependency code you can open and inspect:

| Doctrine | Implementation |
|----------|----------------|
| Every file declares its architectural zone | `[LAYER: <ZONE>]` header parser & injector in [`src/plumbing/commentStyles.mjs`](../../src/plumbing/commentStyles.mjs) |
| Physical geography matches declared identity | `inferZoneFromPath()` & `SPI-208` in [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs) |
| `DOMAIN` and `PLUMBING` remain 100% pure | `FORBIDDEN_DOMAIN_IO_SPECIFIERS`, `SPI-205`, & `SPI-206` in [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs) |
| `CORE` depends on contracts, not concretions | [`IWorkspaceScanner.mjs`](../../src/domain/interfaces/IWorkspaceScanner.mjs) & [`ICasStorage.mjs`](../../src/domain/interfaces/ICasStorage.mjs) (`SPI-107`) |
| Structural entropy is measured, not guessed | 5-factor $E_S$, Stability Index $SI$, Martin $D'$, Gini hubbiness, & Z-scores in [`src/domain/entropyFormulas.mjs`](../../src/domain/entropyFormulas.mjs) |
| Disk reality is verified before mutation | SHA-256 Merkle root & `SPI-006` parity check in [`src/core/SpiderToolkit.mjs`](../../src/core/SpiderToolkit.mjs) |
| Agent context is distilled, not bloated | `distillSourceSkeleton()` (`65%–85%` token reduction) in [`src/plumbing/canonicalHash.mjs`](../../src/plumbing/canonicalHash.mjs) |
| Execution caches never serve stale or secret data | 11-point fingerprint validation & secret guard in [`src/core/JoyRideCache.mjs`](../../src/core/JoyRideCache.mjs) |
| Mutations require causal proof & rollback safety | `BroccoliRuntime` & `RTG-001..008` in [`src/core/BroccoliRuntime.mjs`](../../src/core/BroccoliRuntime.mjs) |
| Storage is content-addressed & self-quarantining | Sharded SHA-256 CAS & RFC 1952 GZIP Wire Engine in [`src/infrastructure/NodeCasStorage.mjs`](../../src/infrastructure/NodeCasStorage.mjs) |

```
Acquire    → AGENTS.md + spec/00..05
Scan       → NodeWorkspaceScanner → codeTokenizer → sourceScanner
Prove      → SpiderEngine (SPI-101..403) + SpiderToolkit (Merkle SPI-006)
Cache      → JoyRideCache (11-Point Fingerprint + L1/L2 CAS Spillover)
Govern     → BroccoliRuntime (Intent → Audit → MutationPlan → Execution)
Verify     → verifyRuntimeGraphIntegrity (RTG-001..008) + Post-Edit Spider Diff
Persist    → NodeCasStorage (Atomic Sharded CAS + RFC 1952 Multi-Member GZIP)
Replay     → BroccoliRuntime.replay({ mode: "forensic" | "timeline" | "causal" | "verification" | "ci" })
```

---

## III. Spatial Sovereignty: Why Five Zones?

When an AI agent enters a 100,000-line codebase without spatial boundaries, every file looks like a valid import target. Utility helpers import domain services; UI presenters import database drivers; domain entities perform raw HTTP calls. Within weeks, the dependency graph collapses into a single entangled strongly connected component.

Joyzoning partitions every repository into **Five Canonical Zones**:

1. **`DOMAIN` (`src/domain/`)** — Pure business rules, equations, and `I<ClassName>` interfaces (`0%` I/O).
2. **`CORE` (`src/core/`)** — Application use-case orchestration and state machines (`0%` raw I/O; binds to `DOMAIN` interfaces).
3. **`INFRASTRUCTURE` (`src/infrastructure/`)** — Concrete filesystem, network, database, and OS adapters implementing `DOMAIN` interfaces.
4. **`UI` (`src/ui/`)** — CLI formatters, views, and composition entrypoints routing user intent through `CORE`.
5. **`PLUMBING` (`src/plumbing/` / `src/utils/`)** — Stateless, context-free leaf primitives (`0%` upward imports, `0%` mutable top-level state).

Because a file's `[LAYER: <ZONE>]` header sits in the first line of the file and matches its folder path, an agent knows what a file is allowed to do **before reading a single line of implementation**.

---

## IV. Progressive Leniency Without Deadlocks

Strict architectural enforcement fails when it traps developers or agents in an unresolvable loop during exploratory refactoring. HEAV3NS-JOY separates diagnostics into two explicit classes:

- **Blocking Violations (`ERROR`)**: Hard invariants that corrupt graph topology or security — runtime circular dependencies (`SPI-201`), mutable plumbing state (`SPI-205`), cross-zone boundary leaks (`SPI-206`), missing/mismatched headers (`SPI-208`), import depth $> 3$ (`SPI-209`), and dynamic code execution / XSS (`SPI-401..403`).
- **Non-Blocking Advisories (`WARN` / `INFO`)**: Evolutionary signals — high distance from the Main Sequence (`SPI-101`), compile-time `import type` cycles (`SPI-104`), high logic density (`SPI-105`), cross-zone symbol resonance (`SPI-106`), implicit interfaces (`SPI-107`), and co-mutation ghost coupling (`SPI-108`).

When a legitimate architectural exception exists, the human or agent records an explicit inline directive (`// @joyzoning-bypass <reason>`) that neutralizes the block while surfacing in the audit report for review.

---

## V. Boring to Operate

> *"Agents express intent. Capabilities validate. Runtime governs. Spider proves. StateGraph preserves truth. Snapshots preserve continuity. Replay reconstructs causality. A complete structure is not finished until it is boring to operate."*

By combining **Joyzoning** (spatial clarity), **JoyRide** (bounded, invalidation-safe acceleration), **Spider** (mathematical graph proof), and **BroccoliDB** (causal runtime governance and content-addressed persistence) in zero-dependency standard ECMAScript, HEAV3NS-JOY turns architectural integrity into a portable, verifiable property of the repository itself.

