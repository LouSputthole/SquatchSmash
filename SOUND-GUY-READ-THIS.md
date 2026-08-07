# SOUND GUY — READ THIS FIRST

**There are 111 voice lines left to generate.** If your tools say "Nothing to do — all
cues already exist," **your checkout is out of date.** Every one of the 111 was written
in the last few days and landed on `main` on Aug 6–7, 2026 — before you pull, your
manifest literally doesn't contain them, so the generator is telling you the truth
about an old file.

## Step 0 — get current

```
git checkout main
git pull
```

## Step 1 — see the work with your own eyes

```
npm run sfx:dry -- --voice-only --live-only
```

On a current checkout this prints **`111 cue(s) to generate (0 sound, 111 spoken)`**
followed by every filename and the exact words. If you see any other number, you are
not on current `main` — stop and fix that first.

## Step 2 — generate

```
export ELEVENLABS_API_KEY=sk_...
npm run sfx:vo
```

All 17 voice profiles involved already have ids pasted into the `voices` block of
`assets/sfx/manifest.json` — checked line by line on Aug 7. Nothing is waiting on
casting. The run writes straight into `assets/sfx/` under the correct filenames.

## Step 3 — prove it's done

```
npm run sfx:listen      # rebuilds the index, gives you _listen.html to audition takes
npm run voice:needed    # must now say: 0 lines to record
npm test && npm run check
```

`VOICE-LINES-NEEDED.md` regenerating to **zero** is the definition of done. Not memory,
not a spreadsheet — that command.

## What the 111 are

| Where | Lines | Why they're new |
|---|---:|---|
| NO WAKE (the boat mission) | 37 | The whole mission was redesigned; every line rewritten. **Currently the scene plays fully silent** — this is the top priority. |
| THE TAKE | 30 | Bank-floor hostage/teller lines for the recast HEIST CUSTOMER, plus new prospect and friendly-fire lines. |
| MANSION UNDER SIEGE | 22 | Brand-new mission (wake, briefing, waves, aftermath). |
| PROJECT SILENT SQUATCH | 11 | Gate booth guard, corridor lines. |
| Margo come-home scene | 4 | New apartment beat. |
| Bada Bing party (mirage) | 3 | Willy/Numbskull party lines. |
| SILVER ROOM | 2 | The comedian's second set. |
| ENOLA SQUATCH | 2 | Engine-strain calls. |
| **Total** | **111** | |

The full list — exact `.mp3` filename, the exact words to perform, and per-character
voice direction — is **`VOICE-LINES-NEEDED.md`** in the repo root. It is generated
from the game itself, so it is never stale on a current checkout. One rule decides
what's in it: *if a line is in the game and has no recording, it is there.*

## What NOT to touch

- **Legacy paths** in old spreadsheets/notes — the old IDs are not runtime-compatible.
  `VOICE-LINES-NEEDED.md` is the only list. (96 historical rows are deliberately excluded.)
- **The Initiation party catalog** — already indexed, and its scene isn't reachable yet.
  `sfx:vo` excludes it on purpose; don't force it back in.
- **Nothing needs re-recording.** 3,125 of 3,236 lines are done and stay done. This is
  purely the 111 new ones.
