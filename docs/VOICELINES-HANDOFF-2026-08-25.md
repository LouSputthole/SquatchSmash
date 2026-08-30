# Voice + sound handoff — `voicelines-20260825`

**For the dev doing the merge.** This branch is cut from `origin/main` and has
been merged up to it, so it should go in with no conflicts. Everything below is
verifiable with the commands given; nothing here asks to be taken on trust.

## Merge it

```sh
git fetch
git checkout main
git pull
git merge origin/voicelines-20260825
npm ci                     # only if your node_modules is stale
npm test && npm run check
```

If `git merge` reports conflicts, they will be in exactly three generated
files — `assets/sfx/manifest.json`, `VOICE-LINES-NEEDED.md`,
`VOICE-LINES-TODO.md` — because `main` moved again after this branch was last
brought up to date. Do not hand-merge them. Take `main`'s side and regenerate:

```sh
git checkout --ours assets/sfx/manifest.json VOICE-LINES-NEEDED.md VOICE-LINES-TODO.md
npm run sfx:legacy         # re-stamps the 53 promoted effect cues
npm run sfx:listen         # rebuilds index.json and the audition page
npm run audio:todo && npm run voice:needed
git add -A && git commit
```

One manifest hunk does **not** regenerate: the `_note` on the `motel-rico`
voice. `main` still warns there that Rico's takes are the old performer. They
are not, as of this branch. If you take `main`'s side of the manifest, that
warning comes back and `npm test` will tell you so.

## Verify it

Every claim on this page is one of these commands. They should all be clean
after the merge.

```sh
npm run voice:needed       # -> 0 lines to record across 0 voices
npm run check:takes        # -> 0 stale, 0 stale voice
npm run check:infer        # -> every take resolved, none stale
npm run check:legacy-sfx   # -> 53 promoted cues match
npm test                   # -> 3236+ pass, 0 fail
npm run check              # -> All good
```

`tests/global-geometry-evidence-contract.test.mjs` has one junction test that
goes red under machine load and passes in isolation. If that is your only
failure, re-run it alone before believing it.

## What is in it

### Recordings — all machine-generated, all unauditioned

| | |
|---|---:|
| Cartel Palace finale (three-stage Mark fight) | 40 |
| Re-records whose script had changed | 3 |
| Rico, re-rendered on the id the owner supplied | 39 |
| Takes that were the wrong performer (see below) | 27 |
| New lines that arrived with the last merge | 14 |
| Motel + campground sound effects, first recordings | 53 |
| Takes recovered from an unpushed local branch | 142 |

**Nobody has listened to any of it.** Open `assets/sfx/_listen.html`. The blocks
worth a human ear first are the Palace finale (Lola and Johnny are a recast, so
a wrong read hides best there) and the waiter's sixteen.

### Effects that had never been recorded at all

`assets/audio/sound-queue.json` had described every noise the Jerky Motel and
the campground rampage make since before the shared manifest existed, and
`assets/audio/README.md` had been saying "promote an approved brief to the
manifest first" the whole time. Nobody ever did, so both scenes were
synthesising sixty fully-described sounds out of two oscillators.

53 are now real recordings, reached through the `playSample` guard both modules
already used. `tools/legacy-sfx` owns the promotion table and `npm run check`
enforces it. The rest are deliberate: 16 already preferred a recording, 3 were
wired to takes that already existed and are the same sound, 1 was a second brief
for one code path, and the 0.1s subtitle tick and 0.3s select blip stay
synthesised — both are under the sound API's half-second floor and an
oscillator beats a generative model at a tick.

### The performer problem, which was bigger than one character

The owner asked whether Rico shared a voice with two other characters. He did
not, but his casting was replaced anyway — and **changing an id in the manifest
does not touch the mp3s.** All 39 of his takes were still the old performer,
with every gate green, because `takes.json` could only judge the 82 takes it had
rendered itself. The other 3,926 were `assumed`: no performer recorded, nothing
to compare.

That fact was never lost. Every take is a committed file, and the manifest at
the commit that last wrote it says what its profile resolved to at render time.
`tools/infer-takes.mjs` reads it back. All 3,926 resolve; none are unresolvable.

Doing that turned up **27 more takes in the wrong voice**:

| Profile | Takes | What happened |
|---|---:|---|
| `waiter` | 16 | Recast 2026-08-04 on one branch; takes recorded 2026-08-05 on another where the old id was still current; the 2026-08-08 merge took the new casting and kept the old recordings. Neither commit is an ancestor of the other, so no ordering check could catch it. |
| `npc-male` | 7 | Shared one generic id with the two below before being given a distinct voice. |
| `announcer` | 2 | Was on ElevenLabs' stock "Adam" voice. |
| `heist-manager` | 1 | See `npc-male`. |
| `heist-customer` | 1 | See `npc-male`. |

All 27 re-rendered. Every take in the game now knows who spoke it.

`voiceDrift` in `tools/take-ledger.mjs` now judges `inferred` entries as well as
`rendered` ones — a backfill the check ignores is decoration. Confirmed by
faking a `waiter` recast and watching it name the stale takes it had been silent
about.

**`inferred` is deliberately weaker than `rendered`** and each entry carries the
commit it came from, so any one can be checked by hand:

```sh
git log -1 --format=%H -- assets/sfx/<file>.mp3
git show <that commit>:assets/sfx/manifest.json | grep -A2 '"<profile>"'
```

The one case it gets wrong is documented in the tool: a commit that rewrote an
mp3 *and* moved its profile's id together would credit a stale take as fresh.
That direction is chosen — a false "fresh" leaves the status quo, a false
"stale" sends somebody to re-record a take that was already right.

### A Windows fix

`tests/ci-dependency-free.test.mjs` used `new URL('../', import.meta.url)
.pathname`, which is `/C:/…` on Windows, so `resolve()` built `C:\C:\…` and the
file threw before a single assertion ran. `fileURLToPath` instead. Third
instance of this bug in the repo.

## What is NOT in it, and why

- **`main` on the owner's machine is 71 commits behind its own remote and 3
  ahead.** Everything worth keeping from those 3 is on this branch: 99 takes
  nothing upstream had, and 43 more that both sides had where the local bytes
  were newer (script and casting verified byte-identical on both sides before
  swapping, so it is the same words in the same voice, rendered later).
- **"Two paths that only exist on Windows"** is superseded — `origin/main` fixed
  both files independently, with `portableSourcePath` and its own
  `fileURLToPath`. Nothing to port.
- **18 retired `short-one` takes.** That character is now `lola` and `johnny`,
  recorded fresh. The old files are dead under a retired name.

## The ad breaks are on air

Three 97.8 THE SQUATCH ad breaks — `jerky`, `attorney`, `dealership` — were
written, recorded and indexed months ago and had sat at `live: false` in
`src/core/stations.js` ever since, so the slot kept playing the one break that
was already on air while twenty delivered lines went unheard. All three are now
`live: true`.

That flag is not decoration. `src/core/radio.js` filters on it twice: once so a
break that cannot air is never preloaded, and once at line 662 where the live
breaks are the round-robin pool. With four live, every break airs before any of
them repeats, and which one is next survives a save.

No recording was needed. All 24 segments across the three were already indexed,
and `npm run radio:cues` — which derives the radio's manifest entries from
`stations.js`, so they cannot drift when somebody rewrites a line — reported
275 radio lines already in sync after the flip.

## Nothing is outstanding

At the time of writing, with every filter off — no `--live-only`, no exclusion
of the unreachable Initiation party catalog:

```
manifest cues 4607 | spoken 4022 | cues with no file: 0 | flagged for re-record: 0
```

`main`, `origin/main` and this branch all report zero. If you are looking at a
number larger than that, check `git status -sb` for "behind N" before believing
it — a stale checkout is the single most reliable way to get a wrong answer out
of these commands, and it produced two confident wrong answers while this branch
was being built.
