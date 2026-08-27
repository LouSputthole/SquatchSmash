# SquatchSmash agents

Before changing this repository, read [CLAUDE.md](CLAUDE.md),
[BEFORE-YOU-PUSH.md](BEFORE-YOU-PUSH.md), and the repository skill at
[.agents/skills/squatchsmash-game-development/SKILL.md](.agents/skills/squatchsmash-game-development/SKILL.md).

The campaign bible is the story authority. Preserve the no-build Three.js
architecture, search `src/core/` before adding a scene-local system, and prove
player-facing changes in the real scene through the real interaction path.

Use the narrowest relevant checks first. Before committing, run every gate
required by `.github/workflows/verify.yml` and every changed scene's verifier.
Report the commands that actually ran and their results; do not infer coverage
from a green subset.
