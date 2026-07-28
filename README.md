# Squatch Life

Two things live in this repo.

| | |
|---|---|
| **Squatch Life** (repo root) | First-person. You wake up on Tuesday at 6:04 AM with a fridge, a radio, a bathroom and a gaming PC. The Squatch meeting is tomorrow night. |
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

## Squatch Life

You wake up in your apartment on Tuesday at 6:04 AM. There's a fridge with beer in it, a
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

If you need it somewhere you can't run a server — a sandboxed frame, a hosted
preview, an email attachment — `npm run bundle` writes
`dist/squatch-apartment.html`: every module, three.js, every image and every
manifest inlined, with no external requests at all.

```bash
npm run bundle                 # ~3.8 MB, art re-encoded to 520px
npm run bundle -- --full       # keep the art at full size (~9 MB)
npm run bundle -- --max=1024   # somewhere in between
```

Each module becomes a `data:` URI and every import is rewritten to a flat
specifier resolved through an importmap — so there's no concatenation and no
scope merging, which matters when six files each define their own `clamp`.
Bundled builds set `window.__SQUATCH_INLINE`; `src/core/assets.js` is the one
place that knows the difference. Pointer lock is unavailable in some frames, so
the game falls back to hold-left-button-to-look rather than being unplayable.

---

## Controls

| | |
|---|---|
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> | move |
| <kbd>Shift</kbd> / <kbd>C</kbd> | sprint / crouch |
| <kbd>E</kbd> or left click | interact with whatever you're looking at |
| hold <kbd>E</kbd> | the second thing that target does — lie down on the bed, tune the radio |
| hold <kbd>F</kbd> | drink the beer, pull on the bottle, smoke the cigarette |
| <kbd>Q</kbd> | drop the held item, get up from wherever you are sitting |
| <kbd>G</kbd> | fart |
| <kbd>T</kbd> | flashlight |
| <kbd>R</kbd> | skip the radio on |
| <kbd>Esc</kbd> | release the mouse and pause |

At the PC: <kbd>Tab</kbd> goes back to the desktop, the number keys launch an
app, and <kbd>Q</kbd> stands you up. Inside Squatch Smash, click to smash and
<kbd>B</kbd> spends a Steady Hands charge.

## What's in the apartment

A bed you wake up in, a nightstand with a working alarm clock, a desk with a
gaming rig, a kitchenette with a counter, real sink, cooktop, microwave and a
fridge, a couch, coffee table and rug, a sideboard with the radio, a window with
venetian blinds looking over a city that changes with the hour, an evidence
corkboard, a wall clock that keeps the right time, a bookshelf, a squatch
crossing sign, a bathroom through the north door, and thirty-nine slots for your
own gear on the walls and the furniture.

### Things you can do

**Drink.** Six beers in the fridge and a bottle of Jack AND Daniels on the
counter. Hold <kbd>F</kbd>. The first couple steady your hands and earn you a
slow-motion charge at the PC; after that the room starts having opinions about
where the floor is. Keep going and you pass out and wake up twelve hours later
with no memory of the trip. The whiskey gets you there roughly twice as fast.

**Smoke.** A pack on the counter and an ashtray beside it. Hold <kbd>F</kbd> for
a drag; the cloud hangs in the air and drifts. Four cigarettes in, your stomach
starts making a case, and you will want to know where the bathroom is.

**The bathroom.** A toilet, a bath, and a sink with an actual basin. You can
have a pee, and you can walk around while you do it — the stream is simulated,
splashes off whatever it lands on, and leaves marks. Aim is your problem. After
four cigarettes there is the other thing, which is a button on the toilet and a
number of sound effects.

**Fart.** <kbd>G</kbd>. Seven different ones, picked at random and never the
same twice running. You will also do it involuntarily, at intervals, whether or
not that is convenient.

**Zyn.** A tin on the desk. Forty-two minutes of steadier hands, and a lip you
have to remember to empty.

**Sit down.** The couch, the edge of the bed, the desk chair. Nothing happens
while you are sitting, which is rather the point — time still moves, the radio
still plays, the light still goes orange and then blue. Hold <kbd>E</kbd> on the
bed to lie back down, and <kbd>E</kbd> again to sleep the whole day off.

**The radio.** Two stations, tuned by holding <kbd>E</kbd> on the set. See
below.

**The PC.** Two things are installed. See below.

### Time

A whole day takes fifteen real minutes. The sun comes up the east wall, crosses,
goes orange and sets; the sky outside the window cross-fades between four
paintings of the same skyline; the lights come on when it gets dark and you can
override them at the switch. The city sounds different at night. At eleven, the
neighbours start arguing, and they do that every night. The clock in the corner
of the screen, the alarm clock by the bed and the clock on the south wall all
agree with each other, and so does the taskbar on the PC.

### The voice

There is no plot in here and nothing to complete. What there is instead is
somebody noticing things about you while you fail to do anything with a Tuesday.
It speaks when you have stopped moving, when you have been in here a while, and
when you open the fridge for the eighth time. It never says the same thing
twice.

---

## Adding your own stuff

Three folders take player-supplied content. Each has its own README with the
exact format.

### `assets/music/` — radio tracks

Drop audio files in and list them in `manifest.json`. Playback is positional:
the radio genuinely sounds like it's across the room, and it muffles when you're
heads-down at the PC. With no tracks the radio tunes to static.

### `assets/art/` — squatch gear on the walls

Drop images in and point a slot at each one. Frames size themselves to your
image's aspect ratio, and the heights are deliberately staggered so a wall reads
as something hung over years rather than a showroom row.

There are thirty-nine slots. Framed pictures on the west, north and south walls
(`bed.above`, `bed.poster`, `gap.mid`, `couch.left`, `feature.stacks`,
`south.wide` and the rest), four in the bathroom (`bath.toilet`, `bath.high`,
`bath.far`, `bath.mirror` — all in the painted band above the tiling, none over
the bath), two hanging cloth banners, a round crest, four standing frames on the
furniture, and a sticker plus two magneted photographs on the fridge door.

Five more are printed on objects rather than hung: `zyn.lid` goes on the tin,
`label.beer` wraps the can, `label.whiskey` goes on the bottle, `eggs.carton` on
the box in the fridge and `cereal.box` on the one on top of it.

Anything you don't fill gets a procedurally drawn placeholder, so no wall is
ever blank. `npm run check` reads the slot list straight out of
`src/world/apartment.js`, so a typo in the manifest is caught immediately, and
`npm run verify:art` measures where everything actually ended up.

### `assets/sfx/` — ElevenLabs sound effects

```bash
export ELEVENLABS_API_KEY=sk_...
npm run sfx                                    # every cue in assets/sfx/manifest.json
npm run sfx -- --only fridge.open,can.crack    # just these
npm run sfx -- --force                         # regenerate existing files
npm run sfx:dry                                # list what would run, generate nothing
```

```bash
npm run sfx:voices                             # list voices on your account
npm run sfx:vo                                 # just the spoken lines
npm run sfx -- --sfx-only                      # just the sound effects
```

There are two kinds of cue in `manifest.json` and they go to different
endpoints. A cue with `prompt` is a sound effect, described in words, and goes
to sound-generation — edit a prompt and regenerate that one cue to taste. A cue
with `say` is a line of dialogue and goes to text-to-speech.

Every spoken line resolves its voice through the `voices` block at the top of
the manifest, which is the only place a voice id appears in the project. One
id, one voice, every line the character says. Paste yours in before running
`npm run sfx:vo`; nothing spoken generates until you do.

**This step is optional.** Every cue has a procedural WebAudio fallback in
`src/core/audio.js`, so the apartment is fully audible with no API key and no
files. Generating samples upgrades the sound with no code change; the engine
prefers a real file whenever one exists.

---

## The radio

Hold <kbd>E</kbd> on the set to move along the dial.

**97.8 THE SQUATCH** is talk radio, and what is on depends on the in-game clock.
Lou & Lou from six (two Lous, zero preparation), Booski & Ape's CS Gambling Show
at noon, Irish's Deep Dives at three, Eric & Gratin's *What's Happening in
India!* at five, Hog Mama's Late Night Improv after ten, and an automated
overnight nobody is in the building for. Every few segments the sixty-second
station commercial comes round in full.

**98.8 UNCLE SQUATCH BEATS** plays whatever you have put in `assets/music/`,
with a station ident over the first track. It cannot play YouTube — no embed
survives a locked pointer and the terms don't allow proxying the audio — so it
plays local files and says so plainly when there aren't any.

Nothing is voiced. You hear a radio murmuring from across the room and read what
it's saying, which is roughly what having a radio on in another room is like.
The murmur is a speech-band bed with the consonants filtered off, so it reads as
a voice without ever resolving into words.

Everything on the station lives in `src/core/stations.js`.

---

## The PC on the desk

`src/arcade/os.js` is **SquatchOS**: it owns the monitor canvas, the boot
sequence, the desktop, the cursor and the CRT treatment, and hands whichever app
has focus the drawing context plus input. <kbd>Tab</kbd> goes back to the
desktop; the number keys launch straight into things.

Two apps are installed.

**SQUATCH SMASH** (`src/arcade/squatchsmash.js`) — the arcade game. Waves,
combos, a high score in `localStorage`. Smash the squatches, spare the hikers
and the cubs. Beers you drank in the kitchen turn up here as Steady Hands
charges; being drunk turns up here as a crosshair with its own ideas.

**COUNTER-SQUATCH: GLOBAL OFFENSE** (`src/arcade/counterstrike.js`) — a parody,
and the joke is that you never get to play. Every round you spawn, get a
fraction of a second of control, and are killed through a wall by somebody very
obviously cheating. The window shrinks 22% per death, so by the ninth you are
killed during the warmup and by the tenth you are killed in the buy menu, having
not spawned. Your rank only goes down. The REPORT PLAYER button works perfectly
and does nothing.

To add a third, write an object with `id`, `label`, `drawIcon`, `enter`, `exit`,
`update`, `onPointer`, `onClick`, `onKey` and `glow`, and register it in
`src/arcade/mount.js`. Nothing else in the project changes.

---

## Layout of the code

```
index.html              importmap + HUD markup
src/main.js             renderer, state machine, input
src/core/               player controller, interaction raycasting, audio, radio
                        and its station schedules, day/night, intoxication,
                        the narrator, HUD
src/world/              apartment shell, furniture builders, procedural textures,
                        materials, particle systems, and the wall-art loader
src/arcade/             SquatchOS, the two apps on it, and the mount point
tools/                  static server, ElevenLabs generator, static check,
                        runtime art-placement check, single-file bundler
vendor/                 three.js (vendored so there is no install step)
```

The apartment is laid out on a fixed grid: x runs −5 (west) to +5 (east), z runs
−4.5 (north) to +4.5 (south), the ceiling is at 2.75m, and yaw 0 looks north.

```bash
npm run check        # static: parses every source file, validates the manifests
npm run verify:art   # runtime: boots the flat headless and measures the geometry
npm run bundle       # bake the whole thing into one self-contained HTML file
```

`check` is worth running after editing JSON by hand, since a bad manifest
otherwise shows up as a silently missing texture. `verify:art` catches the
things a parser cannot: two frames on the same patch of wall, anything through
the floor or ceiling, anything fouling a door anywhere in its swing or hung
across a doorway, bathroom pieces on the tiling or over the bath, and anything
stuck to the fridge door overlapping anything else on it — that last one needs
its own pass, because everything on a fridge is coplanar and so never overlaps
on all three axes. It exits non-zero, so CI can run it.

In the browser console, `__squatch` exposes the scene, player, arcade, radio,
narrator and clock, plus `__squatch.teleport(x, z, 'north')` for jumping around
while working on a room, and direct handles for every mechanic (`passOut`,
`fart`, `startPee`, `sitOn`, `lieOnBed`, `takeZyn`, `time.skipHours`) so you can
get to a state without playing your way there.
