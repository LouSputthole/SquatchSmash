# The beat framing gate

**What it is for.** The geometry gate proves the room is built right. The
staging gate proves the people standing in it are standing in it right. This
proves the *camera is pointed at them while they talk* — the last half of "is
this scene finished" that the owner had been answering by playing the scene
thirty times.

## The incident that bought it

Initiation Night's whole fifth act — the blade, the hand, the cut, the saint
card, both oath lines and the burning — played out **off screen**.

The ritual shot was a pair of fixed points: the camera at the table's west end,
aimed at `TABLE_SOCKETS.card`, the patch of tabletop the card is picked *up*
from. The player stands at `CEREMONY_CENTRE`, 2.4 m short of that table, which
does not merely put him off to one side of the look point — it puts him
**behind the camera** in z. So the act held a steady, well-lit shot of an empty
table while everything it is about happened behind the lens.

Nobody noticed for as long as the scene existed, because the only way to notice
was to play it, and the only person playing it was the person who had just
written it. The fix is in `src/initiation/main.js`: `ritual()` follows
`ritualHandWorld()` now, and its offsets are relative to where the hand
actually is, so it stays framed whatever the rig does.

This is that fix turned into arithmetic.

## The findings

| The note | The finding |
|---|---|
| *"the camera is looking at nothing"* (the ritual, 2.4 m off) | `CAMERA_AIM_MISS` |
| *"he talks and you cannot see him"* | `SPEAKER_OFF_CAMERA` |
| *"there is a wall in the way"* | `SPEAKER_OCCLUDED` |
| *"the shot starts inside the cupboard"* | `CAMERA_INSIDE_SOLID` |
| *"it never settles on him"* (only once the cut has landed) | `CAMERA_LOOK_MISS` |
| a beat naming a body the scene no longer has | `BEAT_ACTOR_MISSING` |
| two beats sharing an id | `BEAT_ID_DUPLICATE` |

`SPEAKER_OFF_CAMERA` always says **which way** it is off — `behind`, `near`,
`far`, `left`, `right`, `above`, `below`. That is the whole value of it over a
boolean: *"off camera"* sends you back to play the scene again, *"behind, 2.4 m
back"* is the Initiation bug written out in full.

## Aim against look

**This is the distinction that cost a verifier run, and it is why there are two
findings and not one.**

The first draft of the Initiation check compared the *smoothed* look point to
the hand and read **55 metres**. The camera flies rather than cuts —
`updateCamera` lerps toward the shot at about 3.2 per second — so a debug skip
from the clearing to the cabin starts it seventy metres out, and the smoothed
point is meaningless for about a second afterwards. That check was measuring
travel and calling it a miss.

So:

- **`CAMERA_AIM_MISS`** is about `camera.lookAt` — where the shot *intends* to
  look. Always fair game. This is the one that was broken.
- **`CAMERA_LOOK_MISS`** is about `beat.look` — where the camera is *actually*
  looking after the smoothing. It fires **only** on a beat that has set
  `settled: true`. A beat that reports a look point without claiming the cut
  has landed gets the benefit of the doubt, because the camera is allowed to be
  in flight.

`docs/ENGINE-TRAPS.md` §5, *"measure what you mean"*, is the same lesson from
the other end.

## How it is wired

```
tools/geometry-scenes.mjs      already builds ~98 real scene states headlessly
        │                      with real world matrices
        ├── src/core/staging.js        collectActors() — every marked body and
        │                              where its head is
        ├── normalizeSceneColliders()  every solid, in all four spellings the
        │   (verify-geometry-worker)   scenes author collision in
        ▼
tools/framing-gate.mjs         pure: numbers in, findings out
        ▼
tools/verify-framing.mjs       the reporter (npm run verify:framing)
```

It rides the geometry adapters rather than booting pages in a browser, for the
reason `docs/STAGING-GATE.md` gives: those adapters are most of the cost of
asking *any* question about a scene, and a second parallel way to build the
same scenes would be a second thing to keep true.

The gate is pure for the same reason `tools/geometry-gate.mjs` and
`tools/staging-gate.mjs` are: a gate that builds its own input can be wrong
about the input and the analysis at once, and then it agrees with itself.

**Colliders come through `normalizeSceneColliders`, not through an `isBox3`
filter.** The scenes author collision four ways — `Box3`s, XZ bands,
`{x, z, w, d}` slabs, and upright `{x, z, r}` cylinders — and Initiation Night,
the scene that bought this gate, authors **all 249** of its cabin solids as
cylinders. A `Box3` filter sees none of them, and a gate that sees no walls
cheerfully reports that nothing is behind a wall. (`verify-staging` still
filters for `Box3`, so its wall checks see nothing at all in that scene —
worth fixing there next, and not fixed here because this branch does not own
that file.)

## The one shared routine

`rayBoxDistance` — the slab test — is **imported from
`tools/staging-gate.mjs`**, not rewritten. `docs/REUSE-FIRST.md` rule 2 is
"extend, don't fork", and two copies of a numerical routine drift the moment
one of them learns something. The coupling is one exported function with no
scene semantics in it: three numbers and a box in, a distance out, already
under test in `tests/staging-gate.test.mjs`. Both gates stay pure — the staging
gate imports nothing at all, so pulling it in adds no dependency beyond
arithmetic.

The day a third gate wants the same test, lift it into a shared
`tools/gate-math.mjs` and have both import from there. That is a change to
`staging-gate.mjs`, which is the only reason it was not done now.

## A beat

A beat is data, and every field but the camera is optional:

```js
{
  id: 'ritual',                 // authored, never generated: ids end up in allowlists
  phase: 'ritual',              // for the report line, optional
  camera: {
    position: [x, y, z],
    lookAt:   [x, y, z],        // where the SHOT intends to look
    fovDeg: 66, aspect: 16 / 9, near: 0.05, far: 220,   // house lens if omitted
  },
  speaker: 'lou',               // an actor id, or [x,y,z], or { id, point }
  subject: { id: 'player-hand', point: [x, y, z] },     // defaults to the speaker
  subjectObject: 'cabin.table',  // or name a node, and the reporter looks it up
  look:    [x, y, z],           // the SMOOTHED look point, this frame
  settled: true,                // has the cut finished flying?
}
```

- **`speaker`** is who is talking. Its head — `eye` on the staging marker, the
  same number the staging gate reasons about — is what has to be in frame.
- **`subject`** is what the shot is *about*, and defaults to the speaker. It is
  a separate field because the ritual's subject was a **hand**: a node on a rig,
  not a body in the cast. It is also how a two-hander held on the listener is
  described honestly — the shot is correctly on the man it names, and the man
  talking is nine metres off the side of the frame.
- **`subjectObject`** names a node instead, and the reporter resolves its world
  position out of the build — the same contract `verify-staging` uses for
  seats, including the part where a name that no longer resolves is a finding
  rather than a silent pass. A prop renamed out from under the shot that films
  it is exactly the drift these gates are for.
- **`settled`** gates the look check. See above.

## Where beats come from

A shot in this game is authored in the scene's own runtime — `CAMERA_SHOTS` in
`src/initiation/main.js` is a table of closures over live rig nodes — and that
is not data anything can read from outside the running scene. So the reporter
asks a scene to **publish** its beats, and reads two places:

```js
built.metadata.framingBeats     // an array the adapter hands over
object.userData.framingBeat     // a beat stamped on the node it films
```

**Three scenes publish now: Initiation, the Special Meeting and THE TAKE, and that is the honest state of it.** The
arithmetic is finished and under test; the scenes opt in one at a time.
`--coverage` prints exactly how much of the game is still dark, the way
`verify-staging --coverage` prints the bodies no check can reach. A gate that
quietly reports "clean" over scenes it cannot see is the failure this whole
family of tools exists to end.

Two things work with no author input at all:

- **`--beats <file>`** checks a JSON shot list, `{ "<state id>": [beat, …] }`,
  against the real build — so a shot can be tried against the room it will be
  filmed in *before* it is written into the scene. A key that names no built
  state is reported, because a shot list checking nothing looks exactly like a
  clean run.
- **Derived camera beats.** Every real camera in a build has a real position,
  and a position inside a collider is a shot of the inside of a wall. Those are
  marked `[derived]` and counted separately, because several adapters park a
  stand-in camera at the origin to hang held props off — that camera is the
  harness's, not the scene's. The one such finding in the tree today,
  `squatchfather:default`'s unnamed camera inside `frontDoor`, is exactly that:
  worth a look, not worth a build failure.

## Running it

```
npm run verify:framing                          # every state
node tools/verify-framing.mjs initiation        # one scene
node tools/verify-framing.mjs --coverage        # states with a cast and no beats
node tools/verify-framing.mjs --beats shots.json
node --test tests/framing-gate.test.mjs         # the arithmetic, on fixtures
```

Reconstructing the original bug from a shot list, against the real cabin build,
gives what it always should have:

```
FIND  initiation:cabin — 1 beat, 0 cameras, 0 in the cast, 1 finding
        CAMERA_AIM_MISS  ritual-as-it-was subject="player-hand" missM=2.408
                         lookAt=[0,1.05,0] subjectAt=[0,1.25,-2.4]
```

2.408 metres. The first time, finding that took a playtest — and the scene had
been shipping the shot for as long as it had existed.

## The ten findings on Initiation, and why they stand

`npm run verify:framing initiation` reports nine `SPEAKER_OCCLUDED` and one
`CAMERA_INSIDE_SOLID`. All ten are **one artifact, not ten faults**, and the
artifact is in how that site authors its solids rather than in the shots.

Initiation builds every collider as a height-less `{x, z, r}` circle, so
`normalizeSceneColliders` gives each of them the standing band **−0.5 m to
4 m**. The cabin table is **0.78 m** tall. The parked cars top out at
**2.26 m**. So every sightline that passes comfortably OVER one reads as
blocked, and `speech-start`'s camera — 3.6 m up, well clear of a car — reads
as inside it.

This was not reasoned, it was cast: every published speaker sightline was
raycast against the **rendered** geometry of both states, 99 solid meshes in
the clearing and 349 in the cabin. **Not one hits anything.**

The root fix is to author real heights on those colliders — `rawBounds`
already honours `y0`/`y1` — but that changes collider ids and therefore the
geometry gate's recorded inputs, so it is a deliberate separate job and not a
thing to slip into a framing pass. The speakers stay named rather than the
checks being deleted, because the day those colliders gain heights, these ten
should evaluate properly rather than having been quietly removed.

## A beat may widen its own aim tolerance

`CAMERA_AIM_MISS` defaults to one metre, which is right for a close-up and
wrong for a wide. The cabin's `room` shot deliberately looks at the middle of
the table with Lou at the head of it: 1.061 m off his chest, and he is plainly
in frame, because `SPEAKER_OFF_CAMERA` does not fire on any of those beats.

Loosening the gate for everybody to accommodate that would have blinded it to
the fault it exists for — the ritual shot missed by 2.3 m. So a beat that knows
it is wide says so, in one field, beside the shot:

```js
aimToleranceM: 1.5,
```

**Only wider.** A beat cannot tighten below the default and quietly become the
strictest check in the file.
