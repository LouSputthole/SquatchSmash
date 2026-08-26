# Cabin Hideaway Basement and Dungeon

Implementation handoff for **THE HIDEOUT: BELOW THE FLOORBOARDS**, current as
of 2026-08-26. The authoritative dialogue is in
[`src/cabin/script.js`](../src/cabin/script.js); this document describes the
playable sequence, ownership boundaries, integration seams, persistence rules,
and production commands around it.

## Scope: Cabin only, never the Mansion

This is a new lower level beneath the **Countryside Cabin hideaway**. It is not
a Mansion room, a Mansion basement revision, or a Mansion story beat.

- The playable page is [`cabin.html`](../cabin.html), composed by
  [`src/cabin/main.js`](../src/cabin/main.js) and
  [`src/cabin/world.js`](../src/cabin/world.js).
- The first lower room is built by
  [`src/cabin/basement.js`](../src/cabin/basement.js). The buried connector,
  second secret door, dungeon, captives, tools, and armory mounts are built by
  [`src/cabin/dungeon.js`](../src/cabin/dungeon.js).
- Durable chapter truth lives in
  [`src/core/countryside-cabin-story.js`](../src/core/countryside-cabin-story.js)
  and the exact-once clock ledger in
  [`src/core/campaign.js`](../src/core/campaign.js).
- Nothing in this chapter imports from `src/mansion/`. The current worktree has
  no Mansion source or Mansion page diff for this feature. Do not move the
  dungeon there, add a Mansion entrance, or change Mansion geometry while
  iterating on this chapter.
- Shared systems may be reused without changing their scene ownership: the
  weapon/armory runtime, NPCs, blood effects, phone, audio engine, and canonical
  wrapped-body prefab are examples.

## Definitive chapter order

The durable state machine reports these phases in order:

```text
opening_call -> explore -> gratin_call -> open_cellar -> enter_dungeon
-> interrogation -> ateam_intel -> execution_choice -> execution
-> nightfall -> wrap_bodies -> carry_bodies -> pour_gas
-> ignite_bonfire -> fire_cleanup -> drink -> blackout
-> morning_call -> morning_wake -> complete
```

All campaign times below are exact-once. “At least” times move the clock
forward when necessary and never rewind a later save.

| Beat | Gate and result | Campaign time |
|---|---|---:|
| Cabin arrival | Post-heist route or `cabin.html?preview=1` seeds the hideaway in daylight | Day 5, at least 11:15 |
| Lou opening call | Must finish before Gratin's later call can advance | +3 min |
| Property exploration | Creek, overlook, forestry shed, and shooting range are four durable goals | +20 / +30 / +15 / +15 min |
| Margo handoff | First unique exploration marks and emits the one-shot external integration event | +0 min |
| Gratin call | Lou complete, two unique explorations, and the Margo handoff marker are required | +3 min |
| First secret | Gratin call reveals the wardrobe panel; opening it marks the cellar open | +0 min |
| Second secret | The loose-stone masonry door opens the buried connector and marks dungeon entry | +1 min |
| Interrogation | Tool-gated hits stop at 2 for the CS baiter and 6 for the A-Team captive | +0 min |
| Execution | Player or Gratin kills both captives; the two branches are mutually exclusive | +0 min |
| Nightfall | Lands immediately after both deaths | Day 5, at least 20:45 |
| Wrap and carry | Each wrap and each body delivered to the pyre has its own durable marker | +4 min per wrap, +4 min per delivery |
| Gas and ignition | Both bodies must be on the pyre before gasoline; ignition requires gasoline | +2 min, then +1 min |
| Fire sequence | Beer, whiskey, optional cigarette, bonding, and the final whiskey pull | First drink +5 min |
| Blackout | Wakes Tony in the Cabin bed; no fire-side reload after this marker | Day 6, at least 09:30 |
| Ape morning call | Completes the wake gate and allows the car to continue to the next job | +3 min |

The legacy `CABIN_REST` marker remains readable for old saves, but it cannot
bypass the dungeon, morning call, or departure gate.

## Progressive objective presentation

The phase list above is durable story truth, not a checklist that should be
shown to the player. The Cabin HUD and pause menu expose only two levels:

1. One spoiler-safe standing order, such as `Find Gratin` or `Burn the bodies`.
2. One quieter `NEXT` hint for the action that can be taken now.

Completed steps disappear instead of accumulating. Unvisited exploration
sites remain playable but are summarized as `Explore the property · N/2 sites
checked`; their names are not four separate objectives. The hidden cellar,
second secret door, prisoners, cleanup, night transition, blackout, and
morning exit do not appear before the story reveals them.

Cleanup is deliberately one objective. `Burn the bodies` appears only after
Gratin finishes the nightfall wrapping instructions, then advances through
wrapping, carrying, gasoline, ignition, and staying with the fire one soft step
at a time. The exact event markers still persist each action independently for
reload safety; they are no longer presented as separate missions.

## Exploration and phone gates

Lou rings on chapter start. Ending his completed call records
`CABIN_LOU_OPENING_CALL`; tearing down the page while a call is connected does
not pretend the call finished, so it rings again after restore.

Lou, Gratin, and Ape are required story calls. Once answered, pressing the
phone interaction again cannot skip them or award their completion marker;
each call must reach its authored natural end.

The four current exploration goals are:

1. `creek` — Follow the creek crossing.
2. `overlook` — Climb to the ridge overlook.
3. `shed` — Check the old forestry shed.
4. `range` — Walk the old shooting range.

The old firepit exploration marker is accepted only as a legacy alias for the
range. New play records `CABIN_EXPLORE_RANGE`.

After the first unique exploration, Tony plays the short “girl from the bar”
setup and the Cabin emits the Margo event described below. After the second
unique exploration, Gratin can ring. His call establishes all three essential
facts: he is already in the Cabin basement, he needs help, and Tony should
“Follow the Supreme Leader.” Finishing the call makes the first secret both
visible and interactable. Any unvisited exploration goals remain available,
but the single `Find Gratin` order becomes primary.

The return-to-Cabin VO remains owed after Gratin's call and queues once Tony is
within 30 metres of the Cabin. If Tony then spends 40 simulation seconds within
15 metres of the Cabin without opening the cellar, the one-shot “Am I a
dumbass?” / Supreme Leader hint plays. Time spent away from the Cabin does not
count, and pausing freezes the clock.

## Margo integration seam

The Cabin deliberately does **not** author or own a Margo phone conversation.
It owns Tony's setup line and one stable browser event; the separate Margo
owner supplies the actual call.

```js
window.addEventListener('squatch:cabin-margo-call-ready', (event) => {
  // Hand event.detail to the external Margo call owner.
}, { once: true });
```

The event detail is:

```js
{
  sceneId: 'countryside_cabin',
  explorationCount: 1, // or the restored count
  setupBeat: 'FIRST_EXPLORATION'
}
```

The source contract is `MARGO_CALL_READY` in
[`src/cabin/script.js`](../src/cabin/script.js). The external listener should
be installed before the Cabin chapter starts. The Cabin consumes its durable
handoff marker and continues even if no external listener is present; the
Margo content therefore never deadlocks Gratin's call. Restore also heals a
save that contains the first exploration but predates the one-shot handoff
marker, emitting the event once with restored chapter context.

## The two secret doors

### 1. Wardrobe panel to the stocked cellar

Before Gratin's completed call, the original `closet.back` art seals the
wardrobe and the concealed assembly, moving art, light leak, and interaction
target are absent. Ordinary wardrobe use still works and cannot accidentally
discover the basement.

After the call, opening the wardrobe pushes the hangers aside. Once the clothes
are physically clear (`closetT >= 0.82`), the player can push the concealed
panel and use the ladder transfer into the stocked cellar. The return ladder
lands squarely back at the wardrobe.

### 2. Loose-stone door to the dungeon

The cellar's south wall contains a handleless masonry leaf. Before the cellar
marker it reads as a seamless wall and cannot open. Once allowed, the prompt is
“Press the loose stone to open the second concealed door.” The leaf slides into
its west pocket, removes its live collider once clear, and reveals the ramped
connector, the shared armory racks, and the deeper dungeon.

Both doors remain part of the cleanup route. Wrapped bodies are carried back
through the dungeon door and up the wardrobe route; there is no Mansion exit or
off-screen Mansion transfer.

## Dungeon cast, interrogation, and IDs

| Role | Physical staging | Runtime identity |
|---|---|---|
| Gratin | Standing between the worktable and prisoners | Canonical Gratin identity, but a Cabin-owned NPC instance |
| A-Team captive | Generic disposable cartel member restrained on the medieval stretching rack | Dungeon `ateam`; story `ateam_member`; cleanup `a-team-member` |
| Counter-Strike baiter | Generic disposable gamer hanging upside down from the ankle rig | Dungeon `counterStrike`; story `counter_strike_player`; cleanup `counterstrike-player` |

The captives do not reuse a named Mansion, Initiation, or xXx character. Their
NPC controllers retain live head gaze and mouth animation while the restraint
pose is reapplied to the body and limbs, so they look toward Tony and visibly
speak during dialogue. The shared dialogue director maps `ATEAM` and `BAITER`
to those live NPCs and refuses overlapping beats.

Each captive owns eight durable damage slots. Interrogation intentionally
stops early:

- The CS baiter reaches his information threshold after 2 tool hits.
- The A-Team member resists until 6 tool hits.
- After an execution branch is chosen, weapon/cinematic damage can consume the
  remaining slots up to 8 before the death marker is accepted.

Tony must first select one of `pliers`, `saw`, `battery`, `syringes`, `towels`,
`leads`, or `bucket` from Gratin's work area. The rack, overhead rig, armory,
and worktable are inspectable dressing rather than selectable torture tools.
The authored interrogation preserves the required jokes and clue: bigger
baiter than Ape, Last Alive Gamer / First Alive Gamer, a mole inside the crew,
no known identity, and only the phrase “Short Bus.” The durable event records
that A-Team intel was learned; it does **not** claim that the mole's identity
was revealed.

Blood impacts and death pools use the shared
[`src/world/blood.js`](../src/world/blood.js) systems. The live captive is
retired only when its canonical wrapped-body presentation takes over.

## Execution branches

Gratin offers a shared nine-millimetre pistol and politely asks Tony to handle
the two prisoners. The choice overlay gives exactly 10 seconds of simulation
time:

- **YES / 1:** records the player branch, equips `PISTOL9`, and leaves both
  captives for Tony. A valid pistol impact consumes four durability units, so
  from the authored 2/6 interrogation state the baiter takes two valid hits and
  the A-Team captive takes one to reach their eight-slot limits.
- **NO / 2:** records the Gratin branch. Gratin asks Tony to step aside and
  performs the two shots.
- **No answer:** resolves to the same Gratin branch after the full 10 seconds,
  with distinct timeout dialogue.

The timeout and Gratin's shots use the chapter update clock, not wall timers;
pause freezes them. Gratin's deterministic shots land at 0.72 and 1.82 seconds
after his execution starts and skip any captive already dead on a restored
save. After both death markers exist, the clock moves to night and wrapping
becomes available.

## Physical wrapping, carry, and pyre flow

[`src/cabin/body-cleanup.js`](../src/cabin/body-cleanup.js) builds exactly two
instances of the shared
[`buildWrappedBody`](../src/core/props/wrapped-body.js) prefab. Those same two
objects move through every phase; there are no replacement capsules or fake
bags.

1. At night, interact with each dead captive's dungeon station to wrap him.
   Wrapping hides the live actor and reveals the matching canonical bundle.
2. Both bundles remain in the dungeon after the second wrap. There is no
   automatic yard staging or cast teleport.
3. Lift one bundle. It attaches to the camera at the shared carry pose, uses
   the inherited 5.2-radian/second, 0.012-metre bob, stows weapons, and disables
   sprint/jump while carried.
4. Carry it through the second secret door, through the cellar, up the wardrobe
   ladder transfer, and outside. The exterior skids are optional set-down and
   re-lift points; staging there does not award pyre progress.
5. Place the bundle on its authored firepit slot, then repeat for the other.
   Only after both are genuinely at the pyre do Lag and Gratin move to the fire.
6. Pour gasoline only after both placements, then ignite. The bodies progress
   through `at-fire -> burning -> burned`; the visual burn lasts 18 seconds.

The fire site contains cedar/pyre dressing, a gas can, beer cans, whiskey, a
smoking mess, and seats for the three men. Dialogue pauses for a required beer,
a required whiskey pull, an optional cigarette, and a final required whiskey
pull. The first alcoholic action records the durable drink beat; intoxication
continues to rise through the later pulls. The last beat fades to black, moves
the campaign to the Cabin `wake` spawn on Day 6, plays Tony's morning lines,
and rings Ape.

Reload behavior is deliberately conservative: a body already marked at the
fire stays there, but a body lifted and not yet delivered has no completion
marker and returns to its wrapped dungeon station. Gas, ignition, burn state,
night lighting, cast-at-fire staging, blackout, and morning are reconstructed
from durable story truth.

## Shooting range and armory

The shooting range is both an exploration landmark and a repeatable mini-game.
Interacting with it records the `range` exploration even if Tony has no weapon;
the HUD then tells him rifles are below the Cabin.

- Five physical targets sit in a tree-free lane behind a backstop.
- A round ends after 10 trigger pulls or 45 seconds.
- Score zones are body 10, outer 20, head 25, middle 30, and bull 50.
- Only the highest overlapping zone for one trigger counts, preventing a
  single shot or pellet cloud from farming stacked faces.
- Targets wobble and fall after three hits, then reset for the next round.
- Last and best scores survive range resets for the current page instance; they
  are not durable campaign progression.

The connector anteroom publishes two mounts consumed by the shared armory:
`WEAPON_IDS.AK47` and `WEAPON_IDS.BARRETT`. `mountArmory` supplies the real gun
models, ammunition, take/resupply interactions, collision, and inventory
behavior. The Cabin's shared `WeaponSystem` owns firing, delayed impacts,
range scoring, captive hit resolution, reloads, and HUD ammo state.

## Source map

| File | Responsibility |
|---|---|
| [`src/cabin/main.js`](../src/cabin/main.js) | Page composition, callbacks, phone/audio/HUD, weapon and blood adapters, input, presentation restore, debug surface |
| [`src/cabin/world.js`](../src/cabin/world.js) | Cabin/property composition and interaction registration |
| [`src/cabin/basement.js`](../src/cabin/basement.js) | Stocked cellar, first secret, ladder spawns, lower-floor ownership |
| [`src/cabin/dungeon.js`](../src/cabin/dungeon.js) | Second door, connector, armory mounts, dungeon geometry, actors, tools, hit targets, cleanup layout |
| [`src/cabin/chapter-runtime.js`](../src/cabin/chapter-runtime.js) | Presentation orchestration, ID translation, calls, beats, choice/execution clocks, cleanup and restore callbacks |
| [`src/core/countryside-cabin-story.js`](../src/core/countryside-cabin-story.js) | Durable gates, objectives, hostage state, branch truth, departure predicate |
| [`src/cabin/script.js`](../src/cabin/script.js) | Single source for dialogue, calls, action pauses, casting, cue names, Margo seam |
| [`src/cabin/dialogue-director.js`](../src/cabin/dialogue-director.js) | Ordered subtitles, audio receipts, mouth/head actor control, action pauses |
| [`src/cabin/execution-choice.js`](../src/cabin/execution-choice.js) | Ten-second yes/no UI and simulation clock |
| [`src/cabin/body-cleanup.js`](../src/cabin/body-cleanup.js) | Two physical wrapped bodies, carry/stage/pyre/gas/burn presentation |
| [`src/cabin/shooting-range.js`](../src/cabin/shooting-range.js) | Range geometry, score ownership, sessions, target reactions |
| [`tools/cabin-vo.mjs`](../tools/cabin-vo.mjs) | Script-to-manifest synchronization and drift check |

## Voice generation and delivery

`cabinScriptCues()` is the recording source of truth. `vo.cabin.dungeon.*`
belongs to the new chapter; the existing 30-line `vo.cabin.lag.*` hint bank is
separate and the Cabin VO synchronizer cannot prune it. The Lou, Gratin, and
Ape phone calls retain their existing `vo.call.*` namespaces. Margo has no
duplicate cues here.

Current expected state:

| Voice profile | Missing Cabin takes |
|---|---:|
| `player` | 57 |
| `gratin` | 53 |
| `npc-reserve-1` (CS baiter) | 6 |
| `ateam1` | 7 |
| `lag` | 12 |
| `lou1` | 3 |
| `ape` | 3 |
| **Total** | **141** |

The manifest currently has all 141 authored rows with valid voice profiles,
but `assets/sfx/index.json` and disk contain 0 of those 141 MP3s. This is
expected until the owner supplies or generates the new takes: subtitles still
play, while missing dialogue is silent.

Synchronize and check the authored rows without making an API call:

```sh
npm run vo:cabin
npm run check:cabin-vo
npm run sfx:vo -- --dry-run
```

Expected check output is `141 Cabin voice cues match the authored chapter.`;
the dry run should report `141 cue(s) to generate (0 sound, 141 spoken)` while
the takes remain absent. `VOICE-LINES-NEEDED.md` and `VOICE-LINES-TODO.md` are
already regenerated for this queue; their check commands must remain green.

To render with ElevenLabs, set the key only in the current shell and run the
live-voice generator. Never commit the key.

```powershell
$env:ELEVENLABS_API_KEY = '<key>'
npm run sfx:vo
```

```sh
export ELEVENLABS_API_KEY='<key>'
npm run sfx:vo
```

For owner-supplied files, use each cue's exact `<cue-name>.mp3` filename, copy
the takes into `assets/sfx/`, and then rebuild the index and recording sheet:

```sh
npm run sfx:listen
npm run voice:needed
npm run voice:needed:check
npm run check:cabin-vo
npm run verify:cabin
```

The generator rebuilds `assets/sfx/index.json` itself; `sfx:listen` is required
when recordings are dropped into the directory by hand.

## Restore, debug, and verification

Normal campaign play persists exact-once markers under the shared
`squatchlife.campaign` browser key. `cabin.html?preview=1` instead uses
page-local memory and intentionally starts clean after every reload, so use a
normal routed save or the headless restore tests when validating reloads.

Run the scene locally:

```sh
npm start
# open http://localhost:5173/cabin.html?preview=1
```

Useful console inspection through the page's supported debug surface:

```js
CABIN.story.phase()
CABIN.story.objectivePlan()
CABIN.chapter.snapshot()
CABIN.objectives
CABIN.range.snapshot()
CABIN.cleanup.snapshot()
CABIN.campaign.state.story.timeEvents
```

Useful focused controls while testing an already-reached phase:

```js
CABIN.visit('creek')
CABIN.visit('overlook')
CABIN.answerCall()
CABIN.hangUpCall()
CABIN.teleport('basementEntrance', 'interact')
CABIN.teleport('dungeonDoor', 'interact')
CABIN.teleport('dungeonWorktable', 'interact')
CABIN.teleport('dungeonAteamCaptive', 'interact')
CABIN.teleport('dungeonCounterStrikeCaptive', 'interact')
CABIN.selectDungeonTool('pliers')
CABIN.torture('counterStrike')
CABIN.torture('ateam')
CABIN.chooseExecution('yes') // use 'no' for Gratin
CABIN.shootHostage('counterStrike', 4)
CABIN.wrapBody('counterStrike')
CABIN.carryBody('counterStrike')
CABIN.placeBodyAtFire('counterStrike')
CABIN.pourGas()
CABIN.ignitePyre()
```

These calls obey the same chapter gates; dialogue/choice action pauses must
finish before the next gated action is accepted. The accepted ID translations
are defined in `DUNGEON_TO_STORY_HOSTAGE` and `STORY_TO_CLEANUP_BODY` in
[`src/cabin/chapter-runtime.js`](../src/cabin/chapter-runtime.js).

The focused acceptance command is:

```sh
npm run verify:cabin
```

It currently runs 92 tests covering the story clock and gates, four-landmark
field contract, both concealed doors, dungeon actors and interactions,
dialogue/actions, execution branches and timeout, physical cleanup, restore
checkpoints, range scoring, Lag integration, and exact VO manifest ownership.
The shared phone contract adds 9 focused tests, for 101 Cabin-plus-phone tests.
For final integration, also run:

```sh
npm run check
npm run verify:campaign-route
npm test
```

The Cabin-only geometry certification is:

```sh
node tools/verify-geometry.mjs --scene cabin --json
```

It must report zero findings, zero violations, and zero configuration errors.
This scene-specific gate intentionally does not rewrite or suppress unrelated
Mansion geometry baselines.

The production WebGL acceptance command is:

```sh
npm run verify:cabin-browser -- --screenshots
```

It proves the daylight arrival, hidden first entrance, scored range, both
secret doors, lower dungeon floor and collider removal, 2/6 interrogation
thresholds, polite decision overlay, player execution, Day 5 nightfall,
canonical wrapping, camera-attached carry through the wardrobe route, delayed
cast move, gasoline/pyre presentation, blackout, Day 6 wake, and Silver Case
departure gate. It also writes review images under `.artifacts/cabin/` when
`--screenshots` is supplied. Missing user-generated chapter takes are reported
as a handoff count rather than treated as a WebGL failure.
The browser verifier currently owns 44 checkpoints.
