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
| ~~Fix the trees at the mountain airstrip~~ | **Verified landed, 2026-08-22.** The current `src/beefrun/airstrip.js` jungle-canopy scatter (~line 610) queries `plantedGround(x, z)` per instance for trunk height, applies `slopeTilt(x, z, 0.4, _qTilt)` for downhill lean, composes the crown from the *same* `_pos`/`_q` as its trunk (so they cannot disagree), varies scale with a power curve rather than one uniform `rand()`, clump-samples rather than gridding, and excludes the runway/apron/taxi line via `onOperatingSurface(x, z, 8)` — every failure mode this row listed as "most likely" is addressed in the code as it stands today | — | Beef Run | — | — | — | — | — | landed |

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
| ~~Captain Lou Sasole is in the wrong jacket on the Enola~~ | **Verified landed, 2026-08-22.** `src/enolasquatch/crew.js:188` spreads `...fromWardrobe(CAPTAIN_LOU_SASOLE)` onto the private block rig with no literal `jacket:` override after it; `src/core/appearances.js:327` confirms "Captain Sasole uses the canonical block-rig wardrobe adapter"; `tests/appearances.test.mjs` (27/27, including "every wardrobe difference has a status and no unresolved divergence ships") passes at HEAD | — | Enola | — | — | — | — | — | landed |
| ~~DeathMegatron is a bald bearded man on the bank job~~ | **Verified landed, 2026-08-22.** `HEIST_CREW_PRESENTATION` in `src/heist/cast.js` now references the canonical `model: DEATHMEGATRON` from `core/characters.js` instead of an inline bald/bearded literal; `src/core/appearances.js:1547` cites the same canonical model; `tests/heist-scale.test.mjs` and `tests/heist-presentation.test.mjs` (24/24) pass at HEAD | — | Heist | — | — | — | — | — | landed |
| ~~Numbskull is the shortest man in the van~~ | **Verified landed, 2026-08-22.** Same fix as the DeathMegatron row above — `HEIST_CREW_PRESENTATION[CHARACTER_IDS.NUMBSKULL]` now carries `model: NUMBSKULL`, the canonical roster model, rather than the old inline 1.72/1.00 literal; same passing test files | — | Heist | — | — | — | — | — | landed |
| ~~Snow and the Shubenator are re-measured on the job too~~ | **Verified landed, 2026-08-22.** Same canonical-model migration — `HEIST_CREW_PRESENTATION` now sources every crew member's proportions from `core/characters.js` (`src/core/appearances.js` lines 1514–1558 cite all five by canonical model), so nothing in the heist re-measures anybody independently any more | — | Heist | — | — | — | — | — | landed |
| ~~The graveyard's Snow has no belt~~ | **Verified landed, 2026-08-22.** `src/graveyard/world.js:659` now does `...SNOW,` — a spread of the canonical wardrobe object, belt included — rather than typing him out inline | — | Graveyard | — | — | — | — | — | landed |
| ~~There are two Big Uncle Lous in the mansion office~~ | **Verified landed, 2026-08-22.** `MansionInterior.js` no longer builds a Lou at all — its own comment says so directly: "It used to import the club's figure builder and the wardrobe to sit a Big Uncle Lou in the office carver... Both mounted, 1.7 m apart, and the player met the same man twice. This file is the BUILDING; `../cast.js` is the PEOPLE." `mansion/cast.js:1361` is now the one placement (`BIG_UNCLE_LOU_MANSION`) | — | Mansion | — | — | — | — | — | landed |
| ~~Lou's third look does not live with the other two~~ | **Verified landed, 2026-08-22.** `GOLF_WARDROBE[CHARACTER_IDS.LOU]` in `src/golf/cast.js` now spreads `...canonicalBody(BIG_UNCLE_LOU)` for height/build/etc. and overrides only golf-specific presentation (argyle, flatcap, saddle shoes) — no more private duplicated height/build table | — | Golf | — | — | — | — | — | landed |
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
| ~~A real shotgun in `core/weapons/catalog.js`~~ | **Verified landed, 2026-08-22.** `WEAPON_IDS.SHOTGUN` exists with its own catalog entry ("12-gauge pump shotgun"), cue mix profile, and `SHOTGUN_CUE_SLOTS` — not a borrowed revolver model | — | Siege, Cartel palace, Heist | — | — | — | — | — | landed |
| ~~`cylinder()` and `sphere()` keep their `name`~~ | **Verified landed 2026-08-05** (per the fix's own dated comment; re-verified 2026-08-22). Both `cylinder()` and `sphere()` in `src/world/build.js` now carry `if (o.name) m.name = o.name;`, matching `box()` | — | all | — | — | — | — | — | landed |
| ~~Step-over in `Player._resolve`~~ | **Verified landed, 2026-08-22.** `src/core/player.js` now exports `STEP_HEIGHT = 0.40` with `_stepSupport`, documented against exactly this row: "`_resolve` used to skip a collider only when its top was below the feet... A collider whose top is within this much of the ground he is standing on is stepped over instead" | — | Siege, Heist, Cartel palace | — | — | — | — | — | landed |

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
