# Bada Bing scene audit — 2026-07-30

**Status 2026-07-30 late:** every P1/P2 item below is IMPLEMENTED and verified
(doorways/movers/stage in `e39dffa`, gambling rework in the following commit;
verify:bing 46/46, verify:bing-two 10/10 after each slice). Still open: the P3
office-radio/zone-muffle design and the cross-scene follow-ups at the bottom.

Runtime-measured findings (headless probes) from the July 30 audit pass.
The Squatchfather and Motel audits from the same pass are already implemented
(`b2f784f`, `4b5c523`). Every fix below names its authoring site and the
verifier assertions at risk. Implement as one focused pass and re-run
`verify:bing` + `verify:bing-two` after each group.

## P1 — Back-hallway decorations sit inside doorways

- **Men's room graffiti panel** (`src/bing/club.js:1075`): 1.8 m panel at
  z 0.70–2.50 hangs across a doorway gap z −0.07–1.47 → 0.77 m of the opening
  blocked at eye height. Fix: `z: 1.6 → 2.55`; move `anchors.graffiti`
  (`club.js:1080`) and the invisible pad at `main.js:769` with it.
- **Men's room door swing** (`club.js:558`): `swing: 1.9` opens into the stall
  bank, passing through stall door #1 and resting inside toilet #1. Fix:
  `swing: -1.9` (hallway arc measured clear).
- **Lou's office door** (`club.js:1274-1281`): middle family-photo frame is
  inside the door gap; leaf strikes it 0.16 rad into the swing. Fix:
  `z: O.z0 + 1.6 + i*0.9 → O.z0 + 3.2 + i*0.8`; update `anchors.photos`
  (`club.js:1282`). Wall TV (`:1297`) and coat rack (`:1271`) are near-misses
  worth nudging in the same edit.
- **MANAGER/LADIES plates** (`club.js:1028-1031`): centred on locked door
  leaves. Fix: `z: lz → lz + 0.75` (onto the jamb). Look bug only.
- **Service door** (`club.js:1118`): wall box pokes 0.08 m into the gap —
  `pos: [S.x0 + 4.2, …] → S.x0 + 4.9`. Its swing also passes through kegs
  (`:1093-1100`); store-room door swings into the steel box (`:1117`).
- Verifier risk: none — no door-swing/doorway assertions exist today.

## P1 — NPCs walking in place

- Measured: `a waitress` covers 17.6 m of an intended 33 m, animating at
  <35 % speed 51 % of the time. Others are fine.
- Root cause (`src/bing/cast.js:583-597`): the two axis probes set
  `moved = true` when either axis is merely *clear*, so sliding along the bar
  counter counts as movement and the blocked-waypoint fallback never fires.
- Fix 1: capture pre-move position, set
  `moved = Math.abs(dx) + Math.abs(dz) > 1e-4` after the probes.
- Fix 2: four authored waypoints fail `_navClear` outright — security
  (−18.5, 5.7) and (−18.5, −2.3) (`cast.js:736`) → x −17.9; waiter1 (−19, 6.5)
  inside the bar counter (`cast.js:823`) → (−17.9, 6.5); delivery (24, −5)
  inside the dumpster (`cast.js:840`) → (24, −4.6).
- Verifier risk: none today (`verify-bing.mjs:369` passes either way);
  consider adding a mover-progress assertion (dist > 0.6 × ideal over 30 s).

## P1 — Stage tip light is a straight chord; the deck itself is mirrored and too high

- Tip is a cylinder r 0.95 at (−12, −0.8); the "tip light" is a straight
  2.0 × 0.12 bar (`club.js:638` second entry) with ~0.7 m hanging in mid-air
  each side. Rails (`:639`) stop before the curve; the 10 m pink bar
  (`:638` first entry) is against the BACK wall, not the front edge.
- Fix: replace the tip entry with a half-torus arc
  (`TorusGeometry(0.95, 0.045, 6, 20, Math.PI)` at local
  `(0, STAGE_H − 0.05, 6.4)`, `rotation.x = -Math.PI/2`); extend rail depth
  3.6 → 4.5; move the 10 m bar local z −3.55 → +3.5.
- **Deck bug** (`club.js:629-632`): `rotateX(-Math.PI/2)` maps extrude depth
  to +y — the slab spans y 0.75–1.5 while `groundAt` walks at 0.75, and the
  semicircular cap points backwards 3.4 m through the back wall. Performers
  measure buried to the waist. Fix: `deck.position.y = STAGE_H → 0` and make
  the shape a plain rectangle; keep the runway box + tip cylinder as the
  thrust. Verifier `:355-364` (performer height) unaffected — baseY unchanged.

## P2 — One chair intersects the stage front

- East chair of the two-top at `club.js:929` (`[-13.4, 0.6]`) penetrates the
  round thrust by ~5 cm. Fix: `[-13.4, 0.6] → [-13.4, 1.05]`. One number.

## P2 — Blackjack corner overlaps; cards unreadable

- Blackjack table solid overlaps booth #3's table collider by 0.69 × 0.19 m
  (`club.js:819` vs `:921`); three of five seat chairs overlap booth tables;
  a two-top chair (`club.js:930`) overlaps bar stool #7; the slot-alcove wall
  (`club.js:872`) overlaps the last east booth.
- Fix: move the WEST booth row north (`club.js:919-922`: seats 10.35 → 11.0,
  tables 9.15 → 9.85, solids → (10.55, 11.05), anchor 9.7 → 10.4); shrink
  blackjack seat radius 1.8 → 1.62 and the table solid's +z 1.5 → 1.2; move
  the two-top `[-17.4, 6.6] → [-16.9, 6.6]`.
- **Verifier risk HIGH**: `verify-bing.mjs:511-515` needs `exits.length === 9`
  and every booth anchor + `blackjackSeats[2]` to yield a safe stand spot;
  `:461-478` sits at `booths[0]`; `:517-533` requires `booths[0]` to be
  BLOCKED for the [Q]-unstuck test. Keep 9 booths and the east row as-is.
- Cards (`blackjack.js:88-97`, faceTexture `:22-56`): rank subtends well under
  half a degree from the seat. Fix: tilt/lift player cards toward the camera
  (`rotation.x = -0.55`, y 0.99), spacing 0.075 → 0.10, add a centred
  `900 92px` rank glyph in `faceTexture`. HUD already prints totals.

## P2 — Slot machine unreadable by construction

- Drums r 0.19 behind smoked glass at emissive 0.32; one symbol = 0.099 m of
  arc squashed 2.4:1; no paytable anywhere; `useMachine()` (`main.js:1002`)
  never seats/aims the player; `anchors.slotStand` (`club.js:874`) unused.
- Fix: (a) `reelMat.emissiveIntensity 0.32 → 1.0`, drop the smoked-glass box;
  (b) drums r 0.30 × 0.30 long, re-centre bezel to a 0.34 m aperture;
  (c) `useMachine` seats at `slotStand` with yaw at the machine, pitch −0.12;
  (d) one paytable row in `paintMachine`:
  `3× squatch ×250 · cherry/bell/bar/cash — hold [E] or pull the arm`.
- Verifier `:539-553` only requires three staked spins — safe.

## P3 — Lou's office radio + muffled club music by zone

- `updateZones` (`main.js:1364-1408`) already ramps loop volumes per zone and
  uses a single global `setMuffle`. `startLoop` supports positional loops but
  has no per-loop filter.
- Design: (1) insert an optional lowpass in `_makePanner` loops + add
  `setLoopCutoff(key, hz, ramp)` (`src/core/audio.js:322-374` area);
  (2) drive `ambience.club` cutoff by zone (main 20000, hallway 1400, office
  700 / 1600 with door open, bathroom 600); (3) office radio prop by the
  liquor cabinet using the `car.radioFace` pattern (`main.js:894-901`) with a
  positional loop — the panner gives the round-the-corner falloff free.
- **Verifier risk HIGHEST**: `verify-bing.mjs:419-420` requires ZERO repeated
  volume ramps over 60 unchanged frames — quantise/deadband any
  distance-driven cutoff and fold it into `acousticKey`. `:412-418` pins the
  exact rain volumes; do not change them.

## Follow-ups deferred from the other two scenes

- Squatchfather: generate `gun.shot`/`gun.impact`/`gun.dry` +
  `footstep.wood.a/b` samples (prompts already in the manifest), then route
  `Foley.footstep`/`GunshotAudio` through real samples with synth fallback.
  The fourth background table has no hanging lamp (`SquatchfatherScene.js:1076`).
- Motel: car sound cues do not exist (`car.engine.start/idle/rev`,
  `car.tire.skid`, `car.horn`, `car.impact.metal`, `traffic.pass`) and
  `src/motel/audio.js` is synth-only — thread `core/audio.js` in with synth
  fallback. Upstairs decorative windows sit on blank stucco with no reveal
  (`level.js:292-297`). Manny → "fellow prospect" relabel is display-strings
  only if ever done (`role`/`faction`/`identity` must NOT change —
  verify-motel asserts them).
- Apartment (owner requests, unaudited): crooked-frame gag pre-staging (frame
  slightly crooked + hanging off at the bottom before the minigame), glue
  minigame two more successful pumps with faster ramp, better moan on the
  last three pumps, better poop sounds. Club music: play `sallie J.mp3` at
  the Bing until the playlist grows.
