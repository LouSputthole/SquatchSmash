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
- **Leaderboard**: top-10 scores are kept locally — make the board and you enter a 5-character arcade name.

## Goals

Fourteen challenges run alongside the clock, ticking off live in the HUD checklist (top right). Each one pays a flat bonus the moment it lands — no combo, no frenzy doubling — so they mean the same thing on every run.

| Goal | How |
| --- | --- |
| 🚗 **Demolition Derby** | Wreck every car, RV and ranger truck |
| ⛺ **Campsite Sweep** | Flatten every tent and campfire |
| 🌲 **Timberrr!** | Fell 40 trees |
| 😱 **Ghost Town** | Scare 15 campers off the map |
| 💀 **Splatterhouse** | Smash 20 campers |
| 🎯 **Ranger Danger** | Take down 4 park rangers |
| 💥 **Chain Reaction** | Pop 3 propane tanks in one blast |
| 🐝 **Beekeeper** | Burst every beehive |
| 🔥 **Arsonist** | Let fire burn down 10 things |
| ⚡ **Perfecto** | Reach a x5 combo |
| 🧙 **Gnome Lord** | Smash every garden gnome |
| 🚨 **Buckley Down** | Take down the Ranger Captain |
| 🛡️ **Untouchable** | Finish the run without eating a tranq dart |
| 🏆 **Total Destruction** | Wreck 100% of the campground |

Unfinished goals sort to the top of the checklist so the next thing to chase is always at eye level. Untouchable is the one you can *lose*: take a dart and it's struck out for the rest of the run.

## The Ranger Captain

With **30 seconds left**, Ranger Capt. "Big Buck" Buckley rolls in — sunglasses, gold-banded hat, over-under tranq rifle — with a health bar of his own. He doesn't burst like a regular ranger: he takes 10 damage, holds tranq range, strafes, and answers every swing with a spread volley. Rage and ground stomps hurt him most; so do explosions set off next to him. At half health he enrages — faster, tighter volleys — and whistles in two more rangers. Down him for 3,000 points, the goal, and the honey and stopwatch he was carrying.

## Rank

Every run is graded **S / A / B / C / D** on the end screen. Rank isn't raw score — it's

```
rating = score + (% wrecked × 400) + (goals completed × 2000)
```

so a thorough run outranks a lucky one, and the screen tells you exactly how far you are from the next letter.

## Career

The menu keeps a **career panel** — lifetime rampages, score, things smashed, humans flattened, campers scared off, goals earned, and best rank — plus six **sasquatch skins** you unlock as you play:

| Skin | Unlock |
| --- | --- |
| Silver Sasquatch | Default |
| Midnight | Play 3 rampages |
| Classic Bigfoot | Smash 250 things (career) |
| Blaze | Earn 10 goals (career) |
| Yeti | Finish a run at rank A |
| Golden Squatch | Finish a run at rank S |

Click an unlocked skin on the menu to wear it. **All of this is local**: the career, the leaderboard and your best score live in this browser's `localStorage` on this machine. There is no server and the game makes no network requests.

## Tech

- Plain ES modules, no bundler — Three.js r160 is vendored in `lib/`.
- All models are built procedurally from primitives (with shared geometry/material caches); all sound effects are synthesized with the WebAudio API. No asset files.
- ACES filmic tone mapping, soft shadows that follow the player, procedural canvas ground texture.

## Project layout

```
index.html      UI overlay, styles, importmap, touch controls
src/main.js     Game loop, input, camera, scoring, HUD, pause/mute
src/world.js    Scene, lighting, procedural props and placement, pond
src/player.js   Sasquatch model, animations, unlockable skin palettes
src/campers.js  Campers: wandering, fleeing, occupants, activities
src/rangers.js  Park rangers with tranq dart rifles
src/boss.js     Ranger Captain: model, health, volleys, enrage
src/goals.js    Goal definitions, progress tracker, HUD/end-screen lists
src/meta.js     Ranks, career totals, skin unlocks (all localStorage)
src/effects.js  Footprints, birds, rage shockwave rings
src/debris.js   Physics chunks when things break
src/audio.js    Procedural WebAudio sound effects
lib/            Vendored three.module.js
```
