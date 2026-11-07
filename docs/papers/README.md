<!-- [LAYER: UI] -->
# HEAV3NS-JOY Papers

Three documents describe the **HEAV3NS-JOY** framework — both its **Spatial Architecture** (`Joyzoning` + `SpiderEngine`) and its **Operational Substrate Trinity** (`JoyRide`, `SpiderToolkit`, and `BroccoliDB`). Read them in this order:

| Order | Doc | Audience | Time |
|-------|-----|----------|------|
| 1 | [Companion brief](companion-brief.md) | Executives, PMs, evaluators, new contributors | 5 min |
| 2 | [Philosophy](philosophy.md) | Architects, tech leads — *why* sovereign agency & proof before mutation | 15 min |
| 3 | [Whitepaper](whitepaper.md) | Engineers — *how* the 5-zone math, scanner, and runtime are built | 35 min |

## One-line summary

**HEAV3NS-JOY** is an agnostic, zero-dependency, repository-distributed software development framework that binds codebases to **5 Canonical Architectural Zones** (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`), governs agentic execution via **JoyRide** (bounded 11-point cache), **Spider** (Merkle reality parity & AST skeletonization), **BroccoliDB** (sharded SHA-256 CAS & causal `RuntimeStateGraph`), and the **Portable Broccoli Trinity** (`BroccoliQueue`, `BufferedDb`, `AgentSwarm`), and installs into any coding agent via `joy init` and `joy mcp`.

## Three surfaces in this framework

```
┌───────────────────────────────────────────────────────────────┐
│  Surface 1: Spatial Architecture (Joyzoning & Static Forensics│
│  5 Zones · Principle of Geographic Alignment · SpiderEngine   │
│  spec/00..04 · workflows/01..03 · src/domain/joyRules.mjs     │
└──────────────────────────────┬────────────────────────────────┘
                               │ IWorkspaceScanner · ICasStorage · IBufferedStore
                               │ Spider Audit Reports & Hashes
┌──────────────────────────────▼────────────────────────────────┐
│  Surface 2: Operational Substrate & Portable Broccoli Trinity │
│  11-Point Cache · Merkle SPI-006 · RTG-001..008 · Sharded CAS │
│  BroccoliQueue · BufferedDb · AgentSwarm (SwarmFormationLedger│
│  spec/05 · workflows/04..05 · docs/PORTABLE_TRINITY.md        │
└──────────────────────────────┬────────────────────────────────┘
                               │ bin/joy.mjs · bin/joy-trinity.mjs · src/portable.mjs
┌──────────────────────────────▼────────────────────────────────┐
│  Surface 3: Native Agent Tooling (Installer · MCP · SOUL.md)  │
│  joy init (8 agents) · joy mcp (23 tools) · Skills · plugin/  │
└───────────────────────────────────────────────────────────────┘
```

## Verify claims

```bash
npm run verify
```

## Related

| Doc | Scope |
|-----|-------|
| [Architecture (current)](../architecture/current.md) | Module map & execution pipeline |
| [Portable Broccoli Trinity](../PORTABLE_TRINITY.md) | `BroccoliQueue`, `BufferedDb`, and `AgentSwarm` shell & Node API |
| [Project map](../PROJECT_MAP.md) | 1-to-1 directory paths |
| [Public API](../api/public-api.md) | Frozen 84-symbol export surface + `heav3ns-joy/portable` |
| [CLI reference](../api/cli.md) | `bin/joy.mjs`, `bin/joy-check.mjs`, `bin/joy-trinity.mjs`, `bin/docs-check.mjs`, & MCP server |
