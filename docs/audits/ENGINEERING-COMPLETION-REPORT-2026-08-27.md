# SquatchSmash engineering completion report — 2026-08-27

This report closes the engineering handoff that began at `main` commit
`56e3fb2dd2bdba7bc66c6163b7eea895f16d8756`. The tested implementation head is
`84ea6c74f01f80407c0c73a68aa6e475d18e18c6` on
`codex/engineering-completion-20260827`. The final report/guidance commit and
verified remote ref are reported in the final handoff message after push.

The result is not just a diner-voice change. It includes the Jobs 0–12
engineering pass, the four approved engineering-tool additions, both supplied scene-QA
briefs, all six delivered music masters, the Cabin dungeon continuity rules,
and the final defects found during integrated real-browser verification.

## Outcome at a glance

- Campaign beats: **31 / 31 wired**.
- Pending budget: **0**.
- Campaign marathon: **28 / 28 durable handoffs**, with a real save and reload
  at every landing.
- Recording backlog: **0 / 4,123 authored lines outstanding**.
- Exact rendered-voice evidence: **387 / 387** current takes decode and match
  current text/voice identity.
- Radio spoken-content evidence: **298 / 298** current takes transcribed.
- Long-form radio/music measurements: **24 / 24** masters have hash-bound
  duration, integrated-loudness, sample-peak, and true-peak evidence.
- Geometry: **100 / 100 states**, 673,959 records, zero violations or
  configuration errors.
- Canonical visual set: **15 deterministic active-scene shots**.
- The Diner/Front & Center floor does not use one repeated speaker: the three
  ambient diners rotate `silver-diner-a`, `silver-diner-b`, and
  `silver-diner-c`, each with a distinct ElevenLabs voice ID; waiter and
  bandleader profiles are separate again.
- Tracked ElevenLabs/API-key pattern scan: **zero tracked secret files**. The
  supplied API key stayed outside the repository and was never printed.

## Jobs 0–12 ledger

| Job | Result | What shipped and what proves it |
| --- | --- | --- |
| 0 — Current baseline | Complete | Task branch created from current `main`; `CLAUDE.md`, `verify.yml`, story bible, campaign spine, route tests, and changed-since-baseline state were read before implementation. Baseline is pinned above rather than assumed. |
| 1 — Luxury browser checks | Complete | `tools/verify-luxury-apartment.mjs` now proves real pointer-lock yaw and a real W/S bathroom round trip. The live verifier passes **54 / 54** and is connected to the scene workflow; the deterministic mirror smoke runs in `verify.yml`. |
| 2 — Shared body and mirrors | Complete | `FirstPersonBody` is instantiated only in the regular apartment, luxury apartment, and Cabin. The shared `PlanarMirror` repair remains backward-compatible with Squatchfather's pre-existing mirror; Squatchfather received no body integration or scene-local edits. No body/mirror work was added to Mansion, combat scenes, or weapon rigs. Outfit changes, reflected lighting, reflected body visibility, and an unobstructed normal view are proved in all three target scenes. |
| 3 — Margo beats 16 and 17 | Complete | Margo enters the luxury apartment, comments on it, follows a deliberate two-floor waypoint route, climbs the stairs, uses shared dress-help upstairs, sleeps/snore-loops while the player remains free, wakes, repeats dress-help, leaves, and only then releases Lou's call. Five deterministic Margo states are baselined. |
| 4 — Beat 27 Special Meeting call | Complete | The luxury apartment receives an exact-once Booski call and hands off to the existing `specialmeeting.html` pickup, 42-minute ride, trunk reveal, arrival, and ceremony. No extra ride scene or risky ending handoff was added. All **31 / 31** beats are wired and `PENDING_BUDGET` is zero. |
| 5 — Day 12 campaign tail | Complete | Runtime time advances after the Enola aftermath; the repaired-Mansion recovery, Palace departure, Special Meeting pickup, and Initiation anchors moved together. Runtime, tests, story bible, and `CLAUDE.md` agree. |
| 6 — persistent statistics and THE PROSPECT'S RECORD | Complete | Schema v24 adds one bounded stats block with migration and exact-once mission seams. `src/core/campaign-stats.js` aggregates stable totals; `src/core/campaign-finale.js` prepares the stored record; Initiation renders it in the credit roll. Old/partial saves normalize without false recovery notices. Cabin execution changes the final record only. |
| 7 — THE TAKE escape-car feel | Complete — engineering; owner feel sign-off remains | Shared vehicle/audio systems were tuned and measured: 0–90 mph **7.60 s**, top speed **91.71454 mph**, 60–0 **1.633 s / 22.90 m**, steering response **35.473020 degrees / 6.774620 m**. Engine load/pitch and score lifecycle remain scene-owned. See `docs/audits/THE-TAKE-ESCAPE-CAR-EVIDENCE.md`. |
| 8 — Enola wrong-city clue | Complete | The existing clue was corrected in place as a subtle, legible cockpit/navigation discrepancy. No VO or radio points it out. Lou's repaired-Mansion debrief pays it off later. Cockpit and debrief baselines pin both ends. |
| 9 — post-Siege parody call | Complete | An original, straight-played A-Team threat call occurs exact-once after Mansion Siege and motivates Enola without copying the Taken monologue or changing the route. Its VO/cue/recording ledgers are current. |
| 10 — voice backlog | Complete | The established ElevenLabs pipeline rendered the 207-line backlog and the final full-history audit corrected one additional stale Irish take. **4,123 / 4,123** authored lines now have indexed recordings; **387 / 387** generated receipts bind text hash, voice ID, filename, and browser decode. Scribe spot-checks cover 15 takes across all ten profiles. |
| 11 — radio audit and revamp | Partial — generated audit and identified source/mechanical fixes complete; campaign-wide active-play overlap/stop/restore/teardown proof, audible mix review, and OWNER programming decisions remain | The generated five-sheet workbook represents **31 / 31 beats**, 43 timeline rows, 337 cue rows, 24 measured masters, and 298 transcribed station/news cues. Luxury and Mansion receivers now persist through the shared adapter; Motel proves one start, dialogue coexistence at gain 0.16, real-distance stop, and zero errors. Four legacy identity assets and creative programming/mix decisions remain explicit OWNER rows rather than guessed changes. A single campaign-wide audible listening pass is intentionally not claimed. |
| 12 — objective honesty | Complete | All 21 canonical scenes and all 31 campaign beats were audited against shared `ObjectivePanel` pending/retire state. Scenes expose one concise actionable step plus a bounded soft step where appropriate; future calls/tasks stay hidden, exits share their real requirements, reloads do not resurrect work, and intentional 7/7 or 8/8 tallies remain. Focused objective contracts pass **89 / 89**. |

## Final-arc clock receipts

These are actual marathon landings, not labels copied from a static table.

| Handoff or anchor | Actual campaign time |
| --- | --- |
| Enola → mansion-return scene (pre-jump landing) | Day 9, 18:00 |
| Repaired-Mansion recovery jump/start | Day 12, 18:30 |
| Repaired Mansion → Cartel Palace | Day 12, 19:15 |
| Palace departure anchor | Day 12, 20:30 |
| Cartel Palace → Luxury Apartment | Day 12, 23:00 |
| Luxury Apartment → Special Meeting | Day 13, 17:55 |
| Special Meeting → Initiation | Day 13, 19:00 |
| Initiation → Apartment/finale tail | Day 13, 20:50 |

## Scene-polish and supplied-audio reconciliation

The detailed owner-note-to-proof matrix is in
`docs/audits/PLAYTEST-HANDOFF-COVERAGE-2026-08-27.md`. Its covered groups are:

- **The Silver Case:** opening/case/execution order, Chester reaction and exact
  exchange, Squatchiel passage, bathroom ambush and furnished room, seated
  deaths, and Winston's timed decision.
- **Luxury Apartment:** darts, elevator, sectional/cabinet/appliances, poker
  table without random NPC game, two-floor bathroom and collision, art/office/
  bedroom dressing, mirror/body/outfit, and Margo's complete night/morning path.
- **Cabin/Hideout:** forest/sky/creek/ridge, Lag chopping, bedroom/bathroom,
  shared mirror/body, weapon racks, bridge collision, range/radio HUD scoping,
  truthful objectives, hidden basement entrance, second secret door, dungeon,
  interrogation/execution choice, body wrapping, pyre, night bonding, blackout,
  and the story rule that this is the Cabin basement—not a Mansion rewrite.
- **Initiation:** staff/weapon staging, first execution, formation and cabin
  procession, Saint Squatch card/burn, first-person ritual hands, player-held
  ceremonial shot, salutes, Gratin's line, saved final record, full credit roll,
  and protection against residual Space skipping the ending.
- **Jerky Motel:** footsteps, drive score, car-exit sound, Snow staging, doors/
  windows, sample placement, Rico death liveness, revolver ammo, evidence cases,
  checkpoints, and one measured score start/stop lifecycle.
- **Silver Front & Center:** subtitle priorities, cellar/kitchen/service detail,
  Margo/table/lamp staging, background/opening/Bananaphone score sequence,
  trumpeter animation, guest/bandleader/service staff, drinks/shots, dance and
  Woo responses, and distinct diner/staff voice identities.
- **Mansion Siege:** headshots, deliberate first-shot accuracy, weapon sound
  profiles/audition page, armory and checkpoint recovery, ensemble staging,
  the protected “little friend” line, LOS/damage direction, dead-house-staff
  identity, battle damage, and recovered art.
- **Global:** subtitle priority, shared objective lifecycle, HUD scope, shared
  home mirrors/body, audio ownership, route/save exact-once behavior, and
  source-driven VO/audio/take ledgers.

The latest attached polish brief was not a new untracked batch. It and the
three earlier copies are byte-identical (SHA-256
`1d34759d6a59496bf25097b228a20bfe6b702af88d02c1bd5aa7854de3097041`), and
all 69 numbered items are mapped in the coverage matrix above.

### Major-defect root-cause review

| Defect | What caused it | What changed | Cross-scene exposure and shared prevention | Regression proof |
| --- | --- | --- | --- | --- |
| Armory objective failed | Reaching the room, taking the first gun, optional pickups, leaving, and activating the upper-floor fight had been compressed into one beat. Only the first `ARM` pickup was accepted, so the prompt and the real gate could disagree. | `MansionSiegeMission` now owns a five-field armory ledger: reached, first weapon, unique optional weapons, left, and upstairs active. Entering retires “Reach the Armory”; any valid first gun advances; later guns remain optional and idempotent. | Any scene can drift when HUD copy and an exit use separate booleans. The Siege objective now derives from the same mission ledger as the door/encounter and renders through the existing shared `ObjectivePanel`; no second objective framework was added. | `tests/mansion-siege.test.mjs` exercises every gun as first, zero guns, one gun, all guns, optional duplicates, leave/reload state; `tools/verify-mansion-siege.mjs` reaches the room and takes a real rack gun. |
| Start-at-Armory spawned in stairs | The preview used a duplicated hard-coded `(7.2, 55.5)` transform that lay inside `BASEMENT_SHAFT`, then assigned an advanced-looking checkpoint without reconstructing all earlier beats. | Both untouched `armory` and post-pickup `armed` entries use the builder's canonical `anchors.armoryCenter`, safe yaw, and replay the real mission methods in order. Rack, doors, enemies, squad, damage, objective, and loadout are reconstructed from their authorities. | Duplicated preview transforms are a risk in every scene. The prevention pattern is now canonical geometry anchors plus real state-machine replay, with the shared preview entry isolated from saves. | The Siege browser verifier boots every checkpoint on a fresh page, proves the exact beat history, validates the spawn is outside the shaft, and checks rack/squad/enemy/damage/objective state. |
| Family NPCs teleported into view | The upper-floor formation was first assigned only after the first weapon pickup. That timing allowed a visible beat transition to snap actors to defensive posts while the player was climbing toward them. | The `ARM` beat stages the defence out of sight while the Prospect is below; it deliberately reuses the later `TO_OFFICE` posts, so taking a gun becomes a same-post no-op. Same-floor movement remains walked; unavoidable floor changes happen behind closed sight lines. | Beat-authored staging can cause the same symptom anywhere actors receive new transforms. The ensemble staging seam now separates hidden placement from live locomotion and preserves downed bodies instead of restaging them. | `tests/mansion-siege-people.test.mjs` proves at least 14 defenders are already staged at `ARM` and that `TO_OFFICE` neither moves nor refaces them; the live verifier checks the foyer roster before the player sees it. |
| Jerky Motel evidence could lock the getaway | The car inferred completion from unrelated booleans and presentation state. Rico escaping could delete Lou's case, burning the Reserve could make completion impossible, and the car prompt could disappear instead of explaining the missing item. | `MotelEvidenceLedger` is the sole authority for the three fixed IDs (`reserve`, `money`, `premium`), their pickups, HUD counter, missing-copy text, markers, checkpoints, and car gate. Rico drops the marked money case when escaping; burning resolves the Reserve case; an incomplete car stays interactable and names what remains. | Any multi-object collectible can deadlock if meshes, inventory, and exit gates each infer state. The new bounded ledger is the reusable pattern; no global collectible framework was invented for one scene. | `tests/motel-polish-regression.test.mjs` covers all eight collection permutations, exact missing copy, three physical pickup authorities, Rico escape, burn, and car gating; `tools/verify-motel.mjs` covers partial/all recovery and checkpoint completable states. |
| Rico spoke while dead | Voice timers and the dialogue queue had no actor-liveness authority, so an already-reserved or ambient Rico line could begin after `onActorDown`. | A bounded `silencedSpeakers` set gates immediate, queued, idle, and future lines. `onActorDown` silences the actor, stops his current take, clears his subtitle, closes his active dialogue node, and `Actor.hush()` stops mouth motion. | The underlying race can exist wherever deferred VO ignores actor retirement. Motel now has one death-to-dialogue seam; other combat scenes should use the same liveness contract rather than checking only at call time. | `tests/motel-polish-regression.test.mjs` asserts all four liveness paths and the down-handler cancellation; the Motel browser verifier kills Rico and proves no later Rico cue or mouth motion resumes. |
| Revolver fired while HUD said zero | Motel maintained local `S.ammo` for its HUD/inventory while the shared `Firearm` owned actual revolver chambers, dry fire, and reload. Two authorities inevitably diverged. | `authoritativeAmmo()` reads `WeaponSystem.firearm(sharedId).rounds` for shared guns; HUD, inventory, fire admission, recoil, flash, hit resolution, dry fire, and reload now follow that same `Firearm`. `S.ammo` remains only for truly local improvised weapons. | This was a cross-scene class of bug because shared guns can be adapted locally. The shared `Firearm`/`WeaponSystem` remains the mechanical authority, and scene adapters may present it but cannot invent a second count. | `tests/motel-polish-regression.test.mjs` forbids the old local read and binds HUD to `triggerPress`; shared weapon tests cover empty, dry-click, reload, and snapshot behavior; the Motel verifier empties and rechecks the real revolver. |
| Waiters collided with diners, tables, and each other | Patrolling service NPCs advanced independently along waypoints. Their next step did not predict furniture occupancy, tray width, seated bodies, or a deterministic right-of-way for two staff meeting head-on. | All service patrols share the live room collider/nav-blocker lists. `serviceAdvanceAllowed()` probes the next position with carried-tray radius, always yields to seated diners, and assigns a stable authored priority so exactly one waiter proceeds in a staff conflict. | The general risk exists in all waypoint crowds, but this density/tray policy belongs to the Silver service floor. It improves the scene's existing NPC update seam instead of adding a second navigation system. | `tests/silver-polish-regression.test.mjs` proves tray clearance, diner yielding, and one-waiter-only head-on progress; `tools/verify-silver.mjs` advances the real cast/service loop through the authored delivery paths. |
| Guest counter stayed at 1/6 | The owner-facing “guest” task was actually a six-of-seven back-of-house staff/tip rule. Eligible events, threshold, mission flag, and DOM repaint were split; a tally-only change could occur without a structural objective change, so the panel did not reliably repaint immediately. | The seven eligible unique Woo IDs are explicit, each can fire once, the mission persists `backOfHouseTipped`, the threshold is a named six, and every valid progress event explicitly repaints one `ObjectivePanel` tally before normal board refresh. The label now tells the truth: “Look after six staff.” | Counter drift can recur if a scene duplicates its population, threshold, and displayed count. Silver exposes the eligible set and threshold to its verifier, while the shared `ObjectivePanel` owns tally rendering/collapse semantics. | `tools/verify-silver.mjs` proves threshold ≤ eligible population, every ID is a real event, checkpoint ledgers cannot pay twice, and the live tally updates; `tests/objective-panel.test.mjs` pins progress reappearance and persistent tally review. |
| Subtitles overlapped important dialogue | Scene-local writers all targeted the same subtitle surface with no arbitration. Ambient/descriptive captions could replace story, Margo, or direct-NPC dialogue simply because their timer fired later. | `src/core/subtitle-priority.js` supplies one priority arbiter: story, table/direct speech, then ambient. Lower lanes queue, suppress, or expire deterministically; Silver's purely descriptive room lines remain audible but deliberately do not create captions. | This was global, not a Silver-only symptom. Scenes can use the shared arbiter instead of racing raw DOM writes, while objective copy stays on the separate shared objective panel. | `tests/subtitle-priority.test.mjs` covers preemption, queueing, expiry, and stale suppression; `tests/silver-polish-regression.test.mjs` pins the no-descriptive-caption rule and the Silver browser verifier checks live priority behavior. |
| Short carbine used the Palace suppressed report in Siege | Suppression was implemented through a scene audio-name wrapper rather than explicit weapon data. That made a weapon ID look globally suppressed and allowed one mission's adapter choice to leak into ordinary callers. | `src/core/weapons/audio.js` now has frozen `standard` and `suppressed` report profiles. Standard is the safe default; only the Cartel Palace adapter opts the currently fitted weapon's fire slot into suppressed report/action/fallback behavior. Siege supplies no such adapter, so its carbine is loud. | This was explicitly cross-scene. The shared profile resolver prevents scene identity from mutating weapon identity and keeps future attachments opt-in and data-driven. | `tests/weapon-audio-mix.test.mjs` proves default carbine = `weapon.carbine.fire`, suppressed selection/action, fallback isolation, and no contamination of the next standard shot; Palace tests prove its explicit adapter and Siege browser audio receipts prove the normal report. |

All six supplied music masters are wired as requested:

- `Driving Jerky Hotel.mp3`: low, non-diegetic Motel drive score under dialogue.
- `Driving THe take.mp3`: THE TAKE escape-driving score.
- `EnolaPreBombDropApproach.mp3`: timed approach cue, stopped immediately on
  early arrival; no music over the bomb drop/explosion.
- `EnolaEscapeAfterDrop.mp3`: begins after the authored post-explosion silence.
- `Silver Room (front and center background).mp3`: corridor-muffled, clearer in
  the room, and dialogue-ducked.
- `SilverRoomOpening20sec.mp3`: the requested first 27 seconds after the opening
  joke, then faded directly into Bananaphone with a visible stage trumpeter.

## Persistent record implementation

- `src/core/campaign-stats.js` — bounded schema, normalization, exact-once seams.
- `src/core/campaign-finale.js` — final-record readiness and persistence.
- `src/core/campaign.js` — schema migration and scene-boundary aggregation.
- `src/initiation/main.js` — THE PROSPECT'S RECORD presentation and credits.
- `tests/campaign-stats.test.mjs`, `tests/campaign-finale.test.mjs`, and campaign
  marathon/finale contracts — old saves, partial saves, exact-once reloads, Cabin
  execution field, complete marathon population, and absent optional values.

## Radio deliverables

- Workbook: `docs/audits/SQUATCHSMASH-RADIO-AUDIT.xlsx`
- Generator: `tools/radio-audit.mjs`
- Revamp plan: `docs/audits/SQUATCHSMASH-RADIO-REVAMP.md`
- Sheet CSVs: `docs/audits/radio/scene-timeline.csv`,
  `station-catalog.csv`, `cue-inventory.csv`, `problems-and-decisions.csv`, and
  `revamp-plan.csv`
- Loudness receipts: `docs/audits/radio/loudness-measurements.json`
- Spoken-content receipts: `docs/audits/radio/content-transcriptions.json`
- Voice-generation report: `docs/audits/VOICE-GENERATION-PASS-2026-08-27.md`
- Rendered-voice receipts:
  `docs/audits/voice/rendered-voice-receipts.json`

## Cartel Palace Recast pilot

The live integration is Palace-only and does not replace perception,
suppression, combat reactions, shooting, boss phases, or tactical scoring.
Measured comparison:

- Service-wing response: old controller failed after 45 s / 2,298 blocked
  frames; pilot arrived in **18.717 s / 5 blocked moves**.
- Stale-contact return: old controller failed after 45 s / 1,741 blocked / 44
  reversals; pilot arrived in **19.583 s / 12 blocked / 0 reversals**.
- Added navmesh: **32,400 bytes**; cold initialization about **1.9 s**; measured
  Palace HTTP payload **1,146,950 bytes**.
- No rollout beyond Cartel Palace is authorized.

Full evidence and the retain/reject reasoning are in
`docs/audits/CARTEL-PALACE-RECAST-PILOT.md`.

## Engineering workflow and rendering tooling

- Root instructions: `AGENTS.md`
- Push card: `BEFORE-YOU-PUSH.md`
- Repository skill:
  `.agents/skills/squatchsmash-game-development/SKILL.md`
- Spector setup: `docs/engineering/SPECTOR-MCP.md`
- Mirror evidence: `docs/engineering/SPECTOR-MIRROR-EVIDENCE.md`

Spector.js is development-only, configured and used successfully on this
machine during this pass, and not imported by or shipped with the game. Real
captures selected the game canvas and produced zero WebGL errors:

| Scene | Draw calls before | Draw calls after reflected body |
| --- | ---: | ---: |
| Regular apartment | 3,297 | 3,387 |
| Luxury apartment | 2,979 | 3,015 |
| Cabin | 6,322 | 6,369 |

The machine-local MCP registration is not a portable repository artifact; the
repo includes precise reproducible setup and evidence instead.

Sentry was explicitly excluded from this phase and was not installed or added
to the runtime.

## Deterministic visual and trace evidence

`playwright.visual.config.mjs` fixes 960×540 resolution, device scale factor 1,
one worker, serial execution, screenshot animations disabled, sRGB/SwiftShader,
and failure retention for actions, screenshots, DOM snapshots, console/page
errors, network failures, and readiness state. The full set is scheduled and
manually dispatchable; the regular-apartment mirror smoke runs on every PR.

Baselines in `tests/visual/visual-baselines/`:

1. `regular-apartment-mirror-outfit.png`
2. `luxury-apartment-mirror-outfit.png`
3. `cabin-mirror-outfit.png`
4. `luxury-apartment-living-room.png`
5. `luxury-margo-entrance.png`
6. `luxury-margo-staircase.png`
7. `luxury-margo-upstairs-dress-help.png`
8. `luxury-margo-sleep.png`
9. `luxury-margo-morning-departure.png`
10. `mansion-foyer.png`
11. `mansion-repaired-debrief.png`
12. `enola-wrong-city-instrument.png`
13. `cartel-palace-courtyard.png`
14. `the-take-escape-car.png`
15. `initiation-prospects-record.png`

The final integrated runs found additional issues rather than blessing stale
green:

- The credit roll focused its native Skip button, so the Space that finished
  the ceremony could synthesize a click and skip the ending. The roll now
  focuses its dialog; Escape/Enter and intentional Tab-to-Skip remain.
- The Initiation verifier briefly contradicted the owner's explicit sequence by
  demanding raised hands in the resting `hand` prompt. It now sends the real
  Space input into `cut` first, then proves the raised hand is framed. Production
  stays “prompt → click → hands rise.”
- The same long Initiation verifier later inherited the retry button's off-centre
  virtual pointer position. Its supposedly horizontal Playwright movement
  injected about 9.4 degrees of vertical pitch, moved the hand out of frame,
  and falsely blamed production. The harness now exits and reacquires pointer
  lock through a real centre-canvas click, proves yaw changes while pitch does
  not, and then follows the owner sequence. Focused real-input probes separately
  observed the hand enter frame at `cut` phase time 0.50 and remain framed
  through the full pose.
- THE TAKE's old screenshot let software-renderer wall time decide whether the
  live objective/Rippinflow call had expired. The test freezes the real RAF at
  the active-drive opening, asserts exact live copy and voice history, and only
  then captures. Only that reviewed baseline changed; it passed three repeated
  targeted runs and the subsequent full set.
- The full take-history gate found one Irish Enola recording that predated the
  corrected clue text and still spoke the forbidden city hint. The canonical
  ElevenLabs pipeline re-recorded that exact cue, regenerated its ledgers and
  browser-decode receipt, and the Enola browser verifier passed 105 / 105. The
  resulting 387th receipt also exposed and corrected a stale hard-coded 386
  expectation in the registered Node contract.
- The shared credits view treated an undelivered owner-music slot as a real
  `assets/music/credits.mp3` asset. Both full Initiation paths completed, but
  Chromium correctly reported the missing request as a production 404 in the
  final console sweep. The default slot is now null until a real track lands;
  the existing explicit-source hook remains, and the genuine visual credits
  path passes without a network substitution or baseline change.

## Verification actually run

No green claim below is inferred from a different gate. Commands used the
bundled Node 24 runtime through `node --run <script>` where the runtime did not
provide an `npm` shim.

### Authoritative repository gates

- `node --run verify:geometry` — **100 / 100 states**, 673,959 records,
  190,039 suppressions, zero violations/configuration errors.
- `node --run lint` — zero errors, 108 advisory warnings.
- `node --run test` — **3,736 / 3,736** passing, zero failures, skips,
  cancellations, or todos in 15 minutes 57.8 seconds on implementation head
  `84ea6c74` (Node 24.19.0).
- `node --run check` with `CHECK_SFX_ORPHANS=1` — 736 source files and five
  manifests valid; strict orphan mode green.
- `node --run check:flight` — flight-model bench green.
- `node --run verify:campaign-route` — **1 / 1**.
- `node --run verify:boot-failure-surfaces` — **40 / 40**.
- `node --run verify:campaign-marathon` — **28 / 28** durable handoffs/reloads,
  including populated final record.
- `node tools/bundle-preview.mjs` — 113 modules; 15.87 MB preview produced.
- `node --run certify:debt-ratchet -- --trusted-ref 56e3fb2d` — architecture
  0/0, semantic 134/134, liveness 24/24, spatial 83 records / 39,111 units;
  no new debt.
- `node --run verify:framing` — green.
- `git grep -I -l -E 'sk_[A-Za-z0-9_-]{20,}|xi-api-key[[:space:]]*[:=][[:space:]]*[A-Za-z0-9_-]{20,}' -- .`
  and `git ls-files | rg -i '(^|/)\.env($|\.)|(^|/)[^/]*(api[-_. ]?key|secret[-_. ]?key)[^/]*$'`
  — zero tracked secret-content or suspicious key-file hits. The supplied
  ElevenLabs key remained outside the repository.

### Dialogue, audio, take, and radio gates

The exact **30 / 30** green package-script invocations were:

1. `node --run verify:dialogue:check`
2. `node --run check:line-presence`
3. `node --run check:reachability`
4. `node --run check:rerecord`
5. `node --run check:takes`
6. `node --run check:take-history`
7. `node --run check:infer`
8. `node --run audit:rendered-voices:check`
9. `node --run audit:radio:check`
10. `node --run audit:radio-loudness:check`
11. `node --run audit:radio-content:check`
12. `node --run voice:needed:check`
13. `node --run audio:todo:check`
14. `node --run check:radio-vo`
15. `node --run check:apartment-vo`
16. `node --run check:beefrun-vo`
17. `node --run check:bing-vo`
18. `node --run check:cabin-vo`
19. `node --run check:enolasquatch-vo`
20. `node --run check:golf-vo`
21. `node --run check:heist-vo`
22. `node --run check:hotdog-vo`
23. `node --run check:initiation-vo`
24. `node --run check:mansion-vo`
25. `node --run check:mansion-sfx`
26. `node --run check:motel-vo`
27. `node --run check:nowake-vo`
28. `node --run check:siege-vo`
29. `node --run check:silver-vo`
30. `node --run check:silvercase-vo`

Combined result: 4,239 take-ledger rows and zero manifest drift, recording
queue, rerecord drift, radio drift, or strict audio orphan findings.

### Changed-scene browser gates

- `node --run verify:luxury-apartment-browser` — **54 / 54**.
- `node --run verify:cabin-browser` — **112 / 112**.
- `node --run verify:enolasquatch` — **105 / 105**.
- `node --run verify:mansion-return` — **8 / 8**.
- `node --run verify:cartel-palace` — **87 / 87**.
- `node --run verify:heist` — **92 / 92**.
- `node --run verify:motel` — **97 / 97**, including live drive-score
  start/coexist/stop.
- `node --run verify:mansion` — **305 / 305**, including **464 / 464**
  active-visit cue receipts.
- `node --run verify:silvercase` — green through the complete live case path.
- `node --run verify:silver` — green through the complete live dining-floor
  path.
- `node --run verify:mansion-siege` — green through all requested checkpoints,
  combat, Armory, ensemble, and post-Siege-call paths.
- `node --run verify:initiation` — **60 / 60** in 27 minutes 18.6 seconds on
  implementation head `84ea6c74`; both clean-start and retry paths used real
  player input, the full 273-row credits path completed, and the final
  console/page/network sweep was clean.
- Full deterministic visual regression: **9 / 9 Playwright specs**, all **15 / 15
  canonical baselines** green in 5.1 minutes. The repaired THE TAKE active-drive
  receipt also passed **3 / 3** consecutive targeted runs before the full set.

The full visual command was `node --run verify:visual`. The reviewed THE TAKE
update used `node --run verify:visual:update -- --grep "THE TAKE escape-car"`;
then `node --run verify:visual -- --grep "THE TAKE escape-car"` passed three
consecutive times before the full set. The full visual set ran at `32d3f2a7`.
Later commits through `84ea6c74` change the Initiation verifier/contracts,
audio evidence, or the optional credits-audio default rather than visual
geometry/materials. The corrected Enola cue was exercised by the 105 / 105
Enola browser run; the credits visual passed 1 / 1 without its former missing-
asset route and without a baseline change. The complete Node and Initiation
browser gates were rerun on the tested implementation head above.

Additional exact release invocations were `node --run verify:final-arc-reloads`,
`node --run verify:enola-bomb-audio`, `node --run pilot:cartel-palace-recast`,
`node --run verify:bing`, `node --run verify:bing-two`, and
`node --run verify:graveyard`. They cover final-arc reloads, Enola's silent
bomb interval, the Recast comparison, Bing (**163 / 163**), Bing Two
(**35 / 35**), and Graveyard (**43 / 43**). Mirror/body, Margo, campaign
stats/finale/migrations, diner voices, radio receiver persistence, and the
objective lifecycle (**89 / 89**) are registered cases in the green
`node --run test` suite rather than unlabeled extra gates.

## Owner-only creative decisions

These are visible in the workbook and were deliberately not guessed:

1. Retire or restore the legacy `uncle` and `ksqch` station identities and four
   corresponding unreachable assets.
2. Decide exact station/venue allocation for retained songs.
3. Decide which physical receivers carry mission-news segments.
4. Decide whether hour-based hosts gain chapter-specific programming.
5. Supply/confirm provenance and license notes for all 24 retained long-form
   masters.
6. Approve any gain/normalization changes after listening on the target setup.
7. Decide whether any of the seven intentionally silent campaign beats should
   gain music.
8. Choose whether any weapon-audition favorite replaces a current report.
9. Supply or choose an optional credits track if the ending should have music;
   the undelivered slot is intentionally silent instead of requesting a missing
   file.

## Remaining risks stated plainly

- A deterministic browser proves playback ownership, lifecycle, and configured
  gains; it cannot certify subjective dialogue intelligibility on the owner's
  speakers. A campaign-wide human listening pass remains the honest final mix
  sign-off.
- THE TAKE's measured handling contract is green, but “fun” remains an owner
  feel judgment on the target machine.
- The Recast pilot is a clear measured improvement in its Palace scenarios,
  but its 32.4 KB navmesh and approximately 1.9 s cold initialization are real
  costs; it must stay Palace-only unless a later measured decision expands it.
- Four legacy radio identity assets remain intentionally unresolved until the
  owner answers their programming role; deleting or reviving them now would be
  a creative rewrite.
- No credits music asset was supplied. The ending now runs cleanly in silence;
  adding a track remains an explicit owner-content decision, not a fabricated
  placeholder filename.
- A pushed task branch is reviewable on GitHub but is not `main`, not a hosted
  Verify result, and not a Pages deployment. Merge/Pages status must not be
  claimed until those remote events actually happen.
