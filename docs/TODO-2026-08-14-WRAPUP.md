# Session wrap-up TODO — 2026-08-14 morning

Owner called a hard stop ~10:20 CDT. Main is green and pushed. This file is the
resume sheet: what landed, what is mid-flight on worktree branches, and what is
still queued. Read alongside `docs/audits/2026-08-14-backlog-29.md` (the full
29-item backlog) and the memory notes.

## Landed on main today (all pushed, suite green at each step)

| Pass | Merge | Highlights |
|---|---|---|
| Motel overhaul | `3006c91` | shared .45, prompt door, real door/wall collision, verify:motel 82/82 |
| Wave A audio/dialogue | `3992cd0` | golf onLine + audibility gates, Dialogue.hush(), failedCues, forget(prefix) |
| Wave D infra/CI | `d64e068` | PR CI (verify.yml), widened say()/slot/orphan checks, boot-errors 21 pages, asset budgets, eslint cfg, doc fixes |
| Mansion art + return audit | `f6ecf0fd` | 11 dynasty pieces hung + screenshot-verified, return flow audited (mechanically complete 7/7) |
| Wave E robustness | `ab2f0753` | ALL 11 items: Initiation exit relief, Enola AGL warning, save quota banner+retry, save export/import, alt-tab on 6 scenes, heist 73/73 + bing 161/161 (real cause: gown commit fallout), seeded weather (enola drift 0.0), marks/MISSION_IDS bugs fixed, lint 0 errors + wired into CI, boot guards ×3 (boot-errors 36/36 real assertions), Sauce return-gate, apartment forget() |

Suite at `ab2f0753`: **npm test 1929/1929, check green**.
Wave E semantics note: `persistent` now stays true through save-write failures
(retry-not-disable); `saveFailing` is the new signal. verify:no-wake + verify:silvercase
were killed mid-run under parallel load at wrap-up — rerun once, alone; no reds seen.

## Mid-flight — committed on worktree branches, NOT merged

Resume each by reviewing its branch, finishing per its original brief (in the
session transcripts / memory), then lead-merge → full suite → push → junction-safe
worktree removal (`cmd /c rmdir node_modules` BEFORE `git worktree remove`).

Both branches are PUSHED to origin (backup); worktrees left in place with
node_modules junctions intact.

1. **Siege combat pass** — branch `worktree-agent-af148ca8c72f56036`, worktree
   `.claude/worktrees/agent-af148ca8c72f56036`, salvage tip `914f4b3c` (base `8a11b48`).
   Third run of this task (crash, cutoff, hard-stop). Real progress committed:
   foyer centerpiece rebuilt as the table's wrecked corpse (`56dafb8c`), verifier
   pins for sights-up guns + triage prompt markup (`a303098e`); at stop it had just
   visually confirmed the reworked downed state (flat in blood pool, revive prompt)
   and was soaking round 5. Salvage commit holds main.js/verifier WIP + 4 root
   `probe-*.local.mjs` scratch probes (delete before merge). Remaining per original
   brief: attacker findability (defect 1), corpse ground-snap confirm (3), SFX
   bed (4), Aubbie purge check (9), feel polish (10); verify tallies unconfirmed.
   MERGE WATCH: `tests/mansion-siege-people.test.mjs` — main bumped the siege
   light-pool fixture 256→265 (9 new art sconces); do not let the siege branch
   revert it. Also reconcile `tools/verify-mansion-siege.mjs` (both sides edited).
2. **Wave C asset diet** — branch `worktree-agent-a5ef69606e70a2108`, worktree
   `.claude/worktrees/agent-a5ef69606e70a2108`, salvage tip `e42b8252` (base `f6ecf0fd`).
   NEAR-COMPLETE at stop: all conversions done (hog-mama/office/coast → jpg,
   bing hallways/stickers/nose-art → webp, 7 family portraits re-encoded, faces
   downscaled), all 155 orphan MP3s deleted + index.json regenerated, strict
   orphan gate GREEN; it was in its final full `npm test` when stopped. To land:
   rerun `npm test` + `npm run check` + CHECK_SFX_ORPHANS=1, verify:art/mansion-art,
   boot+screenshot bing/squatchfather/mansion (converted images must render — a
   broken path shows as missing texture), eyeball the webp conversions, delete the
   committed `.diet-tmp/` scratch dir before merge, then merge.

## Queued — not started

- **Wave B settings pass** (backlog #2+#4): promote the Silver Room accessibility
  model (subtitles/bigSubtitles/reduceShake/assist, silver/main.js:188-215) into
  src/core/settings.js + pause menu across all 20 scenes; add master volume,
  mouse sensitivity, key rebinding. Was blocked on the siege agent (scene files).
  Also fold in: hush-equivalent for motel + mansion dialogue controllers
  (Wave A handoff), and mansion/motel scene wiring notes from Wave A's report.
- **Wave F perf pass** (backlog #19-23): shared pixel-ratio helper + adaptive
  downgrade, powerPreference in combatlab/initiation, player-collision broadphase,
  step-over for low obstacles, beefrun jungle grounding. Was blocked on siege
  (core/combat adjacency).

## Known open items

- **verify:mansion = 271/298 on main** — 27 PRE-EXISTING failures (armory/shotgun,
  interior walk routes, balcony rail, pool-performer). Predate today; likely the
  siege pass's domain. Diff-verified identical on clean `e50ba8f`.
- **1 voice line to record**: `vo.motel.prospect.1nexwwk.1` ("Still six. They do
  not breed in there.") — listed in VOICE-LINES-TODO.md, plays as subtitle until
  recorded.
- **Mansion return presentation** (owner-gated writing): the three-fact briefing
  is a HUD toast, spec says played scene w/ VO (no return VO namespace exists);
  Initiation full rewrite still owner-gated (exit relief is Wave E's minimal fix).
- **Enola nose-art manifest registration** — now possible after Wave D's
  VALID_SLOTS widening; small follow-up, see Wave D report.
- **eslint**: config landed; red on the 2 real bugs until Wave E fixes them, then
  wire into check/CI (comment in verify.yml).
- **First real run of the PR CI job** happens on the next PR — watch it.

## For Lou (owner)

- Playtest the motel + mansion art in the real build (not preview.html — it
  cannot see campaign state; Wave E adds a return-visit preview link).
- The dynasty art placement map + screenshots: `docs/validation/2026-08-13-mansion-art/`.
- Standing open decisions from earlier sessions still apply (Initiation playtest,
  waterfall ruling, provisional voice recasts — roster.html).
