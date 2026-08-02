# Silver Pines validation and remaining gate

Current automated state (August 2, 2026):

- `npm test`: 110/110 repository tests, including the club/lie/overswing and
  player-driven cart models.
- `npm run check`: 201 source files and all four manifests valid.
- `npm run verify:golf`: 68/68 live browser checks from the real start button
  through all three holes.
- The verifier plays the real round with the game's real objects and solver,
  records all three holes, completes the mission, checks recovery and restart,
  and sees no browser console errors.
- The live render now asserts the authored anchors on every rebuild. Hole 3 in
  particular must render `clubhouse` while its `lot` is null.
- The equipment pass is now structural as well as visual: the driver has a
  deep wood head, the iron a thin extruded blade, and the putter a flat blade;
  all three use angled hosels, swap into NPC hands, and appear as complete,
  fanned, head-up clubs in the rebuilt stand bag.
- The three-click swing now recommends a useful power for the club, lie and
  remaining distance. Driver, iron and putter have different tempo/control
  windows; difficult lies reduce forgiveness; and the visible orange
  overswing zone narrows and speeds the strike window while adding a
  controllable fade that compounds into a slice on an early strike.
- After every tee shot the Prospect drives the lead cart with W/S, steers with
  A/D, brakes with Space, and gets out with E only after Lou finishes and the
  cart is stopped beside the live ball. Lou rides passenger; Erican drives
  Rippin in a second cart that follows the group. All three NPCs then walk to
  every new lie before addressing and swinging, in concurrent ready-golf jobs.
- The regulation-size player ball has a separate pulsing ground ring plus a
  top-right hole map. The map draws the player, both carts, pin, live ball,
  distance, and a dashed direction line from the player to the ball.
- `08-swing-power.png` and `09-swing-strike.png` are live 1280×720 meter
  evidence. The green target, orange risk zone and pale straight-shot band are
  computed from the same values used by the swing resolver rather than
  duplicated CSS guesses. The meter is raised clear of spoken subtitles, and
  the strike band appears only when it is the player's active target.
- `10-ball-finder.png` verifies the physical ring, edge waypoint and top map.
  `11-cart-drive.png` verifies the live driver camera, cart objective and the
  same map while the cart is moving.

## Content still required

- Record the 291 entries under **Voice — A Morning at Silver Pines** in
  `VOICE-LINES-TODO.md`. Lou has 103, Rippin has 102, Erican has 66, and the
  Prospect has 20. Every filename includes its exact line and direction.
- Voice continuity is locked to the established cast: Rippinflow uses
  `rHWSYoq8UlV0YIBKMryp`, and Erican resolves to the existing `eric` profile
  (`A7AUsa1uITCDpK29MG3m`) used throughout the story.
- The 21 golf-specific effects have authored prompts and procedural fallbacks,
  but recordings remain optional polish rather than a playability blocker.

## Human playtest gate

No automated player can answer these. One person must play the three-hole round
from the car park to the apartment button and write down the answers before
another pacing or feel pass begins.

1. Is taking the three-club bag and reaching the first tee obvious without
   knowing the verifier's route?
2. Does the three-click swing read immediately, and are the power and accuracy
   windows forgiving enough to enjoy rather than merely pass?
3. After Lou says “We can find a fourth. We invited you,” does the authored
   three-second silence land, drag, or get broken by movement or ambience?
4. On Hole 2, does the long conversation arrive naturally at walking pace, or
   does the player outrun, bunch up, or miss lines?
5. Does the cart accelerate, steer and brake pleasantly on keyboard, and can
   the player find an ordinary fairway or rough ball without hunting?
6. Do the between-hole fades start and end cleanly, and does control return at
   each new tee without a dead input or camera jump?
7. Is the Hole 3 clubhouse readable behind the green during ordinary play,
   not just in `07-hole3-green.png`?
8. Can the player intentionally hit water, go out of bounds, recover, and still
   understand what stroke and penalty were recorded?
9. Does the final card clearly communicate completion, and does **Return home**
   reach the apartment with the completed three-hole record intact?
10. After a reload and after **Play again**, is it clear whether the player is
   resuming campaign progress or starting a fresh standalone round?

Record the device, browser, total round time, hole-by-hole score, any missed
line IDs, and short notes for each question. That evidence is the input for the
next polish pass; until it exists, swing feel and dramatic timing remain open,
not failed.
