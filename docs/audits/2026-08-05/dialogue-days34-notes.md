# Squatch Life — Second-Half Dialogue Inventory: Story-Editor Notes

Companion to `dialogue-days34.json` (1,568 lines across 9 scenes). Line counts:
NO WAKE 31 · SILVER PINES GOLF 354 · THE SILVER ROOM 412 · THE TAKE 112 ·
THE INITIATION 143 · THE MANSION 228 · THE ENOLA SQUATCH 195 ·
THE SILVER CASE 90 · WARDROBE 4 (dev-tool notes only).

---

## Cross-scene findings first (the five biggest things)

1. **Silver Room's clock contradicts the campaign's own mission order.**
   `src/silver/main.js:3069` stamps the date night as **Day 2** (`hud.setClock(2, …)`).
   `src/nowake/main.js:1153/1324` stamps NO WAKE as **Day 3**. But
   `src/core/campaign.js`'s `MISSION_IDS` lists `NO_WAKE` *before* `SILVER_ROOM`
   — the game will not let a save reach the date until the boat is behind it.
   As written, the date is timestamped a full day *earlier* than the mission
   that has to be finished before it can even start. Either the clock literal
   is a leftover from before the two missions were reordered, or the date is
   meant to be a flashback — nothing in the date's own text plays it as one.

2. **The Mansion's landing copy and its own mission doc disagree about when it happens.**
   `mansion.html:163` frames the free-roam tour as **"Initiation Night, before
   anyone arrives"** — i.e. the same night as the forest ceremony, before the
   Circle gets there. But `src/core/silent-squatch-story.js:25` and
   `src/mansion/script.js`'s own header comment both say PROJECT SILENT SQUATCH
   "follows The Silver Case" and happens "immediately after" it — a
   *completely different* night, at a *different* location (the Silver Case is
   an apartment stakeout, not the forest). Both can't be true. Pick one anchor.

3. **Two "voiced" documentation comments are stale and undersell finished work.**
   `src/silvercase/dialogue/script.js`'s header says "none of these cues exist
   yet" — but `assets/sfx/manifest.json` has all 69 of the lines that carry a
   `cue` field, fully recorded (`vo.silvercase.*`, 76 entries total). Likewise
   `src/heist/script.js`'s `HEIST_PENDING_DIALOGUE` bank is introduced as
   "authored and played but not yet recorded" — the manifest shows all of it
   (`heist.hostage_plead_one`, `heist.numb_lobby_order`, etc.) is now recorded
   too. Nobody will hit a missing-VO bug, but any writer trusting these
   comments will think there's a recording backlog that doesn't exist.

4. **A named character who is never introduced.** In THE SILVER ROOM, Ape's
   `ape-diner` line calls the kitchen-line cook **"Hector"** ("You tipped
   Hector. Nobody tips Hector") — but every other reference to that character
   in the file, including the tip prompt itself, calls him only `a cook` / `the
   line cook`. "Hector" appears exactly once, cold, as if the player is
   supposed to already know the name. Either give him the name earlier (his
   own line, or a tag on the tip prompt) or drop it from Ape's callback.

5. **The "Squatch prayer" doesn't recur anywhere it should.** THE SILVER CASE
   invents a specific Family execution liturgy — "Great Beast of the dark
   timber… Silver above. Family below." — performed *before* killing Chester,
   with the player finishing the last line ("No footprints left."). It reads
   as an established rite. None of the other three executions in this batch
   (Willy in NO WAKE, Aubbie in THE MANSION, "Prospect One" in THE
   INITIATION) use it, reference it, or explain why it's skipped. If it's
   Ape's personal habit rather than a Family sacrament, a single line would
   fix it; if it's meant to be the Family's rite, it's missing three payoffs.

**On the specific ask about a Cartel, rivals, or a mansion assault:** none of
the three "undocumented" scenes contain any such reference. No word matching
*cartel*, *rival(s)*, *enemy/enemies*, *assault*, or *siege* appears anywhere
in `src/mansion/`, `src/enolasquatch/`, or `src/silvercase/`. Whatever these
three were building toward, it is not an external-antagonist story — see each
scene's own section below.

---

## 1. NO WAKE (harbor betrayal)

**Inconsistencies.** None found internally. The file is careful to keep Big
Uncle Lou Sputthole (`lou1`) separate from Captain Lou Sasole (`lou2`, who
never appears here) — worth noting only because that exact confusion is
flagged as a live risk in `src/golf/script.js`'s own header comment, so it's
clearly a known hazard elsewhere in the codebase.

**Callback/foreshadowing opportunities.** Irish's unfinished "egg story" ("I'll
do the back half… on the way in. There is a back half. Nobody ever gets to
it," then "I'm not doing the back half. Not today.") is a clean Chekhov's Gun
that *does* get picked up twice more (Golf: "Irish is still looking into the
eggs" / "Eleven months he's been on it"; Initiation: Irish's whole GRIEVANCE
bark bank is built around it). It is never actually paid off anywhere in this
batch — a genuinely good running joke with no landing. Worth a final "the back
half" scene somewhere down the line.

**Where a beat could land harder (3-5).**
- The confrontation's `motelHot`/`motelClean` and `beefDetected`/`beefClean`
  branches are functionally interchangeable in weight — both accusations land
  with the same rhythm. Differentiating which accusation actually convicts
  Willy (right now Lou treats them as cumulative, never picks one) would give
  the scene a sharper "this is the one that got you" moment.
- Willy's last word before being shot is "I need the head... Everybody
  relax" — that's the version of him going to his death still performing
  normalcy, which is strong, but nothing afterward calls back to it (no one
  remarks that he never got up from the head). A single Irish or Booski line
  post-execution noting it would land the irony.
- Tony's only lines in the whole mission are "I've got him" (lifting the body)
  and "The phone will ring when it rings" (epilogue) — he's mute through his
  own first kill-adjacent complicity. That silence is clearly a choice, but a
  single optional player line at the moment of the shot (there's already a
  precedent for player choice text elsewhere, e.g. Silver Case's louQuestion)
  would give the mission's central character something to own.

**Placeholder/unfinished dialogue.** None — every line has a cue, and every
cue is in the manifest.

---

## 2. THE SILVER ROOM (the Margo date)

**Inconsistencies.**
- Timeline stamp conflicts with mission order (see cross-scene #1 above).
- The "Hector" naming orphan (see cross-scene #4 above).
- Minor: the `waiter.open` variant logic special-cases `ctx.knows('third-number')`
  to decide whether he's "already setting down two menus," but nothing else in
  the scene ever explains *how* the waiter would know the manager already told
  Tony about the third number — it's a nice touch if the player tipped the
  manager, invisible connective tissue if they didn't visit that node at all in
  the right order (walking straight to the waiter first still reads as if the
  staff share information they never demonstrably share elsewhere in the
  script).

**Callback/foreshadowing opportunities.** The best-executed one in the whole
file: "the third number" is promised by the manager (if tipped), independently
teased by the bandleader ("front table gets one"), and pays off exactly on
schedule when Bananaphone becomes the request — three separate mouths
converging on one promise. Also strong: Margo's burn story ("Anthony's fault…
I finished the service") is planted once and never needs restating — if Margo
recurs in a later scene, that scar and that fact ("I finished the service")
are the two details worth re-touching, not her job or her name.

**Where a beat could land harder (3-5).**
- "Corner two, back to the door" (Hector/the cook) is the best callback joke
  in the file mechanically, but its punchline is undercut by the naming
  orphan above — fix the name and this becomes the standout joke of the route.
- The `funny-hold` branch ("She reaches over, takes the ice cube out of her
  own drink, and drops it into yours… Cool down") is one of the strongest
  single stage directions in the file and has no verbal follow-up anywhere —
  a single later callback to "the ice cube thing" (e.g. at the toast, or in
  the ending card) would reward the player for choosing the riskier option.
- Ape's Ashland aside (describing what was in the van) currently reads as a
  gross-out beat that Margo shuts down ("Whose van.") — the scene never
  resolves whose van it was, which is fine as a Family-business ellipsis, but
  a single Ape line acknowledging he clocked he shouldn't have said it (rather
  than just retreating) would land the "he panics because he broke the room's
  one rule" beat harder.
- The dishwasher/"beneath" branch (insulting the man nobody tips) is the
  scene's one real morality check and it's excellent — Margo's silent
  "Do the plates" is the standout writing in the file. Nothing to fix; flagged
  here as the scene's best character beat, worth protecting in any rewrite.

**Placeholder/unfinished dialogue.** None found; every static and dynamic
node has text, and 1,456 of 1,568 total lines across the whole batch are
confirmed voiced — the Silver Room specifically has full character-profile
coverage for every named speaker (`margo`, `player`, `ape`, `driver`, `vinny`,
`host`, `manager`, `waiter`, `bandleader`, `cellarman`, `porter`, `chef`,
`cook`, `dishwasher`, `servicebar`, `coatcheck`, `photographer`, `announcer`,
`room`).

---

## 3. Silver Pines golf

**Inconsistencies.** None found. This file is the most self-aware and
carefully cross-checked script in the batch — it has its own `unreachableCues`
verifier and explicit comments guarding against the Lou/Lou mix-up and against
re-running the "why am I here" beat on later holes. Nothing contradicts
another scene here; if anything, it's the glue: it explicitly reads
`bada_bing_one`, `squatchfather`, `airstrip_smuggling`, and `silver_room`
campaign flags for its conditional callbacks and gets all of them right.

**Callback/foreshadowing opportunities.** This is the scene that plants nearly
everything that pays off later in this batch: "there's a thing after the
thing, and it needs an aeroplane… six thousand pounds of it… there's a
captain for it already, not me, another Lou" is a direct, deliberate
foreshadow of THE ENOLA SQUATCH (Sasole, "lou2," and the Fat Squatch's actual
weight is never stated in Enola Squatch's own script — golf is the only place
"six thousand pounds" is said out loud). "Ten drunk cigarettes… that's after
the job" foreshadows THE INITIATION's after-party. Both pay off cleanly.

**Where a beat could land harder (3-5).**
- The "six thousand pounds… another Lou… you'll know him when you see him" bit
  is a great tease that's *never confirmed* — nothing in Enola Squatch ever
  has Sasole or anyone else say the weight back, which would have closed the
  loop satisfyingly (Irish already says "Fat Squatch… do not lean on it" in
  Enola Squatch's preflight; one more line giving the number would land the
  golf tease).
- "Nehoo with a guu," said "under his breath, not for anybody," is a lovely
  bit of texture that goes nowhere — if it's meant to be a recurring in-joke
  it needs one more outing somewhere else in the game; as a single orphaned
  aside it reads as a cut bit.
- The whole "Prospect gets asked whether anybody knows he's here" beat (Hole
  3) is clearly meant to matter for a later scene (it's phrased as a real
  operational-security question, not banter) — nothing in this batch ever
  calls back to whichever answer the player gave. If a downstream mission
  (heist, mansion) checked this flag the way golf checks the *upstream*
  flags, the payoff would be excellent; as far as this batch shows, it's
  currently a dead end.

**Placeholder/unfinished dialogue.** None — every one of 353 cues is present
in the manifest.

---

## 4. THE TAKE (bank heist)

**Inconsistencies.**
- The bank is named once, only in `heist.html`'s subtitle ("Cumberland
  Fidelity & Trust") — never in any spoken line. Not wrong, just worth
  flagging: if a future scene references "the bank job" by name, it has to
  source the name from HTML markup, not from dialogue.
- Soft scheduling wrinkle: golf's Hole 3 sets "seven o'clock" as *the job's*
  start time ("There's a job between now and seven"). The heist's own
  post-mission call has Lou say "Bada Bing, seven. Wear something worth
  remembering" — a *second* seven o'clock, on what has to be the same evening
  if the two scenes are read back to back. It's not unreadable (the debrief
  could easily be "tomorrow, seven"), but as written both sevens sit in the
  same unbroken evening without anything marking the day turning over.
- `HEIST_PENDING_DIALOGUE`'s framing as "not yet recorded" is stale — see
  cross-scene #3.

**Callback/foreshadowing opportunities.** Snow's role here ("I call the move.
You keep the clock honest") is consistent with his EXECUTIONER tag at the
Initiation party — a cold operator in both places, no contradiction, and it
would be a strong beat if one line in either scene connected them explicitly
("you're steady, the way you were on Mercer Street" or similar). Currently
they're consistent but silent about each other.

**Where a beat could land harder (3-5).**
- Lou's two-question debrief structure ("I only ever ask two things...
  people, then money") is the scene's spine and it's excellent — no notes,
  flagged as the standout writing to protect.
- The dropped-bag decision ("Bag is down. Rippin is not. Make the choice
  fast." / "Do not trade a person for paper.") is a real player-facing
  morality beat that has no on-screen acknowledgment afterward regardless of
  which way it goes — Lou's debrief covers money-short and people-hurt
  outcomes but never specifically references *this* choice by name. A single
  debrief line keyed to the dropped-bag flag would make the choice feel seen.
- Rippin's injury ("That is my leg. Route Green is officially cancelled")
  is a good hard-cut joke against real stakes, but his aid line afterward
  ("The van had one job and chose performance art") undercuts the injury's
  severity right after it happens — intentional tonal whiplash probably, but
  worth flagging as a place the comedy could be held back one more beat before
  landing.
- `prospect_counterstrike` ("Good thing about all that Counter-Strike I've
  been playing") is the one line in the file that breaks the "nobody in the
  scene is aware it's a game" doctrine stated in the file's own header comment
  — it's a direct video-game reference inside a scene whose own rules say nobody
  should sound self-aware. Either cut it or it's a deliberate, isolated
  exception worth a second look.

**Placeholder/unfinished dialogue.** None once the stale "pending" framing is
set aside — every line in both banks has a matching manifest cue.

---

## 5. THE INITIATION

**Inconsistencies.** None internally — the founders quiz answer ("Booskibro,
Big Uncle Lou Sputthole, Rippinflow, The Shubenator, Deathmegatron") matches
`ROSTER`'s `founder: true` flags exactly.

Worth flagging as a soft one: **two different men named "Lou" are both present
at the same party** (Big Uncle Lou Sputthole, voice `lou1`, and Captain Lou
Sasole, voice `lou2`) with no line anywhere acknowledging it, even though the
game's own codebase treats this exact mix-up as a real production hazard (see
`golf/script.js`'s comment about it). At a party scene specifically, this is
the single best place in the game to make the confusion a joke instead of a
risk.

**Callback/foreshadowing opportunities.** The egg bit lands its second beat
here cleanly (see NO WAKE notes above) but still never resolves. Snow's
EXECUTIONER-only lines ("No hard feelings on the first guy… You I like — you
knew the founders") retroactively frame the earlier quiz-question execution as
his doing, which is a nice piece of connective tissue that a first-time player
might not connect back to the ceremony beat unless they specifically re-engage
Snow at the party.

**Where a beat could land harder (3-5).**
- Ape's ROASTER bank ("You know they only shot the first guy because he was
  worse at trivia than you. Low bar. You limbo'd under it.") is the funniest
  single joke in the file — no notes, flagged as best-in-class.
- Irish's GRIEVANCE bank is a strong runner ("We're a forest death cult and
  we cannot organize a car pool") but never intersects with Booski/Lou's own
  lines — a single ambient exchange where Booski visibly ignores Irish mid-toast
  would sharpen the running gag (the AMBIENT array already does this trick for
  other pairs, e.g. Ape/Shubes and Hogmama/Irish about the tarp — Irish's
  parking complaint specifically never gets an ambient partner).
- Rippinflow's QUIET bank ("*(he's just looking at you. he was looking at you
  before you turned around.)*") on the rat route is the best tonal swing in the
  file (menace disguised as warmth) — protect this in any pass, don't over-explain it.
- The "shirt by the truck" running reference (the executed first prospect,
  referenced obliquely three separate times — Lieutenant's "don't look at the
  shirt by the truck," Utility's "ask the shirt by the truck… too soon," Ape's
  "he's a shirt now, Lou" in AMBIENT) is a strong dark running joke that never
  gets a clean single reveal moment — right now the player has to piece
  together from three oblique mentions that a man was shot and is literally
  drying on a clothesline. One unambiguous "why is there a shirt on the truck"
  beat somewhere would let the running joke actually land instead of only
  rewarding players who catch all three references.

**Placeholder/unfinished dialogue.** None — ceremony (32 recorded vs. 32
authored lines, exact match), party banks and ambient exchanges are recorded
at effectively full coverage (84 recorded vs. 75 authored party lines — the
extra count is retakes/variants, not a gap).

---

## 6. THE MANSION (Project Silent Squatch)

**What story this content is written to tell.** This is the game's Manhattan
Project parody, played completely straight per the file's own tone doctrine.
Big Uncle Lou's house sits on top of a black-market weapons lab: six named
scientists with Russian-coded names (Aubbie the lead, Vetrov, Sokolov,
Bezmenov, Orlova, Marchuk) have spent twelve weeks building "Silent Squatch," a
weapon powered by "Squatchanium" — the same material recovered as an unopened
mystery in THE SILVER CASE — into a payload named "the Fat Squatch." The
moment it's finished, Booski has Aubbie shot in front of the other five
through reinforced glass, then gasses the rest to death with them locked in
the lab, on Lou's orders relayed as "handle it." It's a story about the Family
extracting value from indentured/coerced specialists and discarding them the
instant they're no longer useful — no different in kind from how the Family
treats its own (Willy in NO WAKE, the men in THE SILVER CASE), just larger in
scale and dressed in Cold War iconography. The house itself (guards, gate,
vault, torture room with Gratin and xXx) is played as an ordinary, fully
staffed organized-crime compound that happens to have a nuclear-adjacent lab
under it.

**Cartel / rivals / mansion-assault check.** None. Zero. No word for an
external threat appears anywhere in `src/mansion/`. There is no assault on the
house in this content — every gun, every guard, and every casualty belongs to
the Family itself. If a "mansion assault" is planned for later in the
campaign, none of this file's ~30 ambient house-security lines (guards on
patrol, at the stairs, in the basement, at the vault) reference expecting one;
they're written as routine boredom ("Long walk, this. I do it eleven times a
night"), not readiness.

**Inconsistencies.** The Initiation-Night vs. after-Silver-Case timing
conflict (cross-scene #2) is the big one. Smaller: the keypad code "6969" is
explicitly written to land with zero acknowledgment from any character — a
deliberate anti-joke per the file's own comment — but it is also the game's
most obvious "wink," so it's worth a second look regardless of the original
intent.

**Callback/foreshadowing opportunities.** "The Great Includer" trophy ("not
one line on the plinth says who gave it") and "THE MAZE — 1988, planted the
year the case was dropped" are both flavor text with real Easter-egg
potential — "the case was dropped" could double as a sly nod to the Silver
Case's own case if that's intentional; right now it reads as unrelated
landscaping trivia. The bartender ("the same man who works the Bing") is a
clean, small connective thread to the Bada Bing content.

**Where a joke or character beat could land harder (3-5).**
- Aubbie's fatal miscalculation ("Only my team understands the full
  process… Good.") is the best-written beat in the file — dramatic irony
  executed with total restraint. No notes; protect it.
- Gratin's torture routine is explicitly flagged in an owner note as "the
  joke [is] always having Gratin torturing people," but the only in-scene
  acknowledgment is one flat player line ("It's always you doing this.")
  answered with one flat reply ("I'm good at it, and the kitchen's dead this
  time of night."). The running gag needs a second data point somewhere else
  in the house (a guard or Snow referencing it) to actually read as running
  rather than as a single exchange.
- DeathMegatron's "Six." (correcting Booski's "Twelve weeks... eating my
  food") is a great deadpan beat; "Hands can write" a beat later is the
  second half of the same joke and it lands. No notes.
- The five scientists' death-row pleas (BEAT 9) are ten lines split across
  four of the five survivors, verbatim from spec — Bezmenov is the one who
  says nothing (he "tried the handle first… has been expecting this since
  March"), which is a strong character choice on paper but is entirely
  invisible in dialogue alone — without the stage direction/animation, a
  reader of just the transcript would think he was simply skipped.
- The torture beat's running "he's fine" ("You hit like family… That's not a
  compliment, that's just what they do") from xXx is very strong dark comedy;
  a single later reference (e.g. Irish's "same three lines" comment about
  xXx elsewhere in the corridor) already exists and works — flagged as
  good, not broken.

**Placeholder/unfinished dialogue.** None in the spoken content — all 175
cued lines match the manifest exactly, and `PENDING_VOICE_PROFILES` is
explicitly empty with a note confirming every profile landed.

---

## 7. THE ENOLA SQUATCH

**What story this content is written to tell.** A direct Enola Gay/Hiroshima
pastiche: Captain Lou Sasole flies a heavy bomber crewed by Irish (navigator),
Numbskull (bombardier), the Shubenator (tail gunner) and the Prospect
(co-pilot), from "Whispering Pines Municipal" at night, evading searchlights
and night fighters, to drop "the Fat Squatch" — the exact weapon built in THE
MANSION — on a full, populated city called "Squatchbourg." The strike is
never politically motivated on-screen: nobody explains who Squatchbourg's
people are, what they did, or why the Family has a strategic bomber. It reads
as pure genre pastiche laid over the doomsday-weapon plot that THE MANSION
set up — the target is not a rival gang's turf or a cartel stronghold, it's a
generic enemy city that exists so the game can restage a famous historical
image (mushroom cloud, crater, "there's a hole where the town was").

**Cartel / rivals / mansion-assault check.** None. "Squatchbourg" is never
identified as belonging to a cartel, a rival Family, or any named faction —
it is simply "a whole town" with streets, a river, and six districts. There is
no assault on any mansion in this content.

**Inconsistencies.** The title screen's own teaser text says the destination
"rhymes with 'the desert compound'" — setting an expectation of an isolated,
depopulated military target — but the mission itself delivers a full city
("That is a whole town down there. Streets and everything," "Squatchbourg.
Grid runs north–south, the tall part is the middle") with civilian scale
implied throughout (rolling stock, river craft, streetlights, chimneys — this
is a lived-in city, not a compound). The marketing copy undersells what the
mission actually asks the player to do.

**Callback/foreshadowing opportunities.** "Remember that little delivery
flight? / The jerky run? / This one's heavier" (the pre-mission call) is a
clean, economical callback to the Beef Run / airstrip-smuggling mission,
reusing Sasole. Golf's "six thousand pounds… another Lou" tease (see golf
notes above) is never explicitly confirmed here even though this is exactly
where it would land — nobody in this file ever says the weight of the Fat
Squatch out loud.

**Where a joke or character beat could land harder (3-5).**
- "Is it supposed to make that noise? / That is the noise. That is the
  correct noise. / Then why is it getting worse." (the falling-bomb whistle)
  is the best comic timing in the file. No notes.
- "…I said a line before that. / Nobody heard your line. Everybody is
  looking at the hole." is an excellent, quietly brutal beat — the Prospect
  gets upstaged by the scale of what he just did. No notes; flagged as the
  scene's best writing.
- The entire strike has almost no weight given to the fact that a city full
  of people was just erased — the only characters who react at all treat it
  as spectacle ("It is still going up," "Guys, where did it go?"). If the
  game wants this to read as more than a set-piece, one line from Irish or
  Lou landing later (post-mission, on the ground, or even in a different
  scene entirely — nothing in this batch carries it forward) would give the
  act consequences instead of leaving it as a fireworks show.
- Numbskull ("I used the wrong bolts") gets the mission's one competence
  failure and it's resolved in two lines with no lasting consequence or
  callback — his character barely differentiates from Shubes' comic-relief
  register elsewhere; a specific Numbskull trait (he's explicitly the
  bombardier, "I am the bombardier," a rare moment of him being the expert)
  could be leaned on harder given he otherwise reads generic.
- The release-line choice (five options, one silent) never differentiates
  consequence — all five produce the same detonation. A future pass could let
  the choice of line change how the crew reacts afterward, giving the choice
  more than flavor value.

**Placeholder/unfinished dialogue.** None — all 154 beat lines and 35 barks
are confirmed present in the manifest at matching cue prefixes; only the
intentionally-silent 5th release option has no audio, correctly.

---

## 8. THE SILVER CASE

**What story this content is written to tell.** The direct prequel to THE
MANSION: Ape brings the Prospect along to a run-down apartment (2E) to recover
a case three low-level guys (Deke, Chester, Winston, plus Pruitt hiding in the
bathroom) stole from Lou out of a storage unit. The case is never opened
on-screen — the player only sees Winston's reaction and Ape's confirmation —
which is a well-built mystery box, since THE MANSION later reveals it holds
the raw Squatchanium the whole weapons program depends on. The mission is
structured as an escalating home-invasion interrogation: control the room,
confirm the case, execute Deke on the couch, extract a loyalty-test answer
from Chester, perform a ritual "Squatch prayer" and execute him too, then
ambush Pruitt in the bathroom, and finally choose whether to spare or kill the
last witness, Winston. It's a story about initiation-by-complicity — the
Prospect is being walked through his first multi-kill job with Ape narrating
Family etiquette the entire way (no souvenirs, don't shoot me, everybody gets
a moment to understand why).

**Cartel / rivals / mansion-assault check.** None. Deke, Chester, Winston and
Pruitt are petty independent thieves, not a rival organization — Ape's own
line makes the scale explicit: "Three geniuses borrowed something from Lou
without asking." There is no mansion in this content and no assault on one;
the target is a single apartment.

**Inconsistencies.**
- The stale "no cues recorded" doc comment (cross-scene #3).
- The invented "Squatch prayer" liturgy doesn't recur anywhere else in the
  batch (cross-scene #5) — worth restating here since this is where it's
  introduced: if it's meant to read as a Family sacrament rather than Ape's
  personal habit, its total absence from three other on-screen executions
  undercuts that reading.
- Chester's "we needed the money, we didn't know whose" directly contradicts
  nothing said by Deke or Winston, but it's worth flagging that none of the
  three men are ever given a reason to have specifically targeted *Lou's*
  storage unit if they claim not to have known whose it was — a small
  motivation gap, not a contradiction.

**Callback/foreshadowing opportunities.** The unopened case is the standout
piece of foreshadowing in this whole batch — it pays off exactly right in THE
MANSION's `officeOpen` sequence (gold and purple light, Lou's "you'll find out
soon enough"). Nothing to add; flagged as the best-executed foreshadow across
all nine scenes.

**Where a joke or character beat could land harder (3-5).**
- "Does he look like a bitch?" with "Depends on the lighting" as the
  Ape-irritating wrong answer is a strong, efficient loyalty-test joke. No
  notes.
- Ape's jerky aside in the car ("There's nine kinds. He just doesn't respect
  you enough yet to tell you which one you're chewing") is excellent
  world-building comedy and stands alone well.
- Deke and Chester are barely distinguishable in dialogue — both register as
  interchangeable scared-guy panic ("Nah, man, it's just us hanging out" vs.
  "…Case? What case?"). A specific verbal tic for each (the way Booski/Lou/
  Rippin/Eric are each given a distinct cadence in golf) would make their
  individual deaths land as individual rather than as one undifferentiated
  beat repeated twice.
- Pruitt never speaks a single line anywhere in the file — he exists purely
  as a bathroom ambush target. Even one line before the ambush (a stray
  cough, a flushed toilet with dialogue, anything) would round out the one
  named victim who currently has zero characterization.
- Winston's fate is the mission's one real player choice and it's well
  built (spare vs. kill, with Ape's reactions differing meaningfully:
  "Then there's nobody to clean it. That's a choice too." vs. "You don't get
  to want it and not do it.") — no notes, flagged as a second standout
  choice beat alongside the Lou question.

**Placeholder/unfinished dialogue.** None — all 69 cued sequence lines are
confirmed voiced (contradicting the stale in-file comment noted above).

---

## 9. wardrobe.html / src/wardrobe/

Not a story scene — a developer fitting-room tool for previewing character
models (`wardrobe.html`, `src/wardrobe/preview.js`). It carries only brief
costume-description notes per character, not dialogue or narrator prose,
e.g. Big Uncle Lou ("Every expensive thing at once… gold buckle, gold watch,
gold rope"), Captain Lou Sasole ("A working pilot… the good thing he owns is
the jacket"), Booskibro ("One of the FIVE. Boss, not crew"), and the entry for
**HotDog** — "The man in the trunk. Canonical from `src/core/hotdog-model.js`
so the body is visibly the man who went down" — which is a direct callback to
a body-in-a-trunk beat from an earlier (out-of-scope) mission, confirming that
character model is deliberately reused rather than redesigned. Nothing here
needs story-editor attention beyond noting it exists and that it does carry a
handful of real continuity facts (the founder tag on Booski, the reused
HotDog body) that a story bible should pull from directly rather than
re-deriving.
