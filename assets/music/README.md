# Radio tracks

Drop audio files in this folder and list them in `manifest.json`:

```json
{
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
The next-track cursor is part of the campaign save, so changing scenes or
reloading does not restart the playlist.

The Bada Bing DJ uses its own positional authored set from `src/bing/main.js`:
visit one opens on *Squatches in the House*, visit two opens on *Sallie J*, and
the second-visit request changes the deck back to the requested record.
Those two manifest entries retain `"venue": "bada_bing"` so asset audits can
verify every record the club names is registered here.

With no tracks listed the radio still turns on and airs its talk schedule; it
simply skips the music slots.
