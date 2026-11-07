<!-- [LAYER: UI] -->
# Agent Stack

**HEAV3NS-JOY** ships **two complementary, zero-dependency layers** in a single self-hosting repository. This page is the canonical map between them.

## Two layers

| Layer | Subsystem | Code & Specs | Primary question |
|-------|-----------|--------------|------------------|
| **Spatial Architecture** | **Joyzoning + Spider Engine** | [`spec/00..04`](../spec/00-CANONICAL-MODEL.md), [`src/domain/joyRules.mjs`](../src/domain/joyRules.mjs), [`src/core/SpiderEngine.mjs`](../src/core/SpiderEngine.mjs), [`src/core/RefactorHealer.mjs`](../src/core/RefactorHealer.mjs) | Where does every file belong, which imports are legal, and is the static dependency graph sovereign? |
| **Operational Substrate** | **JoyRide + Spider Toolkit + BroccoliDB** | [`spec/05`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md), [`src/core/JoyRideCache.mjs`](../src/core/JoyRideCache.mjs), [`src/core/SpiderToolkit.mjs`](../src/core/SpiderToolkit.mjs), [`src/core/BroccoliRuntime.mjs`](../src/core/BroccoliRuntime.mjs), [`src/infrastructure/NodeCasStorage.mjs`](../src/infrastructure/NodeCasStorage.mjs) | How do agents cache execution safely, prove disk parity, govern mutations, and replay causal history? |

```
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 1: Spatial Architecture (Joyzoning & Static Forensics)        │
│  ─────────────────────────────────────────────────────────────────── │
│  5 Canonical Zones: DOMAIN · CORE · INFRASTRUCTURE · PLUMBING · UI   │
│  SpiderEngine · StabilityDoctor · RefactorHealer (--heal)            │
│  Docs: spec/00..04 · workflows/01..03 · docs/CONSTITUTION.md         │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ Spider Audit Reports & File Hashes
                                   │ IWorkspaceScanner · ICasStorage
┌──────────────────────────────────▼───────────────────────────────────┐
│  Layer 2: Operational Substrate Trinity (JoyRide · Spider · Broccoli)│
│  ─────────────────────────────────────────────────────────────────── │
│  JoyRideCache (11-point fingerprint + L1/L2 CAS spillover)           │
│  SpiderToolkit (Merkle SPI-006 · AST Skeleton · N-hop Neighborhood)  │
│  BroccoliRuntime (RTG-001..008 · Sharded CAS · RFC 1952 WireEngine)  │
│  Docs: spec/05 · workflows/04..05 · docs/api/*                       │
└──────────────────────────────────────────────────────────────────────┘
```

**Do not conflate the two layers.** Spatial zoning keeps the repository comprehensible; the operational substrate keeps multi-turn agent execution fast, provable, and reversible.

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
| 10 | Terminal / SARIF / LSP / TAP / JUnit / Compact presentation | [`src/ui/CliFormatter.mjs`](../src/ui/CliFormatter.mjs) & [`src/ui/AgentFormatters.mjs`](../src/ui/AgentFormatters.mjs) |

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

