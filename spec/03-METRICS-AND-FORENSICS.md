<!-- [LAYER: DOMAIN] -->
# 03 — Metrics, Graph Forensics, and the SPI Diagnostic Taxonomy

This specification defines the mathematical formulas, graph algorithms, and diagnostic codes (`SPI-101` through `SPI-403`) used by Joyzoning's **Spider Forensic Engine** and **Stability Policy**.

An agent or tool implementing Joyzoning can reconstruct the full forensic analyzer directly from these equations.

---

## 1. Node-Level AST & Code Metrics

For every source file $v \in V$ in the project graph $G = (V, E)$:

### 1.1 Logic Density ($D_L$)
Measures the concentration of conditional and branching reasoning inside a file:
$$D_L(v) = \frac{N_{\text{logic}}(v)}{\max(1, N_{\text{total}}(v))}$$
- $N_{\text{logic}}(v)$: Count of branching/control-flow constructs (`if`, `else if`, `for`, `while`, `do`, `switch`, `case`, `catch`, ternary `? :`, and logical short-circuits `&&`, `||`).
- $N_{\text{total}}(v)$: Total number of non-empty logical statements or AST nodes.
- **Canonical Layer Targets**:
  - `DOMAIN`: `optimalLogicDensity = 0.15` (pure business rules belong here)
  - `CORE`: `optimalLogicDensity = 0.05`
  - `INFRASTRUCTURE`: `optimalLogicDensity = 0.05` (if $D_L > 0.30$ and $E_{IO} = 0$, flag as `MISPLACED_DOMAIN_LOGIC`)
  - `PLUMBING`: `optimalLogicDensity = 0.00`
  - `UI`: `optimalLogicDensity = 0.00`

### 1.2 I/O Entropy ($E_{IO}$)
Measures a module's coupling to external I/O packages and runtime side effects:
$$E_{IO}(v) = \frac{I_{\text{external}}(v)}{\max(1, I_{\text{total}}(v))}$$
- $I_{\text{external}}(v)$: Number of imports referencing external I/O modules (`fs`, `http`, `net`, `child_process`, database drivers, SDK packages) or non-relative package specifiers.
- $I_{\text{total}}(v)$: Total import statements in $v$.
- **Canonical Layer Caps (`maxIOEntropy`)**:
  - `DOMAIN`: `0.00` (**Strict 0% I/O**)
  - `CORE`: `0.00` (Delegates I/O to `INFRASTRUCTURE`)
  - `PLUMBING`: `0.00`
  - `INFRASTRUCTURE`: `1.00`
  - `UI`: `1.00`

### 1.3 Cognitive Complexity ($C_{\text{cog}}$) & Maintainability Index ($MI$)
- **Cognitive Complexity ($C_{\text{cog}}$)**: Each branching structure (`if`, `for`, `while`, `catch`, `switch`) adds $1 + d_{\text{nest}}$, where $d_{\text{nest}}$ is the current control-flow nesting depth.
- **Maintainability Index ($MI \in [0, 100]$)**:
  $$MI = \max\left(0, \min\left(100, 171 - 5.2 \ln(\max(1, V_H)) - 0.23 C_{\text{cog}} - 16.2 \ln(\max(1, \text{LOC}))\right)\right)$$
  where $V_H$ is estimated Halstead volume ($\text{LOC} \times 4.5$) and $\text{LOC}$ is line count.

---

## 2. Robert C. Martin Package Coupling Metrics

For each node $v \in V$:

1. **Afferent Coupling ($C_a$)**: Number of modules that import $v$ (incoming edges / dependents). High $C_a$ means $v$ is heavily relied upon.
2. **Efferent Coupling ($C_e$)**: Number of local modules that $v$ imports (outgoing edges / dependencies).
3. **Instability ($I \in [0, 1]$)**:
   $$I(v) = \frac{C_e(v)}{\max(1, C_a(v) + C_e(v))}$$
   - $I = 0$: Maximally stable (depended upon, depends on nothing). Ideal for `DOMAIN` interfaces and `PLUMBING`.
   - $I = 1$: Maximally unstable (depends on others, nothing depends on it). Ideal for `UI` entrypoints.
4. **Abstractness ($A \in [0, 1]$)**:
   $$A(v) = \frac{S_{\text{abstract}}(v)}{\max(1, S_{\text{total}}(v))}$$
   where $S_{\text{abstract}}$ is the count of exported `interface`, `type`, or `abstract class` symbols, and $S_{\text{total}}$ is total exported symbols.
5. **Distance from the Main Sequence ($D \in [0, 1]$)**:
   $$D(v) = |A(v) + I(v) - 1|$$
   - Modules with $D > 0.7$, $A = 0$, and $I = 0$ lie in the **Zone of Pain** (concrete, rigid modules that many files depend on).
   - Modules with $D > 0.7$, $A = 1$, and $I = 1$ lie in the **Zone of Uselessness** (unused abstractions).

---

## 3. Graph Topology Algorithms

### 3.1 Weighted Blast Radius ($BR$)
The Blast Radius of node $v$ measures the systemic impact of mutating $v$ across 1st-degree ($\text{Dep}_1(v)$) and 2nd-degree ($\text{Dep}_2(v)$) dependents, weighted by architectural criticality:
$$w(u) = \begin{cases} 2.0 & \text{if } \text{zone}(u) = \text{domain} \\ 1.5 & \text{if } \text{zone}(u) = \text{core} \\ 1.0 & \text{otherwise} \end{cases}$$
$$BR_{\text{norm}}(v) = \min\left(100, \text{round}\left(\frac{\sum_{u \in \text{Dep}_1(v) \cup \text{Dep}_2(v)} w(u)}{\max(1, |V|)} \times 100\right)\right)$$
- If $BR_{\text{norm}}(v) > 60\%$, emit **`SPI-202: Systemic Risk (High Blast Radius)`**.
- If $BR_{\text{norm}}(v) > 80\%$, emit **`SPI-300: Ripple Prophecy Alert`**.

### 3.2 Structural Bridges (Tarjan's Articulation Points — `SPI-207`)
Treating the module dependency graph as an undirected graph $G_u$, a node $v$ is an **Articulation Point (Structural Bridge)** if removing $v$ increases the number of connected components in $G_u$.
- Discovered in $O(|V| + |E|)$ time via Tarjan's DFS (`disc[u]`, `low[u]`).
- Any articulation node with degree $\ge 2$ is flagged with **`SPI-207: Structural Bridge`** because a failure or breaking change in $v$ severs communication between entire subsystems.

### 3.3 Reachability & Orphan Detection (`SPI-204`)
Using Breadth-First Search (BFS) starting from project entrypoints (`index.*`, `main.*`, `cli.*`, `bin/*`, `app.*`, exported barrels, and tests):
- Any internal module $v$ with $C_a(v) = 0$ that is not an entrypoint or test file is flagged with **`SPI-204: Orphaned Module`**.

---

## 4. The 5-Factor Structural Entropy Formula ($E_S$)

The project-wide **Structural Entropy Score** $E_S \in [0.0, 1.0]$ (where `0.00` is perfect architectural crystal and `1.00` is total chaos) combines five weighted pillars plus a cycle penalty:

$$E_S = \min\left(1.0, \; 0.10 \cdot S_{\text{depth}} + 0.15 \cdot S_{\text{naming}} + 0.15 \cdot S_{\text{orphan}} + 0.40 \cdot S_{\text{coupling}} + 0.20 \cdot S_{\text{complexity}} + P_{\text{cycles}}\right)$$

Where:
1. **Depth Score ($S_{\text{depth}}$, weight `10%`)**: Fraction of files whose directory depth exceeds `maxPathDepth` (`4`).
2. **Naming & Alignment Score ($S_{\text{naming}}$, weight `15%`)**: Fraction of files missing a `[LAYER: ...]` header tag or suffering Geographic Misalignment.
3. **Orphan Score ($S_{\text{orphan}}$, weight `15%`)**: Fraction of non-entrypoint files that are unreachable (`SPI-204`).
4. **Coupling Score ($S_{\text{coupling}}$, weight `40%`)**: Ratio of cross-zone dependency edges (especially forbidden back-edges) to total dependency edges.
5. **Complexity Score ($S_{\text{complexity}}$, weight `20%`)**: Normalized average cognitive complexity relative to layer `maxComplexity` budgets.
6. **Cycle Penalty ($P_{\text{cycles}}$)**: $+\min(0.30, \; 0.05 \times N_{\text{runtime\_cycles}})$. Note: Type-only (`import type`) cycles are excluded from runtime cycle penalties.

**Stability Index ($SI \in [0, 100\%]$)**:
$$SI = \text{round}((1.0 - E_S) \times 100)$$
- `SI >= 85%` ($E_S \le 0.15$): **Sovereign / Healthy**
- `70% <= SI < 85%` ($0.15 < E_S \le 0.30$): **Drifting (Advisory Alert — `integrityAlertThreshold: 0.70`)**
- `SI < 70%` ($E_S > 0.30$): **Critical Entropy (Refactor Recommended)**

---

## 5. Complete SPI Diagnostic Code Catalog

### 5.1 Series 100: Transient Integrity Advisories (TIA — Non-Blocking)
Series 100 codes provide high-signal situational awareness without blocking builds or commits:

| Code | Name | Condition & Remediation |
| :--- | :--- | :--- |
| **`SPI-101`** | **Ghost File** | An import references a local file path that does not exist on disk. Fix the broken path or create the missing module. |
| **`SPI-102`** | **Ghost Symbol** | A named import `{ Foo }` references a symbol not exported by the target module. Verify with compiler (`tsc`) and align exports. |
| **`SPI-103`** | **Zombie Export** | An exported symbol is never imported by any other file in the repository (and is not part of the public entrypoint barrel). Consider pruning (`PRUNE` SOP). |
| **`SPI-104`** | **Type Cycle Advisory** | A compile-time type-only circular reference (`import type`) exists between modules. Non-blocking, but can be cleaned up by moving shared types to `domain/interfaces/`. |
| **`SPI-105`** | **Substrate Vibration** | Modifying or removing exports on a high-gravity node ($C_a > 5$). Verify all downstream callers (`Wave-Front Healing`). |
| **`SPI-106`** | **Symbol Resonance** | Multiple modules across different zones export identically named concrete classes/functions, risking ambiguous imports. |
| **`SPI-107`** | **Implicit Interface** | A concrete class in `domain` or `core` is consumed across zones without a corresponding `I<ClassName>` contract in `domain/interfaces/`. |
| **`SPI-108`** | **Ghost Coupling** | Two modules across different zones frequently co-mutate or share hardcoded magic constants without an explicit contract. |
| **`SPI-109`** | **Silent Clone** | Duplicate helper functions detected across multiple files. Extract into `src/plumbing/` (`EXTRACT` SOP). |
| **`SPI-110`** | **Asymmetric Contract** | Resource lifecycle mismatch: a class defines `init()`/`connect()`/`subscribe()` without a corresponding `dispose()`/`close()`/`unsubscribe()`. |
| **`SPI-111`** | **Domain Drift** | An `INFRASTRUCTURE` module has high pure logic density ($D_L > 0.30$) and zero I/O ($E_{IO} = 0$). Extract business rules to `DOMAIN`. |
| **`SPI-112`** | **Unused Import** | An imported symbol is never referenced in the body of the file. Remove the dead import. |

### 5.2 Series 200: Structural & Architectural Violations (Blocking in `strict` Mode)

| Code | Name | Condition & Remediation |
| :--- | :--- | :--- |
| **`SPI-201`** | **Circular Dependency** | A runtime import cycle $A \to \dots \to A$ exists. Break the cycle by extracting interfaces to `domain/interfaces/` or pure helpers to `plumbing/`. |
| **`SPI-202`** | **Systemic Risk** | Node Blast Radius exceeds $60\%$ of the graph. Decompose the hub module or invert dependencies. |
| **`SPI-203`** | **Structural Load (Monolith)** | File exceeds Tier 2/Tier 3 line count thresholds (`> 1000` / `> 1500` lines) or cognitive complexity budget. Apply `DECOMPOSE` SOP. |
| **`SPI-204`** | **Orphaned Module** | Internal module has $C_a = 0$ and is unreachable from any entrypoint. Wire it into its caller or delete it (`PRUNE` SOP). |
| **`SPI-205`** | **Metabolic Imbalance** | Module exhibits both high instability ($I > 0.8$) and high afferent coupling ($C_a > 5$), or stateful `let`/`var` bindings in `PLUMBING` (`HEAL_STATELESSNESS` SOP). |
| **`SPI-206`** | **Axiomatic Layer Leakage** | Forbidden cross-zone import (e.g., `DOMAIN -> INFRASTRUCTURE`, `CORE -> UI`, `UI -> INFRASTRUCTURE`, `PLUMBING -> CORE`, or `DOMAIN` importing raw I/O). |
| **`SPI-207`** | **Structural Bridge** | Node is a Tarjan articulation point connecting otherwise separate subgraphs. Harden interfaces and unit test coverage around this bridge. |
| **`SPI-208`** | **Geographic Misalignment** | File's `[LAYER: <ZONE>]` header tag is missing or contradicts its physical directory path. Run `joy-check --heal` or move the file. |
| **`SPI-209`** | **Import Depth Exceeded** | Relative import traverses more than 3 parent levels (`../../../../`). Flatten directory structure or use `@<zone>/` path aliases. |

### 5.3 Series 300: Predictive & Evolutionary Alerts

| Code | Name | Condition & Remediation |
| :--- | :--- | :--- |
| **`SPI-300`** | **Ripple Prophecy** | Proposed modification touches a node with Blast Radius $> 80\%$. Perform a full **Triad Audit** before executing edits. |
| **`SPI-301`** | **Vocabulary Drift** | Naming convention mismatch (e.g., UI component naming inside `DOMAIN` or database table naming inside `UI`). |
| **`SPI-302`** | **Refactoring Fatigue** | A single file has been repeatedly patched without reducing its complexity or entropy score. Stop patching and perform structural fission (`DECOMPOSE`). |

### 5.4 Series 400: Security & Substrate Hygiene Violations

| Code | Name | Condition & Remediation |
| :--- | :--- | :--- |
| **`SPI-401`** | **Dynamic Code Execution** | Use of `eval()`, `new Function()`, or `vm.runInContext()` outside an explicitly sandboxed & bypassed host adapter. |
| **`SPI-402`** | **Unsanitized DOM Injection** | Direct assignment to `.innerHTML`, `.outerHTML`, or `document.write()` without sanitization (`HARDEN` SOP). |
| **`SPI-403`** | **Unverified React HTML** | Usage of `dangerouslySetInnerHTML` without an adjacent sanitizer call or explicit `@joyzoning-bypass` security sign-off. |

