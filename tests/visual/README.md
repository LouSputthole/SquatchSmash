# Deterministic visual regression

The canonical shots live in `visual-baselines/`. They are deliberately a
small story-and-rendering set, not a screenshot of every room. Each test fixes
the campaign checkpoint, RNG seed, clock, camera, viewport, DPR, time of day,
NPC pose and post-processing state that matter to its frame.

Run the PR smoke shot with `npm run verify:visual-smoke`. Run the whole suite
with `npm run verify:visual`. To propose a reviewed baseline change, run
`npm run verify:visual:update`, inspect every changed PNG, then run the full
suite again without `--update-snapshots`. Never refresh all baselines merely
to make a regression disappear.

On failure Playwright retains its trace plus the failed screenshot/diff. The
test fixture also attaches scene readiness, console errors, page errors,
network failures and a DOM snapshot to the test result directory.

The PR smoke is specifically the regular-apartment WebGL mirror/body/outfit
receipt. It hides the Apartment HUD and developer-preview banner before the
shot because those DOM layers use Windows system fonts that Ubuntu substitutes;
their typography is not part of the mirror contract. Other canonical shots
remain full-page receipts when their UI is intentionally under test.
