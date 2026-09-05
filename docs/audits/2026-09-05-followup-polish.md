# SquatchSmash follow-up polish — 2026-09-05

Selected work: items **1, 2, 3 and 5** from the follow-up list. Branch:
`codex/campaign-polish-20260905`, based on the earlier progression-polish
commit `1932622c`. These changes are local; publication is not part of this pass.

## Player-facing changes

- **1 — James Blond tools:** the tenderizer winds up and strikes, the ice bucket
  lifts and tips, the tongs reach forward, and the sauce bottle turns to pour.
  Each lands on the existing contact frame; hits, pressure and route outcomes
  retain their authored rules. Delivered water, pouring and metal Foley replace
  the generic whip impact for those implements. Misses explain whether to move
  closer or face Blond.
- **2 — Call notes:** a finished call leaves a readable briefing on the phone
  and under **Pause → Save data → Call notes**. Notes persist through reload
  and save export/import. The wheel browses notes without switching inventory;
  E advances longer pages or returns home. Reading notes clears the obstructing
  world prompt in the home scenes. Unanswered and interrupted calls earn no
  notes; old saves do not invent a conversation history.
- **3 — Save feedback:** a successful milestone displays **Progress saved**,
  clear of the held-item HUD. Pause shows the last successful save time,
  scene and checkpoint. Routine clock/radio updates do not repeatedly toast.
  Storage failures retain the previous receipt and state plainly that export
  backs up only the last successful save. Preview and memory-only storage
  receive different wording.
- **5 — Mirror work:** the shared planar mirror skips reflections when its
  glass is outside the camera view, on a hidden ancestor or excluded by camera
  layers. Partially visible glass continues rendering, and looking back
  refreshes the reflection immediately at unchanged resolution and quality.

Campaign schema **v28** adds bounded, normalized briefing and receipt metadata.
The five existing Phone composition roots receive their current campaign.
The standalone arcade bundler supplies inert campaign-feedback adapters, so
its shared pause menu still builds and runs.

## Browser proof

`node tools/verify-followup-polish.mjs` stages an apartment checkpoint past
the cold-open reveal, then uses the real ray, E key and mouse wheel. Lou's
recorded call finishes at its normal playback rate. The check confirms that
no note exists early, a successful write is visible, the phone and pause menu
show the briefing, and an ordinary reload retains it. A separately labelled
test caller completes a short call to prove two-note wheel selection.

In the Bing, a real door interaction and four real cart pickups lead to
out-of-range mouse attempts, range feedback, distinct animated impacts, and
Q put-downs. Authored dialogue timing is advanced only to stage the optional
room; the interaction and tool handlers are not called directly as input proof.
No page errors, console errors or failed requests occurred in the final run.

Evidence in this checkout:

- [Phone notes](../../../artifacts/followup/phone-call-notes.png)
- [Pause notes and last successful save](../../../artifacts/followup/pause-save-and-briefing.png)
- [Save acknowledgement](../../../artifacts/followup/progress-saved.png)
- [Ice bucket](../../../artifacts/followup/blond-ice-motion.png),
  [tongs](../../../artifacts/followup/blond-tongs-motion.png),
  [sauce](../../../artifacts/followup/blond-sauce-motion.png),
  [tenderizer](../../../artifacts/followup/blond-tenderizer-motion.png)
- [Input and error log](../../../artifacts/followup/browser-proof.log)

## Mirror measurement

Actual WebGL draw calls and reflection-camera renders were counted over 40
frames per view in Chrome, WebGL 2, 1280×720, RTX 4080 / ANGLE D3D11.

| View | Before draw calls | After draw calls | Reflection passes before → after | Median sampled frame time before → after |
| --- | ---: | ---: | ---: | ---: |
| Looking at the mirror | 102,000 | 102,000 | 40 → 40 | 10.7 → 10.7 ms |
| Turned away | 74,360 | 38,120 | 40 → 0 | 7.1 → 3.7 ms |

The away view used **48.7% fewer draw calls**. This is a stationary, view-specific
sample, not a game-wide FPS claim. GL errors were zero and browser errors were
empty. These were direct WebGL counter measurements, not a Spector capture.
[Before](../../../artifacts/followup/mirror-before.json) ·
[After](../../../artifacts/followup/mirror-after.json)

## Validation

Final full unit run: **3,963/3,963 passed**, zero failures, cancellations or
skips; 380.6 seconds. [Complete log](../../../artifacts/followup/full-test-release.log).

Focused phone, save, bundle and tool tests: **59/59**. They cover call completion,
interruption, deduplication, v27 migration, ordinary reload, export/import,
failed-write receipt preservation, display-listener failure, navigation and
finite spatial audio coordinates. Mirror tests cover offscreen, hidden-parent,
return-to-view and partially-visible behavior.

| Command | Observed result |
| --- | --- |
| `npm run verify:geometry` | 100/100 states; 678,788 records; 0 violations/configuration errors; 194,237 existing suppressions |
| `npm run verify:campaign-marathon` | 27 handoffs, durable landings and reload proofs; finale ready |
| `npm run verify:day-one` / `verify:day-two` | 45/45 and 31/31 |
| `npm run verify:bing` / `verify:bing-two` | 171/171 and 38/38 |
| `npm run verify:license-to-grill` | 73/73 |
| `npm run verify:heist` | 104/104 |
| `npm run verify:cabin` / `verify:cabin-browser` | 125/125 unit; 58/58 browser |
| `npm run verify:luxury-apartment` / `verify:luxury-apartment-browser` | 49/49 unit; 65/65 browser |
| `npm run verify:settings` | 26/26 |
| `npm run verify:scene-recovery` | Passed checkpoint retry, scene retry, delayed skip and landing |
| `npm run verify:squatch-smash` | 13/13, including standalone bundled pause |
| `npm run verify:cold-open` | 39/39 |
| `npm run verify:webgl-native` | 31/31 non-Initiation runtimes |
| `npm run verify:visual-smoke` | Required apartment-mirror comparison passed |

Luxury apartment used installed Chrome with `LUXURY_APARTMENT_NATIVE_GPU=1`.
Its first run was 64/65: real walking overshot the verifier's 0.35 m wardrobe
distance limit to 0.397 m. The unchanged verifier passed 65/65 on the isolated
rerun; this was not hidden by loosening its threshold.

All other required Verify workflow commands passed: `npm run lint`,
`CHECK_SFX_ORPHANS=1 npm run check`, `check:flight`,
`verify:campaign-route`, `verify:boot-failure-surfaces`,
`verify:framing`, `verify:dialogue:check`, `check:line-presence`,
`check:reachability`, `check:rerecord`, `check:takes`,
`audit:rendered-voices:check`, all three radio evidence checks,
`voice:needed:check`, `audio:todo:check`, and all 20 scene cue ledgers.
`node tools/bundle-preview.mjs` and
`npm run certify:debt-ratchet -- --trusted-ref 1932622c` also passed.
Dependencies and installed Playwright were retained from the earlier pass;
the lockfile is unchanged. Exact command receipts:
[CI gates](../../../artifacts/followup/ci-gates.json),
[scene gates](../../../artifacts/followup/scene-gates.json),
[shared browser gates](../../../artifacts/followup/shared-browser-gates.json).

## Remaining visual-suite limitation

The optional full `npm run verify:visual` run was **1/9 test cases passing**:
eight stored screenshot comparisons differ. Actuals, diffs and traces were
retained in [visual-current](../../../artifacts/followup/visual-current/).
The affected cases are luxury living room, cabin mirror, Mansion foyer,
Mansion return, Enola cockpit, Palace courtyard, THE TAKE driving and the
Initiation career record. Differences include typography/HUD changes and,
in some cases, world or held-model presentation. No baselines were overwritten.

The relevant cabin-mirror case was repeated with the changed runtime modules
served from immutable commit `1932622c`. Its actual capture is **byte-identical**
to this pass's capture: SHA-256
`73d7632d24c47a0e83dae7e52355e1a95c0001f4588e49a49adbce43a7934dd7`.
That comparison failure therefore predates these four improvements. The other
seven failures were inspected but were not all individually reproduced on the
prior commit. The required apartment-mirror smoke passes; the complete
canonical visual suite is not certified green.

The frozen Initiation runtime was not edited. This pass does not claim a
continuous human playthrough of every campaign branch.
