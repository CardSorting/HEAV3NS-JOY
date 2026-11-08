<!-- [LAYER: UI] -->
# PM-003: Template-Literal False-Positive Imports & UTF-8 BOM Header Blindness

<p align="center">
  <a href="README.md">Postmortems Hub</a> ·
  <a href="../README.md">Docs Hub</a> ·
  <a href="../adr/0002-zero-dependency-polyglot-lexical-scanner.md">ADR-0002</a> ·
  <a href="../wiki/polyglot-recipes.md">Polyglot Cookbook</a>
</p>

- **Incident ID**: `PM-003`
- **Date**: `2026-02-02`
- **Severity**: `SEV-2` (False-Positive Static Analysis Violations)
- **Status**: Resolved
- **Affected Zones**: `PLUMBING` (`codeTokenizer.mjs`, `commentStyles.mjs`, `sourceScanner.mjs`)
- **Related ADR & Playbook**: [ADR-0002](../adr/0002-zero-dependency-polyglot-lexical-scanner.md) · [Playbook PB-01](../playbooks/architectural-violation-remediation.md)

---

## Summary

Two lexical edge cases produced false-positive blocking violations during self-hosting and polyglot testing:
1. A `DOMAIN` template generator file (`src/domain/agentTemplates.mjs`) contained multi-line template literals embedding example code snippets (`import fs from "node:fs"`), which a naive regex scanner flagged as a real `SPI-206` Domain I/O violation.
2. Files saved by Windows editors with a leading UTF-8 Byte Order Mark (`\uFEFF`) failed `[LAYER: <ZONE>]` header extraction (`SPI-208`) when anchored strictly to character index `0`.

## Root cause

1. **Why was an `import` inside a template literal flagged as a real import?** Regex-based string stripping (`/(`(?:\\.|[^`\\])*`)/g`) fails when a template literal contains nested `${...}` interpolation blocks that themselves contain backticks, braces, or strings.
2. **Why did `DOMAIN` files contain template literals with code?** `src/domain/agentTemplates.mjs` is a pure template generator that produces markdown and code examples without performing any I/O.
3. **Why did UTF-8 BOM files fail header checks?** `\uFEFF` at index `0` prevented `^` anchors on line 1 shebang/frontmatter patterns from matching cleanly.
4. **What invariant was missing?** A true character-by-character lexical state machine in `PLUMBING` that tracks brace depth inside `${...}` template expressions, plus automatic BOM normalization before header and token scanning.

## Action items

| Action | Type | Code / Test Reference | Status |
| :--- | :--- | :--- | :---: |
| Implement single-pass lexical state machine in `codeTokenizer.mjs` with `${...}` expression brace-depth stack and UTF-8 BOM stripping | Preventative | [`src/plumbing/codeTokenizer.mjs`](../../src/plumbing/codeTokenizer.mjs) | Done |
| Strip UTF-8 BOM and preserve `#!` shebangs and `---` YAML frontmatter in `commentStyles.mjs` | Preventative | [`src/plumbing/commentStyles.mjs`](../../src/plumbing/commentStyles.mjs) | Done |
| Add multi-line destructured export and nested Rust lowercase module import resolution in `sourceScanner.mjs` / `SpiderEngine.mjs` | Preventative | [`src/plumbing/sourceScanner.mjs`](../../src/plumbing/sourceScanner.mjs) | Done |
| Add dedicated lexical edge-case tests in Suite 11 and Suite 16 | Verification | [`tests/joyzoning-advanced.test.mjs`](../../tests/joyzoning-advanced.test.mjs) | Done |

## Lessons learned

- **What went well**: Keeping all lexical scanning in `src/plumbing/codeTokenizer.mjs` allowed fixing the bug once for all 5 zones and all supported languages.
- **What went wrong**: Regular expressions cannot parse nested context-free grammar constructs like JavaScript `${...}` template interpolations.
- **Permanent rule**: *Always run `stripCommentsAndStrings` via the stateful `codeTokenizer.mjs` lexer before extracting imports, exports, or mutable bindings.*

