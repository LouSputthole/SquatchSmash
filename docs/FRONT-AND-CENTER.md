# Front and Center — repository audit and implementation map

The Copacabana-entrance date mission, built on what is already here.

## What the audit found

The important finding is that `main` is not where this game lives. `main` is
still the original 90-second campground rampage. Everything this mission needs
exists on three open pull requests, and two of them stack:

| PR | Branch | What it carries |
| --- | --- | --- |
| #1 | `claude/apartment-game-squatch-smash-5aw8oc` | The flat. `src/core/*` — player, interaction, HUD, audio, drunk, highs, inventory, postfx, **phone**, radio, stations. `src/world/*` — build helpers, materials, props, textures. |
| #3 | `claude/bada-bing-level-h1x7v0` | **Based on #1.** The Bada Bing. `src/bing/*` — club builder, cast (`makePerson`/`Npc`), non-modal dialogue, mission state machine, gambling, vehicles, procedural textures (`kit.js`). `tools/verify-bing.mjs`. |
| #2 | `claude/squatchfather-scene-o13uzh` | Based on `main`. The restaurant. Its own parallel engine — seated dialogue, cinematic director. Establishes **Prospect** as the family's quiet younger member. |

`claude/front-center-club-mission-0s9u3z` is therefore based on **#3**, the
deepest stack, so the mission inherits both the flat's core and the club's cast
and dialogue. Nothing is forked from #2; its contribution is continuity — the
character, not the code.

## Systems reused without change

| System | File | Used for |
| --- | --- | --- |
| First-person controller | `core/player.js` | Walking the entrance. `sitAt`/`standFrom` handle the table. `world.groundAt` handles the cellar ramp and the stage. |
| Look-at interaction | `core/interaction.js` | Every greeting, tip, door and chair. Tap/hold on one target is exactly the greet-then-tip input. |
| HUD | `core/hud.js` | Prompts, subtitles, toasts, posture hint. Woo uses `toast()` and its own strip. |
| Non-modal dialogue | `bing/dialogue.js` | Every conversation, including the seated rounds. Range-lapse gives the "walked off mid-sentence" behaviour free. |
| Audio engine | `core/audio.js` | `play`/`startLoop`/`stopLoop`/`setLoopVolume` for the five zone beds, `setMuffle` behind doors, positional panners for kitchen barks. |
| People | `bing/cast.js` | `makePerson` and `Npc` build every member of staff, the crowd and Delia. `job: 'work' | 'patrol' | 'sit' | 'drink' | 'lean'` covers the kitchen without new animation code. |
| Doors | `bing/club.js` `Door` | Service door, walk-in, kitchen swing doors, curtain. Collider leaves the array while the leaf is open. |
| Procedural texture kit | `bing/kit.js` | Brick, asphalt, panelling, tile, neon, printed signage. |
| Prop makers | `world/props.js` | Chairs, bottles, glasses, ashtrays, frames, clock, plants. |
| Phone | `core/phone.js` | Delia's call. It is already built around *being rung*, which is the requirement. |
| Post FX, materials, build helpers | `core/postfx.js`, `world/materials.js`, `world/build.js` | Unchanged. |

## Systems extended (additively)

- **`core/phone.js`** — one new entry in `CALLS`. No structural change; the call
  format already carries `vo`, `lines` and a `meeting` hook.
- **`bing/cast.js`** — `makePerson` gains `dress: 'chef' | 'porter' | 'gown'`
  and an apron/whites path. Everything existing keeps its current appearance.
- **`bing/club.js`** — nothing. The Silver Room is its own builder in
  `src/silver/room.js`, using the same helpers.
- **`core/audio.js`** — the Silver Room's cues and five ambience beds, added the
  same way the club's were.

## New, all under `src/silver/`

| File | What |
| --- | --- |
| `room.js` | The Silver Room: street, alley, service door, stair, cellar, dry store, walk-in, prep, kitchen, dish, corridor, coat check, service bar, host station, dining room, stage, backstage, restrooms, manager's station, rear exit. |
| `cast.js` | Staff and crowd. The tip roster. |
| `date.js` | Delia: follower, gaze, comment triggers, seated behaviour. |
| `woo.js` | The Woo score. Event table, non-repeatable ledger, bands, outcome resolution. |
| `mission.js` | The 22-state machine, checkpoints, persistence. |
| `script.js` | Every line anybody says. |
| `perform.js` | The Midnight Pines: band, stage lighting, the set. |
| `main.js` | Glue. |
| `silver.css` | The Woo strip and the tip pip. |

Plus `silver.html`, `tools/verify-silver.mjs`, and `docs/VOICE-LINES-SILVER.md`.

## The date

**Delia Vance**, on air as **Hog Mama** — 97.8 The Squatch, ten till two, "no
script, no plan". She is not invented for this mission: she has been talking to
Prospect through the radio in his own flat since PR #1, twenty-four exchanges of
her being alone on a bus at two in the morning.

- **Why she is interested.** He called the show once and did not want anything.
- **Why she stays skeptical.** She improvises for a living. She can see a bit
  being performed from across a room, and this entire evening is a bit.
- **Memorable detail.** The handle is her father's shop — she grew up over a
  butcher's on the same block as the union half the Bing whispers about.
- **Drink.** Rye, one ice cube. One.
- **Music.** A live horn section. She will not sit through a backing track.

## Assets reused

Procedural, all of it — same as the rest of the repo. Chairs, tables, bottles,
glasses, ashtrays, frames, plants and the wall clock come from `world/props.js`.
Brick, asphalt, panelling, tile and neon come from `bing/kit.js`. The human
figure comes from `bing/cast.js`. Vehicles come from `bing/vehicles.js`.

## Missing, and how it is handled

| Missing | Handling |
| --- | --- |
| Voice recordings | Same as the radio and the phone before it: the line shows and holds for a reading beat until an mp3 exists at the cue name. Manifest in `docs/VOICE-LINES-SILVER.md`. |
| Kitchen SFX | Synthesised in `core/audio.js` alongside the club's. |
| The band's music | Synthesised — a brass-and-brush bed with stems, so ducking is real rather than a global volume dip. |
| Chef whites, aprons, gowns | Added to `makePerson`, procedural like everything else. |
| Dance animation | Deliberately **not** attempted as a partner dance. The animation library cannot hold two figures in contact without them sliding. Replaced, as the brief allows, with a standing sway at the table edge, a song request and a toast. |

## Technical risks

1. **Crowd cost.** The Bing runs 29 people; the dining room wants more. Handled
   with the existing three-tier `Npc` update (`hero` every frame, `ambient` at
   20 Hz, `background` at 6 Hz) plus a distance cull on the far half of the room.
2. **Companion pathing through a working kitchen.** There is no navmesh in this
   engine. Delia follows a recorded spline of the route with local avoidance
   rather than pathfinding, and the route is authored, which is what makes it
   reliable.
3. **The continuous route.** One scene, no loads. The cellar and kitchen are
   modelled at the same scale as the club and gated by doors, so occlusion does
   the work a loading screen would have.
4. **The table must survive the cutscene.** It is built as a real prop, hidden,
   and moved by the staff during the cutscene. There is no second table.

## Order of work

1. `woo.js`, `mission.js` — pure logic, testable without a browser. ✅
2. `script.js` — the writing. ✅
3. `room.js` — the building. ✅
4. `cast.js`, `date.js` — the people. ✅
5. `perform.js` — the band.
6. `main.js`, `silver.html`, `silver.css` — glue.
7. `core/phone.js` — Delia's call; `bing/main.js` — the prior encounter.
8. `tools/verify-silver.mjs` — drive it end to end.
9. Tune.
