<!-- [LAYER: DOMAIN] -->
# 01 — Syntax, Header Tags, and Geographic Alignment

## 1. Archetypal Primacy: The `[LAYER: <ZONE>]` Tag

Every source file in a Joyzoned repository must declare its architectural zone near the top of the file using a `[LAYER: <ZONE>]` header tag.

### 1.1 Canonical Zone Identifiers
The `<ZONE>` value is case-insensitive when parsed, always normalized to uppercase in headers and lowercase in metrics:
- `DOMAIN`
- `CORE`
- `INFRASTRUCTURE`
- `PLUMBING` (or `UTILS`, which is a canonical alias that normalizes to `plumbing`)
- `UI`

### 1.2 Canonical Regex Pattern
Validators extract the zone tag using the following case-insensitive regular expression evaluated across the **first 10,000 characters** (`10KB`) of the file:

```regex
/\[LAYER:\s*(DOMAIN|CORE|INFRASTRUCTURE|PLUMBING|UI|UTILS)\s*\]/i
```

Why 10,000 characters? Some enterprise repositories prepend long copyright licenses, auto-generated protobuf banners, or module docstrings at the top of files. Scanning the first 10,000 characters ensures license headers do not hide the `[LAYER: <ZONE>]` declaration while still enforcing top-of-file primacy.

---

## 2. Multi-Language Comment Style Registry

Joyzoning is language-agnostic. The `[LAYER: <ZONE>]` tag uses the idiomatic comment syntax of the host language:

| Style Family | File Extensions | Canonical Header Format |
| :--- | :--- | :--- |
| **`JSDOC`** | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.java` | `/** [LAYER: DOMAIN] */` |
| **`SLASH`** | `.go`, `.rs`, `.c`, `.cpp`, `.cc`, `.h`, `.hpp`, `.proto`, `.grit`, `.swift`, `.kt`, `.cs` | `// [LAYER: CORE]` |
| **`HASH`** | `.py`, `.sh`, `.bash`, `.zsh`, `.rb`, `.yaml`, `.yml`, `.toml`, `.env`, `.dockerfile`, `Dockerfile` | `# [LAYER: INFRASTRUCTURE]` |
| **`DASH`** | `.sql`, `.lua`, `.hs`, `.elm` | `-- [LAYER: PLUMBING]` |
| **`HTML`** | `.md`, `.html`, `.htm`, `.xml`, `.vue`, `.svelte`, `.svg` | `<!-- [LAYER: UI] -->` |

### 2.1 Multi-line Header Blocks
The tag may stand alone on line 1 or live inside a multi-line doc comment block:

```ts
/**
 * [LAYER: DOMAIN]
 * Order pricing and discount eligibility invariants.
 * @joyzoning-owner commerce-team
 */
```

---

## 3. Header Placement & Auto-Healing Rules

When stamping or auto-healing (`--heal`) a `[LAYER: <ZONE>]` tag into a file, respect two structural prefixes:

1. **Shebang Preservation (`#!`)**:
   If a script starts with `#!/usr/bin/env node`, `#!/usr/bin/env python3`, or `#!/bin/sh`, the `#!` line **must remain on Line 1** so the OS kernel can execute the script. Insert the `[LAYER: <ZONE>]` comment immediately on **Line 2**.
   ```python
   #!/usr/bin/env python3
   # [LAYER: INFRASTRUCTURE]
   import os
   ```

2. **YAML Frontmatter Preservation (`---`)**:
   If a Markdown (`.md`) file begins with YAML frontmatter delimited by `---` on Line 1, place the `<!-- [LAYER: <ZONE>] -->` tag immediately **after** the closing `---` delimiter so static site generators and markdown parsers continue to parse frontmatter cleanly.
   ```markdown
   ---
   title: Architecture Guide
   ---
   <!-- [LAYER: UI] -->
   # Architecture Guide
   ```

3. **Standard Files**:
   For all other files, place the `[LAYER: <ZONE>]` header on **Line 1**.

---

## 4. Principle of Geographic Alignment (PGA)

A file's declared `[LAYER: <ZONE>]` header must match its physical directory path.

### 4.1 Default Canonical Directory Mapping

| Physical Path Segment | Expected Canonical Zone |
| :--- | :--- |
| `/domain/` | `domain` |
| `/core/` | `core` |
| `/infrastructure/`, `/adapters/`, `/services/`, `/integrations/`, `/hosts/` | `infrastructure` |
| `/plumbing/`, `/utils/` | `plumbing` |
| `/ui/`, `/webview-ui/`, `/frontend/`, `/views/`, `/cli/`, `/components/` | `ui` |

### 4.2 Custom Path Mapping (`spider.spec.json` / `stability.config.json`)
Projects with custom directory conventions can declare explicit prefix mappings in `spider.spec.json` or `stability.config.json`:

```json
{
  "layers": {
    "domain": ["src/domain", "packages/kernel/models"],
    "core": ["src/core", "packages/kernel/engine"],
    "infrastructure": ["src/infrastructure", "src/drivers", "src/db"],
    "plumbing": ["src/plumbing", "src/utils", "src/common"],
    "ui": ["src/ui", "src/cli", "docs"]
  }
}
```

### 4.3 Geographic Misalignment Diagnostics
- **Untagged File (`MISSING_TAG`)**: A source file inside a tracked directory lacks any `[LAYER: <ZONE>]` tag within its first 10,000 characters.
- **Geographic Misalignment (`GEOGRAPHIC_MISALIGNMENT`)**: A file resides in `src/domain/Order.ts` (`expected: domain`) but declares `/** [LAYER: INFRASTRUCTURE] */` (`declared: infrastructure`).
  - **Resolution**: Either move the file to `src/infrastructure/` (`MOVE` SOP) or align the tag to `/** [LAYER: DOMAIN] */` (`ALIGN_TAGS` SOP) after verifying the file's contents obey Domain purity.

---

## 5. Content-Based Zone Inference (For Untagged Legacy Files)

When migrating an untagged codebase or running `joy-check --heal`, the zone inference algorithm determines the appropriate zone in strict priority order:

1. **Path Geography First**: If the file's path matches a configured or canonical zone directory (e.g., `src/domain/...`), infer that zone.
2. **Content Heuristics Second** (for root or ambiguous files):
   - If the file imports React/Vue/DOM APIs or renders HTML/CLI tables -> `ui`.
   - If the file imports `fs`, `http`, `net`, `child_process`, database drivers, or SDK clients -> `infrastructure`.
   - If the file defines pure interfaces (`export interface I*`) or domain entities with zero I/O -> `domain`.
   - If the file coordinates multiple modules/workflows -> `core`.
   - If the file contains only pure stateless helper functions with zero local project imports -> `plumbing`.

---

## 6. Exempt & Whitelisted Files

Not every file in a repository is a source module requiring a `[LAYER: <ZONE>]` header. The following files are automatically exempt from header and AST enforcement:

1. **Lockfiles & Package Manifests**: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.toml`, `Cargo.lock`, `go.mod`, `go.sum`, `pyproject.toml`, `requirements.txt`.
2. **Compiler & Tool Configs**: `tsconfig.json`, `tsconfig.*.json`, `.eslintrc.*`, `biome.json`, `jest.config.*`, `vitest.config.*`, `.gitignore`, `.prettierrc`.
3. **TypeScript Ambient Declarations**: `*.d.ts` files.
4. **Generated / Build Artifacts**: `dist/`, `build/`, `out/`, `node_modules/`, `.git/`, `coverage/`, `*.min.js`, `*.bundle.js`, `*.pb.ts`.
5. **Test Suites (Configurable)**: Test files (`*.test.ts`, `*.spec.ts`, `tests/**`) are encouraged to carry `[LAYER: ...]` tags when testing specific layers, or may be exempted via `exclude` patterns in `stability.config.json`.

