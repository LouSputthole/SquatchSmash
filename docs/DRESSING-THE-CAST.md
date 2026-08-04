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

## The eighth rule, learned the hard way

**8. `D` is the ribcage, not the front of him. Measure, do not assume.**

Every garment detail in this builder used to be placed at some multiple of
`D` — the half depth of the chest slab. That is correct on a figure whose chest
is the furthest-forward thing about him, and wrong on everybody else. Lou's
belly reaches about nine centimetres past his chest. His medallion, his
waistcoat, his chalk stripes and his buttons were all being drawn at chest
depth, which is to say *inside him*, and what the player actually saw was a
heavy man in a plain dark sack with a chain floating on it.

Two helpers inside `makePerson` fix that class of bug for good:

- `torsoFront(y0, y1, halfWidth)` measures the forward-most surface of whatever
  is already built, over a band of heights. Everything structural exists before
  any garment does, so this is both cheap and self-maintaining — a shape added
  next year is measured too.
- `frontPanel({ ... })` builds a garment panel that *lies on him*: it measures
  the front at its top and its bottom and tilts to join them. A waistcoat over
  a belly touches the chest at the top and the belly at the bottom, so it
  slopes. On a flat-fronted figure both ends measure the same, the tilt is
  zero, and it is exactly the flat panel it always was.

The same rule caught the watch. Its case sat at `0.045 × t` on a forearm whose
front face is at `0.0525 × t`, and its bracelet ringed the wrist at `0.0355 × t`
inside a slab half `0.05 × t` wide — so on **every** figure in the game the case
was inside the sleeve and not one link of the band was ever drawn. It had
looked fine for months because four markers and two hands poked through, and
those were the only parts anybody had ever seen.

**`frontPanel` returns a group, and that is not cosmetic.** `box()` in
`world/build.js` carries an object's SIZE in its scale, so a button parented to
a panel *mesh* inherits the panel's dimensions and is crushed — a 6 mm button
on a 20 mm panel came out at 0.12 mm and vanished. The group carries the
placement, the mesh inside carries the size, and children are in plain metres.

## Handedness

The figures face **+Z**, so a character's own left hand is on **+X**. The pocket
square is at `+0.182 × t` for that reason, and the watch is on the left wrist for
the same one. Getting this backwards is invisible in a front view and obvious
the moment somebody turns.

## The corno

`pendantStyle: 'horn'` is Big Uncle Lou's cornicello, and it is the one piece of
jewellery on this roster whose *shape* is the whole job. Four things make it
read as a horn rather than as a gold carrot, and all four are load-bearing:

1. **It curves, in one plane.** A straight taper is a spike. The spine leans out
   and hooks back at the tip. The curve lives mostly in X because these figures
   are seen from the front; a horn that curved in Z would look straight in every
   conversation in the game.
2. **It is fattest at the top and needle-thin at the point, on a curve.**
   `(1 - u^1.3)` holds the radius through the first third and then loses it
   quickly, which is what a real one does.
3. **It is ribbed.** Smooth gold under one bulb takes a single long highlight
   and reads as plastic. The rings break that into a row of separate catches,
   slanted rather than square-on because the real ridges are a spiral.
4. **It hangs from a bail** whose axis runs along X, so the chain passes
   *through* it. It is positioned at the chain's low point, not under it.

`HORN.back` is published for rule 8's sake: it is how far the thing reaches
behind the point it hangs from — the worse of its top radius and its hook — and
the chain reserves that much clearance before deciding where the pendant plane
goes. Miss it and the hook is the one part of the horn that ends up inside the
man, which is exactly the failure this whole document is about.

Booski and DeathMegatron keep `pendantStyle: 'crest'`. The crest is the
Family's; the corno is Lou's, and that difference is deliberate.

## Where the options live

`makePerson` in `src/bing/cast.js` — see the option block at the top of the file.
`dress` picks the base garment (`suit`, `tee`, `tracksuit`, `waistcoat`, `work`,
`chef`, `porter`, `gown`, `bikini`, `bomber`, and now `argyle` and `camp`);
`tuxedo`, `neckline`, `luxury`, `bowtie`, `watch`, `bracelet`, `chainStyle`,
`pendantStyle`, `hat`, `pinstripe`, `threePiece`, `knickers`, `pattern`,
`shoeStyle`, `bandana` and `barefoot` layer on top of it.

- `argyle` is a sweater vest over a collared shirt. It takes an `{ a, b, line }`
  colourway, and **both diamond colours have to contrast with the vest field**
  or half the lattice is invisible and the pattern reads as a scatter.
  `knickers` reuses the same colourway for the stockings, which is the thing
  that makes a golf outfit read as an outfit rather than as a jumper and some
  socks.
- `camp` is an open short-sleeve button-down over a white tee. Its two fronts
  and its tee are `frontPanel`s, so the shirt hangs over a belly instead of
  stopping above one.
- `threePiece` puts a waistcoat behind an **open** jacket. That openness is the
  point: a chain worn over a buttoned jacket is a chain nobody can see, so this
  is what makes Lou's corno visible in the Bing at all.

Lou's three looks — the club, the mansion and the course — are outfits on one
man, and they live in `src/core/wardrobe.js` beside him rather than being typed
out in each scene. The jewellery is the same in all three, because it is his.

`neckline: 'v'` is still correct for what it was written for — an open knit
collar. It is simply not black tie, and the two must not be confused again.

## Verifying it

`tests/outfits.test.mjs` asserts the depth rules above rather than the look:
that the horn clears the belly on the widest man who wears one, that every
visible part of the watch stands proud of the sleeve at every build on the
roster, that the bracelet is on the other wrist, that the waistcoat and the
chalk stripes are in front of the belly they are worn over, and that the
stockings are cut from the vest's colourway. "It exists" is the easy half;
"you can see it" is the half that kept regressing.

## The worked example

`src/bing/license-to-grill-runtime.js` dresses James Blond in the remains of
one: `tuxedo: true`, barefoot, hair that has survived an evening it should not
have. The comment there records the same correction, at the point where somebody
copying the setup would read it.
