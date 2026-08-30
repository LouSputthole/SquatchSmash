# THE TAKE escape-car evidence

Measured 2026-08-27 from the shared `GroundVehicle` and the real
`heist.html?preview=1&checkpoint=vehicle_escape` runtime. No handling value was
changed in this pass: the current car met its authored targets without a new
vehicle or audio framework.

## Owner targets and previous behavior

- *"I would like the car to be able to go a little bit faster, so like at
  least 90."*
- *"the car is a little wonky. It could use a little refinement."*
- *"engine sounds are bad."*

The historical measurements already preserved beside the tune were 58.2 mph
for the old 24–28 m/s configuration, and 65.4 mph after raising the clamp while
leaving drag at 0.014. That is why the contract measures achieved speed rather
than accepting `maxForwardSpeed` as proof.

## Deterministic vehicle contract

`tests/ground-vehicle.test.mjs` advances the same configured `GroundVehicle` at
120 Hz, with no scene geometry or pursuit interference.

| Measurement | Current result | Contract envelope |
| --- | ---: | ---: |
| 0–60 mph | 2.817 s / 39.21 m | 2.75–2.90 s / 38–41 m |
| 0–90 mph | 7.600 s / 211.29 m | 7.50–7.70 s / 208–215 m |
| Reach steady clamp | 9.733 s | 9.60–9.90 s |
| Steady top speed | 91.71454 mph | 90–100 mph |
| Full brake from 60 mph | 1.633 s / 22.90 m | 1.55–1.75 s / 21.5–24.5 m |
| Full steer for 0.25 s at 60 mph | 35.48° yaw / 6.78 m | 33–38° / 6.4–7.1 m |

The quarter-second steering sample is intentional. A full second at full lock
is an authored ninety-degree city turn, not a lane-placement input.

## Live browser evidence

Run the focused half of the existing, scheduled THE TAKE verifier:

```powershell
$env:HEIST_VEHICLE_ONLY='1'
npm run verify:heist
```

The focused run starts at the public `vehicle_escape` checkpoint, clicks into
the real canvas, and sends real W, A, and Space keyboard events. SwiftShader is
too slow for wall-clock physics, so the verifier advances the scene's real
`updateDriving` fixed-step path after confirming those keys reached the input
adapter. It never substitutes another vehicle model.

Measured active-play results:

| Measurement | Browser result |
| --- | ---: |
| 0–60 mph | 2.808 s / 39.21 m |
| 0–90 mph | 7.592 s / 211.29 m |
| 0–91.7 mph | 9.692 s / 296.73 m |
| Full brake from 60.26 mph | 1.633 s / 23.05 m |
| Full steer for 0.25 s at 60 mph | 35.55° yaw / 6.80 m |
| Collision damage during all measurement runs | 0 |

The active-play frame is regenerated at
`artifacts/heist/job7-vehicle-escape-active.png` by the focused verifier.

## Engine and tyre mix

The browser evidence reads AudioEngine's live loop handles, including the
synthesised-loop path, rather than repeating the mix formula in the verifier.

| State | Gear | Engine rate | Engine volume | Engine cutoff |
| --- | ---: | ---: | ---: | ---: |
| Idle | 0 | 0.8135 | 0.1842 | 2,400 Hz |
| 60 mph, throttle down | 3 | 1.2315 | 0.4105 | 6,200 Hz |
| 90 mph, throttle down | 3 | 1.6091 | 0.5529 | 6,200 Hz |
| 91.7 mph, throttle lifted for 0.75 s | 3 | 1.5140 | 0.4671 | 2,400 Hz |

All four gears appeared in order. The live shifts occurred around 14.55,
28.03, and 42.63 mph. Both engine and tyre loops remained active through the
loaded-to-coast transition; neither clicked, stacked, or restarted. Pitch and
volume rose with road speed and load, while lifting the throttle closed the
filter and reduced both rate and volume.

## Progression and remaining judgment

The same checkpoint run crossed all six existing route nodes in order and
landed at `VEHICLE_SWAP` with the pursuit hidden. It recorded zero page errors,
console errors, and failed network requests.

This evidence says the current values are deterministic, responsive, connected
to the actual audio graph, and progression-safe. It cannot decide the last
human-feel question: whether 35.5 degrees of yaw from a quarter-second full
steer is the owner's preferred amount on their own keyboard and speakers. That
remains the one useful playtest; there was no measured defect that justified a
blind retune here.
