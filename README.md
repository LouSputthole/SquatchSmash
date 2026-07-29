# SquatchSmash

A 3D game built with [Three.js](https://threejs.org/), starring the **Silver Sasquatches** mascot — silver fur, red bandana, zero patience.

Two playable scenes:

| Scene | Page | What it is |
| --- | --- | --- |
| **Scene One — Campground Rampage** | `index.html` | The campground closed early. Nobody told the sasquatch. Smash everything before the timer runs out. |
| **Scene Two — The Jerky Motel** | `motel.html` | A contraband beef-jerky buy in a tropical roadside motel that goes exactly as well as you expect. |

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

## Scene One — Campground Rampage

### Controls

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

### Gameplay

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

## Scene Two — The Jerky Motel

Prospect — full name Tony Squatchmontana, though nobody in the scene calls him that — is a sasquatch
trying to get made in the **squatch family**. He and his driver **Manny Hairyera**, who is already
family, pull into the Flamingo Motel at night to buy a suitcase of **The Reserve**: a
government-banned, seventy-two-hour-smoked, classified-spice beef jerky from a cattle bloodline
declared legally untouchable. Worth more per ounce than silver. Dangerously addictive to sasquatches.

Everyone selling meat in room twelve is **human**, and about half Prospect's height. That is most of
the joke and all of the staging: humans work doorways, corners and bathrooms because nobody works a
sasquatch head-on. Nobody involved acknowledges how stupid any of this is, and that is the point.

**The scene never takes control away from you.** Dialogue happens while people walk around, block
exits and get into position; the wheel slows time, it does not stop it. You can walk out of a
conversation, draw on somebody mid-sentence, or start swinging.

### Controls

| Input | Action |
| --- | --- |
| **WASD** | Move &nbsp;·&nbsp; **Shift** sprint |
| **Mouse** (click to capture) / **← →** | Look |
| **E** | Interact — knock, inspect, pick up, sit, signal, dispose |
| **F** / Left-click | Swing &nbsp;·&nbsp; **R** throw or fire |
| **Space** | Jump — and mash it to break a grapple |
| **G** | Drop the weapon you are holding (that is an evidence decision) |
| **1–4** | Answer with Calm / Threatening / Insulting / Jerky Expert |
| **Tab** | Objectives, optional objectives and warning signs found |
| **P / Esc** | Pause &nbsp;·&nbsp; **M** mute |

### The run

1. **The car.** You start in the passenger seat with $40,000 and full control. Talk to Manny, check
   the payment (pull the cash and leave only the expired steakhouse coupon if you are feeling
   confident), check your revolver, get out when you want.
2. **The lot.** Ten environmental **warning signs** are hidden around the motel — a chewed Reserve
   wrapper, a bloodied towel in the laundry cart, a camera aimed deliberately away from room twelve,
   a second car with the engine running, the bathroom window of room twelve opening an inch. Each one
   you spot buys a concrete advantage: a faster reaction when the room turns, marked enemy positions,
   Manny coming in sooner, the drainage-tunnel route, or the crowbar and hand cannon in the trunk.
3. **Room twelve.** Rico opens the door. Chino watches it, then locks it. There is a third man in the
   bathroom, and you can work that out before he works out that you know.
4. **The inspection.** Eight forensic checks — smell, bend, grain, moisture, taste, reference card,
   packaging scan, ask where it came from. The shipment is randomly **genuine, part-cut, or entirely
   counterfeit**, and the sample on top is not the shipment. Calling it correctly is an optional
   objective; calling it wrong follows you home.
5. **The turn.** The betrayal fires from any of: opening the money, proving the product fake,
   approaching the bathroom, maxing the suspicion meter, trying to leave, or simply taking too long.
   Where you are standing when Rico says *"bring out the cutting board"* decides how it starts.
6. **The fight.** Cramped, ugly and mostly furniture: kick the table, throw classified spices into
   somebody's eyes, pull the shower curtain down on them, shove a man into the television, rig the
   vacuum-sealer cord as a trip hazard, flip a mattress for cover, knock the ceiling-fan switch and
   fill the room with sparks, or go through the window. Downed sellers drop what they were holding.
7. **The case.** Rico may run for the door, the walkway or the bathroom window with your money;
   Chino may throw the Reserve into the empty pool and make you climb down after it.
8. **The escape.** Front walkway, the upstairs balcony, the drained pool and its drainage tunnel, or
   straight through the motel office (security monitor, register, emergency exit). Then decide what
   to do with the weapon: ice machine, vending compartment, the deep end, planted on Rico, dropped,
   or kept — each one prices differently in police attention.
9. **The drive.** A short chase to the safehouse with a **freshness meter** on the jerky. Crashes,
   broken windows and Manny "checking quality" all cost you product.

Fail states are soft: get put down inside and you wake up in the bathtub mashing your way out;
get put down outside and the sirens get closer. The scene always ends at Manny's car.

### Achievements

*Say Hello to My Little Snack* · *Against the Grain* · *Well Done* · *Rare Form* ·
*Motel Meat Inspector* · *No Beef Between Us* · *Prospect Pricing* · *Room Service*

## Audio

Every sound is synthesised at runtime with WebAudio — there are no audio files and the game needs
none. `assets/audio/sound-queue.json` is the production queue for real audio later: every cue the
game plays or wants (188 assets — SFX, ambience, music beds and all 95 spoken lines), each tied to
the code hook it would replace.

```sh
node tools/sound-queue.mjs          # regenerate the queue and check coverage
node tools/sound-queue.mjs --check  # fail if the code plays a cue nothing has briefed
```

Voice lines are read straight out of `src/motel/dialogue.js`, so the queue cannot fall behind the
script. See `assets/audio/README.md`.

## Tech

- Plain ES modules, no bundler — Three.js r160 is vendored in `lib/`.
- All models are built procedurally from primitives (with shared geometry/material caches); all sound effects are synthesized with the WebAudio API. No asset files.
- ACES filmic tone mapping, soft shadows that follow the player, procedural canvas ground texture.

## Project layout

```
index.html          Scene one: UI overlay, styles, importmap, touch controls
motel.html          Scene two: HUD, dialogue wheel, inspection panel, overlays
src/main.js         Scene one loop, input, camera, scoring, HUD, pause/mute
src/world.js        Campground scene, lighting, procedural props, pond
src/player.js       Sasquatch model and animations (shared by both scenes)
src/campers.js      Campers: wandering, fleeing, occupants, activities
src/rangers.js      Park rangers with tranq dart rifles
src/effects.js      Footprints, birds, shockwave rings, explosions (shared)
src/debris.js       Physics chunks when things break (shared)
src/audio.js        Scene one procedural WebAudio sound effects
src/motel/main.js   Scene two: phases, objectives, suspicion, combat, escape, chase
src/motel/level.js  The motel: two floors, room twelve, pool, office, colliders, floors
src/motel/actors.js Rico, Chino, the man in the bathroom, Manny, weapons and AI
src/motel/jerky.js  Shipment authenticity, the eight inspections, freshness
src/motel/dialogue.js  Dialogue wheel nodes, barks, the closing exchange
src/motel/audio.js  Motel ambience, tension bed, fight and chase music
tools/bundle.mjs    Single-file HTML bundler (`--motel` for scene two)
tools/sound-queue.mjs  Builds + checks the audio production queue
assets/audio/       Sound queue and audio notes (no audio files yet)
lib/                Vendored three.module.js
```

Bundle either scene into one self-contained HTML file:

```sh
node tools/bundle.mjs           # dist/squatchsmash.html
node tools/bundle.mjs --motel   # dist/jerky-motel.html
```
