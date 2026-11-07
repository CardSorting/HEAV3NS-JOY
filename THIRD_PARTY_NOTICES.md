<!-- [LAYER: UI] -->
# Third-Party Notices

HEAV3NS-JOY itself is MIT-licensed and has **zero npm dependencies**. The portable
Broccoli Trinity embeds source (not packages) from two sibling projects by the same
author, under their original licenses. `BufferedDb`, `AgentSwarm`, and the `joy-trinity` CLI are original to this repository (project license). Each embedded directory ships its license text.

| Embedded source | Location | Upstream | License |
|-----------------|----------|----------|---------|
| BroccoliDB kernel (`@noorm/broccolidb` 3.0.0) | [`src/infrastructure/broccolidb/`](src/infrastructure/broccolidb/index.mjs) | CardSorting/ABroccoliDB | Apache-2.0 ([LICENSE](src/infrastructure/broccolidb/LICENSE), [NOTICE](src/infrastructure/broccolidb/NOTICE)) |
| BroccoliQueue (`broccoli-queue` 0.1.0) | [`src/infrastructure/broccoliqueue/`](src/infrastructure/broccoliqueue/index.mjs) | BroccoliQueue | MIT ([LICENSE](src/infrastructure/broccoliqueue/LICENSE)) |

## Modifications

- **BroccoliDB / BroccoliQueue**: TypeScript was compiled to ES2022 ESM (`.mjs`), type-only
  declarations were dropped, `[LAYER: INFRASTRUCTURE]` headers were added, relative import
  specifiers were retargeted to `.mjs`, and `queue.mjs` was split into `queue.mjs`,
  `queue-worker.mjs`, and `queue-helpers.mjs` (no behavior change). The BroccoliQueue
  dashboard asset moved to `src/infrastructure/broccoliqueue/dashboard/index.html`.
  The upstream BroccoliDB and BroccoliQueue test suites run unchanged against the embedded
  copies (`tests/broccolidb*.test.mjs`, `tests/broccoliqueue.test.mjs`).
