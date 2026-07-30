# SquatchSmash Consolidation Handoff

Last updated: 2026-07-29  
GitHub: <https://github.com/LouSputthole/SquatchSmash>  
Canonical integration branch: `integration/post-airstrip-prep-20260729`  
Character-canon checkpoint: `9fb3022`
Prior published handoff checkpoint: `9ed9693`
Current handoff checkpoint: the latest remote tip of the canonical integration
branch; verify it with `git rev-parse origin/integration/post-airstrip-prep-20260729`

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
- Campaign save schema v2 explicitly migrates v1 saves, preserves malformed or
  future-version data in a recovery journal, visibly warns the player, and
  refuses unsafe scene transitions when persistence fails.
- Campaign time is event-driven. Real waiting no longer moves story time;
  first-time tasks, calls, travel, missions, and sleep own named idempotent
  clock events. Day One starts at 6:04 AM and the first Bing travel event lands
  at 11:41 PM. Calendar day and story chapter are separate.
- `preview.html` unlocks later scenes in page-local memory without reading or
  writing the player's canonical campaign save.
- The July 29 apartment, computer, Squatchfather, Bada Bing, and Motel
  playtest-fix pass is implemented and covered by focused browser verifiers.

The focused implementation history in this handoff is:

```text
c6857df Rebuild Motel first-person layout
f9e8443 Polish Bada Bing runtime
a3d3d69 Fix Squatchfather entry controls
62088c7 Harden apartment campaign and preview flow
9ed9693 Document consolidation handoff
9fb3022 Align campaign character canon
```

## Approved character canon

`docs/CHARACTER-ALIGNMENT.md` is authoritative. The important locked decisions
are:

- Tony Squatchtana is Prospect's full name.
- Tony is human throughout the pre-Initiation campaign. He is a
  biker-gang-style prospect trying to join the Sasquatch family.
- Big Uncle Lou Sputthole is the Lou at the Bing.
- Captain Lou Sasole is a separate person and is Initiation's former `sasole`.
- Booskibro is the subtitle/display name; `booski` remains the stable save and
  voice-bank key.
- Every Circle member presents as human before the final verdict.
- Supplied named face photos are authoritative.
- The founders are Booskibro, Big Uncle Lou Sputthole, Rippinflow, The
  Shubenator, and DeathMegatron.
- Prospect One's execution and explicit gore remain canonical.
- Manny is an adult human and Tony's friendly Motel ally. Friendly faction is a
  hard AI/targeting boundary, not a dialogue convention.
- The approved future ending reviews Tony's campaign accomplishments, kills
  every failed rival prospect, admits Tony only when the required campaign work
  is complete, and then visibly transforms Tony and every recognized family
  member into literal sasquatches.

Commit `9fb3022` enforces the pre-Initiation identity decisions in the registry,
apartment calls and messages, Motel, Initiation, tests, and story documents.
Tony now uses the shared human `src/core/person.js` rig in Motel and Initiation.
The old literal transformation rig remains recoverable from Git history at
`ae9deef:src/initiation/sasquatch.js`. Do not restore it yet: the user wants to
playtest the current Initiation unchanged before the ending rewrite.

## Authored campaign time

`src/core/campaign.js` is the only story-clock authority. `story.timeEvents`
records which named beats have applied so replaying an interaction cannot farm
time. `src/core/authored-clock.js` and `DayNight` project saved time into
lighting and clocks while real frame time continues to drive movement,
animation, dialogue, combat, physics, minigames, and audio.

Current authored beats:

| Beat | Change |
|---|---:|
| Eat, first completion | +20 minutes |
| Shower, first completion | +15 minutes |
| Poop, first completion | +10 minutes |
| Change clothes, first completion | +5 minutes |
| Optional email reply, first completion | +10 minutes |
| Big Uncle Lou's first answered call | +3 minutes |
| Leave for Bada Bing Scene One | Advance to at least Day 1, 11:41 PM |
| Booskibro's answered call | +5 minutes |
| Big Uncle Lou's second answered call | +5 minutes |

The first Bing HUD now reads the persisted campaign clock instead of a
scene-local timer. Remaining mission and travel beats should extend the same
ledger. The user explicitly permits additional days before Initiation; do not
compress every mission into a two-day deadline merely to preserve the old
fifteen-real-minute-day design.

## July 29 playtest-fix pass

### Apartment and computer

- Frying eggs retain their authored flattened scale instead of replacing the
  stove with giant spheres.
- The newest fridge sticker is on the door, the kitchen picture is on the
  cabinet face, the bathroom door closes flush on its real hinge, and the
  monitor neck stays behind the display.
- The apartment revolver is absent before Lou's first package and remains
  unlocked on later returns after `packageReceived`, even after the parcel is
  consumed by the story.
- Big Uncle Lou's incoming call explicitly says: press `E` to pick up the phone,
  then `E` to answer.
- Mail has a visible mouse cursor and clickable inbox rows. Framed apps receive
  direct DOM input; every app shows `TAB = EXIT TO DESKTOP`.
- DOOM starts `E1M1`, not attract-mode demo input. Squatch Smash has a compact
  960x540 menu with an on-screen `START RAMPAGE`, pauses when Tony stands, and
  restores when he sits again.

### Squatchfather

- Tony spawns on the clear sidewalk facing the restaurant, outside every car
  collider.
- `W` and `S` now match the camera's forward/backward directions.

### Bada Bing

- The opaque vestibule skin no longer blocks the open front doorway.
- All eighteen vehicles are separated, grounded, centered, and use
  rotation-aware colliders plus collision-clear driver/exit poses.
- Car/table exits share validated safe-standing logic. `Q` while walking is a
  safe unstuck action.
- Drinkers use seated poses; movers update at 30 Hz and respect colliders;
  nonhero NPC shadows are disabled.
- Four adult female performers use the dedicated curvy, non-nude bikini
  profile.
- Rain is door/room-aware and cached. Post-processing samples frame time again.
  Shadow casters fell from about 3,297 to 2,239 in the verification capture.

### Jerky Motel

- Every walkable and getaway phase uses first-person presentation.
- Manny is a human friendly-faction ally. Friendly actors cannot become
  hostile, chase/grab Tony, damage Tony, or be selected by Tony's attacks.
- East stairs, the second car, parking paint, pool deck/furniture, wall gap,
  and four-step floor heights are re-authored and measured.
- Room 12 and bathroom staging use a human-scale `0.42m` player radius with
  collision-clear character and recovery positions. Restoring `0.80m` would
  require a layout redesign.
- The passenger-seat camera, capture recovery, mattress world placement, and
  clerk spawn have dedicated regression assertions.

### Safe preview

Open <http://localhost:5173/preview.html> for Motel, Bing Scene Two,
Squatchfather, or the unchanged Initiation reference. Preview campaign state is
in-memory and page-local. It never reads, migrates, overwrites, or advances the
canonical browser save.

The final Bada Bing and Motel captures are committed under
[`docs/validation/2026-07-29/`](./validation/2026-07-29/README.md), including
the front portal, vehicle lot, performers, first-person Motel views, human
Manny, corrected pool, Room 12, and capture recovery.

## Finished Beef Run branch awaiting integration

The Beef Run is committed on its own remote branch and has been audited without
merging it:

```text
branch: origin/claude/beef-run-mission-di1vq9
tip: f4ed391
commits:
  f4ed391 Grade centreline landing
  11d51ed Add per-line Beef Run VO cues
  ed9ab27 Build the full Beef Run mission
  58406b6 Implement the flight model
```

Its isolated branch passed `npm run check:flight`, `npm run check`, and a real
browser boot/start through the arrival objective with no console errors. It
forks from Squatch Life commit `570d05c`, not this integration branch, so do
not merge the branch wholesale.

Integration procedure:

1. Import `beefrun.html`, `src/beefrun/*`, `tools/beefrun-vo.mjs`, and
   `tools/flight-test.mjs`.
2. Manually reconcile package scripts, voice manifest cues, and check/audio
   tooling rather than overwriting the integration versions.
3. Adapt the Beef terrain hook from `player.groundAt = terrainHeight` to the
   integration runtime's existing `world.groundAt = terrainHeight`.
4. Connect Booskibro's call and `captain_lou_sasole`, campaign checkpoints,
   authored time, preview mode, mission completion, and apartment return.
5. Verify apartment → Beef Run → apartment → Bing Two → Motel in a real browser.

## Verification at this checkpoint

Fresh checks on the complete July 29 milestone:

```text
npm test                       66/66 passed
npm run check                  137 source files, 4 manifests, all good
npm run verify:art             50 pieces, 4 bathroom, 12 fridge, 2 doors
npm run verify:day-one         19/19 passed
npm run verify:day-two         11/11 passed
npm run verify:computer        18/18 passed
npm run verify:squatch-smash    8/8 passed
npm run verify:bing            46/46 passed
npm run verify:bing-two        10/10 passed
npm run verify:squatchfather   19/19 passed
npm run verify:motel           27/27 passed
npm run verify:initiation      10/10 passed
npm run verify:preview         14/14 passed
npm run verify:boot-errors      6/6 passed
npm run bundle                 built dist/squatch-apartment.html (15.87 MB)
```

The single-file bundle is a constrained preview artifact: its configured size
budget omitted seven music tracks and 436 voice clips, so the normal hosted
runtime remains the authoritative audio experience. Re-run every focused
verifier after the Beef runtime lands and before any merge to `main`.

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
TDD skill for campaign/state/runtime work. The current playtest pass read and
applied `threejs-geometry` to bounds/collider verification and
`threejs-interaction` to first-person input, pointer lock, targeting, and safe
interaction volumes. These are engineering references only; no skill code is
imported into the shipped game.

## Next implementation sequence

1. Selectively integrate the verified Beef Run branch into the canonical
   runtime; do not merge its older Squatch Life base wholesale.
2. Connect the real Beef Run to Booskibro's call, Captain Lou Sasole, authored
   time, checkpoints, preview mode, apartment departure, and apartment return.
3. Extend the authored time ledger across each existing mission/return beat.
4. Add the final apartment return/big-night call and route the current
   Initiation through normal campaign state without rewriting it.
5. After the user playtests Initiation, design and implement the approved
   accomplishment review, rival deaths, mass transformation, and
   chapter-complete checkpoint.
6. Run the entire waking-apartment-through-Initiation acceptance path, including
   reloads at every apartment return.
7. Only after zero P0 failures, prepare a reviewed merge into `main`.

## Design questions to resolve with the user

The character picture is now understood. These remaining choices affect
implementation and should be reviewed before the final Initiation wiring:

1. Squatchfather dialogue says Sal's side “shot Booskibro,” but Booskibro calls
   Tony on Day Two. Was Booskibro wounded and recovered, and should the game
   show or mention that injury?
2. After the user playtests the current Initiation, decide how the transformed
   ending resolves: free-roam forest party, short party plus credits, or an
   immediate chapter-complete card.
3. Should Bing subtitles always say `Big Uncle Lou`, or may close associates
   simply call/display him as `Lou` inside the club?
4. What authoritative face/clothing should Tony use when his visible model is
   on screen? His human rig is now consistent, but his final face and outfit
   have not been selected.

Do not generate replacement faces, voices, or models until those decisions are
answered.
