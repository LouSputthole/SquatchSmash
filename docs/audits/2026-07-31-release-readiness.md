# Release readiness — 2026-07-31

## Published base

- Repository: <https://github.com/LouSputthole/SquatchSmash>
- Canonical branch: `main`
- Verified published commit: `acd6a9b0c4444d1117ef0af081075663029d5d88`
- Pages: <https://lousputthole.github.io/SquatchSmash/>
- Latest Pages workflow at the audit start: <https://github.com/LouSputthole/SquatchSmash/actions/runs/30655948229>

The former integration/status refs converge with `main`. The only remaining
open pull request at audit start was draft PR #4. Its four commits are already
present on `main` as equivalent stable patches, so it must be closed as
superseded rather than merged a second time.

## Fresh verification

Run locally against the published base plus this branch's test-only Day Two
world-matrix correction:

```text
npm test                       87/87 passed
npm run check                  185 source files, 4 manifests, all good
npm run check:flight           all flight envelopes passed
npm run verify:day-one         35/35 passed
npm run verify:day-two         22/22 passed
npm run verify:big-night       19/19 passed
npm run verify:computer        29/29 passed
npm run verify:squatch-smash    8/8 passed
npm run verify:boot-errors      8/8 passed
npm run verify:preview         16/16 passed
npm run verify:beefrun         22/22 passed
npm run verify:motel           37/37 passed
npm run verify:squatchfather   31/31 passed
npm run verify:initiation      10/10 passed
npm run verify:bing-two        10/10 passed
npm run verify:bing           123/123 passed
npm run verify:silver-story    20/20 passed
npm run verify:silver         112/112 passed
npm run verify:art             50 art pieces checked, all good
npm run verify:bundle           3 CSP policies passed; 295 voice clips embedded
npm run audio:todo             259 voice lines, 17 effects remain
```

The Day Two verifier correction calls `scene.updateMatrixWorld(true)` after
its synthetic camera movement and before raycasting. It prevents a false
negative where the visible/reachable bed was probed through stale world
matrices; production interaction code was unchanged.

## Release disposition

- Ready to merge: the release-hygiene documentation and Day Two verifier
  correction once this branch's focused recheck is green.
- Ready to deploy: Pages already serves the preceding canonical commit and
  should be rechecked after merge.
- Intentionally deferred: the Initiation ending. It is playable and routed
  from the apartment, but its current membership ending stays unchanged until
  the owner playtests it. The approved future rewrite is accomplishment review,
  failed rival deaths, Tony's verdict, and human-to-sasquatch transformations
  for Tony and the recognized Family.
- Content backlog: the generated recording queue above, Margo's final voice
  recast, seven Family face photos, Rico/Chino dialogue, and Beef Run cockpit
  interior presentation.
