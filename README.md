# Squatch Life

Six playable or preserved experiences live in this repo.

| | |
|---|---|
| **Squatch Life** (repo root) | First-person apartment hub. Wake up, answer Lou’s call, get ready, use the PC, and leave for the first mission. |
| **The Bada Bing** ([`bing.html`](./bing.html)) | First-person, same engine. The first visit delivers Lou’s package; the campaign also reuses the same club for his post-airstrip assignment. |
| **The Squatchfather** ([`squatchfather.html`](./squatchfather.html)) | First-person restaurant mission. Lou’s package is staged as the bathroom weapon before the meeting. |
| **The Jerky Motel** ([`motel.html`](./motel.html)) | Interactive Motel deal, inspection, betrayal, recovery, and escape; campaign-owned after the second Bing visit. |
| **The campground game** ([`game/`](./game)) | The apartment-computer version of Squatch Smash, with goals, Ranger Captain boss, ranks, and persistent career unlocks. |
| **The Initiation reference** ([`initiation.html`](./initiation.html)) | Preserved branch scene and cast for alignment. Playable and verified, but not yet campaign canon or routed from the apartment. |

```bash
npm start        # the apartment -> http://localhost:5173
                 # the Bing      -> http://localhost:5173/bing.html
                 # Squatchfather -> http://localhost:5173/squatchfather.html
                 # the Motel     -> http://localhost:5173/motel.html
                 # the game      -> http://localhost:5173/game/
                 # Initiation    -> http://localhost:5173/initiation.html
```

All six are static ES-module sites with no build step, served by the same
`npm start`. The campground game keeps its own Three.js runtime, its own
README and its own single-file bundler (`game/tools/bundle.mjs`) so it stays
completely self-contained; the apartment and the Bing share
`vendor/three.module.min.js` and everything in `src/core`. The campground stays
isolated; the apartment, Bing, Squatchfather, and Motel share an explicit
campaign boundary. Initiation is isolated under `src/initiation/` until its
character and story premise is approved.

The campaign spine connects the apartment, the Bing, and Squatchfather through
`src/core/campaign.js`. On Day One, Lou’s one-shot call rings through the
physical phone. The apartment door then requires eating, showering, pooping,
and changing clothes; email is optional. Activity flags, call state,
scene/spawn, Bada Bing completion, and Lou’s concealed package survive the page
transition. Finishing the club returns to the apartment with the package; the
door then routes to Squatchfather, where beginning the meeting stages that
package as the bathroom weapon. Finishing the restaurant records the dropped
weapon and returns to the apartment again. Sleeping creates a persistent Day
Two checkpoint at 7:00 AM; Booski then calls once and unlocks the airstrip job
with Captain Lou Sasole kept distinct from Lou. The post-airstrip state
contract, Lou’s second call, the reused Bing assignment, direct Motel
transition, and Motel return are implemented. The airstrip runtime is being
finished on its own branch, so that later sequence is not yet reachable through
normal play.

The Initiation branch history, face art, NPC writing, post-processing modules,
and playable legacy scene are preserved without overwriting shared systems.
Its prologue placement and human-to-sasquatch transformation are intentionally
not wired into campaign state. See
[`docs/CHARACTER-ALIGNMENT.md`](./docs/CHARACTER-ALIGNMENT.md).

See [`game/README.md`](./game/README.md) for the campground game's controls and
scoring, and [the Bing](#a-quick-stop-at-the-bing) below for the club.
Everything between here and there is the apartment.

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

**The PC.** Six applications are installed. See below.

### Time

A whole day takes fifteen real minutes. The sun comes up the east wall, crosses,
goes orange and sets; the sky outside the window cross-fades between four
paintings of the same skyline; the lights come on when it gets dark and you can
override them at the switch. The city sounds different at night. At eleven, the
neighbours start arguing, and they do that every night. The clock in the corner
of the screen, the alarm clock by the bed and the clock on the south wall all
agree with each other, and so does the taskbar on the PC.

### The voice

The apartment now opens Day One: Lou calls once, the front door tracks the four
required morning activities, and completed mission state survives every return.
The narrator still notices what you do between story beats. It speaks when you
have stopped moving, when you have been in here a while, and when you open the
fridge for the eighth time. It never says the same thing twice.

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

Six applications are installed and share the same mount/unmount lifecycle.

**SQUATCH SMASH** (`src/arcade/campground.js`, `game/`) — the real 3D
campground game in a same-origin frame. It has fourteen goals, the Ranger
Captain boss, end-of-run ranks, career totals, and six persistent skins.

**COUNTER-SQUATCH: GLOBAL OFFENSE** (`src/arcade/counterstrike.js`) — a parody,
with a canvas first-person round/shoot/death loop.

**SQUATCH SHOOT** (`src/arcade/squatchshoot.js`) is the score-attack gallery
shooter. **MAIL** (`src/arcade/mail.js`) is the five-message inbox and spoken
reaction app. **YUKA VS OLIVE** (`src/arcade/yuka.js`) is the food-comparison
scanner. **DOOM** (`src/arcade/doom.js`) uses the guarded web-app/iframe
wrapper.

To add another canvas app, write an object with `id`, `label`, `drawIcon`,
`enter`, `exit`,
`update`, `onPointer`, `onClick`, `onKey` and `glow`, and register it in
`src/arcade/mount.js`. Nothing else in the project changes.

---

## Layout of the code

```
index.html              importmap + HUD markup
src/main.js             renderer, state machine, input
src/core/               player controller, interaction raycasting, audio, radio
                        and its station schedules, day/night, campaign state,
                        scene transitions, intoxication, the narrator, HUD
src/world/              apartment shell, furniture builders, procedural textures,
                        materials, particle systems, and the wall-art loader
src/arcade/             SquatchOS, its six apps, and the mount/input boundary
src/bing/               the Bada Bing: the club, its people, the script, the
                        mission, and two ways to lose money
tools/                  static server, ElevenLabs generator, static check,
                        runtime art-placement check, single-file bundler
vendor/                 three.js (vendored so there is no install step)
```

The apartment is laid out on a fixed grid: x runs −5 (west) to +5 (east), z runs
−4.5 (north) to +4.5 (south), the ceiling is at 2.75m, and yaw 0 looks north.

```bash
npm run check        # static: parses every source file, validates the manifests
npm test             # campaign, apartment-story, and physical-phone contracts
npm run verify:art   # runtime: boots the flat headless and measures the geometry
npm run verify:day-one # runtime: Lou's call, chore gate, apartment -> Bing
npm run verify:day-two # runtime: sleep, reload, Booski call, non-replay
npm run verify:bing  # runtime: plays the club and returns home, headless
npm run verify:bing-two # runtime: reuses the club for the second assignment
npm run verify:squatchfather # runtime: stages the package, plays, returns home
npm run verify:motel # runtime: Motel outcomes, reload, and apartment return
npm run verify:computer # runtime: every apartment PC app launches/exits cleanly
npm run verify:squatch-smash # runtime: goals, boss, rank, career, bundle
npm run verify:initiation # runtime: legacy scene/assets; not story canon
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

`verify:bing` is the same idea aimed at the club: it starts the game, walks the
player through every beat of the mission — the bouncer, the floor, the machine,
the table, the hallway, Lou, the package, the lot — and asserts the state
machine at each one, because "the office where nothing happens" is a failure
that no parser can see.

`verify:day-one` starts from empty browser storage, rings Lou through the
physical phone, answers it in hand, exercises each live apartment-door blocker,
leaves email unread, and confirms the direct Bada Bing handoff preserves the
call, mission, and activity state.

`verify:squatchfather` begins with the completed Bada Bing handoff, enters the
restaurant through the apartment door, stages Lou’s package as the bathroom
weapon, drives the real retrieval/train/shooting/drop sequence, and confirms the
completed mission returns home without restoring the discarded weapon.

`verify:day-two` starts after that return, sleeps through the live apartment
blackout, verifies the checkpoint survives a reload, answers Booski through the
physical phone, and reloads again to prove neither completed call replays.
Captain Lou Sasole is asserted as a separate character ID at the airstrip gate.

In the browser console, `__squatch` exposes the scene, player, arcade, radio,
narrator and clock, plus `__squatch.teleport(x, z, 'north')` for jumping around
while working on a room, and direct handles for every mechanic (`passOut`,
`fart`, `startPee`, `sitOn`, `lieOnBed`, `takeZyn`, `time.skipHours`) so you can
get to a state without playing your way there.


---

## The Squatchfather

Prospect meets Sal “The Prospector” Sorrento and Captain McClawsky in a small
Italian restaurant under the elevated line. The original four-commit scene
history is preserved under `src/squatchfather/`: its state machine drives the
restaurant entrance, table conversation, bathroom weapon retrieval, train,
shooting sequence, checkpoint, weapon drop, and exit.

In the campaign, the scene is reachable only after Bada Bing Scene One is
complete and Lou’s concealed package is still present. Beginning the mission
stages that package behind the toilet as the scene’s weapon. Completion records
that the weapon was dropped and returns the player to the apartment.

| Input | Action |
|---|---|
| <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows | move |
| mouse | look; click the canvas to capture the cursor |
| <kbd>E</kbd> | interact; hold where prompted |
| left click | fire during the shooting beats |
| <kbd>Esc</kbd> | pause |
| <kbd>M</kbd> | mute |

---

## A Quick Stop at the Bing

> `npm start`, then <http://localhost:5173/bing.html>

Day One, 11:41 PM, a wet lot off the highway. You are sitting in your own car
with the engine running and the wipers going, and Lou has something for you in
the back office. That is the entire objective. The club is deliberately much
larger than the errand.

**The rule the whole level is built on:** you never lose control because
somebody important started talking. Lou can say his piece while you walk around
his office, sit down, open his liquor cabinet, look at his security monitor,
take the package, put it back, or leave. There is no cutscene in here,
including at the end — the mission finishes when you drive out of the lot
yourself.

### What is in there

| | |
|---|---|
| **The lot** | Fifteen cars, a reserved space, a dumpster in the delivery alley, and one suspiciously clean sedan parked where it can watch the office wall. |
| **The vestibule** | Coat check, a metal detector nobody has plugged in, and a bouncer who knows exactly who you are and asks anyway. |
| **The floor** | Stage, runway, three poles, booths, candlelit two-tops, and a room dark enough that the light is all in pockets. Step onto the stage and somebody comes over. |
| **The bar** | Twelve metres of it. Club soda, beer, whiskey, or whatever Lou drinks. The drink model is the flat's, so the whiskey lands the way the whiskey lands. |
| **Blackjack** | A real table with real cards, played from the chair. $25 minimum. Lou counts your hands: three and he messages, six and he means it, ten and he sends somebody. |
| **The machine** | Three reels, five symbols, and a jackpot that is technically possible. Its side panel is not screwed down, and there is a second counter behind it. |
| **The back** | Fluorescent hallway, men's room with the roster written on the wall, a store room with a live alarm on the service door — and a way out through the alley that nobody watching the front will see. |
| **The office** | Lou, a desk lamp, a ledger, a safe behind a picture, and a monitor showing the lot. |

### Controls

Everything the flat does, plus <kbd>1</kbd>–<kbd>4</kbd> to answer somebody,
<kbd>Q</kbd> to get up or step away, and <kbd>Tab</kbd> to hide the objective
card. At the table: <kbd>1</kbd>–<kbd>4</kbd> stake, <kbd>E</kbd> deal or hit,
<kbd>F</kbd> stand, <kbd>R</kbd> double.

### Endings

Four, chosen by what you did about the sedan rather than by whether you
"won": it follows you, you read its plate, you told Lou and one of his men came
out to lean on the canopy post, or you left through the alley and nobody saw you
at all. Every ending returns home with Lou’s package for the next mission.

### The code

```
bing.html               importmap + the club's HUD markup
src/bing/main.js        wiring: systems, interactables, zones, the loop
src/bing/club.js        the building, its colliders, its lights, its doors
src/bing/cast.js        one human figure, dressed a dozen ways, three tiers of AI
src/bing/script.js      everything anybody says
src/bing/dialogue.js    conversation that never takes the game off you
src/bing/mission.js     the state machine, Lou's patience, the endings
src/bing/slots.js       three cylinders and a strip texture
src/bing/blackjack.js   cards and chips as objects on the felt
src/bing/vehicles.js    the lot, and the car you arrived in
src/bing/kit.js         the club's own procedural textures
```

It borrows rather than reimplements: `core/player.js`, `core/interaction.js`,
`core/hud.js`, `core/audio.js`, `core/drunk.js`, `core/highs.js`,
`core/inventory.js`, `core/postfx.js`, and the prop makers in
`world/props.js` — Lou's package is the revolver from the flat's coffee table,
and the back bar is the whiskey bottle forty times over. Two shared files grew
by a few lines to support it: `player.js` reads an optional
`world.groundAt(x, z)` so the stage can be walked on, and `audio.js` gained the
club's cues and four ambience beds.

In the console, `__bing` exposes the scene, the club, the cast, the mission and
`__bing.teleport(x, z, yaw)`.
