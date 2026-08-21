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
