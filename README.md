# SquatchSmash

A 3D rampage game built with [Three.js](https://threejs.org/), starring the **Silver Sasquatches** mascot — silver fur, red bandana, zero patience. The campground closed early — nobody told the sasquatch. Smash everything before the timer runs out.

> To show your team logo on the menu screen, drop a transparent PNG at `assets/logo.png` — it's picked up automatically.

## Play

The game is a static site with no build step. Serve the repo root with any static file server:

```sh
# pick one
npx serve .
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

> A server is required (rather than opening `index.html` directly) because the game uses ES modules.

## Controls

| Input | Action |
| --- | --- |
| **WASD** / Arrow keys | Move |
| **Shift** (hold) | Charge — smash things by barreling through them |
| **Space** / Left-click | Smash |
| **Right-click** / **F** | Ground stomp — area attack on a cooldown |
| **R** | Rage mode (when the rage bar is full) |
| **P** / **Esc** | Pause |
| **M** | Mute |

On touch devices a virtual joystick and SMASH/RAGE buttons appear automatically. Full joystick deflection charges.

## Gameplay

- **90 seconds** to wreck the campground: trees, tents, cars, ranger trucks, cabins, RVs, a watchtower, picnic tables, outhouses, campfires, woodpiles, fences, trash cans, signs, flagpoles, canoes, a dock, coolers, and garden gnomes are all smashable. Rocks are not — sasquatch knows their limits.
- Bigger things take more hits (cars 2, cabins/watchtowers/trucks 3, RVs 4) and are worth more points.
- **Campers** wander the grounds — and pour out of cabins, RVs, cars, tents, and (mid-business) outhouses when you start hitting them. Scare them off the map for points, or smash them directly (they burst; it's that kind of game). Kill streaks earn RAMPAGE banners; trampling while charging counts.
- **Park rangers** hunt you with tranq darts that slow you down (rage makes you immune). Two patrol from the start and backup arrives at the 45-second mark. They're worth 750 points if you can catch them.
- **Power-ups** are scattered around: honey (instant rage), coffee (speed), a mushroom (giant mode), and a stopwatch (+10s). Smashed humans sometimes drop loot worth +100.
- **Propane tanks** explode big and chain into each other; **beehives** release swarms that chase campers around the map.
- The last 15 seconds are **FINAL FRENZY**: everything is worth double while the sun sets over the carnage.
- **Fire spreads**: smashed campfires ignite nearby flammables, and vehicles explode in a fireball that does the same.
- **Golden coolers** glow — smash one for +8 seconds on the clock.
- Chaining smashes builds a **combo multiplier** (up to x5); the decay bar shows how long you have to keep the chain alive.
- Smashing fills the **rage bar** — press **R** when it's full: a shockwave levels the area, your eyes go red, and you get 8 seconds of extra speed, radius, and damage.
- Destroy *everything* for a total destruction bonus.
- **Leaderboard**: top-10 scores are kept locally — make the board and you enter a 5-character arcade name.

## The Squatchfather

A second, very different scene lives at `squatchfather.html` (linked from the main menu).

**Prospect** — the quiet younger member of the Sasquatches family — agrees to meet
Sal "The Prospector" Sorrento and Captain McClawsky in a small Italian restaurant
under the elevated line. Sal wants the servers, the skin market, and Wednesday
nights. There is a handgun taped behind the toilet tank in the bathroom.

It's a first-person, tightly directed set piece rather than a rampage: walk in, sit
down, sit through the conversation, excuse yourself, find the weapon, walk back,
wait for the train, and leave on foot without running. The parody is in the names,
the wallpaper, and the business being argued over — the scene itself plays straight.

| Input | Action |
| --- | --- |
| **WASD** / Arrow keys | Move |
| **Mouse** | Look (click the canvas to capture the cursor) |
| **E** | Interact — hold where the prompt says hold |
| **Left click** | Fire |
| **Esc** | Pause &nbsp;·&nbsp; **M** Mute |

Notes on how it's put together:

- One state machine (`START_EXTERIOR → … → SCENE_COMPLETE`) owns the flow; every
  system it drives is a separate module under `src/squatchfather/`.
- Dialogue is data (`dialogue/dialogue.json`), fetched at boot. Lines carry their
  own duration plus optional gaze and gesture cues.
- Seated dialogue takes the player's legs but not their eyes: look freely between
  Sal, McClawsky and the bathroom hallway, and no further.
- Failure states are supported and minor — leaving early gets you sat back down,
  two wrong searches get a muttered "Come on.", and being too slow on the second
  shot cuts to black and restarts at the table, not at the front door.
- The cracked bathroom mirror is a real reflection: Prospect's body lives on render
  layer 1, invisible to the first-person camera and visible only to the mirror's.
- All sound is synthesised (`audio/core.js` + the ambience, train, gunshot and foley
  modules) — room tone, the train building overhead, and the ringing afterwards.

## Tech

- Plain ES modules, no bundler — Three.js r160 is vendored in `lib/`.
- All models are built procedurally from primitives (with shared geometry/material caches); all sound effects are synthesized with the WebAudio API. No asset files.
- ACES filmic tone mapping, soft shadows that follow the player, procedural canvas ground texture.

## Project layout

```
index.html      UI overlay, styles, importmap, touch controls
src/main.js     Game loop, input, camera, scoring, HUD, pause/mute
src/world.js    Scene, lighting, procedural props and placement, pond
src/player.js   Sasquatch model and animations
src/campers.js  Campers: wandering, fleeing, occupants, activities
src/rangers.js  Park rangers with tranq dart rifles
src/effects.js  Footprints, birds, rage shockwave rings
src/debris.js   Physics chunks when things break
src/audio.js    Procedural WebAudio sound effects
lib/            Vendored three.module.js

squatchfather.html          The Squatchfather: UI overlay, styles, importmap
src/squatchfather/
  main.js                   Boot, input, loop, and the scene's state definitions
  scenes/                   The set: street, dining room, hallway, bathroom
  state/                    Scene state machine + checkpoint
  dialogue/                 dialogue.json and the subtitle controller
  interaction/              Look-at-and-press-E, the chair, the toilet, the drop
  cinematic/                Camera director, seated camera, deferred timeline
  characters/               Prospect (first-person), Sal, McClawsky, shared figure
  audio/                    Ambience, train, gunshot, foley, WebAudio core
  effects/                  Camera shake, train vibration, ear ringing, mirror
```
