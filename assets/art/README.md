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
| `cartel-palace.entry.the-a-team` | Cartel Palace, entry hall — west partition, between the two canvases already on it, first thing inside the front door |
| `cartel-palace.entry.we-dont-miss` | Cartel Palace, entry hall — east wall, over the shoulder of the guard seated at the watch desk |
| `cartel-palace.security.assault` | Cartel Palace, intelligence room — west partition, on the solid stretch south of the guest-suite doorway |
| `cartel-palace.dining.el-jefe` | Cartel Palace, dining room — rear wall panel at x -6.6, facing the doors Mark holds court behind, opposite his family portrait |
| `cartel-palace.ops.champions` | Cartel Palace, operations room — west wall, north of the estate portrait |
| `cartel-palace.ops.strat` | Cartel Palace, operations room — west wall, south of the estate portrait |

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

2026-08-19: the owner reassigned the generic office frames to supplied team
photos. The five files below are wired in `manifest.json` now; four of them
are placeholder stand-ins (copies of the nearest existing art) until the
owner's real drops overwrite them at the same filenames.

| Slot | The picture | Filename (owner will overwrite) | Frame | Aspect |
|---|---|---|---|---|
| `bing.office.the_boys` | BLAST Austin Major — Silver Sasquatches | `silver-sasquatches-austin.jpg` | 0.34 m mount, door wall top row | wide banner |
| `bing.office.shore` | A friend of ours (film still) | `goodfellas-tommy.jpg` | 0.44 m wide, on the wall behind the desk | square-ish portrait |
| `bing.office.first_truck` | 5 Years of Stacks badge | `silver-sasquatches-5-years.jpg` | 0.34 m mount, door wall top row | square |
| `bing.office.old_place` | Denver 2026 team badge | `silver-sasquatches-denver-2026.jpg` | 0.34 m mount, door wall | square |
| `bing.office.bing_1979` | The jersey fan (hotel room) | `sasquatches-jersey-fan.jpg` | 0.62 m wide, east wall (the safe frame) | portrait |
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


## The Mansion's 2026-08-19 drop — landed

Seven owner images, hung in `src/mansion/scenes/MansionInterior.js` and rowed
in `manifest.json`. `uncle-lou-is-back.png` is one file on two slots (office
and bedroom), the same way `casabonita.webp` hangs in both the apartment and
the cellar. The three iPhone JPEGs (`birthday-dog`, the two vacations) store
4032x3024 pixels with EXIF orientation 6 — the browser delivers them as
3024x4032 portraits, and the authored frames are sized to that delivered
shape.

| Slot | The picture | Filename | Frame |
|---|---|---|---|
| `mansion.bedroom.booski-death.booski-portrait` | Booski, green paint and ogre ears | `booski-portrait.jpg` | 0.90 m wide chrome panel, west wall of the shared bedroom |
| `mansion.foyer.savior` | Squatch Jesus — robes, halo, wine and eggs | `squatch-jesus.png` | 1.70 m wide, foyer's double-height west wall |
| `mansion.gallery.heaven` | The crew on the stairway to heaven | `squatch-heaven-roster.jpg` | 1.15 m wide, gallery's east end wall |
| `mansion.office.birthday-dog` | The goldendoodle in the birthday hat | `birthday-dog.jpg` | 0.16 m standing frame ON Lou's desk |
| `mansion.office.lou-is-back` | UNCLE LOU IS BACK poster | `uncle-lou-is-back.png` | 1.20 m wide, office south wall |
| `mansion.suite.lou-is-back` | UNCLE LOU IS BACK poster, again | `uncle-lou-is-back.png` | 0.80 m wide, suite south wall, bay -7.75 |
| `mansion.office.vacation-vienna` | Her, at the palace funfair | `lou-vacation-vienna.jpg` | 0.66 m wide, over the office safe |
| `mansion.suite.vacation-florence` | Florence at sunset, over the crowd | `lou-vacation-florence.jpg` | 0.60 m wide, suite south wall, bay 7.73 |


## The Cartel Palace's six A-Team pieces — still owed

The owner's punch list asked for *"substantial A-Team themed wall art
throughout the palace"* and then supplied six finished drawings: crude on
purpose, flat colour, hand lettered, all six 4:3 landscape at roughly
1456 x 1092. **None of them is in this folder.** They were pasted into a chat
and nothing was written to disk, so what is wired up is the six SLOTS.

Nothing is missing in the meantime. Each frame hangs in
`src/cartel-palace/world.js` (`A_TEAM_ART`) with drawn lettering in it, and
because `resolveGear` only fetches a file the manifest actually names, an
undelivered picture requests nothing at all — no 404, no console error, just
the lettering on the wall until the day the file lands.

**To land one: drop the image in this folder and add its `"file"` line to the
row already waiting for it in `manifest.json`.** That is the whole job; no
code changes, and the frame is already the delivered 4:3 shape so nothing
moves or resizes when the picture arrives.

| Slot | The drawing | Filename to drop in | Frame | Where it hangs |
|---|---|---|---|---|
| `cartel-palace.entry.the-a-team` | THE A TEAM — the four of them posed in front of this palace: cream stucco, red tile, arched entrance, blue fountain, the big A over the door, the black flag, the palm and the yellow sports car | `a-team-palace-portrait.webp` ✅ landed | 1.90 m wide | Entry hall, west partition, z 6.75 |
| `cartel-palace.entry.we-dont-miss` | A TEAM — "WE DON'T MISS", "A IS FOR AMIGOS". Five men in black tactical vests and camo, AKs and the white/orange sniper rifle, gold chains, sunglasses, brick wall, money bag, the yellow BOMB PLANS A crate | `a-team-we-dont-miss.webp` ✅ landed | 1.50 m wide | Entry hall, east wall, z 5.0, beside the watch desk |
| `cartel-palace.security.assault` | A TEAM ASSAULT — four men through the double doors, the cigar and the machine gun, the one tripping over, "I PITY THE FOOLS!" | `a-team-assault.webp` ✅ landed | 1.60 m wide | Intelligence room, west partition, z -16.3 |
| `cartel-palace.dining.el-jefe` | EL JEFE - A TEAM — white suit, gold medallion, the throne with the red-jewelled A, four men with pistols, red curtains, money bags | `a-team-el-jefe.webp` ✅ landed | 2.20 m wide | Dining room, rear wall, x -6.6 |
| `cartel-palace.ops.champions` | A TEAM CHAMPIONS — the couch, the cash, the blackboard reading KILLS: 3 / WINS: 0 / LOSSES: 47 / LAST PLACE, and the five trophies for it | `a-team-champions.webp` ✅ landed | 2.00 m wide | Operations room, west wall, z -20.0 |
| `cartel-palace.ops.strat` | A TEAM STRAT — OPERATION: DUMB LUCK on the war-room table, GUARDS R DUM, WATER HAZARD LOL, IF PLAN A FAILS: BLAME SOMEONE ELSE, VICTORY CERVEZA | `a-team-strat.*` — STILL OWED | 2.00 m wide | Operations room, west wall, z -28.0 |

```json
{ "slot": "cartel-palace.ops.champions",
  "file": "a-team-champions.webp",
  "title": "A Team Champions",
  "caption": "Three kills, forty-seven losses, five trophies. The trophies are for the losses." }
```

The filenames are a suggestion in the same sense the Bing's are: the SLOT is
what matters and the `"file"` line is what points it at a real image, so a
`.jpg` or a `.webp` is fine as long as the manifest row says so. The frames
are authored at the delivered 4:3 and deliberately do NOT resize themselves
from the file's own aspect — a picture that resized itself on load could grow
across a doorway, and `tests/cartel-palace-a-team-art.test.mjs` measures the
authored frames precisely so that cannot happen. The consequence is worth
saying plainly rather than discovering: a delivered file that is not 4:3 gets
STRETCHED onto a 4:3 canvas, because the canvas is not going to move. Send a
4:3 crop.

The operations room is the long room west of the portrait gallery's own west
wall. It is sealed today — the owner asked separately for it to be turned
into an operations gallery, and cutting its doorway and dressing the rest of
it is that pass, not this one. Its whole east wall is left bare for it.
