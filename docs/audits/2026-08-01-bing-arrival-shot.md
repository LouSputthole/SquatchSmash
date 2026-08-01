# Bada Bing arrival and Booskibro shot pass — 2026-08-01

## Owner requests covered

- Finish the Day One arrival sedan interior and stop Tony spawning with his
  head inside a block.
- Keep the camera usable during Booskibro's shot scene.
- Put the bartender in front of Tony and have him pour the shot at the bar.
- Make Booskibro's thirty-second line calmer and less high-pitched.
- Make the phone larger inside the Bada Bing.

## Implementation

### Arrival sedan

`src/bing/vehicles.js` now builds a named cockpit rather than a dash and bench
inside the solid sedan shell. Tony's local eye is `(-0.18, 1.55, -0.43)`,
0.19 m above the shell top. The verifier traverses the interior, rejects any
mesh containing that eye, and requires the seats, gauges, steering wheel, and
at least twenty named cockpit components.

### Shot blocking

`src/bing/main.js` keeps the bartender at his authored station behind the bar.
The pour creates `booski-shot.bottle` and `booski-shot.glass`, plays the pour
and glass-set effects, gives Tony a normal inventory whiskey, and tears the
temporary props down. Player mode is `briefing` only during the pour, which
blocks walking but deliberately permits mouselook. Control returns when the
glass lands, before Booskibro and Tony finish speaking.

`src/bing/cast.js` adds the matching two-arm bartender pour pose. The bouncer
never moves from his post for this beat.

### Voice line

The canonical text is now:

> Ay. I want that shot in thirty fucking seconds.

The manifest specifies the calmer future generation at stability `0.58` and
style `0.22`. ElevenLabs generation was unavailable because no API key exists
in the current process, user, machine, or project environment. The checked-in
take is therefore an interim transform of the existing recording (slower,
lower, and less sharp), not a newly acted performance.

### Phone

The raised phone is 360 px wide when space permits and remains 312 px wide in
the verifier's 320 px viewport. Its lower-right pocket, icon, padding, and
instruction text were enlarged with it.

## Evidence

```text
npm test             94/94 passed
npm run verify:bing  142/142 passed
```

The browser verifier confirms decoded voice playback, car geometry and safe
exit, live mouselook during the pour, bartender placement/pose, physical
bottle and glass, inventory handoff, prop cleanup, post-shot dialogue state,
phone sizing/navigation, and no runtime console errors.

Screenshots:

- `docs/validation/2026-08-01/bing-arrival-car-interior.png`
- `docs/validation/2026-08-01/bing-phone-large.png`
- `docs/validation/2026-08-01/bing-booski-bartender-pour.png`
