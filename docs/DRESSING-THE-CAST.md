# Dressing the cast

> "The tux looks good. Lets save how to do a tux like that for later."

Saved. This is the technique behind `tuxedo: true` in `src/bing/cast.js`,
written up so the next garment does not have to rediscover it.

The cast are cut from slabs on purpose and that is staying — the rig does not
change, nobody's height moves, and no garment gets its own skeleton. Everything
below is about making a slab read as a specific person in specific clothes under
one bulb.

## The failure it replaced, because it is the instructive part

Black tie was first attempted as `neckline: 'v'` over a dark suit. The owner
spotted it instantly: *"a strange looking Vneck thing."*

The V block **subtracts**. It cuts a skin-coloured triangle into the chest and
leaves two pale bars either side of it. On an open knit that is a collar. On a
tuxedo it is a man whose shirt is undone to the sternum.

A tuxedo is the opposite shape, and that inversion is the whole lesson.

## The seven rules

**1. Add in front of the ribcage. Never subtract from the torso.**
Every piece of the tux — bib, studs, cummerbund, lapels, notches, pocket square
— sits on the same plane the collar and bow tie already use, in front of a torso
that is untouched. Nothing is cut away. A subtractive garment shows skin, and
skin is almost never what a garment is for.

**2. Build what is underneath first, then lay the outer garment over it.**
The shirt is the bright thing; the jacket is what is over it. So: solid white
bib first, then two satin lapels lying on top of it and closing in toward the
waist. The visible white then narrows as it descends, the way a real dinner
jacket makes it.

**3. Oversize the layer underneath.** The bib is deliberately wider than the
white you end up seeing, because the lapels cover its edges. Size it to the gap
instead and you get a slice of bare ribcage between shirt and lapel — the same
subtractive failure by a different route.

**4. Terminate the garment.** Without the cummerbund the white bib stops in
mid-air above the trousers and the figure reads as a man in a bib, not a man in
a tuxedo. Anything that starts has to visibly end on something.

**5. Sell material with roughness, not colour.** The satin is the jacket's own
colour lifted toward white by 0.16 and taken to roughness 0.3 with a little
metalness. On a slab under one bulb a lapel reads because it catches light the
wool does not. Two flat colours side by side just look like two colours.

**6. Scale by build, clamped.** Every horizontal dimension is
`× Math.min(t, 1.2)`. The garment has to fit Lou and it has to fit the Prospect,
and past a point a wider man does not get proportionally wider lapels.

**7. Name every part.** `tuxedo.shirt.front`, `tuxedo.lapel.left`,
`tuxedo.lapel.notch.right`, `tuxedo.cummerbund`, `tuxedo.pocket-square`. A
verifier can then assert the garment exists on the right person without
screenshotting anything, which is the only way clothing stays fixed.

## Handedness

The figures face **+Z**, so a character's own left hand is on **+X**. The pocket
square is at `+0.182 × t` for that reason, and the watch is on the left wrist for
the same one. Getting this backwards is invisible in a front view and obvious
the moment somebody turns.

## Looking at it

`docs/THE-FITTING-ROOM.md` — `npm start` then `/wardrobe.html`. Every canonical
model under three lighting rigs, with detail cameras that aim at the named part
rather than at a guessed height. Rule 7 below is what a verifier can check; the
fitting room is for everything a verifier cannot.

## Where the options live

`makeFigure` in `src/bing/cast.js` — see the option block at the top of the file.
`dress` picks the base garment (`suit`, `tee`, `tracksuit`, `waistcoat`, `work`,
`chef`, `porter`, `gown`, `bikini`); `tuxedo`, `neckline`, `luxury`, `bowtie`,
`watch`, `chainStyle`, `bandana` and `barefoot` layer on top of it.

`neckline: 'v'` is still correct for what it was written for — an open knit
collar. It is simply not black tie, and the two must not be confused again.

## The worked example

`src/bing/license-to-grill-runtime.js` dresses James Blond in the remains of
one: `tuxedo: true`, barefoot, hair that has survived an evening it should not
have. The comment there records the same correction, at the point where somebody
copying the setup would read it.
