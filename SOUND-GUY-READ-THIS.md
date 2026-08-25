# SOUND GUY — READ THIS FIRST

**There is nothing to record.** All 4,008 spoken cues and all 558 generated
effects have takes on disk, `npm run voice:needed` returns zero lines across
zero voices, and the re-record queue is empty.

*(Updated 2026-08-25, on `voicelines-20260825`, cut from `origin/main` at
`8ea8c699`. The generated ledgers are the source of truth; this page is only the
doorman. If it disagrees with `npm run voice:needed`, believe the command.)*

## What landed in this pass

- **The Cartel Palace finale** — 40 lines for the three-stage Mark fight:
  `lola`, `johnny`, `mark`, `mark-wife` and `sauce`. Lola and Johnny are the
  recast of the old `short-one`, so that character's eighteen previous takes are
  dead weight under a retired name and are deliberately **not** in this branch.
- **Three re-records** — `vo.bing.margo.5`,
  `vo.enolasquatch.numbskull.preflight-payload-tap-1.1` and
  `vo.enolasquatch.sasole.emergency-overheat-1.1`. Queue cleared, manifest
  re-stamped.
- **Ninety-nine takes** that existed only on a local checkout and had never been
  pushed — the pool hall among them, which is why `billiards.*` needed no
  generating.
- **Fifty-three Motel and Campground effects**, promoted out of
  `assets/audio/sound-queue.json` into the manifest for the first time. See
  "When an effect is missing rather than a line".

Everything in that list is machine-generated and **unauditioned**. Open
`assets/sfx/_listen.html` and listen before you trust the count.

## The one thing still waiting on a human

Three 97.8 THE SQUATCH ad breaks — `jerky`, `attorney` and `dealership` — are
written, recorded and indexed, and still carry `live: false` in
`src/core/stations.js`. The comment above that list names the condition:

> Flip `live` to true once the lines are in `assets/sfx/index.json`.

They are in `index.json`, every cue of all three. So the flip is unblocked and
is the last step of a job that is otherwise finished — until somebody does it,
the ad slot keeps playing the one break that was already on air, and twenty
delivered lines sit in the game where nobody hears them.

This page does not flip it, because which commercials are on air is a content
call, not a production one.

## Prove it to yourself

```
git fetch
git status -sb           # if this says "behind N", stop and reconcile first
npm run voice:needed     # the count, and every line, grouped by voice
npm run sfx:dry -- --voice-only --live-only   # the same work as filenames + words
```

Those two must agree. If they disagree, your checkout is stale: stop and pull
first.

**Check how stale you are before you believe any of it.** This page was
rewritten once from a checkout seventy commits behind, and it confidently said
zero while eighty-six cues upstream had no take at all. "Behind N" means every
count here is answering an N-commit-old question.

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
`assets/sfx/manifest.json` — 81 of them; casting notes and the audition
workflow live in `VOICE-LINES-TODO.md`.

## About re-records

`assets/sfx/rerecord.json` is the queue and it is currently empty. When a line's
wording changes, its entry goes in there, `npm run vo:rerecord` stamps it onto
the manifest, and `tools/generate-sfx.mjs` treats a marked cue as work to do
even though a file already exists — because "the file exists" is the wrong
reason to skip a line whose words changed. You do **not** need `--force`.

Once a replacement take is indexed, delete that line's entry and run
`npm run vo:rerecord` again. `npm run check` fails if the queue and the manifest
disagree.

## When an effect is missing rather than a line

Effects come out of the same manifest and the same command, with `--sfx-only`
instead of `--voice-only`. A described sound that is not in the manifest does
not exist as far as production is concerned: `generate-sfx` cannot see it,
`audio:todo` cannot list it, and the only reason the game makes any noise in its
place is a procedural WebAudio fallback.

Promoting one is a code change, not a recording:

- `tools/legacy-sfx` — the Motel and the campground rampage (53 cues)
- `tools/mansion-sfx.mjs` — PROJECT SILENT SQUATCH
- `tools/pool-sfx.mjs` — the pool table

Each has an `npm run check:*` gate and all three are enforced by
`npm run check`, so a promoted cue cannot quietly fall out of the manifest and
drop back to the oscillator it was promoted away from.

Twenty-seven cues are synth-only **on purpose** — UI ticks and subtitle blips
under the sound API's half-second floor, where an oscillator beats a generative
model. `sfx:dry` reports them as skipped, not as work.

## What NOT to touch

- **Legacy paths** in old spreadsheets/notes — the old IDs are not
  runtime-compatible. `VOICE-LINES-NEEDED.md` is the only list. (96 historical
  rows in `assets/audio/sound-queue.json` are deliberately excluded; every one
  of those lines is already recorded under its current `vo.motel.*` name.)
- **The Initiation party catalog** — already indexed, and its scene isn't
  reachable yet. `sfx:vo` excludes it on purpose; don't force it back in.
- **The retired `short-one` takes** — that character is now `lola` and
  `johnny`, recorded fresh. Do not re-deliver the old name.
- **The three mansion bookcase takes** — `mansion.bookcase.latch`, `.swing`
  and `.seat`. Delivered, indexed, and named by no source file in the game:
  three takes for a piece of furniture that has one E press and two states,
  and the pair actually wired to it (`mansion.suite.bookcase.open` / `.shut`)
  already has the latch inside the open take. Retired on 2026-08-22 —
  manifest rows dropped, files deleted, `index.json` regenerated, provenance
  in `assets/sfx/rerecord.json`'s `retired` list. **Do not re-deliver them.**
- **Nothing else needs re-recording.** Every other delivered take stays
  delivered.

*(The orphaned-recordings section that used to live here is gone: the prune wave
finished, `tools/sfx-orphan-allowlist.json` is empty, and `npm run check` now
fails on any file in `assets/sfx/` that no manifest cue claims.)*
