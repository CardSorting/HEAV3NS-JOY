<!-- [LAYER: UI] -->
# AGENTS.md — Operational Acquisition Protocol for Coding Agents

This file is the direct operational entrypoint for any autonomous coding agent, pair-programming assistant, or automated workflow encountering **HEAV3NS-JOY**.

You do **not** need a custom harness, MCP tool, or plugin to use Joyzoning. Follow the protocol below to apply Joyzoning to any codebase.

---

## Phase 1: Instant Mental Model (Read First)

Every source file in a Joyzoned project belongs to exactly **one of five architectural zones**:

1. **`DOMAIN` (`src/domain/`)**: Pure business rules, domain entities, value objects, and formal interfaces (`src/domain/interfaces/I*.ts`).
   - **Hard Invariant**: **0% I/O**. Never import `fs`, `path`, `http`, `https`, `net`, `child_process`, `fetch`, `axios`, `sql`, `redis`, or any external SDK in `domain`. Never import from `infrastructure` or `ui`.
2. **`CORE` (`src/core/`)**: Application use-case orchestration, state machines, policy engines, and controllers.
   - **Hard Invariant**: Coordinates `domain` logic and `infrastructure` ports. Never import `ui`. Avoid raw low-level I/O; delegate I/O to `infrastructure` via interfaces.
3. **`INFRASTRUCTURE` (`src/infrastructure/`)**: Concrete I/O adapters, filesystem readers, HTTP/gRPC clients, databases, external SDK wrappers, and OS bridges.
   - **Hard Invariant**: Implements interfaces defined in `domain/interfaces/`. Never import `ui`. Do not embed pure business logic here (if a module has high logic density > 0.30 and zero I/O, extract the logic to `domain`).
4. **`UI` (`src/ui/`)**: User interfaces, CLI formatters/presenters, webviews, components, and view models.
   - **Hard Invariant**: Renders state and captures user intent, routing actions through `core` controllers. Never import directly from `infrastructure`.
5. **`PLUMBING` (`src/plumbing/` or `src/utils/`)**: Stateless, context-free helper functions, data structure utilities, and pure string/math/AST primitives.
   - **Hard Invariant**: Leaf dependency layer. Must be completely stateless (no mutable module-level `let`/`var` state) and must **never** import from `domain`, `core`, `infrastructure`, or `ui`. Note: `[LAYER: UTILS]` is an accepted alias that normalizes to `PLUMBING`.

---

## Phase 2: The Five Mandatory Coding Rules

Whenever you create or modify a file in a Joyzoned project, enforce these 5 rules before concluding your turn:

### Rule 1: Top-of-File `[LAYER: <ZONE>]` Header Tag
Every source file must include its zone header within the first 10,000 characters (immediately at line 1, or immediately after a `#!` shebang or `---` YAML frontmatter block):

- **TypeScript / JavaScript / Java (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.java`)**:
  ```ts
  /** [LAYER: DOMAIN] */
  ```
- **Go / Rust / C / C++ / Protobuf (`.go`, `.rs`, `.c`, `.cpp`, `.h`, `.proto`)**:
  ```go
  // [LAYER: CORE]
  ```
- **Python / Shell / Ruby / YAML (`.py`, `.sh`, `.rb`, `.yaml`, `.yml`)**:
  ```python
  # [LAYER: INFRASTRUCTURE]
  ```
- **SQL / Lua / Haskell (`.sql`, `.lua`, `.hs`)**:
  ```sql
  -- [LAYER: PLUMBING]
  ```
- **Markdown / HTML / Vue / Svelte (`.md`, `.html`, `.vue`, `.svelte`)**:
  ```markdown
  <!-- [LAYER: UI] -->
  ```

### Rule 2: Principle of Geographic Alignment (PGA)
A file's physical path must match its header tag:
- Files in `src/domain/**` MUST have `[LAYER: DOMAIN]`.
- Files in `src/core/**` MUST have `[LAYER: CORE]`.
- Files in `src/infrastructure/**` (or mapped adapter directories) MUST have `[LAYER: INFRASTRUCTURE]`.
- Files in `src/plumbing/**` or `src/utils/**` MUST have `[LAYER: PLUMBING]` (or `[LAYER: UTILS]`).
- Files in `src/ui/**` MUST have `[LAYER: UI]`.

### Rule 3: Import Depth & Direction Discipline
- **Max Relative Parent Traversal**: Never write `../../../../` (4 or more `../` segments). Maximum allowed relative depth is **3** (`../../..`). Prefer path aliases (`@domain/`, `@core/`, `@infrastructure/`, `@plumbing/`, `@ui/`) or flatter directory trees (target max directory depth `<= 4`).
- **No Circular Dependencies (`SPI-201`)**: Runtime import cycles (`A -> B -> A`) are strictly forbidden. Break cycles by extracting pure contracts into `domain/interfaces/` or pure helpers into `plumbing/`. (TypeScript `import type` is permitted across interfaces because it erases at compile time).
- **Barrel Sovereignty**: If a module subfolder exposes an `index.ts` barrel, external consumers should import the barrel rather than reaching into private internal files of that subfolder.

### Rule 4: Contractual Sovereignty (`I<ClassName>`)
When `core` depends on `infrastructure` capabilities (e.g., `FileRepository`, `PaymentGateway`), define an interface `IFileRepository` or `IPaymentGateway` in `src/domain/interfaces/` and type the `core` consumer against the interface.

### Rule 5: Module Size & Simplicity Caps
- **Tier 1 (`0–800` lines)**: Optimal ("Small & Sharp"). Above 800 lines triggers a `FAT MODULE` warning.
- **Tier 2 (`1001–1500` lines)**: Warning zone; decompose when touching the file.
- **Tier 3 (`>1500` lines)**: Monolith threshold; apply the `DECOMPOSE` / `EXTRACT` SOP to split cohesive helper islands into `plumbing` or dedicated submodules.
- **Single-Responsibility Domain Classes**: Keep `domain` files focused (ideally 1 primary class per file; avoid >3 classes in a single domain file).

---

## Phase 3: Execution Workflow for Tasks

### Step 1: Pre-Implementation Triad Audit
Before executing non-trivial changes, perform a brief 3-perspective check (see [`workflows/01-TRIAD-AUDIT-PLANNING.md`](workflows/01-TRIAD-AUDIT-PLANNING.md)):
1. **The Architect**: Which zone owns each new/modified file? Will any import cross a forbidden boundary or create a cycle?
2. **The Critic**: What are the boundary/empty/malformed inputs and security risks (`eval`, unsanitized HTML, unbounded recursion)?
3. **The SRE**: How are errors surfaced, and can this change be rolled back cleanly?

### Step 2: Producer-Before-Consumer Implementation Order
When creating or refactoring multiple files across zones, implement and verify **producers (callees) before consumers (callers)**:
1. `PLUMBING` (stateless utilities)
2. `DOMAIN` interfaces (`src/domain/interfaces/`) and entities (`src/domain/`)
3. `INFRASTRUCTURE` adapters implementing those interfaces (`src/infrastructure/`)
4. `CORE` orchestrators consuming domain & interfaces (`src/core/`)
5. `UI` presenters / CLI / views invoking core (`src/ui/`)

### Step 3: Self-Verification & Conformance Check
Run the project's test suite and run the reference validator (or check manually against the 8-point checklist below):
```bash
# Standard strict conformance check
node /path/to/HEAV3NS-JOY/bin/joy-check.mjs <project-root>

# Preview or apply automatic [LAYER: <ZONE>] header alignment and statelessness healing
node /path/to/HEAV3NS-JOY/bin/joy-check.mjs <project-root> --heal --heal-stateless

# Run architectural health checkup (hotspots, Gini hubbiness, interface synthesis)
node /path/to/HEAV3NS-JOY/bin/joy-check.mjs <project-root> --doctor

# Explain any SPI-xxx violation code or zone invariant
node /path/to/HEAV3NS-JOY/bin/joy-check.mjs --explain SPI-206
```

---

## Phase 4: Agent Self-Check Rubric (Zero-Tool Fallback)

Even if you are running in an environment where you cannot execute `bin/joy-check.mjs`, you can guarantee 100% Joyzoning conformance by verifying these 8 invariants on every touched file:

- [ ] **1. Header Present**: Does the file start with a valid `[LAYER: <ZONE>]` comment within the first 10KB?
- [ ] **2. Geographic Match**: Does `<ZONE>` match the folder name (`domain`, `core`, `infrastructure`, `plumbing`/`utils`, `ui`)?
- [ ] **3. Depth <= 3**: Do all relative imports have at most three `../` segments?
- [ ] **4. Domain Purity**: If `<ZONE>` is `DOMAIN`, are there zero I/O imports (`fs`, `http`, `net`, `child_process`, `fetch`, DB drivers) and zero imports from `infrastructure` or `ui`?
- [ ] **5. Plumbing Isolation**: If `<ZONE>` is `PLUMBING`, are there zero imports from `domain`, `core`, `infrastructure`, or `ui`, and zero mutable top-level `let`/`var` bindings?
- [ ] **6. UI Decoupling**: If `<ZONE>` is `UI`, are there zero direct imports from `infrastructure`? If `<ZONE>` is `CORE`, `DOMAIN`, or `INFRASTRUCTURE`, are there zero imports from `ui`?
- [ ] **7. Cycle-Free**: Did I verify that no newly added import creates a runtime loop `A -> ... -> A`?
- [ ] **8. Physical Build Green**: Do the project's native compiler/typechecker and unit tests pass?

