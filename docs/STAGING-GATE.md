# The staging gate

**What it is for.** The geometry gate proves the room is built right. This
proves the *people standing in it* are standing in it right — the half of
"is this scene finished" that the owner had been answering by playing the
scene and writing notes.

Every check in `tools/staging-gate.mjs` is one of those notes, turned into
arithmetic:

| The note | The finding |
|---|---|
| *"they are all looking foward at the same spot"* (the van, THE TAKE) | `FACING_UNIFORM` |
| *"he is facing the wall"* | `FACING_INTO_SOLID` |
| *"they are all standing in the seats once u are in the van"* | `SEAT_STANDING` |
| *"The manager walks into the vault before its opened"* | `ACTOR_INSIDE_SOLID` |
| *"the cops have spawned behind me instead of infront of me"* | `SPAWN_BEHIND_PLAYER` |

## How it is wired

```
tools/geometry-scenes.mjs      already builds ~80 real scene states headlessly
        │                      with real world matrices
        ▼
src/core/staging.js            collectActors() — every marked body, where it
        │                      is, and which way it is pointed
        ▼
tools/staging-gate.mjs         pure: numbers in, findings out
        ▼
tools/verify-staging.mjs       the reporter (npm run verify:staging)
```

It rides the geometry adapters rather than booting pages in a browser. Those
adapters are most of the cost of asking *any* question about a scene, and a
second parallel way to build the same scenes would be a second thing to keep
true.

The gate is pure for the same reason `tools/geometry-gate.mjs` is: a gate that
builds its own input can be wrong about the input and the analysis at once.

## The marker

A body is invisible to the gate until something stamps it:

```js
import { markActor, setActorPosture } from '../core/staging.js';

markActor(group, { id: 'bank-guard', role: 'guard', posture: 'stand' });
setActorPosture(group, 'sit');   // when he sits down
```

- **`id`** is authored, never generated. Ids end up in allowlists, and a
  counter would renumber every entry the first time a scene gained a body in
  the middle of its cast.
- **`role`** is one of `player crew civilian guard enemy principal bystander`.
  It exists so a finding can say *three CIVILIANS share a yaw* rather than
  *three objects*, and so the spawn-arc check knows who is supposed to arrive
  in front of you.
- **`posture`** on the marker is what was *authored*; `setActorPosture` moves
  the live one. The marker is frozen because id/role/seat should not drift.
- **`faceAxis`** defaults to `+z`, which is where the shared rig builds its
  face. A rig that faces another way **declares it** — a silent disagreement
  about which way is forward is how a mask ends up on the back of a head.
- **`seat`** names the object the actor should be sitting on. A seat that was
  renamed out from under its rider reports `SEAT_MISSING` rather than passing
  quietly.

`src/core/person.js` tags its own parts with `userData.rig = 'person'` and
`userData.rigPart`, so `npm run verify:staging -- --coverage` can list the
bodies no check can currently reach. Those tags are **userData and not
`.name`** on purpose: the geometry gate groups assemblies by name, and naming
the rig's parts would move that gate's recorded buckets underneath every scene
at once for a change that buys nothing.

## Reading a finding

`FACING_UNIFORM` groups by role and by a 6 m radius, and fires at three or
more actors agreeing within about 2°. Both of those matter:

- **By role**, because a rank of guards facing one way is staging and a rank of
  *customers* facing one way is the bug.
- **By radius**, because two people at opposite ends of a street sharing a
  heading is a coincidence, not a formation.

Half of what it finds will be legitimate, exactly as with the geometry gate —
a queue at a teller window *does* face the counter. The fix is usually not to
turn people around but to stop them agreeing to nine decimal places. The
first thing this gate ever found was six customers at `yaw: Math.PI` exactly;
they still face the counter, and no two of them now agree about precisely
where it is. Offsets are **authored constants, not jitter**, because a random
yaw moves the geometry gate's recorded buckets on every build.

## The marker's heights are the rig's, not the marker's defaults

`markActor` defaults to a 2.30 m eye and a 1.16 m hip, which are
`core/person.js`'s Sasquatch. Most of the game is `makePerson`, a 1.78 m human
scaled per body. Left on the defaults, thirty bodies in the bank lobby declared
an eye at **2.300 m** while their irises measured **1.511 to 1.842**, and the
tallest skull in the room topped out at 1.958. Both this gate and the framing
gate were casting sightlines from a point in the air above every head, asking
whether THAT was inside a wall, and framing shots on it.

Every rig that marks an actor must pass its own `eyeHeight` and `hipHeight`.
The shared `Npc` now derives them from its `heightScale`; `HeistFigure` and the
Special Meeting's cast do the same.

**And a posture the marker does not know about is the same bug one level
down.** Correcting the heights immediately surfaced 26 findings in the Bing
that the wrong number had been hiding — booth drinkers marked `stand`, sitting
down, with a standing eye 10 cm above a 1.5 m booth. A scene that poses a body
seated must say so with `setActorPosture`, or the gate reasons about a man who
is not there.

Those 26 were then triaged, and **not one of them was the scene's fault.** The
whole set is now zero, with no allowlist entry written for any of it, because
the gate was wrong twice over.

### A person is not a wall

`FACING_INTO_SOLID` skipped the actor's OWN body collider and nothing else, so
the two men squaring up in `bing:attack` each reported staring at masonry —
and the masonry was the other man, at 0.68 m. The ray now drops *anybody's*
body box and carries on to whatever is behind it, so a genuine wall past a
person still reports at its real distance.

`ACTOR_INSIDE_SOLID` deliberately keeps the old his-own-body test. A man
LOOKING AT another man is staging; a man standing INSIDE one is a bug.

### A booth is not a wall either

A booth is authored as one box from the floor to the top of its back — it has
to be, because it is the thing the player walks into — so a seated head is
inside it by construction. Twenty-four seated regulars reported facing a wall
at zero metres, and the wall was their own booth.

The ray now skips the solid an actor **names** as his seat, via the collider
`assemblyId` the scene already authors (`bing-booth:east:0`). Never by
proximity and never by a height threshold: a rule that guessed which solid was
his seat would go on to excuse the sofa he is genuinely buried in, and the
"seat swallows sitter" distance below was dropped for exactly that reason. A
booth renamed out from under a marker raises `SEAT_MISSING`.

A seat belongs to the sitting, not to the body. Ape stands at his roster spot
and sits in the east booth for the cleanup, so `setActorSeat` sets it and any
posture but `sit` clears it — a seat left on a man who has stood up and walked
off would go on excusing that booth from his ray across the room.

Caveat worth knowing: an assembly-resolved seat box is the whole booth, floor
to seat back, so `SEAT_STANDING` measured against it is weaker than against an
authored cushion mesh — a man standing ON the bench is still under the seat
back and goes unreported. Scenes that author a named cushion get the tight
check; the named-object branch wins.

### A chair is not the man sitting in it

Found by chasing a *stale* allowlist entry rather than a finding, which is the
only reason it was found at all.

Own-body was "person-sized AND centred on him", and a cinema recliner is
person-sized (measured 1.00 x 0.90 x 0.88 m) and centred on its sitter to
within 0.02 m. The mansion's theatre chairs were therefore read as the sitters'
own bodies, and **forty-two `ACTOR_INSIDE_SOLID` findings across ten mansion
states stopped firing while the fault they described was still there** —
lag's hips measured at -1.837 inside a box running -2.500 to -1.600, exactly as
his allowlist entry says. The allowlist then reported all forty-two as stale,
which reads precisely like the fault having been fixed.

The rule now also asks whether the box comes up to the actor's **eye**. A body
collider runs feet to over the head (`cast.ape` measures 0 to 1.94 against an
eye at 1.75); furniture does not. The eye is already on the marker, so this
needed no new number.

**A gate going quiet is not the same as a fault going away.** When an entry
goes stale, measure the thing it described before deleting it.

## Twenty-eight states with nobody in them

The gate skipped any state whose cast came back empty, so twenty-eight of the
ninety-eight built states were reported clean by having nobody to look at.

Thirteen of them really are empty and stay that way: the twelve apartment
states are Prospect's flat with only Prospect in it, and `motel:drive` is a
car and two headlight cones. The other fifteen are now marked, and coverage
runs **85 of 98**.

- **Beef Run and the Enola** share one rig, so the marker went on
  `makeFigure` rather than on eleven call sites. Heights measured off the rig
  and verified against the rendered heads afterwards: every Beef Run delta
  0.000.
- **A pose changes a body's height, and nothing was telling the marker.** All
  four Enola crew declared an eye 0.340 m above where their heads actually
  were, for the whole flight — `sit` drops those hips from 0.86 to 0.52.
  `setActorHeights` now lives beside `setActorPosture` and `setActorSeat`, and
  `setPose` keeps all three true, because `setPose` is the one place the
  height changes.
- **The Initiation had no cast in the audited build at all.** Its fifteen
  bodies were built at module scope inside a file that also boots a page, so
  the adapter mounted the site and stopped. `src/initiation/cast.js` is now
  the one home for the roster, `main.js` decorates and adds, the adapter
  mounts the same builder — and the first run found **SEFF and APE standing
  inside the treeline**. Nobody had ever seen it.

Worth knowing rather than counting as coverage: the Enola has 42 colliders
and **none within twelve metres of its crew**, who are at six hundred metres
while the solids are on the ground. The solid checks are vacuous there; what
the gate buys in that scene is uniform facing and duplicate ids.

## A scene that collides in plan cannot answer a question about height

The Squatchfather and the Initiation block the player with 2D footprints —
`block(x, z, w, d)`, no y — because everything in them happens on one floor.
The collider reader has to give a footprint some height and gives it
-0.5 to 4, so every table, chair and fence post becomes a four-and-a-half
metre column. Both of the restaurant's seated diners reported facing a wall
at 0.4 m, and the wall was the table they were eating off.

Measured, this is exactly two scenes: **36 of 36** in the Squatchfather,
**189 of 189** in Initiation, **0** of every collider in the other fifteen.
It is also the root of the ten findings in `docs/FRAMING-GATE.md`.

So the gate raises `SIGHTLINES_NOT_EVIDENCE` once for the state rather than
emitting per-actor findings that name the wrong fault — and raises it out
loud, allowlisted with a reason, rather than dropping the findings silently.
The hip check still runs against the same footprints, and it earns its keep:
it is what caught SEFF and APE in the trees.

## What it still needs: an allowlist

`ACTOR_INSIDE_SOLID` currently reports 106 findings in the Bing and 70 in the
mansion, and **most of them are the scene working**. A man in a booth is inside
the booth's collider; two dancers in a hot tub are inside one solid
4.1 x 4.1 x 1.04 m box; the mansion's back-row recliners span floor+0.30 to
+1.20 with their sitters' hips dead on the pad. You cannot sit in a tub without
being inside the tub.

Two exemptions are in and are principled:

- **`ride`** — a passenger is inside the vehicle by definition, and the Special
  Meeting's sedan has to be one solid box because it is the wall the player
  walks round. Took that scene from ten findings to zero.
- Nothing else.

A third was tried and **reverted**: skip the finding when the swallowing box
rises less than half a metre above a seated actor's hips. It caught neither the
Bing's booths (~0.9 m) nor the mansion's recliners (~0.66 m), and raising the
number until they fell inside it would be choosing a threshold to make a count
go down — which is how a gate stops meaning anything. The measurement is in the
history; the knob is not in the code.

**The right mechanism is the one the geometry gate already has:** a per-scene
allowlist, entries keyed by actor id and solid, each with a reason and a source
line, sorted, no wildcards — see `tools/geometry-allowlists/`. Until that
exists, these counts are triaged, not ignored, and this section is the triage.

## Running it

```
npm run verify:staging                    # every state with a cast
node tools/verify-staging.mjs heist       # one scene
node tools/verify-staging.mjs --coverage  # bodies still unmarked
```
