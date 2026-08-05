# Squatch Life — Flow, Gaps, and How We Finish It

**Date:** 2026-08-05 · **Status:** planning pass — no game code changed.
**Companions:** `docs/SQUATCH-SMASH-DIALOGUE.xlsx` (every authored line, one sheet
per scene, with editor notes) and `docs/audits/2026-08-05/` (the full flow map,
radio audit, story reconciliation, and dialogue notes this plan condenses).

---

## TL;DR

1. **The connected campaign is healthy for 21 of 22 steps and then traps the
   player.** The Initiation never reports completion, so the save loops the
   apartment door back into it forever. That is the single seam between "a game
   with a missing ending" and "a game."
2. **Three finished missions are orphaned, and they are one story.** The Silver
   Case → PROJECT SILENT SQUATCH (the mansion) → The Enola Squatch form a
   complete "the Family builds and uses a weapon" act, ~5,200 lines of verifier
   tooling included, with zero routes in. They slot in as a new **Day 5** before
   the Initiation.
3. **The Cartel does not exist yet — and that's the opportunity.** The word
   appears nowhere in the repo. But the game has already bombed a city
   (Squatchbourg) and never said whose it was. One line makes the Enola raid the
   inciting incident; six more existing surfaces seed the Cartel as background
   weather; the finale — **THE HOUSE** — is the Cartel answering, staged in the
   already-built mansion.
4. **The dialogue is in far better shape than expected** — 2,825 authored lines,
   79% voiced, and the second half is nearly 93% recorded. The problems are a
   handful of continuity breaks (all listed, all cheap) and a set of planted
   threads (grey sedan, egg story, six thousand pounds, the crest) waiting for
   payoffs the finale can supply.
5. **The radio is fully recorded; it's the *selector* that's broken.** All 222
   cues exist. The schedule picks by hour-of-day only, so all four days sound
   identical and the hosts never learn anything happened. The fix is one
   plumbing change plus day-aware content — not an engine rewrite.

---

## 1. How each scene flows into the next (as built today)

The campaign is hub-and-spoke through the apartment: a call unlocks a mission,
the door routes to it, the mission returns home, sleep (or an authored
completion) turns the chapter. Full citations: `docs/audits/2026-08-05/flow-map.md`.

| Day | Scene | Enters because | Leaves to |
|---|---|---|---|
| 1 · 06:04 | **Apartment** (wake) | fresh save | Bada Bing, after 4 chores + Lou's call |
| 1 · 23:41 | **Bada Bing one** | Lou's call answered | apartment, carrying Lou's package |
| 1 night | **Apartment** | — | Squatchfather, after the whiskey nerve-settle |
| 1 night | **Squatchfather** | package concealed | apartment (arrives Day 2 03:00) → **sleep** |
| 2 · 07:00 | **Apartment** (wake) | chapter `day_two` | Beef Run, after Booskibro's call |
| 2 · 09:10 | **Beef Run** | Booski's call | apartment (20:30) |
| 2 · 23:00 | **Bada Bing two** | Lou's second call | **straight to the graveyard** (no hub stop) |
| 3 · 00:15 | **Squatch Graveyard** | body loaded | **straight to the Motel** |
| 3 · 01:30 | **Jerky Motel** | burial done | apartment (04:30) → **sleep** |
| 3 · 12:00 | **Apartment** (wake) | chapter `no_wake` | NO WAKE, after Lou's vague call |
| 3 · 12:45 | **NO WAKE** | Lou's call | apartment — completion advances to `date` **without a night** |
| 3 · 19:30 | **Silver Room** | Margo's call | apartment (23:20) → **sleep** |
| 4 · 07:00 | **Apartment** (Margo wakes beside Tony) | chapter `golf_morning` | Silver Pines, after Lou's golf call |
| 4 · 07:30 | **Silver Pines** | Lou's call | apartment — advances to `heist_day` without a night |
| 4 · 11:15 | **THE TAKE** | Lou's heist call + 7 loadout pickups | apartment (17:20), chapter `post_heist` |
| 4 · 19:00 | **Initiation** | 3 cleanup tasks | **NOTHING — terminal. See G1.** |

**The break (G1):** `initiation.html` never imports the campaign. No completion
event, no outbound edge (`next: []`), exit is a bare `<a href="./index.html">`.
Back home, the chapter is still `post_heist`, so the door routes to the
Initiation again and `sleep()` refuses with `unknown_chapter`. The campaign has
no exit, mechanically.

Two smaller flow hazards worth fixing while we're in there: opening bare
`bing.html` on a second-visit save runs a legacy exit that throws on an illegal
`bada_bing_two → jerky_motel` transition (G9), and `preview.html` links the
Silver Case / Enola Squatch previews that `preview-mode.js` can't map (G7).

---

## 2. What's orphaned, and where it belongs

### The floating act (the big three)

| Scene | State | Evidence it was meant to chain |
|---|---|---|
| **The Silver Case** (`silvercase.html`) | Complete 18-state mission, fully voiced, writes **no** campaign state | `ITEM_IDS.SILVER_CASE` exists with the comment "THE SAME CASE… carried into Lou's office" |
| **PROJECT SILENT SQUATCH** (`mansion.html`) | The largest location in the project; registered in the scene table; **zero routes in** | `silent-squatch-story.js` computes an `unrouted` flag and *fakes the case into the player's hands* because the Silver Case writes nothing; spec says "immediately after The Silver Case" |
| **The Enola Squatch** (`enolasquatch.html`) | Complete bomber mission on the Beef Run flight stack; no scene id; only page with **no exit link home** | Its payload is the Fat Squatch — the weapon the mansion mission builds; golf already teases it ("six thousand pounds… another Lou") |

**Recommendation — make them Day 5, "The Program," between THE TAKE and the
Initiation:**

> Day 5: Ape's call → **The Silver Case** (recover the case) → the existing
> 25-minute `DEPART_MANSION` travel seam (defined, never used) → **the mansion:
> Silent Squatch** (deliver the case, the lab, the gassing) → Sasole's call,
> "there's a thing after the thing, and it needs an aeroplane" pays off →
> **The Enola Squatch** night raid → home at dawn → sleep.
> Day 6, evening: **the Initiation.**

Why before the Initiation and not after: Tony is addressed as *Prospect*
throughout all three scenes; the Initiation's approved rewrite reviews his
accomplishments, and the lab and the bombing are the heaviest things there are
to review; and the finale needs the player to know the mansion intimately
before they defend it — Silent Squatch is a guided tour of every room THE HOUSE
will fight through, including the reinforced glass and the switch. It also
resolves the mansion's contradictory landing copy ("Initiation Night") in favor
of its own mission doc ("immediately after The Silver Case").

This mirrors the Day 2 pattern the game already has (one day, three linked
missions, club → graveyard → motel), so the pacing precedent exists.

### The rest of the orphan ledger

- **`big_night` chapter** — a fully authored, recorded, unreachable Day 4
  variant (call, machine messages, news, dressing, door branch), superseded by
  `post_heist`. **Harvest, don't delete:** its wire line ("Quiet week on the
  wire, which around here means somebody has had a word") is the finale's
  epilogue beat, verbatim.
- **`goals.js` / the "Wednesday 7PM Squatch Meeting"** — a complete dead
  campaign still *referenced* by chat, the radio meeting notice, and several
  mail messages. Decide once: repoint those references at the real campaign or
  retire them; harvest the six ending cards (the drunk/stoned ones are funny)
  for the Initiation's intoxication handling.
- **The "Uncle Lou — Tomorrow" email** — fully written, explicitly filtered out
  of the inbox, and the only text that ever explains what the Initiation *is*.
  Restore a rewritten version timed to `post_heist`.
- **License to Grill hooks** — Vincent Mallard, "behind the laundromat on
  Thursdays," persisted and unconsumed. Deliberately leave it hanging (see §4).
- **`wardrobe.html`** — works locally, excluded from the Pages deploy. Add it to
  CI or fold it into `preview.html`; either way stop it 404ing.
- **`roster.html`** — deployed but linked from nowhere; link it from preview.
- **`src/airstrip/mission.js`** — legacy, superseded, still imported by one
  test. Delete with the test updated.
- **Dead spawns and events** — `mansion: foyer/cellar` and
  `TIME_EVENT_IDS.DEPART_MANSION` all become live the day the act is routed;
  none should be deleted.

---

## 3. The gap ledger (what to fix, in priority order)

Full detail with citations: `docs/audits/2026-08-05/flow-map.md` §4.

| # | Gap | Fix |
|---|---|---|
| G1 | Initiation is a hard dead end; door loops back into it; sleep returns `unknown_chapter` | Initiation claims the scene, writes completion, gets an outbound edge (see §6 build order — a minimal exit can land *before* the full rewrite) |
| G2 | Mansion registered but unroutable (no label, no door branch, no return priority) | Lands with the Day 5 routing work |
| G5/G6 | Silver Case and Enola complete and write nothing | Scene ids + story modules on the `airstrip-story.js` pattern; Silver Case finally writes the case so `silent-squatch-story.js` stops faking it |
| G9 | Bare `bing.html` + second-visit save → illegal transition throw | Router guard: bare URL on a `bada_bing_two` save loads `hotdog-main.js` |
| G14 | `post_heist` has no sleep entry and `LAST_CHAPTER` is stale | Lands with G1 + the Day 5 chapter machine |
| G7 | Preview maps Silver Case/Enola to `apartment` | Two pathname branches in `preview-mode.js` |
| G4 | Silent Squatch's four rewards + `familyRespect` + Squatchanium trophy written, read by nothing | The apartment's final dressing pass: conspiracy board, trophy shelf (both already owed), respect read at the Initiation verdict |
| G15 | Motel fields write-only; golf's script is the only cross-scene payoff surface | Feed motel detail into the golf/Initiation callback surfaces |
| G10 | Graveyard: no mission id, no dedicated verifier | Add `verify:graveyard`; leave the state model alone (it works) |
| G13 | README documents 12 of 17 experiences; multiple stale docs | One documentation pass at the end (§6 phase 7) |
| — | `verify:motel` / `verify:bing-two` broken on this branch (pre-existing) | Repair before any motel/bing-adjacent work merges |

---

## 4. How we finish the story

Everything below is condensed from `docs/audits/2026-08-05/story-finale.md`,
which has the full staging, citations, and alternatives.

### 4.1 The Initiation (the approved rewrite, unchanged in scope)

Frozen today: Tony is Prospect Two; Prospect One takes eight rounds for "the
GEICO Gecko"; three prospects walk away unjudged; Tony ends **human** with a red
bandana on an overlay card. The approved rewrite (stated identically in six
docs): **accomplishment review** (now with Day 5's lab and bombing as its
heaviest material), **every failed prospect executed**, **conditional
admission**, and **the mass transformation into literal sasquatches** — plus the
scene's first `campaign.enter`, a completion event, and an outbound edge.

Two practical notes: the transformation rig the handoff doc points at
(`ae9deef:src/initiation/sasquatch.js`) **does not exist in this repo's
history** — the working rig is `class Sasquatch` in `game/src/player.js:44`,
already imported by the mansion grounds for the fountain monument. And three
checks in `tools/verify-initiation.mjs` deliberately assert Tony stays human;
they must be inverted as part of the rewrite, not discovered red afterwards.

**The standing gate holds: nothing touches the Initiation runtime until the
owner has playtested the frozen scene.** That playtest is the first item in the
build order.

### 4.2 Seeding the Cartel (before anyone says "Cartel")

The Cartel appears nowhere in the repo today. They must never get a scene
before the gate — they are weather. Seven existing surfaces, none needing a new
system:

1. **The wire.** `CHAPTER_NEWS` already delivers one-shot chapter bulletins.
   Add an escalating south-side thread: a container yard, four men, plates from
   a long way away (Day 2) → the yard is a federal matter (Day 3) → three men
   found in a car at the airfield perimeter (Day 4 morning) → "a second party
   has been asking after the count" (post-heist). The existing final line —
   *"Quiet week on the wire, which around here means somebody has had a word"*
   — stays untouched; it reads as Lou's reach the first time and as the calm
   before the assault forever after.
2. **The grey sedan.** Bada Bing one's unresolved thread *was them*. The first
   vehicle through the mansion gate is the grey sedan — same plate, if the
   player read it on Day One. Nobody points it out.
3. **THE TAKE's money.** One settlement line — Numbskull finds a strapped
   bundle with the wrong band on it. Cumberland Fidelity held somebody's money.
   The finale becomes partly *Tony's fault*, which is the only version with
   weight.
4. **Squatchbourg.** One added line in the Enola briefing naming whose city it
   is. The entire built, voiced raid becomes the act of war the finale answers.
   Highest-value seed per word in the project.
5. **Silent Squatch.** They want the notes, the core, or revenge — pick
   exactly one. The conspiracy board (an owed, unbuilt apartment reward) is
   where their face appears before the gate.
6. **Lou's bookcase.** The concealed office door was built "for future use."
   This is the use: it's how Lou doesn't die.
7. **Irish.** One Bing-floor grievance about the yard on the south side that
   nobody answers. He's right, and it's the only warning anybody gets.

The radio's escalating "coyote problem south of the border" bit (§5) is the
comedic face of the same thread — same seeding, different register.

### 4.3 THE HOUSE (the finale)

**Transition.** The rewritten Initiation ends in the transformation → the
**short party**, finally instantiating the written-cast-and-recorded party brain
(116 lines) as a ten-minute victory lap — Prospect One still where he fell,
Solo cup in hand, "Pour one out" intact. Booskibro's phone rings; he puts the
cup down without explaining. The existing 25-minute mansion travel seam fires.
Tony arrives at the `gate` spawn — the same gate as Silent Squatch, now on fire
— and for the first time in the campaign the hands in view are not human.

**Structure — one scene, three collapses, the house loses a floor each time:**

- **Cold open, the forecourt:** BRING NOTHING means Tony arrives with empty
  slots. Fists, then a dead guard's 9mm. Cover is the fountain, the cars, the
  pillars. Being a sasquatch with a pistol is not a power fantasy yet.
- **Act one, the ground floor:** find Lou. Foyer, horseshoe stair, the glass
  lounge flank, the kitchen service door. Waves on the heist's `PoliceDirector`
  pattern through named gates (`gate`, `pool`, `service`, `garden`). The
  transformed Family fight as actual sasquatches and *nobody on our side
  remarks on it* — the horror plays from the attackers' radio only.
- **Act two, the garden:** hold the rear. The maze, the rill, the pavilion —
  the mansion's best and least-used combat geometry. The basement Barrett
  finally becomes the answer to a problem; `enolasquatch/combat/Defense.js`
  drives fixed guns that lead the player.
- **Act three, the basement:** the armory (everything, at last, and nowhere
  left to go), the vault with the gold, then the marble bust, the sliding wall,
  xXx still hanging ("something about the noise"), and the last stand behind
  **the same reinforced glass six people died against** — impacts sharp on the
  glass, everything behind it muffled, exactly as the Silent Squatch spec chalks
  it.
- **The switch.** SILENT NIGHT PROTOCOL, red cover, second lift — with the lab
  full of the wrong people this time. Recommended staging: Tony hands it to
  Booski and steps aside — the inversion of "You started the job. Finish it."
  (Owner's call; it's the most important authored choice in the finale.)

**Combat systems:** the mansion has *none* today (Snow's safety is guaranteed by
the absence of an aim resolver). Every piece is proven elsewhere: Motel factions
with the hard friendly-exclusion Snow needs, heist wave director, Silver Case
shooting/reactions, core weapons stack, Enola predictive fire. New work is
assembly, the Cartel cast/VO (with its own `tools/thehouse-vo.mjs` — the
missing-generator trap has cost this project 147 lines twice), a
`mansion-defense-story.js` twin with checkpoints (`gate / house / garden /
basement / lab / clear`), and a **structural Snow-is-never-a-target check** in
`verify:mansion`, which is the highest-risk regression in the whole plan.

**Payoffs the arc has earned:** Margo on the answering machine only (gated on
`cameHome` — never on screen, never threatened); Booskibro's "attrition" toast
said again with nobody laughing; Big Uncle Lou sincerely angrier about the
fountain than the casualties; the graveyard epilogue — fresh plots beside Billy
HotDog's, the player digging at least one, and if the Day 2 ledger says Tony
disrespected the traitor graves, somebody notices now and doesn't make a thing
of it.

**Ending, four beats:** the count at dawn (Snow, the cart, "and a mop" said
about a house this time) → the wire (the "quiet week" line, second hearing) →
the flat, dressed one last time (conspiracy board, glowing Squatchanium
miniature, Margo's message, the SILVER card with the lease joke) → the
graveyard, shovels, credits over the campaign's accumulated evidence, and the
save finally writes `complete`.

**What the ending must not do:** name the parody, wink at the transformation,
explain the Cartel in a monologue, or resolve Vincent Mallard. One man alive in
a basement, one name behind a laundromat, one city that isn't there any more —
three unpaid debts is the right number for a family that just won.

---

## 5. The dialogue pass

The full inventory is `docs/SQUATCH-SMASH-DIALOGUE.xlsx` — one sheet per scene
in campaign order, every line with speaker, beat, source, and verified voiced
status, plus a STORY NOTES sheet with ~45 curated findings and a RADIO sheet.
Headline numbers: **2,825 lines · 2,231 voiced (79%) · 483 unvoiced · 111
deliberately silent HUD prose.**

**Continuity fixes (all cheap, all listed with actions in the workbook):**
the Silver Room's Day-2 clock stamp; the mansion's "Initiation Night" landing
copy; the Squatch-prayer liturgy that never recurs; Sal's "You shot Booski"
present-tense grievance; the Snow/"Lawnmower" alias leak; "Hector" named once
cold; the heist's two seven-o'clocks and its one doctrine-breaking
Counter-Strike wink; stale "not yet recorded" comments underselling finished
work.

**Callbacks and foreshadowing already planted, waiting for the finale to pay
them off:** the grey sedan plate (→ THE HOUSE cold open), "six thousand pounds"
(→ one Enola line says the number back), the crest on the revolver (→ a Cartel
scout calls it out), Old Stove's "government" cargo (→ folds into the Mallard
spy thread, then deliberately left hanging), Hole 3's "does anybody know you're
here" (→ read at the Initiation verdict), and **Irish's egg story** — four days
of interruptions land the morning after THE HOUSE, on-air, uninterrupted, and
deliberately terrible.

**Recording debts, in priority order:** the 17 apartment door-refusal lines
(zero takes, most-heard gap in the game); the ~120 HotDog party/cleanup ambient
lines (the largest written-but-unheard block); the two `needsRerecord` flags
(Lou's second Bing call, Booski's shot yell).

---

## 6. The radio redo

Full audit: `docs/audits/2026-08-05/radio-audit.md`. The station is **fully
recorded** — all 222 cues exist on disk. It reads as random clips because:

- `showAt()` picks shows by hour only; all four days are word-for-word
  identical, and short lists loop verbatim by Day 2.
- The hosts never learn anything happened. Tony's five off-screen crimes get
  two generic announcer bulletins between them; the HotDog beating and the
  harbor run get **zero** coverage.
- The bulletin system interrupts the show, reads one flat line, and hands back
  to Irish mid-egg-conspiracy as if nothing happened.
- Ads and DJ links are inert — one fixed commercial, generic song outros.

**The fix (plumbing is one change; the rest is content):**

1. `createCampaignRadioAdapter()` exposes `story.day`/`story.chapter` (it
   already has both); `_refill()` filters each show's exchange pool by an
   optional `unlockedChapter`/`unlockedDay` field before its round-robin pick.
2. **Fold the news into the hosts' own voices:** the day after each crime, the
   actual shows react in character — the Lous riff nervously about "a family
   restaurant thing," Ape reads the Cumberland Fidelity wire copy deadpan
   mid-gambling-show, Hog Mama does "a motel fire, structurally" as a
   bad-taste bit. The announcer bulletin still fires once; the hosts now
   acknowledge it existed.
3. **Cover the missing crimes:** new one-shot bulletins for the HotDog beating
   and the harbor run, on the exact existing `CHAPTER_NEWS` pattern.
4. **Chapter-aware ads:** Seff's Mattress Kingdom ("no questions, open all
   night off the county road") before the Motel; a Cumberland Fidelity spot the
   morning of the heist.
5. **The escalating Cartel thread:** Irish's "coyote problem south of the
   border" grows one beat per day — a joke on Day 1, two counties on Day 2, "the
   smuggling story has a name now" on Day 3, and the deadpan close on the final
   morning ("and that's the last you'll hear about the coyotes, apparently").
   Same seeding campaign as §4.2, comic register.
6. Day 5 gives every show one new pool (the town the morning after a bank job)
   and the finale morning gets the epilogue programming: the "quiet week" line,
   and Irish finally telling the egg story.

Existing recordings are not invalidated; day-gated pools are *additive* on top
of the current evergreen bits.

---

## 7. Build order

Respecting the standing gates: the Initiation runtime is frozen until the owner
playtests it, and `verify:motel`/`verify:bing-two` are broken on this branch
and block adjacent work.

| Phase | Work | Depends on |
|---|---|---|
| **0 — Owner decisions** | Playtest the frozen Initiation (the gate on everything downstream). Confirm: Day 5 placement of the act (§2), THE HOUSE shape + who pulls the switch (§4.3), radio scope (§6). | — |
| **1 — Repair the seams** | Fix `verify:motel`/`verify:bing-two`. G9 bing router guard. G7 preview branches. Minimal G1 relief: Initiation claims the scene + writes completion + temporary credits/sleep exit so no save is ever trapped, even before the rewrite. Silver Room day stamp. Snow/Lawnmower + "Hector" + Sal's-grievance line fixes. | — |
| **2 — Wire Day 5** | Silver Case + Enola scene ids and story modules; route apartment → Silver Case → mansion → Enola → home; Day 5 chapter machine, calls, time events (`DEPART_MANSION` finally fires); mansion landing-copy anchor; preview + `verify:campaign-route` extended; `verify:graveyard` added while we're in the verifier layer. | 1 |
| **3 — Dialogue + recording pass** | Workbook STORY NOTES sheet, top-down: continuity fixes, callback lines (sedan/weight/crest/opsec), harvest `big_night` + `goals.js` + the Uncle Lou email, then the recording batch (door refusals → HotDog ambient → rerecord flags). | can run parallel to 2 |
| **4 — Radio redo** | Adapter plumbing, day-gated pools, host-voiced news, chapter ads, the coyote/south-side thread, missing-crime bulletins. | 3's Cartel-seed lines |
| **5 — Initiation rewrite** | Accomplishment review (reads Day 5 + the golf opsec answer + `familyRespect`), all failed prospects executed, conditional verdict, transformation on the `game/src/player.js` Sasquatch rig, party instantiated as the timed victory lap, invert the three human-canon verifier checks, real completion + edge → mansion. | 0 (playtest), 2 |
| **6 — THE HOUSE** | Combat assembly (Motel factions + heist director + Silver Case shooting + Enola fixed guns), Cartel cast/VO with `tools/thehouse-vo.mjs`, `mansion-defense-story.js` checkpoints, structural Snow-safety check, three acts + the switch, epilogue (count → wire → flat dressing: conspiracy board, trophy, answering machine → graveyard credits), campaign writes `complete`. | 5 |
| **7 — Ship pass** | README/docs refresh (12-of-17 fixed, stale audits archived), wardrobe deployed or folded into preview, roster linked, legacy airstrip removed, fresh-save human playthrough end to end, payload budget. | all |

Phases 3 and 4 are parallelizable with 2. Phase 6 is the only genuinely new
*systems* work in the plan — everything else is routing, content, and assembly
of proven pieces.
