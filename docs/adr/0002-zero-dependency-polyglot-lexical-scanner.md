<!-- [LAYER: UI] -->
# ADR-0002: Zero External Dependencies & Single-Pass Polyglot Lexical Scanner

- **Status**: Accepted
- **Date**: 2026-02-02
- **Deciders**: HEAV3NS-JOY Core Architecture Team
- **Technical Story**: [`docs/CONSTITUTION.md`](../CONSTITUTION.md) (Law #5) · [`PM-003`](../postmortems/PM-003-template-literal-false-positive-imports-and-bom-headers.md)

---

## Status

Accepted — Enforced statically by Suite 23 (`tests/portable-portability.test.mjs`).

## Context

Many architectural linters depend on heavy language-specific compiler SDKs (`typescript`, `@babel/parser`, `tree-sitter` native C++ bindings, Python `ast`, etc.). In agentic and enterprise CI environments, this causes severe friction:
- Native node-gyp / WASM binaries fail in air-gapped sandboxes, mismatched OS architectures, or read-only containers.
- Supply-chain vulnerabilities and transitive version conflicts break `npx` one-shot invocations.
- Conversely, naive regex-only scanners suffer from false positives when source files contain `import` keywords inside comments, string literals, regex literals, or multi-line template literal expressions (`${...}`) (see [`PM-003`](../postmortems/PM-003-template-literal-false-positive-imports-and-bom-headers.md)).

### Decision drivers

- **Instant Portability**: Must run anywhere `node >= 18` exists with `0` `dependencies` in `package.json` and zero `npm install` requirement.
- **Polyglot Coverage**: Must scan TypeScript/JavaScript, Python, Go, Rust, Java, C/C++, SQL, Shell, YAML, and Markdown in a single pass.
- **Lexical Accuracy**: Must never hallucinate imports or `let`/`var` bindings inside comments, strings, or nested template expressions, and must strip UTF-8 BOMs (`\uFEFF`).

### Considered options

1. **Bundle `tree-sitter` or `@babel/parser` dependencies**: Violates zero-dependency portability and only covers JS/TS without native bindings.
2. **Naive Regex Matching on Raw File Text**: Triggered false-positive `SPI-206` violations on code-generation templates and broke on UTF-8 BOM files.
3. **Pure-ESM Single-Pass Stateful Lexical Tokenizer (`codeTokenizer.mjs`) + Polyglot Extractor (`sourceScanner.mjs`) + Pure FIPS 180-4 SHA-256 (`canonicalHash.mjs`)**: Zero external dependencies, using only `node:*` built-ins in `INFRASTRUCTURE`/`UI` and pure ECMAScript in `PLUMBING`/`DOMAIN`/`CORE`.

## Decision

We chose **Option 3**:

1. **Zero npm dependencies**: `package.json` has zero `dependencies` or `devDependencies`. Every import under `src/` is either a relative module path or a `node:` built-in (and `node:` built-ins are strictly confined to `src/infrastructure/` and `src/ui/`).
2. **Stateful Single-Pass Lexical Scanner**: [`src/plumbing/codeTokenizer.mjs`](../../src/plumbing/codeTokenizer.mjs) strips UTF-8 BOMs and tracks line comments, block comments, Python triple-quoted strings, Rust raw strings, regex literals, and arbitrarily nested `${...}` template literal expressions in $O(N)$ time.
3. **Pure SHA-256 in Plumbing**: [`src/plumbing/canonicalHash.mjs`](../../src/plumbing/canonicalHash.mjs) implements FIPS 180-4 SHA-256 in pure JavaScript so `DOMAIN` and `CORE` can compute Merkle roots, workspace scopes, and deterministic finding IDs with `0%` I/O imports.

## Consequences

### Positive

- `git clone` (or `npx heav3ns-joy`) works immediately offline, in air-gapped CI, and across macOS, Linux, and Windows on Node 18, 20, and 22.
- Zero supply-chain attack surface from third-party npm packages.
- Accurate import, export, class density, and cognitive complexity extraction across TS/JS, Python, Go, Rust, and Java.

### Negative / trade-offs

- Does not perform full type inference (e.g., resolving complex TypeScript conditional types); by design, type checking is delegated to the project's native compiler (`tsc`, `cargo check`, `go vet`, `mypy`).

## Verification

```bash
node --test tests/portable-portability.test.mjs
node --test tests/joyzoning-advanced.test.mjs
```

- **Code**: [`src/plumbing/codeTokenizer.mjs`](../../src/plumbing/codeTokenizer.mjs) · [`src/plumbing/sourceScanner.mjs`](../../src/plumbing/sourceScanner.mjs) · [`src/plumbing/canonicalHash.mjs`](../../src/plumbing/canonicalHash.mjs)
- **Postmortem**: [PM-003: Template-Literal False-Positive Imports & BOM Headers](../postmortems/PM-003-template-literal-false-positive-imports-and-bom-headers.md)

