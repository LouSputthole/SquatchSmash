# Playtest handoff coverage — 2026-08-27

This ledger reconciles the owner's two supplied playtest briefs with the current
engineering-completion branch. It is deliberately separate from the campaign
Jobs 0–12 ledger: a campaign job can be complete while a scene-level playtest
note still needs proof.

## Inputs

- `COMBINED SCENE POLISH, DIALOGUE, SYSTEMS, AND QA PASS` — Silver Case,
  Luxury Apartment, Cabin, objectives, HUD scoping, mirrors, and player body.
- `FULL POLISH / QA / IMPLEMENTATION PASS` — Initiation, Jerky Motel, Silver
  Front & Center, Mansion Siege, and global subtitle/objective/audio rules.
  The three supplied copies of this brief are byte-identical, so they are one
  checklist rather than three divergent requests.
- The separate delivered-music brief — Jerky drive, THE TAKE drive, Enola
  approach/silence/escape, and the two Front & Center masters.
- The later engineering handoff — Jobs 0–12, the four tooling additions, and
  the settled story/architecture decisions.

## Evidence language

- **Contracted** means production source exists and a registered automated test
  asserts the requested mechanism.
- **Browser-covered** means the scene verifier exercises the live page through
  the production interaction surface. It does not mean the verifier has been
  rerun in the final all-gates pass yet.
- **Final visual pending** means a canonical baseline may now be committed, but
  the complete integrated visual run and human diff review are still release
  evidence rather than assumptions.
- **Owner choice** means the implementation has intentionally stopped at a
  review surface because selecting creative material on the owner's behalf
  would change authored intent.

The original scene-polish batch recorded **209 / 209 focused source contracts
passing**. Later commits added their own focused receipts, listed in the Jobs
0–12 ledger below. This is a committed-state audit at
`077d58d95e95911aa2ab2da2a131ef2692d462fe`; it is not a substitute for the
final integrated browser, full-gate, debt-ratchet, push, or Pages receipts.

## Combined scene-polish brief

### The Silver Case — items 1.1–1.10

| Owner items | Current implementation and proof | Status |
| --- | --- | --- |
| 1.1 opening VO audit; 1.2 remove overlapping “colors” choice; 1.3 case presentation; 1.4 first execution timing | The opening bank is exact-cue and recorded; the stray player/colors branch is absent; the duffel clears before the case opens; the ordered target and gun prompt arm only after Ape finishes. `tests/silvercase-dialogue-contract.test.mjs`; `tools/verify-silvercase.mjs`. | Contracted; browser-covered; final visual pending |
| 1.5 Chester reacts; 1.6 revised five-line Ape/Chester exchange; 1.7 Squatchiel 69:17 | Exact dialogue-order contracts pin Chester's immediate named reaction, the requested exchange, the full passage, and the Prospect-owned final vengeance line. The live verifier also proves the flinch, recorded playback, eyelines, and prompt timing. | Contracted; browser-covered |
| 1.8 bathroom ambush and door; 1.9 real bathroom interior | The attacker comes through an open built door, lands two authored misses, then becomes shootable. The room has reused toilet, sink, finished floor/ceiling, practical light, and collision. | Contracted; browser-covered; final visual pending |
| 1.10 seated death and Winston decision tension | The shared connected-body pose holds seated corpses in their chairs without drift; Winston's 25–30 second live choice owns pose and room-tension audio. `tests/silvercase-cast.test.mjs`. | Contracted; browser-covered |

Primary implementation commits: `d9bdf5bc`, `bdaee880`.

### Luxury Apartment — items 2.1–2.20

| Owner items | Current implementation and proof | Status |
| --- | --- | --- |
| 2.1 darts visibility/scoring; 2.2 art conflict | The physical dart loop uses real hold/release input, ballistic impacts, score/reset/exit, and the world has a validated non-conflicting art inventory. | Contracted; browser-covered |
| 2.3 elevator progression; 2.4 couch; 2.5 entertainment cabinet; 2.6 appliances | The service door stays sealed; the private elevator owns arrival/exit and refuses early use. The lounge is a joined sectional, the cabinet is a physical station, and the complete domestic utility set is present and interactive. | Contracted; browser-covered |
| 2.7 poker geometry; 2.8 remove random players and game | The felt, rail, chips, and all four chairs remain. No NPC cast or blackjack mount remains; interacting gives the authored solo refusal without seating the player. `tests/luxury-apartment-poker-table.test.mjs`. | Contracted; browser-covered |
| 2.9 under-stair layout; 2.10 collision | The bathroom/elevator deliberately resolve the stacked floor; the main-floor bathroom has mounted fixtures, a live door, and a real-input round trip. | Contracted; browser-covered; final visual pending |
| 2.11–2.17 upstairs art, desk/picture, stair focal point, plant, bedroom wall/photos/nightstands | All inherited and additional art resolves to real assets with semantic placement; the workstation, bedroom, skyline, lighting, and furnishing contracts are validated in `tests/luxury-apartment-world.test.mjs` and the 49-check browser verifier. | Contracted; browser-covered; final visual pending |
| 2.18–2.20 bathroom glass/entry/expansion/mirror | The relocated bathroom is traversable, complete, and uses the approved shared mirror foundation. The shared reflected body/outfit/lighting pass was separately captured with Spector evidence. | Contracted; browser-covered; Spector-proven; final baseline pending |

Primary implementation commits: `bdaee880`, `cd1079ad`, `75eae53d`,
`8f0a0f95`.

### Cabin / Hideout — items 3.1–3.18

| Owner items | Current implementation and proof | Status |
| --- | --- | --- |
| 3.1 tree variety; 3.2 trunks/draw distance; 3.3 sky/day light | Five visual species share the instanced forest; no visible canopy outlives its trunk; the shared procedural sky has sun/clouds and still grades to the authored night. `tests/cabin-outdoor-world.test.mjs`. | Contracted; browser-covered; final visual pending |
| 3.4 Lag role; 3.5 chopping animation | Canonical Lag owns the repeating firewood loop. Hip hinge, facing, wrist/axe path, pelvis continuity, interruption, talk-facing, bonfire seating, and resume clock are measured in the Cabin fixture/Lag suites. | Contracted; browser-covered |
| 3.6 photo; 3.7 bathroom wall intrusion | The nightstand frame is supported; all exterior cladding/foundation pieces are absent from the bathroom interior. | Contracted; browser-covered |
| 3.8 mirror; 3.9 shared first-person body | Cabin reuses `PlanarMirror` and `first-person-body`; persisted outfit IDs change the reflected body without obstructing the normal view. Spector captured the real reflected draw pass. | Contracted; Spector-proven; final baseline pending |
| 3.10 rifles before night; 3.11 remove range spoiler | Three live wall-rack carbines are aimable on Day 2; the range no longer names Gratin, cellar, or dungeon. Basement AK/Barrett mounts remain. | Contracted; browser-covered |
| 3.12 bridge collision | The real Player capsule crosses the entire bridge from both banks without being ejected into the creek. | Contracted; browser-covered |
| 3.13 score HUD; 3.14 radio HUD | The finished score expires outside the firing-line radius; the station readout follows the Cabin receiver's audible radius rather than its on/off latch. | Contracted; browser-covered |
| 3.15 creek; 3.16 ridge | Real ray acquisition works from legal standing ground; creek focus mixes the water/forest and exits on input or movement. | Contracted; browser-covered |
| 3.17 Lou objective timing; 3.18 remove “Finish the Cabin Chapter” | Cabin projects one truthful parent objective and only the current soft step; the call is pending until it exists and the vague chapter label is gone. The all-scene audit subsequently repaired Apartment, Bing I/II, Graveyard, and THE TAKE through the same shared lifecycle. | Contracted; Job 12 committed in `f2b8095d`; final integrated gates pending |

Primary implementation commits: `493c1c67`, `933dacd4`, `986ea417`,
`bdaee880`, `8f0a0f95`.

### Global items 4–9

| Owner area | Current implementation and proof | Status |
| --- | --- | --- |
| Objective lifecycle and no spoilers | Shared `ObjectivePanel` supports `pending` and `retire`; meaningful tallies remain opt-in. The campaign-wide audit derives visible steps from the same live state that owns interactions and exits. | Shared mechanism and Job 12 contracted; final integrated gates pending |
| HUD scoping | Cabin range/radio, shared inventory, objective, and subtitle HUDs have explicit scope contracts. The completed all-scene pass covers lingering state plus direct-entry/reload behavior. | Contracted; Job 12 committed in `f2b8095d` |
| Mirrors/player body | Shared body applies only to regular apartment, luxury apartment, and Cabin. Combat scenes and Squatchfather are untouched by this pass. | Contracted; Spector-proven |
| Asset reuse/root-cause standard | Shared mirror/body/objective/radio/death-transition systems were reused; the commits quote measured faults instead of hiding them behind scene-local wrappers. | Enforced by repository workflow and tests |

## Full polish / QA brief

### Initiation — items 1–10

| Owner items | Current implementation and proof | Status |
| --- | --- | --- |
| staff clipping; first execution; following formation | The staff stays in the off hand and outside the body; the execution revolver has one visible copy; the Circle walks in loose pairs and every member uses the measured cabin-door route. | Contracted; browser-covered |
| dead air/pacing; Saint Squatch card; player-held ceremonial shot | The cabin entry walks rather than checkpoint-snaps, authored gates own the pacing, the real registered card has a bounded burn lifecycle, and the hand prompt/raise/shot have separate phases. | Contracted; browser-covered; final visual pending |
| salutes; Gratin line; ending; full credits | Family acknowledgements are queued/animated, the owner line is pinned immediately before Kittenboss's shot, and the scene fades directly into the shared full credit roll with a deterministic natural ending. `campaign-finale.js` now reads the bounded saved record rather than reconstructing it from scene state. | Contracted; browser-covered; Job 6 committed in `a0c103cc`; visual baseline committed in `df167002` |

Primary implementation commit: `ca49ca6e`.

### Jerky Motel — items 11–20

| Owner items | Current implementation and proof | Status |
| --- | --- | --- |
| footsteps and car-exit sound | Quiet surface banks, cadence protection, positional NPC steps, and no stacked exit report are asserted; the supplied Jerky driving master is low, non-diegetic, and below dialogue. | Contracted; browser-covered |
| Snow/window/chair; sample placement; Snow door; window traversal | Required interactions cannot be stolen by chairs; doors visibly open; all windows declare the fully-blocked traversal contract; the player's sample placement is explicit, animated, confirmed, and checkpointed. | Contracted; browser-covered |
| Rico after death; revolver ammo | Dialogue liveness is owned by actor death for current/queued/future lines; the HUD reads the same `Firearm` that owns shots, dry fire, and reload state. | Contracted; browser-covered |
| evidence cases; checkpoint regression | All eight case permutations produce one deterministic getaway answer; each physical case has an authoritative pickup/marker; the car says exactly what remains; requested checkpoint states have concrete authorities. | Contracted; browser-covered; final visual pending |

Primary implementation commit: `ca49ca6e`.

### Silver Front & Center — items 21–44

| Owner items | Current implementation and proof | Status |
| --- | --- | --- |
| opening subtitle load; descriptive ambient captions; objective duration | Only spoken copy enters the subtitle lane; ambient floor lines do not cover story speech; the objective notice is bounded. | Contracted; browser-covered |
| cellar/detail; kitchen audio; passive dialogue | Cellar/service dressing is physical; kitchen/service ambience is scoped; ambient dining-floor talk rotates through distinct voices and stays below required dialogue. | Contracted; browser-covered |
| arrival camera; Margo seating; table lamp | The live verifier follows the carried table, seats Margo in the opposite chair, preserves her seated pose, and proves the lamp does not glare while she remains visible. | Browser-covered; final visual pending |
| background music | The supplied room score is non-positional, muffled in the corridor, louder in-room, and dialogue-ducked. The 27-second supplied opening starts after the joke and hands directly to Bananaphone; the featured recording stops the house-band stems. | Contracted; browser-covered |
| guest counter; bandleader identity; waiter movement/trays/champagne | The roster remains lookable, the bandleader has one dedicated voice across all eight cues, servers use collision prediction/right-of-way, two staff carry the table, and champagne/service props are physical. | Contracted; browser-covered |
| player/Margo drinks; paired shots; drink state/service cycle | Drink delivery, bottle/source order, paired table shots, and service-return behavior are source- and browser-covered. | Contracted; browser-covered |
| dance; Margo return; Woo score | The dance uses forgiving/assist windows and persists correctly; every Woo band returns an affirmative Margo answer while changing delivery, not route; the relationship is handed to campaign state. | Contracted; browser-covered |
| “same person” diner concern | `DINER_VOICE_PROFILES` rotates `silver-diner-a/b/c`; the cast uses distinct ElevenLabs voice IDs, while waiters and bandleader retain separate staff profiles. `tests/silver-diner-voices.test.mjs`. | Contracted; original focused batch includes this check; rendered-voice receipts committed in `9c89bb4f` |

Primary implementation commit: `ca49ca6e`.

### Mansion Siege — items 45–65

| Owner items | Current implementation and proof | Status |
| --- | --- | --- |
| headshots; deliberate first-shot accuracy | Head hitboxes are lethal even with the weakest sidearm; the first stationary shot follows the center reticle while movement/rapid fire owns bounded bloom. | Contracted; browser-covered |
| weapon sound variants; audition page | Standard carbine is unsuppressed; Palace alone selects the suppressed profile. Every catalog weapon has current plus five delivered alternatives, normalized comparison controls, single/burst/auto modes, and persistent favorites at `weapon-sound-audition.html`. | Contracted; **owner choice** to promote favorites |
| armory soft-lock/state/checkpoint | Reaching the armory, every pickup permutation, full inherited loadout fallback, refusal recovery, armed checkpoint, armor, and route back upstairs are asserted and exercised in the live verifier. | Contracted; browser-covered |
| bedroom door/squad teleport/staging/spawns/facing/dialogue | The ensemble preserves checkpoint facing and injury state, routes through authored entrances, stages outside the foyer, and uses spatial/exact-once dialogue. | Contracted; browser-covered |
| “little friend” | The protected hero line owns an exact VO cue and mix; the live staging keeps Eric, blood, and guard clear while the shared speech seam animates the speaker. | Contracted; browser-covered |
| walls/floors, damage direction | Shared LOS/ballistic blockers stop shots; the quieter hunt pip and damage wedge are pinned to the reticle without revealing future targets through geometry. | Contracted; browser-covered |
| dead woman identity; black boxes; destruction; art | The dead performer is explicitly house staff, not Margo; route/dressing tests reject blocking/translucent debris; glass, fires, wrecks, command/triage stations and battle damage are physical; placeholder/recovered art uses named supported placements. | Contracted; browser-covered; final visual pending |

Primary implementation commit: `ca49ca6e` (with the deeper pre-existing Siege
combat/staging suite retained).

### Global rules 66–69

| Owner rule | Current implementation and proof | Status |
| --- | --- | --- |
| subtitle priority | `src/core/subtitle-priority.js` lets story speech preempt ambient flavor without freezing gameplay; expiry and release are deterministic. | Contracted |
| objective state/display | Shared pending/retire behavior and the all-scene state/exit/reload audit are committed in Job 12. | Contracted; final integrated gates pending |
| audio scene variants | `src/core/weapons/audio.js` owns standard/suppressed profiles; scene music modules own their buses, stop points, and ducking. Physical Luxury and Mansion receivers now persist through the shared campaign adapter. | Contracted; active-scene overlap/mix review remains |

## Delivered music brief

| Supplied master | Current behavior and proof | Status |
| --- | --- | --- |
| `Driving Jerky Hotel.mp3` | Low non-diegetic drive score below dialogue. | Contracted; browser-covered |
| `Driving THe take.mp3` | Scene-owned escape driving score; vehicle-feel measurements and live heist browser verifier remain green at the feature commit. | Contracted; browser-covered |
| `EnolaPreBombDropApproach.mp3` | Approach cue targets the bomb-release boundary and stops immediately if arrival wins the race; the drop/explosion is silent. | Contracted; clue/payoff implementation committed in `db894088`; deterministic cockpit baseline committed in `df167002` |
| `EnolaEscapeAfterDrop.mp3` | Starts only after the explosion's authored silent hold. | Contracted; clue/payoff implementation committed; final integrated gates pending |
| `Silver Room (front and center background).mp3` | Corridor-muffled, in-room audible, dialogue-ducked non-positional room score. | Contracted; browser-covered |
| `SilverRoomOpening20sec.mp3` | Exactly 27 seconds after the opening joke, then direct handoff/fade into Bananaphone; stage trumpeter visibly plays and works the valves. | Contracted; browser-covered |

## Jobs 0–12 current-state ledger

This ledger audits the committed branch snapshot
`077d58d95e95911aa2ab2da2a131ef2692d462fe`. Abbreviated hashes below resolve
uniquely in this repository. “Implemented” means the scoped production change
and its narrow receipts are committed; it does **not** mean the final integrated
gate, push, merge, or Pages run has happened.

| Job | State | Commits and principal paths | Measured evidence and remaining risk |
| --- | --- | --- | --- |
| 0 — Current baseline | Baseline established; release refresh pending | Baseline `56e3fb2d`; this audit snapshot `077d58d9`; `CLAUDE.md`, `.github/workflows/verify.yml`, `docs/CAMPAIGN-STORY-BIBLE.md`, `src/core/campaign-spine.js` | The task branch contains all work below while `origin/main` still points to `56e3fb2d`. Cheap/narrow receipts are recorded per job, but the final post-integration gate sequence and trusted-ref debt ratchet remain open. |
| 1 — Luxury browser checks | Implemented | `d9bdf5bc`, `f3c8fc2c`, reaffirmed by `75eae53d`; `tools/verify-luxury-apartment.mjs`, `src/core/first-person-input.js`, `src/luxury-apartment/main.js` | Real pointer lock plus mouse movement must change yaw; real W/S traversal must enter and leave the bathroom before the E-close action. The current Margo-era verifier recorded 49/49. The cheap visual mirror smoke is now connected to `verify.yml`; the full scene verifier remains tiered/scheduled. |
| 2 — Shared body and three mirrors | Implemented | `d9bdf5bc`, `bdaee880`, `8f0a0f95`; `src/core/planar-mirror.js`, `src/core/first-person-body.js`, `src/cabin/player-body.js`, `src/luxury-apartment/main.js`, `src/main.js`, `docs/engineering/SPECTOR-MIRROR-EVIDENCE.md` | Spector captured `#scene`, WebGL2, 1920×1080: Apartment 3,297→3,387 draws, Luxury 2,979→3,015, Cabin 6,322→6,369, with zero GL errors. Outfit `cream_cashmere` appears in all three reflections while normal first-person view remains bodyless. Combat scenes and Squatchfather were not changed. |
| 3 — Margo beats 16/17 | Implemented | `75eae53d`; `src/luxury-apartment/margo-scene.js`, `src/luxury-apartment/main.js`, `src/core/apartment-story.js`, `src/world/dress-help.js` | Entrance, two-floor waypoint route, stairs, both dress-help beats, sleep/snore, free wandering, morning departure, and Lou-after-exit ordering are contracted. Focused Margo checks were 10/10 and the full Luxury browser verifier 49/49. Five Margo visual states are committed in `df167002`. |
| 4 — Beat 27 Special Meeting call | Implemented | `bc2eb161`; `src/core/campaign-spine.js`, `src/core/luxury-apartment-story.js`, `src/core/campaign.js`, `src/luxury-apartment/main.js`, `tools/verify-campaign-marathon.mjs` | The luxury-apartment call hands into the existing `specialmeeting.html` pickup/ride/trunk/ceremony flow, with exact-once call state and no extra ride scene. The spine has 31/31 wired beats and `tests/campaign-spine.test.mjs` pins `PENDING_BUDGET = 0`. Final integrated marathon rerun remains open. |
| 5 — Day 12/13 tail | Implemented | `ebe99416`, with early verifier alignment `87b6d592`; `src/core/campaign.js`, `docs/CAMPAIGN-STORY-BIBLE.md`, `tests/campaign-clock.test.mjs`, `tools/verify-campaign-marathon.mjs` | Runtime anchors, spine tests, bible, and engineering notes move together. The exact landing ledger is below. No clock is pulled backward through `Math.max`; final integrated marathon/gates remain open. |
| 6 — THE PROSPECT'S RECORD | Implemented | `a0c103cc`; `src/core/campaign-stats.js`, `src/core/campaign-finale.js`, `src/core/campaign.js`, `src/initiation/main.js`, `tests/campaign-stats.test.mjs`, `tests/campaign-finale.test.mjs` | Schema v24 adds one bounded block and a fixed 16-mission aggregation ledger. Tests cover pre-v24/partial saves, repeated normalization, exact-once reload, cabin choice, 16/16 marathon population, and absent optional credit fields. No grades, best scores, per-shot save writes, event log, or route branch were added. The final-record visual baseline is committed; final integrated save/marathon run remains open. |
| 7 — THE TAKE escape-car feel | Implemented and measured; owner feel check remains | `934a0513`, browser-harness hardening `09fa8a5a`; `src/heist/main.js`, `docs/audits/THE-TAKE-ESCAPE-CAR-EVIDENCE.md`, `tools/verify-heist.mjs` | 0→90 mph 7.60 s; steady speed 91.71454 mph; 60→0 in 1.633 s / 22.90 m. Three final browser repetitions measured exactly 35.473020° steering and 6.774620 m in the atomic 60-mph quarter-second probe, each 9/9. Automated contracts cannot decide whether the final handling and mix feel fun on the owner's hardware. |
| 8 — Enola clue and Mansion reveal | Implemented | `db894088`; `src/enolasquatch/config.js`, `src/enolasquatch/main.js`, `src/mansion/main.js`, scene dialogue contracts and verifiers | The cockpit shows BOMB ORDER / THE DESERT COMPOUND against NAV FIX / SQUATCHBOURG; no spoken line points it out. Lou pays it off only at repaired Mansion. Deterministic Enola-instrument and Mansion-debrief baselines are committed in `df167002`; final integrated browser/audio gates remain open. |
| 9 — Original post-Siege call | Implemented | `90d7e372`; `src/mansion/siege/main.js`, `src/mansion/siege/script.js`, `tools/siege-vo.mjs`, `tools/verify-siege.mjs` | The original A-Team confrontation uses shared ring/pickup/hangup behavior, motivates Enola, avoids copied Taken phrasing, and is exact-once across reload. The live verifier captured the call and no-replay seam. Its rendered assets are included in Job 10; final integrated Siege/route gates remain open. |
| 10 — Voice backlog | Rendered and committed; release verification pending | `9c89bb4f`, CI wiring `077d58d9`; `assets/sfx/`, `assets/sfx/index.json`, `assets/sfx/manifest.json`, `assets/sfx/takes.json`, `docs/audits/VOICE-GENERATION-PASS-2026-08-27.md`, `docs/audits/voice/rendered-voice-receipts.json` | The commit rendered 207 outstanding cues (204 new, three corrected Silver takes), reports the reachable backlog at 0/4,123, and stores 386/386 hash/text/voice/browser-decode receipts plus a 15-take Scribe cast sample. Its focused voice/dialogue/ledger checks passed, and the receipt check is now in `verify.yml`; the final integrated audio/take/rerecord suite and push receipt remain open. |
| 11 — Radio audit and revamp | Audit/content/mechanical work committed; owner decisions and active-play mix review remain | `d6f2ae0e`, `14cc6c94`, `4d7d01ef`, `b2e63abb`, CI wiring `077d58d9`; `tools/radio-audit.mjs`, `docs/audits/SQUATCHSMASH-RADIO-AUDIT.xlsx`, `docs/audits/radio/*.csv`, `docs/audits/SQUATCHSMASH-RADIO-REVAMP.md`, `docs/audits/radio/content-transcriptions.json`, `src/core/stations.js` | All 31 beats are in the generated workbook; five sheets rendered with zero formula/error tokens. The latest receipts cover 298/298 spoken assets, 24/24 loudness-measured music masters, 26/26 focused contracts, and zero missing audit assets; audit, loudness, and content drift checks are now in `verify.yml`. Luxury/Mansion receiver state persists. Still open: active-scene overlap/teardown/mix listening, four legacy identity orphans, long-form provenance, venue/news allocation, and other explicit OWNER rows. |
| 12 — Objective honesty | Implemented | `f2b8095d`, with clock/browser alignments `87b6d592` and `09fa8a5a`; `src/core/objective-panel.js`, Apartment/Bing I/Bing II/Graveyard/THE TAKE objective sources, `tests/objective-*.test.mjs` | Before: Bing exposed four jobs plus its optional room, THE TAKE seven future swaps, and Apartment a call before it rang. After: one Bing route step plus one soft task, the next 0–7 THE TAKE action with a deliberate 7/7 receipt, and only a physically ringing Apartment call. Evidence: 89 focused contracts, Bing 163/163, Bing Two 35/35, Graveyard 43/43, and Heist 9/9 in three final runs. Graveyard's 8/8 tally and THE TAKE's 7/7 receipt remain intentionally persistent. Final full repo suite remains open. |

### Final-arc landing ledger

These are actual route landings, not merely static clock-table labels:

| Handoff | Landing day/time |
| --- | --- |
| Enola → repaired Mansion | Day 9, 18:00 |
| Repaired Mansion → Cartel Palace | Day 12, 19:15 |
| Cartel Palace → Luxury Apartment | Day 12, 23:00 |
| Luxury Apartment → Special Meeting | Day 13, 17:55 |
| Special Meeting → Initiation | Day 13, 19:00 |
| Initiation → Apartment/credits tail | Day 13, 20:50 |

The corresponding named anchors are Mansion return Day 12 18:30, Palace
departure Day 12 20:30, Special Meeting pickup Day 13 17:55, and Initiation
Day 13 19:00.

## Approved tooling stack

| Addition | Committed state | Evidence / remaining work |
| --- | --- | --- |
| Spector.js MCP | Setup contract `424f8391`; real mirror receipts `8f0a0f95` | `docs/engineering/SPECTOR-MCP.md` gives the external install/configuration steps and keeps Spector out of the game. `docs/engineering/SPECTOR-MIRROR-EVIDENCE.md` records real captures. The repository does not prove that the developer's current Codex MCP registration is installed/enabled. |
| SquatchSmash skill and agent guidance | `88862f5d` | `.agents/skills/squatchsmash-game-development/SKILL.md`, `AGENTS.md`, and `BEFORE-YOU-PUSH.md` route agents to the canonical docs and verification order. |
| Deterministic Playwright visual/trace evidence | `df167002`; committed, final integrated run/review pending | `playwright.visual.config.mjs` fixes 960×540, DPR 1, one worker, disabled screenshot animations, and retains traces/screenshots on failure. `tests/visual/` contains 15 reviewed canonical PNGs: three mirrors, Luxury living room, five Margo states, Mansion foyer/debrief, Enola instrument, Palace courtyard, THE TAKE car, and final record. PR CI runs the regular-apartment mirror smoke; scheduled/manual CI runs the full serial suite and uploads failure artifacts. |
| Palace-only Recast pilot | `3d34cf96`; merged only for Palace | `docs/audits/CARTEL-PALACE-RECAST-PILOT.md`, `src/cartel-palace/navigation.js`, checked-in 32,400-byte navmesh, and vendored MIT runtime. Service-wing failure improved from 45 s / 2,298 blocked frames to 18.717 s / five; stale-return failure improved from 45 s / 1,741 blocked / 44 reversals to 19.583 s / 12 / zero. Cold initialization was about 1.9 s and Palace payload 1,146,950 HTTP bytes, so no wider rollout is authorized. |

## Explicit remaining risks / choices

1. The branch is not released: `origin/main` remains at `56e3fb2d`. The final
   authoritative gate order, trusted-ref debt ratchet, push/merge, Verify, and
   Pages deployment receipts are still required after every committed stream is
   reconciled.
2. The visual stack and 15 baselines are committed, but the final integrated
   full visual run and human review of any diff remain separate release evidence.
3. Voice generation reports a zero reachable backlog and stores decode/content
   receipts, but final integrated VO, dialogue, reachability, rerecord, take, and
   audio-ledger gates must still run on the complete branch.
4. Radio source/content auditing is now repeatable and most mechanical receiver
   work is committed. Active-play overlap/stop/restore/teardown and audible mix
   review remain open; creative rows stay OWNER decisions. In particular, do not
   silently delete four legacy identity orphans, assign venues/news coverage,
   invent chapter programming, or assert license/provenance facts.
5. Weapon-audition favorites remain review data until the owner chooses which
   candidate, if any, should replace each production report.
6. Automated vehicle numbers protect the Job 7 contract, but the owner still has
   to judge final escape-car handling and engine/music feel on the target machine.
