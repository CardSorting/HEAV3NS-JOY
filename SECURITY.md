<!-- [LAYER: UI] -->
# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| **1.0.x** (current) | Yes — active security and structural verification patches |
| Older / fork builds | At maintainer discretion |

Package: **`heav3ns-joy`** · License: [MIT](LICENSE) · Documentation: [docs/SECURITY_BEST_PRACTICES.md](docs/SECURITY_BEST_PRACTICES.md)

---

## Reporting a vulnerability

If you discover a security vulnerability in **HEAV3NS-JOY**:

1. **Private Advisory:** Open a private security advisory in the hosting repository (preferred) or contact the maintainers privately before filing any public issue.
2. **Include:**
   - Detailed description of the vulnerability and affected component (`SpiderEngine`, `NodeCasStorage`, `JoyRideCache`, `BroccoliRuntime`, etc.)
   - Minimal reproduction steps or proof-of-concept test case
   - Potential impact and affected version (`1.0.x`)
3. **Do not** disclose the issue publicly until maintainers acknowledge and coordinate a release.

We aim to acknowledge vulnerability reports within **5 business days**.

---

## Scope & Defense-in-Depth Architecture

**HEAV3NS-JOY** enforces strict security invariants at the code and substrate levels:

### In scope

- **Supply-Chain Isolation (`0` dependencies)**: Any external runtime dependency introduced into `package.json` is treated as a critical supply-chain violation.
- **Content-Addressable Storage (`src/infrastructure/NodeCasStorage.mjs`)**:
  - Strict regex validation (`/^[a-f0-9]{64}$/i`) on all CAS hash identifiers to prevent path traversal (`../`).
  - Cryptographic SHA-256 verification on read with automatic quarantine (`<hash>.corrupt.<timestamp>`) on bit-rot or tampering.
  - Crash-safe atomic write-temp-and-rename (`.tmp.<pid>.<ts>.<rand>`).
- **Context Cache Secret Guard (`src/core/JoyRideCache.mjs`)**:
  - Automatic rejection (`JR-SEC-001`) of content containing PEM private keys (`-----BEGIN ... PRIVATE KEY-----`), AWS access keys (`AKIA...`), GitHub tokens (`ghp_...`, `github_pat_...`), Slack tokens (`xox...`), or bearer credentials unless `allowSecrets: true` is explicitly configured.
- **Static Security SAST Rules (`src/domain/joyRules.mjs`)**:
  - `SPI-401`: Dynamic code execution (`eval()`, `new Function()`, string-based `setTimeout`/`setInterval`).
  - `SPI-402`: Unsanitized HTML injection (`innerHTML =`, `outerHTML =`, `dangerouslySetInnerHTML`).
  - `SPI-403`: Hardcoded credentials and high-entropy secrets in source files.
- **BroccoliDB Execution Modes & Policies (`src/domain/broccoliRules.mjs`, `src/core/BroccoliRuntime.mjs`)**:
  - `readonly`, `recovery`, and `forensic` modes strictly block state mutations (`BRC-205`).
  - `ApprovalPolicy` (`always`, `never`, `on-failure`, `unless-trusted`) gates action execution (`BRC-206`).

### Out of scope

- Vulnerabilities in a downstream consumer's third-party dependencies or external LLM API providers.
- Vulnerabilities in Node.js itself (report upstream to the Node.js Security team).

---

## Safe use recommendations

- Run `node ./bin/joy-check.mjs . --theme strict` in CI to block `SPI-401..403` security violations before merge.
- Configure `.joyignore` to exclude sensitive local directories (`.env*`, `credentials/`, keys) from workspace scans.
- Use `readonly` or `forensic` mode in `BroccoliRuntime` when inspecting untrusted causal timelines.
- Read the full operational guide in [docs/SECURITY_BEST_PRACTICES.md](docs/SECURITY_BEST_PRACTICES.md).
