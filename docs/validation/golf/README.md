# Silver Pines browser validation

Current automated snapshot (August 2, 2026):

- `npm test`: all repository tests passed (323 at this snapshot), including
  the player-cart, exit-gate, and live-ball ready-golf contracts.
- The last completed `npm run verify:golf -- --screenshots` snapshot passed
  75/75 checks. The expanded verifier now also gates shot planning, first-person
  equipment, origin restoration, pointer-lock fallback, shot presentation, and
  per-hole HUD state; its fresh screenshot run is required before release.
- The verifier drives the lead cart with the real W/A/S/D/Space input path,
  proves E cannot exit during Lou's dialogue, while moving, or far from the
  live ball, and parks once per hole.
- Lou occupies the lead passenger seat. Erican's second cart stays with the
  group. Every NPC approach stroke is sampled at the golfer's current ball
  after walking to the lie.
- The top map and separate ground marker keep the regulation-size player ball
  readable without changing ball physics.
- The existing three-click swing contracts remain intact: club-specific carry,
  ideal power, overswing risk, strike direction, lie penalties, and every
  authored hole still pass.
- Every tee now recommends an authored safe play: iron to Hole 1's middle
  green, driver to Hole 2's safe side, and driver to Hole 3's left fairway.
  The player may override both club and aim.
- Driver, iron, and putter appear in the camera-mounted hand rig during the
  swing. Ball flight leaves a fading world tracer and a compact result card
  reports strike, power, total distance, lie, and distance remaining.
- Flight-camera cleanup restores the pre-shot stance. Pointer lock is optional:
  keyboard aiming plus unlocked click or Space can complete the swing.
- A ball inside 0.8 metres is explicitly offered as a `G` pickup for one
  stroke, and the guide points back to Lou after an interrupted required talk.

Evidence:

- `08-swing-power.png`: current ideal-power and overswing meter.
- `09-swing-strike.png`: current strike band and shot-shape coaching.
- `10-ball-finder.png`: live ball ring, waypoint, distance, and top map.
- `11-cart-drive.png`: player driver view, forward-facing camera, map, and
  driving objective while Lou's private conversation is active.
- `12-shot-result.png`: generated only by the live `--screenshots` verifier;
  it must show the first-person shot result and a tracer built from live ball
  positions. Do not fabricate or hand-edit this evidence.

Human feel checks still matter. On a normal keyboard, tune acceleration,
steering response, brake distance, the 12-metre exit radius, map scale, and the
spacing between concurrent NPC approach routines only after playing a complete
three-hole round. These are subjective pacing and feel decisions; the
automation protects the mission and interaction contracts while they change.
