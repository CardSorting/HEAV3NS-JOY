<!-- [LAYER: UI] -->
# CI & Tooling Integration

`joy-check` exits **non-zero only on blocking violations**, so it is safe as a required check. Pick the integration that matches your platform.

## GitHub Actions

Copy [`../configs/github-action.yml`](../configs/github-action.yml) to `.github/workflows/joyzoning.yml`. It emits inline annotations, a Markdown job summary with a Mermaid graph, and a SARIF report.

To show findings in the **Security** tab, upload the SARIF:

```yaml
permissions:
  contents: read
  security-events: write
steps:
  - uses: actions/checkout@v4
  - run: node ./bin/joy-check.mjs . --sarif > joyzoning.sarif
  - uses: github/codeql-action/upload-sarif@v3
    with: { sarif_file: joyzoning.sarif }
```

This repository's own pipeline ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) is a worked example: a Node 18/20/22 matrix plus macOS and Windows, a conformance job, package hygiene, SARIF upload, and a single `CI required checks passed` job. Mark that job as the required status check in branch protection so the matrix can change without touching settings.

## GitLab CI

```yaml
joyzoning:
  image: node:20
  script:
    - node ./bin/joy-check.mjs . --format junit > joyzoning.xml
  artifacts:
    when: always
    reports:
      junit: joyzoning.xml
```

## Git hooks

```bash
cp configs/pre-commit-hook.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

Set `HEAV3NS_JOY_BIN` if `joy-check.mjs` lives outside the repository root. Teams using Husky can call `node ./bin/joy-check.mjs . --theme strict` from `.husky/pre-commit`.

## Editors and agents

| Consumer | Format |
| :--- | :--- |
| LSP-style diagnostics | `--format lsp` |
| Token-lean agent output | `--format compact`, or `--phase pre-edit --scope <file> --neighborhood 1` |
| Test dashboards | `--format tap` or `--format junit` |
| Log pipelines | `--format ndjson` |
| Code scanning | `--sarif` |

Full flag reference: [api/cli.md](api/cli.md).

## Adopting gradually

Start with `--theme relaxed` or list legacy paths in `.joyignore`, get CI green, then tighten. See [`spec/04-ENFORCEMENT-AND-LENIENCY.md`](../spec/04-ENFORCEMENT-AND-LENIENCY.md).

## Recommended branch protection

- Require the `CI required checks passed` status.
- Require a pull request and CODEOWNERS review.
- Dependabot keeps pinned action versions current ([`.github/dependabot.yml`](../.github/dependabot.yml)).
