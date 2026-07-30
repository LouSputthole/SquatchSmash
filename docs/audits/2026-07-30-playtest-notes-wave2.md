# Owner playtest notes — 2026-07-30 afternoon (wave 2)

Four Opus worktree agents were dispatched on these (one per scene) at ~16:00-
16:52 and were IN FLIGHT when the owner restarted the machine. PICKUP:
check each worktree below for committed work (`git -C <path> log --oneline
-3`); cherry-pick any complete commit onto the canonical branch, run that
scene's gates, push branch + main. For unfinished ones, re-dispatch using
the note lists here (they are the authoritative briefs).

Worktrees (under .claude/worktrees/):
- agent-a5774f145f70ef925 — APARTMENT pass
- agent-a11d2e02d2e5b2077 — BADA BING pass
- agent-ad6bc9acb65412373 — BEEF RUN pass
- agent-a558089b141edc50d — SILVER ROOM pass
Known tooling bug: fresh worktrees may spawn at stale base c68c883 — agents
were instructed to reset to origin/integration/post-airstrip-prep-20260729.

## APARTMENT notes
- Eggs: nothing happens while cooking — an egg should visibly cook in the pan
  (white/yolk, progress over the 11s, sizzle exists).
- Mushrooms still slightly overlap the pizza box on the coffee table.
- Kitchen sink needs an actual basin.
- Shower: entered facing the wrong way and couldn't turn around.
- Toilet: no actual bowl; add water in it.
- Pooping should also pee (systems exist; combine).
- PC: while seated at the computer ALL keystrokes go to the computer —
  no player movement while typing. Q remains the stand-up escape.
  (verify:computer must stay green; assert WASD doesn't move player seated.)

## BADA BING notes
- Stage front has no collision — NPCs walk through it (deck/runway/thrust
  need nav colliders).
- Front dancer should be the blonde.
- Fix hair on the performers (block hair cap reads wrong; shaped hair masses).
- Booth seating: NPCs collide through booths/tables.
- A booth collides over the bathroom entrance.
- Lou's office: back-right poster or TV floating.
- Lou's chest "ring" should read as a necklace (chain + pendant ON the chest).
- Exiting a conversation restarts it — dialogue should persist/resume;
  replay only after completion.
- The package should be subtly highlighted and more ominous.
- Office + entryway pictures still floating off walls (~flush to 1-2cm).
- NPC arms pass through their chests (clamp gesture/idle swing).
- Leaving as part of the quest unclear — E prompt at the front door to leave
  (keep the drive-out exit too).
- Pointer lock: losing it forces hold-button drag forever — every canvas
  click should re-attempt real lock.
- Blackjack: cards still hard to see; explicit WIN/LOSE moment; card/chip
  sound cues (author manifest entries card.deal/card.flip/chip.stack, no
  generation; synth fallback).
- Store room: overlapping objects, needs a pass; add an easter egg.
- Bing bathroom toilets need work (bowls + water like the apartment ask).
  (verify-bing constraints: performer height 1.55-1.95, booths[0] must stay
  BLOCKED for [Q]-unstuck, exits.length===9, zero repeated ramps.)

## BEEF RUN notes (never touch physics/engines/config; check:flight x2 identical)
- One tree really close to the hangar (extend scatter exclusion to apron).
- Wheel frame not attached to the plane — slightly wide of it.
- Wing support struts run wing→thin air; invert to wing→fuselage both sides.
- Plane wing intersects the hangar; move parking a few feet clear (move
  anchors, incl. louStand with it).
- Old Stove frozen by the plane: have him WALK out near the end of the
  preflight, arriving before gun-loading so nothing repeats.
- GUIDED PREFLIGHT (the big one, said twice): objective names the next item,
  pulsing marker at the check point, HUD checklist done/next/remaining.
- Compass while flying: bearing caret on the heading tape + distance to the
  current objective (El Hueso out, WP home).
- Fuel drain: visible stream + puddle, dirty running clear.
- Real squatch logo (drawSquatchSilhouette) on the fuselage sides.

## SILVER ROOM notes (src/silver only; bing/cast.js was owned by the Bing pass)
- Spawn funky: car too close/intersecting street props; give arrival room.
- Subtly direct the player to the SIDE (alley) entrance — that's the bit.
- Front entrance queue should be an actual LINE along the rope, facing the
  door (they stand around randomly).
- Service bar NPC is in the wall.
- Stairs down from the kitchen: opaque at the top (occluder at eye height).
- Path from kitchen out to the front table unclear — guide (maitre d'/marks).
- Camera snaps down when the host talks with the manager — hold on them.
- Table lamps GLARING with bloom — tone down massively; Margo must be
  visible across the table (measure luminance).
- MARGO: hair should come down on the side; face needs work ("ugly as a
  mug") — DEFERRED to coordinator: needs the shared figure builder after the
  Bing pass lands.
- Ape intersects the waiter when he comes to the table.
- Seating at the pillar-adjacent tables misaligned.
- Talking loops happen — guard re-firing dialogue nodes.
- The waiter stands around after serving — send him back to station.
- The performance: they just shake and face the wrong way — face the
  audience, real moves.
- Marquee sign bloom too strong to read.
- Wall stuff floating/hanging — seat sconces/frames to their walls.
- Overall: one full flow pass for pacing snags.

## FUTURE FEATURE (owner, 2026-07-30 ~16:55)
Booski at the bar in the Bada Bing: you can talk to him and he offers you a
shot; when he orders it he YELLS "I want that shot in 30 fucking seconds"
and a quick cutscene shows the bouncer hustling over with the shot.
(Needs: Booski figure at the bar [face photo booski.png, block style], a
dialogue node, the yelled VO line [voice `booski`], a short camera beat on
the bouncer's delivery, and the shot handed to Tony — drink system exists.)

## SOUND REDO LIST (owner) — regenerated 2026-07-30 pre-restart
gun.shot (meatier/more powerful) · footstep.rug · footstep.tile ·
poop.4 (was "very weird") · car.engine.start — all reprompted + regenerated
with --force. If any still miss, tweak the prompt in assets/sfx/manifest.json
and rerun `npm run sfx -- --only <names> --force`.
