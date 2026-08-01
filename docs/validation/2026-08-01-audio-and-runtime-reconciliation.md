# Audio and Runtime Reconciliation - 2026-08-01

Scope: active integration branch `codex/recovered-playtest-fixes-20260731`.
This note records the recovery/playtest follow-up that was present locally
after the prior handoff. It is not evidence that `main` or GitHub Pages has
already received the changes.

## Implemented

- Added `assets/music/cosmic-drift.mp3` to the radio manifest with
  `venue: "apartment"`.
- Made `Radio` respect a record's venue. Unscoped legacy records continue to
  play on the apartment radio; an apartment-only record cannot enter another
  music system. The Bada Bing has its own `CLUB_DJ_RECORDS` and does not load
  the apartment radio manifest.
- Added a six-request bounded sample loader and per-scene dialogue preload
  scopes. The apartment loads call/news/wake dialogue; Bing, Beef Run, and
  Silver load their own spoken banks plus shared effects.
- Made resume from the pause overlay skip the first-launch sample decode.
- Removed the Day Two blood-shirt floor pile while preserving the cash and
  Bada Bing matchbook dressing.
- Moved Beef Run fuel-sample interaction footprints outboard of the drains so
  an indicated marker is also a reachable prompt location.
- Routed the Bing DJ-order key and Silver Room checkpoint into preview memory
  when `preview=1`. Bing Two preview loads the six immediate Lou briefing
  recordings first and starts the remaining club preload in the background.

## Direct verification after this pass

| Command | Result |
|---|---:|
| `npm test` | 94 passed |
| `npm run check` | 187 sources and 4 manifests valid |
| `npm run verify:day-two` | 25 passed |
| `npm run verify:big-night` | 19 passed |
| `npm run verify:computer` | 30 passed |
| `npm run verify:beefrun` | 27 passed |
| `npm run verify:bing` | 136 passed |
| `npm run verify:boot-errors` | 8 passed |
| `npm run verify:preview` | 16 passed |
| `npm run verify:squatch-smash` | 8 passed |
| `npm run verify:bundle` | passed |
| `npm run check:flight` | passed |

The Day Two browser check specifically proves: quiet radio at 7 percent,
murder bulletin first, Booskibro's delayed call, no floor-shirt clutter, and
Escape pause/resume. The computer check proves the loader stayed bounded at
six simultaneous requests while the email, Squatch Smash, and DOOM routes
remained usable.

The preview check specifically proves that Bing Two, Squatchfather, Silver
Room, and Initiation can be launched directly without changing the canonical
`squatchlife.campaign` storage record. The normal hosted build serves
`Cosmic Drift`; the deliberately self-contained bundle has a zero music budget
and therefore omits every radio record, not just this one.

## Audio status

Run `npm run audio:todo` before accepting future recording deliveries. At this
checkpoint it reports **20 voice lines and 0 effects**: one Tony/Snow Bada Bing
reply and 19 Captain Sasole Beef Run lines. The exact source text and target
filenames are in `VOICE-LINES-TODO.md`.

## Deliberate deferrals

- Initiation ending rewrite and transformations remain deferred until owner
  playtest; do not treat the existing Initiation outcome as the final ending.
- `docs/AUDIO-AUDITIONS.md` still has three unselected sound-effect candidates:
  glue squeeze, rail clatter, and far train horn.
- A browser verifier that starts from empty storage and physically completes
  every interaction through Initiation has not replaced the current focused
  campaign and scene verification matrix.
