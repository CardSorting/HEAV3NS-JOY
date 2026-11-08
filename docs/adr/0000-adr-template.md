<!-- [LAYER: UI] -->
# ADR-0000: [Short Title of Solved Problem and Solution]

- **Status**: Proposed | Accepted | Deprecated | Superseded by [ADR-XXXX](README.md)
- **Date**: YYYY-MM-DD
- **Deciders**: HEAV3NS-JOY Core Architecture Team
- **Technical Story**: Link to specification, issue, or postmortem (e.g., [`PM-001`](../postmortems/PM-001-agent-infinite-repair-loop-on-advisory-warnings.md))

---

## Status

Proposed (Template)

## Context

Describe the forces at play (technical, operational, agent-ergonomic, security, portability) and the concrete problem that requires an architectural decision. State clearly why the status quo or naive approach fails in multi-turn AI agent or polyglot team workflows.

### Decision drivers

- **Driver 1**: Zero external dependencies (`Node >= 18` built-ins only).
- **Driver 2**: Deterministic machine-verifiability in under a few seconds.
- **Driver 3**: Ergonomics for both human engineers and context-window-constrained coding agents.

### Considered options

1. **Option A** — Brief description
2. **Option B** — Brief description
3. **Option C** — Brief description

## Decision

We chose **Option X** because [concrete justification tied to the decision drivers].

### Normative invariants

- List the exact code, zone, or protocol invariants established by this decision.
- Reference the implementing modules in `src/domain/`, `src/core/`, `src/infrastructure/`, `src/plumbing/`, or `src/ui/`.

## Consequences

### Positive

- Clear benefit 1.
- Clear benefit 2.

### Negative / trade-offs

- Explicit trade-off 1 and how it is mitigated.

## Verification

```bash
npm run verify
node ./bin/joy-check.mjs . --theme strict
npm run docs:check
```

- **Code**: [`src/index.mjs`](../../src/index.mjs)
- **Related Playbooks / Postmortems**: [`docs/playbooks/README.md`](../playbooks/README.md) · [`docs/postmortems/README.md`](../postmortems/README.md)

