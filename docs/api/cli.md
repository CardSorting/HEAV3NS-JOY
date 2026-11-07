<!-- [LAYER: UI] -->
# CLI Reference (`joy-check` & `docs-check`)

```bash
node bin/joy-check.mjs [target-dir] [options]
node bin/docs-check.mjs [target-dir]
```

Both CLI binaries require **zero external dependencies** and run on any standard Node.js ($\ge 18$) environment.

---

## Output formats (`--format`)

```bash
--format text      # Default human-readable Sovereign Audit Report
--format compact   # Token-minimal 1-line-per-finding format (ESLint/cargo style)
--format json      # Pretty-printed JSON report (alias: --json)
--format sarif     # OASIS SARIF v2.1.0 for GitHub Code Scanning (alias: --sarif)
--format github    # GitHub Actions workflow annotations (::error / ::warning)
--format markdown  # Markdown summary table + optional --mermaid dependency flowchart
--format lsp       # Language Server Protocol PublishDiagnostics + CodeAction quick fixes
--format tap       # Test Anything Protocol (TAP v13)
--format junit     # JUnit XML test suite report for CI pipelines
--format ndjson    # Newline-Delimited JSON stream (summary, gate, findings, completion)
```

---

## Commands & flags (`bin/joy-check.mjs`)

### 1. Standard Joyzoning & Spider Audit
```bash
node bin/joy-check.mjs .
node bin/joy-check.mjs . --theme strict
node bin/joy-check.mjs . --theme relaxed
node bin/joy-check.mjs . --theme safety
```
Exits with code `0` when zero blocking violations exist under the selected theme, `1` when blocking violations exist, and `2` on usage or environment errors (unknown option, invalid `--format`/`--theme`, missing target directory). See [Exit codes](../OPERATIONS.md#exit-codes).

### 2. Initialize Project Configuration (`--init`)
```bash
node bin/joy-check.mjs <project-dir> --init
node bin/joy-check.mjs <project-dir> --init --dry-run
```
Scaffolds `stability.config.json` and `.joyignore` in `<project-dir>`.

### 3. Autonomous Self-Healing (`--heal` & `--heal-stateless`)
```bash
node bin/joy-check.mjs <project-dir> --heal
node bin/joy-check.mjs <project-dir> --heal --heal-stateless
node bin/joy-check.mjs <project-dir> --heal --heal-stateless --dry-run
```
- `--heal`: Stamps missing `[LAYER: <ZONE>]` headers or aligns mismatched headers to match physical folder geography (preserving `#!` shebangs and `---` YAML frontmatter).
- `--heal-stateless`: Converts un-reassigned top-level `let`/`var` bindings in `[LAYER: PLUMBING]` files to `const` (`SPI-205`).

### 4. StabilityDoctor & Multivariate Statistics (`--doctor` & `--stats`)
```bash
node bin/joy-check.mjs . --doctor
node bin/joy-check.mjs . --stats
node bin/joy-check.mjs . --stats --json
```
- `--doctor` (alias `--pulse`): Renders Build Health grade, Gini hubbiness concentration, top entropy hotspots, and `I<ClassName>` interface synthesis recommendations.
- `--stats`: Computes V215 multivariate `mean`, `stdDev`, Gini hubbiness, and `> 2.0σ` Z-score outliers across complexity, coupling, and module line count.

### 5. Scoped Agent Check Phases (`--phase`, `--scope`, `--neighborhood`)
```bash
node bin/joy-check.mjs . --phase pre-edit --scope src/core/SpiderEngine.mjs --neighborhood 1 --format compact
node bin/joy-check.mjs . --phase ci --format junit
```
Scopes verification to a comma-separated list of target files plus their $N$-hop bidirectional dependency neighborhood.

### 6. Structural AST Skeletonization (`--skeleton` & `--keep-symbol`)
```bash
node bin/joy-check.mjs . --skeleton src/core/SpiderEngine.mjs
node bin/joy-check.mjs . --skeleton src/core/SpiderEngine.mjs --keep-symbol auditProject
```
Distills a file into its `[LAYER]` header, imports/exports, class declarations, and method signatures (`65%–85%` token reduction) while optionally preserving the full body of `--keep-symbol`.

### 7. Interactive Rule & Diagnostic Explainer (`--explain`)
```bash
node bin/joy-check.mjs --explain SPI-206
node bin/joy-check.mjs --explain SPI-108
node bin/joy-check.mjs --explain RTG-003
node bin/joy-check.mjs --explain BROCCOLIDB
node bin/joy-check.mjs --explain DOMAIN
```
Prints the title, series, default severity, SOP, rationale, remediation steps, and code example for any of the **44** registered diagnostic codes and zones.

### 8. Problem Matcher Export (`--problem-matcher`)
```bash
node bin/joy-check.mjs --problem-matcher
```
Emits a ready-to-save `.vscode/problem-matcher.json` (v2) matching `--format compact`.

---

## Documentation Guardrails (`bin/docs-check.mjs`)

```bash
npm run docs:check
# or directly:
node bin/docs-check.mjs
```
Verifies that all required docs exist, start with valid `<!-- [LAYER: ...] -->` headers, contain zero broken relative links, include required `docs/README.md` sections and Mermaid diagrams, and match live codebase metrics.

