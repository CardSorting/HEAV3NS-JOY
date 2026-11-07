<!-- [LAYER: DOMAIN] -->
# 02 — Dependency, Composition, and Decomposition Rules

## 1. The Sovereign Dependency Matrix

Dependencies in a Joyzoned architecture flow inward toward stable abstractions (`DOMAIN` interfaces and `PLUMBING` primitives). Upward or outward back-edges create structural entropy and are forbidden.

### 1.1 Zone-to-Zone Import Matrix

| Source Zone (Importer) ↓ \ Target Zone (Imported) → | `PLUMBING` | `DOMAIN` (Interfaces / Types) | `DOMAIN` (Concrete Entities) | `CORE` | `INFRASTRUCTURE` | `UI` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`PLUMBING`** | ✅ Allowed | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **`DOMAIN`** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Forbidden* | ❌ Forbidden | ❌ Forbidden |
| **`CORE`** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed | ⚠️ Interfaces Only* | ❌ Forbidden |
| **`INFRASTRUCTURE`** | ✅ Allowed | ✅ Allowed | ❌ Forbidden (`SPI-206`) | ❌ Forbidden* | ✅ Allowed | ❌ Forbidden |
| **`UI`** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Forbidden | ✅ Allowed |

### 1.2 Detailed Zone Coupling Rules

1. **`PLUMBING` Isolation**:
   - `PLUMBING` is the zero-context foundation. A `PLUMBING` module importing from `DOMAIN`, `CORE`, `INFRASTRUCTURE`, or `UI` triggers a **Plumbing Contamination Violation**.
2. **`DOMAIN` Purity**:
   - `DOMAIN` must never import from `INFRASTRUCTURE` (`Domain -> Infrastructure Leak`) or `UI` (`Domain -> UI Leak`).
   - `DOMAIN` must never import concrete orchestrators from `CORE` (`Domain -> Core Leak`).
   - `DOMAIN` must never import raw I/O modules (`fs`, `node:fs`, `fs/promises`, `http`, `https`, `net`, `child_process`, `dgram`, `tls`, `fetch`, `axios`, `pg`, `mysql`, `sqlite3`, `redis`, `mongodb`).
3. **`CORE` Orchestration Boundary**:
   - `CORE` coordinates `DOMAIN` and `INFRASTRUCTURE`, and may be invoked by `UI`.
   - `CORE` must **never** import `UI` (`Core -> UI Leak`). When `CORE` needs to notify the user interface, it returns a result object, emits an event, or invokes an injected `IUserPresenter` interface defined in `DOMAIN`.
4. **`INFRASTRUCTURE` Adapter Boundary**:
   - `INFRASTRUCTURE` must **never** import `UI` (`Infrastructure -> UI Leak`).
   - `INFRASTRUCTURE` may import `DOMAIN` interfaces (`src/domain/interfaces/I*`) and value types to implement contracts, but must not pull in concrete `DOMAIN` business services or `CORE` controllers (`SPI-206: Axiomatic Layer Leakage`).
5. **`UI` Presentation Boundary**:
   - `UI` must **never** directly import `INFRASTRUCTURE` (`UI -> Infrastructure Leak`). The UI must route through `CORE` controllers or `DOMAIN` interfaces.

---

## 2. Import Depth & Directory Depth Discipline

Deeply nested directory hierarchies and long chains of relative parent traversal (`../../../../`) make modules brittle to move and difficult for agents to reason about.

### 2.1 Maximum Relative Parent Traversal (`<= 3`)
- **Rule**: No import statement may contain more than **3** parent directory traversals (`../`).
  - ✅ Valid: `./helper.js`, `../domain/Order.js`, `../../plumbing/format.js`, `../../../domain/interfaces/IStore.js`
  - ❌ Violation (`IMPORT_DEPTH_EXCEEDED`): `../../../../plumbing/logger.js` (depth = 4)
- **Remediation**:
  1. Flatten the directory structure so modules live at depth `<= 4`.
  2. Configure and use canonical zone path aliases:
     - `@domain/*` -> `src/domain/*`
     - `@core/*` -> `src/core/*`
     - `@infrastructure/*` -> `src/infrastructure/*`
     - `@plumbing/*` -> `src/plumbing/*`
     - `@ui/*` -> `src/ui/*`

### 2.2 Maximum Directory Nesting Depth (`<= 4`)
- **Rule**: Relative to the project root (or `src/` root), directory nesting should not exceed **4 levels** (`maxPathDepth: 4` in `stability.config.json`).
- **Entropy Impact**: Files nested deeper than 4 directories contribute to the **Depth Score** penalty in the 5-Factor Structural Entropy calculation.

---

## 3. Contractual Sovereignty (`I<ClassName>`)

To prevent rigid coupling between `CORE` orchestrators and `INFRASTRUCTURE` implementations, Joyzoning enforces **Contractual Sovereignty** (Dependency Inversion):

1. **Interface Location**: Formal contracts live in `src/domain/interfaces/I<ClassName>.ts` (tagged `/** [LAYER: DOMAIN] */`).
2. **Naming Convention**: Every primary service or repository class `<ClassName>` implements `I<ClassName>` (e.g., `OrderRepository` in `src/infrastructure/OrderRepository.ts` implements `IOrderRepository` from `src/domain/interfaces/IOrderRepository.ts`).
3. **Consumer Typing**: `CORE` controllers accept `I<ClassName>` via constructor or function parameter injection rather than instantiating concrete `INFRASTRUCTURE` classes directly.

```ts
// src/domain/interfaces/IOrderRepository.ts
/** [LAYER: DOMAIN] */
import type { Order } from "../Order.js";

export interface IOrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
```

---

## 4. Barrel Sovereignty & Encapsulation

When a feature or zone submodule grows into a directory with multiple internal files, it may expose a public API through a barrel file (`index.ts`, `index.js`, `__init__.py`, `mod.rs`):

- **Rule**: If a directory `<dir>/` contains an `index.*` barrel file, external modules outside `<dir>/` must import from `<dir>/index.*` (or `<dir>`) rather than reaching directly into `<dir>/internalHelper.*`.
- **Exception**: Modules *inside* `<dir>/` must import their siblings directly (`./internalHelper.js`) rather than importing through their own `./index.js` barrel, because self-barrel imports create artificial circular dependencies (`SPI-201`).

---

## 5. Acyclic Graph Invariant (`SPI-201`)

- **Hard Invariant**: The runtime module dependency graph must be a **Directed Acyclic Graph (DAG)**.
- **Runtime Cycles vs. Type-Only Cycles**:
  - A runtime cycle (`A.ts` imports value from `B.ts`, and `B.ts` imports value from `A.ts`) is a hard `SPI-201: Circular Dependency` violation.
  - A compile-time type-only reference (`import type { Foo } from ...` in TypeScript, or `if TYPE_CHECKING:` in Python) is erased before runtime execution and does not trigger a hard runtime cycle block, though extracting shared types into `src/domain/interfaces/` is still preferred.
- **How to Break Any Cycle (`DECOUPLE` SOP)**:
  1. **Extract Shared Contract to `DOMAIN`**: If `A` (`core`) and `B` (`infrastructure`) import each other, extract the shared interface `IB` into `src/domain/interfaces/IB.ts` so both `A` and `B` depend inward on `DOMAIN`.
  2. **Extract Pure Helper to `PLUMBING`**: If `A` and `B` share a formatting or calculation helper, move that helper to `src/plumbing/`.

---

## 6. Module Size & Decomposition Thresholds

Joyzoning categorizes file size into **Three Tiers** to prevent monolithic "God files":

| Tier | Line Count | Designation | Enforcement Action |
| :--- | :--- | :--- | :--- |
| **Tier 1** | `1 – 800` lines (`<= 1000` max) | **Small & Sharp** | Optimal zone. Full AST & graph verification. Files `> 800` lines emit a `FAT_MODULE` advisory (`🐋 Fat Module`). |
| **Tier 2** | `1001 – 1500` lines | **Warning Zone** | Emits `SPI-203` structural load warning. Agents touching a Tier 2 file should extract cohesive helper islands before adding new features. |
| **Tier 3** | `> 1500` lines (`> 2500` hard cap) | **Monolith / Fission Required** | Triggers the **`DECOMPOSE` SOP** (Module Fission): identify cohesive clusters of private helpers or secondary classes and extract them into `plumbing` or dedicated sub-modules. |

