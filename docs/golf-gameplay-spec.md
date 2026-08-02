# A Morning at Silver Pines — gameplay target

Silver Pines is a polished arcade golf story scene: three authored holes, three
recognisable clubs, a readable three-click swing, real ball flight, playable
retrieval, and character dialogue that never becomes a cutscene or an obstacle.
It is not a bag-management simulator and it is not a laser-guided golf game.

## Complete player loop

1. **Read the shot.** Show pin and target distance, lie, wind, elevation,
   hazards, and a truthful dispersion area. Each hole supplies a safe default
   landing target; the player may aim elsewhere.
2. **Choose a tool.** Driver is long and least controlled, iron covers full
   shots through chips, and putter stays on the ground. The UI recommends but
   never forces a club.
3. **Execute.** Click once to start, again to set power, and again at the strike
   line. Controlled power is forgiving. Overswing narrows and accelerates the
   timing window. Early opens the face; late closes it.
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
- Lou's private cart exchange cannot be skipped by taking relief early.
- Pointer lock is an enhancement, never a playability requirement. Unlocked
  click plus keyboard aim must complete a swing.
- Tab always opens current instructions during golf. It never changes the
  current beat, shot, dialogue, or score.
- Control returns to the shot origin after ball flight. The player reaches the
  new lie by cart or on foot; flight camera cleanup never teleports gameplay.
- Ball, player, NPCs, and carts share strategic obstacle data. Hole 2's forest
  and dogleg must be real gameplay, not decoration the ball passes through.

## Presentation target

- A first-person hands-and-club rig makes driver, iron, and putter readable at
  address and launches the ball at its impact frame.
- The regulation ball never changes physics scale; a halo/tracer and ground
  marker carry visibility.
- The minimap includes pin, player, ball, carts, path, water, bunkers, wind, and
  selected-club landing range.
- Hole 1 is pond and bunker, Hole 2 is dogleg and corner bunker, and Hole 3 is
  the clubhouse finish. A tee/approach crop should identify the hole.
- Essential UI remains legible without relying on colour and does not overlap
  two subtitle lines at 1280×720 or at a 900 px viewport.

## Performance and verification gates

- NPC impact must not synchronously run a hundred-millisecond shot search.
  Tee solutions are cached and approach solutions are prepared before impact.
- Trees/detail stay instanced, particles are pooled, geometries/materials are
  reused, and rebuilding all three holes does not grow GPU resources.
- Automated checks cover pointer-lock rejection, legal relief, required
  dialogue, player origin after flight, per-hole HUD, all-hole completion,
  reload resume, explicit restart, long-shot transit, tree collision, shot
  curvature, score statistics, and browser errors.
- Human gate: play all three holes on keyboard/mouse and record round time,
  score, missed dialogue IDs, swing feel, cart feel, camera comfort, and any
  moment where the next action was not obvious.

## Prototype verdict

The throwaway state model was run through a normal tee shot, a water tee shot,
and a two-hole reload. It validated three decisions now owned by production:

- relief is a blocking state and returns to the route that was pending;
- required dialogue gates cart exit instead of being skippable;
- saved completed holes resume at the next unfinished tee.
