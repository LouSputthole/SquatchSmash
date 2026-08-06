# Scene-audit baseline — 2026-08-06

`scene-audit-baseline.json` is the full-sweep snapshot after the geometry,
siege, no-wake, and optimization passes merged. It is the ratchet reference
the CI gate described in `docs/RIGHT-FIRST-TIME.md` should count against:
a scene's finding count may go down, never up.

Headlines: mansion 12,621 meshes / 852 findings (down from pre-pass, and
1,133 meshes lighter after instancing) · siege 10,193 / 773 (the overlay's
own three real findings were fixed; the rest is base-house) · nowake 26
findings, zero of them authored · silver 16 · golf 16.

Known audit-tool gaps recorded by this run, in priority order:
1. `heist` and `silvercase` report 0 meshes — discovery matched a root
   before the world was built. The poll should require counted > 0, not
   merely a root.
2. `graveyard` (`window.GRAVEYARD`) and `initiation` (`window.INITIATION`)
   are not discovered at all — their handles hold the scene deeper than one
   property level or build after a different start flow.
3. The dominant signal everywhere is UNNAMED meshes (9,121 in the mansion
   alone): `cylinder()`/`sphere()` in `src/world/build.js` drop the `name`
   option. Fix the builders, then burn the count down per scene.
