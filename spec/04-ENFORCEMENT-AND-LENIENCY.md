<!-- [LAYER: DOMAIN] -->
# 04 — Progressive Enforcement, Themes, and Leniency Protocols

A critical failure mode of rigid static analysis tools in agentic software development is **the enforcement deadlock**: an agent tries to refactor a multi-file violation, gets blocked on step 1 because intermediate files are temporarily orphaned or unaligned, and enters an infinite repair spiral.

Joyzoning prevents this through **Progressive Enforcement**, **Physical Build Primacy**, and **Structured Leniency Protocols**.

---

## 1. Enforcement Themes (`strict`, `relaxed`, `safety`)

Projects configure their enforcement posture in `stability.config.json` (or via CLI flags `--theme strict|relaxed|safety`):

| Rule / Check | `strict` (Default for CI & Domain) | `relaxed` (Active Refactoring / Brownfield) | `safety` (Emergency Hotfix) |
| :--- | :--- | :--- | :--- |
| **Missing `[LAYER: ...]` Header (`SPI-208`)** | ❌ Block (Exit 1) | ⚠️ Warning (Auto-healable) | ⚠️ Warning |
| **Geographic Misalignment (`SPI-208`)** | ❌ Block (Exit 1) | ⚠️ Warning | ⚠️ Warning |
| **Cross-Layer Leak (`SPI-206`)** | ❌ Block (Exit 1) | ❌ Block on `DOMAIN`, ⚠️ Warn others | ⚠️ Warning |
| **Runtime Circular Dependency (`SPI-201`)** | ❌ Block (Exit 1) | ❌ Block (Exit 1) | ⚠️ Warning |
| **Domain I/O Impurity (`SPI-206`)** | ❌ Block (Exit 1) | ❌ Block (Exit 1) | ❌ Block (Exit 1) |
| **Import Depth `> 3` (`SPI-209`)** | ❌ Block (Exit 1) | ⚠️ Warning | ⚠️ Warning |
| **Security Anti-Patterns (`SPI-401..403`)** | ❌ Block (Exit 1) | ❌ Block (Exit 1) | ❌ Block (Exit 1) |
| **Orphan / Fat Module (`SPI-203`, `SPI-204`)** | ⚠️ Warning (Advisory) | ⚠️ Warning (Advisory) | 🔇 Silent |
| **Series 100 TIA (`SPI-101..112`)** | ℹ️ Advisory | ℹ️ Advisory | 🔇 Silent |

---

## 2. Anti-Deadlock & Progressive Strike Protocol

When an autonomous coding agent operates under Joyzoning governance:

1. **Strike 1 (Hard Architectural Pause)**:
   If an edit introduces a hard `DOMAIN` purity violation (`SPI-206`), a runtime cycle (`SPI-201`), or a geographic clash (`SPI-208`), the validator surfaces the exact violation line and remediation SOP.
2. **Wave-Front Leniency During Multi-File Refactoring**:
   When extracting an interface (`IOrderRepository`) or moving a module across zones:
   - Creating a new file in `src/domain/interfaces/` temporarily produces an **Orphaned Module (`SPI-204`)** with $C_a = 0$ until the consumer in `src/core/` is updated on the next step.
   - Therefore, **Orphan warnings (`SPI-204`) and Zombie Export advisories (`SPI-103`) NEVER hard-block file creation or intermediate edits**. This is known as **Healing Leniency**.
3. **Terminal Leaf Agility**:
   Files with zero incoming dependents ($C_a = 0$, Instability $I = 1.0$) have a Blast Radius of `0`. Edits to leaf nodes bypass heavy ripple-prophecy locks (`SPI-300`) because they cannot break downstream callers.
4. **Aesthetic Agility**:
   Edits that only modify comments, formatting, whitespace, or documentation headers do not trigger structural graph re-computation.

---

## 3. Physical Build Truth Over Heuristic Ghosts

Regex or lightweight AST dependency scanners can occasionally misreport dynamic imports, barrel re-exports, or overloaded type symbols (`SPI-101` / `SPI-102`).

- **The Golden Rule of Verification**: **Compiler and test suite truth supersedes heuristic advisories.**
- If `tsc --noEmit` (or `cargo check`, `go build`, `pytest`) passes with `0` errors, heuristic symbol warnings (`SPI-101..103`) must be treated strictly as non-blocking informational advisories, never as fatal errors.

---

## 4. Auditable Escape Hatches (`@joyzoning-bypass`)

Real-world systems occasionally require deliberate boundary crossings—for example, a top-level dependency-injection composition root (`src/main.ts`) that wires `INFRASTRUCTURE` adapters into `CORE` controllers and mounts the `UI`.

Joyzoning provides two explicit, auditable escape mechanisms:

### 4.1 Composition Root Exemption
Entrypoint bootstrapper files at the root of `src/` or `bin/` (`src/index.ts`, `src/main.ts`, `src/app.ts`, `bin/*`) act as the **Composition Root**. The Composition Root is permitted to import across `DOMAIN`, `CORE`, `INFRASTRUCTURE`, and `UI` solely to instantiate and wire dependency injection.

### 4.2 Inline Bypass Directives
Any file or line may declare an explicit architectural waiver inside a comment:

- **File-Level Waiver**:
  ```ts
  /**
   * [LAYER: INFRASTRUCTURE]
   * @joyzoning-bypass Host platform sandbox bridge requires controlled Function evaluation
   */
  ```
- **Rule-Specific Waiver**:
  ```ts
  // @sovereign-ignore SPI-401 Controlled sandbox evaluation
  ```

When a validator encounters `@joyzoning-bypass` or `@sovereign-ignore <CODE>`, it suppresses the blocking error for that file/rule and records it in the audit report as an **Audited Bypass** so human reviewers maintain complete visibility.

