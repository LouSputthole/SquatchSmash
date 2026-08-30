# Campaign QA and Dialogue Report — 2026-08-28

> **Integration evidence ledger.** This report describes the current review
> branch, the tested implementation/verifier head, the first pushed production
> snapshot, and its hosted browser evidence. The immutable SHA of this
> report-only closure commit and its post-push workflows are necessarily
> recorded in the delivery message rather than self-referenced here.

## Evidence scope

This report reconciles the owner's campaign QA, dialogue, Luxury Apartment,
Cabin dungeon, and final integration requests with the current campaign spine,
story bible, source, registered tests, generated audio/radio artifacts, and
browser verifiers.

| Evidence | SHA-256 |
|---|---|
| `C:\Users\cargi\.codex\attachments\a4e44e59-8a9c-4355-be72-12d028b80b30\pasted-text.txt` — 25-item campaign QA/polish pass | `5BF37B52222B42EEE13567C813A833BC95757FCF2A6BA5940B040E5EE6F41D85` |
| `C:\Users\cargi\.codex\attachments\28dd1123-4b40-43e2-b6a1-7da7e49b39af\pasted-text-1.txt` — Luxury Apartment, Beat 27, and dungeon handoff | `E23555313CE25244D256F316B930E6CD97CAF2AB41ABB34AC4E5EA525AF11065` |

The second attachment is not campaign authority where it combines unrelated
chapters. `docs/CAMPAIGN-STORY-BIBLE.md`, `src/core/campaign-spine.js`, and the
owner's later explicit Cabin ruling supersede that ambiguity.

## Repository and latest-main reconciliation

The report refresh observed this integration state before the final scene
commits and report commit:

| Item | Observed value |
|---|---|
| Working branch | `codex/campaign-qa-polish-20260828` |
| Tested implementation/verifier head | `c5312e76` |
| Latest deployed `origin/main` snapshot at report close | `912d48b149aa737d627658d6cae06a1bc0e7cc53` |
| Divergence before the report-only commit | 8 commits ahead, 0 behind |
| Campaign schema | v26 |
| Campaign spine | 31/31 wired; `PENDING_BUDGET = 0` |
| Final report-containing commit | Recorded by the final push receipt; a commit cannot contain its own SHA. |

The branch is no longer behind `origin/main`; the earlier four-commit-behind
warning is obsolete. A full remote-tip and pull-request audit found no newer
merge candidate outside main. The six remaining unmerged tips were inspected
and classified as stale, superseded, or patch-equivalent:

- `origin/claude/outfit-refinement-pass-d2lk39`
- `origin/claude/squatch-combat-framework-ujeaw1` (stale PR #17)
- `origin/codex/beefrun-front-center-polish-20260802`
- `origin/codex/no-wake-production-20260731`
- `origin/codex/scene-certification-foundations`
- `origin/worktree-agent-a5ef69606e70a2108`

None should be resurrected merely because it contains familiar filenames. The
final pre-report fetch found `origin/main` unchanged at `912d48b1`, still an
ancestor of this branch with no outside work to merge.

## Campaign authority and the dungeon boundary

| Beat | Canonical scene | Responsibility |
|---|---|---|
| 7 | `COUNTRYSIDE_CABIN` — Cabin II | Wardrobe/ladder entrance, second secret door, dungeon, A-Team captive, Counter-Strike baiter, unidentified mole/“Short Bus” reveal, execution choice, wrapping, carry-out, pyre, nightfall, and blackout. |
| 24 | `ENOLA_SQUATCH` — player-facing SQUATCHOLA GAY | Air mission and missable wrong-city instrument clue. The internal id stays stable for save compatibility. |
| 27 | `LUXURY_APARTMENT` — Special Meeting call | Campaign-owned persistent phone, Booski's call, and the leave handoff. |
| 28 | `SPECIAL_MEETING` — Pickup / Ride | Existing street pickup, forty-two-minute ride, trunk reveal, arrival, and ceremony approach. The live scene starts at `SM-100`; it does not replay the apartment call. |

The boundary is final:

- Luxury Apartment owns its two-floor home-hub work and Beat 27's phone call.
- The entire cellar/dungeon/interrogation/execution/body/pyre chapter belongs
  to the Cabin Hideaway.
- The extraction ladder returns through the **Cabin wardrobe**.
- No Cabin dungeon, captive pair, or second secret door is added to the
  Mansion. The Mansion's Silent Squatch laboratory is a separate authored
  location and remains untouched by this ownership correction.
- “Groton” in the attachment resolves to the canonical **Gratin**.

## Current campaign and persistence facts

- All **31 / 31** campaign beats are wired; pending budget is **0**.
- Save schema **v26** preserves the Day-12 tail and adds bounded THE TAKE
  `shotsFired` and `peopleKilled` facts at the safehouse-debrief seam.
- THE PROSPECT'S RECORD reads stored, bounded campaign statistics. It does not
  scrape scene state or create a second route.
- The Cabin execution choice changes only the final record.
- Beat 27 remains an exact-once Luxury Apartment call into the existing
  Special Meeting scene.
- The campaign remains one linear route.

## Executive dialogue and continuity decisions

These source-level decisions are implemented and contract-pinned:

1. **The route speaks plainly.** The Squatchfather driver takes Tony directly
   to the Act-One Cabin. Beat 27 owns the Luxury call and Beat 28 owns the
   existing ride. No extra apartment or black-screen ride scene is inserted.
2. **Margo's scheduling call happens once, at the Cabin.** Tony initiates the
   short call after the authored exploration gate and books Front & Center's
   Silver Room for nine. The fragile weekday reference is gone. Retired later
   apartment-call ids remain compatibility data only.
3. **Golf does not invent another Margo call.** Tony says Margo only knows
   about that night; Lou's boundary is dinner, not Family business.
4. **The new-space timing is concrete.** Beat 12 says “Tomorrow at eight”; the
   golf landing acknowledges that Lou supplied the time the night before.
5. **Sal and McClawsky have distinct roles.** Sal Sorrento sells the proposal;
   Captain McClawsky observes and interjects.
6. **Bing ambient voices are varied.** Nine authored remarks are assigned to
   nine visible speakers spanning at least five profiles, with spatial audio
   and mouth motion tied to the selected speaker.
7. **Silver Room diners are not one performer multiplied.** Fourteen floor
   lines are cast 5/5/4 across `silver-diner-a`, `silver-diner-b`, and
   `silver-diner-c`; waiter/staff speech remains separately cast.
8. **SQUATCHOLA GAY remembers Beef Run.** Sasole's preflight greeting calls
   back to the Brushrunner. No voice or radio line points out the wrong-city
   clue; Lou interprets it later at the repaired Mansion.
9. **THE TAKE plays straight.** The retired Counter-Strike wink is replaced by
   Tony reacting to the first body. The authored bank dialogue contains no
   “Counter-Strike.”
10. **The Siege parody is original and serious.** It evokes the intended
    threat without copying the film monologue or the “little friend” quote.
11. **The mole facts remain ordered.** Cabin reveals only an unidentified
    mole and “Short Bus”; Willy leaked the earlier strip job; Sauce owns the
    later betrayal; Mark is not named before his boss reveal.
12. **Day One does not spoil the finale.** Apartment chat, mail, and radio
    describe routine business, not Tony's future Initiation.
13. **Sasole is unknown until Beef Run.** The early mailbox cannot invite Tony
    to fly with a man he has not met; the later note is a genuine follow-up.
14. **Special Meeting catalog compatibility is not live staging.** Legacy
    `SM-010`–`SM-030` nodes remain readable, but Luxury owns exact-once
    `SM-030` and the ride starts at `SM-100`.
15. **Obsolete weekday dialogue is gone.** THE TAKE, Front & Center, and
    Cartel Palace now refer to the actual sequence rather than a retired
    weekday calendar.
16. **The Enola loading UI cannot spoil the clue.** It says “Laying out the
    target area”; the cockpit instrument is the only pre-debrief city-name
    discrepancy.

## 25-item QA disposition

“Implemented” below means the correction and its named regression path exist
in the integration tree. The final browser and gate receipts actually run are
listed in the integrated verification section rather than inferred here.

| # | Result | Implementation and regression authority |
|---:|---|---|
| 1 | Implemented | Player-facing title, spine copy, appearance data, livery, nose art, docs, and VO tooling use **SQUATCHOLA GAY** while stable save ids remain. Pinned by campaign-spine and nose-art tests plus the Enola verifier. |
| 2 | Implemented | Cockpit entry/restore re-shows the flight HUD and 1/2/3/4 control card; Enola control tests and verifier cover it. |
| 3 | Implemented | Delayed Web Audio initialization replays the requested music phase instead of dropping it; Enola audio and takeoff-anthem contracts cover the lifecycle. |
| 4 | Implemented | The 2,800 m approach lead starts before the 2,200 m bomb-phase boundary and remains exact-once. |
| 5 | Implemented | Choice digits are consumed before flight input, so bomb decisions cannot change engines, weapons, or throttle. |
| 6 | Implemented | Bracket/throttle compatibility normalizes retired split-throttle state while the staged 1–4 common-throttle UI remains authoritative. |
| 7 | Implemented and hardened | The repaired-Mansion report commits only after the complete blue dialogue; interrupted saves remain owed and completed saves do not replay it. |
| 8 | Implemented | Snow's repair pose now carries a readable hammer/downstroke after generic NPC updates without root sliding. |
| 9 | Implemented | Rosa's first line requires an attached, ancestry-visible body, not mere mission presence. |
| 10 | Implemented and hardened | The Cartel Palace guest-bedroom west partition closes the seam; hall, room, doorway, crouched, angled, and join rays pin it. |
| 11 | Implemented and hardened | Shared `HeistFigure._settle()` measures each final posed/scaled body and rests it on the authored floor instead of using one Palace Y offset. |
| 12 | Implemented | `ESTATE_EVIDENCE_ROUTE` derives one honest next step from the same evidence ledger that controls progression. |
| 13 | Implemented | Initiation's Saint Squatch card has an authored grip, orientation, hand/elbow pose, and framing diagnostics that present the readable face. |
| 14 | Implemented | The congratulations sequence is a controlled overlapping room reaction under twenty seconds, with protected key speakers and coordinated mouth/head/salute animation. |
| 15 | Implemented | Motel one-time pickups retire, routine drops remain visual-only, and the car owns passenger seat/camera/collider state through a physical boarding point. |
| 16 | Implemented | Billy Hotdog uses Lou's Mansion camp-shirt appearance rather than the wrong pinstripe preset. |
| 17 | Implemented | The obsolete TABLE CLOSED/FAMILY PARTY casino-table sign is removed and the expected scene semantics were deliberately repinned. |
| 18 | Implemented | Billy's procedural strike caps torso over-rotation and carries the late collapse through hips and knees. |
| 19 | Implemented | Bing cinematic release derives yaw/pitch from the final live camera, then resynchronizes input without a view snap. |
| 20 | Implemented | Cleanup dialogue distinguishes Snow's Billy kit from Tony taking **Stove's Cleaning Kit**; Abby/Aubbie ownership is absent. |
| 21 | Implemented | The men's-room prop physically reads `STOVE'S / CLEANING KIT`; the unused pad/object and stale interaction are gone. |
| 22 | Implemented | Lou's debrief opens one physical service-exit seam and completion waits until Tony reaches the yard/alley, including already-outside recovery. |
| 23 | Implemented | Silver service navigation finds a surveyed clear route through furniture/diners and replans a stalled physical trip without teleporting. |
| 24 | Implemented | The champagne event remains pending until the visible sender handoff, walk-in, bottle reveal, and reaction complete. |
| 25 | Implemented | Silver's service graph accounts for tray/body footprint, local right-of-way, retries, and clear return routes. |

## Corrected Luxury Apartment disposition

| Request | Current implementation | Verification receipt |
|---|---|---|
| Circular poker table | Felt and rail use circular source geometry; the collider honestly surrounds the round top. | Pure geometry/source contract present. |
| Full two-floor traversal | Eighteen authored treads, simplified rail colliders, landing bounds, turning space, bedroom/wardrobe circulation, and two-sided privacy-wall rays are contract-pinned across walk/sprint/crouch and 30/60/120 Hz. | The corrected verifier samples the shipping renderer with `gl.readPixels`; the frozen-commit browser pass completed the full matrix **63 / 63** with zero runtime/page/request problems. |
| Main bathroom | The obsolete loft fixture is gone. A bounded `main-bathroom` light sits under the real 2.66 m ceiling on the main circuit; vanity, sink, toilet, paper mount, glass/tile shell, threshold, and turning bay are measured. | Corrected `gl.readPixels` tone/readback, traversal, privacy rays, and the full Luxury browser matrix pass **63 / 63**. |
| Bedroom/closet privacy | The privacy wall, bedroom panel/header, and walk-in wardrobe terminate cleanly without blocking the route. | Both wall faces and circulation are represented by geometry/raycast contracts and the active-scene routes pass in the **63 / 63** browser receipt. |
| Top-stair statue | Complete: a named 25-mesh patinated-bronze Sasquatch guardian, facial planes, long-armed silhouette, brass halo, veined marble/brass pedestal, and warm museum light occupy a recessed display bay. Measured bounds are 0.823 × 1.717 × 0.815 m with 1.066 m minimum Margo-route clearance. | Dedicated detail/material/orientation/collider/clearance tests exist; Luxury geometry records 2,729 records with zero violations, and the completed **63 / 63** browser pass retains the measured clearance and staging. |
| Persistent campaign phone | Campaign inventory hydrates exactly one usable phone, keeps it pocketed until selected, suppresses the decorative duplicate, and restores ringing/answered state across reload. | Beat-27 direct entry, exact-once answer, one-copy persistence, real anywhere-in-apartment interaction, and reload proofs are green. |
| Beat-27 objective | Objective copy is derived from the same call state and directs the player to take out and answer the phone; it never invents a nightstand or service entrance. | Source/story, Luxury **63 / 63**, Special Meeting **35 / 35**, direct-entry, and campaign-marathon receipts are green. |

No Luxury secret passage leads to the Cabin dungeon.

## Corrected Cabin dungeon disposition

| Request | Current implementation | Verification receipt |
|---|---|---|
| First and second secret entrances | The gated wardrobe/ladder entrance, loose masonry door, animated opening, honest live collider removal, and ramped connector are authored. | Pure basement contracts pin both gates, clear spawns, and carry/held state. |
| Enclosed cells | Both cells now have floor-to-ceiling bars, central inward-opening doors, jambs/returns, hinges, latch/receiver, honest colliders, and non-relatching open state. | Geometry/interaction contracts and the final real-path browser receipt pass **118 / 118** plus **52 / 52**. |
| Dungeon dressing and wall guns | Structural supports, utilities, restraints, worktable, and shared AK-47/Barrett armory racks are present without floating scene-local substitutes. | Basement route and shared-armory contracts present. |
| Seven tangible tools | Pliers, saw, battery, syringes, towels, leads, and bucket each have a distinct held pose/action, captive reaction, and explicit cue. The soft table fallback no longer steals a tangible-tool crosshair; the leads have a clear physical slot and tight target. | Authored-viewpoint raycasts prove every visible tool wins over the table, and the final **52 / 52** browser route uses all seven through the real interaction path. |
| Interrogation/health | Baiter breaks at 2 hits; A-Team captive breaks at 6; both retain 8-hit execution durability. Busy locks prevent stacked uses. Mouth/head tracking and ordered mole/“Short Bus” facts remain. | Pure thresholds, reloads, locks, and both-victim contracts present. |
| Player/Gratin execution | The ten-second yes/no decision supports player, refusal, and timeout outcomes, all converging on the same downstream route and only one final-record field. | Branch contracts and the **52 / 52** browser receipt follow the actual `Digit2` refusal path and record Gratin's two 8-hit kills. |
| Blood/death presentation | Shared blood impacts receive the real hit point, surface normal, and shot origin. Browser diagnostics expose impact ownership/attachment and distance to the intended body/head. | Cabin contracts **118 / 118** and browser checks **52 / 52** cover the real impact/refusal path rather than a direct handler. |
| Direct wrapping/carry/ladder/pyre | Death targets become direct Wrap interactions; carry unlocks exact-once, survives the wardrobe ladder without cloning/reset, and feeds the two-body pyre/nightfall/blackout chain. | The final Cabin contract/browser pair passes **118 / 118** and **52 / 52**, including tangible tools, refusals, wrapping, carry, ladder transfer, pyre, nightfall, and blackout. |

The two completion proofs remain separate:

1. Beat 27: answer the persistent phone anywhere in the Luxury Apartment,
   leave, and land in the existing Special Meeting pickup scene.
2. Cabin II: enter both secrets, finish either execution outcome, wrap both
   bodies, carry them through the **Cabin** wardrobe ladder, and complete the
   pyre/blackout chapter.

## THE TAKE final-call seam

The current integration tree also hardens the heist's last playable seam:

- a transient `safehouse_debrief` checkpoint separates the firefight from the
  exact-once call;
- one shared inventory `Phone` rings only after weapons are down and the
  checkpoint is persisted;
- the configured interaction action answers globally, including a rebound key;
- the exact-once `finalCalls` receipt is saved **before** the ringtone is
  silenced, so a failed save leaves the phone honestly ringing;
- all three final lines drain before mission completion; and
- reload after answer neither rerings nor replays the call.

Targeted Heist contracts passed 90/90 during implementation. The full real
browser verifier passed **103 / 103** through the current final-phone and exit
path.

## Dialogue, VO, and radio artifacts

Current generated truth:

- **4,228** authored/indexed spoken cues across 18 scene groups: **4,100**
  playable/live plus 128 deliberately unreachable future Initiation rows.
- **543** exact rendered takes with hash/text/performer/decode receipts.
- **3,685** legacy assumed takes covered by the repository's historical
  ledger checks.
- **0** reachable recording-backlog lines and **0** reachable voices owed.
- **4,825** indexed audio files; the playable booth ledger is **4,100 / 4,100**.
- A fresh live-only ElevenLabs generation pass returned `Nothing to do — all
  4100 cues already exist`; `voice:needed`, re-record, take, audio-todo, line
  presence, reachability, and 543 exact-rendered-receipt checks are green.
- The Motel now owns twelve new surface-specific footsteps (two each for
  concrete, asphalt, carpet, tile, stairs, and pool deck). All twelve are
  indexed, 0.600-second stereo 48 kHz takes and WebAudio-decode on Pages.
- The remaining 128 indexed future Initiation cues are deliberately
  unreachable future catalog rows, not a playable campaign backlog.
- Radio inventory covers **31 / 31** campaign beats, 337 cues, 24 measured
  long-form masters, and 298 spoken-content receipts.
- The new radio lifecycle map names one start/stop/restore/teardown or authored
  silence receipt for **26 / 26** unique live owners. The source contract and
  mapped active-play receipt assertions are green. Per-cue listening and mix
  approval remain explicit OWNER rows rather than missing lifecycle coverage.

Radio deliverables:

- Workbook: `docs/audits/SQUATCHSMASH-RADIO-AUDIT.xlsx`
- Generator: `tools/radio-audit.mjs`
- Revamp plan: `docs/audits/SQUATCHSMASH-RADIO-REVAMP.md`
- Lifecycle contract: `tools/radio-active-play-coverage.mjs`
- Component evidence: `docs/audits/radio/`

Mechanical inventory and lifecycle ownership are implemented. Human listening,
program selection, licensing/provenance, station identity, and optional music
choices remain explicit **OWNER** decisions rather than disguised engineering
failures.

## Integrated verification receipt

The hosted Verify run for production snapshot `912d48b1` passed geometry,
Playwright mirror smoke, lint, **3,830 / 3,830** tests, static checks, the flight
bench, fresh-save route, boot-failure surfaces, the complete campaign marathon,
and the preview build. It then correctly stopped at the debt ratchet because
the checked-in proof inventory had not yet named THE TAKE's new
`safehouse_debrief` checkpoint or four reviewed typed Luxury meshes. No debt
count grew. The reviewed nine-line baseline refresh now passes against trusted
ref `ac320548017605df03a005f48d7f817fca7c3acc` at unchanged ceilings:

- architecture: 0 records / 0 units;
- semantic contracts: 134 / 134;
- liveness: 24 / 24; and
- spatial: 83 records / 39,111 units.

Changed and supporting real-browser receipts include:

- Cabin contracts **118 / 118** and Cabin browser **52 / 52**;
- Luxury Apartment browser **63 / 63**;
- THE TAKE browser **103 / 103**;
- cold open **21 / 21**, preview **60 / 60**, and direct entry **27 / 27**;
- Bing **168 / 168**, Beef Run **81 / 81**, Bing II **37 / 37**, Golf
  **116 / 116**, and Day Two **31 / 31**;
- Silver scene **163 / 163** and repaired story route **18 / 18**;
- Motel **97 / 97**, including the current recorded Snow opening once;
- canonical big-night bridge **17 / 17**;
- Mansion **305 / 305**, Mansion Return **12 / 12**, and Mansion Siege
  **202 / 202**;
- Cartel Palace **87 / 87** with the Palace-only navmesh and zero query
  failures;
- Initiation **63 / 63** through the full real-input ceremony, record, credits,
  and title return; and
- Special Meeting **35 / 35**, Squatchfather **50 / 50**, and the smaller
  computer/Squatch Smash/Enola bomb-audio gates **34 / 34**, **13 / 13**, and
  **10 / 10** respectively;
- final-arc durable reload/completion/preview isolation **69 / 69**; and
- Graveyard **43 / 43**, Silver Case **95 / 95** across its main, alternate,
  golden, and all six checkpoint routes, plus License to Grill **73 / 73** after
  its stale acceptance checks were aligned with the authored optional objective
  and connected whole-figure death pivot.

Every listed browser receipt reported zero relevant page/console problems.
Network results are claimed only where the named verifier instrumented them.
The final pushed report commit reruns the authoritative workflow externally;
its immutable run URL and conclusion belong in the delivery message rather than
a self-referential commit.

## Final commit, push, deploy, and live evidence

| Delivery item | Final value |
|---|---|
| Frozen implementation/verifier head | `c5312e76` on `codex/campaign-qa-polish-20260828`; report-only closure follows. |
| Latest-main reconciliation | Final fetch found `origin/main` at deployed ancestor `912d48b1`, with no newer outside work to merge and eight reviewed commits ready to fast-forward. |
| Local final gate repairs | Silver story 18/18; Motel 97/97; canonical big-night 17/17; Siege 202/202; final-arc reloads 69/69; Graveyard 43/43; Silver Case 95/95; License to Grill 73/73; exact trusted-ref debt ratchet green. |
| Push/merge result | Immutable final main SHA is recorded by the delivery message after this report-containing commit is created and fast-forwarded. |
| GitHub Verify | Run `33232688679` proved every step through preview build green at `912d48b1`; its sole stale-inventory failure is repaired and locally reproduced green. Final-head run is linked externally. |
| GitHub Pages | Run `33232688689` completed success at `912d48b1`, including campaign verification, staging, upload, and deploy. |
| Live Pages smoke | `https://lousputthole.github.io/SquatchSmash/`: 10/10 live routes ready, 0 page/console/request/HTTP/WebGL errors; all 12 new Motel footsteps HTTP 200 and WebAudio-decode clean. |

## Remaining risks and owner decisions

1. The 26/26 radio lifecycle source map is green. Future lifecycle edits must
   keep exact named verifier receipt text synchronized and rerun the affected
   scene gates.
2. A deterministic browser can prove ownership, gain values, stop/restore, and
   teardown. It cannot approve dialogue/music balance on the owner's speakers.
3. Owner-only radio choices remain: legacy identity assets, station/venue
   allocation, mission-news receivers, chapter-aware shows, long-form
   provenance/licenses, target-system gain approval, seven intentionally
   silent beats, and an optional credits track.
4. THE TAKE's measured handling remains an owner feel judgment even when its
   mechanical and audio contracts are green.
5. The Palace Recast pilot remains Palace-only. Its measured gain does not
   authorize rollout to other scenes.
6. The Mansion laboratory and Cabin dungeon must remain separate in every
   conflict resolution and future edit.
