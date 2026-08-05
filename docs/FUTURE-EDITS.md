# FUTURE EDITS — the cross-scene list

Things worth fixing that are **not** being fixed yet, because fixing them now
would either be premature or would have to be done twice.

**The rule this file exists to enforce.** When a pass finds a fault in a scene
it does not own, or a fault whose right fix depends on a decision nobody has
made, it goes here rather than into the scene. That is how the mansion siege
was built without editing the mansion, and the same discipline applies
everywhere else.

**The mansion's own list lives in `docs/MANSION-SIEGE-NIGHT.md` PART XIV** and
is not duplicated here — that list is about one building and is read alongside
the siege it came out of.

Columns: **Edit** · **Problem** · **Why** · **Scenes** · **Geometry?** ·
**Nav?** · **Art only?** · **Priority** · **Duplicate-work risk** · **When**

---

## Beef Run — the mountain airstrip

Owner, 2026-08-05: *"fix the trees at the mountain airport el huego"*

| Edit | Problem | Why | Scenes | Geom | Nav | Art only | Priority | Dup risk | When |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fix the trees at the mountain airstrip | Owner-reported on sight. The strip's jungle scatter is two InstancedMeshes — `jungleTrunks` and `jungleCrowns` in `src/beefrun/airstrip.js` around line 414 — placed from one random scatter with no terrain query per instance, so trunks stand off the slope, crowns and trunks can disagree, and the whole stand reads as a decal rather than a hillside | It is the first thing the player sees on approach and it is the shot the mission is named for | Beef Run | no | no | yes | **high** | low | next pass |

**Note on the name.** The owner calls this strip *El Fuego*. That name appears
nowhere in the repository — the module is `src/beefrun/airstrip.js` and the
mission flag is `mountainLanding`. Either the strip should be named El Fuego
in the fiction (signage, radio calls, the map) or the owner means a different
place. **Ask before naming anything.**

What "fix the trees" most likely means, in the order worth checking:

1. **Trunks not on the ground.** The scatter picks `x, z` and asks the terrain
   for `y` once; if the crown is placed from the same `y` with a fixed offset
   rather than from the trunk's own top, a tree on a slope splits.
2. **No slope alignment.** Every tree is vertical. On a mountain flank that
   reads as cardboard; a small tilt toward the downhill normal fixes it for
   almost nothing.
3. **Uniform scale and spacing.** One `rand()` on a narrow range makes a
   plantation, not a jungle.
4. **Trees on the runway, the apron and the taxi line.** The scatter needs to
   exclude the operating surface, and it is worth checking whether it does.
5. **Draw distance popping.** Instanced trees appearing in rings as the
   aircraft closes.

---

## Enola Squatch

| Edit | Problem | Why | Scenes | Geom | Nav | Art only | Priority | Dup risk | When |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ~~Nose art~~ | **Done 2026-08-05.** Both paintings delivered and on the port forward fuselage — name forward, pin-up aft, 0.34 m apart | — | Enola | — | — | — | — | — | landed |
| The autopilot has no idea the ground is coming up | It holds an ALTITUDE, correctly and very well — measured in still air it sits within 1–5 m for as long as you leave it. The eastbound route CLIMBS: across the three kilometres the aeroplane covers in forty-five seconds of cruise, the terrain goes from 153 m to 481 m. So the clearance falls from 371 m to 45 m and then the hill arrives, the physics reports `onGround`, the autopilot drops out with the reason "on the ground", and an aeroplane with nobody in the seat noses over and dives 350 m into the deck | **The player is invited to leave the seat.** The whole tail-gun beat is "engage the gyro and climb into the turret", and the mission does not tell him the ground is rising. The first warning is the autopilot leaving, which is also the last moment he could have done anything. Found while making `verify:enolasquatch`'s autopilot check deterministic — the check had been flying a bomber into a mountain and blaming the control law | Enola | no | no | no | **high** | low — it is a warning, not a control change | before the next Enola playtest |

**What it is not.** Do not "fix" this by making the autopilot climb over terrain. An autopilot that quietly changes your altitude is worse than one that gives up, and the drop-out is honest. What is missing is the *warning*: an AGL floor that calls out ("terrain — she is going to walk into that ridge"), a HUD number that goes red, or Sasole saying something. The player needs the seconds before the hill, not a machine that flies for him.

| The nose art is outside the art manifest | `tools/check.mjs` builds `VALID_SLOTS` from five hard-coded scene sources, none of them `src/enolasquatch/`, so an `enolasquatch.*` row in `assets/art/manifest.json` fails the build. `livery.js` loads both PNGs straight from `assets/art/` instead | **Low, and lower than it first looked.** The manifest is a *slot* system — a place on a wall, a file to fill it, a procedural placeholder when empty — and two fixed paintings on a fuselage are not that shape. It costs one thing only: the two files are invisible to any tool that walks the manifest to find art | Enola | no | no | no | **low** | low | whenever `check.mjs` is next opened |

---

## The home theatre

| Edit | Problem | Why | Scenes | Geom | Nav | Art only | Priority | Dup risk | When |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| The film | `assets/video/the-feature.mp4` has never been delivered; the projector's 404 is currently the expected behaviour a verifier asserts | The mansion's evening-before-bed hub has a "watch a film with two of the cast" beat that keys dialogue off the channel | Mansion, Mansion hub | no | no | yes | med | none | owner-owed |

---

## Shared systems

| Edit | Problem | Why | Scenes | Geom | Nav | Art only | Priority | Dup risk | When |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A real shotgun in `core/weapons/catalog.js` | There is no shotgun. The siege's `shotgun` rusher role carries the revolver's model and cues with close-range numbers | A rusher who arrives holding a revolver reads as a bug | Siege, Cartel palace, Heist | no | no | no | med | low | before the palace |
| `cylinder()` and `sphere()` keep their `name` | Both silently DROP the `name` option in `src/world/build.js`; only `box()` keeps it. Thousands of meshes across the game are unnamed and therefore unassertable | Every verifier that names geometry is blind to them | all | no | no | no | **high** | med — many verifiers assert on names | with the geometry pass |
| Step-over in `Player._resolve` | A collider is skipped only when its top is below the feet, so nothing lying on a floor can be solid — a 0.5 m chair would be a 0.5 m wall | Combat scenes want low cover you can shoot over and walk round, not walls | Siege, Heist, Cartel palace | no | yes | no | med | high — changes movement everywhere | its own pass, with a verifier |

---

## Known and deliberately not fixed

| Thing | Why it is left |
| --- | --- |
| `verify:heist` fails 2 of its checks on `main` — "Lou is on the job as well as at the end of it", "post-heist apartment hides packed gear" | Pre-existing, unrelated to any current work, and the heist is not the scene under construction. Fix it in a heist pass, not in passing |
| `verify:bing` is 157/158 on Willy's belly margin | One margin, long-standing, cosmetic |
| Old Stove's missing face in the Bing | Wiring reads correct end to end; needs an empirical check, not a change |
| `patrol1` / `patrol2` start waypoints clip a lamp post under a stricter probe | Only fails the stricter probe; the men do not visibly clip |
