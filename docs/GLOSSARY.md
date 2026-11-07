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
| **BroccoliDB** | Portable causal runtime: content-addressed storage, quarantine, and replay for governed agent sessions. |
| **CAS** | Content-addressed storage keyed by SHA-256. |
| **Triad Audit** | Pre-implementation review from three perspectives: Architect, Critic, SRE ([workflow 01](../workflows/01-TRIAD-AUDIT-PLANNING.md)). |
| **Producer-before-consumer** | Implement callees (plumbing, domain, infrastructure) before their callers (core, ui). |
| **Heal** | Automatic repair of headers (`--heal`) or stateless bindings (`--heal-stateless`). |
