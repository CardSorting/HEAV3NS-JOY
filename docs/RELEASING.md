<!-- [LAYER: UI] -->
# Releasing

Releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

1. **Prepare.** Ensure `main` is green: `npm run verify`.
2. **Changelog.** Rename `## [Unreleased]` in [CHANGELOG.md](../CHANGELOG.md) to `## [X.Y.Z] - YYYY-MM-DD` and add a fresh empty `[Unreleased]` section.
3. **Version.** Bump `version` in `package.json`. If the public API export count, zone count, or any figure changed, update the published numbers in [README.md](README.md) and [papers/companion-brief.md](papers/companion-brief.md); `npm run docs:check` fails on drift.
4. **Commit and tag.**
   ```bash
   git commit -am "release: vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --tags
   ```
5. **Automation.** [`release.yml`](../.github/workflows/release.yml) verifies the tag matches `package.json`, re-runs tests, audit, and docs check, then publishes a GitHub Release using the changelog section as notes.

## Versioning guide

| Change | Bump |
| :--- | :--- |
| Removed/renamed export, CLI flag, or violation code; stricter blocking rule | Major |
| New rule (advisory), format, language, flag, or export | Minor |
| Bug fix, docs, internal refactor | Patch |
