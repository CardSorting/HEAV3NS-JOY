<!-- [LAYER: UI] -->
# Contributing to HEAV3NS-JOY

Thank you for contributing to **HEAV3NS-JOY** (`heav3ns-joy`) — the zero-dependency, agent-native software development framework uniting **Joyzoning**, **Spider Agent Ergonomics**, **JoyRide Context Caching**, and **BroccoliDB Causal Runtime**.

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) and [Architectural Constitution](docs/CONSTITUTION.md) before participating.

---

## Table of contents

- [Quick links](#quick-links)
- [Reporting bugs](#reporting-bugs)
- [Security vulnerabilities](#security-vulnerabilities)
- [Before you contribute](#before-you-contribute)
- [Development setup](#development-setup)
- [The Five Mandatory Coding Rules](#the-five-mandatory-coding-rules)
- [Producer-Before-Consumer Implementation Order](#producer-before-consumer-implementation-order)
- [Pull request checklist](#pull-request-checklist)
- [Code quality & verification gates](#code-quality--verification-gates)
- [Testing](#testing)
- [Documentation changes](#documentation-changes)
- [License](#license)

---

## Quick links

| Resource | Location |
|----------|----------|
| Root README | [README.md](README.md) |
| Agent Operational Entrypoint | [AGENTS.md](AGENTS.md) |
| Documentation Hub | [docs/README.md](docs/README.md) |
| Documentation Guide | [docs/DOCS_GUIDE.md](docs/DOCS_GUIDE.md) |
| Maintainer Guide | [docs/MAINTAINER.md](docs/MAINTAINER.md) |
| Two-Layer Architecture | [docs/AGENT_STACK.md](docs/AGENT_STACK.md) |
| Code ↔ Docs Map | [docs/CODE_TO_DOC_MAP.md](docs/CODE_TO_DOC_MAP.md) |
| Codebase Standards | [docs/CODEBASE_STANDARDS.md](docs/CODEBASE_STANDARDS.md) |
| Security Policy | [SECURITY.md](SECURITY.md) |

---

## Reporting bugs

1. Search existing issues or `CHANGELOG.md` to avoid duplicates.
2. Open a new issue with reproduction steps, Node.js version (`node -v`), CLI invocation (`npx joy-check ...`), and relevant violation codes (`SPI-xxx`).
3. Include output from `node ./bin/joy-check.mjs . --doctor` or `node ./bin/joy-check.mjs . --stats` when diagnosing structural or entropy anomalies.

---

## Security vulnerabilities

**Do not** open public issues for security vulnerabilities.

Report privately according to [SECURITY.md](SECURITY.md). Also review [docs/SECURITY_BEST_PRACTICES.md](docs/SECURITY_BEST_PRACTICES.md) for security boundaries (`SPI-401..403`, `NodeCasStorage` quarantine, and `JoyRide` secret scrubbing).

---

## Before you contribute

| Change type | Requirement |
|-------------|-------------|
| Bug fix, typo, docs correction | PR welcome — ensure `npm run docs:check` and `npm run joy-check` pass |
| New `SPI-xxx` rule or diagnostic | Update `src/domain/joyRules.mjs`, `docs/api/errors.md`, and unit tests |
| New public API export | Export from `src/index.mjs`, update `docs/api/public-api.md` export count |
| External npm dependency | **Strictly forbidden** — HEAV3NS-JOY has a hard zero-dependency invariant |

---

## Development setup

### Prerequisites

- **Node.js `>=18.0.0`** (uses built-in `node:test`, `node:assert/strict`, `node:crypto`, `node:fs`, `node:path`)
- **Zero external packages** (`npm install` is not required; zero `node_modules` dependencies exist)

### Bootstrap & Verify

```bash
git clone <repository-url>
cd HEAV3NS-JOY
npm test                 # Run all 22 test suites (29 test cases)
npm run joy-check        # Verify 100% Joyzoning conformance (SOVEREIGN grade)
npm run docs:check       # Verify all required docs, [LAYER] headers, links, and live metrics
```

---

## The Five Mandatory Coding Rules

Every file in this repository obeys Joyzoning (`AGENTS.md` & `docs/CODEBASE_STANDARDS.md`):

1. **Top-of-File `[LAYER: <ZONE>]` Header Tag**: Every source and markdown file must begin with its zone header within the first 10KB (`/** [LAYER: DOMAIN] */`, `<!-- [LAYER: UI] -->`, etc.).
2. **Principle of Geographic Alignment (PGA)**: A file's physical folder (`src/domain/`, `src/core/`, `src/infrastructure/`, `src/plumbing/`, `src/ui/`) must match its `[LAYER: <ZONE>]` tag.
3. **Import Depth & Direction Discipline**: Max relative parent traversal is **3** (`../../..`). Zero circular dependencies (`SPI-201`).
4. **Contractual Sovereignty (`I<ClassName>`)**: `core` depends on `infrastructure` strictly through formal contracts in `src/domain/interfaces/`.
5. **Module Size & Simplicity Caps**: Keep every file `< 800` lines (Tier 1 "Small & Sharp").

---

## Producer-Before-Consumer Implementation Order

When creating or refactoring across zones, always implement and test **producers before consumers**:

1. `PLUMBING` (`src/plumbing/`) — stateless, context-free helpers
2. `DOMAIN` (`src/domain/`) — formal interfaces and pure business math/rules
3. `INFRASTRUCTURE` (`src/infrastructure/`) — concrete Node.js/FS/CAS adapters
4. `CORE` (`src/core/`) — orchestrators, runtime state graph, cache, and engines
5. `UI` (`src/ui/`, `bin/`, `docs/`) — formatters, CLI entrypoints, and documentation

---

## Pull request checklist

- [ ] Branch is up to date with `main`
- [ ] Zero external dependencies in `package.json`
- [ ] Every created or modified file has a valid `[LAYER: <ZONE>]` header at line 1 and stays `< 800` lines
- [ ] `npm test` passes (`22/22` suites)
- [ ] `npm run joy-check` passes (`0` violations, `SOVEREIGN` grade)
- [ ] `npm run docs:check` passes (`0` broken links, live metrics in sync)
- [ ] Documentation updated per [docs/CODE_TO_DOC_MAP.md](docs/CODE_TO_DOC_MAP.md)

---

## Code quality & verification gates

```bash
npm run joy-check                              # Standard Joyzoning + Spider audit
node ./bin/joy-check.mjs . --theme strict      # Zero-tolerance strict audit
node ./bin/joy-check.mjs . --doctor            # Architectural health & hotspot checkup
node ./bin/joy-check.mjs . --stats             # Gini, Shannon, Cyclomatic & Halstead report
npm run docs:check                             # Documentation integrity & link verifier
```

---

## Testing

```bash
npm test                                       # Run all tests via node --test tests/*.test.mjs
```

All tests live in `tests/*.test.mjs` and carry `/** [LAYER: INFRASTRUCTURE] */` headers.

---

## Documentation changes

After editing any `.md` file or changing exported symbols / CLI flags:

```bash
npm run docs:check
```

See [docs/MAINTAINER.md](docs/MAINTAINER.md) and [docs/CODE_TO_DOC_MAP.md](docs/CODE_TO_DOC_MAP.md) for the full documentation maintenance workflow.

---

## License

By contributing to **HEAV3NS-JOY**, you agree that your contributions will be licensed under the [MIT License](LICENSE).
