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

## Prologue: The Initiation

`initiation.html` (also linked from the main menu; the in-progress apartment scene leads here directly, so there's no title screen) is a story scene set the night before the rampage. The Silver Sasquatches are *people* — the actual crew: Booskibro runs the ceremony from the stage, while Lou, Deathmegatron, Shubes, Rippinflow, Erican, Hogmama, Gratin, Sasole, and Snow stand front row with their real faces (photo textures in `assets/faces/`, name tags overhead). You're the human from the apartment. Walk toward the bonfire glow through the pines and Booskibro will put you through the Circle's initiation rites:

1. **The Gauntlet** — the members circle up and beat you down to a fifth of your health. Endure it. Swing back even once and you fail the initiation (you can retry).
2. **The Roar** — press **R** and let the forest hear you.
3. **The Timber** — break the ceremonial great log in three blows (mind your aim: striking a member still fails you).

Survive all three and you're anointed on the spot — the flash fades and a **silver sasquatch** is standing in your shoes — then it's off to the campground.

Booskibro's speech lines live in the `SPEECH` const at the top of `src/initiation.js` and are placeholder text; edit freely.

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

## Tech

- Plain ES modules, no bundler — Three.js r160 is vendored in `lib/`, with the r160 `examples/jsm` postprocessing stack (UnrealBloom) vendored in `lib/jsm/` for the initiation scene's night glow.
- All models are built procedurally from primitives (with shared geometry/material caches); all sound effects are synthesized with the WebAudio API. No asset files.
- ACES filmic tone mapping, soft shadows that follow the player, procedural canvas ground texture.
- The initiation scene renders through an HDR bloom pipeline: emissive materials (bonfire, embers, torches, moon, stars, fireflies) are pushed above 1.0 so only true light sources glow.

## Project layout

```
index.html          UI overlay, styles, importmap, touch controls
initiation.html     Prologue scene page: dialog, HP bar, overlays
src/main.js         Game loop, input, camera, scoring, HUD, pause/mute
src/initiation.js   Prologue: night forest, bonfire, ceremony state machine
src/world.js        Scene, lighting, procedural props and placement, pond
src/player.js       Sasquatch model, palettes, and animations
src/person.js       Human character model (initiation prospect, members)
src/campers.js      Campers: wandering, fleeing, occupants, activities
src/rangers.js      Park rangers with tranq dart rifles
src/effects.js      Footprints, birds, rage shockwave rings
src/debris.js       Physics chunks when things break
src/audio.js        Procedural WebAudio sound effects
lib/                Vendored three.module.js (+ lib/jsm/ postprocessing)
```
