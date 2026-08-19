# Final campaign integration contract

Status: implemented contract for `codex/final-campaign-stitch-polish-20260807`;
the last broad live-scene baseline and final focused browser evidence are
recorded in `CAMPAIGN-FLOW-AND-POLISH-REPORT-2026-08-08.md`.

This document records what is verified in the repository, what the production
route will become, and which existing work is deliberately protected while the
last campaign chapter is connected. It is not a replacement script for any
scene. Scene dialogue remains authoritative in its own catalog.

## Protected boundaries

- `initiation.html` and `src/initiation/**` are frozen pending human playtest.
  This pass may route into Initiation and mark it `in_progress`; it may not
  alter its scene, dialogue, staging, mechanics, or completion behavior.
- The Margo come-home dress-help sequence is frozen exactly as it is. Preserve
  the `cameHome` -> `MARGO_COME_HOME` one-shot handoff and regression-test it;
  do not change its dialogue, poses, camera, timing, audio, reveal, or mechanic.
- Existing campaign missions remain playable. The final arc is inserted after
  THE TAKE rather than deleting Golf, THE TAKE, or the post-heist apartment.
- Existing saves already at or legitimately exposed to Initiation remain
  grandfathered. A schema migration must not strand or roll them backward.

## Verified route before this pass

The current production route is:

1. Apartment / Bada Bing introduction
2. Squatchfather
3. Beef Run
4. HotDog Incident -> Graveyard -> Motel
5. NO WAKE
6. Front and Center -> optional Margo apartment night
7. Silver Pines
8. THE TAKE -> post-heist apartment cleanup
9. Initiation

Before this pass, the following built scenes were standalone or only partially
wired:

- The Silver Case ended at a replay surface.
- PROJECT SILENT SQUATCH could silently invent the case and completed at Lou,
  without the authored quiet mansion evening or sleep handoff.
- Mansion Under Siege had no campaign entry or Enola transition.
- Enola Squatch began and ended like a standalone delivery flight.
- No repaired-mansion return scene or Cartel Palace runtime existed.

## Accepted production route

The preservation-first route is:

```text
THE TAKE
  -> post-heist apartment cleanup
  -> The Silver Case
  -> Lou's Mansion / PROJECT SILENT SQUATCH
  -> quiet mansion evening and guest-room sleep
  -> Mansion Under Siege
  -> Enola Squatch
  -> repaired Mansion return / fact bridge (briefing prose pending)
  -> Cartel Palace
  -> Initiation (enter in_progress; frozen scene)
```

The newest planning note said “immediately after Silver Room,” while the older
day map and the playable route put these missions after THE TAKE. Inserting the
arc after post-heist cleanup is the least destructive interpretation: every
finished mission survives, the final chapter gains a clean start, and the
Initiation remains the campaign capstone. If the owner later chooses the
earlier placement, the topology can move without changing individual scene
contracts.

## Scene and mission identities

Use distinct scene IDs even when two phases share one page and world builder:

| Scene ID | Runtime | Entry | Exit |
|---|---|---|---|
| `silver_case` | `silvercase.html` | case assignment | mansion drive |
| `mansion` | `mansion.html` | driveway / office | quiet evening |
| `mansion_siege` | `mansion-siege.html` | guest-room wake | Sasole handoff |
| `enola_squatch` | `enolasquatch.html` | airfield | repaired mansion |
| `mansion_return` | `mansion.html` | repaired driveway | final raid |
| `cartel_palace` | `cartel-palace.html` | estate approach | Initiation |
| `initiation` | existing frozen runtime | gathering | terminal |

Mission records are required for Silver Case, Silent Squatch, Mansion Siege,
Enola Squatch, and Cartel Palace. The repaired-mansion return is a scene
phase/event rather than a second mansion mission. Checkpoint URL parameters are
preview-only; campaign saves remain the durable source of truth.

## Narrative seams

1. Silver Case must hand the same `ITEM_IDS.SILVER_CASE` prop to the mansion.
   Silent Squatch may no longer fabricate it on a routed fresh campaign.
2. Silent Squatch ends with a quieter ensemble phase. Sauce is visibly present
   before his later apparent kidnapping. Tony sleeps in Lou's guest room.
3. Siege begins from that sleep, leaves the house damaged, and ends with Tony
   handed directly to Captain Lou Sasole.
4. Enola's old “remember the jerky run?” phone opening and generic package
   ending are replaced with new cue IDs and an in-person continuation.
5. Enola returns Tony to the repaired mansion. The current one-interaction
   fact bridge records the wrong-city operation, Sauce's apparent capture, and
   Mark's estate, then advances. It has no approved spoken briefing prose yet.
6. Cartel Palace reveals Sauce as the traitor and uses Mark as the final boss.
   Exact confrontation dialogue and outcomes require owner approval; do not
   improvise recordable final prose merely to fill a spreadsheet.
7. Only successful completion/extraction exposes the existing Initiation.

## Authored campaign clock

Campaign schema v14 owns final-arc travel and mission time as exact-once
events. The canonical schedule is Silver Case departure Day 5 at 4:00 PM,
case completion 5:30 PM, Mansion arrival 5:55 PM, Silent Squatch completion
8:10 PM, guest-room wake Day 6 at 4:10 AM, Siege completion 6:10 AM, Enola
departure 2:00 PM and completion 6:00 PM, Mansion return 6:30 PM and fact-bridge
completion 7:15 PM, then Palace departure 8:30 PM and extraction 11:00 PM.

The source workbook's **Day 5 night** Siege label means the overnight begun on
narrative Day 5; the campaign's calendar-day field is Day 6 after the authored
eight-hour sleep. Migration from v13 marks only transitions already proven by
scene or mission progress, never rewinds a later clock, and leaves
grandfathered Initiation saves untouched. Preview storage remains isolated.

## Reload and completion recovery

Ordinary campaign reloads consume the durable mission checkpoint rather than a
URL shortcut. Silver Case, PROJECT SILENT SQUATCH, Mansion Under Siege, Enola
Squatch, and Cartel Palace all re-enter through their existing playable restore
paths. Silver, Siege, and Enola also reopen their established completion card
when the mission was durably completed before the player clicked Continue;
restoring the card performs no campaign write and never navigates automatically.

The durable payload contains only bounded story and performance facts, never
scene objects or transforms. It preserves Silver's Winston/Ape branch, Enola's
fuel, primitive damage, report score and targeting accumulator, and the
Palace's partial evidence, alarm, individual targets and outcome. A pre-fix save
that lacks the facts required to resolve a branch replays its last unresolved
beat: Silver returns to the aftermath choice, Enola restarts at score-safe
takeoff, and a Palace `clear` save without an outcome replays the dining room.
The focused real-browser contract passes 69/69, including page reload, card
recovery, player-controlled continuation, and preview/localStorage isolation.

## Inventory contract

Every playable final-arc combat scene shows five carry slots and accepts keys
1-5. The shared `final-arc-loadout` contract in this pass deliberately
serializes **firearms only**: weapon IDs, stable slot order, selected/equipped
state, magazine rounds, and reserve ammunition. It is not a generalized story
prop inventory.

Inventory items fall into four classes:

- durable final-arc hotbar carry: earned firearms;
- scene-owned story carry: the Silver Case uses a Mansion hotbar slot while
  that mission owns it, while the phone remains its existing UI/story prop;
- future portable trophies: out of scope until a shared story-item adapter is
  explicitly designed rather than silently stored in the firearm contract;
- mission transient: drinks, cleaning tools, heist bags, keys, and local props;
- world carry: bodies and other two-hand objects that are not hotbar items;
- station equipment: aircraft tail guns, boat controls, and mounted weapons.

Entering a scene hydrates durable items and checkpointed local items without
deleting either. Pickups fill the first free slot or return an explicit “full”
failure. Stowing a firearm does not discard ownership. Scene exit serializes
durable slot order and selection; checkpoint restore includes local contents
and selected slot. A fictional confiscation must declare and later restore its
policy.

Implemented invariants:

- Mansion preserves every earned firearm; Q stows it and a deliberate rack
  return removes only that weapon.
- Siege shares the same five slots and reads the canonical `rounds`/`reserve`
  snapshot fields.
- Enola displays inherited carry on foot while its tail gun remains station
  equipment outside the hotbar.
- Cartel Palace hydrates the shared final-raid loadout and checkpoints ammo.
- A confirmed campaign reset clears the loadout storage key along with story
  progress, so a new Day One cannot inherit late-game weapons.

## Voice and dialogue production

The manifest and scene catalogs are authoritative. Generated Markdown and the
workbook must follow this chain:

```text
scene catalog -> scene VO sync -> manifest -> voice:needed/audio:todo
-> recording -> sfx:listen -> checks
```

Current reachable ledger after the production-scope repair:

- 3,217 reachable spoken cues;
- 3,080 current indexed performances;
- 137 pickups: 124 missing plus 13 replacement takes;
- 116 recorded future Initiation party/ambient cues excluded from live totals.

The surfaced missing takes include the 12 already-authored Mansion post-lab
and quiet-evening cues plus the final-arc locked apartment-door refusal. They
are present in the scene catalogs, manifest, generated handoffs, and the
campaign-ordered workbook rather than silently omitted. Booski's current
first-visit shot line is the thirteenth marked recast: its indexed file contains
superseded wording and is no longer counted as a current performance.

The featured Front and Center waiter alone maps to `silver-waiter`, voice ID
`gAMZphRyrWJnLMDnom6H`. The other 80 host, room, band, and staff cues retain
the shared `waiter` actor. The new 12 takes remain a marked recast until they
are generated, auditioned, indexed, and the temporary marker is removed.

The generated sampled-effect queue contains 72 shared-manifest cues. NO WAKE
contributes five and Front and Center contributes three. Six are newly authored
Mansion Siege cues for alarm, checkpoint, fire, friendly revive, glass shatter,
and incoming wave. Their gameplay callsites are wired through the Siege
mission-audio adapter, but all six MP3 samples remain unrecorded and use
procedural fallbacks. Jerky Motel's 74 older sampled-audio briefs are
quarantined in the legacy review backlog; they are not current manifest
filenames and do not represent a current runtime failure. The current HotDog
scene split contributes three VO pickups to the 137-line queue.

## Preview and verification contract

- Every final-arc scene receives a normal `preview=1` entry.
- Checkpoint shortcuts are bounded and must never mutate durable campaign
  storage.
- Fresh-campaign verification passes from a blank vCurrent save through entry
  to Initiation. The test stops with Initiation `in_progress`.
- Migration tests cover v12 topology, v13 final-arc clock repair, standalone
  mansion progress, and already-exposed Initiation without rewinding later
  clocks.
- Cross-scene inventory tests cover five slots, additive pickup, non-
  destructive stow, serialization, and checkpoint restoration.
- Keep focused browser verifiers for Beef Run, Front and Center, Mansion,
  Siege, Enola, Cartel Palace, preview isolation, and the fresh route. The final
  focused runs prove Beef's six public checkpoint links **6/6**, including the
  repaired input/physics brake restore; Mansion **273/273** in **481.7s**, with
  the new pool, gate crests, named bedroom, and grey sedan green; and Enola
  **98/98**, reading the real four owner nose-art plates.
- Mansion's final measurement reports 27 visible lights and 649 shadow
  casters. With the 2026-08-19 room/portal visibility pass on (the default;
  `?novis=1` disables it), the same recorded poses measure 14,424 draw calls
  from the gate view and 8,061 from the foyer view, against 15,984 and 10,024
  with the pass off on the current, larger house.
- Mansion Siege is **105/106**. All gameplay, mission-audio callsite, and
  checkpoint assertions pass; the sole failure groups the six required Siege
  recordings that are authored and requested but still absent from the index.

## Performance and geometry gates

- Enola's preflight targets now refresh descendant world matrices before the
  renderless interaction raycast. The real walk, chock interaction, boarding,
  and campaign handoff are browser-verified.
- Keep Mansion's draw-call/shadow limits enforceable. Mansion and Siege now
  verify on ANGLE with SwiftShader and assert a healthy WebGL context. The two
  prior depth-material validation errors reproduced only on the intermittent
  direct-SwiftShader verifier backend; no production shadow/material bypass was
  retained.
- Promote collision/reachability and selected draw-call limits from advisory
  reports into failing verification where stable.
- Prefer shared LOD, culling, light pooling, and audio scoping over simply
  reducing scene detail.
- Headless hardware-only probing was inconclusive. The headless ANGLE results
  are regression evidence only; physical RTX 4080 performance sign-off remains
  explicitly unverified.

## Owner decisions still open

These do not block topology or engineering:

1. Final approval of the exact Mark/Sauce confrontation and outcome lines.
2. Approved Mansion Return briefing prose. The current runtime is intentionally
   only a one-interaction fact bridge.
3. Whether the final arc should later move from post-heist to immediately after
   the Silver Room despite the completed Golf/THE TAKE continuity.
4. Final raid loadout and whether any confiscation occurs at the palace.
5. Audition approval of the 12 new waiter takes after they can be generated.
6. Mansion Siege named-cast survival policy: plot protection, one authored
   death, or a downstream-persistent player rescue/failure branch.
7. Whether THE TAKE stays intact or becomes the proposed larger `HOT SQUATCH`
   redesign; the latter is a separate mission-production decision.
8. Identity of the dead Bada Bing performer in the Siege foyer.
