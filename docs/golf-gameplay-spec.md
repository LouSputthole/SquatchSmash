# A Morning at Silver Pines — gameplay target

Silver Pines is a polished arcade-golf story scene: three authored holes,
three recognisable clubs, a readable three-click swing, real ball flight,
playable retrieval, and character dialogue that never becomes an obstacle. It
is not a bag-management simulator and it is not laser-guided golf.

## Complete player loop

1. **Read the shot.** Show pin and target distance, lie, wind, elevation,
   hazards, and a truthful dispersion area. Each hole supplies a safe default
   landing target; the player may aim elsewhere. A bright projected landing
   circle previews distance and uncertainty without promising an exact result.
2. **Choose a tool.** Driver is long and least controlled, iron covers full
   shots through chips, and putter stays on the ground. The UI recommends but
   never forces a club.
3. **Execute.** Click once to start, again to set power, and again at the strike
   line. Controlled power is forgiving. Overswing narrows and accelerates the
   timing window. Early opens the face; late closes it. The strike sweep stays
   slower than the power sweep so a first-time player can read the second click.
4. **Watch a golf shot.** Fade, draw, slice, and hook must curve in flight, not
   merely start offline. The player sees a club impact, short tracer, bounce,
   landing material, carry, total distance, lie, and remaining distance.
5. **Retrieve.** A tee shot or any long follow-up enters a reusable transit
   phase. Drive to the live ball, stop beside it, and get out. Short shots remain
   walkable. The group walks to and plays every live NPC lie.
6. **Recover.** Water, OOB, or an unplayable position blocks address. A legal
   drop costs exactly one penalty and returns to the pending transit/approach
   route; it cannot skip the cart dialogue or another required beat.
7. **Score.** Record every settled shot once: carry, total, hazards, proximity,
   putts, fairway, and green in regulation. A story-mode pickup/gimme prevents
   an endless hole while preserving actual and written scores.
8. **Continue.** Hole completion shows the current card, loads the next tee,
   restores control, and records the hole. Reload resumes at the next unfinished
   hole. Restart hole and restart round are explicit destructive choices.

## Non-negotiable story and control rules

- Hole 1 cannot advance past the invitation until a response branch completes.
- Lou's private cart exchange cannot be skipped by relief or an early exit.
- Pointer lock is an enhancement, never a playability requirement. Keyboard
  aim plus unlocked click or Space can complete a swing.
- Tab never changes the current beat, shot, dialogue, or score.
- The driver camera keeps the cart's local +Z travel direction in front by
  preserving the camera's required half-turn.
- Direct entry stays locked to the campaign route; preview mode remains the
  disposable verifier/practice surface.

## Presentation and verification gates

- A first-person hands-and-club rig makes driver, iron, and putter readable at
  address and launches the ball at its impact frame.
- Every golfer addresses the ball from the side with shoulders perpendicular
  to the target line; nobody faces the pin like they are throwing the club.
- Both carts carry a visible, spatial dashboard radio using the campaign's
  established stations, with power and tuning controls listed in instructions.
- The regulation ball never changes physics scale; a halo/tracer and ground
  marker carry visibility.
- The minimap includes pin, player, ball, carts, and the course path. Water,
  bunker, wind, and selected-club range overlays remain part of the map pass
  below; the current truthful landing-area preview lives in the 3D world.
- Hole 1 is pond and bunker, Hole 2 is dogleg and corner bunker, and Hole 3 is
  the clubhouse finish. A tee/approach crop should identify the hole.
- Essential UI remains legible without relying on colour and does not overlap
  two subtitle lines at 1280×720 or at a 900 px viewport.
- Browser coverage proves shot planning, current-hole HUD, pointer-lock
  fallback, shot-origin restoration, landing preview, radio controls, forward
  cart view, all-hole completion, save/resume, and console health.
- Human gate: play all three holes and record swing feel, cart feel, camera
  comfort, missed dialogue, and any moment where the next action is unclear.

## Known follow-up gaps

- Share one authored obstacle index between walking, carts, and ball physics.
- Decide whether mid-hole state should persist or the documented tee checkpoint
  remains the intentional recovery boundary.
- Add separate confirmed restart-hole and restart-round actions.
- Expand the map with hazard fills, wind, and selected-club landing range.
