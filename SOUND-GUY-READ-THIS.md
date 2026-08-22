# SOUND GUY — READ THIS FIRST

**There are 161 voice lines to record.** 36 of them are RE-RECORDS: lines that
were already recorded and have since been rewritten, so the take on disk says
the wrong words. They are marked **[RE-RECORD]** in `VOICE-LINES-NEEDED.md`.

The rest are new: 11 replacement cues whose ids changed with their wording, 20
lines for three new 97.8 THE SQUATCH ad breaks, and the 94 that were already
outstanding.

*(Updated 2026-08-19, after the dialogue pass. The generated ledgers are the
source of truth; this page is only the doorman. If it disagrees with
`npm run voice:needed`, believe the command.)*

## About the re-records

You do **not** need `--force` for them. `assets/sfx/rerecord.json` is the queue,
`npm run vo:rerecord` stamps it onto the manifest, and `tools/generate-sfx.mjs`
treats a marked cue as work to do even though a file already exists — because
"the file exists" is the wrong reason to skip a line whose words changed.

Once a replacement take is indexed, delete that line's entry from
`assets/sfx/rerecord.json` and run `npm run vo:rerecord`. `npm run check` fails
if the queue and the manifest disagree.

## About the three new ad breaks

The 20 new 97.8 THE SQUATCH lines belong to three commercials that are written
but **not on air yet** — they carry `live: false` in `src/core/stations.js`, so
the ad slot keeps playing the one break that has audio. Record them like
anything else, then flip those three to `live: true` in the same file. Until
you do, the lines are on your sheet but nobody hears them.

## Prove it to yourself

```
git checkout main
git pull
npm run voice:needed     # the count, and every line, grouped by voice
npm run sfx:dry -- --voice-only --live-only   # the same work as filenames + words
```

Those two must agree. If they disagree, your checkout is stale: stop and pull
first. If they agree but disagree with the number at the top of this page, new
lines have landed since it was written — believe the commands.

## When new lines land

New scenes and rewrites add lines through the `tools/<scene>-vo.mjs`
generators, and the workflow has not changed:

```
npm run sfx:dry -- --voice-only --live-only   # see the work: filenames + exact words
export ELEVENLABS_API_KEY=sk_...
npm run sfx:vo                                # generate straight into assets/sfx/
npm run sfx:listen                            # rebuild the index; audition in _listen.html
npm run voice:needed                          # must return to: 0 lines to record
npm test && npm run check
```

`VOICE-LINES-NEEDED.md` regenerating to **zero** is the definition of done. Not
memory, not a spreadsheet, not this file — that command.

All voice profiles in use have ids in the `voices` block of
`assets/sfx/manifest.json`; casting notes and the audition workflow live in
`VOICE-LINES-TODO.md`.

## What NOT to touch

- **Legacy paths** in old spreadsheets/notes — the old IDs are not
  runtime-compatible. `VOICE-LINES-NEEDED.md` is the only list. (96 historical
  rows are deliberately excluded.)
- **The Initiation party catalog** — already indexed, and its scene isn't
  reachable yet. `sfx:vo` excludes it on purpose; don't force it back in.
- **The 155 orphaned recordings** — files in `assets/sfx/` that no manifest
  cue claims any more (stale hashed takes from regenerated manifests; the full
  list is `tools/sfx-orphan-allowlist.json`). They are scheduled for pruning.
  Do not re-record them, and do not delete them by hand — the prune wave owns
  that.
- **The three mansion bookcase takes** — `mansion.bookcase.latch`, `.swing`
  and `.seat`. Delivered, indexed, and named by no source file in the game:
  three takes for a piece of furniture that has one E press and two states,
  and the pair actually wired to it (`mansion.suite.bookcase.open` / `.shut`)
  already has the latch inside the open take. Retired on 2026-08-22 —
  manifest rows dropped, files deleted, `index.json` regenerated, provenance
  in `assets/sfx/rerecord.json`'s `retired` list. **Do not re-deliver them.**
- **Nothing else needs re-recording.** Every other delivered take stays
  delivered.
