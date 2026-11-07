<!-- [LAYER: UI] -->
# Glossary

| Term | Definition |
| :--- | :--- |
| **Joyzoning** | The methodology: every source file belongs to exactly one of five zones, declared by a header and matched by its directory. |
| **Zone** | One of `DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`. See [`spec/00-CANONICAL-MODEL.md`](../spec/00-CANONICAL-MODEL.md). |
| **Layer header** | The `[LAYER: <ZONE>]` comment at the top of a file (syntax per language in [`spec/01-SYNTAX-AND-HEADERS.md`](../spec/01-SYNTAX-AND-HEADERS.md)). |
| **PGA** (Principle of Geographic Alignment) | A file's path must match its header zone. |
| **Contractual Sovereignty** | Core depends on `I<ClassName>` interfaces in `domain/interfaces/`, never on concrete infrastructure. |
| **Blocking violation** | An architectural error that fails the audit (exit code non-zero). |
| **Advisory** | A non-blocking hint (`SPI-101..112`, `[INFO]`); never fails a build. |
| **SPI-xxx** | Spider forensic violation/advisory codes. Run `--explain SPI-xxx`. See [api/errors.md](api/errors.md). |
| **RTG-xxx** | Runtime State Graph codes for BroccoliDB sessions. |
| **Spider** | The static analysis engine that builds the dependency graph and computes metrics. |
| **Stability Index / Entropy** | Aggregate structural health score derived from depth, naming, orphan, coupling, complexity, and cycle pillars ([spec/03](../spec/03-METRICS-AND-FORENSICS.md)). |
| **Gini hubbiness** | Inequality of dependency fan-in; high values mean a few modules carry most coupling. |
| **Articulation bridge (SPI-207)** | A module whose removal disconnects the graph; informational. |
| **JoyRide** | Bounded, fingerprint-validated cache of file reads and results. |
| **Skeletonization** | Reducing a file to its structural signature to save agent tokens. |
| **BroccoliDB** | Portable causal runtime: content-addressed storage, quarantine, and replay for governed agent sessions, plus an embedded SQLite-backed document/table kernel (`src/infrastructure/broccolidb/`). |
| **BroccoliQueue** | Durable, priority-ordered, retry/DLQ-capable job queue backed by the embedded BroccoliDB kernel (`src/infrastructure/broccoliqueue/`). |
| **BufferedDb** | Write-behind table buffer (`src/core/BufferedDb.mjs`) with layer-ordered batch flushes and per-agent shadow transactions over `IBufferedStore`. |
| **AgentSwarm** | Multi-specialist task classifier, DAG planner, convergence checker, and dispatcher (`src/core/AgentSwarmDispatcher.mjs`) operable step-by-step via `SwarmFormationLedger` or across external CLI processes via `ProcessAgentEngine`. |
| **Portable Broccoli Trinity** | The zero-dependency combination of `BroccoliQueue`, `BufferedDb`, and `AgentSwarm` exposed by `bin/joy-trinity.mjs` and `heav3ns-joy/portable` ([PORTABLE_TRINITY.md](PORTABLE_TRINITY.md)). |
| **joy CLI (`bin/joy.mjs`)** | The unified CLI and `create-next-app`-style agent installer (`joy init/add/status/update/remove/doctor/mcp/hook/check/trinity`). |
| **SOUL.md** | The repository-level agent operating constitution installed by `joy init` ([`SOUL.md`](../SOUL.md)). |
| **CAS** | Content-addressed storage keyed by SHA-256. |
| **Triad Audit** | Pre-implementation review from three perspectives: Architect, Critic, SRE ([workflow 01](../workflows/01-TRIAD-AUDIT-PLANNING.md)). |
| **Producer-before-consumer** | Implement callees (plumbing, domain, infrastructure) before their callers (core, ui). |
| **Heal** | Automatic repair of headers (`--heal`) or stateless bindings (`--heal-stateless`). |
