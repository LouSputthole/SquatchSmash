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
| **Space** / Click | Smash |
| **R** | Rage mode (when the rage bar is full) |

## Gameplay

- **90 seconds** to wreck the campground: trees, tents, cars, cabins, outhouses, campfires, and coolers are all smashable. Rocks are not — sasquatch knows their limits.
- Bigger things take more hits (cars take 2, cabins take 3) and are worth more points.
- Chaining smashes builds a **combo multiplier** (up to x5).
- Smashing fills the **rage bar** — press **R** when it's full for 8 seconds of extra speed, a bigger smash radius, and double damage.
- Destroy *everything* for a total destruction bonus.

## Tech

- Plain ES modules, no bundler — Three.js r160 is vendored in `lib/`.
- All models are built procedurally from primitives; all sound effects are synthesized with the WebAudio API. No asset files.

## Project layout

```
index.html      UI overlay, styles, importmap
src/main.js     Game loop, input, camera, scoring, HUD
src/world.js    Scene, lighting, procedural props and placement
src/player.js   Sasquatch model and animations
src/debris.js   Physics chunks when things break
src/audio.js    Procedural WebAudio sound effects
lib/            Vendored three.module.js
```
