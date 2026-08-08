# Front and Center — voice production contract

This document describes the voice system that the Silver Room actually runs.
It is a production guide, not a second line list. The generated
`VOICE-LINES-TODO.md` file is the authority for every recording still needed,
including the exact filename and spoken text.

## Authoritative catalog and runtime

`src/silver/voice-catalog.js` builds the complete catalog by exercising the
authored dialogue trees across their branches, then adding Prospect choices,
Margo and room barks, cutscene beats, and the Midnight Pines set. The current
catalog contains **344 unique exact cues**.

The source-to-browser path is:

1. `src/silver/script.js` assigns each speakable line or choice its stable
   `vo.silver.*` cue and maps the speaker bank to a recording profile.
2. `src/silver/voice-catalog.js` derives the exact cue, profile, and spoken
   words from the authored runtime scripts.
3. `npm run vo:silver` synchronizes that catalog into
   `assets/sfx/manifest.json`; `npm run check:silver-vo` fails on a missing,
   stale, or changed Silver cue.
4. `assets/sfx/index.json` lists the recordings the browser may fetch and
   supplies a content hash for cache busting.
5. `src/silver/audio.js` preloads only indexed Silver recordings and the
   scene's music, ambience, footsteps, and shared effects.
6. The Silver runtime plays the exact cue attached to each NPC line,
   cutscene beat, bark, band introduction, and Prospect choice. The attempted
   cue is also written to the runtime VO log for browser verification.

Do not derive filenames from a speaker's position in an old spreadsheet or
from a one-based bank counter. Deliver the exact `.mp3` filename emitted by the
catalog and printed in `VOICE-LINES-TODO.md`. Dynamic dialogue uses stable
variant tags or a text hash so one branch cannot silently inherit another
branch's recording.

Subtitles remain available for every intelligible line. They are the fallback
when an exact recording is absent, not the scene's primary production state:
most of Front and Center is already recorded and wired. When a recording is
present, its actual duration contributes to dialogue hold timing; solo lines
stop the previous solo voice, and dialogue ducks the live performance mix.

## Coverage snapshot

Current Front and Center voice coverage:

- **344** exact cues in the authored catalog and shared manifest.
- **342** exact cue recordings listed in `assets/sfx/index.json` and present in
  `assets/sfx/`.
- **2** missing recordings: the new bandleader stand-up cues.
- **12** indexed featured-waiter files require replacement because their bank
  was owner-recast to `silver-waiter` on 2026-08-08. They are current runtime
  filenames but still contain the previous actor until regenerated.

The show opening was rewritten on the owner's note: "the band is much better,
BUT the 'lady singing thing' must GO." The second warm-up number used to be
Ashland Line, led by `the singer` — a stem-only number with no dialogue and no
built figure singing it, just `band.vocal`'s synthesised tone. It is now the
violinist doing five seconds of stand-up before the band goes straight into
Bananaphone: `vo.silver.bandleader.set.second` ("How are ya? Glad to be
here!") and `vo.silver.bandleader.set.second-wife` ("Take my wife, please…").
Both are new pickups, cataloged under the shared `waiter` profile like the
rest of the bandleader bank. The crowd's reactions to the bit — applause, a
whistle, laughter, a rimshot — are sound-effect cues (`crowd.whistle`,
`crowd.laughter`, `band.rimshot`, plus the existing `applause`), not voice
lines, and are not part of this catalog.

The Manager bank is fully recorded under the scene-local `manager` profile.
The previous ten Manager takes used the shared waiter voice; they are
retired from the runtime and kept only for comparison in
`assets/audio/auditions/retired-silver-manager-waiter/`. Do not copy those
takes back into `assets/sfx/`.

The sixteen added room barks are the dining-room and corridor lines added
because the floor deck was repeating audibly across the seated half of the
evening — thirteen new diners and waiters on the floor, three more in the
corridor. They are subtitled and wired now and read correctly without audio;
they are now recorded under the shared `waiter` profile. **Append to those
two decks, never insert into them:** every room bark is addressed by its
position (`vo.silver.room.floor.N`), the first seven floor takes are already
recorded against those numbers, and `barks()` retires floor line six by index
after its first airing.

## Cue-bank counts

A cue bank identifies the character or role in the filename. A recording
profile identifies the cast voice used to make that bank. Keeping those two
concepts separate lets one role be recast without renaming its cues.

| Cue bank | Recording profile | Cataloged | Indexed | Missing |
| --- | --- | ---: | ---: | ---: |
| `announcer` | `announcer` | 1 | 1 | 0 |
| `ape` | `ape` | 11 | 11 | 0 |
| `bandleader` | `waiter` | 8 | 6 | 2 |
| `cellarman` | `waiter` | 3 | 3 | 0 |
| `chef` | `waiter` | 5 | 5 | 0 |
| `coatcheck` | `waiter` | 4 | 4 | 0 |
| `cook` | `waiter` | 4 | 4 | 0 |
| `dishwasher` | `waiter` | 3 | 3 | 0 |
| `driver` | `doorman` | 6 | 6 | 0 |
| `host` | `waiter` | 8 | 8 | 0 |
| `manager` | `manager` | 10 | 10 | 0 |
| `margo` | `margo` | 118 | 118 | 0 |
| `photographer` | `waiter` | 3 | 3 | 0 |
| `player` | `player` | 102 | 102 | 0 |
| `porter` | `waiter` | 3 | 3 | 0 |
| `room` | `waiter` | 36 | 36 | 0 |
| `servicebar` | `waiter` | 3 | 3 | 0 |
| `vinny` | `doorman` | 4 | 4 | 0 |
| `waiter` | `silver-waiter` | 12 | 12* | 0* |
| **Total** |  | **344** | **342** | **2** |

\* The twelve featured-waiter files are indexed but marked for full recast;
they do not count as approved current performances.

The same catalog grouped by recording profile is: `margo` 118, `player` 102,
`waiter` 80, `silver-waiter` 12, `ape` 11, `doorman` 10, `manager` 10, and
`announcer` 1.

## Performance direction

**Margo Salas (`margo`, 116 cues).** Mid-thirties, works nights, warm and a
little worn rather than bright. She has run the Blue Hour kitchen long enough
to hear rehearsed competence immediately. Her back-of-house observations are
technical judgments, not wide-eyed admiration. Keep the Funny How response
flat and unafraid; the joke fails if she sounds frightened or eager to play
along.

**Prospect (`player`, 102 cues).** He is the established quiet one, not a
finished smooth operator. The act is just beyond his natural reach and works
often enough to keep him trying. These are real voiced choices: the dialogue
runtime fires the selected option's exact cue.

**Ape (`ape`, 11 cues).** Use the same established Ape performer as the rest of
the campaign. He is delighted that he recognizes Margo's diner and is trying,
badly, not to show it.

**Manager (`manager`, 10 cues).** Distinct from the shared floor-staff voice.
Controlled authority; never raises his voice. The set is recorded and indexed.
Any future recut should remain a matched set, not a single line.

**Featured date waiter (`silver-waiter`, 12 cues).** The owner-selected voice
is `gAMZphRyrWJnLMDnom6H`. Regenerate and audition the complete bank before
removing its manifest `recast` marker.

**Floor and back-of-house staff (`waiter`, 80 cues across eleven banks).** The
shared profile is deliberate, while separate cue banks preserve the option to
recast an individual role later. The room barks are overheard work, not lines
addressed to the player. Kitchen calls should cross the space with urgency;
dining-room barks should sit below the date conversation.

**Driver and Vinny (`doorman`, 10 cues).** They share a recording profile but
remain separate banks. The driver is ordinary and tired; Vinny already knows
the Prospect.

**Announcer (`announcer`, 1 cue).** The Midnight Pines introduction is recorded,
indexed, and wired to the show timeline.

## Delivery workflow

`VOICE-LINES-TODO.md` is generated by `npm run audio:todo`. Never hand-edit its
counts, filenames, or pickup text. Fix the authored line, voice profile, or
production state and regenerate the file instead.

For the current featured-waiter recast and bandleader pickups:

1. Use the fourteen exact filenames and lines under **Voice pickups — The
   Silver Room** in `VOICE-LINES-TODO.md`: twelve `vo.silver.waiter.*`
   replacement takes and two `vo.silver.bandleader.set.second*` pickups.
2. Run `npm run sfx -- --force --cast silver-waiter` for the featured waiter.
   The dry run must list exactly twelve cues. Record the two bandleader files
   under the existing shared `waiter` profile.
3. Run `npm run sfx:listen` to rebuild `assets/sfx/index.json`, update each
   file's cache-busting hash, and audition the delivered takes.
4. Run `npm run audio:todo` to refresh the generated handoff. The Silver Room
   pickup section should disappear after both bandleader files are indexed and
   the auditioned waiter profile's temporary `recast` marker is removed.
5. Gate the delivery with `npm run check:silver-vo`,
   `npm run audio:todo:check`, `npm test`, `npm run check`, and
   `npm run verify:silver`.

When dialogue changes, edit the authored Silver scripts first, then run
`npm run vo:silver` and `npm run audio:todo`. Do not maintain a parallel manual
line ledger in this document.
