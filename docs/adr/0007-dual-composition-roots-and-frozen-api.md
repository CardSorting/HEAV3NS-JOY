<!-- [LAYER: UI] -->
# ADR-0007: Dual Composition Roots (`src/index.mjs` Frozen 84-Export Surface & `src/portable.mjs`)

- **Status**: Accepted
- **Date**: 2026-04-22
- **Deciders**: HEAV3NS-JOY Core Architecture Team
- **Technical Story**: [`docs/api/public-api.md`](../api/public-api.md) · [`docs/PORTABLE_TRINITY.md`](../PORTABLE_TRINITY.md)

---

## Status

Accepted — Enforced by `runJoyDocsCheck` (`expectedExportCount: 84`) and `package.json` `exports`.

## Context

In Joyzoning (`spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md`), `CORE` engines must never import concrete `INFRASTRUCTURE` adapters directly (`SPI-206`). Instead, `CORE` depends on `DOMAIN` interfaces (`IWorkspaceScanner`, `ICasStorage`, `IBufferedStore`, `ISwarmLeaseService`, `ISwarmAgentEngine`, `ISwarmConfigStore`, `IProjectFiles`), and a **Composition Root** in `UI` wires concrete `INFRASTRUCTURE` adapters into `CORE` services.

When we added the Portable Broccoli Trinity (`BroccoliQueue`, `BufferedDb`, `AgentSwarm`), `AgentInstaller`, and `McpServer` to the package, we needed to expose their programmatic factories without breaking the frozen **84-symbol** public API contract of `src/index.mjs` (`heav3ns-joy`).

### Decision drivers

- **API Stability**: Existing consumers and documentation metrics rely on the exact 84-symbol export surface of `src/index.mjs`.
- **Subpath Modularity**: Consumers who only run static Joyzoning audits (`src/index.mjs`) should not load SQLite/queue/swarm/installer adapters unless requested (`heav3ns-joy/portable`).
- **Strict Joyzoning Self-Conformance**: Both composition roots must be declared in `stability.config.json` (`compositionRoots`) and pass `joy-check --theme strict` with `0` blocking violations.

### Considered options

1. **Dump All New Exports into `src/index.mjs`**: Breaks the frozen 84-export contract and couples static audit imports to database/queue infrastructure.
2. **Publish Separate npm Packages (`@heav3ns-joy/core`, `@heav3ns-joy/trinity`, `@heav3ns-joy/cli`)**: Fragmented versioning and violates single-repo zero-dependency distribution.
3. **Dual Composition Roots within One Package (`src/index.mjs` for `"."` and `src/portable.mjs` for `"./portable"`)**.

## Decision

We chose **Option 3**, defining explicit package subpath exports in [`package.json`](../../package.json):

- **`"heav3ns-joy"` (`./src/index.mjs`)**: Frozen 84-symbol Composition Root wiring `NodeWorkspaceScanner` and `NodeCasStorage` into `SpiderEngine`, `SpiderToolkit`, `RefactorHealer`, `StabilityDoctor`, `JoyRideCache`, and `BroccoliRuntime`.
- **`"heav3ns-joy/portable"` (`./src/portable.mjs`)**: Composition Root wiring `BroccoliDatabaseKernel`, `BroccoliQueue`, `BroccoliBufferedStore`, `BufferedDb`, `AgentSwarmDispatcher`, `SwarmFormationLedger`, `SwarmKnowledgeService`, `AgentInstaller`, and `McpServer`.
- **`"heav3ns-joy/broccolidb"` & `"heav3ns-joy/broccoliqueue"`**: Direct subpath exports for embedded database and queue consumers.

Both `src/index.mjs` and `src/portable.mjs` carry `/** [LAYER: UI] */` headers and are registered in `stability.config.json` under `compositionRoots`.

## Consequences

### Positive

- 100% backward compatibility on the 84-symbol `heav3ns-joy` root export surface, verified continuously by `npm run docs:check`.
- Clean separation between static analysis (`src/index.mjs`) and stateful operational primitives (`src/portable.mjs`).

### Negative / trade-offs

- Two composition roots to document in [`docs/api/public-api.md`](../api/public-api.md) and [`docs/CODE_TO_DOC_MAP.md`](../CODE_TO_DOC_MAP.md).

## Verification

```bash
npm run docs:check
npm run joy-check
node --test tests/trinity-portability.test.mjs
```

- **Code**: [`src/index.mjs`](../../src/index.mjs) · [`src/portable.mjs`](../../src/portable.mjs) · [`package.json`](../../package.json)

