<!-- [LAYER: UI] -->
# HEAV3NS-JOY Companion Brief

**Executive summary · v1.0.0 · workspace-verified**

_Companion to the [Technical Whitepaper](whitepaper.md). All figures below are measured directly from the repository (`package.json`, `src/index.mjs`, `src/domain/`, `src/core/`, `bin/`, `tests/`) and verified by `npm run docs:check`._

---

## One sentence

**HEAV3NS-JOY** (`heav3ns-joy` v1.0.0) is an agnostic, zero-dependency, repository-distributed software development framework combining **Joyzoning** (5-zone spatial sovereignty & polyglot graph forensics), the **Portable Operational Substrate** (**JoyRide** bounded execution caching, **Spider** agent ergonomics, **BroccoliDB** sharded CAS & governed `RuntimeStateGraph`, and the **Portable Broccoli Trinity** `BroccoliQueue`, `BufferedDb`, and `AgentSwarm`), and **Native Agent Tooling** (`joy init` 8-agent installer, `SOUL.md`, skills, plugin, and `joy mcp` server).

---

## By the numbers

| Metric | Value | Where |
|--------|-------|-------|
| Package version | **1.0.0** | [`package.json`](../../package.json) |
| External npm dependencies | **0** | [`package.json`](../../package.json) |
| Canonical architectural zones | **5** | `CANONICAL_ZONES` in [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs) |
| Frozen public API exports | **84** | [`src/index.mjs`](../../src/index.mjs) |
| Portable Trinity & Agent exports | **23** | [`src/portable.mjs`](../../src/portable.mjs) (`heav3ns-joy/portable`) |
| Native agent installer targets | **8** | `claude`, `gemini`, `antigravity`, `cursor`, `copilot`, `windsurf`, `codex`, `cline` in [`src/domain/agentTargets.mjs`](../../src/domain/agentTargets.mjs) |
| Stdio MCP server surface | **23** tools · **5** resources · **3** prompts | [`src/core/mcp/McpServer.mjs`](../../src/core/mcp/McpServer.mjs) (`joy mcp`) |
| Self-explaining catalog entries (`--explain`) | **44** | `EXPLAIN_CATALOG` + `RTG_DIAGNOSTICS` in [`src/domain/`](../../src/domain/joyRules.mjs) |
| JoyRide bounded cache tiers | **5** | `JOYRIDE_KINDS` in [`src/core/JoyRideCache.mjs`](../../src/core/JoyRideCache.mjs) |
| JoyRide fingerprint invariants | **11** | `validate()` in [`src/core/JoyRideCache.mjs`](../../src/core/JoyRideCache.mjs) |
| BroccoliDB runtime modes | **6** | `RUNTIME_MODES` in [`src/domain/broccoliRules.mjs`](../../src/domain/broccoliRules.mjs) |
| Runtime graph integrity diagnostics (`RTG-001..008`) | **8** | `verifyRuntimeGraphIntegrity()` in [`src/domain/broccoliRules.mjs`](../../src/domain/broccoliRules.mjs) |
| Tactical refactoring SOPs | **9** | [`workflows/02-TACTICAL-REFACTORING-SOPS.md`](../../workflows/02-TACTICAL-REFACTORING-SOPS.md) |
| CLI output formats (`--format`) | **10** | [`bin/joy-check.mjs`](../../bin/joy-check.mjs) |
| Max relative import parent traversal | **3** (`../../..`) | `SPI-209` in [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs) |
| Tier 1 Optimal module size cap | **800** lines | `SPI-203` in [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs) |
| Automated test suites | **36** (`196` tests across **22** test files) | [`tests/`](../../tests/joyzoning.test.mjs) |

---

## What problem it solves

Autonomous coding agents and engineering teams suffer from **structural drift** (spaghetti imports, circular dependencies, I/O leaking into domain logic) and **execution drift** (redundant context reads, stale cache hallucinations, unverified mutations). HEAV3NS-JOY solves both without locking teams into a proprietary harness:

| Need | HEAV3NS-JOY answer |
|------|--------------------|
| Keep architecture legible to humans & agents | 5 Canonical Zones (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) + `[LAYER: <ZONE>]` headers |
| Adopt incrementally in brownfield repos | `spider.spec.json` wildcard path mapping + `joy-check --heal` & `--heal-stateless` |
| Cut agent context token usage by `65%–85%` | `joy-check --skeleton <file> --keep-symbol <fn>` + $N$-hop `--scope` neighborhood checks |
| Prevent stale cache reuse & memory bloat | **JoyRide** 11-point fingerprint validation + 4-tier pressure valve + L1/L2 CAS spillover |
| Block edits against externally drifted files | **Spider** SHA-256 Merkle root & `SPI-006` Disk Parity Reality Shield |
| Prove mutations before touching disk | **BroccoliDB** `RTG-003` (`Audit` → `MutationPlan` → `Execution` → `Verification` / `Rollback`) |
| Persist & stream context without corruption | Sharded SHA-256 CAS with quarantine + RFC 1952 multi-member GZIP `BroccoliWireEngine` |
| Run durable jobs, buffered tables, & specialist swarms from any harness | **Portable Broccoli Trinity** (`BroccoliQueue`, `BufferedDb`, `AgentSwarm`) via `bin/joy-trinity.mjs` or `heav3ns-joy/portable` |
| Onboard any AI coding agent in one command | `joy init` 8-agent installer + `SOUL.md` + `joy mcp` stdio server (23 tools) + marketplace `plugin/` |

---

## Architecture (10 seconds)

```
Developer / Coding Agent (Claude, Gemini, Antigravity, Cursor, Copilot, Windsurf, Codex, Cline)
         ↕
bin/joy.mjs · bin/joy-check.mjs · bin/joy-trinity.mjs · joy mcp (23 Tools) · src/index.mjs (84 Exports) · src/portable.mjs (23 Exports)
         ↕
CORE: SpiderEngine · SpiderToolkit · JoyRideCache · BroccoliRuntime · BufferedDb · AgentSwarm · AgentInstaller · McpServer
         ↕ (via IWorkspaceScanner, ICasStorage, IBufferedStore, ISwarm*, & IProjectFiles contracts)
DOMAIN: joyRules · broccoliRules · entropyFormulas · bufferedDbOps · swarm* · agentTargets (0% I/O)
         ↕
PLUMBING: canonicalHash (FIPS 180-4 SHA-256) · codeTokenizer · sourceScanner · AsyncMutex · managedBlocks (0% I/O, 0% state)
         ↕
INFRASTRUCTURE: NodeWorkspaceScanner · NodeCasStorage · BroccoliDb · BroccoliQueue · ProcessAgentEngine · FileRootLock
```

---

## Integration checklist (adopting in a project)

- [ ] Read [`AGENTS.md`](../../AGENTS.md) and [`SOUL.md`](../../SOUL.md) (60-second operational protocol)
- [ ] Run `node /path/to/HEAV3NS-JOY/bin/joy.mjs init <project> --yes --hooks` (or `node /path/to/HEAV3NS-JOY/bin/joy-check.mjs <project> --init` for config only)
- [ ] Map brownfield folders via `spider.spec.json` if needed (see [`workflows/03-ADOPTING-IN-EXISTING-PROJECTS.md`](../../workflows/03-ADOPTING-IN-EXISTING-PROJECTS.md))
- [ ] Run `node /path/to/HEAV3NS-JOY/bin/joy-check.mjs <project> --heal --heal-stateless` to align `[LAYER]` tags and heal `PLUMBING` state
- [ ] Add [`configs/pre-commit-hook.sh`](../../configs/pre-commit-hook.sh) or [`configs/github-action.yml`](../../configs/github-action.yml) to CI

---

## Verify claims yourself

```bash
npm test
npm run joy-check
npm run docs:check
node ./bin/joy-check.mjs . --doctor
node ./bin/joy-check.mjs . --stats
```

---

## Guarantees vs non-guarantees

| Guaranteed by HEAV3NS-JOY | Not guaranteed |
|---------------------------|----------------|
| 0% I/O and 0% upward imports in `DOMAIN` and `PLUMBING` when `joy-check` passes | Business logic correctness of user-written domain formulas |
| 0 runtime circular dependencies (`SPI-201`) in `strict` mode | Compile-time type checking (delegated to native `tsc`/`cargo`/`go`/`mypy`) |
| 11-point fingerprint validation & secret rejection in `JoyRideCache` | External process side effects outside `JoyRideCache` |
| SHA-256 verification & `.broccolidb/storage/corrupt/` quarantine on CAS reads | Recovery of blobs deleted outside `.broccolidb/storage/` |
| `RTG-001..008` causal graph integrity before snapshot persistence | LLM prompt adherence without running `joy-check` or `BroccoliRuntime` |

---

## Read next

| Doc | Audience |
|-----|----------|
| [Philosophy](philosophy.md) | Values — sovereign agency & proof before mutation |
| [Whitepaper](whitepaper.md) | Engineers — full mathematical & runtime depth |
| [Architecture (current)](../architecture/current.md) | Module map & execution flow |
| [Project map](../PROJECT_MAP.md) | 1-to-1 file paths |
| [Public API](../api/public-api.md) | 84 exported functions & classes |
