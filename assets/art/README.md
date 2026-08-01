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
| `bed.above`   | west wall, over the bed |
| `couch.left`  | west wall, over the couch (nearer the bed) |
| `couch.right` | west wall, over the couch (nearer the door) |
| `desk.left`   | north wall, left of the monitor |
| `desk.right`  | north wall, right of the monitor |
| `door.side`   | south wall, beside the front door |
| `banner.main` | north-east wall — rendered as a hanging cloth banner, not a frame |
| `bing.office.squatches_bing` | Bada Bing, framed behind Big Uncle Lou's desk |
| `bing.office.logo.crest` | Bada Bing, Silver Sasquatches crest above Lou's filing cabinet |
| `bing.office.logo.shield` | Bada Bing, Silver Sasquatches shield beside Lou's desk |
| `bing.office.fridge.sticker.toy` | Bada Bing, die-cut sticker on Lou's office mini fridge |
| `bing.bathroom.anime4` | Bada Bing, framed print on the bathroom wall |

Frames size themselves to each image's aspect ratio, so portrait and landscape
both hang correctly; `scale` (default `1`) nudges one bigger or smaller.
Any slot you leave out gets a placeholder poster, so no wall is ever blank.

In game, look at a picture and press <kbd>E</kbd> to read its title and caption.
