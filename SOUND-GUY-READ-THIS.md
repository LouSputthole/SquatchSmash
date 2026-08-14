# SOUND GUY — READ THIS FIRST

**There is nothing left to generate. All 3,216 voice lines are recorded.**
The 111-line backlog this file used to open with was cleared on Aug 7–13, 2026;
the ledger (`VOICE-LINES-NEEDED.md`, regenerated straight from the game) reads
**"0 lines to record. 3216 of 3216 are already done."** and the full production
sheet (`VOICE-LINES-TODO.md`) shows 3,809 of 3,809 manifest cues with indexed
recordings.

*(Updated 2026-08-14. The previous version of this file still said "111 left" —
it was written before the Aug 7–13 generation runs and never caught up with its
own definition of done. The generated ledgers are the source of truth; this
page is only the doorman.)*

## Prove it to yourself

```
git checkout main
git pull
npm run voice:needed     # must print: 0 lines to record
npm run sfx:dry -- --voice-only --live-only   # must print: Nothing to do
```

If either command says anything else, **new lines have been written since this
was updated** — see the next section. If they disagree with each other, your
checkout is stale: stop and pull first.

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
- **Nothing needs re-recording.** Every delivered take stays delivered.
