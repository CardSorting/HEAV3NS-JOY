<!-- [LAYER: UI] -->
# Security & Best Practices

**HEAV3NS-JOY** inspects, heals, caches, and records provenance across your workspace files. Security is implemented as **deterministic layers in code** (`src/domain/`, `src/core/`, `src/infrastructure/`), not aspirational policy documents.

---

## Security model (implemented in code)

| Layer | What it does | Where |
|-------|--------------|-------|
| **Supply-Chain Zero** | `0` external npm dependencies; runs strictly on Node.js built-ins (`node:crypto`, `node:fs`, `node:path`) | [`package.json`](../package.json) |
| **SAST Security Rules (`SPI-401..403`)** | Blocks dynamic code execution (`eval`, `new Function`), unsanitized HTML (`innerHTML`, `dangerouslySetInnerHTML`), and hardcoded secrets | [`src/domain/joyRules.mjs`](../src/domain/joyRules.mjs) |
| **Domain 0% I/O Boundary (`SPI-206`)** | Forbids filesystem, network, process, or database imports inside `src/domain/**` | [`src/domain/joyRules.mjs`](../src/domain/joyRules.mjs) |
| **JoyRide Secret Guard (`JR-SEC-001`)** | Rejects caching content containing PEM private keys, AWS keys (`AKIA...`), GitHub PATs (`ghp_...`), Slack tokens (`xox...`), or bearer tokens | [`src/core/JoyRideCache.mjs`](../src/core/JoyRideCache.mjs) |
| **CAS Path-Traversal & SHA-256 Guard** | Enforces `/^[a-f0-9]{64}$/i` digest validation, atomic `.tmp` + `renameSync` writes, and corrupt shard quarantine (`<hash>.corrupt.<ts>`) | [`src/infrastructure/NodeCasStorage.mjs`](../src/infrastructure/NodeCasStorage.mjs) |
| **BroccoliDB Mode & Approval Gates (`BRC-205..206`)** | Blocks mutations in `readonly`, `recovery`, and `forensic` modes; gates risky actions via `ApprovalPolicy` (`always`, `never`, `on-failure`, `unless-trusted`) | [`src/domain/broccoliRules.mjs`](../src/domain/broccoliRules.mjs), [`src/core/BroccoliRuntime.mjs`](../src/core/BroccoliRuntime.mjs) |
| **Cross-Process Root Lock & Atomic State (`FileRootLock`)** | Serializes concurrent `joy-trinity` / MCP state directory access via `O_CREAT \| O_EXCL` `.joy-lock` with dead-PID reclamation; validates table/formation identifiers against path traversal | [`src/infrastructure/FileRootLock.mjs`](../src/infrastructure/FileRootLock.mjs), [`src/core/SwarmFormationLedger.mjs`](../src/core/SwarmFormationLedger.mjs) |
| **Shell-Free Subprocess Execution (`ProcessAgentEngine`)** | Executes external specialist commands via `child_process.spawn(argv[0], argv.slice(1), { shell: false })` with prompt on `stdin` so untrusted prompt text can never be interpreted as shell syntax | [`src/infrastructure/ProcessAgentEngine.mjs`](../src/infrastructure/ProcessAgentEngine.mjs) |
| **Non-Destructive Managed Blocks (`AgentInstaller`)** | Wraps installed markdown sections in `<!-- joy:begin:... -->` markers, merges JSON keys, records SHA-256 digests in `.joy/install.json`, and backs up user-modified files to `.joy/backup/` | [`src/core/AgentInstaller.mjs`](../src/core/AgentInstaller.mjs), [`src/plumbing/managedBlocks.mjs`](../src/plumbing/managedBlocks.mjs) |
| **Workspace Ignore Boundary (`.joyignore`)** | Excludes sensitive files and third-party build trees from scanning and context assembly | [`src/infrastructure/NodeWorkspaceScanner.mjs`](../src/infrastructure/NodeWorkspaceScanner.mjs) |

---

## Human-in-the-loop & approval contracts

When using `BroccoliRuntime` to orchestrate agent actions (`src/core/BroccoliRuntime.mjs`), mutation authority is governed by explicit **execution modes** and **approval policies**:

- **Read-Only Exploration (`readonly` / `forensic` modes)**: Calling `appendNode`, `checkpoint`, or `applyRepair` throws `BRC-205` immediately. Use these modes when auditing untrusted state graphs or replaying historical runs (`replay({ mode: "verify_only" })`).
- **Approval Gating (`ApprovalPolicy`)**: Any action marked `requiresApproval: true` (or any action under `approvalPolicy: "always"`) is blocked with `BRC-206` unless `approved: true` is explicitly supplied by the host or human operator.

See [Philosophy — Approval & Provenance are the Contract](papers/philosophy.md) and [Architectural Constitution](CONSTITUTION.md).

---

## Data flow & local-first guarantees

| Data | Stays local? | Notes |
|------|--------------|-------|
| Source files | **Yes (100%)** | Scanned locally via `NodeWorkspaceScanner`; zero network calls exist anywhere in the codebase |
| JoyRide context cache | **Yes (100%)** | In-memory L1 LRU cache with optional L2 spillover to local `NodeCasStorage` |
| BroccoliDB causal DAG | **Yes (100%)** | Stored locally in `.broccolidb/storage/` as content-addressed SHA-256 JSON shards |
| Baseline ratchets & config | **Yes (100%)** | Local `stability.config.json`, `spider.spec.json`, and `.joyignore` |
| Telemetry / Analytics | **None** | Zero telemetry, zero external HTTP/gRPC clients, zero cloud phone-home paths |

---

## Best practices

### 1. Scope workspace scanning with `.joyignore`

Exclude secret files, local credentials, and build artifacts from agent scanning:

```gitignore
.env
.env.*
**/.ssh/
**/credentials.json
node_modules/
dist/
coverage/
*.pem
```

Initialize starter `.joyignore` and `stability.config.json` files automatically with:

```bash
node ./bin/joy-check.mjs . --init
```

### 2. Enforce `--theme strict` in CI pipelines

In continuous integration, run `joy-check` with `--theme strict` so any warning or security violation (`SPI-401..403`) fails the build immediately:

```bash
node ./bin/joy-check.mjs . --theme strict
```

### 3. Keep `JoyRideCache` secret scrubbing active

Never pass `{ allowSecrets: true }` to `JoyRideCache.put()` when indexing untrusted or user-supplied files. By default, `JoyRideCache` inspects every payload against `SECRET_PATTERNS` and throws `JR-SEC-001` before a secret can enter L1 memory or L2 CAS disk shards.

### 4. Use `verify_only` or `counterfactual` replay before executing repairs

Before applying automated structural repairs on critical branches, preview mutations using `BroccoliRuntime.replay({ mode: "verify_only" })` or preview header healing without `--heal`:

```bash
node ./bin/joy-check.mjs . --doctor
```

### 5. Verify CAS integrity after disk crashes

`NodeCasStorage.get(hash)` automatically recomputes the canonical SHA-256 digest of every shard read from disk. If a power loss or external edit corrupts a shard, `NodeCasStorage` quarantines the file to `<hash>.corrupt.<timestamp>` and returns `null` rather than poisoning the runtime graph.

---

## Related documentation

- [Repository Security Policy (`SECURITY.md`)](../SECURITY.md)
- [Error & Violation Catalog (`SPI-401..403`, `BRC-205..206`, `JR-SEC-001`)](api/errors.md)
- [Technical Whitepaper](papers/whitepaper.md)
- [Current Architecture](architecture/current.md)
