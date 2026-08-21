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
| ~~The autopilot has no idea the ground is coming up~~ | **Done 2026-08-14.** The gyro grew an AGL floor: with the autopilot engaged and clearance under 250 m, the red TERRAIN lamp goes up and `BARKS.terrainClose` calls it out — a warning and deliberately not a control change, exactly as prescribed below. `AUTOPILOT_TERRAIN_FLOOR_AGL` in `MissionController.js`; pinned by `verify:enolasquatch`'s "the gyro calls the rising ground BEFORE it arrives" check | — | Enola | — | — | — | — | — | landed |

**What it is not** (kept for the record — the shipped fix honoured this). Do not "fix" this by making the autopilot climb over terrain. An autopilot that quietly changes your altitude is worse than one that gives up, and the drop-out is honest. What was missing was the *warning*: an AGL floor that calls out, a HUD number that goes red. The player needed the seconds before the hill, not a machine that flies for him.

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
| ~~Captain Lou Sasole is in the wrong jacket on the Enola~~ | **Done 2026-08-15** (`a33696a`), noticed 2026-08-21. `src/enolasquatch/crew.js:189` spreads `...fromWardrobe(CAPTAIN_LOU_SASOLE)` and overrides nothing below it — the headset, face crop, pose and station are the aeroplane's, the clothes are the wardrobe's, exactly as the row asked. The three remaining `jacket:` literals in that file are Irish, Numbskull and Shubes, which is the separate row below and still live | — | Enola | — | — | — | — | — | landed |
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
| NO WAKE's execution flinch no longer twitches a lip | `npc.speaking = .2` on each shot used to flap the shooter's mouth for a fifth of a second, because `speaking` drove the mouth as well as the head. It now drives only the head and hands, which is what it was for. Nobody has looked at the beat since | A man firing a revolver is not talking, so this is probably an improvement — but it is a change and it has not been seen | NO WAKE | no | no | yes | low | low | with the NO WAKE playtest |

Two rows from this table were closed by the 2026-08-14 audio pass:

- **Silver Pines' conversation-tree cues.** Measured rather than assumed
  (`tools/probe-golf-dialogue-audio.mjs`): the trees' spoken beats route
  through `CueQueue.say` → `playRecordedGolfCue`, and the Prospect's replies
  through `onChoice` → `playRecordedGolfChoice` — both paths PLAY their
  recordings. What was genuinely missing was the `onLine` hook itself (any
  authored spoken node would have been length-only) and any verifier
  assertion that lines are audible. Both are in now: `src/golf/main.js`
  wires `onLine` on the Bing pattern, and `verify:golf` asserts every
  conversation line it drives produced a real buffer playback, plus
  `failedCues.length === 0`.
- **`Dialogue.hush()`.** `src/bing/dialogue.js` keeps the take `onLine` /
  `onChoice` return and `hush()` stops it; the Bing, the Silver Room and
  Silver Pines call it from `onEnd` for every lapse reason (`walked-away`,
  `interrupted`, seat-pauses) and leave a `done` thread alone, since a done
  thread has already had its full cue hold. The Motel and the mansion use
  their own dialogue machinery and were left to their owners.

---

## Known and deliberately not fixed

| Thing | Why it is left |
| --- | --- |
| ~~`verify:heist` fails 2 of its checks on `main`~~ | **Closed 2026-08-14.** The two named checks ("Lou is on the job", "post-heist apartment hides packed gear") were already green at head; the one real red was the crew-anatomy snapshot still pinning DeathMegatron's pre-gown `outfit: 'suit'` from before a1ef9ac5 — the snapshot was the stale side and now mirrors the canonical gown |
| ~~`verify:bing` is 157/158 on Willy's belly margin~~ | **Closed 2026-08-14.** Willy's margin was already green at head; the one real red was DeathMegatron's floor-length gown hanging past the bar-stool footrest after a1ef9ac5. Fixed in the shape, not the number: a seated gown's hem now rides up to the footrest line (`Npc._syncGownOcclusion`), with the standing hem untouched and still pinned by `tests/outfits.test.mjs` |
| Old Stove's missing face in the Bing | Wiring reads correct end to end; needs an empirical check, not a change |
| `patrol1` / `patrol2` start waypoints clip a lamp post under a stricter probe | Only fails the stricter probe; the men do not visibly clip |
| The couch rule behind Day Two's telly beat is not covered by anything | `pastimeWatch()` in `src/main.js` only counts the news while `game.sitting === 'couch'` AND `tv.on` — standing in the kitchen with it burbling is not watching television and neither is sitting in the dark. `verify:day-two` proves the DOOR half (it refuses with the telly after Booskibro's call, and opens once the beat is done, against the real refusal and the real navigation to beefrun.html) but not that rule, because at that point in that script the player is still frozen in the wake-up and `sitOn('couch')` refuses anybody whose `player.mode` is not `'walk'`. Getting him upright there would mean re-staging the whole morning around a beat that file is not for. Reaching it wants a harness hook — `pastimeWatch` on `window.__squatch`, driven with a synthetic dt the way Enola's `h.tick()` is — or the rule lifted out of `main.js` into something headlessly testable. Written down rather than faked: the check in `verify:day-two` says in its own comment exactly what it does and does not prove |
