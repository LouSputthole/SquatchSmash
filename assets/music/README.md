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

## Signature cues — two records still owed

Two songs belong to people rather than to a station, and both are wired but
neither is recorded yet. They live in `src/core/signature-music.js`:

| Cue | File wanted | Fires on | Playing until then |
|---|---|---|---|
| **Sensi Lou** | `sensi-lou.mp3` | Tony entering Big Uncle Lou's office at the Bing | `good-ole-days.mp3` |
| **Baby Snakes** | `baby-snakes.mp3` | Booskibro's first significant appearance — at the Bing, the shot beat where he takes the floor and yells for it | `booskibro.mp3` |

They are deliberately **not** in `manifest.json`, because `npm run check`
fails the build for a manifest track with no file on disk. That makes the
manifest the single honest answer to "has the recording landed", and the
runtime reads it: an unlisted signature track is never requested, so a missing
song costs a fallback rather than a 404 and a console error.

To turn either one on: drop the mp3 in this folder and add the usual one-line
entry to `manifest.json` with **no `station` and no `venue`** — a venue would
put it in a radio playlist, and these are cues, not programming. Nothing in
`src/` has to change. `tests/signature-audio.test.mjs` holds the contract.
