# NO WAKE production scene

NO WAKE is the Day Three bridge from the Jerky Motel to Front and Center. It is
not a standalone greybox: it is registered in campaign schema v3 and uses the
same player, HUD, interaction, audio, post-processing, character, preview,
navigation, save-recovery, bullet-impact and browser-verification foundations
as the rest of Squatch Life.

## Campaign contract

`day_two` sleep after the Motel opens `no_wake` at noon. Big Uncle Lou's vague
dock call unlocks the mission and departure lands at 12:45 PM. Completing all
three irreversible facts — betrayal confirmed, Tony fired, body disposed —
lands at 4:40 PM, changes the apartment chapter to `date`, and allows Margo's
existing call to unlock Front and Center.

Schema v2 saves already at `date`, Silver Room, or Initiation are migrated as
having completed NO WAKE so an update never rewinds an existing player. Earlier
v2 saves receive the new mission normally.

## Playable flow

1. Walk Gate C and board the 38-foot early-1990s cabin cruiser.
2. Battery, bilge blower, ignition, bow line, stern line, helm.
3. Reverse out and drive the marked channel for at least 90 seconds. Fixed-step
   handling models forward/reverse thrust, speed-dependent rudder authority,
   drag, turning inertia, RPM, heave, roll, pitch, bow lift and a pooled wake.
4. Idle in open water. The reveal cites the campaign's Beef Run and Motel state.
5. Willy goes below; Lou and Booski prepare; Willy returns.
6. The scene waits for Tony's click. Lou and Booski fire only after him.
7. Hold the body interaction, then ride back in silence.

Willy, Lou and Booski use stable campaign identities and the Bing figure rig.
Willy's `gut: 1` profile is the same permanent body presentation used in his
earlier club appearance; the mission never scales his whole model.

## Verification

```bash
npm test                 # campaign/story/migration unit suite
npm run verify:no-wake   # full real-browser mission path and screenshots
npm run verify:preview   # launcher plus byte-preserved canonical storage
```

The NO WAKE verifier checks production boot, stable cast identity, permanent
Willy body shape, mooring safety, propulsion, checkpoints, wake, campaign-aware
reveal, four-shot execution, disposal, date handoff, preview isolation and
uncaught browser errors. It writes representative frames in
`docs/validation/2026-07-31/`.
