# Session wrap-up TODO — 2026-08-15

Session ended when the API spend limit killed three agents mid-flight. Main is
green and pushed. This file supersedes `docs/TODO-2026-08-14-WRAPUP.md` as the
resume sheet. Read alongside `docs/audits/2026-08-14-backlog-29.md`.

## Landed on main today (pushed, suite green at each step)

| Pass | Merge | Highlights |
|---|---|---|
| Wave C asset diet | `dfc61a19` | art → jpg/webp, faces downscaled, 155 orphan MP3s pruned, orphan gate strict (allowlist emptied), capture-evidence harness, **53.7 MiB saved** (374.6 → 320.9 MiB) |
| Wave B settings | `18c3464e` | `src/core/settings.js`, pause-menu settings panel, master volume + sensitivity + key rebinding, reduceShake honoured at 12 camera sites, pause menus added to initiation + combatlab, `hush()` for motel + mansion, `verify:settings` (port 54970) |

Also on main: `0d419c56` — eslint now ignores `.claude/` so a root `npm run lint`
stops scanning the agent worktrees (was 185 errors, all from worktree copies;
now 0 errors / 80 warnings). **`npm install` was run** — eslint was in the
lockfile but had never been installed, so `npm run lint` failed for everyone.

Solo verifier reruns the 08-14 sheet asked for: **verify:silvercase 71/71 green**,
**verify:no-wake 78/79** — the one red is `ERR_INSUFFICIENT_RESOURCES` on the
preview-checkpoint load under five parallel Playwright fleets, not a scene defect.
Rerun it alone to confirm.

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

- **verify:mansion** was 271/298 on main at session start; the mansion agent's
  branch has fixes whose tally was never observed. Rerun on the branch.
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
