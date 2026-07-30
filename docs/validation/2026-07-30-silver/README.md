# Silver Room geometry repair — captures, 2026-07-30

Evidence for the fix pass against `docs/audits/2026-07-30-silver-geometry-audit.md`.

Every image is the real page (`silver.html?preview=1`) at 800×450, posed through
the real first-person controller and rendered by the real frame loop with post
FX on — not an editor view. The numbers beside each shot are read back out of
the WebGL framebuffer in the same task as the draw: mean luminance, the
percentage of pixels clipped to white (>250), and the percentage effectively
black (<12).

`before/` is the identical shot list run against the branch point, `a06b16f`.

| shot | before (mean / clipped / black) | after | what it shows |
| --- | --- | --- | --- |
| `01-marquee-from-the-street` | 0.8 / 0% / 98.9% | **7.7 / 0% / 88.2%** | the street set is outside the building, and the sign reads THE SILVER ROOM rather than nothing at all |
| `02-alley-service-door` | 64.0 / 0.2% / 17.7% | **46.9 / 0.1% / 24.6%** | the door opens onto the landing instead of onto brick |
| `03-ramp-bottom-first-person` | 42.6 / 0% / 18.5% | **50.7 / 0% / 3.3%** | walked onto the foot of the up-ramp; eye −0.789 on a floor at −2.449 |
| `04-ramp-mid-first-person` | 138.2 / 2.5% / 0% | **45.3 / 0% / 12.4%** | mid-ramp. The old frame is bright because the camera is *inside* the prep kitchen's floor slab; eye 0.371 on a floor at −1.289 in both, so the 1.29m was all overhead geometry |
| `04b-ramp-from-the-top` | — | 160.2 / 2.0% / 0% | the ramp well, cut out of the prep floor, railed on both sides |
| `05-kitchen-line` | 196.9 / 3.7% / 0% | **154.9 / 0.8% / 0%** | the line, the hood and the pass, no longer blown |
| `06-dining-room-wide` | 44.5 / 0.3% / 10.8% | 43.3 / 0.3% / 8.8% | no table inside a column |
| `07-dining-south-edge` | 68.9 / 0.8% / 7.6% | **79.7 / 0.8% / 0%** | the south edge is a wall with two lit doorways, not 15.7m of open carpet |
| `08-stage-from-his-seat` | 6.2 / 0% / 93.5% | **14.2 / 0% / 68.1%** | the stage, from his chair, before the band |
| `09-service-corridor` | 16.6 / 0% / 69.6% | **40.0 / 0.1% / 25.0%** | behind the south wall. `roomAt` there answered `outside` before; it answers `service` now |
| `10-lobby-doorway` | — | 40.7 / 0.1% / 5.6% | the front-of-house doorway behind the host station, which had a wall standing in it |

## The two shots that are load-bearing

`03`/`04` are the multi-floor claim. The camera is not placed — the controller
is put on the cellar floor and walked up the ramp, and the eye height printed
under each is `camera.y` against `player.ground`. Both are exactly 1.660 apart,
which is the assertion: the man's eye stays a head above the floor he is
standing on the whole way up, and the floor he is standing on is the one he can
see.

`01` is the first blocker. The pavement, the canopy, the posts, the rope line,
the doorman and the sign were all authored at z < 34.2, which is the inside face
of the frontage — the entire street set was built in the lobby, and `roomAt`
under the marquee answered `lobby`. Each z is now its own reflection about the
facade.

## Reproducing

The rigs that made these are deliberately not committed: they are scratch, and
what they assert has been moved into `tools/verify-silver.mjs`, which now:

- sweeps every route leg at 200mm against every collider at walking height;
- checks `roomAt` on every route node against the room the node claims;
- floods the building on a 250mm grid with the player's own capsule, from the
  mouth of the alley, and requires eleven named rooms to be reachable;
- tests the middle of all twelve doorways for a wall standing in the opening —
  reachability alone will not see that, because the lobby was still reachable
  the long way round through the staff corridor while its own front-of-house
  doorway was bricked up;
- and drives the real companion over the whole route with collision on,
  requiring zero `_stuck` recoveries.

The last two were added after the first four passed and the doorway test
immediately found two more sealed openings, one of which was a wall whose top
edge sat *exactly* at floor level — invisible, and 250mm from a doorway.

    npm run verify:silver
