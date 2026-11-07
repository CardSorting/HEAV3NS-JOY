<!-- [LAYER: UI] -->
# ROADMAP.md

## 1. Project Center of Gravity

**Core Purpose:**  
Provide a zero-dependency, agent-native software development framework (`heav3ns-joy`) that enforces **Joyzoning** architectural sovereignty, **Spider** static/entropy verification, **JoyRide** 5-tier context compression, and **BroccoliDB** causal runtime provenance across any codebase or coding agent.

**Primary Users / Operators:**  
Autonomous coding agents, pair-programming AI assistants, solo developers, tech leads, and systems architects who require deterministic structural guarantees without locking into a heavy runtime harness.

**Canonical Architecture:**  
5-Zone Joyzoning (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `UI`, `PLUMBING`) governed by `SpiderEngine` (`src/core/SpiderEngine.mjs`) over the `BroccoliRuntime` + `JoyRideCache` + `NodeCasStorage` substrate (`docs/AGENT_STACK.md`).

**Canonical Workflows:**  
5 Operational Workflows (`workflows/01-TRIAD-AUDIT-PLANNING.md` through `workflows/05-GREENFIELD-SCAFFOLDING.md`) verified by `npm test`, `npm run joy-check`, and `npm run docs:check`.

**Primary Runtime / Operational Center:**  
Workspace project root (`src/index.mjs`, `bin/joy-check.mjs`, `bin/docs-check.mjs`) — zero external dependencies, pure ES Modules on Node.js `>=18.0.0`.

**What This Project Must Not Become:**  
A bloated agent wrapper with external npm dependencies, network telemetry, vendor lock-in, or unverified prose policies that diverge from executable code.

---

## 2. Roadmap Health

**Status:** Coherent (`SOVEREIGN` — `99%` Stability Index)

**Phase:** Zenith & Open-Source Governance (v1.0.0)

**Summary:**  
Passes 1 through 5 are complete and verified across 22 test suites (`29/29` test cases), `0` architectural violations, and `100%` documentation link and metric alignment.

**Why This Status:**  
- All 5 architectural zones (`plumbing`, `domain`, `infrastructure`, `core`, `ui`) obey `0% I/O` domain purity and contractual sovereignty (`IWorkspaceScanner`, `ICasStorage`).
- `bin/joy-check.mjs` and `bin/docs-check.mjs` enforce continuous structural and documentation verification.
- Open-source governance (`LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `ROADMAP.md`, `docs/SECURITY_BEST_PRACTICES.md`) and LUMI-grade documentation hub are in place.

**Primary Risk:**  
Documentation or export-count drift when new symbols are added to `src/index.mjs` without updating `docs/api/public-api.md` (mitigated automatically by `npm run docs:check`).

**Primary Opportunity:**  
Drop-in adoption across external polyglot repositories via `npx joy-check <project-root> --init` and zero-harness agent onboarding via `AGENTS.md`.

---

## 3. Strategic Narrative

Software repositories maintained by high-velocity humans and coding agents naturally decay toward monolithic entanglement unless structural boundaries are cheaper to follow than to violate. **HEAV3NS-JOY** solves this by pairing an instant 5-zone mental model (`AGENTS.md`) with a zero-dependency verification and cognitive substrate (`src/index.mjs`).

---

## 4. Now (Completed in v1.0.0)

### 1. Pass 1–2: Joyzoning & Spider Engine Sovereignty
- **Goal:** Establish 5-zone PGA enforcement, polyglot AST import extraction, tsconfig alias resolution, and 10 CI/CD output formats.
- **Evidence:** `src/core/SpiderEngine.mjs`, `src/core/SpiderToolkit.mjs`, `tests/joy-check.test.mjs`, `tests/portability.test.mjs`.
- **Center-of-Gravity Impact:** Foundation.

### 2. Pass 3–4: The Portable Trinity & Zenith Hardening
- **Goal:** Deliver `JoyRideCache` (5-tier context skeletonizer + L1/L2 CAS spillover), `BroccoliRuntime` (causal DAG + 5 replay modes + 6 execution modes), `NodeCasStorage` (atomic `.tmp` + rename + SHA-256 quarantine), and `entropyFormulas` (Gini, Shannon, Halstead, Maintainability Index, `SPI-108` Ghost Coupling).
- **Evidence:** `src/core/JoyRideCache.mjs`, `src/core/BroccoliRuntime.mjs`, `src/infrastructure/NodeCasStorage.mjs`, `tests/trinity-portability.test.mjs`.
- **Center-of-Gravity Impact:** Strengthens.

### 3. Pass 5: LUMI Documentation Hub & Open-Source Governance
- **Goal:** Mirror LUMI's `docs/` hub strategy, root `README.md` architecture, MIT `LICENSE`, and standard open-source community documents verified by `bin/docs-check.mjs`.
- **Evidence:** `README.md`, `docs/README.md`, `bin/docs-check.mjs`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`.
- **Center-of-Gravity Impact:** Strengthens.

---

## 5. Next

- **Polyglot Language Grammar Expansion:** Extend `extractSymbolsAndSignatures` and `skeletonizeSource` in `src/plumbing/sourceScanner.mjs` and `src/plumbing/canonicalHash.mjs` with deeper trait/protocol signature extraction for Rust, Go, and C++.
- **Interactive HTML Architecture Map Exporter:** Add optional single-file static HTML report generation to `AgentFormatters.mjs` for visual dependency and causal DAG inspection.

---

## 6. Later

- **Git Hook & Pre-Commit Scaffolder:** Optional `--install-hooks` flag in `bin/joy-check.mjs` to wire pre-commit verification without external hook managers.
- **Cross-Repo Federated Causal Graphs:** Link `BroccoliRuntime` handoff nodes across multi-repo workspaces using content-addressed CAS digests.

---

## 7. Discovery

- Evaluate WebAssembly / browser-worker execution adapters implementing `IWorkspaceScanner` and `ICasStorage` for zero-filesystem cloud IDEs.

---

## 8. Maintenance Gravity

### Hotspots

| Area | Symptom | Risk | Recommended Action |
|------|---------|------|--------------------|
| `src/core/SpiderToolkit.mjs` | Highest orchestration breadth (~460 lines) | Low | Keep `< 600` lines; delegate pure formatting to `src/ui/AgentFormatters.mjs` |
| `bin/joy-check.mjs` | CLI argument routing & self-healing | Low | Keep CLI presentation thin; route logic through `SpiderToolkit` |

### Repeated Friction
None — `npm run docs:check` and `npm run joy-check` catch structural and documentation drift immediately.

### Documentation Gaps
None (`0` missing docs, `0` broken relative links verified by `bin/docs-check.mjs`).

### Agent Confusion Points
Resolved via [AGENTS.md](AGENTS.md), [docs/AGENT_STACK.md](docs/AGENT_STACK.md), and [docs/CODE_TO_DOC_MAP.md](docs/CODE_TO_DOC_MAP.md).

---

## 9. Centralization & Code Soup Audit

**Overall Code Soup Risk:** Low (`0%` Zone Ambiguity, `99%` Stability Index)

### Canonical Path Integrity
All 84 public exports are centralized in `src/index.mjs`. Every file belongs to exactly one of the 5 canonical zones.

### Authority Boundaries
- Static & mathematical rules: `src/domain/`
- Stateful orchestration & DAG runtime: `src/core/`
- Filesystem & CAS I/O: `src/infrastructure/`
- Stateless AST & hash primitives: `src/plumbing/`
- Formatters, CLI, and Markdown docs: `src/ui/`, `bin/`, `docs/`

---

## 10. Decision Log

### 2026-11-07 — Zero-Dependency ESM + MIT Open-Source Governance
- **Decision:** Keep `package.json` strictly at `0` external dependencies under the `MIT` license and enforce documentation parity via `bin/docs-check.mjs`.
- **Reason:** Eliminates supply-chain risk, guarantees instant execution on any Node.js `>=18.0.0` environment, and ensures documentation never drifts from code.
- **Impact:** All 78 workspace files pass `joy-check`, `docs:check`, and `npm test`.
