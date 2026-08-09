# Mansion room refinement evidence — 2026-08-09

This pass uses the production `mansion.html?preview=1` scene, its real materials,
lights, player camera and public room props. No parallel preview room was built.

## Ranked defects found

1. **All five ordinary bedroom rugs were invisible.** The four upper rugs were
   8 mm below their finished floors and the Prospect rug was 10 mm below its
   finished floor. This caused the repeated large, bare floor fields in every
   bedroom screenshot.
2. **The kitchen sink was visually sealed.** Two steel bowl boxes existed below
   an uninterrupted counter and chrome cap. The water stream landed on the
   centre divider rather than inside a bowl, and the faucet did not read as a
   continuous fixture.
3. **Lou's suite had an unfinished, dark bed-foot void.** The canopy bed opened
   into a long empty carpet field without a terminus or local task/accent light.
4. **Bedroom-specific furniture was anonymous or incomplete.** The Gothic case,
   Old-timey washstand, Lake desk, Modern bench and Prospect dressing storage
   were not published as stable functional clusters; several component meshes
   were anonymous.
5. **The Lake desk contradicted its own authored description.** It promised a
   lamp and letter but contained only an anonymous paper and no task light.
6. **The Prospect bed stopped at the shared base treatment.** It had no named
   coverlet, foot throw or raised cushions.
7. **A first Lou-suite art attempt duplicated a recovered photograph.** The
   full verifier caught two `mansion.office.boss` meshes. The recovered Boss
   photograph now remains exactly once in its authored office; the suite uses
   a scene-built, non-manifest `suite-lou-accent`.

## Acceptance criteria and final inventory

| Room | Acceptance | Public finishing inventory |
| --- | --- | --- |
| Kitchen | Two open, recessed bowls; at least 80 mm visible depth; water centre inside exactly one bowl; complete named swan-neck faucet; existing tap interaction still toggles | `kitchen-sink-bowl` x2, `kitchen-sink-rim`, `kitchen-sink-faucet`, seven named faucet parts, `kitchen-sink-stream`, `kitchen-sink-splash` |
| Lou suite | Bed-foot bench at least 250 mm clear of mattress; matching collider; two runners; paired live accent lamps; lit scene-built Lou accent; no recovered-photo manifest slot | `suite-bed-bench`, `suite-bedside-runner` x2, `suite-bed-foot-lamp-left`, `suite-bed-foot-lamp-right`, `suite-lou-accent`, `suite-lou-accent-light` |
| Gothic bedroom | Useful visible rug and a distinct packing/dressing cluster | `gothic-packing-case`, `gothic-packing-lid`, `gothic-packed-garment`, `gothic-valet-stand`; folio pieces retained |
| Old-timey bedroom | Useful visible rug and a distinct washstand cluster | `oldtime-washstand`, `oldtime-basin`, `oldtime-pitcher`, `oldtime-towel`; travelled trunk detail retained |
| Lake bedroom | Useful visible rug and a complete writing cluster with live task light | `lake-writing-desk`, `lake-writing-chair`, `lake-desk-lamp`, `lake-desk-letter` |
| Modern Booski/Death bedroom | Useful visible rug and a distinct dressing cluster; existing personal props remain public | `modern-dressing-bench`, `modern-folded-garment`, `modern-dressing-mirror`; `booski-death-room-ledger`, `booski-death-room-security-radio` retained |
| Prospect bedroom | Useful visible rug, layered bedding and distinct dressing storage | `guest-bed-coverlet`, `guest-bed-throw`, `guest-bed-cushion-left`, `guest-bed-cushion-right`; `guest-dresser`, `guest-mirror`, `guest-wardrobe` |

Cross-room acceptance requires finite production AABBs, rugs at least 4.5 m by
4.0 m and at least 2 mm above their finished floor, exact named cluster
inventories, ten recovered photographs hung once each, live WebGL, zero 404s
and zero runtime console errors.

## Visual evidence

- `after-pass-1/kitchen-sink.png` — final open double bowl and faucet.
- `after-pass-1/bedroom-*.png` — before the shared rug-height repair.
- `after-pass-2/bedroom-*.png` — after all five rugs render above the floor.
- `after-pass-3/bedroom-*-cluster.png` — final five functional clusters.
- `after-pass-5/lou-suite-lighting.png` — final bed-foot composition and lamps.
- `after-pass-5/lou-suite-portrait.png` — final lit, non-manifest Lou accent.

Each authoritative report records a 1280×720 live drawing buffer, no lost
WebGL context, no 404 responses and no page errors. `after-pass-4` is an
intermediate superseded suite-lighting capture and is not final evidence.

## Verification

- Focused Node: `node --test tests/mansion-interactions.test.mjs` — **33/33**.
- Focused production browser: `node tools/verify-mansion-rooms.mjs` — **7/7**.
- Full production Mansion: `npm run verify:mansion` — **297/297** in 602.3 s.
- Final screenshot capture: **2/2**, zero runtime errors.
- `git diff --check` for the scoped source/test/verifier files — pass.
