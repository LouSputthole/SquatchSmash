# NO WAKE production scene

NO WAKE is the Day Three bridge from the Jerky Motel to Front and Center. It is
not a standalone greybox: it was introduced in campaign schema v4 and remains
registered in the current schema v6 route, using the same player, HUD,
interaction, audio, post-processing, character, preview, navigation,
save-recovery, bullet-impact and browser-verification foundations as the rest of
Squatch Life.

**The scene was rebuilt to `docs/NO-WAKE-REDESIGN.md` on 2026-08-06.** That
document is the spec; where this one and it disagree, it wins. What follows is
what the build actually is.

## Campaign contract — unchanged by the redesign

`day_two` sleep after the Motel opens `no_wake` at noon. Big Uncle Lou's vague
dock call unlocks the mission and departure lands at 12:45 PM. Completing all
three irreversible facts — betrayal confirmed, Tony fired, body disposed —
lands at 4:40 PM, changes the apartment chapter to `date`, and allows Margo's
existing call to unlock Front and Center.

Schema v3 saves already at `date`, Silver Room, or Initiation are migrated as
having completed NO WAKE so an update never rewinds an existing player. Earlier
v3 saves receive the new mission normally; v2 saves first receive the canonical
whiskey migration and then follow the same v3-to-v4 inference.

Checkpoints are `dock`, `underway`, `open_water`, `execution`, `weighted`,
`returned`. `weighted` was added with the redesign because everything between
the shot and the ballast is a chain of authored holds, and a player who stops
after clipping the iron on should not have to sit through the confrontation
again.

## The boat

A fictional 35–36 ft late-1980s express cruiser, laid out like a stretched 270
Sundancer: cream fiberglass with a burgundy stripe, a smoked wraparound
windshield, analog gauges, chrome throttle levers, cream vinyl with weathered
seams, teak, brass fixtures, an amber cabin light and twin inboards. 10.6 m of
hull, 4.40 m of beam, floating on a measured 0.88 m draft with 0.84 m of side
freeboard and 1.10 m from the water to the cockpit sole.

She has **two walkable levels** — the cockpit sole at 1.02 and the cabin trunk
roof at 1.70, joined by a ramp under the windshield's centre walk-through —
and **one walkable interior**, the cabin, on its own sole at −0.20 with 1.82 m
of headroom. `DECK.heightAt(z)` in `src/nowake/deck-collision.js` is the single
source of the deck's height; the ground query, the boarding pose, both unit
sweeps and the browser verifier all read it, so there is no second copy.

- **Stern.** A broad swim platform 0.21 m above the water — the disposal point
  — with a swim ladder, a starboard transom gate, a low stern rail, mooring
  cleats and a storage hatch.
- **Aft cockpit.** U-shaped cream seating that **opens to starboard**, so the
  passage from the companionway to the transom gate is clear the whole way:
  that is the route the body takes. A mounted cocktail table, cupholders, an
  ashtray, coiled lines, life jackets, the engine hatch and wet footprints.
  Nobody gathers here during the confrontation.
- **Helm, to starboard.** Wheel on a raked column standing 0.40 m proud of the
  fascia, twin chrome throttle levers, and one row of switches at hand height:
  battery selector, blower, fuel valve, port ignition, starboard ignition,
  navigation lights. Two tachometers, knots, fuel, depth, a compass, warning
  lamps and a VHF.
- **Bow.** The full beam, 4.12 m across, because the mooring line and the
  ballast locker are up here and reaching them used to be the tightest thing on
  the boat. Stainless rail, sun pad, anchor hatch, forward locker with the
  cast-iron ballast in it, navigation light, rope coil and a searchlight.
  **Irish stays here for the entire mission.**

## Below deck

The companionway — deliberately wider than a real one, because the two-person
carry has to fit through it — drops into a warm enclosed cabin. Port is the wet
bar and galley: veneer counter, stainless sink, mirrored liquor cabinet, the
tequila, four heavy-bottomed glasses, a mini fridge, an amber strip under the
cabinet and one fixed swivel stool. Starboard is the curved dinette with a
mounted table and **a deliberately low back**, so the man sitting in it is
never behind a wall. Forward is a V-berth behind a curtain, for depth. The aft
bulkhead carries a closed head door to starboard and a mid-cabin berth to port.

Engines go muffled and physical down here: `NoWakeEngineAudio.setEnclosure()`
closes the sole filter and drops the level, and closing the companionway doors
closes it further. A radio plays faintly on the counter until Lou shuts it off.

## Playable flow

1. Dusk at an isolated Gate C finger. Irish is already aboard with binoculars,
   Booski is near the stern, Lou is by the helm. Willy says "Nice night for it."
   and nobody answers him. **BOARD THE BOAT.**
2. **COMPLETE THE STARTUP PROCEDURE**, in the spec's order: battery, blower,
   fuel check, port engine, starboard engine, nav lights, dock line, helm. The
   player performs it while everyone waits in silence — there are no comedic
   failure reactions and Lou says nothing however long it takes.
3. Out through the no-wake channel for ninety seconds and 360 m. The board
   passes to starboard, the marina lights fall away, the houses thin out, and
   four lines are spoken, two of them one word. One of those four is derived
   from the player's own campaign — whether the Beef Run was detected and how
   hot the Motel got.
4. **The inlet**, behind a wooded point with a quarry face opposite. "Bring her
   down." Then "Kill them." The hull is kinematically locked from that moment
   until the player restarts the engines to leave. Four seconds of nothing, then
   Irish reports the channel clear. **GO BELOW DECK.**
5. **The cabin scene.** The player keeps camera control and is clamped to a
   small staging area at the foot of the stairs. Booski closes the
   companionway, glances at Lou, pours one shot and slides it across. Willy
   tells the Mirage story because nobody else will speak. Lou waits, and then
   asks whether there was ever a Negev on B. No confession, no begging: Willy
   sits down and says "All right."
6. **DRAW YOUR WEAPON.** Movement locked, aim free, no countdown. When the
   player fires, all three fire on the same beat and keep firing — four volleys,
   three shooters. Willy slumps against the booth and drops forward; the shot
   glass vibrates, rolls across the sole and stops against the sink.
7. **The body.** The tarp comes out, the player rolls him onto it, and the
   ragdoll is **swapped for the shared wrapped-body prefab** before anything is
   carried. The player folds his side, Booski the other, the player fastens the
   authored straps and Booski closes the bag. No knot simulation.
8. **The weights.** Up on deck — the open air after the cabin — to the forward
   locker, past Irish, who does not turn round. Back below, clip the iron to the
   authored sockets, Booski cinches it. Checkpoint.
9. **The carry.** One authored parameter drives the bag, Booski and the player
   together along eight waypoints: lift, rotate to the companionway, up the
   stairs, through the cockpit, out the transom gate, down on the platform. Lou
   follows and does not help.
10. **DUMP THE BODY.** One strike on the water, it sinks, it is gone, and the
    camera holds on the water for five seconds. Nothing comes back up.
11. **LEAVE THE INLET.** Both engines by hand, wait for Irish to weigh the
    anchor, take the helm, turn her round and run for open water. Nobody speaks.
    At speed the camera looks briefly astern at the wake spreading and smoothing
    over. **MISSION COMPLETE: NO WAKE.**

## Deck and cabin collision

`src/nowake/deck-collision.js` owns both spaces' solid volumes and the capsule
resolver, separately from `world.js`, so both can be swept without a browser.
Two rules hold them open, and each has a gate behind it:

- **No channel narrower than the 0.60 m capsule.** Two solids either overlap
  and become one mass the player walks around, or leave a real gap he fits
  through. Anything between is a position no resolver can satisfy.
  `narrowChannels()` enumerates violations and the unit suite asserts it empty
  for the deck table and the cabin table alike.
- **Contact never costs the player his motion.** Only the velocity driving into
  a surface is cancelled, so he slides along a rail instead of being pinned to
  it, and a squeeze resolves to a stable mid-channel point he can walk out of.

Both gates sweep a grid across every walkable square, drop the player at each
cell, step the simulation, and require every one to settle clear, stable,
aboard, and with somewhere to walk to — on deck, below deck, and with the hull
turned off the world axes.

The routes the owner called tight are asserted as clearances rather than left to
a playtest: 0.98 m between the companionway hatch and the helm console, 1.24 m
through the windshield walk-through, the full 4.12 m beam on the foredeck, and
1.38 m of clear passage from the seating to the transom gate.

## Cast, weapons and wounds

Willy, Lou, Booski and Irish use stable campaign identities and the canonical
Bing figure rig. NO WAKE deliberately leaves the shared cast anatomy unchanged.
Tony's execution view-model reuses the canonical six-shot revolver carried
forward from the Motel; Lou and Booski use the reusable detailed 9mm
semi-automatic. **Irish never carries one** — that is the whole point of him.
Wounds are attached to the man, so they ride his fall and go over the side
inside the bag rather than hanging in the air where he was standing, and they
are applied on one round in four because "no excessive blood" is a tone rule.

## Audio

Dialogue ships subtitle-first. The runtime plays a future exact `vo.<beat>`
recording when present, or chooses from a `vo.<beat>.*` variant bank, without
changing the mission script; every spoken beat holds the floor for the longer of
its authored reading beat and its delivered take. Mouths run on the sound
(`src/core/mouth.js`), never on a clock.

`NoWakeEngineAudio` in `src/nowake/audio.js` adds the twin engines themselves as
a live graph on the shared AudioEngine bus — two firing rates a couple of Hz
apart, block rumble, wet exhaust and a sole filter, all driven by rpm, throttle,
hull speed and enclosure — because a recorded stem plays at one rpm forever and
cannot answer the levers. Its levels were raised with the redesign: the owner's
complaint was that the engines and the water were thin.

Five effects were authored with the redesign and are not recorded yet:
`ambience.ocean.night` (the inlet bed), `boat.engine.rev` (the throttle
answering), `water.lap.hull` (water on the fiberglass heard from the cabin),
`boat.bag.zip` and `boat.ballast.chain`. Both call sites of every conditional
bed are spelled out with literal cue names, because `tools/check.mjs` reads
those call sites to prove a cue exists — and a cue it cannot see is a cue that
can never be given a recording.

The whole 37-line voice bank is unrecorded: the redesign rewrote every line in
the mission. The one line that kept a near-identical meaning took a NEW cue id
(`cruise.willy.sideways`, not `cruise.willy.motel`) precisely so the old
delivered take of different words cannot play under it.

## Verification

```bash
npm test                 # campaign/story/script/deck unit suite
npm run verify:no-wake   # full real-browser mission path and screenshots
npm run verify:no-wake -- --no-screenshots # same checks without image writes
node tools/scene-audit.mjs nowake          # geometry classes
npm run verify:preview   # launcher plus byte-preserved canonical storage
```

The NO WAKE verifier walks the mission rather than calling into it: it boards
through the bridge with a real crosshair and E, runs the startup panel switch by
switch and proves the out-of-order steps refuse, releases the dock line from the
foredeck, takes the helm, drives, kills the engines in the inlet, goes below,
measures the sight line from the player's mark to each of the three men, proves
the staging clamp, plays the script, fires, wraps the body in four holds,
fetches and clips the ballast, samples the carry along its own path, dumps him,
restarts both engines and drives out under the player's own helm. It writes
representative frames in `docs/validation/2026-08-06/`.

`tools/scene-audit.mjs` loads this scene with `?preview=1`. Without it, a fresh
save fails `story.canBegin()`, Start navigates back to the apartment, and the
audit files the apartment's geometry under "nowake" — which is what it did,
undetected, until 2026-08-06.
