# Cast restyle — visual validation, 2026-07-30

Screenshots taken while converting the Bada Bing and Silver Room cast in
`src/bing/cast.js` to the Squatchfather's blocky figure language
(`src/squatchfather/characters/Figure.js`).

Regenerate any of these with:

    node tools/shots-cast.mjs            # everything
    node tools/shots-cast.mjs bing       # just the club
    node tools/shots-cast.mjs silver     # just Margo
    node tools/shots-cast.mjs style      # the neutral-light comparisons
    node tools/shots-cast.mjs probe      # measurements, no images

## Side by side — is it the same family?

The point of the exercise. Both figures under identical lighting and one
camera: the Bing's `makePerson` on the left, the Squatchfather's
`buildFigure` on the right.

| File | What it shows |
|---|---|
| `style-side-by-side.png` | Full body, Bing patron vs Squatchfather figure |
| `style-heads.png` | The same pair, heads only |
| `style-suit.png` | Both in a suit, where the silhouettes are closest |

## The club

| File | What it shows |
|---|---|
| `lou-office.png` | Big Uncle Lou at his desk with his real face from `assets/faces/lou.png`, gold chain, no bandana |
| `performers-stage.png` | The stage from the floor: three pole dancers and the runway |
| `performers-close.png` | One performer at her pole, mid-routine |
| `blackjack-dealer.png` | The dealer, and most of the room behind him |
| `floor-crowd.png` | Wide across the floor — booths, table, stage in one frame |
| `bing-patron.png` | The bartender at the bar, as the in-situ style reference |

## Neutral light

The club is dim on purpose, which is right for the room and useless for
judging a costume. These are the same characters built in isolation under
plain lighting.

| File | What it shows |
|---|---|
| `lou-face-neutral.png` | Lou's photo head, close, with the texture crop applied |
| `lou-full-neutral.png` | Lou full length |
| `dancer-neutral.png` | A performer full length — bust, waist, hips, bikini coverage |

## The Silver Room

| File | What it shows |
|---|---|
| `margo-silver.png` | Margo seated at the front table, restyled and intact |

## Notes on the captures

- **Two shots use a capture-only fill light.** The Bing's stage and the
  Silver Room's dining room are close to unlit at the moment these were
  taken (house lights down for the band). `performers-stage.png`,
  `performers-close.png` and `margo-silver.png` add a point light for the
  frame and remove it immediately after. It is not part of either scene.
- **The camera is driven directly, not through the player.** The player is a
  body and collides; asking it for a close portrait gets it shoved out of the
  desk and the frame ends up pointed at a wall. `shots-cast.mjs` silences
  `player._applyCamera` and sets the camera transform itself.
- **Margo is pinned for her shot.** Software rendering runs about a frame a
  second, and the evening's script walks her back out to the taxi in that
  time, so her transform is re-asserted every frame until the shutter.

## Measurements

`node tools/shots-cast.mjs probe` sweeps a full four-bar dance routine and
reports the numbers `verify:bing` asserts at a single arbitrary moment. It
caught a real regression during this work — the first pole-work pose put a
dancer's fingertips 25 cm above her own head and pushed her bounding box to
2.04 m, over the 1.95 m ceiling.

Current margins:

    performer bbox height (gate: 1.55 < h < 1.95)
      performer0: 1.688 .. 1.840
      performer1: 1.710 .. 1.862
      performer2: 1.689 .. 1.831
      performer3: 1.696 .. 1.753
    seated drinker lowest point (gate: > -0.08): -0.048
