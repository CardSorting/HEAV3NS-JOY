<!-- [LAYER: UI] -->
# PM-002: Multi-Process WAL Contention & Orphaned `.joy-lock` Deadlocks After Worker Crash

<p align="center">
  <a href="README.md">Postmortems Hub</a> ·
  <a href="../README.md">Docs Hub</a> ·
  <a href="../adr/0006-portable-trinity-and-shell-json-contract.md">ADR-0006</a> ·
  <a href="../playbooks/trinity-lock-and-wal-recovery.md">Playbook PB-02</a>
</p>

- **Incident ID**: `PM-002`
- **Date**: `2026-04-08`
- **Severity**: `SEV-1` (State Contention & Lock Availability)
- **Status**: Resolved
- **Affected Zones**: `INFRASTRUCTURE` (`FileRootLock.mjs`), `UI` (`bin/joy-trinity.mjs`, `src/portable.mjs`)
- **Related ADR & Playbook**: [ADR-0006](../adr/0006-portable-trinity-and-shell-json-contract.md) · [Playbook PB-02](../playbooks/trinity-lock-and-wal-recovery.md)

---

## Summary

When multiple parallel agent sub-processes invoked `node bin/joy-trinity.mjs db push` and `swarm report` simultaneously against the same `--root ./.joy-state` directory, concurrent WAL replay and checkpoint writes raced on disk. Furthermore, when a test killed a worker process mid-command (`SIGKILL` / `SIGINT`), a naive lock file remained on disk indefinitely, blocking all subsequent `joy-trinity` invocations with a permanent lock timeout.

## Root cause

1. **Why did concurrent `joy-trinity` processes race on the WAL?** Each CLI invocation is an independent OS process; in-memory mutexes (`AsyncMutex.mjs`) only serialize callers within a single Node.js process.
2. **Why did adding a basic lock file cause permanent deadlocks on crash?** When a process holding the lock file was killed or interrupted (`Ctrl-C` / `SIGTERM`), its `finally` block did not run before process exit unless signal handlers were installed, and `SIGKILL` cannot be caught at all.
3. **Why wasn't the stale lock reclaimed by the next invocation?** The initial lock file did not record `{ pid, host, token, startedAt }` or probe OS process liveness via `process.kill(pid, 0)`.
4. **Why could `stop()` leave the lock behind if a flush step threw?** If `db.stop()` threw `ShadowCommitError` or an I/O error during shutdown, early returns skipped `lock.release()`.
5. **What invariant was missing?** Cross-process atomic lock acquisition (`fs.openSync(path, "wx")`) with same-host dead-PID reclamation, signal-safe drain-and-unlock handlers, and fault-isolated shutdown steps.

## Action items

| Action | Type | Code / Test Reference | Status |
| :--- | :--- | :--- | :---: |
| Implement `FileRootLock` (`.joy-lock`) with atomic `wx` create, jittered backoff, and same-host dead-PID reclamation (`process.kill(pid, 0)`) | Preventative | [`src/infrastructure/FileRootLock.mjs`](../../src/infrastructure/FileRootLock.mjs) | Done |
| Guarantee `createPortableBroccoli.stop()` attempts every shutdown step and always releases `.joy-lock` even if an earlier step throws | Preventative | [`src/portable.mjs`](../../src/portable.mjs) | Done |
| Install `SIGINT` / `SIGTERM` handlers in `bin/joy-trinity.mjs` to flush accepted writes and unlock before exiting (`130` / `143`) | Preventative | [`bin/joy-trinity.mjs`](../../bin/joy-trinity.mjs) | Done |
| Add `joy-trinity doctor` lock holder inspection and 8-process parallel stress tests + dead-PID lock reclamation tests | Verification | [`tests/joy-trinity-cli.test.mjs`](../../tests/joy-trinity-cli.test.mjs), [`tests/trinity-hardening.test.mjs`](../../tests/trinity-hardening.test.mjs) | Done |

## Lessons learned

- **What went well**: `process.kill(pid, 0)` in Node.js provides a zero-dependency POSIX/Windows way to verify whether a lock holder PID on the same hostname (`os.hostname()`) is still alive (`ESRCH` = dead, `EPERM` = alive under another user).
- **What went wrong**: Assuming `try / finally` alone is sufficient for cross-process file locks in CLI tools where users and harnesses routinely send `SIGINT`, `SIGTERM`, or `SIGKILL`.
- **Permanent rule**: *Every cross-process lock must be self-healing when its local holder PID dies, and every shutdown sequence must release locks in an unconditional final step.*

