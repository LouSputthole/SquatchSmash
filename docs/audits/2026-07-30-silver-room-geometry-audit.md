# Silver Room geometry audit — 2026-07-30 (measured; fix pass owns all items)

verify-silver passes despite ALL of this because its driver teleports (walkTo)
instead of walking colliders, and nothing asserts geometry. The fix pass must
also add the two ~15-line harness checks in §11.

## BLOCKERS
1. **Street set built inside the building** — room.js:358-429: facade wall at
   z=34.2; pavement/kerb/canopy+collider posts/rope line/queue/doorman/sign/
   uplight/TONIGHT sign all authored at z<34.2 (inside). Fix: mirror each z
   about the facade: z' = 68.4 - z (table of per-line values in the audit
   transcript; dropOff 38.5 confirms reflection intent). roomAt under the
   marquee currently returns 'lobby' (interior audio outdoors). Fixing this
   also fixes the black marquee (§10).
2. **Four doorways bricked up** —
   a. room.js:517 service-door wall seals the alley doorway z 10-13.4 → use
      wallGap; this is the ONLY entrance for a real (collider-obeying) player.
   b. room.js:533 cellar→dry store: punch gap z -11.4..-8.6 (walk-in door line).
   c. room.js:660 duplicates+reseals the corridor→prep doorway that
      room.js:759 punches (z 1.6-4.4) → delete the duplicate wall; let :759
      own x=15 for z -2..8.
   d. room.js:837 seals the dining→lobby wallGap of :857 → wallGap at :837.

## HIGH
3. **Route through props (10 of 26 segs)** — re-author ROUTE (room.js:103-131):
   nodes 13/14 → x≈17.4 (wine-rack gap is 0.40m!); node 15 → (18.5, 2.0);
   17→18 at z≥-9.3 (out of the ranges); 19→20 via (15.5,-7.8)→(14,-7.8)
   through the swing doors, not through the wall at (15.06,-14.69). Also MOVE
   the prep bench (room.js:704) off the up-ramp (it floats 0.93m over it).
   RISK: verify-silver 329 (afterRamps<3) + 428 (KeptPace/abandonments) — rerun.
4. **Rear exit axis transposed** — room.js:1060: axis:'z',fixed:-21.6 puts a
   free-standing fire door on the carpet. Fix: axis:'x', fixed:-21.6,
   from:-4.4, to:-1.6.
5. **Multi-floor** — room.js:648 prep floor covers the up-ramp footprint (feet
   1.29m under the visible floor mid-ramp): clip floor to x0:20 + matching
   hole in the cellar ceiling; room.js:515/516 add a second wall course with
   y0:0 (open void edges above ramp top); honour `platforms` in groundAt OR
   drop kerbY to 0 (room.js:228 platforms built, main.js:222 never consumed —
   14cm shin through the kerb). PRESERVE verify-silver 312-316 groundAt
   assertions + 326 eye height + 362.
6. **Tables through the four columns** — room.js:971-992: add a column
   exclusion (skip grid cells within ~1.4m of each column centre) BEFORE
   jitter; the `tx>4 && tz>18` guard is dead (measured x max 7.0) — replace
   with the real exclusion; two chairs fully inside columns go with it. Move
   anchors.tableStaging (-9.5,0.5) out of the table collider at (-8.93,0.70).
7. **Front-table chairs in the tablecloth** — room.js:1148-1151 frontSeats
   ±0.75 → ±0.98..1.1 MAX (verify-silver 484 requires apart in (1, 2.2)).

## MEDIUM (all room.js)
8. Coat rail+coats behind the corridor wall (787-796) — pull to x<14.8;
   counter unburied. Service-bar hatch (768) faces solid wall — either open a
   hatch gap or reface; whiskey bottles 5mm sunk / shots 5mm floating
   (772,775). Extraction hood valance at eye height across the aisle
   (700-701) — raise to y≥2.05 and end at x≥15.2. Corridor curtain 0.35m
   through the ceiling (813). Alley/kitchen wall 7.4m³ overlap (441 vs 657) —
   shave one. Alley crates (471-475) get a solid() or move off the route.
9. **Half-built rooms** — ROOMS.dish shadowed by kitchen in roomAt (55-56:
   order dish first); ROUTE[5] labelled stair but outside ROOMS.stair (move
   node to x≤22); dining room's SOUTH EDGE OPEN 15.7m into void (836-841: add
   wall -6..10 at z=-8.1 with gaps for the two wallGaps at 1052-1053);
   restrooms/manager/backstage: floor-only, 0 lights — wall them off
   convincingly or dress minimally (a lit corridor + doors is enough).
10. **Lighting** — kitchen blown (mean 160, 14% clipped): strips 2.2→~1.4
    (730-740), prep floor roughness 0.35→0.55 metalness 0.18→0.06 (648,654).
    Stage 79% black from the seat pre-show: one 0.6 warm pelmet fitting
    (independent of lighting.stage). Up-ramp black: one fitting. Watch
    verify-silver 609 lights<=45.

## Harness additions (required)
11. In verify-silver: (a) route-vs-collider sweep — every ROUTE segment
    sampled at 0.2m must be collider-free at groundAt height; (b) for each
    ROUTE node, roomAt(node) === node.room. (~15 lines each; would have
    caught six findings.)
