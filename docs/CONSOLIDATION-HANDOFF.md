# SquatchSmash Consolidation Handoff

Last updated: 2026-07-31
GitHub: <https://github.com/LouSputthole/SquatchSmash>
Production branch: `main`
Current published checkpoint: `d49a506ef70cab9727fa0267e8ed012cad3ff0d5`
Live Pages: <https://lousputthole.github.io/SquatchSmash/>
Current handoff checkpoint: `origin/main`; the previous integration and
project-status refs now converge with it. Verify with `git rev-parse origin/main`.

This file is the pickup point for another Codex session. Resume from `main`,
which is the deployed canonical game. Read this file, `README.md`,
`docs/CHARACTER-ALIGNMENT.md`, and `docs/GAME-PLAN.md` before editing.

## Safe pickup

```powershell
git fetch origin
git switch main
git pull --ff-only
npm test
npm run check
```

Do not force-push `main`. Work in a focused branch and reviewed PR; merge only
after the affected gates are green. The campaign is integrated through the
current Initiation reference, whose ending rewrite remains deliberately
deferred pending the owner's playtest.

## What is already consolidated

- Squatch Life apartment is the recurring hub and production root.
- Day One chore gate, Big Uncle Lou's one-shot call, Bada Bing Scene One,
  concealed package persistence, Squatchfather, apartment return, sleep, and
  Day Two wake state are connected through the versioned campaign boundary.
- Booskibro's Day Two call and Captain Lou Sasole's distinct identity/state are
  connected to the airstrip mission contract.
- The finished Beef Run flight mission is integrated at `beefrun.html`:
  apartment departure, story-gated start, persisted checkpoints/cargo/
  detection/completion, mid-mission resume, authored travel and completion
  time, the end-card return home, and a save-isolated preview.
- The post-airstrip apartment state, Big Uncle Lou's second call, reused Bada
  Bing Scene Two, direct Jerky Motel handoff, Motel completion, and apartment
  return are implemented.
- The post-Motel sleep opens the Day 3 `date` chapter, Margo's one-shot call
  unlocks the Silver Room, the apartment door routes to `silver.html`, the
  evening folds back into campaign state, and the walk home plus a second sleep
  turns the page onto the Day 4 big night. Browser-verified end to end
  (`verify:silver-story`, 20).
- The final apartment return, the post-date sleep into the `big_night`
  chapter, Booskibro's one-shot big-night call, and the door route into the
  unchanged Initiation are implemented and browser-verified
  (`verify:big-night`, 19).
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
- Recorded Bing voice is checked as actual WebAudio playback, not merely a
  requested cue: representative door, bar, blackjack dealer, stage, and Family
  lines must decode, connect to a nonzero-gain SFX graph, and end naturally.
- The physical phone has a larger readable Bing view, explicit wheel-thread
  navigation, `[Q]` pocket behavior in the club, and campaign-derived Family
  texts. Read state uses zero-minute `phone.read.*` campaign events, so it
  persists across reloads and scene returns without a second save system.

The focused implementation history in this handoff is:

```text
c6857df Rebuild Motel first-person layout
f9e8443 Polish Bada Bing runtime
a3d3d69 Fix Squatchfather entry controls
62088c7 Harden apartment campaign and preview flow
9ed9693 Document consolidation handoff
9fb3022 Align campaign character canon
bcd5b81 Import the finished Beef Run and align its cast with campaign canon
4b055ea Connect the Beef Run to the campaign spine
```

## Latest focused verification â€” 2026-07-31

The focused audio/phone follow-up was verified against the current production
base before publication:

```text
npm test                     89/89 passed
npm run check                186 source files, 4 manifests, all good
npm run verify:bing          126/126 passed
npm run verify:squatchfather  31/31 passed
npm run verify:beefrun        22/22 passed
```

The Squatchfather verifier proves a campaign entry begins outside active car
colliders, accepts normal movement, stages/drops the weapon, resolves recorded
surface footsteps, and returns through campaign state. The Beef Run verifier
proves the full preview mission, durable checkpoints, Captain Sasole identity,
and error-free completion. The future Initiation ending remains intentionally
deferred until the owner playtests it.

## Campaign order — confirmed by the owner 2026-07-30

Apartment → Bada Bing One → apartment → Squatchfather → apartment →
Beef Run → apartment → Bada Bing Two → Jerky Motel → apartment →
**Silver Room date** → apartment → Initiation on Day 4. This matches what is
built; the owner confirmed position 9 is the Jerky Motel. Every arrow in that
chain is a real campaign transition, including the last one into the unchanged
Initiation. The owner also confirmed the previously blocked character/performer
decisions stand as originally specified (Squatchfather character style
everywhere, detailed performers, Lou's face photo without the bandana).

### The Silver Room is integrated

`silver.html` / `src/silver/*` is now **in** the campaign, at the slot the owner
ruled on 2026-07-30: **Day 3 evening**, between the Motel and the Initiation.
The Goodfellas calm-before-the-verdict beat.

- Sleeping off the Motel opens a new `date` chapter at **Day 3, 12:00 PM**.
- **Margo** rings the physical phone that afternoon (`MARGO_DATE_CALL`,
  +5 authored minutes) and unlocks `MISSION_IDS.SILVER_ROOM`.
- The apartment door routes to `SCENE_IDS.SILVER_ROOM` (`silver.html`);
  `travel.silver_room` advances to at least **Day 3, 7:30 PM**.
- `src/core/silver-story.js` gates the mission on the Motel being complete and
  her call being answered, and folds the mission's own `persist()` payload into
  campaign state. The old private `squatch.frontAndCenter` localStorage key is
  gone; nothing writes it and a verifier asserts it stays empty.
- Completion advances to at least **Day 3, 11:20 PM**; the end card's button is
  `Go Home` and navigates through `navigateCampaign`.
- Sleeping off the *date* is what finally turns the calendar: **`big_night`
  is now Day 4, waking at 10:00 AM**, Booskibro rings, ceremony at seven.

**The casting was corrected before integration.** The reference branch moved to
`48f028b` ("Recast the date and the driver: neither of them is family"), which
the owner endorsed, and it supersedes two earlier rulings:

- The date is **Margo Salas**, who runs the kitchen at the Blue Hour on
  Ashland. She is **not** Hog Mama and **not** on 97.8 — putting her on the
  family's own station put her inside the family, and you do not take the
  family on a date. She is a civilian, which is the only reason her good
  opinion costs anything to earn. There is no new radio handle; the earlier
  "invent an on-air name" instruction was dropped. `core/stations.js` and the
  Circle's `hogmama` id are untouched.
- The taxi driver is **not Booskibro**. He is a hired car and a man who has
  never met either of them — the one person all evening who does not know
  Prospect's name, and the only one who says thank you out loud for money.

That recast was three-way merged onto our copy (base `f23420f`, ours = the
twelve review fixes, theirs = `48f028b`). Two hunks conflicted and both were
resolved in favour of keeping *both* intentions: the taxi no longer leaves on a
hidden 45-second timer (review fix #5 wins on behaviour) but uses the recast's
stranger-driver copy, and the driver's option list uses the recast's lines while
keeping the $80 elective tip that review fix #10 added to make `Woo.GenerousTip`
reachable at all.

Also landed with the integration:

- `src/bing/cast.js` gained `dress: 'chef' | 'porter' | 'gown'`. Existing dress
  kinds are unchanged. Silver call sites now pass `gender`/`bodyShape` so gowned
  figures stop rendering as plain-shirt male frames, and the diner/queue rolls
  were made coherent (one roll picks dress, colour and frame together, instead
  of three independent rolls producing gowns in undertaker grey).
- Margo has a **prior encounter at the Bing, Scene One only** — a stool at the
  far end of the bar, a light three-minute conversation whose only mechanical
  output is `mission.flags.gaveNumber`. It is **not** a gate: a player who walks
  straight past still gets the date; what he loses is having met her first. The
  branch's direct `silver.html` link out of the Bing ending was deliberately not
  taken, because the campaign owns navigation now.
- Stable IDs: `CHARACTER_IDS.MARGO` (human, role `civilian`) and
  `CHARACTER_IDS.APE` (human, `family_member` — he is a locked Initiation id who
  also sits at the pillar table in the Silver Room) are in
  `src/core/characters.js`. `src/silver/script.js` takes her name from the
  registry rather than a local literal.
- All 13 bare "Lou" references in silver dialogue now say **Big Uncle Lou** at
  the introducing mention, per the two-Lous rule.
- `silver.html` now uses the shared `boot-guard.js` recovery panel like every
  other standalone scene, instead of its own bespoke inline handler.

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
- Snow is an adult human and Tony's friendly Motel ally. Friendly faction is a
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
| Leave for the Beef Run | Advance to at least Day 2, 9:10 AM |
| Beef Run completion | Advance to at least Day 2, 8:30 PM |
| Big Uncle Lou's second answered call | +5 minutes |
| Leave for Bada Bing Scene Two | Advance to at least Day 2, 11:00 PM |
| Bada Bing Scene Two completion | Advance to at least Day 3, 12:45 AM |
| Drive to the Jerky Motel | Advance to at least Day 3, 1:30 AM |
| Jerky Motel completion | Advance to at least Day 3, 4:30 AM |
| Margo's answered date call | +5 minutes |
| Leave for the Silver Room | Advance to at least Day 3, 7:30 PM |
| Silver Room completion | Advance to at least Day 3, 11:20 PM |
| Booskibro's answered big-night call | +5 minutes |
| Leave for the Initiation | Advance to at least Day 4, 7:00 PM |

The first Bing HUD now reads the persisted campaign clock instead of a
scene-local timer. Remaining mission and travel beats should extend the same
ledger. The user explicitly permits additional days before Initiation; do not
compress every mission into a two-day deadline merely to preserve the old
fifteen-real-minute-day design.

### Sleep is the chapter machine

Sleeping in his own bed is the only thing that turns a story chapter, and story
chapter is still deliberately separate from calendar day. `SLEEP_CHAPTERS` in
`src/core/apartment-story.js` is the whole table:

| Chapter | Requires | Wakes at | Next chapter |
|---|---|---|---|
| `day_one` | Squatchfather complete | Day 2, 7:00 AM | `day_two` |
| `day_two` | Jerky Motel complete | Day 3, 12:00 PM | `date` |
| `date` | Silver Room complete | Day 4, 10:00 AM | `big_night` |

`big_night` is the last chapter, so sleeping again returns
`already_big_night`. Lying down early is refused in Tony's voice with
`day_one_incomplete`, `day_two_incomplete`, or `date_incomplete` rather than
skipping a night of work.

The `date` wake is noon of the *same* Day 3 the Motel ended on: Tony was up
until half four in the morning, and the table is not until nine that evening.
Sleeping off the date is the only thing that moves the calendar to Day 4, which
is the day the ceremony happens.

## The final apartment return and the big-night call

The last apartment beat is connected and the current Initiation is routed
through ordinary campaign state without a single change to the scene:

- Coming home from the Motel is recognised on its own (`returningFromMotel`),
  with its own overlay tag and arrival lines, instead of reusing the
  Squatchfather return copy. Coming home from the **date** is recognised ahead
  of it (`returningFromSilver`, checked first because a finished date also has
  a finished Motel behind it) and its arrival line reads the recorded outcome.
- Before the post-date sleep the door gives an in-voice waiting line
  (`sleep_before_big_night`) rather than a destination. Nothing rings.
- Sleeping opens the `big_night` chapter at Day 4, 10:00 AM. Booskibro — patriarch
  and ceremony leader — then rings the physical phone once as
  `BIG_NIGHT_BOOSKI_CALL`: character `booski`, voice profile `booski`, cue bank
  `vo.call.booski.bignight.*`, four authored lines about the whole Circle
  assembling for Tony. Answering costs +5 authored minutes and unlocks
  `MISSION_IDS.INITIATION`.
- The door then returns `{ kind: 'go', destination: SCENE_IDS.INITIATION }`.
  `leaveForMission` applies `travel.initiation`, marks the mission
  `in_progress`, and navigates to `initiation.html`.
- `src/initiation/*` and `initiation.html` are byte-identical to the
  pre-existing build. The scene does not read the campaign, claim its scene, or
  report completion, so `SCENE_IDS.INITIATION` has no outbound edge and the
  door keeps letting Tony back in rather than latching shut behind him. That is
  the accepted state until the user has playtested it.
- `vo.call.booski.bignight.1..4` are authored in `assets/sfx/manifest.json`
  with `voice: "booski"` and `say` fields. **No audio was generated.** Note
  that `vo.call.booski.airstrip.*` and `vo.call.lou.bing_second.*` — the two
  earlier campaign calls — are still missing from the manifest entirely, so
  those two calls can never be recorded until someone authors them the same
  way. Nothing in `npm run check` catches that today.

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
- Snow is a human friendly-faction ally. Friendly actors cannot become
  hostile, chase/grab Tony, damage Tony, or be selected by Tony's attacks.
- East stairs, the second car, parking paint, pool deck/furniture, wall gap,
  and four-step floor heights are re-authored and measured.
- Room 12 and bathroom staging use a human-scale `0.42m` player radius with
  collision-clear character and recovery positions. Restoring `0.80m` would
  require a layout redesign.
- The passenger-seat camera, capture recovery, mattress world placement, and
  clerk spawn have dedicated regression assertions.

### Safe preview

Open <http://localhost:5173/preview.html> for the Beef Run, Motel, Bing Scene
Two, Squatchfather, **the Silver Room** (SCENE PREVIEW 07), or the unchanged
Initiation reference. Preview campaign state is in-memory and page-local. It
never reads, migrates, overwrites, or advances the canonical browser save.
`npm run verify:silver` now boots through `silver.html?preview=1` for exactly
that reason: the story gate has to open without a real save existing.

The final Bada Bing and Motel captures are committed under
[`docs/validation/2026-07-29/`](./validation/2026-07-29/README.md), including
the front portal, vehicle lot, performers, first-person Motel views, human
Snow, corrected pool, Room 12, and capture recovery.

## The Beef Run is integrated

The finished flight mission from `origin/claude/beef-run-mission-di1vq9` at
audited tip `f4ed391` was selectively integrated on 2026-07-30 without merging
its older Squatch Life base. Its aircraft, flight model, terrain, mission
geography, and flight controls are the canonical implementation and were not
rewritten; `npm run check:flight` passes against this branch's vendored
Three.js. The adapted boundaries:

- The contact speaks as `SASOLE` — Captain Lou Sasole, voice profile `lou2` —
  and the prospect uses the `player` voice. The cue namespace is
  `vo.beefrun.sasole.*` (never `lou`, which is Big Uncle Lou). 191 manifest
  cues regenerate through `npm run vo:beefrun`; 171 are generatable with
  voices the manifest already has. Old Stove, Cecilio, CAIB radio, and the
  lookout still need ElevenLabs voice ids in the `voices` block.
- `beefrun.html` is the airstrip scene href. Entering claims the scene;
  `createAirstripStory` gates the start on Booskibro's answered call and the
  completed Squatchfather, with door-voice reasons on the title screen.
- The mission's four restore points persist as campaign checkpoints
  (`airstrip`, `remote_strip`, `returning`, `landed_home`) with cargo,
  detection, landing rank, and completion; a reload mid-mission resumes in
  the cockpit at the saved leg.
- The on-foot player rides `world.groundAt = terrainHeight` at the
  integration player's relative eye height; the forked `player.groundAt` and
  absolute-eye code did not come across.
- The mission-complete card releases pointer lock so its buttons work, and
  losing the lock after the ending no longer pauses the game.
- `check.mjs` gained the Beef Run cue round-trip and dialogue-resolution
  gates; `audio-todo` gained the mission chapter with casting notes.

## Verification at this checkpoint

Fresh checks on the July 31 release-hygiene candidate (published base
`acd6a9b`, plus the Day Two verifier world-matrix correction):

```text
npm test                       87/87 passed
npm run check                  185 source files, 4 manifests, all good
npm run check:flight           flight-model bench, all envelopes hold
npm run verify:day-one         35/35 passed
npm run verify:day-two         22/22 passed
npm run verify:big-night       19/19 passed
npm run verify:computer        29/29 passed
npm run verify:squatch-smash    8/8 passed
npm run verify:boot-errors      8/8 passed
npm run verify:preview         16/16 passed
npm run verify:beefrun         22/22 passed
npm run verify:motel           37/37 passed
npm run verify:squatchfather   31/31 passed
npm run verify:initiation      10/10 passed
npm run verify:bing-two        10/10 passed
npm run verify:bing           123/123 passed
npm run verify:silver-story    20/20 passed
npm run verify:silver         112/112 passed
npm run verify:art             50 art pieces checked, all good
npm run verify:bundle           3 strict-CSP policies passed; 295 voice clips embedded
npm run audio:todo             259 voice lines, 17 effects remain
```

The Day Two repair is test-only: the four-angle bed probe moves the camera
directly, so it now refreshes the Three.js scene's world matrices before
raycasting. Without that refresh a valid bed target appeared as a false
negative in headless verification. No gameplay geometry or interaction code
changed in this release-hygiene pass.

### Audio for the date

`npm run check` now scans `src/silver/*` for cue names, which caught 25 cues the
mission plays that existed nowhere in `assets/sfx/manifest.json` — they were
falling through to the synth and could never have been recorded. All 25 are now
authored with prompts (kitchen, bar, stage, the three band stems, four ambience
beds), plus `vo.call.margo.date.1..4` with her exact lines.

**No audio was generated.** Margo's `voices.margo` entry is a **PROVISIONAL**
placeholder: it borrows `hogmama`'s ElevenLabs id with stability raised to 0.4
purely so her lines can be auditioned. She is not Hog Mama and must be recast
before any real recording — the `_note` field in the manifest says so.

The single-file bundle is a constrained preview artifact: its configured size
budget omits music and many voice clips, so the normal hosted runtime remains
the authoritative audio experience. Re-run every focused verifier before any
merge to `main`.

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

1. ~~Add the final apartment return/big-night call and route the current
   Initiation through normal campaign state without rewriting it.~~ **DONE
   2026-07-30** — see "The final apartment return and the big-night call". The
   next move here is the human playtest gate: the user has to play the current
   Initiation before anything in it changes.
2. ~~Slot the Silver Room into the campaign.~~ **DONE 2026-07-30** — see "The
   Silver Room is integrated". Remaining follow-ups there are owner calls, not
   code: recast Margo's voice off the `hogmama` placeholder, and decide whether
   the date's recorded outcome should be visible anywhere in the Initiation.
3. After the user playtests Initiation, design and implement the approved
   accomplishment review, rival deaths, mass transformation, and
   chapter-complete checkpoint. That work is also what gives
   `SCENE_IDS.INITIATION` its first outbound edge, a completion time event, and
   a reason to claim the scene with `campaign.enter`.
4. Run the entire waking-apartment-through-Initiation acceptance path, including
   reloads at every apartment return.
5. Work the scene-polish backlog the user dictated on 2026-07-29 (Squatchfather
   chair orientation and revolver, Bada Bing character style/performer detail,
   Motel pool/doors/windows, driving-scene car interior and lights, gambling
   rework, apartment glue-gag tuning, sound and voice generation).
6. Keep `main` green through focused reviewed PRs; the deferred Initiation
   ending is the only remaining campaign-completion P0.

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
