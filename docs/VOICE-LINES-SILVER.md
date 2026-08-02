# Front and Center — voice production contract

This document describes the voice system that the Silver Room actually runs.
It is a production guide, not a second line list. The generated
`VOICE-LINES-TODO.md` file is the authority for every recording still needed,
including the exact filename and spoken text.

## Authoritative catalog and runtime

`src/silver/voice-catalog.js` builds the complete catalog by exercising the
authored dialogue trees across their branches, then adding Prospect choices,
Margo and room barks, cutscene beats, and the Midnight Pines set. The current
catalog contains **324 unique exact cues**.

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

- **324** exact cues in the authored catalog and shared manifest.
- **314** exact cue recordings listed in `assets/sfx/index.json` and present in
  `assets/sfx/`.
- **10** missing recordings, all in the Manager bank after his recast to the
  scene-local `npc-male` profile.
- **0** other Front and Center voice pickups.

The previous ten Manager takes used the shared waiter voice. They are retired
from the runtime and kept only for comparison in
`assets/audio/auditions/retired-silver-manager-waiter/`. Do not copy those
takes back into `assets/sfx/`. The `npc-male` casting is a provisional audition
profile and should be approved by the voice lead before the replacement set is
locked.

## Cue-bank counts

A cue bank identifies the character or role in the filename. A recording
profile identifies the cast voice used to make that bank. Keeping those two
concepts separate lets one role be recast without renaming its cues.

| Cue bank | Recording profile | Cataloged | Indexed | Missing |
| --- | --- | ---: | ---: | ---: |
| `announcer` | `announcer` | 1 | 1 | 0 |
| `ape` | `ape` | 11 | 11 | 0 |
| `bandleader` | `waiter` | 6 | 6 | 0 |
| `cellarman` | `waiter` | 3 | 3 | 0 |
| `chef` | `waiter` | 5 | 5 | 0 |
| `coatcheck` | `waiter` | 4 | 4 | 0 |
| `cook` | `waiter` | 4 | 4 | 0 |
| `dishwasher` | `waiter` | 3 | 3 | 0 |
| `driver` | `doorman` | 6 | 6 | 0 |
| `host` | `waiter` | 8 | 8 | 0 |
| `manager` | `npc-male` | 10 | 0 | 10 |
| `margo` | `margo` | 116 | 116 | 0 |
| `photographer` | `waiter` | 3 | 3 | 0 |
| `player` | `player` | 102 | 102 | 0 |
| `porter` | `waiter` | 3 | 3 | 0 |
| `room` | `waiter` | 20 | 20 | 0 |
| `servicebar` | `waiter` | 3 | 3 | 0 |
| `vinny` | `doorman` | 4 | 4 | 0 |
| `waiter` | `waiter` | 12 | 12 | 0 |
| **Total** |  | **324** | **314** | **10** |

The same catalog grouped by recording profile is: `margo` 116, `player` 102,
`waiter` 74, `ape` 11, `doorman` 10, `npc-male` 10, and `announcer` 1.

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

**Manager (`npc-male`, 10 pickups).** Distinct from the shared floor-staff
voice. Controlled authority; never raises his voice. Record or generate all
ten replacements as one matched set after the audition profile is approved.

**Floor and back-of-house staff (`waiter`, 74 cues across twelve banks).** The
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

For the current Manager pickup:

1. Approve or recast the `npc-male` profile in
   `assets/sfx/manifest.json` before committing replacement performances.
2. Use the ten exact Manager filenames and lines under **Voice pickups — The
   Silver Room** in `VOICE-LINES-TODO.md`.
3. For a repo-generated pass, run `npm run sfx:vo -- --cast npc-male`. For an
   outside actor or voice service, place the approved files directly in
   `assets/sfx/` under those exact filenames.
4. Run `npm run sfx:listen` to rebuild `assets/sfx/index.json`, update each
   file's cache-busting hash, and audition the delivered takes.
5. Run `npm run audio:todo` to refresh the generated handoff. The Silver Room
   pickup section should disappear when all ten replacements are indexed.
6. Gate the delivery with `npm run check:silver-vo`,
   `npm run audio:todo:check`, `npm test`, `npm run check`, and
   `npm run verify:silver`.

When dialogue changes, edit the authored Silver scripts first, then run
`npm run vo:silver` and `npm run audio:todo`. Do not maintain a parallel manual
line ledger in this document.
