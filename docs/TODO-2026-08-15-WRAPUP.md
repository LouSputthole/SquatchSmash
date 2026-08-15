# Session wrap-up TODO — 2026-08-15

Session ended when the API spend limit killed three agents mid-flight. Main is
green and pushed. This file supersedes `docs/TODO-2026-08-14-WRAPUP.md` as the
resume sheet. Read alongside `docs/audits/2026-08-14-backlog-29.md`.

## Landed on main today (pushed, suite green at each step)

| Pass | Merge | Highlights |
|---|---|---|
| Wave C asset diet | `dfc61a19` | art → jpg/webp, faces downscaled, 155 orphan MP3s pruned, orphan gate strict (allowlist emptied), capture-evidence harness, **53.7 MiB saved** (374.6 → 320.9 MiB) |
| Wave B settings | `18c3464e` | `src/core/settings.js`, pause-menu settings panel, master volume + sensitivity + key rebinding, reduceShake honoured at 12 camera sites, pause menus added to initiation + combatlab, `hush()` for motel + mansion, `verify:settings` (port 54970) |
| Settings review fixes | `8731425f` | all 15 code-review findings against Wave B (see below) |

Also on main: `0d419c56` — eslint now ignores `.claude/` so a root `npm run lint`
stops scanning the agent worktrees (was 185 errors, all from worktree copies;
now 0 errors / 80 warnings). **`npm install` was run** — eslint was in the
lockfile but had never been installed, so `npm run lint` failed for everyone.

Solo verifier reruns the 08-14 sheet asked for: **verify:silvercase 71/71 green**,
**verify:no-wake 78/79** — the one red is `ERR_INSUFFICIENT_RESOURCES` on the
preview-checkpoint load under five parallel Playwright fleets, not a scene defect.
Rerun it alone to confirm.

## Code review of Wave B — 15 findings, all addressed (`8731425f`)

The review fork died on the spend limit before Wave B merged, so Wave B went in
on a targeted manual read only. Re-run afterwards on Opus; it found 15 real
findings and they were fixed forward on main. The notable ones:

- **`src/core/audio.js` (reproduced empirically)** — the constructor subscribed to
  the settings store and threw the unsubscribe away, so every engine ever built
  stayed a live subscriber; `_applyMaster()` dereferenced `this.master` guarded
  only by `this.ready`. In the single-process test runner this threw a TypeError
  per leaked engine on any volume write — **swallowed by `set()`'s try/catch**,
  which is why 1943/1943 was green with the bug in. Now bound from `init()` and
  guarded on `this.master`; regression test proven red on the pre-fix code.
- **Rebinding was broken four different ways**: graveyard's carried-HotDog guard
  compared raw `event.code` (a rebound Jump bypassed the restriction entirely);
  golf only called `setKey` in a `switch` `default:` arm (a dozen keys inert,
  with keyup still clearing them); silvercase never cleared held keys on pause
  (a key held across a rebind stuck forever); mansion-siege rendered the rebind
  buttons and ignored them (it was deliberately excluded from Wave B's wiring).
- **Tab stopped resuming** once the player touched any settings control — the
  `tag === 'INPUT'` bail-out was written for the save-import file picker.
- **`hush()` undermined itself**: the stage-direction arm dropped the take handle,
  so the "killed mid-plea" case it exists to fix could still leave two voices.
- **"Assist" was a no-op in 18 of 19 scenes** — now gated on a scene capability.

Four findings were **partially refuted with evidence** and deliberately not
fixed as written: the `tools/serve.mjs` half of the verifier cleanup (that file
exports nothing and listens on import — every verifier hand-rolls its server for
that reason), the "second drum bed" in initiation (both `startDrums()` and
`init()` already early-return), the suggested hush-in-stage-arm (would break an
existing test asserting the old take may finish under a stage direction), and the
claim that Bing/Silver/apartment had identical impair lines.

Suite after the fixes: **1946/1946**, check green, lint 0 errors,
`verify:settings` 26/26, `verify:boot-errors` 36/36, `verify:golf` 112/112,
`verify:silver` 157/157, `verify:silvercase` 71/71, `verify:no-wake` 82/82.

**LESSON (standing rule, was skipped): run `/code-review` on the diff BEFORE the
merge, not after.** Three of these were in files that had been read by hand.

## Mid-flight — salvaged on worktree branches, NOT merged

All three agents were killed by the spend limit, not by a failure. Each has real
committed progress plus a `WIP salvage: agent killed by spend limit 2026-08-15`
tip. All branches are PUSHED to origin; worktrees left in place with node_modules
junctions intact. Resume by reviewing the branch, finishing per the brief, then
lead-merge → full suite → push → junction-safe removal (`cmd /c rmdir node_modules`
BEFORE `git worktree remove`).

1. **Siege combat pass** — branch `worktree-agent-af148ca8c72f56036`, tip `f5720eac`.
   Fourth run. NOTE: this branch was **rebased onto `b8f98cb4`**, so its commit
   SHAs differ from the 08-14 sheet's (`914f4b3c` era); the remote branch was
   force-pushed with lease after verifying all five original commits survived.
   Scratch probes dropped (`ad06fa69`). WIP touches `mansion-siege.html`,
   `src/mansion/siege/{attackers,main}.js`, `tests/mansion-siege-dressing.test.mjs`.
   It was capturing the corpse evidence frame when killed. Remaining per brief:
   attacker findability (defect 1), corpse ground-snap confirm (3), SFX bed (4),
   Aubbie purge check (9), feel polish (10).
2. **Wave F perf** — branch `worktree-agent-a20ca6764687cc8ba`, tip `86158c44`.
   Landed `0a4b55b8` (shared pixel-ratio cap + adaptive ladder + high-performance
   everywhere — backlog #19/#20). WIP touches `src/beefrun/{airstrip,terrain}.js`
   (#23 jungle grounding) and `tools/verify-beefrun.mjs`. It was writing the
   wiring script when killed. Remaining: #21 collision broadphase, #22 step-over.
3. **Mansion 27 reds** — branch `worktree-agent-a177250d3f1c2bf9d`, tip `d9f531b1`.
   Landed `71f33a5b` ("the floor lookup answers for one storey, so doorways stop
   dropping the player a floor") — a REAL scene bug, not a lying check. WIP touches
   `src/mansion/main.js`, `MansionInterior.js`, `tests/mansion-siege-people.test.mjs`,
   `tools/verify-mansion.mjs`, plus fresh evidence in
   `docs/validation/2026-08-15-mansion-reds/`. It was running the full
   `verify:mansion` with the fixes when killed — **tally unknown, rerun first**.

## Known open items

- **verify:mansion-siege is RED on main: 55 ok / 9 FAIL, exit 1** (confirmed by a
  solo run at `8731425f`; A/B-tested as pre-existing, unrelated to today's work).
  The scene is effectively unplayable: the first failure is *"the horseshoe can be
  climbed on foot ... ground -2.778"*, so the player never reaches Lou's office,
  the mission never leaves `TO_OFFICE`, and the remaining 8 failures cascade from
  it before the verifier crashes at `verify-mansion-siege.mjs:1633`
  (`waves.one.standing` empty).
  **STRONG LEAD — likely already fixed on a salvage branch**: the mansion-reds
  commit `71f33a5b` (branch `worktree-agent-a177250d3f1c2bf9d`) is titled *"the
  floor lookup answers for one storey"* and its message explicitly names **"both
  horseshoe climbs x2"** among the 17 `verify:mansion` reds it fixes — the same
  geometry as the siege's first failure. **Merge/verify that branch FIRST next
  session**; it may clear most of the siege reds for free.
- **verify:mansion** was 271/298 on main at session start; the mansion agent's
  branch claims 17 of those 27 fixed by `71f33a5b`, but its full tally was never
  observed (the agent was killed running it). Rerun on the branch.
- **1 voice line to record**: `vo.motel.prospect.1nexwwk.1` ("Still six. They do
  not breed in there.") — plays as subtitle until recorded.
- **Wave B follow-ups** (from its report): bespoke movement keys don't read the
  keymap (motel, squatchfather, initiation, beefrun/enola flight input); siege
  scene shake + `player.setKey` sites deliberately left to the siege agent —
  **wire the settings into `src/mansion/siege/` once that branch lands**; weapon
  recoil (heist, cartel) not scaled by reduceShake; sensitivity slider's 100%
  sits at ~30% of the track (cosmetic).
- **Enola nose-art manifest registration** — still open; possible since Wave D
  widened VALID_SLOTS. Note `src/enolasquatch/livery.js`'s doc comment still says
  "1024x1536 PNG" (now 628x941 WebP).
- **Mansion return presentation** + Initiation full rewrite — owner-gated writing.
- **First real run of the PR CI job** happens on the next PR — watch it.

## For Lou (owner)

- Playtest the motel + mansion art in the real build (not preview.html).
- New: pause-menu settings (subtitles, big subtitles, reduce shake, assist,
  master volume, mouse sensitivity, key rebinding) on every scene but the siege.
- Standing open decisions still apply (Initiation playtest, waterfall ruling,
  provisional voice recasts — roster.html).
