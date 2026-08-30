# The dialogue sheet

Every spoken line in the game, in one place, with rewrites beside the ones that
are coasting.

**Open `SQUATCH-SMASH-DIALOGUE.xlsx`.** Everything else in this folder either
feeds it or falls out of it.

```
npm run dialogue:sheet     # rebuild the whole workbook
npm run dialogue:csv       # CSV + JSON only, no Excel dependency
```

## What the tabs are

| Tab | What it holds |
|---|---|
| **PUNCH-UP** | The working document. Each scene gets a diagnosis, then its weakest lines with the current text, what is wrong with it, and five rewrites. **This is the tab to sit with.** |
| **ALL DIALOGUE** | All 3,433 spoken lines. Filterable by scene, character, recorded/unrecorded, flag. |
| **FLAGGED** | The subset a heuristic thinks is coasting — filler, HUD-speak, one-word answers. A flag is a prompt to look, not a verdict. |
| **BY SCENE** | Counts. Lines, flagged, punched up, recorded, unrecorded. |

## The five columns of rewrites

Every punched-up line gets the same five, so you can read across a row and hear
the same beat five ways:

- **House rewrite** — the recommended fix. Same length and shape as the current
  line, so it drops into the scene without re-timing anything.
- **Tarantino** — long, digressive, circles the threat instead of stating it.
  The menace is in how long the man is willing to keep talking.
- **McDonagh** — blunt, cruel, funny in the same breath. Everyone is sincere and
  slightly stupid, profanity is punctuation, and the punchline is usually bleak.
- **Houser (GTA)** — corporate and commercial language in a criminal mouth.
  Everything is a market, a liability, a performance review.
- **Coen** — flat, over-polite, banal in the face of horror. Trails off. Says
  "well" a lot. The scariest of the five when it lands.

**Fill in the PICK column** with the one you want and I will cut the takes to
match. Mixing is fine and usually better — a Coen answer to a Tarantino question
is a real scene.

## Doctrine decisions resolved in the live script

These rows remain in the sheet as decision history. Their live successors are
the accepted copy, so they must never be treated as outstanding recording work:

- `heist.prospect_counterstrike` — retired 2026-08-28; the live successor is
  `heist.prospect_lobby_quiet`, which keeps the bank sequence inside Tony's
  physical experience instead of naming a real game mid-standoff.
- `vo.siege.prospect.little_friend` — the stable cue id remains for saves and
  takes, but its live text is now an original threat rather than the film quote.
- `vo.bing.hang.hogmama.tony.1` — deliberately kept: Hog Mama is an
  in-world comedian who has just offered to make Tony into a literal bit.
- `vo.door.hint.piss.1` — the cue id remains stable, but the accepted live line
  no longer speaks the keybind; the HUD owns the control instruction.

`docs/TONE-AND-PARODY.md` rules out the retired heist/movie/HUD wording. The
Hog Mama exchange is the explicit exception because the profession and setup
make “bit” literal inside the scene.

## When a pick is accepted

Filling in PICK is not the end of it — the line has to reach the booth. The
2026-08-19 pass is the worked example of the whole route:

1. **The words change at their source, not in the manifest.** Almost every
   spoken line is authored in a scene file (`src/bing/script.js`,
   `src/squatchfather/dialogue/dialogue.json`, `src/core/stations.js`, …) and
   derived into `assets/sfx/manifest.json` by that scene's `tools/*-vo.mjs`.
   Edit the manifest and the next `npm run vo:sync` overwrites you.
2. **Some cue ids change with the words.** Cue ids under `vo.bing.full.*` and
   `vo.silver.*` embed an FNV hash of the line, so new words mean a new id and
   therefore a new filename. Those need no marking — the new cue has no
   recording, so it appears in `VOICE-LINES-NEEDED.md` on its own. Their
   superseded takes are dead files and get deleted; `assets/sfx/rerecord.json`
   records what they were under `retired`.
3. **Every other changed line has to be marked, or the booth sheet lies.** A
   stable cue id keeps its filename, so the old take stays indexed and every
   report keeps saying the line is done. Add it to `lines` in
   `assets/sfx/rerecord.json`; `npm run vo:rerecord` stamps `needsRerecord`
   onto the manifest and both `VOICE-LINES-NEEDED.md` and `VOICE-LINES-TODO.md`
   pick it up as **[RE-RECORD]**.
4. **The queue lives outside the manifest on purpose.** A scene generator
   rewrites its whole manifest block, so a flag typed into the manifest is
   silently dropped the next time anybody runs `npm run vo:golf`. `vo:sync`
   ends with `vo:rerecord` to put them back, and `npm run check` fails on any
   queued line that is not marked.
5. **Remove the entry once the replacement take is indexed.** The queue is a
   list of debts, not a history.

```
npm run vo:sync        # regenerate every scene's cues, then re-stamp the queue
npm run vo:rerecord    # stamp the queue on its own
npm run check:rerecord # report drift without writing
npm run voice:needed   # what the booth actually has to say
```

## How to change what is in here

Do not edit the workbook and expect it to survive — it is generated.

- **Wrong or missing rewrite?** Edit the scene file in `punchups/`. Keyed by cue
  id; the generator warns if a key does not match a real cue.
- **A line's current text changed?** It comes from `assets/sfx/manifest.json`.
  Fix it there and rerun.
- **Want a scene covered that is not yet?** Add a file to `punchups/` in the same
  shape: `scene`, `reference`, `diagnosis`, `lines[]`.

## What has shipped

The PUNCH-UP tab's Status column is the record. As of 2026-08-19, 47 picks are
**ACCEPTED** and queued for the booth: 36 marked for re-recording under their
existing filenames, 11 retired to new cue ids.

Three new 97.8 THE SQUATCH ad breaks were written at the same time — Lou's
jerky, the attorney, and the dealership — and the station's ad slot now
rotates instead of looping one commercial. All three are indexed, so their 20
lines are on the booth sheet, but they carry `live: false` in
`src/core/stations.js` and stay off the running order until their takes are
delivered. An ad that airs before it is recorded is sixty seconds of silence,
and NO WAKE preloads this station and is gated on never doing that. Flip `live`
to true once the files are in `assets/sfx/index.json`.

## What is not covered yet

166 lines of 3,433 have written variants. That is the triage — the marquee scenes
and the worst offenders. `Bada Bing` (489 lines), `The Silver Room` (354) and
`Silver Pines` (353) have systemic problems described in their diagnoses that
affect far more lines than are individually listed: the Prospect answers waiters,
bosses and doormen in the same flat register everywhere he appears. Pick a
direction on the listed ones and the rest of each scene can be brought up to it
in one pass.
