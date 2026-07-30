# Squatch Life

Three things live in this repo.

| | |
|---|---|
| **Squatch Life** (repo root) | First-person. You wake up on Tuesday at 6:04 AM with a fridge, a radio, a bathroom and a gaming PC. The Squatch meeting is tomorrow night. |
| **The Beef Run** ([`beefrun.html`](./beefrun.html)) | A playable aviation mission. You fly an unreliable twin to a jungle airstrip, load three crates of illegal beef jerky, and bring it home in the dark. |
| **The campground game** ([`game/`](./game)) | The 3D rampage game — silver sasquatch, 90 seconds, one campground. Standalone, unchanged, still playable on its own. |

```bash
npm start        # the apartment -> http://localhost:5173
                 # the mission   -> http://localhost:5173/beefrun.html
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
`dist/squatch-apartment.html`: every module, three.js, every image, every
manifest, and as much of the voice and music as fits, with no external requests
at all. Nothing that doesn't fit is left in a manifest pointing at a file the
bundle doesn't carry; it's struck from the manifest, so the game never asks.

```bash
npm i                          # playwright, used to re-encode the art
npm run bundle                 # ~16 MB, art re-encoded to 384px
npm run bundle -- --full       # originals, whole songs, every clip (~40 MB)
npm run bundle -- --max=1024   # somewhere in between
```

Hosted previews refuse anything over 16 MB, so the build measures what the
script and the art cost and spends the rest on sound in priority order: his
voice, then the records, then the hosts (whose lines still show as text without
a clip). Records are cut to the thirty seconds the station actually plays
(`tools/mp3-slice.mjs`) — no re-encoding, just the frames in the window. A
build that ends up over the limit **fails** rather than writing a file that
won't open. `SQUATCH_LIMIT` and `SQUATCH_MUSIC_BUDGET` move the lines.

**This is a preview, not the game.** The Pages deploy serves every clip and
every track over HTTP with nothing dropped; that's the one to play.

Each module becomes a factory function in dependency order and every import
becomes a table lookup — so there's no scope merging, which matters when six
files each define their own `clamp`. It deliberately does *not* use `data:` URI
modules and an importmap: a real CSP permits an inline `<script>` and refuses a
`data:` script, and a refused module fires no error, so the page just sits there
looking like a slow network. Bundled builds set `window.__SQUATCH_INLINE`;
`src/core/assets.js` is the one place that knows the difference. Pointer lock is
unavailable in some frames, so the game falls back to
hold-left-button-to-look rather than being unplayable.

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

---

## The Beef Run

A third space in the repo, at [`beefrun.html`](./beefrun.html): a playable
aviation mission for the same prospect who lives in the flat.

```bash
npm start        # the mission -> http://localhost:5173/beefrun.html
```

Captain Lou Sasole is standing by an aeroplane at Whispering Pines Municipal
with a shipment to collect and something wrong with his stomach. You do the
walkaround, you start it, you fly it to a dirt shelf in a jungle valley, you
load three crates of internationally prohibited beef jerky, and you bring it
home in the dark without the Continental Agricultural Interdiction Bureau
taking an interest. Nobody involved acknowledges that it is beef jerky.

Before you leave, **Old Stove** turns up with three long crates stencilled
TRACTOR PARTS and a folder he never opens. He is one of the squatches and he is
also, allegedly, the government, and he is not standing where he is standing.
The crates go down the hill with you and come off at the strip; they are the
reason the men with rifles are pleased to see you. Nobody involved acknowledges
that they are tractor parts either.

The flying is the mission, not a cutscene between two conversations.

- **The aeroplane.** A Mammoth M-12 "Brushrunner": twin piston, fixed gear,
  mismatched paint. Lift, drag, propeller torque, ground effect, asymmetric
  thrust, three contact points with spring-damper suspension and tyre friction,
  all on a fixed 120 Hz step in `src/beefrun/physics.js`. Stall speed is about
  50 knots and the elevator is deliberately weak enough that full aft stick
  trims past the stall.
- **The cockpit.** Six analogue dials painted onto one canvas and repainted
  fourteen times a second, two yokes, a throttle quadrant, a magnetic compass
  that scrolls, a Sasquatch bobblehead that reads g honestly, and a warning
  light labelled GENERAL CONCERN.
- **Weight and balance.** A jerky crate is 218 kg, one of Stove's is 142 kg, and
  each of them moves the centre of gravity. Put all three in the back and the
  nose goes light; the diagram on the HUD says so before Lou does. You load and
  unload by hand — open the door, lift, wheel the cart over, put it in a marked
  zone, strap it down, latch the door.
- **The Bureau.** A stylised attention meter, driven by how much sky you are
  standing in relative to the ridges around you, whether you are inside cloud,
  and whether one of their aeroplanes is pointing at you. Get located and one
  of them follows you with a spotlight until you lose it in a canyon.
- **Four checkpoints** — first takeoff, the approach to El Hueso, the heavy
  departure, the return approach — and graded rather than binary failure. A bad
  landing costs points and a tyre; running out of aeroplane puts you back.

Three flight-assistance settings, from **Assisted** (stability, auto-rudder, a
projected approach path) to **Unstable Professional** (torque, no help, and the
odd dead instrument). Keyboard and mouse throughout; a gamepad works if one is
plugged in.

**Nobody has recorded any of it yet.** There are 191 written lines — 177 across
88 beats and 14 of Lou's unscripted one-liners, in six voices — and every one of
them is on screen as a subtitle in the speaker's colour, filtered through the
headset once the engines are running. None of them are spoken. The engine's
`say()` has no synthesised fallback on purpose, so an unrecorded line reads and
says nothing, and the mission plays at the same pace either way because the hold
times are written into the script rather than taken from a clip.

Each line has its own cue rather than sharing a pool with its beat, so when a
recording does exist the words heard are the words on screen:

```bash
npm run vo:beefrun       # script.js -> 191 cues in assets/sfx/manifest.json
npm run audio:todo       # -> VOICE-LINES-TODO.md, the recording sheet
npm run sfx:listen       # picks up whatever mp3s have been dropped in
```

`npm run check` fails if a line has no cue, and fails again if a cue is left
behind carrying words that have since been reworded.

```bash
npm run check:flight     # flies the model headless and checks the envelope
```

That bench is not decoration. It exists because a flight model renders
perfectly while being completely wrong, and it caught, among others: a heading
getter and `setPose` that disagreed by 180 degrees, a wing leveller with its
sign inverted, a coordination assist that drove sideslip instead of nulling it,
and cylinders that cooked themselves within twenty seconds of full power.

Everything in it is invented — the aeroplane, both airfields, the Bureau, the
jerky, and its lineage.

### Layout

```
beefrun.html              entry page, HUD markup, importmap
src/beefrun/
  main.js                 boot, the frame, input plumbing
  mission.js              the phase machine, checkpoints, scoring
  script.js               every line anybody says, as data
  physics.js  engines.js  the flight model and two reluctant engines
  aircraft.js instruments.js   the Brushrunner and its panel
  terrain.js              one heightfield for the whole route, streamed
  airfield.js airstrip.js landmarks.js   the places
  weather.js  detection.js cargo.js      the air, the Bureau, the load
  preflight.js loading.js the two played ground sequences
  hud.js cameras.js input.js audio.js dialogue.js npc.js util.js config.js
```

It reuses the flat's own systems rather than reimplementing them: `AudioEngine`,
`Hud`, `InteractionSystem` and the first-person `Player` are imported from
`src/core/` unchanged, and materials go through `src/world/build.js`'s cache.
The one change to shared code is `Player.groundAt`, which lets the eye ride a
terrain surface instead of a floor at zero — left unset, the flat behaves
exactly as it did.
