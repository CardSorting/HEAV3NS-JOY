<!-- [LAYER: UI] -->
# Agent Stack

**HEAV3NS-JOY** ships **three complementary, zero-dependency surfaces** in a single self-hosting repository. This page is the canonical map between them.

## Three surfaces

| Surface | Subsystem | Code & Specs | Primary question |
|---------|-----------|--------------|------------------|
| **1. Spatial Architecture** | **Joyzoning + Spider Engine** | [`spec/00..04`](../spec/00-CANONICAL-MODEL.md), [`src/domain/joyRules.mjs`](../src/domain/joyRules.mjs), [`src/core/SpiderEngine.mjs`](../src/core/SpiderEngine.mjs), [`src/core/RefactorHealer.mjs`](../src/core/RefactorHealer.mjs) | Where does every file belong, which imports are legal, and is the static dependency graph sovereign? |
| **2. Operational Substrate** | **JoyRide + Spider Toolkit + BroccoliDB + Portable Broccoli Trinity (`BroccoliQueue`, `BufferedDb`, `AgentSwarm`)** | [`spec/05`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md), [`docs/PORTABLE_TRINITY.md`](PORTABLE_TRINITY.md), [`src/core/`](../src/core/BroccoliRuntime.mjs), [`src/infrastructure/`](../src/infrastructure/NodeCasStorage.mjs), [`src/portable.mjs`](../src/portable.mjs) | How do agents cache execution safely, prove disk parity, govern mutations, run durable jobs, buffer writes, and coordinate specialist swarms? |
| **3. Native Agent Tooling** | **`joy` CLI + 8-Agent Installer + Stdio MCP Server + Skills + `SOUL.md` + Plugin** | [`bin/joy.mjs`](../bin/joy.mjs), [`bin/joy-trinity.mjs`](../bin/joy-trinity.mjs), [`src/core/AgentInstaller.mjs`](../src/core/AgentInstaller.mjs), [`src/core/mcp/McpServer.mjs`](../src/core/mcp/McpServer.mjs), [`plugin/`](../plugin/README.md), [`SOUL.md`](../SOUL.md) | How does any coding agent (Claude, Gemini, Antigravity, Cursor, Copilot, Windsurf, Codex, Cline) acquire and operate the framework in one command? |

```
┌──────────────────────────────────────────────────────────────────────┐
│  Surface 1: Spatial Architecture (Joyzoning & Static Forensics)      │
│  ─────────────────────────────────────────────────────────────────── │
│  5 Canonical Zones: DOMAIN · CORE · INFRASTRUCTURE · PLUMBING · UI   │
│  SpiderEngine · StabilityDoctor · RefactorHealer (--heal)            │
│  Docs: spec/00..04 · workflows/01..03 · docs/CONSTITUTION.md         │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ Spider Audit Reports & File Hashes
                                   │ IWorkspaceScanner · ICasStorage · IBufferedStore
┌──────────────────────────────────▼───────────────────────────────────┐
│  Surface 2: Operational Substrate & Portable Broccoli Trinity        │
│  ─────────────────────────────────────────────────────────────────── │
│  JoyRideCache (11-point fingerprint + L1/L2 CAS spillover)           │
│  SpiderToolkit (Merkle SPI-006 · AST Skeleton · N-hop Neighborhood)  │
│  BroccoliRuntime (RTG-001..008 · Sharded CAS · RFC 1952 WireEngine)  │
│  BroccoliQueue · BufferedDb · AgentSwarm (SwarmFormationLedger)      │
│  Docs: spec/05 · workflows/04..05 · docs/PORTABLE_TRINITY.md         │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ bin/joy.mjs · bin/joy-trinity.mjs · src/portable.mjs
┌──────────────────────────────────▼───────────────────────────────────┐
│  Surface 3: Native Agent Tooling (Installer · MCP · Skills · SOUL)   │
│  ─────────────────────────────────────────────────────────────────── │
│  joy init/add/status/update/remove/doctor (8 Agent Targets)          │
│  joy mcp (23 tools · 5 joy:// resources · 3 prompts over stdio)      │
│  Skills (joyzoning · joy-trinity · joy-swarm) · SOUL.md · plugin/    │
└──────────────────────────────────────────────────────────────────────┘
```

**Do not conflate the layers.** Spatial zoning keeps the repository comprehensible; the operational substrate keeps multi-turn agent execution fast, provable, and reversible; native agent tooling delivers both into any harness without locking you in.

---

## End-to-end execution flow (verified)

| Step | Component | Path |
|------|-----------|------|
| 1 | CLI or programmatic entry | [`bin/joy-check.mjs`](../bin/joy-check.mjs) / [`src/index.mjs`](../src/index.mjs) |
| 2 | Workspace & config discovery | [`src/infrastructure/NodeWorkspaceScanner.mjs`](../src/infrastructure/NodeWorkspaceScanner.mjs) |
| 3 | Single-pass polyglot lexical scan | [`src/plumbing/codeTokenizer.mjs`](../src/plumbing/codeTokenizer.mjs) & [`src/plumbing/sourceScanner.mjs`](../src/plumbing/sourceScanner.mjs) |
| 4 | Zone, coupling, & entropy evaluation | [`src/domain/joyRules.mjs`](../src/domain/joyRules.mjs) & [`src/domain/entropyFormulas.mjs`](../src/domain/entropyFormulas.mjs) |
| 5 | Graph construction & forensics | [`src/core/SpiderEngine.mjs`](../src/core/SpiderEngine.mjs) |
| 6 | Neighborhood scoping, Merkle parity, & playbooks | [`src/core/SpiderToolkit.mjs`](../src/core/SpiderToolkit.mjs) |
| 7 | Bounded execution caching & L2 CAS spillover | [`src/core/JoyRideCache.mjs`](../src/core/JoyRideCache.mjs) |
| 8 | Governed session, `MutationPlan`, & `RTG-001..008` proof | [`src/core/BroccoliRuntime.mjs`](../src/core/BroccoliRuntime.mjs) & [`src/core/RuntimeStateGraph.mjs`](../src/core/RuntimeStateGraph.mjs) |
| 9 | Sharded SHA-256 CAS & RFC 1952 GZIP Wire persistence | [`src/infrastructure/NodeCasStorage.mjs`](../src/infrastructure/NodeCasStorage.mjs) |
| 10 | Durable jobs, buffered tables, & step-wise / external-process specialist swarm | [`src/infrastructure/broccoliqueue/`](../src/infrastructure/broccoliqueue/index.mjs), [`src/core/BufferedDb.mjs`](../src/core/BufferedDb.mjs), [`src/core/AgentSwarmDispatcher.mjs`](../src/core/AgentSwarmDispatcher.mjs), & [`src/core/SwarmFormationLedger.mjs`](../src/core/SwarmFormationLedger.mjs) |
| 11 | Native agent installation & stdio MCP server (`joy init`, `joy mcp`) | [`src/core/AgentInstaller.mjs`](../src/core/AgentInstaller.mjs) & [`src/core/mcp/McpServer.mjs`](../src/core/mcp/McpServer.mjs) |
| 12 | Terminal / SARIF / LSP / TAP / JUnit / Compact presentation | [`src/ui/CliFormatter.mjs`](../src/ui/CliFormatter.mjs), [`src/ui/AgentFormatters.mjs`](../src/ui/AgentFormatters.mjs), & [`src/ui/JoyWizardPresenter.mjs`](../src/ui/JoyWizardPresenter.mjs) |

---

## Trust & safety boundaries

| Boundary | Enforced by |
|----------|-------------|
| **0% I/O in `DOMAIN` & `PLUMBING`** | `FORBIDDEN_DOMAIN_IO_SPECIFIERS` & `SPI-206` in [`src/domain/joyRules.mjs`](../src/domain/joyRules.mjs) |
| **0% mutable module state in `PLUMBING`** | `SPI-205` detection + `RefactorHealer.healStatelessness` (`--heal-stateless`) |
| **No unproven runtime mutations** | `RTG-003` (`BroccoliRuntime.planRepairs` requires a recorded `Audit`; `execute` requires a `MutationPlan`) |
| **No stale cache or secret leakage** | `JoyRideCache` 11-point fingerprint validation + `SECRET_KEY_REGEX` / `SECRET_VALUE_REGEX` guard |
| **No silent disk corruption or path traversal** | `NodeCasStorage` SHA-256 read verification + `.broccolidb/storage/corrupt/` quarantine + strict hash/path guards |

---

## Documentation map by role

| Audience | Start here |
|----------|------------|
| Coding agent | [`AGENTS.md`](../AGENTS.md) |
| Executive / lead | [Companion brief](papers/companion-brief.md) |
| Architect | [Philosophy](papers/philosophy.md) · [Canonical Model](../spec/00-CANONICAL-MODEL.md) |
| Engineer | [Whitepaper](papers/whitepaper.md) · [Project map](PROJECT_MAP.md) |
| API integrator | [Programmatic & CLI API](api/README.md) |

---

## Verify the stack

```bash
npm test
npm run joy-check
npm run docs:check
```

