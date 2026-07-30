# SquatchSmash Consolidation Handoff

Last updated: 2026-07-29  
GitHub: <https://github.com/LouSputthole/SquatchSmash>  
Canonical integration branch: `integration/post-airstrip-prep-20260729`  
Character-canon checkpoint: `9fb3022`

This file is the pickup point for another Codex session. Do not resume from
`main`; `main` is still the old standalone Squatch Smash game. Read this file,
`README.md`, and `docs/CHARACTER-ALIGNMENT.md` before editing.

## Safe pickup

```powershell
git fetch origin
git switch integration/post-airstrip-prep-20260729
git pull --ff-only
npm test
npm run check
```

Do not force-push or merge this branch into `main` yet. The airstrip/beef-run
runtime still has to be integrated and the complete story path has not passed
end-to-end verification.

## What is already consolidated

- Squatch Life apartment is the recurring hub and production root.
- Day One chore gate, Big Uncle Lou's one-shot call, Bada Bing Scene One,
  concealed package persistence, Squatchfather, apartment return, sleep, and
  Day Two wake state are connected through the versioned campaign boundary.
- Booskibro's Day Two call and Captain Lou Sasole's distinct identity/state are
  connected to the airstrip mission contract.
- The post-airstrip apartment state, Big Uncle Lou's second call, reused Bada
  Bing Scene Two, direct Jerky Motel handoff, Motel completion, and apartment
  return are implemented.
- Squatchfather, Motel, and Initiation history/content are preserved without
  overwriting the apartment-era shared systems.
- Squatch Smash is an apartment-computer game with its enhanced goals, Ranger
  Captain boss, rank, career progression, and verified clean exit.
- Standalone scene boot failures show Reload and Apartment recovery.
- Scene/spawn validation, atomic transitions, failed-navigation rollback, and
  browser-storage fallback are implemented.

The focused history immediately before this handoff is:

```text
9fb3022 Align campaign character canon
ae9deef Show recovery UI when standalone scenes fail
7afbea4 Harden campaign scene transitions
a4487bf Preserve Initiation for character alignment
d5984c5 Merge Initiation scene history
f5fa467 Verify the enhanced Squatch Smash loop
560a277 Verify and fix apartment computer exits
```

## Approved character canon

`docs/CHARACTER-ALIGNMENT.md` is authoritative. The important locked decisions
are:

- Tony Squatchtana is Prospect's full name.
- Tony is human. He is a biker-gang-style prospect trying to join the Sasquatch
  family; membership changes at Initiation, not species.
- Big Uncle Lou Sputthole is the Lou at the Bing.
- Captain Lou Sasole is a separate person and is Initiation's former `sasole`.
- Booskibro is the subtitle/display name; `booski` remains the stable save and
  voice-bank key.
- Every Circle member is human.
- Supplied named face photos are authoritative.
- The founders are Booskibro, Big Uncle Lou Sputthole, Rippinflow, The
  Shubenator, and DeathMegatron.
- Prospect One's execution and explicit gore remain canonical.

Commit `9fb3022` enforces those decisions in the registry, apartment calls and
messages, Motel, Initiation, tests, and story documents. Tony now uses the
shared human `src/core/person.js` rig in Motel and Initiation. The obsolete
Initiation-only sasquatch transformation rig was removed from production; its
history remains in Git. Initiation awards member colors and a red bandana while
Tony remains human.

## Protected beef-run work

The unfinished beef-run work must not be overwritten. At the last check it was
in this local worktree:

```text
worktree: work/SquatchSmash-integration
branch: integration/apartment-story-spine-20260729
HEAD and origin: 21894efcc99d4400bb398bf529bcb2886e3d10e1
modified: tests/run.mjs
untracked: src/airstrip/aircraft.js
untracked: src/airstrip/flight.js
untracked: src/airstrip/world.js
untracked: tests/flight-model.test.mjs
```

Those uncommitted files belong to the beef-run developer. Do not clean, move,
stage, commit, or edit them. When the user says the beef run is finished:

1. Fetch the branch and identify its new committed tip.
2. Inspect the full diff and run its own tests in an isolated worktree.
3. Reconcile it with the campaign contract in `src/airstrip/mission.js` and
   `src/core/airstrip-story.js`.
4. Integrate the committed runtime into
   `integration/post-airstrip-prep-20260729`.
5. Verify apartment → airstrip → apartment → Bing Two → Motel in a real browser.

## Verification at this checkpoint

Fresh checks after the character-canon work:

```text
npm test                  48/48 passed
npm run check             133 source files, 4 manifests, all good
npm run verify:day-one    11/11 passed
npm run verify:day-two    11/11 passed
npm run verify:motel       9/9 passed
npm run verify:initiation 10/10 passed
```

The branch also has focused verifiers for the Bing visits, Squatchfather,
computer applications, Squatch Smash, art geometry, and boot failures. Re-run
all of them after the beef runtime lands and before any merge to `main`.

## Repository Three.js skills

The project contains ten repository-specific Claude skills under
`.claude/skills/` and they are in use as engineering guidance:

- `threejs-animation`
- `threejs-fundamentals`
- `threejs-geometry`
- `threejs-interaction`
- `threejs-lighting`
- `threejs-loaders`
- `threejs-materials`
- `threejs-postprocessing`
- `threejs-shaders`
- `threejs-textures`

Keep following them when changing cameras, input ownership, scene teardown,
materials, lighting, post-processing, loaders, and asset lifecycles. Use the
TDD skill for campaign/state/runtime work.

## Next implementation sequence

1. Add save corruption recovery and explicit schema migrations on the clean
   integration branch while the beef work is still protected.
2. Integrate the finished beef-run commit only after its branch is clean and
   independently verified.
3. Connect the real airstrip runtime to apartment departure and return.
4. Add the final apartment return/big-night call and route Initiation through
   normal campaign state.
5. Design and implement Initiation's final ending/chapter-complete checkpoint.
6. Run the entire waking-apartment-through-Initiation acceptance path, including
   reloads at every apartment return.
7. Only after zero P0 failures, prepare a reviewed merge into `main`.

## Design questions to resolve with the user

The character picture is now understood. These remaining choices affect
implementation and should be reviewed before the final Initiation wiring:

1. Squatchfather dialogue says Sal's side “shot Booskibro,” but Booskibro calls
   Tony on Day Two. Was Booskibro wounded and recovered, and should the game
   show or mention that injury?
2. After successful Initiation, is the canonical endpoint the free-roam forest
   party, a short party followed by chapter credits, or an immediate
   chapter-complete card/return?
3. Manny is currently presented as a literal sasquatch in Motel. Is Manny also
   a human family member, or is he intentionally a literal sasquatch outside
   the all-human Circle?
4. Should Bing subtitles always say `Big Uncle Lou`, or may close associates
   simply call/display him as `Lou` inside the club?
5. What authoritative face/clothing should Tony use when his visible model is
   on screen? His human rig is now consistent, but his final face and outfit
   have not been selected.

Do not generate replacement faces, voices, or models until those decisions are
answered.
