# Campaign QA and Dialogue Report — 2026-08-28

> **Draft evidence ledger, not a release certificate.** This report describes
> code and tests present in the shared worktree at the time of inspection. Most
> of that work is still uncommitted, the branch is behind `origin/main`, the
> required full gates have not all run, and no final deployment has been
> verified. “Implemented” below means an implementation is present in the
> worktree; it does not mean the item is shipped or browser-certified.

## Evidence scope

This report reconciles these two owner attachments with the current campaign
spine, story bible, source diff, registered tests, and verifier code:

| Evidence | SHA-256 |
|---|---|
| `C:\Users\cargi\.codex\attachments\a4e44e59-8a9c-4355-be72-12d028b80b30\pasted-text.txt` — 25-item campaign QA/polish pass | `5BF37B52222B42EEE13567C813A833BC95757FCF2A6BA5940B040E5EE6F41D85` |
| `C:\Users\cargi\.codex\attachments\28dd1123-4b40-43e2-b6a1-7da7e49b39af\pasted-text-1.txt` — luxury-apartment/Beat-27/dungeon goal | `E23555313CE25244D256F316B930E6CD97CAF2AB41ABB34AC4E5EA525AF11065` |

The second attachment is not treated as campaign authority where it merges
unrelated chapters. `docs/CAMPAIGN-STORY-BIBLE.md`,
`src/core/campaign-spine.js`, and the owner’s later explicit Cabin ruling take
precedence.

## Repository and latest-main audit

Snapshot at report creation:

| Item | Observed value |
|---|---|
| Working branch | `codex/campaign-qa-polish-20260828` |
| Committed `HEAD` | `59bdd6c7e657d53082723c44ad64515edddb33ec` |
| Current `origin/main` | `23533ffbc374bb97c0d0c51079d923f2859eef54` |
| Committed divergence | `HEAD` is 0 commits ahead and 4 commits behind `origin/main` |
| Worktree | Broadly dirty: source, tests, verifiers, generated dialogue/audio/radio artifacts, binary VO files, and new untracked assets are present. None of these worktree changes are represented by the committed `HEAD` above. |

The four newer `origin/main` commits are:

1. `2d372199` — repairs direct-entry and persisted-checkpoint verifier seeds
   after the campaign reorder.
2. `349bb86f` — restores the `Q` stand-up path, apartment tutorial visibility,
   and related Day-One/Squatchfather verifier behavior.
3. `fc004ab4` — adds the reachability handoff document.
4. `23533ffb` — updates the Cabin browser verifier for the canonical Act-One
   Cabin clock and Booski/Billy exit.

The parallel latest-main audit classified the six remaining non-main remote
tips as stale or superseded; they are not automatic cherry-pick candidates.
The known overlapping file during the required rebase is
`tools/verify-squatchfather.mjs`. The resolution must retain the current-main
direct driver-to-Cabin route and must not restore an obsolete apartment hop.

**Release consequence:** preserve the worktree, create reviewable commits, then
rebase those commits onto current `origin/main`. Do not push the present
behind-main `HEAD` as if it contained this pass.

## Campaign authority and the dungeon boundary

The current spine contains 31 wired beats. The relevant ownership is:

| Beat | Canonical scene | Responsibility |
|---|---|---|
| 7 | `COUNTRYSIDE_CABIN` — “Cabin II: the dungeon” | Second secret door, dungeon, A-Team captive, Counter-Strike baiter, unidentified mole/“Short Bus” reveal, executions, wrapping, carry-out, pyre, nightfall, and blackout. |
| 24 | `ENOLA_SQUATCH` — player-facing “SQUATCHOLA GAY” | Air mission and wrong-city clue. The stable internal scene id remains intentional for save compatibility. |
| 27 | `LUXURY_APARTMENT` — “Luxury Apartment: Special Meeting” | Persistent inventory-phone ring, Booski’s special-meeting call, and the leave handoff. |
| 28 | `SPECIAL_MEETING` — “Pickup / Ride” | Existing street pickup, 42-minute ride, trunk reveal, arrival, and ceremony approach. `src/specialmeeting/main.js` begins the live ride at `SM-100`; it does not replay the apartment call. |

The second attachment’s combined “Beat 27 apartment dungeon” is therefore
split as follows:

- Luxury-apartment geometry and persistent-phone requests apply to the shared
  Luxury Apartment hub and Beat 27.
- Every secret-passage, dungeon, torture, execution, wrapping, body-carry, and
  ladder-extraction request applies to the Cabin Hideaway.
- The Cabin ladder returns to the **Cabin wardrobe**, not to the luxury
  apartment.
- No Cabin dungeon, second dungeon door, or captive pair is added to the
  Mansion.
- The Mansion/Silent Squatch basement laboratory already in the campaign is a
  separate authored scene and remains separate. This pass does alter the
  repaired-Mansion briefing and Snow’s repair presentation because the later
  25-item QA attachment explicitly requests those repairs; it does not move or
  duplicate the Cabin dungeon there.
- “Groton” in the second attachment resolves to the canonical character name
  **Gratin**.

## Executive dialogue and continuity decisions

These are the decisions currently expressed in source and contract tests. They
should be preserved during rebase and VO regeneration.

1. **Campaign route speaks plainly.** The Squatchfather driver takes Tony
   directly to the Act-One Cabin. Beat 27 is the Luxury Apartment call, and
   Beat 28 owns the existing ride. No extra apartment or black-screen ride scene
   is inserted.
2. **Margo’s first call happens once, at the Cabin.** Tony initiates the short
   outgoing call after the authored exploration gate. It schedules Front &
   Center’s Silver Room for nine. The fragile weekday was removed after the
   campaign clock proved Day 6 is Monday, not Sunday. The old later incoming-apartment
   date call is retired from new play but its ids remain readable for old-save
   normalization. Files: `src/cabin/script.js`,
   `src/core/countryside-cabin-story.js`,
   `src/core/luxury-apartment-story.js`, and their tests.
3. **Golf does not invent another Margo call.** Tony’s OPSEC answer is “Nobody.
   Margo only knows about tonight.” Lou’s boundary is dinner, not Family
   business. `tests/campaign-dialogue-continuity.test.mjs` pins this.
4. **The new-space/golf timing is concrete.** Beat 12’s Lou call says
   “Tomorrow at eight”; the golf landing says Lou gave Tony the time the night
   before. No duplicate morning call is required.
5. **Sal and McClawsky have distinct roles.** Sal Sorrento sells the proposal;
   Captain McClawsky watches and interjects. The Bing briefing no longer gives
   contradictory “only person” ownership to both men. File:
   `src/bing/script.js`.
6. **Bing ambient/diner voices are deliberately varied.** Nine authored
   ambient remarks are pinned to nine visible club speakers and span at least
   five voice profiles. Spatial playback and mouth motion use the selected
   speaker. `tests/bing-voice-coverage.test.mjs` explicitly fails if the floor
   collapses back to one generic patron voice.
7. **SQUATCHOLA GAY remembers the Beef Run.** The preflight greeting calls back
   to Tony returning the Brushrunner and frames the new plane as larger and
   less mannered. No line points out the wrong-city clue; the instrument remains
   catchable but missable, and Lou owns the repaired-Mansion payoff.
8. **THE TAKE is played straight.** A removed Counter-Strike wink is replaced
   by Tony reacting physically to the first body. The heist’s authored bank no
   longer contains “Counter-Strike.”
9. **The Siege parody is original.** The payoff line is “Fine. Everybody at
   once. Let’s find out how many of you this thing was designed for.” It does
   not quote “say hello to my little friend.”
10. **The mole facts stay ordered.** The Cabin captive reveals only an
    unidentified mole and “Short Bus.” Willy leaked the earlier strip operation;
    Sauce is the later internal betrayal; Mark is not named before his boss
    reveal. Initiation dialogue now states that distinction instead of merging
    Willy and Sauce.
11. **Day One does not spoil the finale.** Apartment chat, mail, radio, and
    recorded ambient copy describe routine weekly business, not Tony’s future
    initiation. `tests/day-one-dialogue-continuity.test.mjs` owns this boundary.
12. **Special Meeting’s old flat beats are catalog compatibility, not the live
    handoff.** `src/specialmeeting/script.js` still contains `SM-010` through
    `SM-030`, but the luxury-apartment story owns exact-once `SM-030`, and
    `src/specialmeeting/main.js` begins at `SM-100`. Tests cover the split so the
    call is not duplicated.
13. **Later scenes do not inherit weekdays from an obsolete calendar.** THE
    TAKE, Front & Center, and Cartel Palace now refer to the real sequence of
    events rather than claiming that the current campaign day is Thursday or
    Tuesday. The weekly Wednesday club bulletin remains intentional background
    routine and is not Tony's Initiation.
14. **Sasole is unknown until Beef Run.** The early Apartment mailbox no longer
    contains a flight invitation from a man Tony has never met. That message is
    gated behind Beef Run and rewritten as a follow-up from the pilot Tony has
    now flown with. `tests/day-one-dialogue-continuity.test.mjs` pins both sides
    of the introduction.
15. **Silver Room diners are not one actor multiplied across the room.** The 14
    spoken floor-diner lines are cast 5/5/4 across `silver-diner-a`,
    `silver-diner-b`, and `silver-diner-c`; the exact delivered takes were
    regenerated in those three performer profiles. Waiter/service-floor lines
    remain a separate staff voice.
16. **The Enola loading UI cannot spoil its own clue.** The visible boot stage
    now says “Laying out the target area” rather than naming Squatchbourg. The
    navigation instrument is the only pre-debrief player-visible city-name
    discrepancy, no crew line explains it, and Lou remains the first person to
    interpret it at the repaired Mansion.

Both new continuity test files are registered in `tests/run.mjs`; registration
is not evidence that the full suite has passed.

## 25-item QA disposition ledger

Status vocabulary:

- **Worktree implementation** — source and a regression test/verifier path are
  present, but final browser/gate/deploy proof is pending.
- **Present + hardened** — the basic behavior already existed; this pass adds
  a guard or stronger contract for the reported failure.
- **Partial** — some requested behavior exists, but an implementation or the
  required player-facing proof is still incomplete.

| # | Status | Root cause and implementation present | Tests/verifier path | Evidence still required |
|---:|---|---|---|---|
| 1 | Worktree implementation | Player-facing title references had drifted. `enolasquatch.html`, `src/core/campaign-spine.js`, `src/core/appearances.js`, `src/enolasquatch/livery.js`, VO tooling, docs, and nose art use **SQUATCHOLA GAY**. Stable internal `enola_squatch` identifiers remain. | `tests/enolasquatch-nose-art.test.mjs`, `tests/campaign-spine.test.mjs`, `tools/verify-enolasquatch.mjs`. | Real loading, objective, completion, preview, and save-display audit after rebase. Search for any remaining player-facing “Enola Squatch” leakage. |
| 2 | Worktree implementation | The flight card could remain hidden on cockpit entry/restore and its layout had moved. `MissionController` now re-shows the HUD/control card, the card ages normally, and the Beef Run CSS contract puts it left with the 1/2/3/4 presentation. | `tests/enolasquatch-controls.test.mjs`; `tools/verify-enolasquatch.mjs`. | Play takeoff and a restored checkpoint at real viewport sizes; confirm visibility, highlighting, and fade timing. |
| 3 | Worktree implementation | A takeoff phase could request music before the browser audio graph finished initializing, losing the request. `src/enolasquatch/audio.js` replays the requested phase after initialization; `src/enolasquatch/main.js` owns `fortunate-son.mp3` and its mix/cut. | `tests/enolasquatch-bomb-audio.test.mjs`, `tests/beefrun-takeoff-anthem.test.mjs`. | Real user-gesture/autoplay, restart, checkpoint, volume, and cut timing in browser. |
| 4 | Worktree implementation | The approach cue began at the late bomb-phase boundary. `MissionController.BOMB_APPROACH_MUSIC_LEAD_M = 2800` starts the buildup during defense before the 2200 m transition and guards it once. | `tests/enolasquatch-bomb-audio.test.mjs`; Enola browser verifier. | Time the actual recording against a normal approach and an early arrival/drop. |
| 5 | Worktree implementation | Choice digits propagated into still-live flight/throttle handlers. New `src/enolasquatch/choice-input.js` consumes choice digits before flight input; choice-mode keys cannot mutate engine state. | `tests/enolasquatch-controls.test.mjs` exercises digits 1–5 in choice mode and normal flight mode. | Real bomb-choice run with engines turning; confirm keydown and keyup do not change engines, heading, weapons, or throttle. |
| 6 | Worktree implementation | Retired bracket split-throttle state and the current common-throttle UI could disagree. The choice/input adapter consumes and normalizes bracket state while the visible staged 1–4 control language remains authoritative. | `tests/enolasquatch-controls.test.mjs`; Enola verifier. | Walk the entire throttle-back sequence at held/released inputs and confirm HUD value equals aircraft state. |
| 7 | Present + hardened | The repaired-Mansion interaction could commit the report before the blue dialogue finished. `src/mansion/main.js::useReturnBriefing()` now plays `SEQUENCES.returnBriefing` and commits `MANSION_RETURN_REPORT` only in `onDone`; incomplete reloads remain owed and completed saves do not replay. | `tests/mansion-final-arc-runtime.test.mjs`; `tools/verify-mansion-return.mjs`. | Real interaction, camera/input state, all subtitles/VO, dismissal, interrupted reload, and completed reload. |
| 8 | Worktree implementation | Generic NPC updates overwrote a repair pose, and Snow had no readable held tool. `src/mansion/snow-repair-motion.js` builds a hand-scale hammer and deterministic downstroke; `src/mansion/cast.js` reapplies it after the generic update without translating Snow’s root. | `tests/mansion-return-repairs.test.mjs`; Mansion return verifier. | Active-play visual/audio loop near the damaged foyer; confirm no skeleton break, sliding, or tool clipping. |
| 9 | Worktree implementation | Rosa’s first line checked mission presence, not rendered visibility/ancestry. `src/cartel-palace/bystanders.js::visibleInWorld()` now requires an attached, visible body before her notice/dialogue can begin. | `tests/cartel-palace-playtest.test.mjs`; `tools/verify-cartel-palace.mjs`. | Play the normal approach and reload/combat-cleanup variants; confirm Rosa is readable before her first line. |
| 10 | Present + hardened | The guest-bedroom west partition stopped short, leaving a seam. `src/cartel-palace/world.js` provides `guest-west-partition`; strengthened rays cover hall, bedroom, doorway, crouched/angled views, and the south-wall join. | `tests/cartel-palace-mission.test.mjs`; Palace verifier. | Visual inspection under scene lighting from every requested angle; geometry gate after final rebase. |
| 11 | Present + hardened | Death settling assumed a generic lift instead of measuring the posed, scaled body. Shared `src/heist/people.js::HeistFigure._settle()` boxes the actual final pose and places its minimum Y on the authored floor. | `tests/cartel-palace-finale.test.mjs` covers wife/Lola/Johnny at three heights and rejects one universal encounter offset. | Mark-fight browser replay, including animation-to-death transition and reload. |
| 12 | Worktree implementation | Evidence objectives were too broad and could drift from the actual evidence ledger. `ESTATE_EVIDENCE_ROUTE` in `src/cartel-palace/mission.js` derives one next actionable step (security, bedroom, office, dining) from the same `evidenceFound` state; `src/cartel-palace/main.js` uses the shared objective panel. | `tests/cartel-palace-mission.test.mjs`; Palace verifier. | Full normal and out-of-order/reload route; confirm completed instructions retire and no future reveal is spoiled. |
| 13 | Worktree implementation | The ritual card’s hand grip, scale, orientation, elbow pose, and camera composition did not guarantee a readable face. `src/initiation/cabin/props.js` and `src/initiation/main.js::ritualCardPresentation()` now author the grip and expose projected size/front-facing/occlusion diagnostics. | `tests/initiation-polish-regression.test.mjs`, card tests, and `tools/verify-initiation.mjs`. | Real-path screenshot of the actual Saint Squatch face under ceremony lighting before manipulation/burning. |
| 14 | Worktree implementation | Nineteen congratulations were serialized into a long roll call. New `src/initiation/room-reaction.js` schedules a controlled overlapping burst under 20 seconds; `src/initiation/main.js` drives concurrent mouth/head/salute reactions while protecting key speakers; the phase timeout is 24 seconds instead of 75. | `tests/initiation-room-reaction.test.mjs`, `tests/initiation-polish-regression.test.mjs`, Initiation verifier. | Listen to the full mix in browser; confirm prominence, intelligibility, and no subtitle/audio pileup. |
| 15 | Worktree implementation | Motel prompts competed at the car, resolved pickups remained active, routine enemy drops created prompt clutter, and boarding used a fragile world point. `src/motel/main.js` retires the one-time glovebox/Silverback/trunk prompts, makes routine drops visual-only, follows the passenger boarding point, and lets the car own seat/camera/collider state. `src/motel/vehicle.js` exposes `passengerBoardPosition()`. | `tests/motel-polish-regression.test.mjs`, `tests/motel-spatial-physics.test.mjs`, `tests/motel-presentation.test.mjs`, `tools/verify-motel.mjs`. | Full fresh/reload play from arrival through evidence, fight, passenger entry, dialogue, drive, and campaign seam. |
| 16 | Worktree implementation | Billy Hotdog instantiated Lou’s wrong pinstripe preset. `src/bing/hotdog-party.js` now uses `BIG_UNCLE_LOU_MANSION`, the open Mansion chill/camp-shirt appearance. | `tests/bada-bing-two-mission.test.mjs`; Bing II verifier. | Inspect Lou throughout party, cleanup, debrief, and transitions. |
| 17 | Worktree implementation | A shared/legacy casino-table sign survived the party staging. The TABLE CLOSED/FAMILY PARTY sign creation is removed from `src/bing/hotdog-party.js`; expected scene semantics were adjusted deliberately rather than hiding it. | `tests/bada-bing-two-mission.test.mjs`, `tests/geometry-bing-semantics.test.mjs`. | Browser sweep of the table before and after the attack; geometry review for expected traversal-path churn. |
| 18 | Worktree implementation | The procedural strike over-rotated Billy’s upper torso without carrying the collapse through the pelvis/legs. `src/bing/hotdog-attack.js` caps torso hinge/roll and transfers late force to hips and knees. | `tests/hotdog-attack.test.mjs`. | Watch all strike phases and the final death blend at normal and low frame rates. |
| 19 | Worktree implementation | Cinematic release restored a stale authored look instead of the actual final camera quaternion. `src/bing/hotdog-main.js::releaseCinematic()` derives yaw/pitch from the live camera, preserves the view, then resynchronizes player input. | `tests/bada-bing-two-mission.test.mjs`; `tools/verify-bing-two.mjs`. | Real attack-to-control handoff: no snap, drift, bad FOV, wrong facing, or input lock. |
| 20 | Worktree implementation | Two separate kits were conflated in old dialogue. `src/bing/hotdog-room-voices.js` now says Snow’s kit is for Billy and Tony takes **Stove’s Cleaning Kit** for the room; the active cleanup context contains no Abby/Aubbie kit reference. | `tests/bada-bing-two-mission.test.mjs`, Hotdog VO catalog/checks. | Regenerate/check ledgers, audition the replacement take, and verify subtitle/audio text match in scene. |
| 21 | Worktree implementation | The men’s-room prop had an ambiguous generic label and an extra object lacked a job. `src/bing/hotdog-party.js` builds a physical `STOVE'S / CLEANING KIT`; related prompts/VO use Old Stove’s ownership and the extraneous object/pad is removed or retired. | `tests/bada-bing-two-mission.test.mjs`; Bing II verifier. | Inspect the room before and after pickup/cleanup; confirm no stray interactable or collision remains. |
| 22 | Worktree implementation | Lou’s final debrief could end with no live scene seam. `src/bing/second-visit.js` creates the exact next objective “Leave through the service exit.” `src/bing/hotdog-main.js` opens the service route and completes only when Tony physically reaches the yard/alley, with an already-outside recovery path. | `tests/bada-bing-two-mission.test.mjs`; `tools/verify-bing-two.mjs` follows the real handoff and exit. | Fresh load and checkpoint/retry through body disposal, debrief, service door, save, next-scene load, and no premature exit. |
| 23 | Worktree implementation | Direct waiter lines ignored chairs, diners, tray width, and current patrol position. New `src/silver/service-navigation.js` finds the shortest clear chain through surveyed service marks; `src/silver/cast.js` supplies authored routes; `src/silver/main.js` replans a stalled physical trip instead of teleporting. | `tests/silver-service-navigation.test.mjs`; `tools/verify-silver-story.mjs`. | Full date run from every service round; visually confirm stop pose, interaction, and return to patrol. |
| 24 | Worktree implementation | The champagne clock could mark the event sent before a physical waiter route or visible sender handoff existed. The queue now stays pending on route failure, shows the other table’s handoff, walks the bottle in, reveals it physically, and completes only after the reaction. | `tests/silver-service-navigation.test.mjs`; Silver story verifier. | Play the complete other-table event, including temporary obstruction and reload mid-chain. |
| 25 | Worktree implementation | Detailed visual colliders and uncoordinated staff made crossings behave like walls. The Silver service graph samples complete legs at tray/body footprint, uses local right-of-way, retries stalled routes, and returns each worker along a clear authored route. | `tests/silver-service-navigation.test.mjs` covers furniture/diners/trays, every patrol start, 90-second multi-worker motion, return routes, and explicit blocked-floor failure. | Browser collision audit behind chairs, between tables, kitchen entrance, front table, staff crossings, and varied frame rates. |

## Second attachment: corrected disposition

### Shared Luxury Apartment work

| Request | Disposition | Factual evidence | Remaining work/evidence |
|---|---|---|---|
| Circular poker felt and rail | Worktree implementation | `src/luxury-apartment/world.js` builds both from circular cylinder/torus source geometry without the former Z squash; the table collider is square around a circular top. `tests/luxury-apartment-poker-table.test.mjs` rejects non-circular source scale. | Run `verify:luxury-apartment-browser` and inspect all hub visits/angles. |
| Stair traversal and under-stair trap | Partial: structural contracts present | Shared world builds 18 treads, two simplified rail colliders, floor zones, and a sealed/usable under-stair layout. `tests/luxury-apartment-world.test.mjs` and the browser verifier inspect stair metrics and the bathroom threshold. | The attachment’s off-center walk/run/crouch and varied-frame-rate traversal matrix has not been attached as passing browser evidence. |
| Larger luxury bathroom | Partial: substantial room present | The shared under-stair bathroom is at least 3.6 m wide, uses a glass door, tile zones, vanity/mirror, sink, toilet, paper mount, connected shell, and collision-penetration contracts in `tests/luxury-apartment-world.test.mjs`. | Subjective luxury composition, bath/shower detail, lighting/glare, and natural turn-around still need active visual review; the full browser round trip is pending. |
| Closet and bedroom wall | Partial: structural repair present | `luxury-bedroom-privacy-wall`, bedroom panel/header colliders, and the walk-in wardrobe are present; tests reject wardrobe/panel intersection and verify the partition terminates at the wardrobe shell. | Inspect both wall faces, trim, shadows, closet opening, and body clearance in browser. The requested apartment secret connection is rejected because the dungeon is not under this apartment. |
| Top-stair statue | Implemented and geometry-verified | `src/luxury-apartment/world.js` now builds a named 25-mesh patinated-bronze Sasquatch guardian with a long-armed silhouette, facial planes, brass halo, veined marble/brass pedestal, and dedicated warm museum light. It occupies a recessed display bay rather than Margo's waypoint; measured bounds are 0.823 x 1.717 x 0.815 m with 1.066 m minimum route clearance. | `tests/luxury-apartment-world.test.mjs` covers detail, material families, orientation, collider containment, removal of the primitive placeholder, and sampled Margo-route clearance. Full Luxury geometry passed with 2,729 records and zero violations; final browser framing remains in the release matrix. |
| Persistent campaign phone | Worktree implementation | `LuxuryInventoryRuntime.restorePhone()` hydrates the campaign-owned phone once, keeps it pocketed until selected, and hides the decorative duplicate. `src/luxury-apartment/main.js` refreshes campaign threads. `tests/luxury-apartment-runtime.test.mjs` and `tests/luxury-apartment-story.test.mjs` cover one-copy persistence, Beat-27 direct entry, exact-once answer, and reload. | Run the full browser verifier; answer from upstairs, downstairs, and while other targets are nearby; save/load while ringing. |
| Beat-27 objective | Worktree implementation | The call objective is derived from the same Luxury story state. With the inventory phone present it tells the player to take out and answer the phone, not to search a service entrance/nightstand. | Active-play proof from legitimate campaign save and direct developer entry. |

### Cabin dungeon work (not Beat 27)

| Request | Disposition | Factual evidence | Remaining work/evidence |
|---|---|---|---|
| Hidden first entrance and second secret door | Worktree implementation | `src/cabin/dungeon.js` and Cabin world expose the gated wardrobe/ladder entrance, a second masonry door, animated opening, live-collider removal, and the ramped connector. `tests/countryside-cabin-basement.test.mjs` pins both gates and clear spawns. | Re-run Cabin browser after final rebase. |
| Underground-room/corridor dressing and wall guns | Worktree implementation | Structural supports, utility dressing, narrow route, mounts, cell dressing, and shared armory racks for AK-47 and Barrett are present. `src/cabin/main.js` mounts the shared armory; basement tests pin route clearance and reject floating scene-local weapon substitutes. | Active inspection while empty-handed, holding a tool, and carrying each body. |
| Cell fencing/details | Worktree implementation with visual proof pending | Cell bars, access, benches/restraints/worktable/utility props and collision are authored in `src/cabin/dungeon.js`; basement contracts cover named assemblies and route clearance. | Close visual inspection of all seams, door hardware, camera clipping, and carried-body clearance. |
| Tangible torture tools | Worktree implementation; all-tool browser matrix pending | `src/cabin/torture-tool-presentation.js` renders one camera-held tool, swaps/returns it, and animates a controlled strike. `src/cabin/chapter-runtime.js` requires a tool and blocks rapid stacked uses. `src/cabin/main.js` applies tool profiles, sounds, flinches, and dialogue. | The current live verifier demonstrates pliers; every tool’s unique pose/audio/victim reaction still needs a browser evidence matrix. |
| Escalation and health | Worktree implementation | Runtime profiles break the baiter at 2 hits and the A-Team captive at 6 while retaining 8-hit execution durability. Pure tests cover thresholds, busy locks, reload, and both victims. | Confirm pacing and mouth/head tracking in normal play. |
| Player/Gratin execution outcomes | Worktree implementation | Ten-second yes/no choice, player and Gratin branches, common downstream state, and final deaths are represented in `src/cabin/chapter-runtime.js`, `src/cabin/main.js`, and branch tests. | Browser-play the refusal/timeout branch as well as the player branch after final rebase. |
| Impact decals/death presentation | Partial visual proof | `src/cabin/main.js` forwards the actual impact point, normal, and shot origin to the shared blood-impact system and disables living presentation on death. | Capture close visual evidence that impacts stay on the intended body/surface and do not project through to distant walls. |
| Direct body wrapping | Worktree implementation | Dead body targets change directly to “Wrap the …”; living Inspect/torture is retired, wrap is exact-once, and carry unlocks immediately. Tests and `tools/verify-cabin.mjs` inspect the direct prompts and both wrapped states. | Re-run the live path after rebase and confirm no stale tool/prompt on either execution branch. |
| Ladder extraction while carrying | Worktree implementation | The Cabin wardrobe ladder preserves held tool/carry state, does not clone/reset bodies, and has authored safe spawns. Basement tests cover carried state; the Cabin verifier carries each body through the wardrobe route one at a time to the pyre. | Re-run empty-handed, each body, held-tool, save/reload, and both execution branches on the final commit. |

The corrected completion criteria are therefore two separate proofs:

1. Beat 27: receive and answer the persistent-phone call anywhere in the Luxury
   Apartment, leave, and land in the existing Special Meeting pickup scene.
2. Cabin II: enter both secrets, finish either execution outcome, wrap both
   bodies, carry them through the **Cabin** wardrobe ladder, and complete the
   pyre/blackout chapter without intervention.

## Shared-system changes implicated by the QA pass

- **Input contexts:** Enola’s choice adapter consumes decision keys before
  flight input.
- **Objective honesty:** Palace, Motel, Bing II, Cabin, and Luxury use or derive
  from shared/authoritative state rather than parallel future-task lists.
- **Variable-height death settling:** the shared `HeistFigure` pose measurement
  protects Palace bodies without a Palace-only Y offset.
- **Persistent phone:** campaign inventory and shared phone content own later
  calls; decorative props no longer own mandatory call reachability.
- **NPC/service navigation:** Silver’s limited authored service graph solves the
  restaurant’s physical routes without adding a second global AI framework.
- **Cabin equipment/effects:** the dungeon reuses shared armory and blood-impact
  systems; torture tools remain intentionally scene-limited.
- **Audio ownership:** Enola phase music is replayed after delayed audio init;
  dialogue cue names remain explicit for repository checks.

## Dialogue, VO, and radio artifact status

The generated artifacts were frozen after the final authored-line change and
their independent checks passed:

- **4,228** spoken lines across 18 scene groups.
- **542** exact rendered takes plus **3,686** legacy assumed takes.
- **0** stale text stamps, stale performers, unledgered takes, orphaned take
  rows, re-record cues, or booth-backlog lines.
- Rendered-voice receipts: **542/542** current, hash-bound, performer-bound,
  indexed, and browser-decodable.
- Audio index: **4,813** files across 140 groups. A strict orphan scan removed
  exactly 106 retired, manifest-unclaimed MP3s and then passed cleanly.
- All 20 scene cue-ledger checks passed.
- Dialogue workbook: **4,228** lines, 778 flagged rows, 152 punch-up variants,
  seven scene write-ups, and no stale punch-up warnings.
- Radio audit: **31/31** campaign beats, 337 cues, zero missing assets;
  loudness evidence **24/24** and speech-content evidence **298/298** current.
- `VOICE-LINES-NEEDED.md` and `VOICE-LINES-TODO.md` report a **zero-line,
  zero-voice recording backlog**.

The generated radio audit workbook is
`docs/audits/SQUATCHSMASH-RADIO-AUDIT.xlsx`; generator:
`tools/radio-audit.mjs`; component CSV/JSON evidence lives under
`docs/audits/radio/`. Four owner-decision rows remain intentionally visible for
the unused legacy K-SQCH and Uncle Lou station idents/stings; they are creative
decisions, not missing files or runtime failures.

## Verification evidence and gaps

### Evidence reported during this work cycle

- A parallel Cabin browser audit reported `tools/verify-cabin.mjs` at **44/44**
  with zero page/console errors on the authored tree. It remains intermediate
  evidence until the post-rebase matrix records the final commit.
- Parallel focused contract batches were reported at **105/105**, **43/43**,
  **149/149**, and **33/33**. Their exact command transcripts and final commit
  association are not yet attached, so they are not counted as release gates
  in this report.
- New regression files named throughout this report are registered in
  `tests/run.mjs`.
- A broad pre-freeze `npm test` loaded test modules while generated ledgers were
  still changing and therefore observed two different receipt generations. It
  reached 3,819 tests but is deliberately excluded from release evidence. The
  two affected focused tests passed **18/18** after the tree froze; only the
  clean post-rebase full run may count below.

This report-authoring task itself performed read-only source/diff/hash audits;
it did not execute a test or browser suite.

### Required final gate ledger

Populate this table only with commands that actually run against the final
rebased commit.

| Gate | Final result | Evidence/notes |
|---|---|---|
| `npm run lint` | `[PENDING]` | |
| `npm run check` | `[PENDING]` | |
| `npm run check:flight` | `[PENDING]` | |
| `npm test` | `[PENDING]` | Prior interrupted run does not count. |
| `npm run verify:geometry` | `[PENDING]` | Review any traversal-path/allowlist churn manually. |
| `npm run verify:campaign-route` | `[PENDING]` | |
| `npm run verify:campaign-marathon` | `[PENDING]` | Mandatory for the route/call/save/handoff changes. |
| `npm run verify:boot-failure-surfaces` | `[PENDING]` | |
| `npm run verify:framing` | `[PENDING]` | |
| `npm run verify:enolasquatch` | `[PENDING]` | QA 1–6. |
| `npm run verify:mansion-return` and relevant Mansion verifier | `[PENDING]` | QA 7–8. |
| `npm run verify:cartel-palace` | `[PENDING]` | QA 9–12. |
| `npm run verify:initiation` | `[PENDING]` | QA 13–14. |
| `npm run verify:motel` | `[PENDING]` | QA 15. |
| `npm run verify:bing-two` | `[PENDING]` | QA 16–22. |
| `npm run verify:silver-story` | `[PENDING]` | QA 23–25. |
| `npm run verify:luxury-apartment` | `[PENDING]` | Shared hub contracts. |
| `npm run verify:luxury-apartment-browser` | `[PENDING]` | Explicitly required; do not leave it red or disconnected. |
| `npm run verify:cabin` | `[PENDING]` | Pure Cabin contracts. |
| `npm run verify:cabin-browser` | `[PENDING]` | Rerun the reported 44/44 on final commit. |
| Dialogue/line/reachability/rerecord/takes/voice/audio/radio checks | `[PENDING]` | Regenerate first, then run all listed above. |
| `npm run certify:debt-ratchet -- --trusted-ref "<trusted-base>"` | `[PENDING]` | Record the explicit trusted ref. |

## Final commit, push, deploy, and live evidence

| Delivery item | Final value |
|---|---|
| Final review branch | `[PENDING]` |
| Final commit | `[PENDING]` |
| Rebased onto | `[PENDING — must include origin/main 23533ffb or newer]` |
| Commit series / review breakdown | `[PENDING]` |
| Push target and result | `[PENDING]` |
| Merge/main commit | `[PENDING]` |
| GitHub Verify run URL and conclusion | `[PENDING]` |
| GitHub Pages run URL and conclusion | `[PENDING]` |
| Live Pages URL checked | `[PENDING]` |
| Live smoke path/results | `[PENDING]` |
| Browser screenshots/traces | `[PENDING]` |

## Remaining risks stated plainly

1. The branch is four commits behind `origin/main`, and the implementation is
   mostly an uncommitted multi-system worktree. Rebase conflicts and accidental
   loss of current-main verifier behavior are real risks.
2. The top-stair Luxury Apartment statue request is not implemented to the
   requested visual standard; only a simple focal primitive and presence test
   exist.
3. Luxury stairs, bathroom, closet/wall, and phone have meaningful contracts,
   but the attachment’s complete real-player traversal/visual matrix has not
   been attached as passing evidence.
4. Cabin has strong pure and intermediate live evidence, but every torture
   tool, the Gratin refusal/timeout branch, and impact decals still need final
   browser evidence on the shipped commit.
5. None of QA items 1–25 should be called shipped until their named browser
   verifier and the full authoritative gates pass after rebase.
6. The current one-line VO backlog and 4800/4800 manifest snapshot may change
   when the final authored dialogue is regenerated. The Lou briefing re-record
   remains explicit.
7. The radio workbook/generator exist in the worktree, but this report does not
   certify the workbook complete or the mechanical revamp shipped; final
   regeneration and `check:radio-vo` evidence are pending.
8. The Special Meeting script retains legacy flat-call catalog nodes for data
   continuity. The live scene currently starts at `SM-100`; future edits must
   preserve that split and must not replay `SM-030` after the Luxury Apartment.
9. The Mansion already contains a separate Silent Squatch lab. Reviewers must
   distinguish it from the Cabin dungeon and reject any rebase resolution that
   moves the Cabin captives, second secret door, or pyre chapter into the
   Mansion.
