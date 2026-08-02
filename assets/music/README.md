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
