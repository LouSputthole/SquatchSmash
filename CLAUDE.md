# SquatchSmash

A no-build Three.js browser game. No bundler, no transpiler: ES modules and an
importmap, served as static files. `npm test` is the gate and it is
dependency-free on purpose — GitHub Pages runs it with no `npm ci`, and
`tests/ci-dependency-free.test.mjs` enforces that.

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
  12  Lou's "New Space" Call ... Front & Center, and bring that girl from the Bing
  13  Silver Pines ............. three holes, and the keys to somewhere better
  14  Luxury Apartment ......... Lou's gift. THE STARTER FLAT GOES DARK HERE
  15  Front & Center ........... the date; she comes home with him
  16  Margo Stayover ........... nothing criminal rings tonight
  17  Luxury Apartment Morning . she leaves, then the phone
  18  NO WAKE .................. Willy was the rat
  19  Luxury Apartment Return .. quiet, then a call about something sensitive
CH 4  THE INNER CIRCLE
  20  Silver Case Setup ........ custody, and orders to hand it to Lou himself
  21  Silver Case -> Mansion ... Squatchanium. Take it down to Booski
  22  Mansion / Silent Squatch . the lab, then: why don't you stay here, Prospect
CH 5  WAR
  23  Mansion Siege ............ they come to you. Then Lou takes a phone call
  24  Enola Squatch ............ the counterstrike. Nobody in the air says otherwise
  25  Repaired Mansion ......... a few days on: which city it actually was
  26  Cartel Palace ............ Sauce, Mark, and the whole crew
CH 6  THIS THING OF OURS
  27  Special Meeting Call ..... Booski: special one. Seff, Lag and Numbskull
  28  Pickup / Ride ............ forty-two minutes, and something in the trunk
  29  Initiation Cabin ......... made. Credits roll
```

### The calendar

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

### Settled story rules

- **One cabin, in Act One.** The whole Cabin Hideaway chapter — cellar,
  dungeon, interrogation, executions, pyre, blackout — IS that scene. Beef Run
  cuts it in half. It is not a post-heist lay-low.
- **Mark is not named until his boss fight.** The Act One interrogation yields
  a mole with no identity and the phrase "Short Bus", and that is all.
- **Sauce is the one who ratted**, which is how the rivals learn about the case.
- **Enola bombs the wrong city.** One detail is catchable in flight; no line of
  dialogue ever points at it. Lou reveals it at the repaired-mansion debrief.
- **The Home Ladder has two rungs he owns** — the starter flat and the luxury
  apartment — and he never goes back down. Cabin, motel, guest suite and car
  seat are beds somebody else picked, not promotions.
- **No player decisions exist in the campaign yet.** It is a single line.
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
