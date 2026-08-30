# SquatchSmash engineering completion report — 2026-08-27

> **Current integration ledger.** The handoff began at `main` commit
> `56e3fb2dd2bdba7bc66c6163b7eea895f16d8756` and now lives on
> `codex/campaign-qa-polish-20260828`. The tested implementation/verifier head
> before this report-only closure is `c5312e76`; the first production snapshot
> is deployed from `912d48b149aa737d627658d6cae06a1bc0e7cc53`.
> The immutable SHA of the commit containing this report and its post-push
> workflows are recorded by the delivery message because a commit cannot
> self-reference its own SHA.

This is the combined Jobs 0–12 engineering pass, four approved tool additions,
campaign/dialogue QA, six delivered music masters, Cabin dungeon correction,
Luxury home-hub work, and final integration hardening. Sentry remains excluded.

## Outcome at a glance

- Campaign beats: **31 / 31 wired**.
- Pending budget: **0**.
- Save schema: **v26**.
- Current marathon topology: **27** durable handoffs, landings, and reload
  proofs through a finale-ready save.
- Latest hosted full-suite snapshot at `912d48b1`: **3,830 / 3,830**.
- Authored/indexed spoken dialogue: **4,228** cues — **4,100** playable/live
  plus 128 deliberately unreachable future Initiation catalog rows.
- Exact rendered-voice evidence: **543** current takes.
- Legacy take coverage: **3,685** historically assumed takes.
- Reachable recording backlog: **0 lines / 0 voices**.
- Playable voice bank: **4,100 / 4,100** present after a fresh live-only
  ElevenLabs generation pass; no new render was owed.
- Indexed audio: **4,825** files after adding twelve Motel-specific footsteps.
- Radio lifecycle source map: **26 / 26** unique live owners mapped to exact
  named start/stop/restore/teardown or deliberate-silence receipts.
- Radio inventory: **31 / 31** beats, 337 cues, 24 measured long-form masters,
  and 298 spoken-content receipts.
- Deterministic visual set: **15** canonical active-scene shots.
- The top-stair Luxury focal point is a completed 25-mesh Sasquatch guardian,
  not a placeholder primitive.
- Silver Room's 14 floor-diner lines are cast 5/5/4 across three distinct
  profiles; Bing ambient remarks also span multiple visible speakers/profiles.
- The supplied ElevenLabs key remains outside the repository; no key material
  is committed or printed by this work.

## Jobs 0–12 ledger

| Job | Current result | Evidence and remaining release proof |
|---|---|---|
| 0 — Current baseline | Complete | The branch contains current `origin/main` ancestry. `CLAUDE.md`, `verify.yml`, story bible, campaign spine, route tests, traps, and right-first-time guidance were read. Thirty-three remote refs and the pull-request ledger were audited; six unmerged tips are stale/superseded/patch-equivalent, not merge candidates. The final pre-report fetch found `origin/main` at `912d48b1`, still an ancestor with the branch eight commits ahead and zero behind. |
| 1 — Luxury browser checks | Complete | Real pointer-lock yaw, W/S stairs, off-centre walk/sprint/crouch at 30/60/120 Hz, retreat/no-wedge, bathroom W/D/A/S round trip, bedroom/wardrobe circulation, and two privacy-wall rays are in the verifier. The repaired harness samples the shipping renderer through `gl.readPixels`; the current browser receipt is **63 / 63** with zero runtime/page/request problems. |
| 2 — Shared body and mirrors | Complete | `FirstPersonBody` is used only in the regular apartment, Luxury Apartment, and Cabin. Shared `PlanarMirror` layer discipline includes the body and required reflected lighting without obstructing normal first-person view. Squatchfather's pre-existing mirror remains untouched; no combat/weapon scene gained a body. Spector captured +90, +36, and +47 reflected-pass draws with zero WebGL errors. |
| 3 — Margo beats 16 and 17 | Complete in source and existing browser/visual evidence | Margo enters, comments, walks a deliberate two-floor route, climbs to the loft, uses shared dress-help, sleeps/snore-loops while the player roams, wakes, repeats dress-help, leaves, and only then releases Lou's call. Entrance, staircase, upstairs dress, sleep, and departure are deterministic baselines. |
| 4 — Beat 27 Special Meeting call | Complete | One campaign-owned inventory phone rings exact-once anywhere in the Luxury hub, survives ringing/answered reloads, and hands into existing `specialmeeting.html`. No duplicate flat call, new ride scene, or extra ending handoff was added. All 31 beats are wired and pending budget is zero; Luxury, Special Meeting, marathon, and reload proofs cover the seam. |
| 5 — Day 12 campaign tail | Complete | Enola's aftermath jumps to the repaired Mansion on Day 12; all four affected anchors moved with the route. Runtime, spine, story bible, calendar tests, and `CLAUDE.md` agree. |
| 6 — Persistent statistics and THE PROSPECT'S RECORD | Complete, now schema v26 | The bounded stats block, migration, exact-once mission aggregation, Cabin execution fact, finale adapter, and credit presentation are implemented. v26 adds THE TAKE's `shotsFired` and `peopleKilled` at the persisted safehouse-debrief seam; old saves receive honest zero defaults rather than invented history. No per-shot writes, unbounded log, grade, best score, or route branch exists. |
| 7 — THE TAKE escape-car feel | Engineering complete; owner feel sign-off remains | Shared vehicle/audio behavior was measured at 0–90 mph 7.60 s, top speed 91.71454 mph, 60–0 in 1.633 s / 22.90 m, steering response 35.473020° / 6.774620 m. Engine pitch/load and delivered driving score follow actual vehicle state. The final call now uses one persistent phone after a durable `safehouse_debrief`; save happens before silence, and three final lines drain before completion. |
| 8 — Enola wrong-city clue | Complete | The existing instrument clue was corrected in place: subtle, legible, visible in flight, and never interpreted by VO/radio. Lou's repaired-Mansion debrief supplies the later payoff. The loading UI no longer names the clue city. |
| 9 — Post-Siege parody call | Complete | An original, straight-played A-Team threat call occurs exact-once after the Siege and motivates Enola without quoting the Taken monologue or changing the route. |
| 10 — Voice backlog | Complete for the reachable campaign | **4,228** spoken rows equal **543** exact rendered plus **3,685** legacy takes. Exact receipts bind cue, current text hash, performer, file, and browser decode. Reachable booth backlog is zero. The 128 future Initiation catalog cues remain intentionally unreachable and are not playable-campaign debt. |
| 11 — Radio audit and revamp | Mechanical/source work complete; OWNER programming/listening choices remain | The five-sheet workbook, repeatable generator, loudness/content evidence, receiver persistence, overlap/stop/restore fixes, and 26/26 lifecycle mapping exist. The source contract rejects missing owners, stale mappings, and renamed verifier receipts. Human target-system listening, legacy ident decisions, station/venue programming, provenance/licensing, and optional music remain explicit OWNER rows. |
| 12 — Objective honesty | Complete | All canonical scenes use the existing shared objective lifecycle. Future tasks remain hidden, completions retire, persistent tallies remain intentional, and exit requirements share the same authoritative state. No second objective system was introduced. |

## Final-arc clock receipts

These are actual campaign landing/anchor receipts, not a copied static table:

| Handoff or anchor | Actual campaign time |
|---|---|
| Enola → Mansion Return, before jump | Day 9, 18:00 |
| Repaired-Mansion recovery start | Day 12, 18:30 |
| Repaired Mansion → Cartel Palace | Day 12, 19:15 |
| Palace departure anchor | Day 12, 20:30 |
| Cartel Palace → Luxury Apartment | Day 12, 23:00 |
| Luxury Apartment → Special Meeting | Day 13, 17:55 |
| Special Meeting → Initiation | Day 13, 19:00 |
| Initiation → Apartment/finale tail | Day 13, 20:50 |

## Corrected scene ownership and current final-polish work

### Cabin, not Mansion or Luxury

The Cabin Hideaway owns the entire Act-One cellar/dungeon chapter. Beef Run
cuts the visit in half. Cabin II contains Gratin, the A-Team captive, the
Counter-Strike baiter, the unidentified mole/“Short Bus” reveal, ten-second
execution choice, wrapping/carrying, pyre, nightfall, drinking, blackout, and
Booski's Billy summons.

The current dungeon polish adds:

- two floor-to-ceiling barred cells with central inward-opening doors,
  hardware, honest colliders, and non-relatching open state;
- a wardrobe/ladder first entrance and a second masonry secret door;
- shared AK-47/Barrett racks and dressed underground circulation;
- seven distinct tangible tools, held actions, captive reactions, and cues;
- a soft table fallback plus authored-viewpoint raycast proof that each visible
  tool wins the crosshair;
- 2-hit baiter and 6-hit A-Team interrogation thresholds with 8-hit execution
  durability;
- real `Digit2` refusal-path verification in which Gratin performs both kills;
- body-owned blood-impact diagnostics; and
- direct wrap, carry, ladder, pyre, and blackout continuation.

The frozen-commit contract/browser pair passed **118 / 118** and **52 / 52**.
The browser path used all seven tangible tools, chose the real `Digit2` refusal,
observed Gratin perform both kills, wrapped/carried both bodies through the Cabin
wardrobe ladder, and completed the pyre, nightfall, and blackout with zero
runtime, page, request, or HTTP failures.

### Luxury Apartment

The shared two-floor home hub now has the complete staircase/bathroom/privacy
contracts, real main-bathroom lighting, campaign-owned Beat-27 phone, and a
finished top-landing focal piece:

- a 25-mesh patinated-bronze Sasquatch guardian;
- facial planes, long arms, brass halo, and deliberate landing-facing pose;
- veined marble/brass pedestal and dedicated warm museum light;
- 0.823 × 1.717 × 0.815 m measured bounds; and
- 1.066 m minimum clearance from Margo's route.

The frozen-commit browser run passed **63 / 63**: real pointer-lock yaw, the
30/60/120 Hz movement matrix, bathroom round trip, bedroom/wardrobe/privacy
paths, and `gl.readPixels` tone receipts for both lighting states, with zero
runtime, page, request, or HTTP failures.

### THE TAKE final phone

The heist now persists a `safehouse_debrief` checkpoint before Lou rings. One
shared `Phone` answers through the configured interaction action, including a
rebound key, without spawning combat hotbar copies. The exact-once `finalCalls`
receipt saves before `Phone.press()` silences the ringtone. A save failure
therefore leaves the phone ringing; a successful answered reload neither rings
nor replays the call. Three final lines must drain before completion. Targeted
Heist contracts passed 90/90, and the full real browser verifier passed
**103 / 103** through the current final-phone and exit path.

## Persistent record implementation

- `src/core/campaign-stats.js` — bounded statistics, normalization, exact-once
  seams, and v26 THE TAKE facts.
- `src/core/campaign-finale.js` — final-record readiness and persisted view.
- `src/core/campaign.js` — schema migration and scene-boundary aggregation.
- `src/initiation/main.js` — THE PROSPECT'S RECORD and credits presentation.
- `tests/campaign-stats.test.mjs`, `tests/campaign-finale.test.mjs`, campaign
  topology/migration tests, and the marathon — old/partial saves, repeated
  normalization, exact-once reload, Cabin choice, populated finale, and absent
  optional values.

## Supplied music and radio delivery

All six supplied masters are wired through their intended scene owners:

- `Driving Jerky Hotel.mp3` — low non-diegetic Motel drive score under dialogue.
- Twelve new Motel-only 0.600-second stereo 48 kHz footstep takes replace the
  harsh shared bank across concrete, asphalt, carpet, tile, stairs, and pool
  deck; two alternating takes are used per surface.
- `Driving THe take.mp3` — THE TAKE escape-driving score.
- `EnolaPreBombDropApproach.mp3` — approach score stopped immediately at an
  early arrival; never plays over the bomb drop/explosion.
- `EnolaEscapeAfterDrop.mp3` — begins after the authored post-explosion silence.
- `Silver Room (front and center background).mp3` — corridor-muffled, clearer
  inside, and ducked under dialogue.
- `SilverRoomOpening20sec.mp3` — first 27 seconds after the opening joke, then
  faded into Bananaphone with a visible animated trumpeter.

Radio deliverables:

- Workbook: `docs/audits/SQUATCHSMASH-RADIO-AUDIT.xlsx`
- Generator: `tools/radio-audit.mjs`
- Revamp plan: `docs/audits/SQUATCHSMASH-RADIO-REVAMP.md`
- Scene timeline: `docs/audits/radio/scene-timeline.csv`
- Station catalog: `docs/audits/radio/station-catalog.csv`
- Cue inventory: `docs/audits/radio/cue-inventory.csv`
- Problems/decisions: `docs/audits/radio/problems-and-decisions.csv`
- Revamp-plan data: `docs/audits/radio/revamp-plan.csv`
- Loudness receipts: `docs/audits/radio/loudness-measurements.json`
- Spoken-content receipts: `docs/audits/radio/content-transcriptions.json`
- Lifecycle map: `tools/radio-active-play-coverage.mjs`

## Cartel Palace Recast pilot

The pilot remains Cartel-Palace-only and does not replace perception,
suppression, combat reactions, shooting, boss phases, or tactical scoring.

- Service-wing response: old controller failed after 45 s / 2,298 blocked
  frames; pilot arrived in **18.717 s / 5 blocked moves**.
- Stale-contact return: old controller failed after 45 s / 1,741 blocked / 44
  reversals; pilot arrived in **19.583 s / 12 blocked / 0 reversals**.
- Added navmesh: **32,400 bytes**; cold initialization about **1.9 s**;
  measured Palace HTTP payload **1,146,950 bytes**.

Evidence and retain/reject reasoning:
`docs/audits/CARTEL-PALACE-RECAST-PILOT.md`.

## Engineering workflow and rendering tooling

- Root instructions: `AGENTS.md`
- Push card: `BEFORE-YOU-PUSH.md`
- Repository skill: `.agents/skills/squatchsmash-game-development/SKILL.md`
- Spector setup: `docs/engineering/SPECTOR-MCP.md`
- Mirror evidence: `docs/engineering/SPECTOR-MIRROR-EVIDENCE.md`

Spector.js is development-only and is not imported by or shipped with the
game. The machine-local MCP registration is not a portable repository artifact;
the repository carries setup and evidence.

| Scene | Draw calls before | Draw calls with reflected body | WebGL errors |
|---|---:|---:|---:|
| Regular apartment | 3,297 | 3,387 | 0 |
| Luxury apartment | 2,979 | 3,015 | 0 |
| Cabin | 6,322 | 6,369 | 0 |

Sentry was explicitly excluded and was not installed.

## Deterministic visual and trace evidence

`playwright.visual.config.mjs` fixes 960×540, DPR 1, one worker, serial
execution, disabled screenshot animations, seeded/staged checkpoints, and
failure traces containing actions, screenshots, DOM snapshots, console/page
errors, network failures, and readiness state. The canonical set is scheduled;
the regular-apartment mirror smoke runs in pull-request Verify.

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

The retained full visual receipt is **9 / 9 specs and 15 / 15 baselines**. It
was not rerun on the implementation/verifier head and is reported as retained
evidence, not as a frozen-head execution.

## Regression defenses preserved

| Defect class | Durable prevention |
|---|---|
| Siege Armory objective and spawn drift | One mission ledger owns reach/pickup/leave/upstairs state; preview uses canonical geometry anchors and replays real state methods. |
| Family NPC teleporting | Hidden below-floor staging precedes live visibility; later same-post assignment is a no-op. |
| Motel evidence/getaway deadlock | One bounded `MotelEvidenceLedger` owns three fixed IDs, pickups, prompts, checkpoints, and the car gate. |
| Dead Rico speech | Actor death silences current, queued, idle, and future lines and mouth motion. |
| Revolver HUD/ammo disagreement | Shared `Firearm` is the sole rounds/dry-fire/reload authority. |
| Silver waiter collisions | Authored service graph accounts for furniture, diners, trays, deterministic right-of-way, stalls, and returns. |
| Guest counter stuck | Explicit eligible staff IDs and threshold drive one shared objective tally and immediate repaint. |
| Subtitle overlap | Shared subtitle-priority arbitration protects story/direct dialogue from ambient captions. |
| Suppressed carbine leaking into Siege | Frozen shared standard/suppressed profiles; only the Palace adapter opts into suppression. |
| Cabin tool table swallowing tools | Soft aggregate fallback plus real authored-viewpoint raycasts for each tangible tool. |
| Heist phone silence before persistence | Save exact-once receipt before pressing/silencing the shared phone. |

## Integrated verification evidence

Hosted Verify run `33232688679` at production snapshot `912d48b1` passed:

- geometry **100 / 100** states;
- deterministic regular-apartment mirror smoke;
- lint;
- tests **3,830 / 3,830**;
- static checks and flight-model bench;
- fresh-save campaign route;
- boot-failure recovery;
- whole-campaign marathon; and
- single-file preview build.

It then stopped at the no-new-debt step because the checked-in proof inventory
was stale, not because the implementation added debt. A reviewed nine-line
refresh adds THE TAKE's `safehouse_debrief` checkpoint proof and changes the
Luxury typed-geometry count from 949 to 953. The exact gate now passes against
trusted ref `ac320548017605df03a005f48d7f817fca7c3acc` with unchanged ceilings:
architecture 0/0, semantic 134/134, liveness 24/24, and spatial 83 records /
39,111 units.

Final changed/supporting browser receipts include Cabin **118 / 118** plus
**52 / 52**, Luxury **63 / 63**, THE TAKE **103 / 103**, Motel **97 / 97**,
canonical big-night **17 / 17**, Silver story **18 / 18**, Mansion **305 /
305**, Mansion Return **12 / 12**, Mansion Siege **202 / 202**, and Cartel
Palace **87 / 87**, plus Initiation **63 / 63** through the real-input ceremony,
record, credits, and title return. The final-arc durability/preview gate passed
**69 / 69**, including Palace's vendored `.mjs` runtime after the verifier
server was corrected to serve JavaScript MIME and use the measured cold-boot
budget. Graveyard passed **43 / 43**, Silver Case passed **95 / 95** across its
main, alternate, golden, and all six checkpoint routes, and License to Grill
passed **73 / 73** after its stale acceptance checks were aligned with the
authored optional objective and connected whole-figure death pivot. The broader
retained set includes the
complete 15-shot visual baseline, Spector mirror captures with zero WebGL
errors, **543 / 543**
exact rendered-voice receipts, zero reachable VO backlog, and **26 / 26** radio
lifecycle owners.

The final report-containing commit triggers the authoritative workflow again
after push. Its SHA/run URL are external immutable receipts and are recorded in
the delivery message rather than guessed inside the commit itself.

## Owner-only creative decisions

1. Retire or restore the legacy `uncle` and `ksqch` station identities and
   their unreachable ident/sting assets.
2. Decide exact station and venue allocation for retained songs.
3. Decide which physical receivers carry mission-news segments.
4. Decide whether hour-based hosts gain chapter-aware programming.
5. Supply or confirm provenance/license notes for all retained long-form
   masters.
6. Approve gain/normalization after listening on the target setup.
7. Decide whether any of the seven intentionally silent campaign beats gains
   music.
8. Choose whether any weapon-audition favorite replaces a current report.
9. Supply an optional credits track if the ending should not remain silent.
10. Give subjective final sign-off on THE TAKE handling and the full radio/
    dialogue mix.

## Remaining risks stated plainly

- The 26/26 radio lifecycle source map is green. Future lifecycle edits must
  keep its exact receipt text synchronized and rerun the named scene verifiers.
- Automated volume/lifecycle checks cannot certify intelligibility on the
  owner's speakers.
- The Recast pilot's 32.4 KB navmesh and ~1.9 s cold initialization are real;
  it must remain Palace-only unless a later measured decision expands it.
- The Cabin dungeon must never be resolved into the Mansion laboratory or the
  Luxury Apartment during a future conflict.
- A final fast-forward must still be followed to conclusion in hosted Verify
  and Pages; the immutable final run receipts live in the delivery message.

## Final delivery record

| Delivery item | Final value |
|---|---|
| Frozen implementation/verifier head | `c5312e76` on `codex/campaign-qa-polish-20260828`; this report-only closure follows it. |
| `origin/main` reconciliation | Final pre-report fetch found deployed ancestor `912d48b1`, no newer outside work, and eight reviewed commits ready for a fast-forward. |
| Final local scene/gate repairs | Silver story 18/18; Motel 97/97; canonical big-night 17/17; Mansion Siege 202/202; final-arc reloads 69/69; Graveyard 43/43; Silver Case 95/95; License to Grill 73/73; exact trusted-ref debt ratchet green. |
| Push/merge/main commit | The immutable SHA of this report-containing fast-forward is recorded by the delivery message after the commit exists. |
| GitHub Verify | Run `33232688679` proved every step through preview build green at `912d48b1`; its sole stale-inventory failure is repaired and locally reproduced green. Final-head run is linked externally. |
| GitHub Pages | Run `33232688689` completed success at `912d48b1`, including campaign verification, staging, artifact upload, and deployment. |
| Live Pages smoke | 10/10 hosted routes ready; zero page/console/request/HTTP/WebGL failures; all twelve new Motel footsteps return 200 and WebAudio-decode at 0.600 s, stereo, 48 kHz. |
