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
| **Space** / Click | Smash |
| **R** | Rage mode (when the rage bar is full) |
| **P** / **Esc** | Pause |
| **M** | Mute |

On touch devices a virtual joystick and SMASH/RAGE buttons appear automatically. Full joystick deflection charges.

## Gameplay

- **90 seconds** to wreck the campground: trees, tents, cars, ranger trucks, cabins, RVs, a watchtower, picnic tables, outhouses, campfires, woodpiles, fences, trash cans, signs, flagpoles, canoes, a dock, coolers, and garden gnomes are all smashable. Rocks are not — sasquatch knows their limits.
- Bigger things take more hits (cars 2, cabins/watchtowers/trucks 3, RVs 4) and are worth more points.
- **Campers** wander the grounds. Scare them off the map for points — or smash them directly (they burst; it's that kind of game). Kill streaks earn RAMPAGE banners; trampling while charging counts.
- **Fire spreads**: smashed campfires ignite nearby flammables, and vehicles explode in a fireball that does the same.
- **Golden coolers** glow — smash one for +8 seconds on the clock.
- Chaining smashes builds a **combo multiplier** (up to x5); the decay bar shows how long you have to keep the chain alive.
- Smashing fills the **rage bar** — press **R** when it's full: a shockwave levels the area, your eyes go red, and you get 8 seconds of extra speed, radius, and damage.
- Destroy *everything* for a total destruction bonus.
- **Leaderboard**: top-10 scores are kept locally — make the board and you enter a 5-character arcade name.

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
