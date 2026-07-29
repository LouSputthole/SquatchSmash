# Audio

Every sound in SquatchSmash is currently **synthesised at runtime** with the WebAudio
API (`src/audio.js` for the campground, `src/motel/audio.js` for the motel). There are
no audio files in the repo and the game needs none to run.

`sound-queue.json` is the production queue: every cue the game plays or wants, with the
code hook it belongs to, so real audio can be recorded or generated later and dropped in
against stable ids.

## Regenerating the queue

```sh
node tools/sound-queue.mjs          # rewrite sound-queue.json and check coverage
node tools/sound-queue.mjs --check  # check only — non-zero exit if the queue has drifted
```

The tool scans `src/**/*.js` for `sfx.<cue>` usage and fails if the code plays a cue with
no queue entry, or if the queue briefs a cue the code no longer has. Voice lines are read
straight out of `src/motel/dialogue.js`, so the queue can never fall behind the script.

## Fields

| Field | Meaning |
| --- | --- |
| `id` | Stable identifier — `<scene>.<category>.<file>` |
| `file` | Where the produced asset should land |
| `call` | The audio-module export this asset replaces. `null` = briefed but nothing triggers it yet |
| `seconds` | Target length |
| `variations` | How many alternates to produce; the game will round-robin them |
| `loop` | Must be seamless |
| `status` | `todo` → `recorded` → `in-game` |

Voice entries carry `speaker`, the exact `line`, and the `context` it plays in. Prospect is
a sasquatch; Manny is family and also a sasquatch; **everyone else in the motel is human**,
which should be audible — the sellers are smaller, faster-talking and more frightened than
the two of them.

## When the assets exist

Add a small loader that maps `id → AudioBuffer` and have the `sfx.*` functions play the
buffer when one is loaded, falling back to the synthesised version when it is not. Nothing
else in the game needs to change: gameplay only ever calls the named cue.
