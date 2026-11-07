<!-- [LAYER: CORE] -->
# 01 — The Triad Audit & Strategic Planning Workflow

Before executing non-trivial multi-file changes, architectural migrations, or edits to high-gravity modules (Blast Radius $> 60\%$), perform a **Triad Audit** (also called a `# STRATEGIC REVIEW`).

The Triad Audit evaluates every proposed change through three independent engineering personas—**The Architect**, **The Critic**, and **The SRE**—preventing structural violations before a single line of code is written.

---

## 1. When to Run a Triad Audit

Run a Triad Audit when:
1. Creating one or more new modules across zones.
2. Modifying a file with high afferent coupling ($C_a > 5$) or Blast Radius $> 60\%$ (`SPI-202` / `SPI-300`).
3. Decomposing a monolithic file (`> 800` lines) or breaking a circular dependency (`SPI-201`).
4. Introducing a new external dependency or I/O adapter.

*(Note: Trivial single-file bug fixes, leaf node edits with $C_a = 0$, or comment/formatting updates do not require a formal Triad Audit under **Leaf & Aesthetic Agility**).*

---

## 2. The Three Lenses of the Triad Audit

### Lens 1: The Architect (Zone Sovereignty & Graph Topology)
The Architect verifies that the proposed design obeys Joyzoning's structural physics:
- **Zone Ownership**: Which of the 5 zones (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) owns each file to be created or modified?
- **Geographic Alignment**: Does every target file path match its `[LAYER: <ZONE>]` header tag?
- **Dependency Direction**: Do all new imports point inward toward `DOMAIN` contracts and `PLUMBING` utilities?
  - Are we keeping `DOMAIN` 100% free of I/O and `INFRASTRUCTURE` imports?
  - Are we keeping `CORE` and `INFRASTRUCTURE` 100% free of `UI` imports?
  - Are we keeping `UI` 100% free of direct `INFRASTRUCTURE` imports?
- **Contractual Sovereignty**: If `CORE` needs a new capability from `INFRASTRUCTURE`, have we defined `I<ServiceName>` in `src/domain/interfaces/` first?
- **Cycle & Depth Check**: Will any new import create a runtime cycle (`SPI-201`) or exceed 3 levels of `../` relative traversal (`SPI-209`)?

### Lens 2: The Critic (Edge Cases, Scale, & Security)
The Critic attacks the functional and security assumptions of the plan:
- **Boundary & Empty Inputs**: How does the code behave on `null`, `undefined`, empty strings `""`, empty arrays `[]`, `0`, `NaN`, or deeply nested objects?
- **Malformed & Adversarial Data**: What happens if external files, JSON configs, or user inputs are corrupted, truncated, or contain unexpected types?
- **Scale & Complexity**: Does any algorithm introduce $O(N^2)$ traversal over large graphs or unbounded recursion on cyclic structures?
- **Security Hygiene (`SPI-401..403`)**: Are we avoiding `eval()`, unsanitized DOM writes (`innerHTML`), command injection in shell calls, and path traversal vulnerabilities?

### Lens 3: The SRE (Resilience, Observability, & Rollback)
The SRE ensures operational reliability and clean recovery:
- **Failure Modes & Error Propagation**: When an `INFRASTRUCTURE` operation fails (file missing, network timeout, permission denied), does it return a typed result or structured domain error rather than crashing silently or leaking raw stack traces to the UI?
- **Resource Lifecycle (`SPI-110`)**: Does every opened handle, timer, watcher, or subscription have a deterministic cleanup/dispose path?
- **Wave-Front Verification & Rollback**: If we change an exported signature on a shared module, have we identified all 1st- and 2nd-degree dependents so the build remains green at every commit step?

---

## 3. Operational Template for Agents

When documenting or reasoning through a Triad Audit in a plan or commit message, use this compact format:

```markdown
# STRATEGIC REVIEW (Triad Audit)

1. **The Architect (Topology & Zones)**:
   - New contract: `src/domain/interfaces/ICacheStore.ts` (`[LAYER: DOMAIN]`)
   - New adapter: `src/infrastructure/MemoryCacheStore.ts` (`[LAYER: INFRASTRUCTURE]`)
   - Consumer: `src/core/QueryController.ts` (`[LAYER: CORE]`) depends only on `ICacheStore`.
   - Zero forbidden cross-zone edges; max relative import depth is 2 (`../../domain/interfaces/ICacheStore.js`).

2. **The Critic (Edge Cases & Security)**:
   - Handles empty keys, TTL <= 0 (immediate expiry), and max-capacity eviction (LRU cap at 1,000 entries).
   - No dynamic code execution or raw shell interpolation.

3. **The SRE (Failure Modes & Verification)**:
   - Cache misses or serialization failures degrade gracefully to direct computation without throwing unhandled exceptions.
   - Producer-before-consumer implementation order keeps `tsc` and unit tests green at each step.
```

