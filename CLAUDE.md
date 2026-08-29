# SquatchSmash

A no-build Three.js browser game. No bundler, no transpiler: ES modules and an
importmap, served as static files. `npm test` is the *deploy* gate and it is
dependency-free on purpose — GitHub Pages runs it with no `npm ci`, and
`tests/ci-dependency-free.test.mjs` enforces that.

## `npm test` IS NOT THE GATE. Verify is.

There are two workflows. **Pages** runs `npm test` and publishes. **Verify**
runs thirty-odd checks, and a green suite tells you nothing about it.

`.github/workflows/verify.yml` is the list, and it is the authority — read it
rather than this paragraph if the two disagree. Three of its steps need a
browser and are the ones most easily forgotten, because nothing about a local
`npm test` hints they exist:

```
npm run verify:campaign-marathon   Playwright walks the whole public route
npm run verify:boot-failure-surfaces   every staged page actually boots
npm run verify:framing             cameras, blocking, allowlisted shots
npm run verify:visual-smoke        deterministic apartment-mirror receipt
```

The canonical 15-shot browser set is `npm run verify:visual`. It runs serially
at a fixed viewport, DPR, seed and authored scene checkpoint, retains a
Playwright trace on failure, and is scheduled in `verify-scenes.yml`; only the
cheap mirror smoke belongs in the pull-request Verify job. Review a changed
PNG. Do not refresh every baseline merely to turn a visual diff green.

**The marathon is the one that bites.** It walks all twenty-nine scene
handoffs in a real browser with real saves, and it catches exactly the class
of thing a unit test cannot: a `tryLeave` branch nobody routes through any
more, a scene whose exit strands the player, a clock that lost its owner. Ten
commits once shipped against a green local suite while it died on step 19 of
the marathon's twenty-nine, every single time. **Run it before you push anything that touches the
campaign route, the scene graph, or a story adapter's exit.**

The rest, roughly grouped — again, `verify.yml` is authoritative:

```
lint  check  check:flight  verify:geometry  verify:campaign-route
certify:debt-ratchet         no new architecture/semantic/spatial debt
verify:dialogue:check  check:line-presence  check:reachability
check:rerecord  check:takes  voice:needed:check  audio:todo:check
audit:rendered-voices:check  audit:radio:check
audit:radio-loudness:check  audit:radio-content:check
check:*-vo (seventeen per-scene cue ledgers)  check:mansion-sfx
```

Two of those regenerate rather than merely check: change a line and run
`npm run vo:<scene>`, then `npm run audio:todo` and `npm run voice:needed`,
or their `:check` twins fail on drift.

**`certify:debt-ratchet` compares against the PREVIOUS PUSH, not a fixed
line.** CI passes `--trusted-ref ${{ github.event.before }}`, falling back to
`HEAD^`. Two consequences worth knowing before you spend an evening on it:

- It passes locally and fails in CI on the same commit, because locally there
  is no trusted ref at all — the tool says so (*"local mode; CI must pass
  --trusted-ref"*). To reproduce what CI will do, run
  `node tools/certification-debt-ratchet.mjs --trusted-ref $(git rev-parse HEAD)`
  BEFORE committing.
- Raising the checked-in ceiling by hand fails **exactly one push** — the one
  that raises it — and passes from then on, because the next push compares a
  raised baseline against a raised baseline. It is *not* a permanent red. I
  claimed it was, sent an agent after it on that premise, and a commit message
  on `main` still says so; the run on `7d4d7515` disproves it, having gone
  green with the raised ceiling still in place. Lowering the debt for real is
  still the right answer — it is just not the *forced* one.

**A gate that runs later in the job hides behind one that fails earlier.**
When a Verify step goes red, everything after it in that job simply never
ran — so fixing the first failure routinely reveals a second that was never
green either. Do not read one green step as evidence about the next.

## THE CAMPAIGN SPINE — the scene flow, locked

Thirty-one beats. The owner's story bible is `docs/CAMPAIGN-STORY-BIBLE.md`;
the same beats as data are `src/core/campaign-spine.js`, and
`tests/campaign-spine.test.mjs` holds the built campaign against them. **Where
the bible and the code disagree, the bible is right and the code has a bug.**

```
CH 1  PROSPECT
   0  Squatch Smash Intro ...... the fake-out, played on the apartment computer
   1  First Apartment .......... the reveal; Lou rings: come down to the Bing
   2  Bada Bing I .............. Margo's number, James Blond, the Squatchfather job
   3  The Squatchfather ........ the first kill. The driver takes him OUT OF TOWN
   4  Cabin I .................. Lou's call, the four walks, the MARGO call
   5  Booski / Sasole Call ..... at the cabin: the Captain needs a hand nearby
   6  Beef Run ................. flown from the cabin, and back to it
   7  Cabin II ................. the dungeon: Gratin, interrogation, executions,
                                 the pyre, the blackout. Then Booski: Billy is
                                 getting out, come back to the Bing
CH 2  FAMILY BUSINESS
   8  Bada Bing II ............. the party turns; Billy Hotdog dies
   9  Graveyard ................ the burial. Do not go home tonight
  10  Jerky Motel .............. the anonymous night
  11  Return to Old Apartment .. normal life, and it does not feel the same
 11.5 THE TAKE ................. the bank. Not in the spreadsheet; placed here
CH 3  MOVING UP
  12  Lou's "New Space" Call ... good work; meet us on the course about a new space
  13  Silver Pines ............. three holes, and the keys to somewhere better
  14  Luxury Apartment ......... Lou's gift. THE STARTER FLAT GOES DARK HERE
  15  Front & Center ........... the date; she comes home with him
  16  Margo Stayover ........... nothing criminal rings tonight
  17  Luxury Apartment Morning . she leaves, then the phone
  18  NO WAKE .................. Willy leaked the strip; Sauce is the later mole
  19  Luxury Apartment Return .. quiet, then a call about something sensitive
CH 4  THE INNER CIRCLE
  20  Silver Case Setup ........ custody, and orders to hand it to Lou himself
  21  Silver Case -> Mansion ... Squatchanium. Take it down to Booski
  22  Mansion / Silent Squatch . the lab, then: why don't you stay here, Prospect
CH 5  WAR
  23  Mansion Siege ............ they come to you. Then Lou takes a phone call
  24  SQUATCHOLA GAY ........... the counterstrike. Nobody in the air says otherwise
  25  Repaired Mansion ......... a few days on: which city it actually was
  26  Cartel Palace ............ Sauce, Mark, and the whole crew
CH 6  THIS THING OF OURS
  27  Special Meeting Call ..... Booski: special one. Seff, Lag and Numbskull
  28  Pickup / Ride ............ forty-two minutes, and something in the trunk
  29  Initiation Cabin ......... made. Credits roll
```

### The calendar

The bible's calendar, which the runtime now implements:

| Day | |
|---|---|
| 1 | Bing I, the Squatchfather, the drive out |
| 2 | Cabin I, Booski's call, Beef Run, back by night |
| 3 | Cabin II: the dungeon. Nightfall 20:45, then the pyre |
| 4 | Blackout 09:30, Booski's summons, Bada Bing II that night |
| 5 | Graveyard, motel, home, THE TAKE, the new-space call |
| 6 | Silver Pines, the keys, Front & Center, the stayover |
| 7 | The morning after, NO WAKE, home again |
| 8 | Silver Case, the mansion, SILENT SQUATCH, the guest room |
| 9 | The siege at 2 AM, Lou's call, Enola |
| 12 | The repaired mansion, and the Palace that night |
| 13 | The meeting, the ride, the ceremony |

**All thirty-one beats are wired, through Day 13.** The cabin owns Days 2 to 4,
THE TAKE is the afternoon of Day 5, the round and handover are Day 6 with Front
& Center that night, Margo's physical two-floor stayover runs into Day 7, and
the Silver Case leaves at 4 PM on Day 8. Siege and Enola occupy Day 9. The
exact-once `RETURN_TO_MANSION` handoff then jumps to the repaired house at 6:30
PM on Day 12; Cartel Palace opens at 8:30 PM and extracts at 11:00 PM. The
Special Meeting pickup is 5:55 PM on Day 13. Seff's forty-two-minute ride plus
twenty-three minutes at the spur and on the trail lands Initiation at 7:00 PM.
Schema v23 floors old saves which had already consumed one of those tail
markers without replaying it or rewinding a later clock. Schema v25 preserves
that discipline for two later clock corrections: it floors completed Motel
saves to the new Day 5 06:30 daylight landing, and repairs only the exact v24
04:10/06:10 mansion clocks produced by the retired eight-hour guest-room rest.
Schema v26 adds bounded `shotsFired` and `peopleKilled` facts to THE TAKE's
mission record at the safehouse-debrief seam, before Lou's phone rings. A
reload during or after that ring therefore folds the played firefight into the
Prospect's Record exactly once; v25 saves receive honest zero defaults because
their old summaries cannot prove missed rounds or officer kills.

**Anchors move WITH the route, in the same commit.** Leaving one behind does
not fail anywhere:
`advanceTime` takes `Math.max(now, atLeast)`, so an overshot anchor silently
stops naming its hour, and the golf round "ended" at 07:18 having teed off at
07:30. `sleep()` in `apartment-story.js` treats its chapter table's day as a
floor for the same reason.

### Settled story rules

- **One cabin, in Act One.** The whole Cabin Hideaway chapter — cellar,
  dungeon, interrogation, executions, pyre, blackout — IS that scene. Beef Run
  cuts it in half. It is not a post-heist lay-low.
- **Mark is not named until his boss fight.** The Act One interrogation yields
  a mole with no identity and the phrase "Short Bus", and that is all.
- **Sauce is the one who ratted**, which is how the rivals learn about the case.
- **The repaired-mansion trace is concrete but not a verdict.** Sauce's
  restaurant burner and an estate gate log lead to an unnamed A-Team leadership
  estate. Only the Cartel Palace evidence proves that he turned and that a
  redacted active prospect helped with the breach.
- **Enola bombs the wrong city.** One detail is catchable in flight; no line of
  dialogue ever points at it. Lou reveals it at the repaired-mansion debrief.
- **The Home Ladder has two rungs he owns** — the starter flat and the luxury
  apartment — and he never goes back down. Cabin, motel, guest suite and car
  seat are beds somebody else picked, not promotions.
- **The campaign is a single line and stays one.** Owner, 2026-08-26: *"I
  think we are down to a linear campaign story."* There is exactly ONE player
  decision in thirty-one beats — the cabin execution, where either Gratin
  finishes the two prisoners or the Prospect does — and it *"has no real
  bearing on the rest of the game"*. It may feed the end-game stat meter and
  nothing else. Do not add a branch that changes which scenes are played.
- **Margo is never at the golf course.** Her whole thread is four touches and
  the bible lists them: meet her and get the number at Bing I, ring her from
  the cabin to arrange the date, Front & Center, the stayover, and she leaves
  in the morning. Beat 12's call is *"We got a new space. Come meet us on the
  course."* and no more — a previous session invented *"bring that girl from
  the Bing"*, put it in `campaign-spine.js`, and it was on its way to being
  built when the owner caught it.
- **THE TAKE is Day 5, before the new-space call.** It is not in the owner's
  numbered bible at all, which is why it carries the number 11.5. Owner's
  ruling: home from the Motel, do the heist, THEN Lou rings about the new
  space — the job is what earns the upgrade, so the call reads as the reward.
  Silver Pines is therefore AFTER the heist, and the recorded golf call
  ("three holes, home by half ten, after that your day starts") was retired
  with it — it existed to set up a heist that has already happened. Beat 12's
  call is `NEW_SPACE_LOU_CALL` under `call.lou.new_space`, and the eight
  `vo.call.lou.golf.*` takes are gone from the manifest and off the disk.
- **NO WAKE is still Lou's call**, and the recorded take stands. The bible only
  says *"Family call after Margo leaves"*; the existing lines never mention the
  Motel or the old flat, so they play word-for-word in the new position — Day 7,
  from the luxury apartment, once she has gone. Margo's own date call moved the
  same way and for the same reason.
- **The luxury apartment already has the toys.** Two arcades (the computer and
  the Squatch Smash cabinet), darts, poker, blackjack, a TV, a bong and the
  white line on the coffee table are all built in `luxury-apartment/world.js`.
  Nothing has to be carried over from the starter flat when it goes dark;
  check before "porting" anything.
- **Nothing is taken for losing.** See the comment in `campaign.js`.

## Traps that have cost real time

Read these before touching the systems they describe.

- **`Campaign.transition()` is a whitelist that throws.** Adding an edge to a
  scene's `next` is inert until something routes through it; REMOVING one
  strands players on a finished end card. Add first, remove last.
- **`advanceTime` takes `Math.max(now, atLeast)`.** An anchor moved earlier
  than the route reaches it does not pull the clock back — it silently stops
  firing and the beat loses its authored hour. Anchors move WITH the route.
- **The clock ledger is exact-once by id.** Two visits to one place need two
  sets of ids, or the second visit finds everything already spent.
- **Any new key in the save's `events` map needs a migration.** `normalize()`
  rebuilds that block from `initialState`, so without one `structurallyBroken`
  fires and every save in the world is announced to its owner as recovered.
- **The geometry gate addresses objects by traversal path** (`name=x#0/type=Mesh#4`),
  so naming a previously-anonymous mesh renumbers every anonymous mesh after
  it. See `docs/GEOMETRY-GATE.md`.
- **`Object3D.raycast` reads `matrixWorld` and never recomputes it.** Nothing
  updates it headlessly without a renderer, so a Node-side raycast without
  `updateMatrixWorld(true)` measures garbage and reports it confidently.
- **A box is invisible to a ray that starts inside it.** Interaction proxies
  must stand clear of where the player can stand.
- **`debugUse(name)` calls a handler directly and casts no ray.** It proves the
  handler works and says nothing about whether a player can aim at the thing.
  The bank exit shipped unreachable behind exactly that check.

## Working rules

- **Reuse first.** `docs/REUSE-FIRST.md`. Shared systems live in `src/core/`;
  `src/core/combat/` is the ground-combat set and `src/mansion/siege/` is its
  most complete adopter. Search before writing.
- **Measure, don't guess.** This codebase's comments are full of real numbers
  from real playtests. Keep that: when you fix a staging bug, say what you
  measured.
- **Play it straight.** `docs/TONE-AND-PARODY.md`. The comedy is the Family's
  absolute seriousness. Nothing winks.
- Owner playtest notes are quoted verbatim in the code they fixed. Keep doing
  that — it is why anyone can tell what a magic number is for.

## Layout

`index.html` and one HTML file per scene at the repo root; `src/<scene>/` for
each scene's code; `src/core/` shared; `tools/` the gates; `tests/` the suite
(`tests/run.mjs` registers every file — a new test is invisible until it is
listed there); `assets/sfx/` generated voice and audio; `docs/` the design
record.
