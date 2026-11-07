<!-- [LAYER: UI] -->
# Changelog

All notable changes to **HEAV3NS-JOY** (`heav3ns-joy`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- README onboarding: badges, table of contents, 2-minute quick start, audience routing table, zone diagram, common tasks, troubleshooting, and FAQ.
- `.github/` CI workflow (Node 18/20/22: tests, self-audit, docs guardrails), PR template, issue templates, `CODEOWNERS`.
- `.editorconfig`, `.gitattributes`, `.nvmrc`, and a hardened `.gitignore`.
- Optional `IWorkspaceScanner.pathExists()` (implemented by `NodeWorkspaceScanner`).

- CI: OS matrix (macOS, Windows), `CI required checks passed` aggregate gate, package hygiene, SARIF code-scanning upload, CodeQL, tag-driven release workflow, Dependabot for actions.
- `tests/cli-smoke.test.mjs` exercising every documented `--format`, SARIF/JSON validity, and `--explain`.
- Docs: `GETTING_STARTED`, `GLOSSARY`, `CI_INTEGRATION`, `RELEASING`, root `SUPPORT.md`; MAINTAINER CI/release section.
- `package.json`: repository/bugs/homepage/keywords/files/exports metadata and `npm run verify`.

### Fixed
- `docs:check` and the test suite falsely reported `LICENSE` links as broken because the scanner skips extensionless files; links now fall back to a real filesystem existence check.

---

## [1.0.0] - 2026-11-07

### Added

- **Pass 1 — Joyzoning Core Engine & Zero-Harness Protocols (`src/domain/`, `src/core/`, `src/infrastructure/`, `src/plumbing/`, `src/ui/`)**:
  - Implemented the 5-zone architectural model (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `UI`, `PLUMBING`) with `0% I/O` domain purity and `[LAYER: <ZONE>]` header enforcement.
  - Created `SpiderEngine` (`src/core/SpiderEngine.mjs`) enforcing `SPI-101..108`, `SPI-201..209`, `SPI-301..303`, and `SPI-401..403` across 8 language families (`.ts/.js/.mjs/.cjs/.java`, `.go/.rs/.c/.cpp/.h/.proto`, `.py/.sh/.rb/.yaml/.yml`, `.sql/.lua/.hs`, `.md/.html/.vue/.svelte`).
  - Added `bin/joy-check.mjs` CLI with `--heal`, `--heal-stateless`, `--doctor`, `--explain`, `--phase`, `--scope`, `--skeleton`, and 10 output formats (`terminal`, `compact`, `json`, `sarif`, `markdown`, `junit`, `github`, `gitlab`, `checkstyle`, `problem-matcher`).
  - Authored 5 zero-harness agent operational workflows (`workflows/01-TRIAD-AUDIT-PLANNING.md` through `workflows/05-GREENFIELD-SCAFFOLDING.md`), 5 zone reference manuals (`zones/`), and 6 prompt templates (`templates/`).
- **Pass 2 — Industrial Ergonomics & Polyglot Import Resolution (`src/plumbing/sourceScanner.mjs`, `src/core/SpiderToolkit.mjs`)**:
  - Added polyglot import extraction (ES6 `import`/`export`, CommonJS `require`, Python `from ... import`, Go `import`, Rust `use`/`mod`) and comment-stripping tokenizer that prevents false-positive `SPI-xxx` triggers inside strings or comments.
  - Added `tsconfig.json` / `jsconfig.json` `compilerOptions.paths` alias resolution (`@domain/*`, `@core/*`, etc.), `.joyignore` gitignore-style path filtering, and baseline ratchet governance (`createBaselineSnapshot`, `filterAgainstBaseline`).
  - Added `computeProjectHealth` (`--doctor`) reporting architectural hotspots, Gini hubbiness, and automatic `I<ClassName>` interface synthesis suggestions.
- **Pass 3 — The Portable Trinity: JoyRide, Spider Toolkit, and BroccoliDB (`src/core/JoyRideCache.mjs`, `src/core/BroccoliRuntime.mjs`, `src/core/RuntimeStateGraph.mjs`, `src/infrastructure/NodeCasStorage.mjs`)**:
  - **JoyRide Context Cache (`JoyRideCache.mjs`)**: 5-tier context degradation (`FULL_SOURCE` -> `INTERFACE_ONLY` -> `SKELETON` -> `SUMMARY_HASH` -> `PATH_ONLY`), LRU eviction, secret guard (`JR-SEC-001`), file-hash invalidation, and token budget planning (`planContextWindow`).
  - **BroccoliDB Causal Runtime (`BroccoliRuntime.mjs`, `RuntimeStateGraph.mjs`)**: Append-only DAG state graph (`task`, `plan`, `action`, `observation`, `repair`, `handoff`, `checkpoint`, `milestone`), 6 execution modes (`development`, `ci`, `production`, `readonly`, `recovery`, `forensic`), execution budgets (`maxSteps`, `maxMutations`, `maxDurationMs`), approval policies, and 10 invariant rules (`BRC-101..104`, `BRC-201..206`).
  - **Content-Addressable Storage (`NodeCasStorage.mjs`)**: Pure Node.js SHA-256 git-style 2-character shard storage (`<dir>/<prefix>/<hash>.json`) with `MemoryCasStorage` in-memory parity.
- **Pass 4 — Zenith Tier Hardening & Mathematical Sovereignty (`src/plumbing/canonicalHash.mjs`, `src/domain/entropyFormulas.mjs`)**:
  - **Deterministic RFC-8785 Canonical JSON & SHA-256 (`canonicalHash.mjs`)**: Recursive key-sorted canonical serialization and zero-dependency FNV-1a + SHA-256 hashing.
  - **Halstead Effort, Maintainability Index & Ghost Coupling (`entropyFormulas.mjs`)**: Added `computeHalsteadMetrics`, `computeMaintainabilityIndex` (`0..100` SEI scale), `computeWorkspaceStatistics`, and `detectGhostCoupling` (`SPI-108` high structural similarity without shared contract).
  - **Crash-Safe Atomic CAS & Spillover (`NodeCasStorage.mjs`, `JoyRideCache.mjs`)**: Atomic `.tmp` + `fs.renameSync` writes, strict `/^[a-f0-9]{64}$/i` path-traversal rejection, corrupt shard quarantine, 4-tier memory pressure valve (`NORMAL`, `ELEVATED`, `HIGH`, `CRITICAL`), and L1-to-L2 CAS spillover.
  - **BroccoliDB Causal Introspection & 5-Mode Replay (`BroccoliRuntime.mjs`)**: Added `timeline()`, `nextActions()`, `causalView()`, `explainNode()`, `migrateRuntimeGraph()`, and 5 replay modes (`logical`, `reexecute`, `hybrid`, `verify_only`, `counterfactual`).
- **Pass 5 — LUMI Documentation Hub Strategy & Open-Source Governance (`docs/`, `bin/docs-check.mjs`, `LICENSE`, `README.md`)**:
  - Added complete LUMI-style documentation hub (`docs/README.md`, `docs/DOCS_GUIDE.md`, `docs/AGENT_STACK.md`, `docs/PROJECT_MAP.md`, `docs/CODE_TO_DOC_MAP.md`, `docs/CONSTITUTION.md`, `docs/CODEBASE_STANDARDS.md`, `docs/MAINTAINER.md`, `docs/SECURITY_BEST_PRACTICES.md`, `docs/architecture/current.md`, `docs/papers/*`, `docs/api/*`).
  - Added `bin/docs-check.mjs` (`npm run docs:check`) and `verifyWorkspaceDocs` in `SpiderToolkit.mjs` verifying required docs, `[LAYER]` tags, relative links, root `README.md` structure, and live export/zone metrics.
  - Added open-source governance suite: MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, and `ROADMAP.md`.
  - Upgraded root `README.md` to mirror LUMI's high-signal architecture, persona routing, Mermaid sequence/trust/stack diagrams, and capability tables.
