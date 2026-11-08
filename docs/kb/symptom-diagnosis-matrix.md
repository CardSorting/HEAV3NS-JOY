<!-- [LAYER: UI] -->
# Complete Symptom, Diagnostic Code, & Error Resolution Matrix

<p align="center">
  <a href="README.md">Knowledge Base Hub</a> ·
  <a href="../README.md">Docs Hub</a> ·
  <a href="../playbooks/README.md">Playbooks</a> ·
  <a href="../api/errors.md">Error Catalog</a> ·
  <a href="../OPERATIONS.md">Operations Runbook</a>
</p>

Use this matrix for instant **Symptom → Root Cause → One-Line Fix Command → Playbook / ADR** resolution across every surface of **HEAV3NS-JOY**.

---

## 1. CLI Exit Codes (`joy`, `joy-check`, `joy-trinity`, `docs-check`)

| Exit Code | Meaning | Immediate Action / Command | Playbook / Doc |
| :---: | :--- | :--- | :--- |
| `0` | Audit passed (`0` blocking violations) or command succeeded | Safe to proceed / merge | [Operations Runbook](../OPERATIONS.md) |
| `1` | Blocking architectural violation (`joy-check`), runtime error (`joy-trinity`), or drift (`joy doctor` / `docs-check`) | Read structured output; run `--explain <CODE>` or `doctor` | [PB-01](../playbooks/architectural-violation-remediation.md) · [PB-02](../playbooks/trinity-lock-and-wal-recovery.md) |
| `2` | Usage error (bad CLI flag/argument) OR `joy hook post-edit` blocked an edit | Fix CLI command (follow `hint: did you mean ...`), or fix hook's reported `SPI-*` error | [PB-04](../playbooks/agent-drift-and-mcp-troubleshooting.md) |
| `130` / `143` | Process interrupted by `SIGINT` (`Ctrl-C`) / `SIGTERM` after flushing accepted writes and releasing `.joy-lock` | Safe to re-run; `.joy-lock` was cleanly released | [PM-002](../postmortems/PM-002-multi-process-wal-contention-and-orphaned-root-locks.md) |

---

## 2. Strike-1 Blocking Architectural Violations (`SPI-*`)

| Code | Symptom | Root Cause | One-Line Diagnostic / Fix Command | Playbook & ADR |
| :--- | :--- | :--- | :--- | :--- |
| **`SPI-201`** | `Runtime Circular Dependency` | Runtime import cycle `A -> ... -> A` | `node bin/joy-check.mjs --explain SPI-201` (extract contract to `domain/interfaces/` or helper to `plumbing/`) | [PB-01](../playbooks/architectural-violation-remediation.md) · [ADR-0001](../adr/0001-five-canonical-zones-and-geographic-alignment.md) |
| **`SPI-205`** | `Plumbing Statelessness Violation` | Top-level mutable `let` or `var` in `[LAYER: PLUMBING]` | `node bin/joy-check.mjs . --heal-stateless` | [PB-01](../playbooks/architectural-violation-remediation.md) · [ADR-0001](../adr/0001-five-canonical-zones-and-geographic-alignment.md) |
| **`SPI-206`** | `Axiomatic Layer Leakage` / `Domain I/O Impurity` | Forbidden cross-zone import (e.g., `DOMAIN` importing `node:fs` or `UI` importing `INFRASTRUCTURE`) | `node bin/joy-check.mjs --explain SPI-206` (invert via `src/domain/interfaces/I*.mjs`) | [PB-01](../playbooks/architectural-violation-remediation.md) · [ADR-0001](../adr/0001-five-canonical-zones-and-geographic-alignment.md) |
| **`SPI-208`** | `Missing [LAYER] Header` / `Geographic Misalignment` | File lacks `[LAYER: <ZONE>]` in first 10KB or header disagrees with folder path | `node bin/joy-check.mjs . --heal` | [PB-01](../playbooks/architectural-violation-remediation.md) · [ADR-0001](../adr/0001-five-canonical-zones-and-geographic-alignment.md) |
| **`SPI-209`** | `Import Depth Exceeded` | Relative import uses `>= 4` parent segments (`../../../../`) | `node bin/joy-check.mjs --explain SPI-209` (use `@domain/*` alias or flatten tree) | [PB-01](../playbooks/architectural-violation-remediation.md) · [ADR-0001](../adr/0001-five-canonical-zones-and-geographic-alignment.md) |
| **`SPI-401`** | `Dynamic Code Execution` | Use of `eval()` or `new Function()` | Replace with declarative dispatch table or `JSON.parse` | [PB-01](../playbooks/architectural-violation-remediation.md) · [ADR-0003](../adr/0003-strike-one-vs-advisory-enforcement-model.md) |
| **`SPI-402`** | `Unsanitized DOM Sink` | Direct assignment to `innerHTML` / `outerHTML` | Use `textContent` or sanitize HTML explicitly | [PB-01](../playbooks/architectural-violation-remediation.md) · [ADR-0003](../adr/0003-strike-one-vs-advisory-enforcement-model.md) |
| **`SPI-403`** | `Hardcoded Secret Pattern` | Inline API key, token, or private key literal in source | Move to `process.env.*` and rotate credential | [PB-01](../playbooks/architectural-violation-remediation.md) · [ADR-0003](../adr/0003-strike-one-vs-advisory-enforcement-model.md) |
| **`SPI-006`** | `Disk Parity Drift` | Tracked file modified on disk outside the active session baseline | Re-scan baseline via `runSpiderCheck` (`--phase pre-edit`) | [PB-01](../playbooks/architectural-violation-remediation.md) · [PM-004](../postmortems/PM-004-cache-poisoning-and-secret-leakage-in-agent-scratchpads.md) |

---

## 3. Non-Blocking Forensics & Advisories (`SPI-101..300`)

| Code | Advisory Name | Meaning & When to Act |
| :--- | :--- | :--- |
| **`SPI-101`** | `Barrel Bypass` | Consumer imports an internal file inside a subfolder that exposes an `index.*` barrel. Import the barrel instead. |
| **`SPI-102`** | `Ghost Symbol` | Exported symbol has zero workspace importers. Verify if part of public API or prune via `PRUNE` SOP. |
| **`SPI-104`** | `Type-Only Circular Dependency` | Compile-time `import type` loop. Safe at runtime; extract shared interfaces if type complexity grows. |
| **`SPI-105`** | `High Cognitive Complexity` | Deeply nested control flow. Consider extracting pure helpers into `PLUMBING`. |
| **`SPI-108`** | `Temporal Ghost Coupling` | Two files co-mutate across snapshots (`Jaccard >= 0.75`) with zero import path between them (`joy-check --stats`). |
| **`SPI-110`** | `Asymmetric Lifecycle Contract` | Class defines `init`/`connect`/`subscribe` without a matching `dispose`/`close`/`unsubscribe`. |
| **`SPI-111`** | `Domain Logic Drift` | `INFRASTRUCTURE` file has high logic density (`> 0.30`) and zero I/O; consider moving pure logic to `DOMAIN`. |
| **`SPI-112`** | `Unused Import Binding` | Imported identifier is never referenced in file body. |
| **`SPI-202` / `SPI-300`** | `Systemic Risk` / `Ripple Prophecy` | High transitive fan-in blast radius; use `joy-check --phase pre-edit --scope <file>` before changing signatures. |
| **`SPI-203`** | `Structural Load` (`Fat Module`) | File exceeds `800` lines (Tier 1) or `1000` lines (Tier 2). Decompose via `DECOMPOSE` SOP when touching the module. |
| **`SPI-204`** | `Orphaned Module` | Non-entrypoint file has `0` incoming and `0` outgoing edges. |
| **`SPI-207`** | `Tarjan Articulation Bridge` | Graph articulation vertex connecting distinct subgraphs (normal for composition roots). |

---

## 4. Portable Trinity, Runtime, & Agent Installer Error Codes

| Code | Surface | Cause | Resolution Command | Playbook |
| :--- | :--- | :--- | :--- | :--- |
| **`ROOT_LOCKED`** | `joy-trinity` | Another live process holds `.joy-lock` on `--root` past `--lock-timeout-ms` | `node bin/joy-trinity.mjs doctor` (wait, pass `--lock-timeout-ms 30000`, or use separate `--root`) | [PB-02](../playbooks/trinity-lock-and-wal-recovery.md) |
| **`BUFFER_FULL`** | `BufferedDb` | Store stopped draining writes and buffer hit `hardLimitOps` | `node bin/joy-trinity.mjs doctor` (fix disk/permission issue, then flush) | [PB-02](../playbooks/trinity-lock-and-wal-recovery.md) |
| **`CAS_CORRUPTION_QUARANTINED`** | `NodeCasStorage` | Blob SHA-256 mismatch on disk; quarantined to `.broccolidb/storage/corrupt/` | Re-run audit/snapshot to write a fresh blob | [PB-02](../playbooks/trinity-lock-and-wal-recovery.md) |
| **`FORMATION_NOT_FOUND`** | `joy-trinity swarm` | Unknown formation ID passed to `next`/`report`/`status`/`finish` | `node bin/joy-trinity.mjs swarm list` | [PB-03](../playbooks/swarm-stalls-and-failover.md) |
| **`FORMATION_INCOMPLETE`** | `joy-trinity swarm finish` | One or more specialists are still `pending` or `running` | `node bin/joy-trinity.mjs swarm status <id>` → `swarm next` / `swarm report` or `swarm retry` | [PB-03](../playbooks/swarm-stalls-and-failover.md) |
| **`INVALID_REPORT`** | `joy-trinity swarm report` | Reporting on an assignment that was not claimed (`running`) | Call `node bin/joy-trinity.mjs swarm next <id>` first to claim the specialist | [PB-03](../playbooks/swarm-stalls-and-failover.md) |
| **`CONFLICTS`** | `joy init/add/update` | Pre-existing unowned file or edited managed file would be overwritten | Inspect with `--dry-run`, or pass `--force` (saves backup to `.joy/backup/`) | [PB-04](../playbooks/agent-drift-and-mcp-troubleshooting.md) |
| **`NOT_INSTALLED`** | `joy update/remove` | No `.joy/install.json` manifest in target project | Run `node bin/joy.mjs init` first | [PB-04](../playbooks/agent-drift-and-mcp-troubleshooting.md) |
| **`RTG-001..008`** | `BroccoliRuntime` | Causal `RuntimeStateGraph` invariant violation (e.g., `RTG-003` mutation without prior `Audit` + `MutationPlan`) | `node bin/joy-check.mjs --explain RTG-003` | [ADR-0004](../adr/0004-proof-before-mutation-and-sharded-cas.md) |

