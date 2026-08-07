# Squatch gear

Images dropped here hang on the apartment walls. List them in `manifest.json`:

```json
{
  "art": [
    {
      "slot": "desk.left",
      "file": "squatch-tee.jpg",
      "title": "Tour shirt",
      "caption": "Front row, 2019. Still fits.",
      "scale": 1.1
    }
  ]
}
```

| Slot | Where it hangs |
|---|---|
| `bath.toilet.poster` | apartment bathroom, portrait-format frame beside the existing print over the toilet |
| `bed.above`   | west wall, over the bed |
| `couch.left`  | west wall, over the couch (nearer the bed) |
| `couch.right` | west wall, over the couch (nearer the door) |
| `desk.left`   | north wall, left of the monitor |
| `desk.right`  | north wall, right of the monitor |
| `door.side`   | south wall, beside the front door |
| `east.golf-trip` | east wall, above the kitchen-side gallery — square framed Denver golf-trip print |
| `east.casa-bonita` | east wall, above the kitchen-side gallery — tall framed Casa Bonita photo |
| `banner.main` | north-east wall — rendered as a hanging cloth banner, not a frame |
| `bing.office.squatches_bing` | Bada Bing, framed behind Big Uncle Lou's desk |
| `bing.office.shore` | Bada Bing, "Sasquatches at the shore" — landscape frame on the wall behind Lou, over his shoulder |
| `bing.office.bing_1979` | Bada Bing, "The Bing 1979" — the picture the office safe is behind; it hinges open |
| `bing.office.old_place` | Bada Bing, "The old place" — the Italy picture, door wall, further from the door |
| `bing.office.nephews` | Bada Bing, "The nephews" — door wall, nearer the door |
| `bing.office.logo.crest` | Bada Bing, Silver Sasquatches crest above Lou's filing cabinet |
| `bing.office.logo.shield` | Bada Bing, Silver Sasquatches shield beside Lou's desk |
| `bing.office.fridge.sticker.toy` | Bada Bing, die-cut sticker on Lou's office mini fridge |
| `bing.office.noir_print` | Bada Bing, "Uncle Squatch Beats" spy-noir print — east wall, south of the safe picture |
| `bing.office.nephews` | Bada Bing, "THE NEPHEWS" frame on the office door wall |
| `bing.bathroom.anime4` | Bada Bing, framed print on the bathroom wall |
| `bing.hallway.uncle_lou` | Bada Bing, rear-hall Family portrait on the way to Lou's office |
| `bing.hallway.rippinflow` | Bada Bing, rear-hall Family portrait on the way to Lou's office |
| `bing.hallway.booskibro` | Bada Bing, rear-hall Family portrait on the way to Lou's office |
| `bing.hallway.shubenator` | Bada Bing, rear-hall Family portrait on the way to Lou's office |
| `bing.hallway.sauce` | Bada Bing, rear-hall Family portrait on the way to Lou's office |
| `bing.hallway.lag` | Bada Bing, rear-hall Family portrait on the way to Lou's office |
| `bing.hallway.hogmama` | Bada Bing, rear-hall Family portrait on the way to Lou's office |
| `bing.hallway.ape` | Bada Bing, rear-hall Family portrait on the way to Lou's office |
| `bing.hallway.eric` | Bada Bing, rear-hall Family portrait on the way to Lou's office |
| `bing.hallway.irish` | Bada Bing, rear-hall Family portrait on the way to Lou's office |
| `bing.hallway.seff` | Bada Bing, rear-hall Family portrait on the way to Lou's office |
| `squatchfather.dining.coast` | Squatchfather, large framed dining-room print |
| `squatchfather.portrait.uncle_lou` | Squatchfather, Family portrait replacing dining-room filler art |
| `squatchfather.portrait.rippinflow` | Squatchfather, Family portrait replacing dining-room filler art |
| `squatchfather.portrait.booskibro` | Squatchfather, Family portrait replacing dining-room filler art |
| `squatchfather.portrait.shubenator` | Squatchfather, Family portrait replacing dining-room filler art |
| `squatchfather.portrait.sauce` | Squatchfather, Family portrait replacing dining-room filler art |
| `squatchfather.portrait.lag` | Squatchfather, Family portrait replacing dining-room filler art |
| `squatchfather.portrait.hogmama` | Squatchfather, Family portrait replacing dining-room filler art |
| `squatchfather.portrait.ape` | Squatchfather, Family portrait replacing dining-room filler art |
| `squatchfather.portrait.eric` | Squatchfather, Family portrait replacing dining-room filler art |
| `squatchfather.portrait.irish` | Squatchfather, Family portrait replacing dining-room filler art |
| `squatchfather.portrait.seff` | Squatchfather, Family portrait replacing dining-room filler art |

Frames size themselves to each image's aspect ratio, so portrait and landscape
both hang correctly; `scale` (default `1`) nudges one bigger or smaller.
Any slot you leave out gets a placeholder poster, so no wall is ever blank.

In game, look at a picture and press <kbd>E</kbd> to read its title and caption.

## Big Uncle Lou's four photographs — still owed

The four pictures in the Bing's back office are wired and waiting on files.
Nothing is missing in the meantime: each frame hangs with drawn lettering
where the photograph will go, and because `resolveGear` only fetches a file
the manifest actually names, an undelivered picture requests nothing at all.
There is no 404 and no console error — the wall just has the lettering on it
until the day it does not.

**To land one: drop the image in this folder and add its row to
`manifest.json`.** That is the whole job; no code changes.

| Slot | The picture | Suggested filename | Frame | Aspect |
|---|---|---|---|---|
| `bing.office.shore` | Sasquatches at the shore | `bing-office-shore.jpg` | 0.44 m wide, on the wall behind the desk | landscape, ~4:3 |
| `bing.office.bing_1979` | The Bing, 1979 | `bing-office-1979.jpg` | 0.62 m wide, east wall | landscape, ~4:3 |
| `bing.office.old_place` | The old place (Italy) | `bing-office-old-place.jpg` | 0.34 m wide, door wall | landscape, ~4:3 |
| `bing.office.nephews` | The nephews | `bing-office-nephews.jpg` | 0.34 m wide, door wall | landscape, ~4:3 |

```json
{ "slot": "bing.office.shore",
  "file": "bing-office-shore.jpg",
  "title": "At the shore",
  "caption": "Everybody squinting. Somebody's cousin took it." }
```

Filenames are only a suggestion — the slot is what matters, and the frame
resizes to whatever aspect ratio the file turns out to have. The Bing 1979
frame is the one the office safe is hidden behind; it hinges off the wall on
[E], and a real photograph hinges exactly as the drawn one does.
