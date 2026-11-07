<!-- [LAYER: UI] -->
# Spreading Joyzoning

Ready-to-use material for getting Joyzoning into a team, a repository, or an agent's context. Everything here is copy-paste.

## 1. Adopt in a repo (5 minutes)

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git ~/HEAV3NS-JOY
cd /path/to/your/repo
node ~/HEAV3NS-JOY/bin/joy-check.mjs . --init                 # config + .joyignore
node ~/HEAV3NS-JOY/bin/joy-check.mjs . --heal --dry-run       # preview header fixes
node ~/HEAV3NS-JOY/bin/joy-check.mjs . --theme relaxed        # first audit, gentle
cp ~/HEAV3NS-JOY/templates/AGENTS.adopter.md ./AGENTS.md      # teach agents and newcomers
```

Then gate it in CI ([CI_INTEGRATION.md](CI_INTEGRATION.md)) and tighten to `strict` when ready.

## 2. Hand it to an AI agent

Paste into any coding agent's chat (no plugin needed):

> Read AGENTS.md in this repository and follow it. Before editing a file, run `node ~/HEAV3NS-JOY/bin/joy-check.mjs . --phase pre-edit --scope <file> --neighborhood 1 --format compact`. After editing, run it with `--phase post-edit`. Every new file needs a `[LAYER: <ZONE>]` header matching its folder. Fix blocking findings using `--explain <code>`; do not weaken the configuration.

To adopt Joyzoning in a new repo with an agent:

> Study https://github.com/CardSorting/HEAV3NS-JOY (start with README.md and AGENTS.md). Apply Joyzoning to this repository: map folders to zones, add `[LAYER]` headers, fix blocking violations, and add the audit to CI. Show me the plan first.

## 3. Explain it to people

| Audience | Pitch (one breath) |
| :--- | :--- |
| **Engineer** | Every file declares one of five zones; a tiny checker fails the build when imports cross a forbidden boundary or form a cycle. |
| **Tech lead** | It turns "keep the architecture clean" from a review chore into an automated check, with no new dependencies. |
| **Engineering manager / stakeholder** | Less architectural rot, faster onboarding, and AI-generated code that is held to the same structure as human code. |
| **Agent builder** | A repository-native protocol agents can read in 60 seconds and verify with one command; no harness lock-in. |
| **Skeptic** | It blocks only structural faults (cycles, layer leaks, domain I/O); everything else is advisory. Try `--theme relaxed` on a branch. |

### Analogy

A restaurant has a kitchen (**domain**: the recipes and rules), a pass-through that coordinates orders (**core**), suppliers and delivery drivers (**infrastructure**), the dining room (**ui**), and shared utensils (**plumbing**). The kitchen never phones the supplier mid-recipe and the dining room never walks into the pantry. Joyzoning labels every file with its room and checks that nobody takes a forbidden door.

## 4. Show your adoption

Add a badge to your README:

```markdown
[![Joyzoned](https://img.shields.io/badge/architecture-Joyzoned-blueviolet)](https://github.com/CardSorting/HEAV3NS-JOY)
```

Only claim it when `joy-check` exits `0` in your CI.

## 5. One-page cheat sheet

```
ZONES    DOMAIN  CORE  INFRASTRUCTURE  PLUMBING  UI
HEADER   [LAYER: <ZONE>] in first 10KB, matching the folder
DIRECTION  ui -> core -> domain <- infrastructure ;  plumbing imports nothing
DOMAIN   zero I/O      PLUMBING  stateless      UI  never imports infrastructure
IMPORTS  max 3 "../"   no cycles   core uses I<Name> from domain/interfaces
EXIT     0 pass  1 violations  2 bad invocation
HELP     joy-check --explain <SPI-xxx>
```

## 6. Make it easy to find

- Keep `AGENTS.md` at your repo root and, if you like, an [`llms.txt`](../llms.txt) modeled on this repository's.
- Link this repository from your `CONTRIBUTING.md`.
- Suggested GitHub topics: `joyzoning`, `software-architecture`, `ai-agents`, `agents-md`.
