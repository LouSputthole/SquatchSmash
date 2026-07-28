# Squatch Smash

Two things live in this repo.

| | |
|---|---|
| **The apartment** (repo root) | First-person. You wake up at 6:04 AM with a fridge, a radio, a bathroom and a gaming PC, and nothing much to do. |
| **The campground game** ([`game/`](./game)) | The 3D rampage game — silver sasquatch, 90 seconds, one campground. Standalone, unchanged, still playable on its own. |

```bash
npm start        # the apartment -> http://localhost:5173
                 # the game      -> http://localhost:5173/game/
```

Both are static ES-module sites with no build step, served by the same
`npm start`. The campground game keeps its own `lib/three.module.js`, its own
README and its own single-file bundler (`game/tools/bundle.mjs`) so it stays
completely self-contained; the apartment uses `vendor/three.module.min.js` at
the root. Neither can break the other.

See [`game/README.md`](./game/README.md) for the campground game's controls and
scoring. Everything below is the apartment.

---

## The apartment

You wake up in your apartment at 6:04 AM. There's a fridge with beer in it, a
radio on the sideboard, squatch gear on the walls, and a gaming PC on the desk
that runs a game called **Squatch Smash**.

First-person, fully modelled, no build step. Three.js is vendored, every texture
and sound is generated at runtime, and the whole thing runs off a static server.

```bash
npm start          # http://localhost:5173
```

Any static server works — `npm start` just saves you picking one. Opening
`index.html` directly with `file://` will **not** work, because the game fetches
its manifests over HTTP.

---

## Controls

| | |
|---|---|
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> | move |
| <kbd>Shift</kbd> / <kbd>C</kbd> | sprint / crouch |
| <kbd>E</kbd> or left click | interact with whatever you're looking at |
| hold <kbd>F</kbd> | drink the beer you're holding |
| <kbd>Q</kbd> | drop or crush the held item / get up from the desk |
| <kbd>T</kbd> | flashlight |
| <kbd>R</kbd> | next radio track (while looking at the radio) |
| <kbd>Esc</kbd> | release the mouse and pause |

At the PC: move the mouse to aim, click to smash, <kbd>B</kbd> spends a
Steady Hands charge, <kbd>Q</kbd> stands up.

## What's in the apartment

Bed you wake up in, nightstand with a working alarm clock, a desk with a gaming
PC and monitor, a kitchenette with a counter, sink, cooktop, microwave and a
fridge stocked with beer, a couch, coffee table and rug, a sideboard with the
radio, a window with venetian blinds looking over a city at dawn, an evidence
corkboard, a wall clock, a bookshelf, a squatch crossing sign, and seven wall
slots for your own gear.

Things you can actually do: get out of bed, open the fridge, take a beer, drink
it, crush the can, turn the radio on and skip tracks, flip the lights, switch on
the floor lamp, raise and lower the blinds (the sun really does come through
them), read the corkboard, boop the desk bobblehead, inspect every piece of wall
art, and sit down at the PC to play.

Drinking a beer gives you a **Steady Hands** charge — a slow-motion burst you
can spend inside Squatch Smash with <kbd>B</kbd>.

---

## Adding your own stuff

Three folders take player-supplied content. Each has its own README with the
exact format.

### `assets/music/` — radio tracks

Drop audio files in and list them in `manifest.json`. Playback is positional:
the radio genuinely sounds like it's across the room, and it muffles when you're
heads-down at the PC. With no tracks the radio tunes to static.

### `assets/art/` — squatch gear on the walls

Drop images in and point a wall slot at each one. Frames size themselves to your
image's aspect ratio. Slots: `bed.above`, `couch.left`, `couch.right`,
`desk.left`, `desk.right`, `door.side`, and `banner.main` (rendered as a hanging
cloth banner rather than a frame). Anything you don't fill gets a procedurally
drawn placeholder poster, so no wall is ever blank.

### `assets/sfx/` — ElevenLabs sound effects

```bash
export ELEVENLABS_API_KEY=sk_...
npm run sfx                                    # every cue in assets/sfx/manifest.json
npm run sfx -- --only fridge.open,can.crack    # just these
npm run sfx -- --force                         # regenerate existing files
npm run sfx:dry                                # list what would run, generate nothing
```

Each of the 40 cues in `manifest.json` carries the text prompt used to generate
it — edit a prompt and regenerate that one cue to taste.

**This step is optional.** Every cue has a procedural WebAudio fallback in
`src/core/audio.js`, so the apartment is fully audible with no API key and no
files. Generating samples upgrades the sound with no code change; the engine
prefers a real file whenever one exists.

---

## The game on the PC

`src/arcade/squatchsmash.js` is a self-contained arcade game — boot screen,
desktop, menu, waves, combos, and a high score in `localStorage`. Smash the
squatches, spare the hikers and the cubs.

It's mounted through `src/arcade/mount.js`, which is the only place the
apartment touches it. Anything implementing that interface (`canvas`, `boot`,
`update`, `onPointer`, `onClick`, `onKey`, `sampleGlow`) can be returned from
`createArcade()` instead — the monitor will render it and the room will glow the
right colour. Swapping in a different Squatch Smash build changes one file.

---

## Layout of the code

```
index.html              importmap + HUD markup
src/main.js             renderer, state machine, input
src/core/               player controller, interaction raycasting, audio, radio, HUD
src/world/              apartment shell, furniture builders, procedural textures,
                        materials, and the wall-art loader
src/arcade/             the PC game and its mount point
tools/                  static server, ElevenLabs generator, project check
vendor/                 three.js (vendored so there is no install step)
```

The apartment is laid out on a fixed grid: x runs −5 (west) to +5 (east), z runs
−4.5 (north) to +4.5 (south), the ceiling is at 2.75m, and yaw 0 looks north.

`npm run check` parses every source file and validates the manifests — worth
running after editing JSON by hand, since a bad manifest otherwise shows up as a
silently missing texture.

In the browser console, `__squatch` exposes the scene, player and arcade, plus
`__squatch.teleport(x, z, 'north')` for jumping around while working on a room.
