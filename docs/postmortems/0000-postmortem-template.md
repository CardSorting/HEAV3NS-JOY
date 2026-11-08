<!-- [LAYER: UI] -->
# PM-0000: [Descriptive Title of Failure Mode and Architectural Fix]

- **Incident ID**: `PM-0000`
- **Date**: `YYYY-MM-DD`
- **Severity**: `SEV-1` | `SEV-2` | `SEV-3`
- **Status**: Resolved (Template)
- **Affected Zones**: `DOMAIN` | `CORE` | `INFRASTRUCTURE` | `PLUMBING` | `UI`
- **Related ADR & Playbook**: [ADR-XXXX](../adr/README.md) · [Playbook PB-XX](../playbooks/README.md)

---

## Summary

2–4 sentences describing what failed, how it manifested for users or coding agents, what impact it had, and how it was permanently eliminated in code.

## Root cause

Explain the technical mechanics of the failure using the **5 Whys** methodology:
1. **Why did the symptom occur?**
2. **Why did the subsystem behave that way?**
3. **Why did existing checks not catch it?**
4. **Why was the assumption made in the initial implementation?**
5. **What structural invariant was missing?**

## Timeline

- **T+00m**: Anomaly observed during clean-room dogfooding / CI / stress testing.
- **T+10m**: Root cause isolated to specific module and invariant gap.
- **T+30m**: Fix implemented in Producer-Before-Consumer order (`PLUMBING` → `DOMAIN` → `INFRASTRUCTURE` → `CORE` → `UI`).
- **T+45m**: Regression test suite added and verified via `npm run verify`.

## Action items

| Action | Type | Code / Test Reference | Status |
| :--- | :--- | :--- | :---: |
| Implement structural guard in domain/core | Preventative | [`src/index.mjs`](../../src/index.mjs) | Done |
| Add deterministic regression test | Verification | [`tests/joyzoning.test.mjs`](../../tests/joyzoning.test.mjs) | Done |
| Update Playbook and Knowledge Base matrix | Operational | [`docs/kb/symptom-diagnosis-matrix.md`](../kb/symptom-diagnosis-matrix.md) | Done |

## Lessons learned

- **What went well**: Fast reproduction and deterministic test isolation.
- **What went wrong**: Initial assumption relied on caller discipline rather than a machine-enforced invariant.
- **Where we got lucky**: Caught during automated dogfooding / adversarial stress testing.

