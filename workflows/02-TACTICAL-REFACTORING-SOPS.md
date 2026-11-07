<!-- [LAYER: CORE] -->
# 02 — Tactical Refactoring SOPs & Topological Sequencing

When `joy-check` or code review identifies structural violations in a codebase, do not guess how to remediate them. Apply the **Nine Canonical Tactical Standard Operating Procedures (SOPs)** in **Topological Producer-Before-Consumer Order**.

---

## 1. The Nine Tactical Refactoring SOPs

### SOP 1: `ALIGN_TAGS` (Remedies `SPI-208: Missing or Misaligned Header`)
- **Trigger**: File lacks a `[LAYER: <ZONE>]` header within the first 10KB, or its header tag contradicts its physical directory path.
- **Procedure**:
  1. Determine whether the file's *location* or its *header tag* represents its true responsibility.
  2. If the file is in the right directory (e.g., `src/domain/Order.ts` contains pure domain logic), stamp or update the top-of-file comment to `/** [LAYER: DOMAIN] */` (preserving any `#!` shebang on Line 1 or YAML `---` frontmatter).
  3. Automated command: `node bin/joy-check.mjs <project-root> --heal`.

### SOP 2: `MOVE` (Remedies `SPI-208` Geographic Clash or `SPI-111` Misplaced Logic)
- **Trigger**: A file resides in the wrong physical directory for its actual role (e.g., a database adapter living in `src/domain/SqlOrderStore.ts`).
- **Procedure**:
  1. Move the file to its canonical zone directory (`src/infrastructure/SqlOrderStore.ts`).
  2. Update its header tag to `/** [LAYER: INFRASTRUCTURE] */`.
  3. Relink all relative imports inside the moved file and across all 1st-degree dependents (**Wave-Front Healing**).

### SOP 3: `DECOUPLE` (Remedies `SPI-201` Circular Dependency & `SPI-206` Layer Leak)
- **Trigger**: Two modules import each other at runtime (`A <-> B`), or a lower layer (`DOMAIN`, `CORE`, `UI`) illegally imports a concrete class from an incompatible zone.
- **Procedure**:
  1. Extract the shared contract (`export interface I<Name>`) and pure data types into `src/domain/interfaces/I<Name>.ts` (`[LAYER: DOMAIN]`).
  2. Update the concrete provider to `implements I<Name>`.
  3. Update the consumer to import only `I<Name>` from `src/domain/interfaces/I<Name>.js` and receive the concrete instance via dependency injection.

### SOP 4: `EXTRACT` (Remedies `SPI-109` Silent Clone & `SPI-111` Domain Drift)
- **Trigger**:
  - Case A: Pure, context-free helper functions are duplicated or embedded inside `CORE`/`INFRASTRUCTURE`/`UI`.
  - Case B: Pure business calculation rules ($D_L > 0.30, E_{IO} = 0$) are embedded inside an `INFRASTRUCTURE` adapter.
- **Procedure**:
  - For Case A: Extract the stateless functions into `src/plumbing/<helper>.ts` (`[LAYER: PLUMBING]`) and import them where needed.
  - For Case B: Extract the pure business rules into `src/domain/<Policy>.ts` (`[LAYER: DOMAIN]`) and invoke them from `CORE` or `INFRASTRUCTURE`.

### SOP 5: `DECOMPOSE` / Module Fission (Remedies `SPI-203` Fat Module / Monolith)
- **Trigger**: A file exceeds Tier 1 (`> 800` lines) or Tier 2/3 (`> 1000` / `> 1500` lines), or a `DOMAIN` file defines more than 3 classes.
- **Procedure**:
  1. **Identify Cohesive Islands**: Scan the monolith for private helper functions or secondary classes that only use a subset of imports.
  2. **Extract Stateless Islands First**: Move pure helper islands to `src/plumbing/`.
  3. **Split Secondary Classes**: Move secondary classes into dedicated sibling files within the same zone, exposing a barrel (`index.ts`) if external callers need a unified entrypoint.

### SOP 6: `HEAL_STATELESSNESS` (Remedies `SPI-205` Mutable Plumbing State)
- **Trigger**: A module in `src/plumbing/` (or `src/utils/`) declares mutable module-scope `let` or `var` variables.
- **Procedure**:
  1. Convert constant tables/configs to `const` (and `Object.freeze()` where appropriate).
  2. If the state is genuinely mutable runtime state (e.g., an active connection pool or cache), move the stateful class out of `PLUMBING` into `CORE` or `INFRASTRUCTURE`, leaving only pure functions in `PLUMBING`.

### SOP 7: `PRUNE` (Remedies `SPI-103` Zombie Export, `SPI-112` Unused Import, `SPI-204` Orphan)
- **Trigger**: Dead imports, unused exports, or orphaned internal modules cluttering the dependency graph.
- **Procedure**:
  1. Verify that the symbol or file is not dynamically imported or part of the public package API.
  2. Remove unused imports (`SPI-112`) and unreferenced export keywords (`SPI-103`).
  3. Either wire an orphaned module (`SPI-204`) into its intended caller or delete it cleanly.

### SOP 8: `HARDEN` (Remedies `SPI-110` Asymmetric Contract & `SPI-401..403` Security Risks)
- **Trigger**: Unsanitized HTML injection (`innerHTML`, `dangerouslySetInnerHTML`), dynamic `eval()`, or lifecycle methods (`init`/`connect`) missing cleanup (`dispose`/`close`).
- **Procedure**:
  1. Replace `eval()` with safe deterministic parsers (`JSON.parse` or explicit AST evaluators).
  2. Sanitize or escape untrusted strings before rendering.
  3. Add explicit `dispose()`/`close()` methods to stateful `INFRASTRUCTURE` adapters and declare them on the `I<Adapter>` interface.

### SOP 9: `FIX_STRUCTURAL_VIOLATION` (Remedies `SPI-209` Deep Relative Imports & Barrel Bypass)
- **Trigger**: Relative imports exceed 3 parent traversals (`../../../../`) or external callers bypass a module's `index.ts` barrel.
- **Procedure**:
  1. Replace deep `../../../../` chains with configured zone aliases (`@domain/`, `@core/`, `@infrastructure/`, `@plumbing/`, `@ui/`) or flatten the directory nesting to `<= 4`.
  2. Route external imports through the target directory's `index.ts` barrel.

---

## 2. Topological Producer-Before-Consumer Batch Order

When refactoring multiple files across a repository, **never refactor in arbitrary alphabetical order**. Refactoring a caller before its callee is ready breaks the build mid-flight.

Always group and execute changes in **Topological Producer-Before-Consumer Order**:

```
Step 1: PLUMBING       (Leaf utilities — zero project dependencies)
           ↓
Step 2: DOMAIN         (Interfaces I* first, then pure Domain entities/policies)
           ↓
Step 3: INFRASTRUCTURE (Adapters implementing the new Domain interfaces)
           ↓
Step 4: CORE           (Controllers/orchestrators wiring Domain & Infrastructure interfaces)
           ↓
Step 5: UI / CLI       (Views and entrypoints invoking Core controllers)
```

### Wave-Front Healing Checklist
After completing each layer wave:
1. Update 1st-degree and 2nd-degree dependents of any moved or renamed symbol.
2. Run the native typechecker/compiler (`tsc --noEmit`, `go vet`, `cargo check`, `pytest`).
3. Run `node bin/joy-check.mjs <project-root>` to confirm entropy decreased and zero new violations were introduced.

