# NO WAKE production scene

NO WAKE is the Day Three bridge from the Jerky Motel to Front and Center. It is
not a standalone greybox: it is registered in campaign schema v5 and uses the
same player, HUD, interaction, audio, post-processing, character, preview,
navigation, save-recovery, bullet-impact and browser-verification foundations
as the rest of Squatch Life.

## Campaign contract

`day_two` sleep after the Motel opens `no_wake` at noon. Big Uncle Lou's vague
dock call unlocks the mission and departure lands at 12:45 PM. Completing all
three irreversible facts — betrayal confirmed, Tony fired, body disposed —
lands at 4:40 PM, changes the apartment chapter to `date`, and allows Margo's
existing call to unlock Front and Center.

Schema v3 saves already at `date`, Silver Room, or Initiation are migrated as
having completed NO WAKE so an update never rewinds an existing player. Earlier
v3 saves receive the new mission normally; v2 saves first receive the canonical
whiskey migration, follow the same v3-to-v4 inference, and then gain the v5
radio continuity record.

## Playable flow

1. Walk the rebuilt Gate C marina and board the 42-foot early-1990s cabin cruiser.
2. Operate the modeled battery rocker, bilge-blower button, ignition key, boat
   stereo, bow line, stern line, and helm. The stereo runs the shared 97.8
   station schedule, talk segments and music manifest, with <kbd>R</kbd> skip.
   The two mooring ropes physically span the boat
   and dock cleats until Tony removes them. A full-width port side deck leads
   from the boarding gap to the bow line, with collidered rails at the stem.
3. Reverse out and drive the marked channel for at least 90 seconds. Fixed-step
   handling models forward/reverse thrust, speed-dependent rudder authority,
   drag, turning inertia, RPM, heave, roll, pitch, bow lift and a pooled wake.
   Releasing the controls springs the throttle toward neutral, leaving the
   helm cancels propulsion, and the player remains in the cruiser's moving
   local frame while walking on deck.
4. Idle in open water. The reveal cites the campaign's Beef Run and Motel state.
5. Willy goes below; Lou and Booski prepare; Willy returns.
6. The scene waits for Tony's click. Lou and Booski fire only after him.
7. Hold the body interaction, then ride back in silence.

The cruiser now carries an authored wheelhouse, instrument cluster,
chartplotter, VHF, interactive marine stereo, compass, twin throttle, seating, engine hatches, safety
equipment, fenders, navigation lights and deck hardware. Its rails, cabin,
helm, seats and deck equipment have boat-local collision so their blockers
move and rotate with the vessel. The marina adds individual dock planks,
pilings, bumpers, shore power, hose and safety equipment. Its neighboring
craft are detailed tapered-hull runabouts rather than floating box stand-ins.
The startup controls occupy one compact, non-overlapping fascia, while layered
wave, fresnel, ripple and glint shading provides the denser water surface. Its
resting hull is lowered 14 cm from the prototype pose, producing a measured
0.94 m draft, 0.81 m side freeboard and 1.06 m deck freeboard instead of
visually balancing on the chine. The generated port and starboard hull panels
also use outward triangle winding; exterior faces no longer disappear through
back-face culling and leave the rub strip or transom apparently detached.

The shared player controller now supports a grounded <kbd>Space</kbd> jump.
Jump height is measured above the current floor frame, allowing the deck to
heave and turn under Tony without detaching him from the cruiser.

Willy, Lou and Booski use stable campaign identities and the canonical Bing
figure rig. NO WAKE deliberately leaves the shared cast anatomy unchanged.
Tony's execution view-model reuses the canonical six-shot revolver carried
forward from the Motel. Lou and Booski use a reusable detailed 9mm
semi-automatic model with a separate slide, frame, barrel, sights, controls,
trigger, guard, grip, magazine base and authoritative muzzle point.

Dialogue currently ships subtitle-first. The runtime will play a future exact
`vo.<beat>` recording when present, or choose from a `vo.<beat>.*` variant bank,
without changing the mission script. Ambient and action sound uses canonical
manifest cues plus the authored `boat.engine.idle` and `water.splash` cues.

## Verification

```bash
npm test                 # campaign/story/migration unit suite
npm run verify:no-wake   # full real-browser mission path and screenshots
npm run verify:no-wake -- --no-screenshots # same checks without image writes
npm run verify:preview   # launcher plus byte-preserved canonical storage
```

The NO WAKE verifier checks production boot, cruiser scale and detail,
modeled compact startup controls, shared boat radio, measured waterline,
connected mooring ropes, bow-line access,
grounded jump/landing, detailed neighboring craft, boat-local collision,
stable cast identity, safe mooring, helm-neutral
propulsion, moving-deck player carry, checkpoints, dense water and wake,
campaign-aware reveal, canonical revolver and detailed 9mm models, four-shot execution, disposal, date handoff, preview
isolation and uncaught browser errors. It writes representative frames in
`docs/validation/2026-07-31/`.
