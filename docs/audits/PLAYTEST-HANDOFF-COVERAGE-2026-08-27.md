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
- **Final visual pending** means the deterministic baseline/active-play capture
  is still part of this branch's remaining visual-regression job.
- **Owner choice** means the implementation has intentionally stopped at a
  review surface because selecting creative material on the owner's behalf
  would change authored intent.

On this branch, the focused source-contract run for the rows below is currently
**209 / 209 passing**. The final report must still list each browser verifier
and full gate actually rerun after all concurrent jobs land.

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
| 3.17 Lou objective timing; 3.18 remove “Finish the Cabin Chapter” | Cabin projects one truthful parent objective and only the current soft step; the call is pending until it exists and the vague chapter label is gone. The all-scene objective-honesty pass is still active for non-Cabin scenes. | Cabin contracted; global audit active |

Primary implementation commits: `493c1c67`, `933dacd4`, `986ea417`,
`bdaee880`, `8f0a0f95`.

### Global items 4–9

| Owner area | Current implementation and proof | Status |
| --- | --- | --- |
| Objective lifecycle and no spoilers | Shared `ObjectivePanel` supports `pending` and `retire`; meaningful tallies remain opt-in. Every scene is being audited against the state that owns its interaction/exit gate. | Shared mechanism contracted; Job 12 active |
| HUD scoping | Cabin range/radio, shared inventory, objective, and subtitle HUDs have explicit scope contracts. The all-scene pass checks lingering state and direct-entry/reload behavior. | Contracted where named; global audit active |
| Mirrors/player body | Shared body applies only to regular apartment, luxury apartment, and Cabin. Combat scenes and Squatchfather are untouched by this pass. | Contracted; Spector-proven |
| Asset reuse/root-cause standard | Shared mirror/body/objective/radio/death-transition systems were reused; the commits quote measured faults instead of hiding them behind scene-local wrappers. | Enforced by repository workflow and tests |

## Full polish / QA brief

### Initiation — items 1–10

| Owner items | Current implementation and proof | Status |
| --- | --- | --- |
| staff clipping; first execution; following formation | The staff stays in the off hand and outside the body; the execution revolver has one visible copy; the Circle walks in loose pairs and every member uses the measured cabin-door route. | Contracted; browser-covered |
| dead air/pacing; Saint Squatch card; player-held ceremonial shot | The cabin entry walks rather than checkpoint-snaps, authored gates own the pacing, the real registered card has a bounded burn lifecycle, and the hand prompt/raise/shot have separate phases. | Contracted; browser-covered; final visual pending |
| salutes; Gratin line; ending; full credits | Family acknowledgements are queued/animated, the owner line is pinned immediately before Kittenboss's shot, and the scene fades directly into the shared full credit roll with a deterministic natural ending. | Contracted; browser-covered; final-record integration active in Job 6 |

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
| “same person” diner concern | `DINER_VOICE_PROFILES` rotates `silver-diner-a/b/c`; the cast uses distinct ElevenLabs voice IDs, while waiters and bandleader retain separate staff profiles. `tests/silver-diner-voices.test.mjs`. | Contracted; 209/209 focused run includes this check |

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
| objective state/display | Shared pending/retire behavior is contracted; the all-scene state/exit/reload audit is Job 12. | Active |
| audio scene variants | `src/core/weapons/audio.js` owns standard/suppressed profiles; scene music modules own their buses, stop points, and ducking. | Contracted; radio lifecycle follow-through remains |

## Delivered music brief

| Supplied master | Current behavior and proof | Status |
| --- | --- | --- |
| `Driving Jerky Hotel.mp3` | Low non-diegetic drive score below dialogue. | Contracted; browser-covered |
| `Driving THe take.mp3` | Scene-owned escape driving score; vehicle-feel measurements and live heist browser verifier remain green at the feature commit. | Contracted; browser-covered |
| `EnolaPreBombDropApproach.mp3` | Approach cue targets the bomb-release boundary and stops immediately if arrival wins the race; the drop/explosion is silent. | Contracted; final Enola clue/payoff verifier active |
| `EnolaEscapeAfterDrop.mp3` | Starts only after the explosion's authored silent hold. | Contracted; final verifier active |
| `Silver Room (front and center background).mp3` | Corridor-muffled, in-room audible, dialogue-ducked non-positional room score. | Contracted; browser-covered |
| `SilverRoomOpening20sec.mp3` | Exactly 27 seconds after the opening joke, then direct handoff/fade into Bananaphone; stage trumpeter visibly plays and works the valves. | Contracted; browser-covered |

## Engineering handoff beyond the scene briefs

The following are not omitted merely because they do not appear in the two
playtest documents:

- Spector MCP and real mirror-frame evidence — complete.
- Repository skill, `AGENTS.md`, and `BEFORE-YOU-PUSH.md` — complete.
- Luxury Margo beats 16/17 — complete.
- Beat 27 Special Meeting call — complete.
- Day 12/13 tail repair — complete.
- Cartel Palace Recast pilot — complete and isolated to Palace.
- Campaign statistics and THE PROSPECT'S RECORD — active.
- Enola wrong-city instrument and Lou payoff — active.
- Persistent all-scene objective honesty — active.
- Generated radio/music workbook, CSVs, revamp plan, and generator — complete;
  non-creative mechanical follow-through remains before Job 11 is closed.
- ElevenLabs generation/recording packet — waits for the final authored ledgers
  from the active Enola/stats/objective jobs.
- Deterministic visual regression and trace evidence — queued immediately after
  those scene states stop moving.

## Explicit remaining risks / choices

1. Weapon-audition favorites are review data until the owner chooses which
   candidate, if any, should replace each production report.
2. The radio audit found legacy station identities and programming/provenance
   decisions that are creative. They remain OWNER rows; no station or song will
   be silently deleted or reassigned.
3. Radio receiver persistence, stop/restore/overlap receipts, loudness analysis,
   and source-only orphan review are mechanical follow-through and must not be
   mislabeled as finished by the existence of the spreadsheet.
4. Contract tests do not replace the final live-browser and visual-baseline run.
   The final report must show those results separately.
