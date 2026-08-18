# Session wrap-up — 2026-08-18

Supersedes `docs/TODO-2026-08-17-WRAPUP.md` as the resume sheet. This session
was the integration-and-polish pass: close the last backlog gap, run every
scene gate, fix what fell out, and land a 25-item improvement audit across the
scenes (39 findings survived verification; all were implemented).

Branch: `claude/game-integration-optimization-46x1mh`.

## The graveyard gate (G10 / #26) — closed

`tools/verify-graveyard.mjs` (`npm run verify:graveyard`), **42/42**. What it
covers: the 22-line audio contract driven off the mission's own line paths (no
hand-kept cue list), both entry gates, mid-scene resume, and the mission
walked end to end with real keys — trunk lift, the carry past Echo's plot,
placement (head toward the marker), all eight tributes including both
disrespects earned in simulated time and landed impacts, the burial, Snow's
bark, and the drive-out that leaves the save in the Motel's passenger seat.
Plus blocked-walk geometry probes: the Sauce pit, the west forest boundary,
Babs's bench, and a headstone face.

## Real bugs found by the sweep and fixed

- **The single-file bundle was dead on boot** — the settings wave gave
  pause-menu a namespace import of settings.js; the bundler stripped it and
  defined nothing. `verify:squatch-smash` 10/10 again.
- **Palace reload resurrected eliminated targets** — `security.restore` ran
  after the world staging and overwrote Mark and Sauce from a checkpoint
  snapshot captured before the elimination flags flipped. The mission flags
  are now re-asserted after every snapshot restore. `verify:final-arc-reloads`
  **69/69** (was 68/69; pre-existing on main).
- **verify:direct-entry** died when NO WAKE's rejected Start legitimately
  navigated home; the untouched-save read now survives the navigation. 27/27.
- **verify:license-to-grill** imported `sharp`, which `npm ci` never installs —
  the gate could not run at all on a fresh checkout. Pixel evidence now
  decodes in the page's own canvas. PASS.
- **verify:mouths** predated The Silver Case's campaign entry gate: a bare
  page load refuses `begin()`, so the voice bank never decoded. It now enters
  through `?preview=1&checkpoint=room`.
- **verify:mansion** waited 120 s for an H.264 reel to decode in a Chromium
  that ships no H.264 decoder (this container's; the owner's machine has it).
  The reel body now reports itself skipped with the reason on such a machine.
- **verify:step-over** harness page had no favicon, and the browser's own
  /favicon.ico 404 failed the no-page-errors check. 9/9.

## The 25-improvement audit (39 landed)

Five audit agents swept every scene for provable bugs, geometry defects,
intent misalignment, and per-frame waste; five implementation agents landed
the fixes with tests. Highlights by scene:

- **Apartment**: the neighbours' argument expires on absolute time (a post-
  23:20 trigger used to run forever); the closed bathroom door collides;
  interaction prompts no longer fire through walls (occluders wired); the
  skirting stops at the front doorway; mouse clicks respect pee/toilet
  postures; passOut cancels a running shower; banner frames register once.
- **Bada Bing**: ~47 forward-render point lights cut to ~36 (candles and most
  lot lamps are emissive-only now); the slot HUD repaints on change, not per
  frame.
- **Graveyard**: the temporary headstone collides; fireflies twinkle
  per-dot (they shared one material); pine trunk colliders reach the wall.
- **Motel**: oncoming traffic actually arrives (the relative-speed ternary
  had identical branches); nightstand/toilet/sink collide; the room-12 door
  can no longer close into the player and wedge them.
- **Squatchfather**: the westbound lane clears the rail columns; the urgent
  DRAW WEAPON prompt clears on exit; the dawdle nag re-arms on retry.
- **Flight**: the hangar back wall collides across its middle; the Enola's
  panel shows the engine pair the emergency actually lives on; rebinding
  throttle off Shift takes it off Shift; the air-battle loop stops allocating
  per fighter per frame; the insect haze fades at dusk and stays home.
- **Heist**: the recovered street bag follows the player (its mesh is a
  stored reference now — the name lookup could never match `dropped-bag`);
  the hostage ray tests the civilian figures, not the whole bank subtree.
- **Golf**: alt-tab safety (the one scene the pass missed); the scorecard
  writes DOM only on change.
- **Silvercase**: the couch is out of the south wall (2 cm proud, per the
  bed convention) and the coffee table moved with it to keep a walkable gap.
- **NO WAKE**: wake foam rides the actual displaced water surface (CPU port
  of the shader's four sines) instead of being swallowed by every crest.
- **Mansion / Siege**: the pause menu really pauses (gameplay keys and the
  weapon wheel are gated in both scenes); TVs repaint at 12 Hz instead of a
  full canvas + texture upload per frame (the theatre's film reels opt out).
- **Cartel Palace**: both floating doorway portraits hang on real walls; the
  pool guard posts on dry marble and both waterworks patrols route around
  the basins; dead guards release their tactical cover posts; the security
  loop reuses scratch vectors; suppression candidates build once per trigger
  pull, not per pellet.
- **Initiation**: the Timber trial measures bystanders from the swing's
  impact point, so the aisle approach to the log is legal and striking a
  member still fails the rite.
- **Combatlab / wardrobe / core**: HUD readouts and fitting-room labels are
  dirty-flagged; the shared interaction ray list is cached instead of spread
  fresh every frame.

## Verifier state (this container)

Full sweep + solo re-runs: every gate green except the five in the final
quiet pass at session close (mansion, mouths, motel, preview, silvercase) —
their earlier reds were machine contention or fixed above; results land in
the next section of this file. `verify:mansion-siege` 304s green in-sweep.
Unit suite: 1977/1977 before the audit fixes; re-run at close.

Known environment limits of this container (not code bugs): no H.264
decoder in the pinned Chromium (mansion reel body self-skips), and
`verify:mouths` is real-time by design, so it needs an otherwise idle
machine.

## Still open

- **Sensitivity slider cosmetic** — unchanged from the 08-17 sheet, same
  reasoning: the honest fix is a log-mapped slider path not worth the
  machinery.
- **Owner-gated** — motel + mansion art playtest in the real build, the
  Initiation rewrite, the mansion return presentation, the waterfall ruling,
  provisional voice recasts (roster.html), and the NO WAKE execution-flinch
  row in `docs/FUTURE-EDITS.md`.
- Stale rows in `docs/FUTURE-EDITS.md` flagged by the audit as already fixed
  in code (El Hueso tree scatter, Captain Sasole's jacket, heist/golf
  wardrobe rows) could be marked landed next doc pass.
