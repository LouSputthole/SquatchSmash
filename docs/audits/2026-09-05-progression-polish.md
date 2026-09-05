# Progression polish — September 5, 2026

Base: `origin/main` at `bcbc9897`. Branch: `codex/campaign-polish-20260905`.
Work is isolated from the existing `voice-backlog-and-bunker-sand-20260902` checkout.

## Player-facing changes

- The starter apartment now explains how to trigger the bathroom need. Its
  instruction changes when Tony is ready, explains E to sit, and mentions
  that remaining seated finishes the action even without the timing keys.
  The opening caption reads the actual campaign clock instead of saying
  6:04 AM during the current 5:04 PM opening.
- A shared direction guide marks the current authored target in the apartment,
  cabin, Bing, graveyard and luxury apartment. J reveals a label, distance and
  edge arrow for 14 active seconds. After 45 seconds without getting closer or
  changing objectives, assistance appears automatically. The pause menu offers
  the same help; rebinding J to movement leaves that menu option available.
- The James Blond room takes over the objective card while the player is
  inside. Instructions follow conversation, belongings, held tools and the
  concluding encounter. Leaving restores the main mission. Bing's obsolete
  CSS rule that hid objective hints is removed.
- The first Bing visit points to Margo when her number is still required,
  before directing the player back to the car. Exit guidance uses the actual
  lobby and lot, rather than assuming a sign change in the player's Z position
  means they are outside.
- Cabin cleanup guidance selects an actual unwrapped body. While carrying,
  it follows the current floor to the ladder or outdoor pyre; outdoor terrain
  below zero elevation no longer incorrectly selects the basement ladder.
- Recovery counts checkpoint and scene restarts together. Two retries unlock
  Skip Scene when the scene supports it. Failed storage writes preserve the
  ledger for the current page. Failed recovery actions reopen the menu with
  an explanation instead of silently dropping the player back into play.

The markers do not complete objectives, move Tony, modify saves or reveal
future campaign beats. Scenes without an authored adapter retain their
existing objective panel and recovery menu.

## Verification

Logs and screenshots are in `artifacts/polish/` in this worktree. All browser
work uses isolated contexts and preview saves where the verifier supports them.
The campaign marathon separately exercises durable handoffs and reloads.

| Check | Observed result |
| --- | --- |
| `npm test` | 3,955 passed; no failures or skipped tests |
| `npm run verify:geometry` | 100/100 states; zero violations |
| `npm run lint` | No errors; existing advisory warnings remain |
| `CHECK_SFX_ORPHANS=1 npm run check` | Passed |
| `npm run check:flight` | Passed |
| `npm run verify:campaign-route` | Passed |
| `npm run verify:campaign-marathon` | 27/27 handoffs and reloads passed |
| `npm run verify:boot-failure-surfaces` | Passed |
| `npm run verify:visual-smoke` | Passed |
| `npm run certify:debt-ratchet -- --trusted-ref bcbc9897` | Passed; no new certification debt |
| `npm run verify:framing` | Passed |
| `node tools/bundle-preview.mjs` | Preview bundle produced |
| Dialogue, recording, radio and scene cue checks from Verify workflow | Passed; radio audit regenerated for a moved source citation |
| `npm run verify:day-one` / `verify:day-two` | 45/45 and 31/31 passed |
| `npm run verify:license-to-grill` | 73/73; all three authored routes completed |
| `npm run verify:bing` | 171/171 passed after updating the obsolete placeholder-art assertion |
| `npm run verify:bing-two` | 38/38 passed |
| `npm run verify:graveyard` | Passed |
| `npm run verify:scene-recovery` | Retry persistence, preview isolation and completion-before-navigation passed |
| `npm run verify:settings` | 26/26 passed |
| `npm run verify:cabin` / `verify:luxury-apartment` | Both unit/contract groups passed |
| `npm run verify:cabin-browser` | 58/58; both carried-body routes, wrapping/pyre guidance and departure passed |
| `npm run verify:luxury-apartment-browser` | 65/65 with `LUXURY_APARTMENT_NATIVE_GPU=1` and installed Chrome; real inputs, radio save/reload, late-campaign calls, home utilities and elevator departure |
| `npm run verify:webgl-native` | 31/31 non-Initiation WebGL runtimes booted and rendered on the RTX 4080 |
| `node tools/verify-objective-guidance.mjs` | Real input and visible guidance proof passed; zero page, console or request errors |

The guidance verifier starts its own local server on port 5249. Set
`GUIDANCE_BASE_URL` to use an existing server instead. On Windows it uses
installed Chrome/Edge for the normal-resolution visual proof.

That proof opens the fridge with E, takes the milk with E, holds F to drink,
observes the target change, sits on the toilet with E, waits for ordinary
completion, and stands up with E. It also checks the cabin pause-menu marker,
graveyard pickup direction, luxury shower direction, the real Bing back-room
door and watch interactions, visible instructions, restoration of the main
objective, and Margo's precedence over departure. A separate isolated menu
fixture proves failed-action feedback and mixed retry counts when storage
refuses writes.

The same browser proof also leaves the luxury apartment objective unresolved
without pressing J and observes the automatic shower marker after the real
idle interval. Assistance is absent initially, so this receipt proves both
the exploration grace period and the automatic nudge.

The old Bing art check required procedural canvas textures even though the
September 1 art pass replaced them with delivered images. It now requires all
six exact entrance slots, their manifest files, decoded nonblank image data,
and mounted scene meshes. No art was replaced to satisfy that check.

The first full luxury-apartment run under SwiftShader timed out waiting for
the radio toggle after its campaign call/elevator proof had passed. The exact
radio interaction then worked in isolated native and SwiftShader probes. The
verifier now uses a real start-button click, acquires mouse capture before
staging the radio, and asserts the resolved target before pressing E. Its
complete native GPU rerun passed 65/65. The original software-renderer timeout
is retained in `scene-verify-luxury-apartment-browser.log`; it was not a proven
production radio bug, and a complete SwiftShader rerun is not claimed.

## Evidence and limits

- `artifacts/polish/apartment-prerequisite.png`
- `artifacts/polish/apartment-toilet-direction.png`
- `artifacts/polish/james-blond-direction.png`
- `artifacts/polish/bing-margo-direction.png`
- `artifacts/polish/luxury-shower-direction.png`
- `artifacts/polish/guidance-errors.json`

These are automated regression and interaction proofs, not a claim that every
optional activity and every campaign branch has received a continuous human
playthrough. The direction marker indicates a destination; it is not a
navigation-mesh path drawn around furniture. The James Blond pass improves
instructions and progression feedback; it does not rewrite the recorded scene.
