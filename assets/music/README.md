# Radio tracks

Drop audio files in this folder and list them in `manifest.json`:

```json
{
  "station": "KSQCH 101.7",
  "tracks": [
    { "file": "morning-static.mp3", "title": "Morning Static", "artist": "The Bipedals" },
    { "file": "trailhead.mp3",      "title": "Trailhead",      "artist": "Night Hike" }
  ]
}
```

`file` is required; `title` and `artist` only affect the on-screen display.
Anything the browser can play works — `.mp3`, `.ogg`, `.m4a`, `.wav`.

Tracks play in order and loop back to the start. In game: look at the radio on
the sideboard, press <kbd>E</kbd> to toggle power and <kbd>R</kbd> to skip.

The Bada Bing DJ uses its own positional set from `src/bing/main.js`. The first
visit always opens on *Sallie J*. Legacy later visits rotate among the floor
records, while *Squatches in the House* stays out of that opening rotation so
a DJ request always produces an audible change. Set `"venue": "bada_bing"` in
the manifest to mark every track that belongs in the club set.

With no tracks listed the radio still turns on — it just plays static.

## Signature cues — three records still owed

Some songs belong to a person or a moment rather than to a station. These are
cues, not programming. Two are wired and waiting on a file; the third is
waiting on both.

| Cue | File wanted | Fires on | Playing until then | Wired? |
|---|---|---|---|---|
| **Sensi Lou** | `sensi-lou.mp3` | Tony entering Big Uncle Lou's office at the Bing | `good-ole-days.mp3` | yes |
| **Baby Snakes** | `baby-snakes.mp3` | Booskibro's first significant appearance — at the Bing, the shot beat where he takes the floor and yells for it | `booskibro.mp3` | yes |
| **Can't You Hear Me Knocking** | `cant-you-hear-me-knocking.mp3` | **Beef Run takeoff roll, at 45 knots** | — | **not yet — owner is supplying the file** |

### Can't You Hear Me Knocking — the note, not the implementation

Owner's request, 2026-08-03: it comes in on the takeoff roll as the Brushrunner
passes **45** on the runway. Deliberately left unimplemented until the file
lands, so nothing is guessing at a mix for a song nobody has heard in place.

When it arrives, the hook already exists in the same shape. `updateTakeoff` in
`src/beefrun/mission.js` fires Sasole's rotation call off one flag and one
speed test:

```js
if (!this.flags.rotateCalled && p.ias * KT > 58 && p.onGround) { … }
```

45 is the same line, thirteen knots earlier and on its own flag — so the music
starts under the roll and the rotate call lands on top of it. Points to settle
with the file in hand:

- **Units.** Read as 45 **knots indicated**, matching Sasole's "at sixty, ease
  her off" and the `p.ias * KT` test above. Say so if it meant something else.
- **Which rolls.** There are two takeoffs — Whispering Pines outbound and the
  loaded El Hueso departure. The flag resets at `mission.js` ~1588 with
  `rotateCalled`, so it will re-arm for the second one unless it is meant to be
  once a mission.
- **The mix.** It is a full song against a headset, two engines and Sasole
  talking. It probably wants its own loop key ducked against `dialogue`, not
  the ambient bed.
- **Aborts.** A roll that runs out of runway is a soft failure that puts the
  player back at the threshold; the track has to stop and re-arm with it.

They are deliberately **not** in `manifest.json`, because `npm run check`
fails the build for a manifest track with no file on disk. That makes the
manifest the single honest answer to "has the recording landed", and the
runtime reads it: an unlisted signature track is never requested, so a missing
song costs a fallback rather than a 404 and a console error.

To turn either one on: drop the mp3 in this folder and add the usual one-line
entry to `manifest.json` with **no `station` and no `venue`** — a venue would
put it in a radio playlist, and these are cues, not programming. Nothing in
`src/` has to change. `tests/signature-audio.test.mjs` holds the contract.
