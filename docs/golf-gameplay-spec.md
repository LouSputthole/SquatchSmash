# A Morning at Silver Pines — gameplay target

Silver Pines is a polished arcade-golf story scene: three authored holes,
three recognisable clubs, a readable three-click swing, real ball flight,
playable retrieval, and character dialogue that never becomes an obstacle. It
is not a bag-management simulator and it is not laser-guided golf.

## Complete player loop

1. **Read the shot.** Show pin and plan distance, lie, wind, hazards, and a
   truthful dispersion area. Each tee supplies a safe default target; the
   player may override it.
2. **Choose a tool.** Driver is long and least controlled, iron covers full
   shots through chips, and putter stays on the ground. The UI recommends but
   never forces a club.
3. **Execute.** Click or Space to start, set power, and strike. Controlled
   power is forgiving; overswing narrows and accelerates the timing window.
4. **Watch the shot.** First-person hands and the selected club animate during
   the live swing. A short world tracer and result card report strike, power,
   total distance, lie, and remaining distance.
5. **Retrieve.** Control returns to the pre-shot stance after the flight
   camera. Long shots use the live carts; short shots remain walkable.
6. **Recover.** Water and OOB block address until a legal one-stroke drop. A
   true tap-in may be picked up with G for exactly one stroke.
7. **Score and continue.** The current-hole HUD follows every rebuild, each
   finished hole persists once, and reload resumes at the next unfinished tee.

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

- Driver, iron, and putter are readable in the camera-mounted hand rig.
- The regulation ball keeps its physics scale; marker and tracer carry
  visibility.
- Essential UI remains legible at 1280×720 and a 480×300 verifier viewport.
- Browser coverage proves shot planning, current-hole HUD, pointer-lock
  fallback, shot-origin restoration, tracer/result presentation, live cart
  driving, dialogue gates, all-hole completion, save/resume, and console health.
- Human gate: play all three holes and record swing feel, cart feel, camera
  comfort, missed dialogue, and any moment where the next action is unclear.

## Known follow-up gaps

- Share one authored obstacle index between walking, carts, and ball physics.
- Decide whether mid-hole state should persist or the documented tee checkpoint
  remains the intentional recovery boundary.
- Add separate confirmed restart-hole and restart-round actions.
- Expand the map with hazard fills, wind, and selected-club landing range.
