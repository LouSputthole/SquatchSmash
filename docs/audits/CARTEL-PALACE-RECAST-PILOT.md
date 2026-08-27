# Cartel Palace Recast navigation pilot

Date: 2026-08-27

Scope: Cartel Palace NPC physical movement only

Package: `recast-navigation` 0.43.1 (MIT)

Conclusion: **merge the Palace-only integration**

## Question and guardrails

This pilot answers one question: can a Palace NPC reach a position already
selected by the existing AI without orbiting the player, vibrating against
geometry, freezing after an alarm, or walking into furniture?

Recast does not own perception, shared contact memory, suppression, firearm
behavior, tactical scoring, cover selection, authored boss phases, or actor
separation. `PalaceSecurity` still selects every destination. Recast supplies
only the next short route leg, and the existing `AabbCombatSpace` still sweeps
that leg against live doors, furniture, bodies, and other colliders. A failed
or unavailable navigation runtime falls back to the previous direct/detour
movement. No other scene imports the package.

The upstream project is [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js)
and its [official documentation](https://docs.recast-navigation-js.isaacmason.com/)
describes the ESM/browser API used here.

## Reproducible method

`tools/cartel-palace-recast-pilot.mjs` starts the real Palace page in Chromium,
opens the live route doors, extracts the scene's 78 actual colliders, and runs
fixed-step comparisons at 60 Hz. Run it with:

```text
npm run pilot:cartel-palace-recast -- --json
npm run pilot:cartel-palace-recast -- --write-asset
```

The latter command regenerates
`assets/navigation/cartel-palace-navmesh.bin`. The checked-in asset was built
from 612 vertices and 914 triangles. The browser imports that binary; it never
generates the navmesh on the player's main thread.

The existing column below is the former `PalaceSecurity._moveWithDetour`
behavior. Integrated is the exact live adapter now wired through
`PalaceSecurity._moveToward`. A run is successful only when the actor reaches
the target within 45 seconds.

## Results

| Scenario | Existing movement | Integrated Palace navigation | Result |
|---|---:|---:|---|
| Distant guard answers an estate alarm | 17.700 s, 0 blocked frames | 17.700 s, 0 blocked frames | Equal |
| Service-wing doorway | **failed at 45.000 s**, 2,298 blocked frames / 4,465 blocked moves | **18.717 s**, 5 blocked frames / 7 blocked moves | Recast fixes a real route failure |
| Authored cover post | 11.933 s, 12 blocked frames | 11.383 s, 8 blocked frames | 0.550 s faster, fewer blocks |
| Return after stale contact | **failed at 45.000 s**, 1,741 blocked frames, 44 reversals | **19.583 s**, 12 blocked frames, 0 reversals | Recast fixes freeze/oscillation |
| Two guards answer one alarm | 25.667 s, 0 reversals, 0.58 m minimum separation | 26.917 s, 0 reversals, 0.58 m minimum separation | 1.250 s slower; separation contract preserved |

The offline raw Recast paths independently reached all four single-actor
targets in 11.567–18.359 seconds with zero collider contacts and zero
reversals. The live result is authoritative because it retains the game's
doors, collision sweeps, and actor behavior.

The stale-contact probe also exposed a selection gap rather than just a path
gap: after the 14-second shared contact expired, the old update branch stopped
selecting any destination. Guards now select their authored post at that seam;
Recast only solves the physical route back to it.

## Runtime and deployment cost

Measured in the same 2026-08-27 browser run:

- Checked-in navmesh: 32,400 bytes.
- Palace-only vendored runtime plus navmesh: 1,145,750 decoded bytes.
- Local HTTP transfer reported by Chromium: 1,146,950 bytes.
- Browser WASM-compat initialization: 1,574.9 ms, started behind the mission
  menu.
- Binary fetch/import/query construction: 354.0 ms.
- Live navigation: 67 queries, zero query failures, 6,743 movement steps.
- Average path query: 0.0821 ms; total query CPU: 5.5 ms.
- Path following calculation: 0.000506 ms per simulated frame in the isolated
  measurement.
- Node-side generator initialization: 29.243 ms; navmesh build: 103.457 ms.
- Node RSS delta: +5.457 MiB after initialization and +13.211 MiB after the
  build. This is a generator-side measurement; Chromium did not expose a
  reliable per-module heap figure.
- Full npm development package: 2,346,990 bytes. It remains a development-only
  dependency and is not required by GitHub Pages.

The worst successful integrated movement probe used 0.0362 ms of test CPU per
simulated frame. The authored-cover case increased from about 0.0272 to
0.0318 ms per frame; other measured live cases were equal or cheaper because
they no longer spent thousands of frames grinding against geometry. This is
not a meaningful frame-time regression in the bounded Palace workload.

The normal no-build architecture is preserved. The Palace adapter imports its
vendored ESM runtime by relative path; the two upstream package specifiers in
that runtime were likewise redirected to checked-in relative files. Pages
serves the checked-in JavaScript and binary directly and does not run
`npm install`, and `npm test` still works with no package tree installed.
The upstream MIT license is retained in `vendor/recast-navigation/LICENSE`.

## Merge decision

The pilot is clearly better on the bounded question: two previously failing
routes now complete, the cover route improves, the normal alarm route is
unchanged, guard separation remains at the configured 0.58 m, and no live
browser, console, network, or query error occurred. The integration therefore
ships in Cartel Palace only.

The pilot does **not** justify a wider rollout. The 1.09 MiB decoded runtime
and roughly 1.9-second cold initialization are acceptable behind this late-game
mission menu but should be remeasured before another scene adopts it. Perception,
combat reactions, shooting, boss logic, tactical scoring, and all non-Palace
movement remain untouched.

## Acceptance evidence

- `tests/cartel-palace-navigation.test.mjs` checks the checked-in service-wing
  route and stale-contact return contract.
- `tools/verify-cartel-palace.mjs` waits for the actual runtime, verifies the
  navmesh and vendored module requests, then exercises the normal player path.
- `tools/cartel-palace-recast-pilot.mjs --json` reports the measurements above
  and exits red if an integrated scenario fails.
- The verifier retains dynamic Box3 collision, multi-actor separation,
  checkpoint, firefight, retry, renderer, console, and network checks.
