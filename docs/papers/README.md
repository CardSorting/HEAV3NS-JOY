<!-- [LAYER: UI] -->
# HEAV3NS-JOY Papers

Three documents describe the **HEAV3NS-JOY** framework — both its **Spatial Architecture** (`Joyzoning` + `SpiderEngine`) and its **Operational Substrate Trinity** (`JoyRide`, `SpiderToolkit`, and `BroccoliDB`). Read them in this order:

| Order | Doc | Audience | Time |
|-------|-----|----------|------|
| 1 | [Companion brief](companion-brief.md) | Executives, PMs, evaluators, new contributors | 5 min |
| 2 | [Philosophy](philosophy.md) | Architects, tech leads — *why* sovereign agency & proof before mutation | 15 min |
| 3 | [Whitepaper](whitepaper.md) | Engineers — *how* the 5-zone math, scanner, and runtime are built | 35 min |

## One-line summary

**HEAV3NS-JOY** is an agnostic, zero-dependency, repository-distributed software development framework that binds codebases to **5 Canonical Architectural Zones** (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) and governs agentic execution via **JoyRide** (bounded 11-point cache), **Spider** (Merkle reality parity & AST skeletonization), and **BroccoliDB** (sharded SHA-256 CAS & causal `RuntimeStateGraph`).

## Two layers in this framework

```
┌───────────────────────────────────────────────────────────────┐
│  Layer 1: Spatial Architecture (Joyzoning & Static Forensics) │
│  5 Zones · Principle of Geographic Alignment · SpiderEngine   │
│  spec/00..04 · workflows/01..03 · src/domain/joyRules.mjs     │
└──────────────────────────────┬────────────────────────────────┘
                               │ IWorkspaceScanner · ICasStorage
                               │ Spider Audit Reports & Hashes
┌──────────────────────────────▼────────────────────────────────┐
│  Layer 2: Operational Substrate (JoyRide · Spider · Broccoli) │
│  11-Point Cache · Merkle SPI-006 · RTG-001..008 · Sharded CAS │
│  spec/05 · workflows/04..05 · src/core/* · src/infrastructure/│
└───────────────────────────────────────────────────────────────┘
```

## Verify claims

```bash
npm test
npm run joy-check
npm run docs:check
```

## Related

| Doc | Scope |
|-----|-------|
| [Architecture (current)](../architecture/current.md) | Module map & execution pipeline |
| [Project map](../PROJECT_MAP.md) | 1-to-1 directory paths |
| [Public API](../api/public-api.md) | Frozen 84-symbol export surface |
| [CLI reference](../api/cli.md) | `bin/joy-check.mjs` & `bin/docs-check.mjs` flags |
