<!-- [LAYER: UI] -->
# HEAV3NS-JOY — Verification & Clean-Room Acquisition Report

This document records the verification evidence, self-conformance audit results, and clean-room acquisition findings required by [`commission.md`](commission.md) §8.

---

## 1. Self-Conformance Dogfood Audit (`node ./bin/joy-check.mjs .`)

`HEAV3NS-JOY` is 100% self-hosting under its own Joyzoning rules in `strict` mode:

- **Files Scanned**: `72` (including specification documents, workflows, the `docs/` hub & papers, reference validator modules across all 5 zones, portable CI/git-hook templates, TypeScript/ESM and Polyglot examples, and test suites)
- **Zone Distribution**:
  - `DOMAIN`: `17` (`src/domain/`, `spec/`, `docs/CONSTITUTION.md`, and domain examples)
  - `CORE`: `13` (`src/core/` including `SpiderEngine`, `SpiderToolkit`, `BroccoliRuntime`, `RuntimeStateGraph`, `StabilityDoctor`, `RefactorHealer`, `JoyRideCache`, `workflows/`, and core examples)
  - `INFRASTRUCTURE`: `5` (`src/infrastructure/` including `NodeWorkspaceScanner`, `NodeCasStorage`, `configs/` templates, and infrastructure examples)
  - `PLUMBING`: `7` (`src/plumbing/` including `canonicalHash`, `codeTokenizer`, `sourceScanner`, `commentStyles`, `pathUtils`, and plumbing examples)
  - `UI`: `30` (`src/ui/` including `CliFormatter`, `AgentFormatters`, `bin/`, `docs/`, `README.md`, `AGENTS.md`, `VALIDATION_REPORT.md`, and UI examples/tests)
- **Blocking Violations**: `0`
- **Runtime Circular Dependencies (`SPI-201`)**: `0`
- **Fat Module Warnings (`> 800` lines)**: `0` (every module in the repository is in Tier 1 Optimal `< 800` lines)
- **Structural Entropy Score ($E_S$)**: `0.0072`
- **Stability Index ($SI$)**: **`99% (SOVEREIGN)`**
- **Build Health**: **`91% [Grade: A — SOVEREIGN]`**
- **Automated Test Suite (`npm test`)**: **`22/22` suites (`29/29` test cases) passing** (`tests/joyzoning.test.mjs`, `tests/joyzoning-advanced.test.mjs`, and `tests/trinity-portability.test.mjs`)
- **Documentation Guardrails (`npm run docs:check`)**: **`31` required docs, `32` markdown files (100% `[LAYER]` tagged), `156` relative links verified (`0` broken), live metrics in sync**

---

## 2. Clean-Room Acquisition Experiment Findings

In accordance with `commission.md` §8, we evaluated how an unfamiliar coding workflow acquires and applies Joyzoning to an external, un-zoned multi-directory project (`app/models`, `app/usecases`, `app/drivers`, `app/helpers`, `app/cli`) without relying on any LUMI or HEAV3NS runtime integration.

### 2.1 What Worked Immediately
1. **Zero-Harness Progressive Discovery (`README.md` -> `AGENTS.md`)**:
   - The 5-question operational index in [`README.md`](README.md) and the 4-phase protocol in [`AGENTS.md`](AGENTS.md) allow an agent to acquire the 5 canonical zones, comment syntax, and import direction rules in a single file read (`< 150` lines).
2. **Non-Destructive Brownfield Mapping (`spider.spec.json`)**:
   - Mapping legacy directory names (`app/models -> domain`, `app/usecases -> core`, `app/drivers -> infrastructure`, `app/helpers -> plumbing`, `app/cli -> ui`) via `spider.spec.json` brought the unfamiliar project under geographic alignment immediately without requiring destructive directory renames.
3. **Automated Header Stamping (`joy-check --heal`)**:
   - Running `joy-check --heal` stamped all 6 untagged source files with their canonical `[LAYER: <ZONE>]` tags while preserving `#!/usr/bin/env node` on Line 1 of executable scripts, raising the project's Stability Index from `85%` (6 blocking `SPI-208` violations) to **`100% (SOVEREIGN)`** with `0` violations.

### 2.2 Subtle Edge Cases Discovered & Resolved During Verification
During testing and adversarial review, six concrete propagation/parsing edge cases were discovered and fixed in the reference validator (`src/`):

1. **Single-Pass Lexical String/Regex/Comment Sanitization**:
   - *Discovery*: Stripping `//` and `/* ... */` via regex before string literals corrupted source lines containing URLs (`"https://..."`) or comment tokens inside strings (`"/*"`), hiding subsequent imports on the same line.
   - *Resolution*: Replaced multi-pass regex stripping with a single-pass character lexer (`scanCodeTokens` in [`src/plumbing/sourceScanner.mjs`](src/plumbing/sourceScanner.mjs)) that tracks single/double-quoted strings, template literals, and regex literals before stripping comments, and supports semicolon-separated imports (`; import ...`), barrel re-exports (`export * from` / `export { X } from`), dynamic `import(...)`, and inline `import { type X }`.
2. **Case-Sensitive `I<ClassName>` Contractual Sovereignty**:
   - *Discovery*: A case-insensitive `/\/i[a-z0-9_]+\.[a-z]+$/i` regex on lowercased paths caused concrete Domain entities starting with `I` (such as `Invoice.ts` or `Item.ts`) to be misclassified as `I<ClassName>` interfaces when imported by `INFRASTRUCTURE`.
   - *Resolution*: Restricted the filename fallback in [`evaluateZoneDependency`](src/domain/joyRules.mjs) to case-sensitive `/\/I[A-Z][A-Za-z0-9_]*\.[a-z]+$/` on the original path, ensuring `IOrderRepository.ts` is permitted while concrete `Invoice.ts` triggers `SPI-206`.
3. **Wildcard `spider.spec.json`, LUMI `resources` Schema, and `tsconfig.json` `paths` Resolution**:
   - *Discovery*: Brownfield monorepos and LUMI-native configs use wildcard segments (`packages/*/src/domain`), `resources: { key: { path, domain } }` (`api`/`admin` -> `infrastructure`), and `tsconfig.json` `compilerOptions.paths` aliases (`@/*`, `@app-domain/*`).
   - *Resolution*: Added wildcard segment matching in [`inferZoneFromPath`](src/domain/joyRules.mjs), LUMI `resources` normalization in [`NodeWorkspaceScanner.mjs`](src/infrastructure/NodeWorkspaceScanner.mjs), and JSON-with-comments `tsconfig.json` `paths` resolution in [`SpiderEngine.mjs`](src/core/SpiderEngine.mjs).
4. **Symlink Loops, Binary Files (`\0`), and `@generated` File Exemptions**:
   - *Discovery*: Real-world repositories may contain circular directory symlinks, binary blobs with source extensions, or codegen output (`@generated`, `DO NOT EDIT`).
   - *Resolution*: Added `fs.realpathSync` visited-directory tracking, null-byte `\0` binary checks, and comment-anchored `@generated` / `DO NOT EDIT` exemptions in [`NodeWorkspaceScanner.mjs`](src/infrastructure/NodeWorkspaceScanner.mjs).
5. **Python Multi-Level Relative Import Resolution (`from ..plumbing.text_utils import ...`)**:
   - *Discovery*: Python relative imports use leading dots (`..plumbing.text_utils`) rather than slash-separated `../` segments.
   - *Resolution*: Updated the Python import extractor in [`sourceScanner.mjs`](src/plumbing/sourceScanner.mjs) to normalize leading dot levels (`..` -> `../`) and package dots (`.` -> `/`).
6. **Complete Graph Forensics (`SPI-104`, `SPI-102`, `SPI-204`, `SPI-300`, and Barrel Bypass)**:
   - *Discovery*: Compile-time `import type` cycles (`SPI-104`), missing named exports (`SPI-102`), dead modules that have outgoing imports (`Ca = 0, Ce > 0` for `SPI-204`), and external imports bypassing subfolder barrels (`index.*`) needed explicit enforcement matching [`spec/02`](spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md) and [`spec/03`](spec/03-METRICS-AND-FORENSICS.md).
   - *Resolution*: Implemented all five checks across [`entropyFormulas.mjs`](src/domain/entropyFormulas.mjs) and [`SpiderEngine.mjs`](src/core/SpiderEngine.mjs).
7. **Pass 2 Deep Hardening — Polyglot Module Resolution, Transitive Re-Exports, Statelessness Healing, JoyRide Cache, & CI/SARIF Ergonomics**:
   - *Discovery*: Real-world polyglot and monorepo workspaces use `tsconfig.json` `extends` chains, Node `package.json` `#*` subpath imports, `.joyignore` wildcards, Go `go.mod` module prefixes, Rust `crate::`/`super::` paths, Python multi-line `from ... import (...)` and `if TYPE_CHECKING:` blocks, UTF-8 BOMs (`\uFEFF`) before `#!` shebangs, and multi-line `for (let i = 0; ...)` loops. Additionally, teams need SARIF 2.1.0 / GitHub Actions / Markdown CI outputs, `--doctor` hotspot & interface synthesis diagnostics, `--explain <CODE|ZONE>` self-service documentation, `--heal-stateless` (`let`/`var` -> `const`), deterministic `planMove` import rewiring, and a reference `JoyRideCache` engine.
   - *Resolution*: Implemented and verified all capabilities across [`codeTokenizer.mjs`](src/plumbing/codeTokenizer.mjs), [`sourceScanner.mjs`](src/plumbing/sourceScanner.mjs), [`joyRules.mjs`](src/domain/joyRules.mjs), [`NodeWorkspaceScanner.mjs`](src/infrastructure/NodeWorkspaceScanner.mjs), [`SpiderEngine.mjs`](src/core/SpiderEngine.mjs), [`StabilityDoctor.mjs`](src/core/StabilityDoctor.mjs), [`RefactorHealer.mjs`](src/core/RefactorHealer.mjs), [`JoyRideCache.mjs`](src/core/JoyRideCache.mjs), and [`CliFormatter.mjs`](src/ui/CliFormatter.mjs), backed by 16 end-to-end test suites.
8. **Pass 3 Portable Substrate Trinity — Zero-Dependency JoyRide, Spider Agent Ergonomics, & BroccoliDB**:
   - *Discovery*: Translating LUMI's **JoyRide**, **Spider**, and **BroccoliDB** beyond Joyzoning with zero external dependencies required a pure, zero-I/O FIPS 180-4 SHA-256 and AST skeletonization layer in `PLUMBING` ([`canonicalHash.mjs`](src/plumbing/canonicalHash.mjs)), a formal `ICasStorage` + `GuidedError` contract in `src/domain/interfaces/` ([`ICasStorage.mjs`](src/domain/interfaces/ICasStorage.mjs)) so `NodeCasStorage` in `INFRASTRUCTURE` obeys `SPI-206` Contractual Sovereignty without importing concrete Domain files, and modular `CORE`/`UI` engines staying below the 800-line Tier 1 cap.
   - *Resolution*: Implemented and verified [`canonicalHash.mjs`](src/plumbing/canonicalHash.mjs), [`ICasStorage.mjs`](src/domain/interfaces/ICasStorage.mjs), [`broccoliRules.mjs`](src/domain/broccoliRules.mjs), [`NodeCasStorage.mjs`](src/infrastructure/NodeCasStorage.mjs), [`JoyRideCache.mjs`](src/core/JoyRideCache.mjs), [`SpiderToolkit.mjs`](src/core/SpiderToolkit.mjs), [`BroccoliRuntime.mjs`](src/core/BroccoliRuntime.mjs), [`AgentFormatters.mjs`](src/ui/AgentFormatters.mjs), [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](spec/05-PORTABLE-SUBSTRATE-TRINITY.md), [`workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md`](workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md), and Suites 17–20 in [`tests/trinity-portability.test.mjs`](tests/trinity-portability.test.mjs).
9. **Pass 4 Zenith Tier — Atomic CAS & Path-Traversal Hardening, L1/L2 JoyRide Spillover, `SPI-108` Ghost Coupling, Multivariate Statistics (`--stats`), & Operator Projections**:
   - *Discovery*: Further hardening the Trinity substrate against crash-time partial writes, malicious CAS/snapshot path traversal (`../../`), memory pressure spikes during long agent sessions, hidden co-mutation coupling (`SPI-108`), and multi-line class method signatures required atomic temp-file writes + `fs.renameSync` in `INFRASTRUCTURE`, a 4-tier memory pressure valve with L2 `ICasStorage` spillover in `JoyRideCache`, Jaccard co-mutation and multivariate Z-score analysis in `entropyFormulas.mjs`, and dedicated operator projections (`timeline`, `nextActions`, `causalView`, `explainNode`, `migrateRuntimeGraph`, and 5 `replay` modes) in `RuntimeStateGraph.mjs` & `BroccoliRuntime.mjs`.
   - *Resolution*: Implemented and verified all Zenith capabilities across [`canonicalHash.mjs`](src/plumbing/canonicalHash.mjs), [`entropyFormulas.mjs`](src/domain/entropyFormulas.mjs), [`broccoliRules.mjs`](src/domain/broccoliRules.mjs), [`NodeCasStorage.mjs`](src/infrastructure/NodeCasStorage.mjs), [`NodeWorkspaceScanner.mjs`](src/infrastructure/NodeWorkspaceScanner.mjs), [`JoyRideCache.mjs`](src/core/JoyRideCache.mjs), [`RuntimeStateGraph.mjs`](src/core/RuntimeStateGraph.mjs), [`BroccoliRuntime.mjs`](src/core/BroccoliRuntime.mjs), [`SpiderToolkit.mjs`](src/core/SpiderToolkit.mjs), [`AgentFormatters.mjs`](src/ui/AgentFormatters.mjs), [`bin/joy-check.mjs`](bin/joy-check.mjs), and Suite 21 in [`tests/trinity-portability.test.mjs`](tests/trinity-portability.test.mjs).



