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

**And the cylinder test beside it is not that third gate.** `rayCylinderDistance`
lives in `framing-gate.mjs` because this is the only gate that wants it: the
staging gate asks *"is he facing a wall"*, which the over-wide box answers
conservatively and correctly. `rayBoxDistance` still has exactly two callers.
What arrived was a second **shape** inside one gate, not a third consumer of the
slab test, and moving the box test out to keep a routine only this file calls
company would be churn in `staging-gate.mjs` bought with nothing.

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
npm run verify:framing                          # every state; non-zero on a finding
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

## The findings on Initiation: ten, then five

`npm run verify:framing` reported nine `SPEAKER_OCCLUDED` and one
`CAMERA_INSIDE_SOLID` across the two Initiation states. All ten were **one
artifact, not ten faults**, and the artifact was in how that site authors its
solids rather than in the shots.

Initiation built every collider as a height-less `{x, z, r}` circle, so
`normalizeSceneColliders` gave each of them the standing band **−0.5 m to
4 m**. The cabin table is **0.78 m** tall. The parked cars top out at
**2.26 m**. So every sightline that passed comfortably OVER one read as
blocked, and `speech-start`'s camera — 3.6 m up, well clear of a car — read as
inside it.

This was not reasoned, it was cast: every published speaker sightline was
raycast against the **rendered** geometry of both states, 99 solid meshes in
the clearing and 349 in the cabin. **Not one hit anything.**

**Half of it is now fixed at the source.** `FURNITURE` in
`src/initiation/cabin/site.js` carries `minY`/`maxY`, measured off the built
assemblies, and the interior's collider loop passes them through as `y0`/`y1`,
which `rawBounds` honours in preference to its own invented band. The runtime
never reads them — `pushOut` takes x, z and r and nothing else — so the change
is inert to play and decisive to the gates. The cabin went from six findings
to one, and `initiation-cabin-plan-only-collision` came off the staging
allowlist, which had said in as many words that authoring real heights would
lift it.

**The five that remain are the same artifact, in the woods and the car park.**
Four in the clearing (Kittenboss behind a treeline box, `speech-start`'s camera
inside a car) and one in the cabin (the player at the door, behind a trunk on
the trail). Heights alone will not finish these, because a trunk really is
tall. What is wrong for a trunk is the SHAPE: the AABB of an upright cylinder
is its circumscribing square, which is wider than the trunk at the diagonals.
Over-approximating a blocking volume is the correct conservative reading for
walking into it and the wrong one for seeing past it. Lifting the last five
means testing the ray against the cylinder the author actually wrote.

## Five, then two: the shape now survives normalisation

`rawBounds` hands the circle over alongside the box. The `{x, z, r}` branch
returns a third field, `shape: { kind: 'cylinder', x, z, r }`, and
`normalizeSceneColliders` copies it onto the wrapper **only when there is one
to carry** — an authored box has no shape beyond its bounds, and a
`shape: undefined` on every record in the game would be a key nobody reads
pretending to be information.

**Nothing in the geometry pipeline reads it, and that was checked rather than
assumed.** `geometry-collect.mjs` builds its collider records from a fixed list
of keys and never spreads the input; `geometry-gate.mjs`'s `RECORD_KEYS` is a
deliberately narrow, purely geometric contract that refuses an unknown key
outright. So the collider ids, the bounds, and the buckets the geometry gate
compares on are untouched by construction — and `npm run verify:geometry`
before and after the change produced **byte-identical output**, same md5, all
98 states, 662,278 records, 184,040 suppressions, 0 violations.

`tools/framing-gate.mjs` gained `rayCylinderDistance` beside the imported
`rayBoxDistance`, `insideSolid` beside the old box-only `inside`, and one
`solidDistance` that picks between them on `solid.shape?.kind`. A solid that
carries no shape is tested exactly as it always was. The y band is the box's,
untouched: **a trunk really is tall, and this changes the shape and nothing
else.**

**Three of the five went.** All three were sightlines clearing a parked car at
the diagonal — the three `SPEAKER_OCCLUDED` findings on Kittenboss in the
clearing, `line-chat`, `after-one` and `exec-gap`, all naming one collider at
(4.436, −9.708) with r = 1.2. That is the boot end of a Lincoln whose highest
part there is the boot lid at 2.48 m; the ray passes **outside** that circle
and **through** the corner of its bounding square. Measured, not reasoned: the
meshes inside that footprint are `car.boot.lid`, `car.cabin`, `car.glass` and
`car.body`, and the sightline misses all four.

**Two survived, and both are the parked cars.** They are the same artifact one
step further on: not the shape, the missing height.

| The finding | What it actually is |
|---|---|
| `initiation:clearing` `speech-start` `CAMERA_INSIDE_SOLID` | A circle of r = 1.175 at (−8.625, −11.908), one of the three down a Lincoln. The camera at (−8.2, **3.6**, −11.6) is 0.525 m from its axis — inside it in plan, honestly — and **1.34 m above the car's roof at 2.26 m**. |
| `initiation:cabin` `cabin-door` `SPEAKER_OCCLUDED` | The same, in the yard: r = 1.175 at (20.110, 14.584). The ray runs from the camera 4.8 m up to the player's head at 2.3 m, and the reported entry at 2.835 m of an 8.860 m ray is the moment it crosses **y = 4.0** — the top cap of the invented band, 1.74 m over the roof. |

Both were **collider problems, not shot problems**, and the shape fix could
not reach them: a camera over a car is inside its column whatever the column's
cross-section. Only a measured `y1` lifts them.

### And then somebody measured the Lincolns

`buildCar` now measures the car it has just built and hands the band to all
three circles as `y0`/`y1` — the same move `FURNITURE` in
`src/initiation/cabin/site.js` already made for the table and the chairs, and
the Adapter has honoured `y0`/`y1` on a circle in preference to its own
standing band all along.

It is a **measurement, not a table**. `solidBounds` walks the car's group,
skips anything flagged `sceneAuditIgnore` — the headlight fog cone is a 16 m
mesh and is not steel — and unions what is left:

| Car | Band | The tallest thing in it |
|---|---|---|
| sedan (`clearing-west`, `yard-west`) | 0 → **2.260** | `car.cabin` |
| suv (`clearing-east`) | 0 → **2.970** | `car.cabin` |
| lincoln (`boot-car`) | 0 → **2.484** | `car.boot.lid`, standing 0.204 m proud of its own roof |
| van (`yard-east`) | 0 → **3.700** | `car.cabin` |

Reading those off `SHAPES` in `src/bing/vehicles.js` would have got the boot
car wrong by 20 cm and would go stale the day somebody edits a slab, which is
`docs/ENGINE-TRAPS.md` entry 11 wearing a different hat. One band per car
rather than one per circle: the world-aligned box of a cabin on an angled car
already overlaps all three footprints, and splitting it would claim a
precision the circles do not have.

Both findings went. `npm run verify:geometry` after the change: **98/98 states,
662,278 records, 0 violations** — the same record count, because a collider
that gained two keys is still one collider.

**`tools/framing-allowlist.json` has been deleted**, not emptied. An allowlist
shipping `entries: []` still reads like somewhere to put the next one, and the
whole value of the instrument is that putting one there costs an argument. The
gate treats an absent file as an empty list and says so where it reads it;
`tests/framing-allowlist.test.mjs` still checks the validator, and still
checks the shipped file **if there is one**, so the next allowlist is not
born unchecked. Proof it still blocks: back the `y0`/`y1` out of `buildCar`
and `npm run verify:framing` exits 1 with exactly these two findings and no
file to excuse them.

## It gates now

`npm run verify:framing` **exits non-zero** on any authored finding that is not
on the allowlist, and on any allowlist entry that excused nothing.

A gate that exits zero with findings is a gate whose next finding arrives in a
log nobody reads, which is `docs/ENGINE-TRAPS.md` §5 with better manners. The
five findings were one artifact and are now none, so there is nothing left for
the exit code to be polite about.

**`tools/framing-allowlist.json`** — when there is one; there is not, today —
is deliberately the instrument the geometry and staging gates already carry,
down to the sorted ids and the minimum reason length. An entry names one finding on one beat in one state — `id`, `state`,
`beat`, `kind`, whatever that kind must name (`speaker`, `solid`, `subject`,
`actor`), a `reason` in prose, and a `source` line checked against the file it
cites. No wildcards. `tools/framing-allowlist.mjs` is the pure validator;
`verify-framing.mjs` reads the file and holds the citations, exactly as
`verify-staging.mjs` does, because the pure validators have no filesystem.

**A stale entry fails the run** — `docs/ENGINE-TRAPS.md` entry 10. It is a
claim about the world, not a chore: forty-two mansion recliner entries went
stale at once because `isOwnBody` had started eating the chairs, and deleting
them as tidy-up would have destroyed the only written record of a live defect.
Go and measure the thing an entry describes before deleting it.

**Derived camera findings never fail a build and are never allowlisted.** A
derived camera is as often the harness's stand-in parked at the origin as it is
the scene's, so it has nothing to be excused from: it is reported, counted
separately, and left for a person. `squatchfather:default`'s unnamed camera
inside `frontDoor` is still the one such finding in the tree.

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
