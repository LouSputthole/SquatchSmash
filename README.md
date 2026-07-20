# SquatchSmash

A 3D rampage game built with [Three.js](https://threejs.org/). You are a sasquatch. The campground closed early — nobody told you. Smash everything before the timer runs out.

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
| **Space** / Click | Smash |
| **R** | Rage mode (when the rage bar is full) |
| **P** / **Esc** | Pause |
| **M** | Mute |

On touch devices a virtual joystick and SMASH/RAGE buttons appear automatically. Full joystick deflection charges.

## Gameplay

- **90 seconds** to wreck the campground: trees, tents, cars, cabins, RVs, a ranger watchtower, picnic tables, outhouses, campfires, a dock, and coolers are all smashable. Rocks are not — sasquatch knows their limits.
- Bigger things take more hits (cars 2, cabins/watchtowers 3, RVs 4) and are worth more points.
- **Campers** wander the grounds. Get close (or smash something nearby) and they flee screaming — chase them off the map for bonus points.
- **Golden coolers** glow — smash one for +8 seconds on the clock.
- Chaining smashes builds a **combo multiplier** (up to x5); the decay bar shows how long you have to keep the chain alive.
- Smashing fills the **rage bar** — press **R** when it's full to unleash a shockwave and get 8 seconds of extra speed, a bigger smash radius, and double damage.
- Destroy *everything* for a total destruction bonus. Your best score is saved locally.

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
src/campers.js  Wandering campers that flee when startled
src/effects.js  Footprints, birds, rage shockwave rings
src/debris.js   Physics chunks when things break
src/audio.js    Procedural WebAudio sound effects
lib/            Vendored three.module.js
```
