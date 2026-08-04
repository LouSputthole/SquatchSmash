# The fitting room

    npm start          →  http://localhost:5173/wardrobe.html
    npm run shots:wardrobe            (writes docs/validation/2026-08-04/wardrobe/)

`src/core/wardrobe.js` is the ledger of what the Family wears. This is the
mirror: every canonical model, built by the game's own `makePerson`, under the
game's own light, so a note about a cuff can be made against a picture of the
cuff.

## Why it exists

`verify:bing-two` can assert that `bomber.collar.knit` is on Captain Lou
Sasole, and it does. It cannot tell you whether the jacket looks like a flight
jacket. Every garment added in the wardrobe pass was checked by name and none
of them had been *looked* at from the front, at full length, under a light
that was not a desk lamp. The first five minutes in this room found three
things no assertion was ever going to find (see below).

## The three rules it follows

1. **It reads the ledger, it does not restate it.** Every figure is the frozen
   model object imported from `src/core/wardrobe.js`,
   `src/core/hotdog-model.js` or `src/bing/family-ape.js`. If the fitting room
   and the game ever disagree, the fitting room is wrong by construction,
   which is the only way a reference sheet stays honest. There is no second
   copy of anybody's height in this repo and there must never be one.
2. **It shows the light the scene shows.** Three rigs, because these people are
   judged in three different rooms and a garment that only works in one of
   them is not finished:
   - `bing` — one warm practical, almost no fill. Where gold either reads or
     turns to smear.
   - `day` — the deck and the fairway.
   - `studio` — neutral, for cut and colour without a room's opinion on top.
3. **It says what it is showing.** The right-hand panel is generated from the
   model object's own keys by `describe()`, so it cannot list a watch the
   figure does not have. A hand-written spec sheet drifts within a week.

## Controls

| | |
|---|---|
| <kbd>←</kbd> <kbd>→</kbd> | change person |
| drag / wheel | orbit / dolly |
| <kbd>1</kbd>–<kbd>6</kbd> | full, head, collar & chain, watch hand, belt, shoes |
| <kbd>L</kbd> | cycle the lighting rig |
| <kbd>T</kbd> | turntable on/off |
| <kbd>A</kbd> | the whole rail side by side |
| <kbd>R</kbd> | reset the view |

## Detail cameras aim at parts, not at heights

`MARKS` in `src/wardrobe/preview.js` carries an `aim` list of mesh names —
`person.watch.dial`, `necklace.pendant`, `belt.buckle` — and the camera is
placed on whichever one this figure actually has, falling back to a fraction
of its height only when it has none.

This is not tidiness. The first version aimed the watch camera at 0.50 of the
figure's height, which is Lou's hip, from inside his jacket, and the shot came
back as a black rectangle that looked like a rendering bug. A detail camera
placed at a guessed fraction is wrong for the next person's proportions and
wrong again the moment the turntable moves.

For the same reason `state.target` is held in the **stand's** space and carried
round by hand in `render()`: a camera locked onto a watch has to stay locked
onto it while the figure turns, and parenting the camera to the stand would
have spun the lighting with it.

## What the first pass through this room found

Recorded because they are all invisible to every check in the repo, and
because two of them are the same defect wearing different clothes.

1. **The gut reads as a pod, not a belly.** On Lou (`gut: 0.42`), Willy
   (`gut: 1`) and Billy HotDog (`gut: 0.58`) the `person.gut.belly` slab reads
   as a separate rounded object worn on the front of the jacket rather than as
   part of the man. The projection was already narrowed once for exactly this
   reason; it is better and it is not solved. Chamfer, material and the hard
   seam where it meets the ribcage are the remaining suspects.
2. **Hands are oversized and there is no wrist.** `hand` is a
   0.085 × 0.115 × 0.065 slab hung straight off the forearm, so at full length
   the cast read as mitts, and the good gold watch sits directly against a
   block twice its size.
3. **At high `build` the arms stand off the ribcage.** Lou at `build: 1.38`
   has a visible gap between deltoid and chest. `SH` deliberately pushes the
   socket out to clear the ribcage before an animation starts — correct, and
   the seam it leaves is not covered by anything.

None of these are wardrobe bugs; they are figure bugs the wardrobe pass made
visible by putting good clothes on a body nobody had stood in front of.
