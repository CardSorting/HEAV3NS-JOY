<!-- [LAYER: DOMAIN] -->
# The Sovereign Constitution of the HEAV3NS-JOY Substrate

This document defines the immutable laws of structural integrity, spatial sovereignty, and governed agentic execution for **HEAV3NS-JOY**. It serves as the final arbiter of architectural truth across any repository adopting the framework.

## I. The Law of Purity (Domain & Plumbing Sovereignty)
The **`DOMAIN`** layer is the holy of holies; the **`PLUMBING`** (`UTILS`) layer is its stateless foundation.
- **Rule**: Direct imports of concrete infrastructure, I/O modules (`fs`, `http`, `net`, `child_process`, `fetch`, DB drivers), or UI in the `DOMAIN` layer are strictly forbidden. `PLUMBING` modules must have zero upward imports (`domain`, `core`, `infrastructure`, `ui`) and zero mutable module-scope `let`/`var` state (`SPI-205`).
- **Enforcement**: Zero-tolerance blocking (`SPI-206`, `SPI-205`) on any Domain or Plumbing boundary leak.

## II. The Law of Contractual Identity (Dependency Inversion)
Modules shall depend upon abstractions, not concretions.
- **Rule**: When `CORE` orchestrators depend on `INFRASTRUCTURE` capabilities (such as filesystem scanning or Content-Addressable Storage), they must bind exclusively to formal `I<ClassName>` contracts in `src/domain/interfaces/` (`IWorkspaceScanner`, `ICasStorage`).
- **Enforcement**: Cross-zone concrete coupling is flagged (`SPI-107`, `SPI-206`) and diagnosed by `StabilityDoctor` (`joy-check --doctor`).

## III. The Law of Human Intent (Auditable Escape Hatches)
The Human Architect is the ultimate authority over edge-case system boundaries.
- **Rule**: Legitimate architectural exceptions (such as host platform bridges or generated wire code) may be documented using explicit inline directives (`@joyzoning-bypass <reason>`, `@sovereign-ignore <rule-id>`, or `@dietcode-passthrough`).
- **Protocol**: These directives neutralize hard locks while recording an explicit, auditable exception in the Spider forensic report (`bypasses[]`) — shifting enforcement from an opaque block to a transparent, reviewable decision.

## IV. The Law of Structural & Cryptographic Truth (0% False Positives & Reality Parity)
The substrate must mirror physical reality with mathematical fidelity.
- **Rule**: Single-pass lexical tokenization (`scanCodeTokens`), dynamic alias resolution (`tsconfig.json`, `package.json` `#imports`, `go.mod`, `Cargo.toml`), Merkle disk parity (`SPI-006`), and SHA-256 CAS verification (`STORAGE_CORRUPT`) ensure that only verifiably broken dependencies or drifted files trigger alarms.
- **Enforcement**: Ghost symbols (`SPI-102`), ghost co-mutations (`SPI-108`), and corrupted CAS blobs are interdicted before they can pollute an agent's reasoning context.

## V. The Law of Proof-Before-Mutation (`RTG-003` & Metabolic Balance)
High-velocity autonomous edits must be governed by causal proof and bounded memory.
- **Rule**: No `MutationPlan` may be created without a preceding `Audit` node, and no `Execution` may occur without a `MutationPlan` (`RTG-003`). Failed executions must record a linked `Rollback` (`RTG-006`), and session completion requires passing post-mutation `Verification` (`RTG-007`, `RTG-008`).
- **Enforcement**: `BroccoliRuntime` and `JoyRideCache` enforce runtime mode budgets, 11-point cache invalidation, and 4-tier memory pressure valves so agent sessions remain deterministic, reversible, and boring to operate.

