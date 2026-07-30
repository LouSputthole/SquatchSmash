# Beef Run scenery audit — 2026-07-30 (measured, OBB-exact)

Fix pass owns items P0-P2 + P3 landmarks/renderer. The waterfall (last P3)
needs an OWNER RULING. Never touch physics.js/engines.js/config.js.

## P0
1. **El Hueso strip mesh is degenerate** — airstrip.js:203-216: the vertex
   loop reads along-strip from pos.getZ (always 0) and writes height into
   setY, collapsing the 620 m strip to a 16m x 0m sliver flat at y 708. Fix
   in the loop: wx = EH.x + pos.getX(i); wz = stripMidZ - pos.getY(i);
   pos.setZ(i, terrainHeight(wx, wz) + 0.06 - stripMidY).
2. **Nine conifers on the WP runway** — terrain.js:234-250 scatter never
   excludes the flattened pad. Add exclusions: |wx-WP.x|<40 &&
   |wz-WP.z|<WP.rwyHalf+60 continue; same for EH.x±30 over zHigh-40..zLow+40.
3. **Dusk ground renders black; no runway lighting** — weather.js:186 sun at
   5.2 deg; :195 hemi 0.42. Fix: lerp(1.15, 0.28, dusk) and hemi
   lerp(1.05, 0.8, dusk); give the threshold truck a real SpotLight in
   makePickup (airfield.js) so moveTruckToThreshold's claim is true.

## P1
4. **Hangar roof inverted prism** — airfield.js:77-81: delete line 79
   (rotation.x), size prism radius ~3 at y = h+1.4 so it spans y[7,10],
   x[-11,11], z[-8,8]. Wing currently 3.27 m inside the roof solid; crows
   (airfield.js:400, ELEV+7.6) then land on the eave correctly.
5. **Beacon head on the ground, lenses floating** — airfield.js:216-230:
   delete lines 225-228; lenses stay children of head at local (0,0,±0.3).
6. **Wheels buried** at parking/lineup — aircraft.js:254 leg y and :679 sag
   base become -(AC.gearY - 0.7 - spec.r) (mains -0.48 m under terrain now).

## P2
7. Hangar collider spans the open door — airfield.js:280 → two colliders
   x[-71,-65] and x[-55,-49].
8. Fuel-tank collider encloses the dog — airfield.js:297 shrink to
   x[-75.6,-69.6] or move dog to (-67.5, 371); dog also 0.32 m inside the
   west cradle.
9. Shelter collider encloses all four guards — airstrip.js:243 → four post
   colliders instead of the roof footprint.
10. Cargo stack #3 on the strip — airstrip.js:265-267 `EH.x - 17 - i*6`.
11. Drums 0.44 m underground — airstrip.js:261 add d.position.y += 0.42.
12. Huts/mil-truck on the shelf part-buried/part-floating — airstrip.js:
    233-239: sink each by max corner gap (sample 4 corners).
13. Antenna guy-wire feet -3.01..+2.59 vs terrain; wires touch nothing —
    airstrip.js:245 + :141-147 per-foot sampling.
14. Guards clipping bench/table — airstrip.js:291-299 nudge z +0.25 on
    guard0 and guard3.
15. Lou leaning on air — airfield.js:425 louStand → (-54.4, ELEV, 384)
    (wing chord is x[-55.46,-53.54]).
16. moveTruckToThreshold leaves its collider behind at (-44,356) — move the
    collider with the truck (airfield.js:457-461).
17. No colliders on vending machine, beacon, windsock, signs — add slim ones.
18. bounds (airfield.js:438-441) never consumed — either clamp the on-foot
    player in beefrun main or drop the field with a note.

## P3
19. Broken tower floats up to 11.4 m; fallen piece has a dead `x * 0 + 40` —
    landmarks.js:22-42 per-leg terrain sampling.
20. CAIB masts on 4-22 m relief footprints — landmarks.js:253-259: per-leg
    sampling or reject relief > 3 m.
21. Wreck wing tips 1.11 m underground — airfield.js:161-163 loose y 1.9 or
    rotation.z -0.24.
22. beefrun main.js sets no scene.environment while 36 materials have
    metalness > 0 — add the same env path the other scenes use
    (src/main.js:108-112 pattern).

## OWNER RULING NEEDED
The waterfall rock (landmarks.js:125) tops at exactly 690 m — the El Hueso
threshold elevation — 345 m from the threshold on final, spanning the
centreline. Deliberate hazard or accident? Left untouched pending ruling.

## Status — 2026-07-30, fix pass

Items 1-22 all fixed and verified in a headless run; waterfall left alone.
Measured after: strip 620.00 m in z, 690.62-726.52 m, skin deviation 0.0000;
0 trunks in either runway rect (2319 / 3913 placed elsewhere); wing-vs-roof
disjoint by 4.07 m in y (was 3.27 m inside); drums +0.006 (was -0.44); wheels
+0.01 (was -0.49 / -0.37); guy feet within 12 mm (was -3.01..+2.59); wreck tip
0.00 (was -1.11); tower and mast legs float 0.00; mast relief max 2.64 (was
4-22); dusk ground luminance 14.37 vs 5.28 before. Deviations from the
prescriptions above, all because the stated numbers did not land: 4 — roof
eaves at y 7, ridge at y 10, and the crows re-seated on the pitch, since 7.6
sits 0.8-1.9 m inside the new roof; 8 — dog moved (the second option) rather
than shrinking the collider; 11 — +0.45, not +0.42, as the rims sit below the
body; 14 — guards moved to the shelter's open south side, as +0.25 cleared
neither the bench nor the table; 18 — field dropped with a note, since the
player also walks El Hueso; 21 — needed the shallower lean *and* the lift.
Item 3 also re-heads the truck, which parked facing away from the runway. Item
22 ships the src/main.js pattern verbatim, but its effect is unverifiable
headless: PMREM's own shaders fail VALIDATE_STATUS under SwiftShader, so the
prefiltered capture samples black there. Gates: check, check:flight (twice,
identical), 73 tests, verify:beefrun 13/13.

## Assertion exposure
verify-beefrun's only geometry-adjacent check is eye height at playerStart
(-88, 350) — do not place a collider under it. check.mjs lints only cues and
beat ids. All fixes are geometry-only.
