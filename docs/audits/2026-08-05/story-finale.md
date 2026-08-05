# Squatch Life — story reconciliation and finale design brief

Prepared as story editor, 2026-08-05, from the repository at
`/home/user/SquatchSmash` (HEAD `f07a712`, branch
`claude/squatch-life-continuation-2c23z0`). **No repo file was modified.**

Owner's direction taken as given: the Initiation is the last currently-planned
mission; the next thing to build is the finale — the Cartel attacks Lou's
mansion and Tony/the Family fend them off.

---

## 1. The story as authored (day-by-day canon)

### The premise

The Silver Sasquatches are a gaming organization whose mascot is a silver
Bigfoot (`docs/CAMPAIGN-TIMELINE.md:9-22`). They adopt a Cosa Nostra family
persona and play it completely straight. Tony Squatchtana is a **Prospect** —
"the fraternity-style errand boy who has to prove he can be trusted before he
is initiated as a Squatch." Tony is **human** for the whole pre-Initiation
campaign (`docs/CHARACTER-ALIGNMENT.md:25-31`), and so is every Circle member
(`docs/CHARACTER-ALIGNMENT.md:44-48`). The campaign endpoint is his formal
initiation.

The apartment is the hub; every mission returns to it, and it must visibly
evolve after every chapter (`docs/CAMPAIGN-TIMELINE.md:157`).

### The connected route, as built

Verified against `src/core/campaign.js` (`SCENE_IDS`, `SCENES`, lines 44–461)
and `src/core/apartment-story.js` (`SLEEP_CHAPTERS`, lines 480–508), and it
matches `docs/CONTINUATION-2026-08-03.md:33-56`:

| # | Day | Scene id | Page | Leaves to |
|---|---|---|---|---|
| 1 | 1 | `apartment` | `index.html` | Bada Bing one, after eat/shower/poop/change + Lou's call |
| 2 | 1 | `bada_bing_one` | `bing.html` | apartment, carrying Lou's package |
| 3 | 1 | `apartment` | — | Squatchfather (whiskey nerve-settle between) |
| 4 | 1 | `squatchfather` | `squatchfather.html` | apartment → sleep |
| 5 | 2 | `apartment` | — | Beef Run, after Booskibro's call (wake 07:00) |
| 6 | 2 | `airstrip_smuggling` | `beefrun.html` | apartment |
| 7 | 2 | `apartment` | — | Bada Bing two, after Lou's second call |
| 8 | 2 | `bada_bing_two` | `bing.html?visit=2` | **`squatch_graveyard` directly** |
| 9 | 2 | `squatch_graveyard` | `graveyard.html` | **`jerky_motel` directly** |
| 10 | 2 | `jerky_motel` | `motel.html` | apartment (home 04:30) → sleep |
| 11 | 3 | `apartment` | — | NO WAKE, after Lou's vague harbor call (wake 12:00) |
| 12 | 3 | `no_wake` | `nowake.html` | apartment; completion advances into `date` same day |
| 13 | 3 | `apartment` | — | Silver Room, after Margo Salas's call |
| 14 | 3 | `silver_room` | `silver.html` | apartment (23:20) → sleep |
| 15 | 4 | `apartment` | — | Silver Pines, after Margo's morning beat + Lou's golf call |
| 16 | 4 | `silver_pines` | `golf.html` | apartment |
| 17 | 4 | `apartment` | — | THE TAKE, after Lou's heist call + seven loadout pickups |
| 18 | 4 | `bank_heist` | `heist.html` | apartment |
| 19 | 4 | `apartment` | — | Initiation, after wash / change / hide-gear |
| 20 | 4 | `initiation` | `initiation.html` | **no outbound edge — terminal WIP** (`src/core/campaign.js:446-451`) |

Chapter machine (separate from calendar day, advanced by sleep or an authored
completion): `day_one → day_two → no_wake → date → golf_morning → heist_day →
post_heist → big_night`. Confirmed in `src/core/apartment-story.js:480-508`
and `src/core/campaign.js:2172,2194,2246`. `big_night` is last.

### Day by day, as the docs tell it

**Day 1 — Welcome to the Life** (`docs/CAMPAIGN-TIMELINE.md:41-64`). Wakes
06:04 as an unknown Prospect. Flat is anonymous — *no trophies, because there
have been no missions*. Four required chores plus Lou's phone call. Bada Bing
one is "exciting, not threatening — the Prospect thinks he has found the coolest
group of lunatics on Earth." The Squatchfather is "the campaign's first
irreversible step: before this he was hanging around criminals; after it he is
one." Parody target: *The Godfather* (`docs/TONE-AND-PARODY.md:85`).

**Day 2 — Trusted With Business** (`docs/CAMPAIGN-TIMELINE.md:66-88`). The flat
reacts: radio/TV mention the restaurant, bloodstained clothing, more contacts,
more money. The Beef Run (Captain Lou Sasole, a *different* Lou) proves family
business is "ridiculous, dangerous, and surprisingly organised." Bada Bing two
becomes the **Billy HotDog incident**: closed party → Ape attack → a body
problem → physical cleanup. Then the **Squatch Graveyard** — Tony carries
HotDog to the plot, places him, buries him; burial unlocks the Motel and the
surrounding markers form "an optional memorial museum with durable state"
(8 named graves; respect and urination are both recorded —
`src/core/graveyard-story.js:44-80`, `src/core/campaign.js` `MEMORIAL_GRAVE_IDS`
/ `TRAITOR_GRAVE_IDS`). The Jerky Motel is "the point where the campaign stops
feeling glamorous."

**Day 3 — Loyalty Gets Ugly** (`docs/CAMPAIGN-TIMELINE.md:90-109`). Rain, motel
news on the wire, Lou's call is unusually vague, and **Willy is gone from the
contacts before the player knows why**. NO WAKE is the boat: betrayal, the
others prepare, *the scene waits for Tony's click and Lou and Booski fire only
after him* (`docs/NO-WAKE-PRODUCTION.md:45-48`), body disposal, silent ride
back. "The emotional low point — the restaurant's dead were enemies; Willy was
one of them." Then **Front and Center** immediately after, deliberately, for
tonal whiplash: the Copacabana date with Margo Salas, a civilian who runs the
kitchen at the Blue Hour on Ashland and has *no stake* in Lou or the family,
which is the only reason her good opinion costs anything
(`docs/FRONT-AND-CENTER.md:79-97`).

**Day 4 — The Peak** (`docs/CAMPAIGN-TIMELINE.md:111-147`). Margo's morning.
The flat now shows his rise — cash, expensive clothes, memorabilia, weapons,
souvenirs. **A Morning at Silver Pines** (three holes with Lou, Rippinflow and
Eric; a status reward and a pressure-release). **THE TAKE** — the bank job,
parody target *Heat*; it does not end at the escape, it decompresses through
vehicle swap, safehouse, counting money, arguing, checking who survived, and
the invitation to tonight. Then home to wash, change and hide the gear — three
physical door requirements — and out to the **Initiation**.

### The Initiation as authored (two competing shapes)

- **`docs/STORY.md:54-264`** — the Pines/forest ceremony. Walk in under
  BRING NOTHING; the line of five prospects; Booskibro's speech; **The Question**
  (five founders); Prospect One answers "Bigfoot? Garfield? …the GEICO Gecko"
  and Snow puts eight rounds in him — "the first two put Prospect One down; the
  other six are policy"; the crowd's non-reaction is the joke. Then Tony's quiz,
  **The Gauntlet** (endure, never swing back, stopped at one fifth health),
  **The Roar**, **The Timber**, and **The Anointing** — "You walked into this
  clearing a prospect. Walk out a SQUATCH." Then **THE PARTY** ("The Den"):
  keg, bong circle, log toss, the wall of five crooked founder portraits (one is
  a raccoon), Booskibro's toast, and Prospect One still where he fell with a red
  Solo cup in his hand and a bandana on him — post-mortem membership, with an
  `E — Pour one out for Prospect One` prompt. Ending card: **SILVER**.
- **`docs/CAMPAIGN-TIMELINE.md:141-147`** — a Bada Bing oath ceremony: old
  faces return, the Prospect is praised for specific campaign actions, Lou
  explains membership, the oath, formal acceptance, "Prospect" replaced by his
  name. Final image: Lou raises a glass, camera pulls back from the club, a
  television quietly reports the search for the heist crew, credits.

### The approved Initiation rewrite (not yet built)

Stated identically in six places — `docs/STORY.md:3-10`,
`docs/OUTCOMES-AND-NPCS.md:3-11`, `docs/CHARACTER-ALIGNMENT.md:73-78`,
`docs/CONSOLIDATION-HANDOFF.md:262-265`, `docs/NEXT-SESSION-PROMPT.md:126-130`,
`README.md:81-86`:

1. **Review Tony's completed campaign accomplishments** (missions and activities
   recalled during his verdict);
2. **Execute every failed rival prospect** — not only Prospect One; each dies for
   their own failure;
3. **Admit Tony only if the required campaign work is complete** (a conditional
   verdict);
4. **Visibly transform Tony and every recognized family member into literal
   sasquatches**, on screen, after the admission.

Plus the engineering half (`docs/CONTINUATION-2026-08-03.md:240-246`): the
scene's first `campaign.enter` claim, a completion time event, an outbound edge
home, and credits/outro.

Hard gate, repeated everywhere: **do not touch the Initiation runtime until the
owner has playtested the current scene** (`docs/CONTINUATION-2026-08-03.md:293`,
`docs/CONSOLIDATION-HANDOFF.md:270-272`).

### The arc the docs *don't* list — built after 2026-08-01

`docs/CAMPAIGN-TIMELINE.md`, `README.md` and the release audit predate three
whole missions that now exist in `src/`:

- **The Silver Case** (`silvercase.html`, `src/silvercase/`) — *Pulp Fiction*,
  collecting a debt in somebody's apartment, with Ape. Standalone: "no import of
  core/campaign.js, no navigateCampaign call anywhere in this file"
  (`src/silvercase/main.js:24-36`). It ends with the chrome case.
- **PROJECT SILENT SQUATCH** (`mansion.html`, `src/mansion/`) — Lou's mansion,
  "immediately after The Silver Case" (`docs/MISSION-SILENT-SQUATCH.md:3-4`).
  Full spec, 11 beats, built. See §4.
- **The Enola Squatch** (`enolasquatch.html`, `src/enolasquatch/`) — the night
  bombing raid, on the Beef Run's flight model, dropping the **Fat Squatch** on
  the city of **Squatchbourg** (`src/enolasquatch/config.js:271-317`). The
  payload is the weapon Silent Squatch's core was built for
  (`docs/MISSION-SILENT-SQUATCH.md:22-27`: *"Fat Squatch — the completed
  deployable payload (already flown in the Enola Squatch)"*).
- **License to Grill** — a Bada Bing side quest with James Blond, a foreign
  intelligence officer, and a name: **Vincent Mallard, behind the laundromat on
  Thursdays** (`docs/CONTINUATION-2026-08-03.md:356-386`). Explicitly built with
  an unconsumed hook: *"The Enola Squatch informant encounter. The name and the
  meeting are persisted; no mission consumes them yet."*

So the real authored arc has a **second act nobody has written into the
timeline**: a weapons programme, a foreign intelligence thread, and a city that
got bombed — none of which the Initiation currently acknowledges.

---

## 2. Doc contradictions, and which doc wins

| # | Contested point | The docs disagree | Which wins, and why |
|---|---|---|---|
| 1 | **Where the finale happens** | `docs/STORY.md:54-264` = the Pines: quiz, execution, gauntlet, roar, timber, anointing, forest party. `docs/CAMPAIGN-TIMELINE.md:141-147` = the Bada Bing: oath, callbacks, Lou's glass, TV, credits. | **Neither is settled.** `docs/CAMPAIGN-TIMELINE.md:172-175` explicitly flags it as an open reconciliation, and `docs/CONSOLIDATION-HANDOFF.md:584-588` lists it as a design question for the owner. The **code** settles the geography by default: `src/initiation/main.js:25-31, 48-59` builds the night forest, the fire, the stage and the prospect line — the Pines version is what is playable, so STORY.md wins on geography until the owner rules otherwise. |
| 2 | **Does the heist exist** | `docs/CAMPAIGN-AUDIT-2026-08-01.md:94-96, 116, 131` = "Heat-style heist **unbuilt / design-frozen**, absent from production, do not build." | **Superseded.** `docs/RELEASE-CANDIDATE-FLOW-2026-08-01.md:1-6, 75` and the code (`src/heist/`, `SCENE_IDS.BANK_HEIST`) say THE TAKE is built and connected. The audit carries its own supersession banner at line 3. |
| 3 | **Chapter machine** | `docs/CONSOLIDATION-HANDOFF.md:320-332` and `docs/CONTINUATION-2026-08-03.md:57-59` = `day_one → day_two → no_wake → date → big_night`. | **Code wins.** `src/core/apartment-story.js:480-508` and `src/core/campaign.js:2172,2194,2246` add `golf_morning`, `heist_day` and `post_heist`. Both docs are stale; CONTINUATION is the more recent (2026-08-04 commit) but was written before the golf/heist chapter split landed on this branch. |
| 4 | **Save schema version** | Handoff says v8, release flow says v9, CONTINUATION says v10 (`docs/CONTINUATION-2026-08-03.md:96`). | **Code wins: `CAMPAIGN_VERSION = 12`** (`src/core/campaign.js:296`). CONTINUATION already called this out as documentation drift and is itself now two versions behind. |
| 5 | **Where the Prospect ends up, species-wise** | `docs/CHARACTER-ALIGNMENT.md:25-31` and `docs/CAMPAIGN-AUDIT-2026-08-01.md:142` = "Literal Sasquatch transformation is planned ending material, not current behavior." `docs/STORY.md:200-205` = "Same bones. New bandana." | **Both are true and both are current.** STORY.md describes the *frozen playable* scene (verified: `src/initiation/main.js:1584-1599` keeps him human and adds the red bandana; `tools/verify-initiation.mjs:133,136` asserts it). CHARACTER-ALIGNMENT describes the *approved rewrite*. There is no conflict, only a sequencing gate. |
| 6 | **Which doc is the production source of truth** | `docs/GAME-PLAN.md:3-8` points at CONSOLIDATION-HANDOFF; CONSOLIDATION-HANDOFF's own banner (line 3) points at RELEASE-CANDIDATE-FLOW; RELEASE-CANDIDATE-FLOW (line 3) supersedes CAMPAIGN-AUDIT and CONSOLIDATION-HANDOFF. | **Chain resolves to `docs/RELEASE-CANDIDATE-FLOW-2026-08-01.md` for release state**, `docs/CAMPAIGN-TIMELINE.md` for owner-authoritative story shape, and `docs/CONTINUATION-2026-08-03.md` for the most recent code-verified snapshot. All three are now behind the mansion/Silver Case/Enola Squatch work. |
| 7 | **Tone doctrine** | `docs/OUTCOMES-AND-NPCS.md:25-38` = "dark comedy, HBO gore, Stanley-Parable deadpan," narrator-led. `docs/TONE-AND-PARODY.md` (2026-08-04) = the parody is recognition; the scene must **never** wink, must play at full intensity, and the mission spine must not be funny. | **`docs/TONE-AND-PARODY.md` wins outright.** It is the newest (2026-08-04), the owner stated it in his own words, and `docs/CONTINUATION-2026-08-03.md:270-276` re-adopts it as a standing rule for every scene "including the ones not yet written." The narrator voice from OUTCOMES-AND-NPCS survives as *writing register*, not as licence for the scene to comment on itself. |
| 8 | **The party after the ceremony** | `docs/STORY.md:214-264` specs THE PARTY in full and `docs/OUTCOMES-AND-NPCS.md:222-339` specs its NPC brain. `VOICE-LINES-TODO.md:1262-1264` says the 116 party lines are recorded but "the party body is not instantiated by the playable Initiation scene." | **Code wins on state, docs win on intent.** `src/initiation/npc.js` is the full archetype × standing × state engine, present and unused. The party is written, cast and recorded; only the scene body is missing. |
| 9 | **Margo's outcome mattering later** | `docs/CONTINUATION-2026-08-03.md:247-249` and `docs/NEXT-SESSION-PROMPT.md:172-176` = open owner call whether `missions.silver_room.outcome`/`seeingHerAgain` surfaces at the Initiation. | **Still open.** But the code moved: `cameHome` now survives the seam and gates the Day 4 morning cutscene (`src/core/apartment-story.js:1350-1367`), so the hook already has a working precedent to copy. |
| 10 | **Which mission follows which** | `docs/MISSION-SILENT-SQUATCH.md:3` puts the mansion "immediately after The Silver Case," but neither is in `docs/CAMPAIGN-TIMELINE.md`, and `src/core/campaign.js:284-292` says outright that the mansion "follows The Silver Case, which is not yet a routed scene, so pinning it to a wall-clock time would be inventing a place for it in a day the campaign has not written yet." | **The code's own comment wins and is the most honest statement in the project.** The Silver Case / mansion / Enola Squatch trio is a floating act with no day assigned. §6 places it. |

**Most current doc, per contested point:** tone → `TONE-AND-PARODY.md`
(2026-08-04); mission specs → `MISSION-SILENT-SQUATCH.md` (2026-08-04); code
state → `CONTINUATION-2026-08-03.md` (2026-08-04) but already superseded on
chapters and schema by `src/core/campaign.js`; release gates →
`RELEASE-CANDIDATE-FLOW-2026-08-01.md`; story shape →
`CAMPAIGN-TIMELINE.md`. `GAME-PLAN.md`, `CAMPAIGN-AUDIT-2026-08-01.md` and
`CONSOLIDATION-HANDOFF.md` are self-declared archives.

---

## 3. Initiation: frozen state vs approved rewrite

### What the frozen ceremony actually does

Files: `initiation.html`, `src/initiation/main.js` (1,921 lines),
`dialogue.js`, `npc.js`, `audio.js`, `voice.js`.

**Setup.** Night forest, bloom-lit fire, a stage at `(0, 9)`, spawn at
`(0, -78)`; walking within 24 m of the fire starts the ceremony
(`src/initiation/main.js:48-51`). A prospect line at `z = -8`: **four NPC
prospects plus one glowing empty slot — yours. You are Prospect Two, right next
to the poor soul who goes first** (`main.js:53-58`).

**Cast.** 14 members (`MEMBER_COUNT`, `main.js:46`). Featured with real face
photos in semicircles behind the line: SHUBES, DEATHMEGATRON, RIPPINFLOW, SNOW,
ERICAN, HOGMAMA, GRATIN, CAPTAIN LOU SASOLE (`main.js:86-95`), plus five
unnamed second-row slots. Booskibro (purple bandana, `booski.png` face) and Big
Uncle Lou Sputthole are on the stage. **Everyone is human**; Tony wears the
prospect palette with `bandana: null` (`main.js:61-78`).

**Beats**, in `updatePhase` (`main.js:1485-1615`):
`approach → line_up → speech → q1 → execution → q2_intro → q2_choice →
q2_result → clear_line → gauntlet_in → beatdown → endured → trial_roar →
roar_anim → log_broken → anoint_walk → anoint_lines → anoint_induction →
complete`, with `fail_swing → failed` as the retryable branch.

1. **The speech** — Booskibro and Lou, seven lines, including the raccoons
   organizing bit (`dialogue.js:22-30`).
2. **The Question** — Prospect One steps forward, answers "Bigfoot? Garfield??
   …the GEICO Gecko???", Lou says "Oof," Booskibro says "WRONG"
   (`dialogue.js:31-37`).
3. **The execution** — `executeProspect` / `startExecution`: the nearest member
   walks out, draws, and fires **eight rounds** with muzzle flash, light, debris
   puffs and shake (`main.js:1016-1044`). **Only Prospect One dies.** The other
   three surviving prospects walk off to the crowd's edge on the correct answer
   (`main.js:982-987`) and are never judged.
4. **Tony's quiz** — three shuffled options, one correct
   (`dialogue.js:82-94`). Wrong answer runs the same execution rig on the player
   and shows INITIATION FAILED with "Wrong founders. The Circle now knows two
   things about you: your name, and where you're buried."
   (`main.js:989-1008`).
5. **The Gauntlet** — the ring closes, members trade punches on a 0.3–0.75 s
   timer, and the beating stops at one fifth health (`STOP_HP`, `main.js:44`,
   `1531-1541`). **Swinging back fails the run** (`fail_swing`), retryable with
   Booskibro's "The Circle forgives once. Arms DOWN this time."
6. **The Roar** — press `R`.
7. **The Timber** — a great log spawns; smash it.
8. **The Anointing** — Booskibro comes down off the stage, says the three
   anoint lines, banner `SILVER SASQUATCH`, and at `inductionK >= 0.5` the
   player's `Person` is swapped for one built from `INDUCTED_PALETTE`
   (`main.js:1584-1599`). The code comment is explicit: *"At the flash's peak
   Tony is still Tony: the Circle has put him in its silver-grey colors and tied
   on the red member bandana."*
9. **Complete** — an overlay card: `— INITIATION COMPLETE —` / **SILVER
   SASQUATCH** / "You walked in a prospect. You're walking out family… and the
   Circle has **plans** for what comes next." Two buttons: `REPLAY INITIATION`
   and `TO THE CAMPGROUND ▸` → a bare `<a href="./index.html">`
   (`initiation.html:273-286`).

**What does NOT happen — verified by grep, not by doc:**

- `src/initiation/` contains **no import of `core/campaign.js`** and no
  reference to `Campaign` anywhere (imports listed at `main.js:1-23`). It
  cannot read the save.
- No `campaign.enter`, no mission status write, no completion time event, no
  `navigateCampaign`. The exit button is a raw href that bypasses the campaign
  transition system entirely.
- `SCENE_IDS.INITIATION` is registered with `next: Object.freeze([])`
  (`src/core/campaign.js:446-451`) — no outbound edge, by design, with a comment
  saying so.
- No accomplishment review, no reference to any other mission, no second
  execution, no transformation, no party. The party brain in
  `src/initiation/npc.js` (roster, archetypes, standing tiers, drunk-state
  banks, ambient barks) is complete and **never instantiated**.
- The only campaign-shared system it mounts is the five-slot inventory bar
  (`main.js:41`).

**What guards it.** `tools/verify-initiation.mjs` is an 11-check canon guard
that asserts, among others, *"Tony starts Initiation human"*, *"induction keeps
Tony human and awards the red member bandana"*, and *"completion describes
family membership rather than a species change"* (lines 86, 133, 136). **Those
three checks are written to fail the moment the approved rewrite lands** and
must be inverted as part of it.

### The delta to the approved rewrite

| Frozen today | Approved rewrite |
|---|---|
| One execution (Prospect One, the scripted failure). Three prospects walk away unjudged. | **Every failed rival prospect is executed**, each for their own failure. The rig exists — `startExecution(target)` already takes an arbitrary target with `getPos/onHit/onDead/onFinished`. |
| Verdict is a three-option quiz about founders. | **Accomplishment review**: the Circle recalls Tony's actual campaign — the restaurant, the flight, HotDog's burial, Willy on the boat, the bank. Admission is **conditional on the required work being complete**. |
| Tony ends human in silver-grey with a red bandana; the Circle stays human. | **Tony and every recognized family member visibly transform into literal sasquatches**, on screen, after admission. Firelight, bloom, ceremony, executions and supplied faces must be preserved through it (`docs/CHARACTER-ALIGNMENT.md:170-173`). |
| Ends on an overlay card and an `<a href>`. | `campaign.enter` claim, durable completion, a completion time event, an **outbound edge**, and credits/outro. |
| Party is written, cast, and recorded (116 lines) but has no body. | Party placement after transformation is *still undecided* (`docs/OUTCOMES-AND-NPCS.md:78-81`). |

**The transformation rig question.** `docs/CONSOLIDATION-HANDOFF.md:270-272`
says the old literal rig is recoverable at `ae9deef:src/initiation/sasquatch.js`
— **that object does not exist in this repository's history** (`git cat-file -t
ae9deef` fails; `git log --all -- src/initiation/sasquatch.js` is empty). That
line refers to the abandoned orphan history noted in
`docs/CONTINUATION-2026-08-03.md:97`. A working literal-sasquatch rig *is*
available in-repo: `class Sasquatch` in `game/src/player.js:44`, already
imported by `src/mansion/scenes/MansionGrounds.js` for the fountain monument.
That is the rig to build the transformation on.

---

## 4. The mansion scene as built

`mansion.html` → `src/mansion/main.js` (1,557 lines) + `scenes/` (17,248 lines)
+ `mission/` + `cast.js` + `script.js` + `loadout.js`. This is the largest
single location in the project.

### What story it tells

It tells **PROJECT SILENT SQUATCH** (`docs/MISSION-SILENT-SQUATCH.md`, owner's
spec 2026-08-04): Tony carries the chrome case from The Silver Case into Lou's
house, and discovers the house is "not merely a rich gangster's house. It is a
functioning criminal headquarters with interrogation rooms, hidden
laboratories, weapons development, and problems that disappear beneath the
floorboards." Five-stage tonal escalation: luxurious mansion intrigue → dark
comedy → uneasy underground exploration → cold-blooded execution → full horror
behind laboratory glass.

Eleven beats, all built (`src/mansion/mission/SilentSquatchStateMachine.js`
`BEAT_OF`, 20 states mapped to 11 spec beats): arrival → Lou's office (the case
opens, gold and purple light on his hands) → the hidden entrance behind the
marble Sasquatch bust in the wine cellar → the interrogation corridor, where
**xXx hangs upside down by his ankles over a pool of blood** and survives as a
recurring gag → the sealed laboratory behind reinforced glass → delivery through
the transfer drawer → the core completes ("PROJECT SILENT SQUATCH: CORE
COMPLETE") → **the player types 6969, locks the lab, and kills Aubbie in the
observation area where his body falls in full view of the six scientists through
the glass** → the reaction (a metal chair bends; the glass does not break) →
**Silent Night**: Booski lifts the red cover and does not pull it — *"You
started the job. Finish it."* — and the player gasses six people and watches
them die in ordered stages → Snow arrives with the cart and a mop.

Rewards on completion: basement access, `familyRespect +15` (the first thing in
the campaign to write that field, `src/core/campaign.js:296-310`), Aubbie's lab
notes on the apartment computer, "Silent Squatch added to the campaign
conspiracy board", and an apartment trophy — a miniature glowing Squatchanium
container (`src/core/silent-squatch-story.js:112-150`).

### How complete it is

**Very.** More complete than the Initiation.

- **Grounds** (`scenes/MansionGrounds.js`, 4,227 lines): street gate with stone
  pillars, drawn Sasquatch-footprint medallions and wrought-iron leaves swung
  open; a **perimeter fence** built with the Motel's post-row + long-collider
  technique, breaking only at the gate opening (lines 866-970); a circular
  driveway turnaround with parked cars; a hero fountain with animated water,
  spray and a Sasquatch monument; a **security booth at (8, 4)**; palms; front
  steps; a pool patio; and a full **rear garden** — brick garden wall, a maze, a
  rose garden, a canal/rill on the north-south axis, and a pavilion at
  `(0, 120.4)`.
- **Interior** (`scenes/MansionInterior.js`, 7,955 lines): foyer with a horseshoe
  stair and a balcony; living room; lounge/billiard bay with **the Bada Bing's
  own bartender behind the bar**; ballroom; dining; kitchen; gallery;
  conference/boardroom; **Lou's office** (dark wood, purple leather, the painting
  of Lou on horseback, hidden weapons under the desk and *a concealed door in
  the bookcase explicitly left "for future use"*); four bedrooms and two ensuite
  baths upstairs; trophy hall; winter garden; a west wing; and a lower level —
  cellar hall, guest room, **theatre**, LAN room, **vault (with gold bars)**, and
  the **armory**.
- **The armory is a real one** (`src/core/weapons/Armory.js`): racks holding
  full weapon models — revolver, 9mm, short carbine, AK-47, belt-fed SAW, and an
  anti-materiel Barrett (`src/core/weapons/catalog.js:83-194`) — with ammunition
  crates, take-and-return interactions, per-firearm magazine/reserve state that
  persists across putting a gun back, and colliders.
- **Inventory**: five-slot shared bar, the case in a slot, at most one weapon
  slot mirroring the armory (`src/mansion/loadout.js`), built to an owner note
  quoted verbatim in the file header.
- **Cast** (`cast.js`, 822 lines): a man on the front door who stops you before
  the top step; **six of Lou's security — three walking the grounds outside, one
  at the top of the horseshoe stair overlooking the front doors, one downstairs
  past the armory, one standing on the open vault**; the bartender; Snow and his
  cart; Gratin running the interrogation. Plus the mission's own Lou (office),
  Booski (lab), Rippin, Eric, Shubes, Irish, DeathMegatron and xXx.
- **Voice**: 175 authored cues on the recording sheet
  (`VOICE-LINES-TODO.md:938`), including dedicated `MANSION GATE` (6) and
  `MANSION GUARD` (9) profiles and six owner-cast Russian scientists.
- **Verification**: `npm run verify:mansion` (`tools/verify-mansion.mjs`) walks
  every room **on foot** through its real doorway rather than teleporting,
  descends the basement stair on foot, climbs both horseshoe flights, checks car
  overlap, the fence, the pool curb and the balcony rail. It also asserts the
  corridor's west-end wall stays blank as the seam for the lab
  (`docs/MISSION-SILENT-SQUATCH.md:89-92`).

### Does it already contain a defense/assault mission?

**No.** There is no combat in the mansion at all. `src/mansion/cast.js:38-48`
states the rule explicitly and structurally:

> **SNOW IS NEVER A TARGET.** He is not in a hostile list, a damage path or an
> aim resolver, because this module has none of those things… There is no code
> path here by which any weapon in the house can be pointed at anybody.

The only trigger pull in the building is a single scripted one that has to find
Aubbie (`src/mansion/mission/mount.js:22`). The guards are ambient bodies with
one flat bark each. The armory is a prop the player can shop at.

**But every part needed to build one exists elsewhere and is proven:**

| Need | Where it already works |
|---|---|
| Hostile actors with factions, chase, melee and ranged attack, damage, and a hard friendly-faction exclusion | `src/motel/actors.js:581-770` — and the friendly boundary is exactly the guarantee Snow needs in a firefight in Lou's house |
| Wave director with per-block budgets and named spawn gates, save/restore | `src/heist/police.js` `PoliceDirector` |
| A shooting resolver, impact kit and reaction windows | `src/silvercase/combat/Shooting.js`, `ReactionWindow.js`; `src/heist/bank-threat.js` |
| Real firearms with magazines, reserves, reload, ejecta | `src/core/weapons/` (`WeaponSystem`, `Firearm`, `Ejecta`, `models.js`) |
| Predictive tracking fire from fixed positions (a gun that leads you and gets better the longer you hold a line) | `src/enolasquatch/combat/Defense.js` |
| Mission FSM + DialogueController + HUD + campaign story adapter with checkpoints | `src/mansion/mission/*` and `src/core/silent-squatch-story.js` — the mansion's own, reusable as-is |

### How it would connect after the Initiation

Today: it wouldn't. `SCENE_IDS.MANSION` is registered with three spawns —
`gate`, `foyer`, `cellar` — and `next: [APARTMENT]`
(`src/core/campaign.js:456-461`), but **nothing routes into it**. The apartment
door has no mansion branch (`grep MANSION src/core/apartment-story.js` returns
nothing), and the mission's own story adapter reports this honestly:
`begin()` returns an `unrouted` flag and the comment says *"true of every load
today, because nothing routes here yet"* (`src/core/silent-squatch-story.js:44-58`).
It also hands the player the case if the save has never heard of one, because
The Silver Case writes no campaign state.

So the mansion is a fully built, fully verified, campaign-registered scene
sitting one edge away from the graph. Giving `SCENE_IDS.INITIATION` an outbound
edge to `SCENE_IDS.MANSION` is a **one-line change to the scene table** plus the
Initiation's first `campaign.enter`/completion write.

---

## 5. Cartel presence in the project today

**Zero.** `grep -ril "cartel\|cartél\|cártel"` across the entire repository
(excluding `.git` and `node_modules`) returns **no files**. Not in `src/`, not in
`docs/`, not in `assets/sfx/manifest.json`, not in `VOICE-LINES-TODO.md`, not in
`README.md`. There is no character, no voice profile, no cue, no faction, no
line of dialogue, no mention in any design document.

The only "rivals" in the whole project are the **rival prospects** at the
Initiation (`docs/STORY.md:8`, `docs/CHARACTER-ALIGNMENT.md:74`, etc.).

**Antagonists that do exist**, and are all closed or spent:

| Antagonist | Where | State |
|---|---|---|
| Sal "The Prospector" Sorrento + Capt. McClawsky | Squatchfather | Day 1, resolved |
| Billy HotDog | Bada Bing two | Dead, buried by Tony |
| Rico / Chino and the Motel sellers | Jerky Motel | Day 2, resolved |
| Willy | NO WAKE | Dead, informant |
| The bank guard, the police | THE TAKE | Day 4, escaped |
| James Blond / Vincent Mallard | License to Grill | **Open thread, unconsumed** |
| Aubbie + six Russian scientists | Silent Squatch | Dead by the player's hand |
| xXx | Silent Squatch | Alive, hanging, recurring gag |
| Squatchbourg | The Enola Squatch | **A whole city, bombed, with no stated owner** |

That last row is the important one. `src/enolasquatch/dialogue/script.js:385`
is the only line that describes the target: *"Squatchbourg. Grid runs
north–south, the tall part is the middle, and the middle is what we were
given."* Nobody says who they are, why, or who ordered it. The mission is built,
voiced (106 pickups on the sheet), and has a 1,180 m detailed city, a crater and
a shockwave that flattens the outskirts. **The project has already dropped an
atomic weapon on somebody and never named them.** That vacancy is the single
best place the Cartel can come from, and it costs one line of dialogue to fill.

---

## 6. Finale design brief — "THE HOUSE"

Working title: **THE HOUSE** (or **NO VACANCY** if the owner prefers the joke in
the title card and nowhere else).

### The doctrine this is written under

`docs/TONE-AND-PARODY.md` governs. The recognition is **the siege of Tony
Montana's mansion in *Scarface* (1983)** — Sosa's men over the wall, the guards
dying quietly on the grounds, the balcony above the foyer, the last stand at the
top of the stairs — with the *Godfather Part II* "they came into my home" note
underneath it. The parody is entirely the player's: it is that the man defending
the mansion is called Tony, that the anti-materiel rifle has been hanging on a
rack in the basement for two missions, and that the family fighting off the
assault are, since roughly nine o'clock this evening, literal sasquatches.

**Nothing in the scene notices any of that.** No character says "just like the
movies." The mission spine, the threat and the failure states play at full
intensity. The comedy lives where it always lives — Irish still cannot get an
answer about the eggs while reloading, the Shubenator is crying and blaming the
smoke, Big Uncle Lou is genuinely more upset about the fountain than about the
casualties — and every one of those lines is delivered by somebody who is
working.

### 6.1 Seeding the Cartel BEFORE the finale

The Cartel must not appear for the first time at the gate. Seven existing
surfaces can plant them, none of which needs a new system:

**A. The wire (strongest, cheapest, already built).**
`CHAPTER_NEWS` in `src/core/apartment-story.js:687-788` gives every chapter a
radio bulletin and a TV bulletin, delivered through `radio.broadcast()` with a
durable `bulletinId` so it can never repeat (`src/main.js:3500-3527`,
`src/core/radio.js:720-722`). The file's own rule is *"Never names him — a
bulletin that named him would be a plot point, and this is weather."* Keep that
rule and let the weather get worse:

- `day_two` — add a second wire item: a container yard on the south side,
  four men, nobody local, plates from a long way away.
- `no_wake` / `date` — the same yard is now a federal matter; the county says it
  is not commenting on the county road *or* the yard.
- `golf_morning` — three men found in a car at the airfield perimeter. Captain
  Lou Sasole's airfield. Say the name of the road, not the airfield.
- `post_heist` — the existing line already says police "have not released names,
  faces, or a reliable count of the missing cash." Add: *and a second party has
  been asking after the count.*
- `big_night` — the existing line is perfect and must not change: *"Quiet week
  on the wire, which around here means somebody has had a word."* It reads as
  Lou's reach on the first playthrough and as the calm before the assault on the
  second. That is the whole trick.

**B. The grey sedan at the Bing.** Bada Bing one already has four endings chosen
entirely by what Tony did about a grey sedan in the wet lot — `followed`,
`plate`, `warned`, `rear` (`docs/GAME-PLAN.md:379-389`), saved as a mission
outcome. It was never explained. **It was them.** In the finale's cold open, a
grey sedan is the first vehicle through the gate, and if the player read the
plate on Day One, the plate matches. Nobody points this out; it is simply the
same plate, and the player who wrote it down four days ago gets the drop on
everyone else.

**C. THE TAKE's money.** Cumberland Fidelity is a bank, and banks hold other
people's money. One line in the safehouse settlement — Numbskull counting,
finding a strapped bundle with the wrong band on it — makes the finale **Tony's
fault**, which is the only version of this that has any weight. The heist
already persists loot and settlement state (`src/heist/loot.js`,
`src/core/campaign.js` BANK_HEIST checkpoints), so the seed can be a single
outcome flag.

**D. Squatchbourg.** The Enola Squatch's briefing is a blank cheque. One added
line in `src/enolasquatch/dialogue/script.js` around `bomb.cityInSight` — Irish
naming *whose* city the middle of it is — retroactively makes the entire raid
the act of war the finale answers. This is the highest-value seed per word in
the project: an existing, built, voiced mission becomes the inciting incident.

**E. PROJECT SILENT SQUATCH.** The Family built a weapon, murdered the six
people who knew how, and kept the notes. The Cartel wants the notes, the core,
or revenge for Squatchbourg — pick one and only one. The mission already writes
`conspiracyBoard: true` and `notesRecovered: true` into the save
(`src/core/silent-squatch-story.js:136-141`), and **nothing in the apartment
reads either flag yet.** Building the conspiracy board as an apartment prop —
strings, photographs, the Squatchanium miniature on the shelf beside it — is
already an owed reward, and it is the natural place for the Cartel's face to
appear before the player ever meets them.

**F. Lou's office bookcase.** `docs/MISSION-SILENT-SQUATCH.md:56-58` specifies
"**a concealed door in the bookcase for future use**." It was built for this.
It is how Lou does not die.

**G. The Bing floor and the phone.** Twelve second-topic Family interactions
landed on 2026-08-03 (`docs/CONTINUATION-2026-08-03.md:345-347`). One of them —
Irish, whose entire register is procedural grievance — should be complaining
that nobody has answered his question about *why the yard on the south side has
new people in it*. He is right, nobody answers him, and it is the only warning
anybody gets.

**Rule for all seven: the Cartel is never seen, never named by a Family member,
and never given a scene of its own before the gate.** They are a plate, a
bulletin, a bundle with the wrong band, and a grievance nobody addressed.

### 6.2 The transition: Initiation → the mansion

The Initiation rewrite lands first (accomplishment review, rival executions,
conditional verdict, mass transformation, `campaign.enter`, completion event).
Then:

1. **The clearing, after.** The transformation banner drops. For the first time
   all night the objective is not a threat. Give the player **the short party** —
   the written, cast and recorded one (`docs/STORY.md:214-264`,
   `src/initiation/npc.js`, 116 indexed lines). Not the free-roam version; a
   **timed victory lap**, ten minutes of standing at a keg being congratulated by
   eleven people who are now eight feet tall and covered in silver hair and do
   not think that is worth mentioning. Prospect One is still where he fell, with
   a Solo cup in his hand and a bandana on him. `E — Pour one out for Prospect
   One` stays exactly as written.
2. **The call cuts it.** Booskibro's phone. He does not react and he does not
   explain — he puts the cup down, and that is the tell. **Big Uncle Lou is not
   at the Initiation** in the current staging he is *on the stage*, so use the
   Bing/mansion Lou: the call is *from* the house, and it stops.
3. **The drive.** Reuse the existing travel seam — `TIME_EVENT_IDS.DEPART_MANSION`
   already exists at **25 minutes** (`src/core/campaign.js:292`) and was
   deliberately written as a duration rather than a wall-clock time. It fits a
   night departure from the Pines with no changes.
4. **Route.** `SCENE_IDS.INITIATION.next` becomes `[SCENE_IDS.MANSION]` and the
   Initiation's completion applies `travel.mansion`. Arrive at spawn **`gate`**,
   which already exists — the same gate the Silent Squatch mission drops him at,
   now on fire.
5. **Tony arrives as a sasquatch**, in the Circle's silver-grey, and this is the
   first scene in the entire campaign where his own hands in view are not human.
   `docs/CHARACTER-ALIGNMENT.md:115` is careful that the restaurant mirror and
   the gun hand use human skin "never silver fur" — that constraint expires here,
   deliberately and visibly.

**If the owner prefers the mansion to be reachable before the Initiation too**
(so Silent Squatch is playable in route), the clean shape is: Silver Case →
mansion (Silent Squatch) → Enola Squatch as a new Day 5 act between THE TAKE and
the Initiation, with the finale re-entering the same mansion scene at a
different spawn. The scene table already supports it — `foyer` and `cellar` are
registered spawns.

### 6.3 The mansion defense: mission structure

**One scene, three collapses, and the house loses a floor each time.** Model it
on Silent Squatch's own five-stage escalation, run backwards — that mission
walked *down* into horror; this one is driven *down* into it.

**Cold open — the gate (grounds).** Tony arrives at the gate. The man on the
door is dead on the top step; his one flat bark from `cast.js` is the last thing
he said. Objective: **get inside**. The wrought-iron leaves are still swung open
because nobody ever closes them. Cover is the parked cars, the fountain, the
gate pillars — all built, all collidered. The security booth at `(8, 4)` is the
first thing the player should want and the worst place to be.
*Mechanic:* Tony has whatever he walked out of the forest with, which is
**nothing** — the Initiation's rule is BRING NOTHING and its inventory is empty
by design (`src/initiation/main.js:38-41`). He fights the forecourt with his
hands and takes a dead guard's 9mm. A sasquatch with a pistol is not a power
fantasy yet; it should feel like being outnumbered in your employer's driveway.

**Act one — the house (ground floor).** Objective: **find Lou**. The foyer, the
horseshoe stair, the balcony above it. The lounge bay's floor-to-ceiling glass
is the flank nobody defended, and the bartender is behind the bar because he had
nowhere else to go. The kitchen's service door and the winter garden are the two
routes in that the Family cannot cover at once. This is where the
**PoliceDirector** pattern earns its keep: budgeted waves through named gates —
`gate`, `pool`, `service`, `garden` — with the budget visible to the player only
as pressure.
*The payoff beat:* the transformed Family are fighting **as actual sasquatches**,
and the assault is losing because of it. Deathmegatron takes a burst and keeps
walking. The horror is played from the attackers' side and never remarked on
from ours. Rippinflow says four words all night, and one of them is at the top
of the stairs.

**Act two — the garden and the pool (flank).** Objective: **hold the rear**.
The rear garden is the mansion's most under-used geometry and its best combat
space: a brick garden wall, a **maze**, a rose garden, a canal/rill running the
north-south axis, and a pavilion 120 m out. Sightlines the front of the house
does not have. This is where the **Barrett** on the basement rack becomes the
answer to a problem rather than a toy, and where `enolasquatch/combat/Defense.js`'s
predictive tracking model can drive a fixed gun that gets better the longer the
player holds a line.

**Act three — the basement (the last floor).** Objective: **the vault, and then
the wall**. They come down the stair. The armory is here, so this is the first
moment the player has everything and it is also the moment there is nowhere left
to go. The theatre, the LAN room, the guest room and the **open vault with the
gold bars** are the fighting rooms. The man standing on the vault in `cast.js`
is still standing on it.

**The last room.** The marble bust. The wall slides backward then sideways. The
concrete stairwell. **xXx is still hanging there** and says something about the
noise. And the last stand is in the **observation area, behind the same
reinforced glass that six people died against** — glass a chair could not break,
which is now the only thing between the family and the men coming down the
stairs. Chalk it exactly as the spec did: impacts on the glass stay sharp and
heavy while everything behind it goes muffled
(`docs/MISSION-SILENT-SQUATCH.md:285-293`).

**The switch is still on the wall.** `SILENT NIGHT PROTOCOL`, under its red
safety cover. The finale's final mechanical beat is the player lifting that
cover a second time, with the lab full of the wrong people, and Booski's line
from the earlier mission returning to him inverted — *he* started this job.
Whether it is Tony who pulls it or Booski is the single most important authored
choice in the finale and should be the owner's call; **the mirrored version, in
which Tony hands it to Booski and steps aside, is the better story.**

**Structural requirements** (from `docs/TONE-AND-PARODY.md` and the standing
rules):
- **Snow is never a target.** He is in this house, with a cart. Route every
  hostile list and aim resolver through the Motel's friendly-faction boundary
  (`src/motel/actors.js:593-602`) and add a mansion browser check for it — this
  is the highest-risk regression in the whole finale.
- **HUD instructions never replace a character.** Booski says the thing, the
  objective appears in his `onDone` — the `sayThenInstruct` shape from
  `src/silvercase/main.js`, already followed by `src/mansion/script.js:17-23`.
- **Not a cutscene.** The player personally carries, opens, fights, reloads,
  drags, closes and pulls. Silent Squatch's own closing rule
  (`docs/MISSION-SILENT-SQUATCH.md:296-307`) applies verbatim: the actions make
  the Prospect responsible.
- **Checkpoints** on the Silent Squatch pattern: `gate`, `house`, `garden`,
  `basement`, `lab`, `clear`, persisted via a `mansion-defense-story.js` twin of
  `src/core/silent-squatch-story.js`.

### 6.4 The payoffs the arc has earned

**Margo.** The one civilian, and the only person in the story who wants nothing.
She must not be in the mansion, must not be rescued, and must not be threatened
— all three would make her family, and the whole design of her is that she
isn't (`docs/FRONT-AND-CENTER.md:83-89`). The right beat is the **answering
machine**, which the apartment already has: she rings during the assault, and
the player hears the message in the epilogue, in a flat, standing on new legs.
Gate it on `missions.silver_room.cameHome` — the field already survives the seam
(`src/core/apartment-story.js:1354-1367`) — so the man who did not earn the
evening does not get the message. That closes the open owner question at
`docs/CONTINUATION-2026-08-03.md:247-249` without putting her on screen.

**Booskibro.** He is the patriarch, the ceremony leader, and the man who lifted
the Silent Night cover and made someone else pull it. The finale owes him the
inversion. He should be the one who **does not stop** — not the one who dies
heroically, the one who keeps giving orders in a room where the orders have run
out. His toast from `docs/STORY.md:243-257` is the callback: *"Tonight the
Circle grew by one. And shrank by one. The math is called nature, and nature is
called — Lou, what's it called —"* / *"Attrition."* Somebody should say
attrition again, and this time nobody should laugh.

**Big Uncle Lou.** The bookcase door. He gets out, or he refuses to, and either
one is a scene. His register is the raccoons-organizing register — he should be
audibly, sincerely more upset about the fountain and the cars than about the
casualties, because that is exactly the joke the world tells and the scene never
tells.

**Billy HotDog's grave.** The epilogue's location. The Squatch Graveyard is a
built, campaign-owned scene (`graveyard.html`) with a burial the player performed
with a shovel, eight named memorial markers, and a persistent ledger of which
graves Tony inspected, paid respects to, or urinated on
(`src/core/graveyard-story.js:44-80`). After the assault there are **new fresh
plots beside HotDog's**, and the player digs at least one of them. If the ledger
says he disrespected Brawny and Whiplash on Day Two, somebody notices now, and
does not make a thing of it. The strongest single payoff available in the
project, and the scene already exists.

**The transformed Family fighting as sasquatches.** This is the mechanical
reason the finale is winnable and the tonal reason it is horrifying. It must not
be treated as a superpower — no health bar change, no slow-motion. The Family
are simply harder to stop than the people who came to stop them, everyone in the
house behaves as though this is Tuesday, and the attackers' radio traffic is the
only place the audience is allowed to hear that something is wrong.

**The rival prospects.** They died in a clearing three hours ago for not knowing
five names. Nobody moved them. Nobody will. One line, from Hog Mama, about who
is going out there in the morning.

### 6.5 The ending beat(s) after the assault

Four beats, in order. Total run time should be shorter than the Silent Squatch
epilogue, not longer.

1. **The count.** Dawn. The house standing, the fountain destroyed, the glass
   holding. **Snow with the cart**, and the exchange from Silent Squatch played
   straight and enormous: *"How bad?"* / *"Bring the cart."* / *"Jesus Christ."*
   / *"And a mop."* Booski said it the first time about six people. Somebody
   should say it now about a house.
2. **The wire.** 97.8 the following morning, on a radio in a room nobody is in.
   The `big_night` bulletin already written is the exact right words and must be
   reused verbatim: *"Quiet week on the wire, which around here means somebody
   has had a word."* The player has now heard that line twice and it means
   something different both times. Nothing on the wire about the mansion. That
   is the point.
3. **The flat.** Tony comes home. The apartment hub, dressed one last time: the
   conspiracy board with strings on it, the Squatchanium miniature glowing on a
   shelf, the money, the memorabilia, the extremely questionable laundry basket
   — and a door handle with a wobble in it. Margo on the answering machine. The
   card from `docs/STORY.md:258-264`, adjusted for what he now is:

   > **SILVER.** You came here from an apartment with a wobble in the door
   > handle. You are leaving as a made man with a bandana and a hangover
   > scheduled for noon. There is no going back. Your lease, ironically, also
   > says that.

   The joke that the lease outlasts the transformation is the last deadpan beat
   in the game and should be the last thing on screen before the card.
4. **The graveyard, and credits.** Morning, the plot beside HotDog's, the crew
   with shovels. Credits roll over the campaign's own accumulated evidence —
   the memorial ledger, the Silver Pines scorecard, the heist settlement, the
   date outcome, the graves. The final campaign state writes `complete`, and
   `SCENE_IDS.MANSION.next` returns to `[SCENE_IDS.APARTMENT]` — which it
   already does — so the player who wants to walk around his own flat afterwards
   can.

**What the ending must not do:** name the parody, wink at the transformation,
explain the Cartel's motive in a monologue, or resolve Vincent Mallard. That
last thread (`docs/CONTINUATION-2026-08-03.md:380-386`) should be left hanging
on purpose — the campaign has one man tied up in a basement who survives, one
name behind a laundromat on Thursdays, and one city that is not there any more.
Three unpaid debts is the right number for a family that has just won.

---

## 7. Unbuilt / pending ledger from the docs

### P1 — blocks calling the campaign finished

| Item | Source | State |
|---|---|---|
| **Initiation has no completion, outro, or outbound edge** | `docs/RELEASE-CANDIDATE-FLOW-2026-08-01.md:193`; `docs/CAMPAIGN-AUDIT-2026-08-01.md:190`; `docs/CONSOLIDATION-HANDOFF.md:560-564` | Confirmed in code: `src/core/campaign.js:446-451` `next: []`; no `campaign.enter` anywhere in `src/initiation/` |
| **The Initiation rewrite** (accomplishment review, rival executions, conditional verdict, mass transformation) | Six docs, identical wording | **Frozen pending owner playtest.** The playtest is the gate on everything downstream |
| **Finale geography unreconciled** (Pines vs Bada Bing) | `docs/CAMPAIGN-TIMELINE.md:172-175`; `docs/CONSOLIDATION-HANDOFF.md:584-588` | Open owner decision |
| **No fresh-save human playthrough on any candidate** | `docs/RELEASE-CANDIDATE-FLOW-2026-08-01.md:194`, checklist line 246-247 | Outstanding |

### P2 — content and continuity

| Item | Source | State |
|---|---|---|
| **Front and Center closing apartment-with-Margo cutscene** | `docs/CAMPAIGN-TIMELINE.md:166-167`; `RELEASE-CANDIDATE-FLOW:196` | Not built; Day 4 opens with her already in the bed |
| **Initiation party body** — brain and 116 recorded lines exist, scene does not | `VOICE-LINES-TODO.md:1262-1264`; `src/initiation/npc.js` | Written, cast, recorded, uninstantiated |
| **Bada Bing two recognition beats** (bartender's new lines, dealer/performer comments, Lou covering drinks, informant hints, nervous Willy) | `docs/CAMPAIGN-TIMELINE.md:161-165`; `CONTINUATION:86` | Belongs to an obsolete draft; must be redesigned into the HotDog party if revived |
| **Silver Room outcome visibility at the Initiation** | `docs/CONTINUATION-2026-08-03.md:247-249` | Open owner call. §6.4 proposes closing it via the answering machine |
| **DJ request switch** reachable only on a legacy fallback path | `CONTINUATION:87`; `RELEASE-CANDIDATE-FLOW:198` | Infrastructure preserved, unrouted |
| **The Silver Case is not a routed campaign scene** | `src/silvercase/main.js:24-36`; `src/core/silent-squatch-story.js:28-33` | Standalone; writes no campaign state |
| **The mansion is not routed** | `src/core/silent-squatch-story.js:44-58` | Registered scene, three spawns, zero inbound edges |
| **The Enola Squatch is not routed** | No `SCENE_IDS` entry | Standalone |
| **License to Grill: apartment collectible, the `licenseToGrillCallback`, the spy tuxedo, and the Enola Squatch informant encounter** | `docs/CONTINUATION-2026-08-03.md:378-386` | Written and tested, mounted nowhere |
| **Conspiracy board and Squatchanium trophy** — flags written, nothing reads them | `src/core/silent-squatch-story.js:136-141`; `src/mansion/main.js:900` | Owed reward, unbuilt in the apartment |
| **Billy HotDog confrontation/aftermath/cleanup refinement** (priority 8) | `docs/CONTINUATION-2026-08-03.md:350-354` | Not started |
| **"Can't You Hear Me Knocking" on the Beef Run takeoff** | `docs/CONTINUATION-2026-08-03.md:388-402` | Parked by owner request pending the file |
| **Silver Pines / Beef Run landing / Front-and-Center staging human passes** | `RELEASE-CANDIDATE-FLOW:195`; `CAMPAIGN-TIMELINE:177-180` | Outstanding judgment calls |

### P3 — production and known defects

| Item | Source |
|---|---|
| **686 manifest cues missing recordings**; 641 voice files ready for direct delivery; 57 manifest effects | `VOICE-LINES-TODO.md:7-9` (the doc-quoted "70 voice lines / 14 effects" figure is badly stale) |
| **124 indexed files with no manifest owner**; 96 legacy voice rows excluded | `VOICE-LINES-TODO.md:12-14` |
| **10 provisional voice profiles** needing a voice-lead audition (CAIB radio, heist customer/guard/manager, HR, lookout, Motel Rico/Chino, NPC male, unknown) | `VOICE-LINES-TODO.md:25-68` |
| **Silver Case casting note**: Chester, Deke and Winston are twelve lines from three men in one voice in one small room | `docs/CONTINUATION-2026-08-03.md:481-486` |
| **Four Family faces missing**: `lag.png`, `willy.png`, `seff.png`, `numbskull.png` | `docs/VOICE-CASTING.md` gaps §2 |
| **`verify:motel` and `verify:bing-two` are broken** on this branch and on `8156788` | `docs/CONTINUATION-2026-08-03.md:404-414` |
| **Cockpit head-bob applied in world space** — deliberately untouched | `CONTINUATION:415-418` |
| **Documentation drift**: schema version, chapter machine, `NEXT-SESSION-PROMPT.md` describes a pre-graveyard/pre-golf/pre-heist route | `CONTINUATION:96` and §2 above |
| **Payload**: Pages staging 2,986 files / 221.77 MiB; PWA, streamed music, right-sized art all outstanding | `RELEASE-CANDIDATE-FLOW:202-224` |
| **`origin/main` in a fresh clone can be a stale orphan** (`c68c883`, no common ancestor) | `CONTINUATION:97` |

### What the finale adds to this ledger

New work the finale requires that no doc currently tracks:

1. `SCENE_IDS.INITIATION.next = [SCENE_IDS.MANSION]` and the Initiation's first
   `campaign.enter` / completion time event.
2. A `MISSION_IDS.MANSION_DEFENSE` with its own checkpoint list and a
   `src/core/mansion-defense-story.js` on the `silent-squatch-story.js` pattern.
3. Hostile actors in the mansion for the first time — and with them, a
   **structural** Snow-exclusion check in `verify:mansion`, because
   `src/mansion/cast.js:38-48` currently guarantees his safety by the absence of
   the machinery the finale adds.
4. Cartel voice profiles and a cue namespace (`vo.thehouse.*`), plus the
   `tools/thehouse-vo.mjs` generator — `docs/ENGINE-TRAPS.md` and
   `docs/CONTINUATION-2026-08-03.md:441-460` both record that a scene without its
   own `tools/<scene>-vo.mjs` is invisible to the recording sheet no matter how
   much is written for it. That trap has already cost this project 147 lines
   twice.
5. Inverting the three `tools/verify-initiation.mjs` canon checks that currently
   assert Tony stays human.
6. The apartment's final dressing pass: conspiracy board, Squatchanium trophy,
   answering machine, and the sasquatch first-person hands.
