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
| The autopilot has no idea the ground is coming up | It holds an ALTITUDE, correctly and very well — measured in still air it sits within 1–5 m for as long as you leave it. The eastbound route CLIMBS: across the three kilometres the aeroplane covers in forty-five seconds of cruise, the terrain goes from 153 m to 481 m. So the clearance falls from 371 m to 45 m and then the hill arrives, the physics reports `onGround`, the autopilot drops out with the reason "on the ground", and an aeroplane with nobody in the seat noses over and dives 350 m into the deck | **The player is invited to leave the seat.** The whole tail-gun beat is "engage the gyro and climb into the turret", and the mission does not tell him the ground is rising. The first warning is the autopilot leaving, which is also the last moment he could have done anything. Found while making `verify:enolasquatch`'s autopilot check deterministic. Confirmed on a CLEAN airframe on a fresh page — this is the aeroplane meeting the terrain, not a damaged one sinking | Enola | no | no | no | **high** | low — it is a warning, not a control change | before the next Enola playtest |

**What it is not.** Do not "fix" this by making the autopilot climb over terrain. An autopilot that quietly changes your altitude is worse than one that gives up, and the drop-out is honest. What is missing is the *warning*: an AGL floor that calls out ("terrain — she is going to walk into that ridge"), a HUD number that goes red, or Sasole saying something. The player needs the seconds before the hill, not a machine that flies for him.

| The nose art is outside the art manifest | `tools/check.mjs` builds `VALID_SLOTS` from five hard-coded scene sources, none of them `src/enolasquatch/`, so an `enolasquatch.*` row in `assets/art/manifest.json` fails the build. `livery.js` loads both PNGs straight from `assets/art/` instead | **Low, and lower than it first looked.** The manifest is a *slot* system — a place on a wall, a file to fill it, a procedural placeholder when empty — and two fixed paintings on a fuselage are not that shape. It costs one thing only: the two files are invisible to any tool that walks the manifest to find art | Enola | no | no | no | **low** | low | whenever `check.mjs` is next opened |

---

## The home theatre

| Edit | Problem | Why | Scenes | Geom | Nav | Art only | Priority | Dup risk | When |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| The film | `assets/video/the-feature.mp4` has never been delivered; the projector's 404 is currently the expected behaviour a verifier asserts | The mansion's evening-before-bed hub has a "watch a film with two of the cast" beat that keys dialogue off the channel | Mansion, Mansion hub | no | no | yes | med | none | owner-owed |

---

## Wardrobe — what the appearance ledger found

Owner, 2026-08-05: *"I also want my workshop for the outfits to show every
character and what they are wearing for every scene they are in so we can
review and refine easily."*

`src/core/appearances.js` and the by-character view in `wardrobe.html` are that
workshop. Putting the same person's scenes side by side is what surfaced every
row below — each one was invisible while the outfits were only ever looked at
one at a time, and every one of them is **reported and not fixed**, because
each is a scene edit in a scene this pass does not own.

The ledger carries the same text in its `divergence` fields and the fitting
room prints them beside the figures, so none of this depends on anybody
reading this file.

| Edit | Problem | Why | Scenes | Geom | Nav | Art only | Priority | Dup risk | When |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Captain Lou Sasole is in the wrong jacket on the Enola** | `src/enolasquatch/crew.js` gives him `jacket: 0x5a3a22`, "the same old leather flight jacket". `CAPTAIN_LOU_SASOLE` says sage `0x39544e`, picked *"so that when both Lous are in the same room nobody has to read a subtitle to tell them apart"* | `src/beefrun/npc.js` records that this exact brown-leather-over-khaki literal was the drift the wardrobe was written to end — and it is still live one module over. It is the most direct contradiction of the wardrobe anywhere in the game | Enola | no | no | yes | **high** | low — a colour, or `fromWardrobe(CAPTAIN_LOU_SASOLE)` as the Beef Run already does | next Enola pass |
| **DeathMegatron is a bald bearded man on the bank job** | `HEIST_CREW_PRESENTATION` builds her at 1.88, build 1.30, `hair: 'bald'`, `beard: true`, and the file calls her "the big one". The campaign's DeathMegatron is one of the FIVE: 1.79, `gender: 'female'`, `bodyShape: 'curvy'`, hair tied | The heist predates the pass that gave her the female frame, which is almost certainly the whole explanation. Whatever the answer is, it is not that the same person has a beard in one scene | Heist | no | no | no | **high** | low | with the heist's own pass |
| **Numbskull is the shortest man in the van** | Canonically 1.95 / 1.45 — *"Tallest and heaviest on the roster... takes up a doorway"*. The heist has him at 1.72 / 1.00 and its own comment calls him "the shortest man in the van" | Two sentences about one man that cannot both stand. He is next to Snow and DeathMegatron in that safehouse | Heist | no | no | no | med | low | with the heist's own pass |
| Snow and the Shubenator are re-measured on the job too | Snow 1.70→1.79 / 0.95→1.08; Shubes 1.84→1.81 but build 1.35→1.05, which loses the frame that is his whole read | Same table, same cause as the two above. Rippinflow is the only crew member whose proportions survive the trip | Heist | no | no | no | med | low | with the heist's own pass |
| **The graveyard's Snow has no belt** | `src/graveyard/world.js` types him out inline: same height, build, hair and skin, `shirt: 0x303a44` against the canonical `0x3a4048`, and **no `belt`** | The wardrobe's entire argument about this man is *"He gets a belt and boots and nothing else, and that is the point."* The graveyard drops the one garment he owns. Spreading `SNOW` fixes it in one line | Graveyard | no | no | yes | med | none | any graveyard pass |
| **There are two Big Uncle Lous in the mansion office** | `MansionInterior.js`'s `buildOffice()` sits one in the red carver in `BIG_UNCLE_LOU_MANSION`; `mansion/cast.js` stands another behind the same desk in `BIG_UNCLE_LOU`. `src/mansion/main.js` mounts both, unconditionally, about 1.4 m apart | Two men, one face photograph, two outfits, in the room the mission sends the player to with the case | Mansion | no | no | no | **high** | med — touching either module collides with mansion work | needs a decision first: which Lou is the one in that office |
| Lou's third look does not live with the other two | `docs/DRESSING-THE-CAST.md` says his club, mansion and course outfits *"live in `src/core/wardrobe.js` beside him rather than being typed out in each scene."* Two of the three do. The golf one is a private `const WARDROBE` in `src/golf/cast.js`, and it also gives him a different height (1.80 v 1.83) and build (1.12 v 1.38) | The ledger has to keep a quarantined copy of that table with a source-parity test on it, because nothing can import it. Exporting it, or moving it to `BIG_UNCLE_LOU_GOLF`, removes the copy | Golf | no | no | no | med | low | whenever golf is next opened |
| The siege puts Lou back in the suit | The house has him in `BIG_UNCLE_LOU_MANSION`; the siege, the same night in the same building, has him in `BIG_UNCLE_LOU` | Falls out of the two-Lous decision above and should be answered with it | Siege | no | no | yes | low | med | with the mansion decision |
| The closed party dresses Lou in the plain suit | `BIG_UNCLE_LOU` rather than `BIG_UNCLE_LOU_BING`, in his own club | Possibly deliberate — a private party is not office hours — possibly the party predates the variant. Cheap either way; wants an answer, not a fix | Bing | no | no | yes | low | low | when somebody decides |
| The Enola crew are dressed by nobody | Irish in blue flight kit against a canonical green shirt, Numbskull in coveralls, Shubes in purple. All inline, all on the block rig | Defensible as aircrew clothing rather than as drift — the difference is that nobody wrote it down, so there is no way to tell which it is | Enola | no | no | yes | low | low | with the jacket row above |

**One thing this list is not.** None of the above is a bug the ledger invented:
`tests/appearances.test.mjs` proves that every row here is what the scene
actually does today, and it will fail the day any of them is fixed and the
ledger is not brought forward with it.

---

## Shared systems

| Edit | Problem | Why | Scenes | Geom | Nav | Art only | Priority | Dup risk | When |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A real shotgun in `core/weapons/catalog.js` | There is no shotgun. The siege's `shotgun` rusher role carries the revolver's model and cues with close-range numbers | A rusher who arrives holding a revolver reads as a bug | Siege, Cartel palace, Heist | no | no | no | med | low | before the palace |
| `cylinder()` and `sphere()` keep their `name` | Both silently DROP the `name` option in `src/world/build.js`; only `box()` keeps it. Thousands of meshes across the game are unnamed and therefore unassertable | Every verifier that names geometry is blind to them | all | no | no | no | **high** | med — many verifiers assert on names | with the geometry pass |
| Step-over in `Player._resolve` | A collider is skipped only when its top is below the feet, so nothing lying on a floor can be solid — a 0.5 m chair would be a 0.5 m wall | Combat scenes want low cover you can shoot over and walk round, not walls | Siege, Heist, Cartel palace | no | yes | no | med | high — changes movement everywhere | its own pass, with a verifier |

---

## Found by the mouth pass, 2026-08-06

Written down rather than fixed, because none of them is a mouth.

| Edit | Problem | Why | Scenes | Geom | Nav | Art only | Priority | Dup risk | When |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Play Silver Pines' conversation-tree cues | `new Dialogue(...)` in `src/golf/main.js` has **no `onLine` hook**, so every `cue` authored on a conversation node is looked up for its LENGTH (`cueSeconds`) and then never played. The banter cues go through `CueQueue.say` and are fine; the trees — which is the whole Lou conversation — are subtitle-only over recordings that exist. Exactly the shape of ENGINE-TRAPS.md entry 3, one layer further in: the generator ran, the manifest has the cue, the file is on disk, and nothing calls `play()` | 353 golf cues are recorded and an unknown share of them have never been audible | Silver Pines | no | no | no | **high** | low — one hook | next golf pass; check `verify:golf` does not assert the silence |
| A `hush()` for the Bing's `Dialogue` | `Dialogue.end()` clears the subtitle and leaves the speaker's mouth running to the end of its take. Correct while a mouth was a timer nobody could see; now that it is the take, a conversation the player walks out of leaves a man finishing his sentence at a wall. Arguably right, arguably not — it is a direction call | Reads as a bug or as good manners depending on the beat | Bing, Silver Room, Silver Pines | no | no | no | low | low | when somebody watches it happen |
| NO WAKE's execution flinch no longer twitches a lip | `npc.speaking = .2` on each shot used to flap the shooter's mouth for a fifth of a second, because `speaking` drove the mouth as well as the head. It now drives only the head and hands, which is what it was for. Nobody has looked at the beat since | A man firing a revolver is not talking, so this is probably an improvement — but it is a change and it has not been seen | NO WAKE | no | no | yes | low | low | with the NO WAKE playtest |

---

## Known and deliberately not fixed

| Thing | Why it is left |
| --- | --- |
| `verify:heist` fails 2 of its checks on `main` — "Lou is on the job as well as at the end of it", "post-heist apartment hides packed gear" | Pre-existing, unrelated to any current work, and the heist is not the scene under construction. Fix it in a heist pass, not in passing |
| `verify:bing` is 157/158 on Willy's belly margin | One margin, long-standing, cosmetic |
| Old Stove's missing face in the Bing | Wiring reads correct end to end; needs an empirical check, not a change |
| `patrol1` / `patrol2` start waypoints clip a lamp post under a stricter probe | Only fails the stricter probe; the men do not visibly clip |
