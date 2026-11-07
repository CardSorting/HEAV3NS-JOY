<!-- [LAYER: DOMAIN] -->
# 00 — The Canonical Joyzoning Model

## 1. Purpose & Philosophy

**Joyzoning** (also referred to in source literature as **Architectural Sovereignty** or **The Sovereign Graph**) is a deterministic software architecture convention designed to make structural intent explicit, machine-verifiable, and resilient against multi-turn agentic or human code drift.

In conventional repositories, architectural boundaries are implicit: an unfamiliar developer or coding agent must infer whether a file is pure business logic, a stateful orchestrator, an I/O adapter, or a stateless helper by reading its entire implementation and tracing its transitive imports. Over dozens of edits, boundaries blur—business rules leak into UI views, database calls creep into domain models, circular dependencies form, and "god modules" accumulate.

Joyzoning solves this by establishing **three invariants**:
1. **Archetypal Primacy**: Every source file explicitly declares its architectural zone (`[LAYER: <ZONE>]`) at the top of the file.
2. **Geographic Alignment**: Every source file resides in a physical directory path that matches its declared zone.
3. **Sovereign Graph Physics**: Cross-zone imports, relative path depths, I/O operations, and module sizes are governed by strict, quantifiable thresholds.

---

## 2. The Five Canonical Zones

Every source file in a Joyzoned system belongs to exactly one of five canonical zones.

### 2.1 `DOMAIN` (`src/domain/`)
The heart of the software's business rules, domain models, value objects, domain policies, and formal architectural contracts (`src/domain/interfaces/I*.ts`).

- **Canonical Tag**: `[LAYER: DOMAIN]`
- **Canonical Geography**: `src/domain/` (or `<module>/domain/`)
- **Quantitative Thresholds**:
  - `optimalLogicDensity`: `0.15` (high concentration of pure conditional/domain reasoning)
  - `maxIOEntropy`: `0.00` (**0% I/O allowed**)
  - `maxComplexity`: `5000`
- **Hard Invariants**:
  - **Zero I/O**: Must never import or invoke filesystem, network, process, or database APIs (`fs`, `path` OS operations, `http`, `https`, `net`, `child_process`, `fetch`, `axios`, SQL/NoSQL drivers).
  - **Zero Upward/Outward Leakage**: Must never import from `INFRASTRUCTURE`, `UI`, or concrete `CORE` orchestrators.
  - **Single-Responsibility Entity Focus**: Ideally 1 class/entity per file. More than 1 class in a file `> 500` lines, or more than 3 classes in any single `DOMAIN` file, triggers a `Class Density Violation`.
  - **Contractual Sovereignty Host**: Houses the formal `I<ClassName>` interfaces in `src/domain/interfaces/` that decouple `CORE` and `INFRASTRUCTURE`.

### 2.2 `CORE` (`src/core/`)
The application orchestration layer: use-case controllers, workflow state machines, policy evaluators, event coordinators, and task runners.

- **Canonical Tag**: `[LAYER: CORE]`
- **Canonical Geography**: `src/core/` (or `<module>/core/`)
- **Quantitative Thresholds**:
  - `optimalLogicDensity`: `0.05`
  - `maxIOEntropy`: `0.00` (delegates concrete I/O to `INFRASTRUCTURE` adapters via `DOMAIN` interfaces)
  - `maxComplexity`: `3000`
- **Hard Invariants**:
  - **UI Decoupling**: Must never import from `UI`. Communication with presentation layers happens via return values, domain events, callbacks, or reactive streams.
  - **I/O Delegation**: Orchestrates `DOMAIN` entities and invokes `INFRASTRUCTURE` capabilities through interfaces (`I*`). Avoid direct low-level I/O primitives inside `CORE`.

### 2.3 `INFRASTRUCTURE` (`src/infrastructure/`)
The concrete boundary with the external world: filesystem adapters, database repositories, HTTP/gRPC servers and clients, OS/platform host bridges, external SDK wrappers, and telemetry exporters.

- **Canonical Tag**: `[LAYER: INFRASTRUCTURE]`
- **Canonical Geography**: `src/infrastructure/` (plus mapped adapter directories such as `src/adapters/`, `src/services/`, `src/integrations/`, `src/hosts/`)
- **Quantitative Thresholds**:
  - `optimalLogicDensity`: `0.05`
  - `maxIOEntropy`: `1.00` (100% I/O permitted)
  - `maxComplexity`: `10000`
- **Hard Invariants**:
  - **UI Decoupling**: Must never import from `UI`.
  - **No Embedded Domain Logic**: If an `INFRASTRUCTURE` module exhibits high pure logic density (`> 0.30`) with zero external I/O (`ioEntropy === 0`), it is flagged as `Misplaced Domain Logic` and must be extracted to `DOMAIN`.
  - **Contractual Implementation**: Implements `I<ClassName>` interfaces declared in `src/domain/interfaces/`.

### 2.4 `UI` (`src/ui/`)
The presentation and interaction boundary: CLI presenters, terminal formatters, webviews, React/Vue/Svelte components, view models, and user input parsers.

- **Canonical Tag**: `[LAYER: UI]`
- **Canonical Geography**: `src/ui/` (or `webview-ui/`, `frontend/`, `src/cli/`, `docs/`)
- **Quantitative Thresholds**:
  - `optimalLogicDensity`: `0.00`
  - `maxIOEntropy`: `1.00`
  - `maxComplexity`: `15000`
- **Hard Invariants**:
  - **No Direct Infrastructure Access**: `UI` must **never** directly import concrete modules from `INFRASTRUCTURE`. All user actions and data queries must route through `CORE` controllers or `DOMAIN` contracts.

### 2.5 `PLUMBING` (`src/plumbing/` or `src/utils/`)
The foundational leaf layer: stateless, context-free helper functions, pure string/math/collection manipulators, path normalizers, and generic parsers.

- **Canonical Tag**: `[LAYER: PLUMBING]` (Alias: `[LAYER: UTILS]` is accepted and normalizes to `plumbing`)
- **Canonical Geography**: `src/plumbing/`, `src/utils/`, `src/shared/utils/`
- **Quantitative Thresholds**:
  - `optimalLogicDensity`: `0.00`
  - `maxIOEntropy`: `0.00`
  - `maxComplexity`: `500`
- **Hard Invariants**:
  - **Complete Upward Isolation**: `PLUMBING` is a pure leaf zone. It must **never** import from `DOMAIN`, `CORE`, `INFRASTRUCTURE`, or `UI`. It may only import other `PLUMBING` modules or language standard-library primitives.
  - **Strict Statelessness**: Must not hold mutable module-level state (`let` or `var` declarations at module scope are forbidden; use `const` and pure functions).

---

## 3. Core Terminology Glossary

| Term | Definition |
| :--- | :--- |
| **Archetypal Primacy** | The rule that every file must declare its `[LAYER: <ZONE>]` header within the first 10,000 characters, prior to any executable code. |
| **Principle of Geographic Alignment (PGA)** | The invariant that a file's physical directory path must match its declared `[LAYER: <ZONE>]` header tag. |
| **Contractual Sovereignty** | The requirement that concrete classes in `domain` or `core` (and adapters in `infrastructure`) implement a formal interface `I<ClassName>` located in `domain/interfaces/I<ClassName>.ts`. |
| **Barrel Sovereignty** | Encapsulation rule stating that if a directory exposes an `index.ts` (or `__init__.py` / `mod.rs`) barrel, external modules must import via the barrel rather than deep-linking into internal files. |
| **Logic Density** | Ratio of conditional/branching/loop AST statements (`if`, `for`, `while`, `switch`, `catch`, ternary) to total AST nodes in a file. |
| **I/O Entropy** | Ratio of external/non-relative module imports (`fs`, `http`, npm/pip/cargo packages) to total imports in a file. |
| **Structural Entropy** | Composite 0.0–1.0 health metric combining path depth, naming alignment, orphan ratio, cross-layer coupling, cognitive complexity, and runtime cycles. |
| **Blast Radius** | Weighted count of direct (1st-degree) and transitive (2nd-degree) dependents affected if a module is modified (`Domain` weighted `2.0x`, `Core` `1.5x`). |
| **Structural Bridge** | An articulation vertex in the dependency graph (identified via Tarjan's algorithm) whose removal splits a connected component into disconnected subgraphs (`SPI-207`). |
| **TIA (Transient Integrity Advisory)** | Non-blocking forensic warnings (`SPI-101` through `SPI-112`) that inform agents of dead exports, ghost symbols, or subtle drift without halting execution. |
| **Triad Audit** | Pre-implementation strategic review evaluating a proposed change through three lenses: **The Architect**, **The Critic**, and **The SRE**. |

---

## 4. Foundational Joyzoning vs. Incidental LUMI Details

Because HEAV3NS-JOY was extracted from `/Users/bozoegg/Downloads/LUMI`, agents and architects must distinguish between **foundational Joyzoning principles** (which belong to the universal framework) and **incidental LUMI implementation details** (which were specific to LUMI's host environment as a VS Code / Cline extension).

| Aspect | Foundational Joyzoning (Universal in HEAV3NS-JOY) | Incidental LUMI Detail (Excluded / Host-Specific) |
| :--- | :--- | :--- |
| **Layer Topology** | The 5 Canonical Zones (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) and `[LAYER: UTILS]` alias. | LUMI-specific legacy folders (`src/hosts/vscode/`, `webview-ui/`, `proto/dietcode/`). |
| **Header Tags** | Multi-language `[LAYER: <ZONE>]` comments (`JSDOC`, `SLASH`, `HASH`, `DASH`, `HTML`) within the first 10KB. | None — this is 100% foundational. |
| **Geographic Alignment** | Physical path matching `[LAYER: <ZONE>]` and custom path mapping via `spider.spec.json` / `stability.config.json`. | Hardcoded checks for `extension.ts` or `ClineProvider.ts`. |
| **Dependency Matrix** | Inward dependency flow, max relative depth `<= 3`, max directory depth `<= 4`, Contractual Sovereignty (`I<Class>`). | TypeScript-only path aliases hardcoded to LUMI's `tsconfig.json`. |
| **Forensic Metrics** | Logic Density, I/O Entropy, 5-Factor Structural Entropy, Robert C. Martin Coupling ($C_a, C_e, I, A, D$), Blast Radius, Tarjan Bridges, `SPI-101..403`. | BroccoliDB SQLite wire persistence (`BroccoliDB`), gRPC protobuf streaming (`joyzoning.proto`), VS Code status bar pulse UI. |
| **Workflows & SOPs** | Triad Audit (Architect/Critic/SRE), 9 Tactical Refactoring SOPs, Topological Producer-Before-Consumer batch order, Progressive Non-Deadlocking Enforcement. | Cline/DietCode task loop hooks (`PlanModeEnforcer`, `ToolAttemptCounts`, VS Code webview state keys). |
| **Execution Caching** | JoyRide principles: separating ephemeral execution cache from durable memory, 5 cache tiers, strict invalidation on file/branch/env mutation. | Specific interception of Cline tool call IDs. |

---

## 5. Documented Nuance: `INFRASTRUCTURE` → `DOMAIN` Coupling

During source investigation of LUMI, two validators exhibited a subtle tension regarding imports from `INFRASTRUCTURE` into `DOMAIN`:
1. LUMI's `joy-zoning.ts` and `TspPolicyPlugin.ts` allow `INFRASTRUCTURE` to import `DOMAIN` so that concrete infrastructure repositories/adapters can implement `I<ClassName>` contracts and reference domain value objects.
2. LUMI's `SpiderEngine.ts` (`SPI-206: Axiomatic Layer Leakage`) flags `source === "infrastructure" && target === "domain"` when concrete domain logic leaks into infrastructure.

### Canonical Resolution in HEAV3NS-JOY
To preserve both **Contractual Sovereignty** and **Axiomatic Layer Separation**:
- **PERMITTED**: `INFRASTRUCTURE` importing **interfaces, types, and pure data contracts** from `src/domain/interfaces/` or `src/domain/types/` (or using `import type` in TypeScript).
- **FORBIDDEN (`SPI-206`)**:
  1. `DOMAIN` importing anything from `INFRASTRUCTURE` (always a hard violation).
  2. `INFRASTRUCTURE` embedding domain business rules or mutating stateful domain services directly instead of implementing a `domain/interfaces/I*` contract.

---

## 6. Extending Joyzoning Without Violating Conventions

1. **Mapping Non-Standard Directory Layouts**:
   If an existing project uses framework-mandated folders (e.g., Next.js `app/`, Go `cmd/` and `internal/pkg/`, Rust `crates/`), do not force unnatural directory renames. Instead, declare a `spider.spec.json` or `stability.config.json` at the repository root that maps those folders to the 5 canonical zones (see [`configs/spider.spec.json`](../configs/spider.spec.json)).
2. **Adding New Languages**:
   Any language can be Joyzoned by mapping its file extension to one of the 5 comment styles (`JSDOC`, `SLASH`, `HASH`, `DASH`, `HTML`) defined in [`spec/01-SYNTAX-AND-HEADERS.md`](01-SYNTAX-AND-HEADERS.md).
3. **Auditable Escape Hatches**:
   When a file legitimately crosses boundaries (such as a bootstrapper `main.ts` or an OS host bridge), annotate it explicitly with `@joyzoning-bypass <reason>` or `@sovereign-ignore <SPI-code>` in the header comment rather than disabling validation globally.

