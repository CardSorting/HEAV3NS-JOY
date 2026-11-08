<!-- [LAYER: UI] -->
# PM-001: Autonomous Agent Infinite Repair Loop on Non-Structural Advisory Warnings

<p align="center">
  <a href="README.md">Postmortems Hub</a> ·
  <a href="../README.md">Docs Hub</a> ·
  <a href="../adr/0003-strike-one-vs-advisory-enforcement-model.md">ADR-0003</a> ·
  <a href="../playbooks/architectural-violation-remediation.md">Playbook PB-01</a>
</p>

- **Incident ID**: `PM-001`
- **Date**: `2026-02-18`
- **Severity**: `SEV-1` (Autonomous Agent Execution Deadlock)
- **Status**: Resolved
- **Affected Zones**: `DOMAIN` (`joyRules.mjs`), `CORE` (`SpiderEngine.mjs`), `UI` (`joy hook post-edit`)
- **Related ADR & Playbook**: [ADR-0003](../adr/0003-strike-one-vs-advisory-enforcement-model.md) · [Playbook PB-01](../playbooks/architectural-violation-remediation.md)

---

## Summary

During early clean-room acquisition testing with autonomous coding agents, treating graph topology signals (`SPI-207` Tarjan Articulation Bridge, `SPI-202` Blast Radius, and `SPI-105` Cognitive Complexity) as hard exit-code-`1` failures caused agents to enter unbounded refactoring loops. When tasked with a 3-line bug fix inside an existing bridge module (`src/index.mjs`), the agent repeatedly attempted to split and re-export the composition root to clear `SPI-207`, creating new articulation bridges in the process and exhausting its turn budget.

## Root cause

1. **Why did the agent enter an infinite repair loop?** The post-edit check returned a non-zero exit code for `SPI-207` (Tarjan Articulation Bridge) on a file the agent touched.
2. **Why did `SPI-207` fire on a valid composition root?** By graph theory definition, a composition root that wires disjoint subsystems (`domain`, `core`, `infrastructure`, `ui`) is an articulation vertex connecting those subgraphs.
3. **Why did the agent try to eliminate `SPI-207`?** The agent was instructed to "fix all errors until `joy-check` exits `0`."
4. **Why did `joy-check` exit `1` on topological advisories?** Early prototypes did not separate **Strike-1 structural violations** (cycles, layer leaks, domain I/O, missing headers) from **non-blocking graph telemetry** (bridges, hubbiness, complexity).
5. **What invariant was missing?** A strict two-tier enforcement model (`ADR-0003`) where only unambiguous, locally remediable architectural violations fail the build (`exit 1`), plus a behavioral circuit-breaker stopping agents after 3 failed attempts on the same finding.

## Action items

| Action | Type | Code / Test Reference | Status |
| :--- | :--- | :--- | :---: |
| Partition `SPI-*` rules into Strike-1 Blocking (`error`) vs. Advisory (`warning`/`info`) | Preventative | [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs), [`src/core/SpiderEngine.mjs`](../../src/core/SpiderEngine.mjs) | Done |
| Ensure `bin/joy-check.mjs` exits `0` when `violations.length === 0` regardless of `advisories.length` | Preventative | [`bin/joy-check.mjs`](../../bin/joy-check.mjs), [`src/domain/broccoliRules.mjs`](../../src/domain/broccoliRules.mjs) | Done |
| Codify the 3-attempt stop-and-escalate circuit breaker in `AGENTS.md`, `SOUL.md`, and `MCP_PROMPTS` | Operational | [`SOUL.md`](../../SOUL.md), [`src/domain/mcpProtocol.mjs`](../../src/domain/mcpProtocol.mjs) | Done |
| Add test coverage verifying advisories never flip `conforms` to `false` | Verification | [`tests/joyzoning.test.mjs`](../../tests/joyzoning.test.mjs) | Done |

## Lessons learned

- **What went well**: Tarjan's bridge algorithm (`findArticulationBridges` in `entropyFormulas.mjs`) accurately identified structural choke points in $O(V + E)$ time.
- **What went wrong**: Topological observations are architecture planning telemetry, not syntax errors. Treating telemetry as a hard gate forces agents into destructive over-refactoring.
- **Permanent rule**: *Block only what is truly structural; keep graph telemetry as `[INFO]` advisories.*

