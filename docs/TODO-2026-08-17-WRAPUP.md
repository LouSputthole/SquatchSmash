# Session wrap-up — 2026-08-17

Supersedes `docs/TODO-2026-08-15-WRAPUP.md` as the resume sheet. Everything the
08-15 sheet listed under "Known open items" is closed; what is left is owner
work and one infrastructure gap.

## Landed on main

| Commit | What |
|---|---|
| `31d82efa` | mansion floor-lookup fix merged (the raycast answers for one storey) |
| `5a5291d6` | siege combat pass merged |
| `fbabc678` | Wave F perf merged (#19–#22) |
| `182cbf4b` | siege perf pass, two probes stop measuring the fountain |
| `3406b383` | **step-over: a lid flush with the floor is containment, not a step** |

### The step-over fix, and what it unblocked

Step-over judged an obstacle on height alone, so the mansion pool's cap — a box
from -0.1 to 1.2 drawn flush with the 1.2 m deck around it — read as a 0 cm step
and waved the player into the empty pool. A box now has to earn the step: it
either stands proud of the floor the world gives him there (the same question
`_stepSupport` asks, so the two stay consistent) or it is over his boot. Fail
both and it is a cap over a hole, and it collides as it did before step-over
existed. The second arm is what carries floor transitions — crossing onto the
Bing's 0.6 m stage, `groundAt` reports 0.6 the instant he crosses the line while
his feet are still easing up from 0.

- `verify:mansion` **298/298** (was 271/298)
- `verify:mansion-siege` **188/188** (was 55 ok / 9 FAIL, exit 1 — the scene was
  unplayable: the horseshoe could not be climbed, so the mission never left
  `TO_OFFICE` and the verifier crashed on an empty `waves.one.standing`)
- `verify:step-over` 9/9, `verify:heist` 73/73, `verify:cartel-palace` 63/63

## Wave B follow-ups — closed

- **Camera-moving weapon recoil now honours reduce-shake** (`src/cartel-palace/main.js`,
  `src/mansion/siege/main.js`). Both kicked `player.pitch`/`yaw` on every shot
  with no reference to the setting. Guarded by a source-scan test in
  `tests/settings.test.mjs`, proven red on the pre-fix code.
- **The bespoke movement handlers read the keymap** (motel, squatchfather,
  initiation, and the shared flight input behind beefrun + enolasquatch). A
  player who moved "forward" off W could not fly at all.
  `src/beefrun/input.js` translates only the four axis keys and the throttle
  Shift — `REBINDABLE` — because Space is the air brake and KeyZ is throttle
  down, and both are also somebody's default jump and somebody's rebound crouch;
  translating those would take a control away from a pilot who never touched a
  flight key. Guarded in `tests/beefrun-mission-rules.test.mjs`, also proven red.

## Housekeeping

- The four merged agent worktrees are removed. Junctions were unlinked first
  (`[System.IO.Directory]::Delete(path, false)` — `cmd /c rmdir` through the
  agent shell silently did nothing); main's `node_modules` verified intact at 79
  entries before and after. The branches survive and are pushed.
- Backlog items **#23 (jungle grounding), #24 (weather seed), #25 (Enola nose-art
  slots), #27 (heist reds), #28 (`Dialogue.hush()`), #29 (recording docs)** were
  each confirmed already closed on main, as was the last unrecorded voice line —
  `VOICE-LINES-NEEDED.md` reads 0 of 3216. The 08-15 sheet listed them as open
  because it predated the merges.

## Still open

- **#26: the graveyard has no dedicated verifier** (gap G10). The one remaining
  backlog item of any size. `graveyard.html` is a staged, routed scene with a
  story module and campaign registration, covered by two unit tests and nothing
  else.
- **Sensitivity slider cosmetic** — 100% sits at ~30% of the track. Deliberately
  not fixed: the store's range is 0.2–3.0, whose geometric centre is 0.775, so no
  linear range containing both ends puts 1.0 in the middle. The honest fix is a
  logarithmic mapping special-cased into a slider path shared with the volume
  control, which is more machinery than a knob position is worth.
- **Owner-gated**: motel + mansion art playtest in the real build, the Initiation
  rewrite, the mansion return presentation, the waterfall ruling, provisional
  voice recasts (roster.html), and the NO WAKE execution-flinch row in
  `docs/FUTURE-EDITS.md`.

## Verifier flakiness worth knowing

`verify:mansion-siege` fails a different single check when it runs while
anything else is loading the machine — measured three times: 188/188 solo, then
a `hitConfirm` red while `npm test` held the cores, then a standoff-distance red
while a worktree removal was churning the disk. Run it alone before believing a
red. One of those checks was genuinely brittle and is now widened: `arrived()`
demanded a flat four metres of closure from every survivor, so a man who began
at 9.25 m had to walk to 5.25 m — nearer than the rail line the scene's own wave
check uses — and one hunter failed it by 11 cm at 6.36 m.
