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

## Signature cues

Some songs belong to a person or a moment rather than to a station. These are
cues, not programming. All are wired and all are delivered as of 2026-08-06.

| Cue | File | Fires on | Wired? |
|---|---|---|---|
| **Sensi Lou** | `sensi-lou.mp3` | Tony entering Big Uncle Lou's office at the Bing | yes |
| **Baby Snakes** | `baby-snakes.mp3` | Booskibro's first significant appearance — at the Bing, the shot beat where he takes the floor and yells for it | yes |
| **Can't You Hear Me Knocking** | `cant-you-hear-me-knocking.mp3` | Beef Run initial takeoff roll, at 45 knots | yes |
| **Fortunate Son** | `fortunate-son.mp3` | SQUATCHOLA GAY's initial takeoff roll, same mechanism | yes |
| **Store room spy jazz** | `spy-jazz.mp3` | The portable radio during *License to Grill* (Blond) | yes |
| **THE TAKE's safehouse radio** | `codename-sasquatch.mp3` | The crew's actual fresh start, the morning of the job — not the preview/resume/return paths | yes |

### Can't You Hear Me Knocking — wired 2026-08-05

Owner's request, 2026-08-03: it comes in on the takeoff roll as the Brushrunner
passes **45** on the runway. It was then deliberately left unimplemented until
the file landed — which is why the 2026-08-05 playtest note reads *"I also
didn't hear the cant you hear me knocking."* Nothing on the page was asking for
it, so there was no sound to miss.

It is wired now, on the same `playSignatureTrack` path as Sensi Lou and Baby
Snakes: `SIGNATURE_TRACKS.cantYouHearMeKnocking` in `src/core/signature-music.js`,
fired from `updateLineup` in `src/beefrun/mission.js` off `KNOCKING_AT_KNOTS`.
Drop `cant-you-hear-me-knocking.mp3` into this folder and add the usual one-line
entry to `manifest.json` and it plays, with no code change. Until then it plays
`10-drunk-cigarettes.mp3` in the same mix slot, so the moment has a record under
it rather than silence.

**Still owed:** the recording itself, and the mix pass against it.

**Settled with the owner:**

- **Once, on the initial takeoff only.** Whispering Pines outbound. It does
  **not** play again on the loaded El Hueso departure.
- **About two minutes of it**, not the whole record.
- **It needs a mix pass** once the file is in and audible against the scene.

When it arrives, the hook already exists in the same shape. `updateTakeoff` in
`src/beefrun/mission.js` fires Sasole's rotation call off one flag and one
speed test:

```js
if (!this.flags.rotateCalled && p.ias * KT > 58 && p.onGround) { … }
```

45 is the same line, thirteen knots earlier and on its own flag — so the music
starts under the roll and the rotate call lands on top of it.

**Gate it on the phase, not just a flag.** The two departures are separate
phases: the home roll runs through `takeoff`, and El Hueso's runs through
`heavyTakeoff` (`mission.js:401`, `:486`). A bare one-shot flag is the wrong
instrument here — `rotateCalled` is deliberately reset at `mission.js:1587-1588`
so Sasole calls rotation on the second departure too, and anything hung off
that pattern will play the song twice. Test the phase.

That also gets the retry behaviour right for free: a roll that runs out of
runway is a soft failure that restores the `takeoff` checkpoint
(`mission.js:794`), so a player who blows the first departure and tries again
is still on the initial takeoff and should still get the song.

**Two minutes.** The radio already has the vocabulary for playing part of a
record — `nehoo-with-a-guu` in `manifest.json` carries `"start": 0` and
`"cutAt": 15` and gets exactly fifteen seconds before the station cuts it. That
is a `radio.js` feature and this cue is a mission music loop rather than a
station track, so it does not inherit it; but `cutAt` is the shape to copy
rather than invent. Worth deciding whether two minutes ends on a fade or a hard
cut, and whether it stops early if the leg does.

**The mix.** A full song has to sit under a headset, two engines and a man
talking. It wants its own loop key ducked against `dialogue` rather than
joining the ambient bed, so Sasole's rotation call and the departure barks stay
intelligible over it.

They are deliberately **not** in `manifest.json`, because `npm run check`
fails the build for a manifest track with no file on disk. That makes the
manifest the single honest answer to "has the recording landed", and the
runtime reads it: an unlisted signature track is never requested, so a missing
song costs a fallback rather than a 404 and a console error.

To turn any of them on: drop the mp3 in this folder and add the usual one-line
entry to `manifest.json` with **no `station` and no `venue`** — a venue would
put it in a radio playlist, and these are cues, not programming. Nothing in
`src/` has to change. `tests/signature-audio.test.mjs` holds the contract.
