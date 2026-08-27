---
name: squatchsmash-game-development
description: Implement, debug, or verify SquatchSmash game, campaign, scene, rendering, audio, geometry, or presentation work in this repository.
---

# SquatchSmash game development

Use this workflow for repository engineering. Keep evidence proportional to
the player-facing risk and report what was observed rather than assumed.

## Establish authority

1. Read `CLAUDE.md` completely.
2. Read the relevant scene documentation and `docs/CAMPAIGN-STORY-BIBLE.md`
   when story, route, timing, dialogue, or continuity is involved.
3. Read `.github/workflows/verify.yml`; it is the gate authority.
4. Read `docs/ENGINE-TRAPS.md` and `docs/RIGHT-FIRST-TIME.md` for browser,
   audio, geometry, route, save, or verifier work.
5. Search `src/core/` before creating a scene-local implementation.

Classify the work as one or more of: story, state, interaction, geometry,
combat, audio, animation, rendering, or presentation. Use that classification
to choose the shared systems, tests, scene verifier, and evidence required.

## Implement and prove

1. Run narrow unit or contract tests before broad tests.
2. Start the actual scene in a browser.
3. Exercise the real player interaction path. Do not use `debugUse()` or a
   direct handler call as proof that aiming, range, prompts, input, and state
   gating work.
4. Capture active-play visual evidence at a deterministic checkpoint when the
   change is visible.
5. Inspect console errors, page errors, failed requests, WebGL context loss,
   and scene readiness.
6. For rendering defects, use the development-only Spector.js MCP described in
   `docs/engineering/SPECTOR-MCP.md`; record the selected canvas, captured
   frame, draw-call count, relevant shader/material or GL state, and WebGL
   errors before and after.
7. Run the changed scene's real verifier. Update an obsolete verifier in the
   same change instead of accepting a disconnected red tool.
8. Run the required full gates in `.github/workflows/verify.yml` before
   committing. Run the campaign marathon whenever route, scene graph, exits,
   calls, clock ownership, handoffs, or save-backed story state changes.
9. When authored dialogue changes, regenerate and check dialogue, VO, take,
   recording, and audio ledgers using the scripts registered in `package.json`.

Finish with the exact commands run, observed browser path, captured evidence,
errors inspected, and any unverified risk. Use `BEFORE-YOU-PUSH.md` as the final
short checklist.

