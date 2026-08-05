# Story-editor notes — Days 1–2 dialogue inventory

Companion to `dialogue-days12.json` (1,257 authored lines extracted). Scope: The Apartment hub,
The Bada Bing (both visits), The Squatchfather, The Beef Run, The Squatch Graveyard, The Jerky
Motel, and Squatch Mail. Voiced/unvoiced status was checked against `assets/sfx/manifest.json`
and `assets/sfx/index.json`, including reverse-engineering the two FNV-1a cue-hashing functions
(`src/bing/script.js:textHash`, `src/motel/voice.js:motelTextHash`) so auto-generated cue names
could be verified byte-for-byte rather than guessed.

---

## 1. The Apartment / Squatch Life Hub

### Inconsistencies

1. **Two competing "how do I know what to do tonight" systems coexist in the live code.**
   `src/core/goals.js` (`Goals` class) is a complete, self-contained narrative: a single Wednesday
   7 PM "Squatch Meeting," learned from the corkboard/second monitor/radio, gated by nine
   `GATES` (shower, dressed, fed, HR mail, CS games, bladder, bowel, hands, sobriety), with six
   full ending cards (`clean/merry/stoned/tripping/late/missed`). None of it is reachable: the
   code comment at `src/main.js:2717-2727` states outright that `ApartmentStory` replaced this
   object and `Goals.tryDoor()` "stopped being called." `showEnding()` and `missedIt()` are never
   invoked anywhere in `main.js`. Yet `learnAboutMeeting()` is *still* wired to the chat, radio
   notice, and mail app, and still writes `state.story.meetingKnown` — a flag nothing downstream
   reads for gating. Net effect: the game has a fully-written, fully-voiced (32 recorded
   `vo.door.*` takes) secondary campaign about a "Wednesday meeting" that a player can never
   actually experience as a meeting; they just get the four-day Bada-Bing/Squatchfather/Beef
   Run/Graveyard/Motel campaign instead, while radio, chat and Uncle Lou's excluded email keep
   talking about a different Wednesday event with different stakes and different attendees ("All
   five founders... in one room" in one system vs. Booski's Initiation call in the other).
2. **The `Uncle Lou "Tomorrow"` email is filtered out of the live inbox** (`mail.js:391`,
   `m.from !== 'Uncle Lou'`) with the comment "Lou gives instructions by phone and in person" —
   but its sibling messages (both Booski threads, Deathmegatron's hate mail, Irish's gift, Ape's
   weed request, Lou Sasole's flying offer) are all still live and still reference "the meeting"
   and "initiation" in the same vestigial vocabulary. A player who reads the mail app gets four
   or five messages confidently describing an event ("tomorrow night," "the initiation") that the
   *actual* Initiation (src/initiation/) is gated many days later behind Day 4's `big_night`
   chapter — not "tomorrow."
3. **Recorded audio for the shared morning-routine excuses doesn't match any single current
   script.** `vo.door.shower.1` says *"No. I need a shower first. I'm aware."* — closest to the
   old `goals.js` line *"No. I need a shower first. I am aware of it,"* but contracted and
   truncated. `vo.door.eat.1` says *"I've not eaten. I'll be useless"* — the old goals.js line
   was *"I have not eaten since yesterday. I will be useless"* and the CURRENT
   `apartment-story.js` line is a third, unrelated joke: *"I have not eaten. Lou can hear that
   over the phone somehow."* Three generations of the same beat, and the one that's actually on
   screen today has never been recorded.
4. **`vo.call.lou.bing_second.2/.3` are flagged `needsRerecord`** in the manifest for "retired
   wording" — confirming the recording booth is working from an older draft of Lou's second Bing
   call than what ships in `apartment-story.js` today, even though the two are close enough to be
   easy to miss in QA.
5. **The Booski-shot yell take is flagged as wrong tone**: `vo.bing.booski.shot.yell` is the
   recorded *"AY! I want that shot in thirty FUCKING seconds!"*, but the shipped subtitle is the
   calmer *"Get my man a shot. Thirty fuckin' seconds. That's generous, baby."* per an explicit
   owner note in the manifest ("too high-pitched... redo it much more chill, maybe lose the Ay!").
   Another take/subtitle mismatch a player could actually notice, since the line plays every visit.

### Callback / foreshadowing opportunities

- **Margo's morning-after (`BIG_NIGHT_MARGO_WAKE`)** pays off her Bada Bing bar scene nicely
  ("I get one night off in six" → "I have a delivery at eleven"), but nothing in the Day 1–2
  content foreshadows Deathmegatron's mail-app cruelty ("nobody there even likes you") ever
  meeting Margo, who is the one person shown to actually like him. A single line from Margo
  referencing the hate mail, post-Motel, would land the contrast between family-by-blood and
  family-by-choice much harder.
- **The grey sedan plot thread** (bartender's tip → Lou's `watched` briefing → the lot
  interaction → plate memorised) is set up thoroughly in Visit One and simply evaporates — no
  payoff anywhere in the Days 1–2 corpus, and (per the objective text) it explicitly tells the
  player to "find out whether it follows you," which nothing in these scenes ever resolves. This
  is either a live setup waiting on later chapters (Silver Room / Heist) or an orphaned thread; if
  it's the former it should be flagged to whoever holds the second-half notes.
- **The rubber duck / smuggling manifest joke** ("Duck, quantity left blank...") is a fun
  one-off but never referenced again in this half — a Day 3/4 scene name-dropping "the duck" would
  reward players who found it.
- **Irish's "egg story"** is set up as a running gag across *three separate systems* (chat.js
  schedule messages, the Bada Bing hangout tree, and implicitly the vestigial mail.js content) but
  the actual "egg story" is never told — only ever referenced as forever-interrupted. That's
  probably intentional (the joke is the interruption), but there's no scene anywhere in Days 1-2
  where he finally gets it out, which is a real missed payoff if a later chapter doesn't close it.
- **"Two Lous" is set up cleanly** (Booski's call: "Two Lous. Of course there are two Lous.") and
  paid off well by the Beef Run and the Visit Two party scene putting both Lous in the same
  room. Good example of a joke that already lands — worth pointing at as the model for the sedan
  thread above.

### Where a joke or beat could land harder

1. The **narrator's idle lines** are strong but exhaustible — 12 lines on a ~26s idle timer will
   repeat fast for a player who leaves the game running (e.g. AFK during the long Day One kill-time
   window). A callback line that specifically references *how long* the player has been idle in
   relation to the Bada Bing curfew ("Lou's table is not until a quarter to midnight and you have
   done nothing since six") would tie the mechanical filler to the actual stakes.
2. **`learnAboutMeeting()`'s toast** ("Wednesday, 7 PM") fires from three different sources
   (chat, radio, mail) but always shows the same generic toast — a small win would be sourcing the
   toast text so a player who reads it *twice* (radio then chat) gets a knowing "you already know
   this" line instead of the identical toast twice.
3. **Booski's shot beat has a great, escalating structure** (offer → yell → handoff → Tony's
   dry reply) but Tony's only line is a single deflection ("I was gonna say no, and then I heard
   the yelling"). A second-visit variant reply (distinct from the reused `hang.booski.2` line)
   would sell that this is now a running bit rather than a rerun.
4. **The vestigial `ENDINGS` cards** (`merry`, `stoned`, `tripping`) are genuinely funny writing
   that is currently unreachable dead weight. If the "Wednesday meeting" system is truly retired,
   this is worth harvesting for jokes elsewhere (e.g. the actual Initiation's own drunk/high state
   handling) rather than leaving it to rot as unreachable code.
5. **Margo's number-exchange scene** earns its ending ("I will ring") but nothing in the door
   refusal system reacts differently if the player *has* met her vs. hasn't — `date_call`'s refusal
   text ("She said she would ring about tonight") reads identically either way, missing a chance
   for a warmer or more anxious variant depending on whether he actually remembers her face.

### Placeholder / unfinished

- `src/core/goals.js` in its entirety — a complete, polished, voiced system that is dead code by
  the engine's own admission. This is the single largest chunk of "finished but unused" content in
  the game (see Inconsistency #1).
- `TIME_EVENT_IDS` comments describing the `HEAR_MESSAGES_*` events promise "one message per
  chapter... a man does not hear yesterday's twice," but the `date` chapter's answering-machine
  message is a byte-identical copy-paste of the `no_wake` chapter's message (`CHAPTER_MESSAGES`),
  meaning a player who hears it once and then reaches `date` (if that's a distinct visit) hears the
  literal same "It is me. Do not ring back..." message again — contradicting the stated design
  rule in the surrounding code comments.
- `door.refusal.*` — 17 newly-authored refusal lines (`DEPARTURE_REFUSALS`) have **zero** matching
  recordings; every single one currently falls back to the generic `door.wait` bank. This is the
  primary VO gap in the entire apartment hub.

---

## 2. The Bada Bing (both visits)

### Inconsistencies

1. **Lou's Visit-Two office line contradicts the mission's own framing.** `buildSecondVisitLouScript`
   still gives Lou an `enter` node ("Office is closed, Prospect... Try not to miss the murder.")
   even though the code comment above it says "The second visit no longer begins in his office."
   The line is reachable only "if the player wanders in," which means Lou can foreshadow "the
   murder" (Billy HotDog's death) before it happens in a scene explicitly designed to make that
   beat a surprise escalation — a stray line that undercuts the tension curve if a player happens
   to walk to the office first.
2. **Snow/Lawnmower double-naming.** The character is `CHARACTER_IDS.SNOW` everywhere (roster,
   voice profile), but `second-visit.js`'s authored spine credits several lines to `'Lawnmower'`
   as if he were a separate person (`Lawnmower.heckle`), while `hotdog-room-voices.js`
   acknowledges in its own comment that "Lawnmower is Snow... two names" and that a walk-up line
   *written* for "Lawnmower" (`'The shovel made sense when I picked it up.'`) had to be manually
   re-homed under the `Snow` key because the walk-up table is keyed by character, not alias. This
   is explicitly a self-diagnosed authoring bug, not fully cleaned up — the `second-visit.js`
   `who: 'Lawnmower'` credit on the heckle line is the one place the naming split still leaks into
   player-facing subtitles.
3. **Family attendance rule vs. the story it's telling.** `familyPresent()` seats Captain Lou
   Sasole in the club "only after the Beef Run is complete," which is correct for Visit One (he's
   canonically flying) but means a player who does the missions out of any alternate order, or
   revisits the Bing before flying, never sees him — yet `HOTDOG_PARTY_CHATTER`'s "somebody-says-
   something" exchange has him bantering as if he's a Bing regular ("Forty years of these"),
   slightly at odds with a character who, per his own hangout line, spends most of his time "still
   at the airport."
4. **Margo's Visit-One arc says she is met "if" the player wanders to the bar**, and nothing
   fires if they skip it — consistent with the design note in `script.js` — but the mail app's
   voiced reactions ("mail.flying" bank) reference "if you make it past initiation" as though
   initiation is imminent, one full campaign chapter later than where the Beef Run/Bing/
   Squatchfather actually sit on the clock. This is the same "meeting vs. campaign" split
   described in Scene 1's notes, bleeding into Bing content indirectly through the shared mail app.

### Callback / foreshadowing opportunities

- **The bathroom powder line ("the most competent man in New Jersey")** and the graffiti gag
  ("SHUBES CRIED" / "he did not cry") are pure texture with no callback anywhere else in this
  half — a later scene with Shubenator denying he cried (he's a recurring character through Day 4)
  would pay this off nicely.
- **"Billy HotDog is home"** is the entire hook for Visit Two, delivered cold in Lou's second
  call with zero characterization of Billy beforehand. The Visit-One environment already plants
  a body under a tarp in the storeroom and a locked bathroom stall with "worth listening to"
  business — neither is ever explained as Family history that explains *why* Billy is dangerous
  enough that this specific party ends in a killing. A single line in Visit One foreshadowing "the
  last time Billy was in this room" would give Visit Two's violence a setup instead of an ambush.
- **Irish's $100 gift** ("I had it earmarked for eggs") is a strong, specific callback-in-waiting
  to the egg gag threaded through chat.js and the family hangouts — but the money itself
  (`irishGifted`) has no payback scene in this half; it just sits in inventory. A Motel or
  Graveyard beat where Tony is $100 richer thanks to Irish would close the loop.
- **The duck-manifest joke and the skimmed slot machine ("a second counter... not going in the
  ledger")** are two separate "somebody's stealing from the Family" threads planted in the same
  scene and neither pays off here — worth flagging to whoever owns later chapters, since both read
  as intentional plants (mission.note() calls explicitly say "a conversation for another night").
- **Booski's "House pays either way when it's my house"** (Visit Two, post-shot line) is a good
  callback to Visit One's shot beat and lands well already — a good model for how the sedan/duck/
  skim threads above could be closed.

### Where a joke or beat could land harder

1. **The Visit-Two overheard chatter is extremely strong writing (19 pre-party exchanges, 14
   cleanup exchanges, 13 attack reactions, 35 walk-ups) but almost none of it is voiced** — only
   the 21-beat authored spine plus the Shubenator signature take are recorded; all ~120 ambient
   lines are subtitle-only. This is the single largest "written but unheard" gap in the whole
   corpus and is exactly the kind of texture (DeathMegatron quietly enjoying the violence, Numbskull's
   unresolved shoulder injury, Willy's "practising" his alibi) that a voice pass would make land far
   harder than text ever can.
2. **The bartender's capacity refusal** ("I am not a shelf") is a fun, dry line that only fires
   once you're over the drink cap — worth a second variant so repeat visits don't hear the exact
   same joke.
3. **Lou's `parcel`/`waiting`/`taken` sequence** builds real tension around the mystery weapon
   ("It's the thing you hope stays wrapped up") — but once picked up, `inspecting` the item twice
   just re-triggers the same line ("Condition good... Nothing about it is yours") without
   escalating; a third inspection landing a sharper, more ominous beat would reward curiosity.
4. **Snow's hangout aside** ("Ask me sometime when it matters") is a great setup line that
   nothing in Days 1–2 ever cashes — Snow becomes extremely relevant by Visit Two and the Motel,
   and this half never lets the player "ask him when it matters," even though those are exactly the
   missions where it would matter.
5. **The margo `word` branch** ("I have watched what a word costs") is the single most serious
   beat in an otherwise breezy pickup scene and currently has no visual/audio distinction from the
   rest of the conversation (same hold time formula, no distinct direction note) — it's the kind of
   tonal pivot that would benefit from an explicit beat marker the way `hotdog-room-voices.js` uses
   `direction` fields elsewhere.

### Placeholder / unfinished

- `buildSecondVisitLouScript()` is explicitly labelled "Temporary compatibility" in its own doc
  comment — a stopgap for players who wander into Lou's office when the real handoff is the party
  director. Confirmed unfinished by the source itself.
- The entire `HOTDOG_PARTY_CHATTER` / `HOTDOG_CLEANUP_CHATTER` / `HOTDOG_ATTACK_REACTIONS` /
  `HOTDOG_WALKUP_LINES` corpus (~120 lines) has no recordings — see joke-landing note #1 above.

---

## 3. The Squatchfather

### Inconsistencies

None found *within* this scene — it's the tightest, most self-contained script in the corpus (27
lines, fully voiced, no branching). The one cross-scene note: Sal Sorrento's opening accusation
("You attacked my family... You shot Booski") establishes Booski was shot by Sal's crew before
this scene, but nothing in the Apartment or Bada Bing content (Days 1–2) ever mentions Booski
being wounded — he's fully mobile and cheerful in every Bing scene that follows chronologically.
If this is meant as backstory rather than a recent event, it should be phrased to avoid reading as
"this just happened" — as written, "You attacked my family... You shot Booski" plays as present-
tense grievance the player has no context for, immediately followed by Booski texting cheerfully
about the Beef Run the very next in-game day.

### Callback / foreshadowing opportunities

- **"Wednesday belongs to the family" / "Wednesday nights"** — Sal's specific demand for
  Wednesdays is a strong, sharp callback to the entire vestigial "Wednesday meeting" thread
  described in Scene 1's notes. If that system were ever revived, this line is the connective
  tissue already sitting in the script waiting for it — worth flagging as a reason NOT to delete
  the goals.js content outright without checking this reference first.
- **The toilet-hint content flagged `needsRerecord`** ("the line named a cigarette count... a
  zyn or the raw milk each does it outright now") shows the bathroom-mechanic redesign happened
  *after* Squatchfather's own bathroom-weapon beat was finalized — worth checking that the
  Squatchfather bathroom sequence (toilet/sink/radiator/cabinet search) wasn't designed against the
  old mechanic too.
- **McClawsky's "You were being difficult" / "Go ahead. We checked it."** sets up McClawsky as
  quietly dangerous and thorough — a good foundation that nothing later in Days 1–2 calls back to,
  since McClawsky doesn't reappear in this half. Worth confirming he returns later (his name reads
  intentionally cop-adjacent) rather than being a one-scene villain.

### Where a joke or beat could land harder

1. **`shrug` / `drink` / `lean` gesture tags exist per-line** (`SAL, 'Business disagreement.',
   gesture: 'shrug'`) but Sal's flattest, funniest lines ("Business disagreement." / "Enough.")
   would land harder with a beat of silence before the gesture rather than folding it into the same
   3-second window as the line.
2. **"Wednesday belongs to the family." / "Everything belongs to someone until it changes
   hands."** is the thematic crux of the whole scene and currently gets the same pacing as every
   other exchange (2.6–4.2s holds) — it's the one line that could support a longer, more
   deliberate pause before Sal's reply to let the threat land.
3. The **train-vibration stage direction** ("The train grows louder. The glasses begin to
   vibrate.") is a strong physical beat that's only a stage direction, never voiced or scored with
   a distinct sting — currently it's identical in weight to any other silent beat in the sequence.
4. **"I understand." / "I understand it."** — Tony's agreement is extremely flat compared to
   the tension Sal and McClawsky built; a version that hints at what he's about to do (find the gun,
   betray the deal) would give the "yes man" surface more of a mask-slipping quality before the
   shooting starts.

### Placeholder / unfinished

None identified — this is the most complete, fully-voiced scene in the Days 1–2 corpus (27/27
lines recorded, zero rerecord flags, no orphaned systems).

---

## 4. The Beef Run

### Inconsistencies

1. **"Two Lous" is handled correctly here** (`SASOLE` is explicitly `captain_lou_sasole`,
   separate voice `lou2`) — no issue, flagged only as the positive counter-example to the Bing's
   Snow/Lawnmower slip above.
2. **The Bureau's name is inconsistent across two lines in the same beat set.** `caib.hail`
   voices "CAIB RADIO" as the agency calling in ("agricultural inspection"), and the mission's own
   `stove.dontask` beat calls Old Stove's cargo "agricultural equipment" with a straight face — but
   `depart.engine`'s urgent lookout call just says "Bureau," not CAIB, for what should be the same
   organization chasing them. A player paying attention could read "Bureau" and "CAIB" as two
   different pursuing agencies rather than one, especially since CAIB is spelled out as an
   acronym and "Bureau" never is.
3. **Cecilio is introduced as new** ("He's new," Lou says in `cecilio.silence`) at the exact same
   beat where Cecilio is already confident enough to lecture Tony about jerky lineage and, later in
   `guns.done`, competently weigh contraband crates and hand off "the important cargo" — a slightly
   uneven characterization for someone explicitly flagged as inexperienced in the same scene.

### Callback / foreshadowing opportunities

- **"Old Stove... He's also the government." / "Which government?" / "Ours. Allegedly."** is a
  terrific setup for a spy-thriller B-plot that this half never returns to — Old Stove's crates
  ("agricultural equipment" that's suspiciously heavy, no paperwork "on purpose") are handed off to
  Cecilio and never explained. If a later chapter doesn't pay this off, it's the biggest unresolved
  plant in the whole Beef Run.
- **"You're still a prospect."** (Lou's closer, when Tony asks about his cut) is a clean, sharp
  echo of the entire campaign's throughline (he's not made yet) and lands well as-is — good model
  for how Sasole's dry economy of language should be used elsewhere.
- **The sushi joke** ("I ate airport sushi." / "This airport has sushi?" / "Not anymore.") never
  returns, but it's exactly the kind of specific, throwaway color that a later Sasole scene
  (he reappears at both Bing visits and presumably beyond) could reference for a quick laugh
  ("Anyone seen the sushi guy? No? Good.").
- **The turbulence sick-bag gag** ("There are receipts in the sick bag. I'm putting it back.")
  sets up Sasole as someone who reuses puke bags for paperwork — a strong enough character detail
  that it's a shame it's a single-fire line with no second appearance anywhere in the corpus.

### Where a joke or beat could land harder

1. **"Ohhhh kay."** — flagged in-code as "spelled for Captain Sasole's delivery," this is
   clearly meant as a big vocal moment (first successful takeoff) but sits in a beat pool
   (`takeoff.okay`) with a flat 2.0s hold identical to throwaway barks — it deserves a longer,
   more special beat given the game explicitly calls out the unusual spelling as a delivery note.
2. **The barks system is very deep (19 pools, ~50 lines) but purely reactive/mechanical** — none
   of the barks reference anything from the scripted beats (e.g., no `stall` bark ever calls back
   to "the fuel gauge is an optimist" from the aircraft intro), so the two systems never talk to
   each other even though they're voiced by the same character in the same flight.
3. **Cecilio's characterization swings from silent to opinionated with no transition** —
   `cecilio.meet` is two lines and `cecilio.silence` explicitly comments on his quietness ("He's
   new."), but `guns.done`'s "(weighing a crate) Tractor parts." is a dry punchline that assumes an
   established rapport the scene hasn't built yet.
4. **"We find out if I remembered the number."** (Sasole, pre-first-takeoff) is a great
   character beat (barely-competent charisma) that isn't picked up again on the return departure,
   which has its own tension ("We're running out of runway." / "Then stop looking at it.") but no
   equivalent joke about Sasole's competence under a second, higher-stakes takeoff.
5. **"Beef jerky." / "That's it?" / "Rare beef jerky."** is a strong deadpan runner but stops
   at three exchanges — a fourth beat later in the flight escalating the absurdity of what's
   actually valuable about it (which the `cruise.photo` beat does explain) would tie the running
   joke and the plot exposition together instead of handling them as two separate beats.

### Placeholder / unfinished

- None structurally — 237 of 260 lines (91%) are voiced, the best coverage ratio of any scene in
  this half apart from Squatchfather. The 23 unvoiced lines are mostly single-fire barks
  (`stall`, `overspeed`, etc.) that are lower priority by nature.

---

## 5. The Squatch Graveyard

### Inconsistencies

1. **Scene is very short relative to its narrative weight** — it's the direct aftermath of a
   killing (Billy HotDog) and Willy's story arc setup (No Wake foreshadowing via `sauce` dialogue),
   but the entire authored corpus is 22 unique lines. Compared to the ~450-line Bing sequence it
   follows directly, the tonal compression is extreme — worth confirming this is a deliberate
   "quiet after the storm" pacing choice and not a scene that got cut short.
2. **"We already have a hole. Put HotDog in Sauce's." / "No. I have a feeling we are going to
   need that one soon."** is a direct, unambiguous foreshadow of Willy's death (the No Wake
   mission) stated by Snow in-scene — this is good writing, but it means Snow explicitly predicts a
   Family execution three story-chapters in advance while chatting about grave-digging logistics,
   which is a big tonal swing for a single aside line with no reaction beat from Tony.
3. **Grave-tier naming is inconsistent with the inspection copy.** `sheep` and `echo` are tagged
   `'standard-plus'`, `colton`/`geewiz` are `'standard'`, but the *text* differentiates them by a
   joke about smell ("smells like Asian feet") rather than by anything visibly about the described
   stone quality — a player comparing "GeeWiz. Regular stone, regular plot" (standard) against
   "Sheep got a proper stone. Not grand, not cheap." (standard-plus) may not perceive the tier
   distinction the code enforces, since the copy for both reads as roughly the same modesty.

### Callback / foreshadowing opportunities

- **Echo's easter egg ("I am still alive down here. Help me out.")** is a fully self-contained
  gag with a clean rug-pull ("It always does. Keep walking.") — strong as-is, no notes.
- **Traitor graves (Brawny, Whiplash) support urination as a disrespect mechanic**, which is a
  great emergent-storytelling beat, but nothing earlier in Days 1–2 (Bing, Squatchfather, Beef
  Run) ever explains *why* Brawny and Whiplash were traitors — a single line from Snow or Booski
  earlier in the campaign naming what they did would make finding their graves feel like a payoff
  instead of a cold factoid.
- **"The Motel does not close this easy."** (Snow, closing the burial) is a strong, ominous
  transition line into the next scene and lands well as a chapter-break beat — good model line.

### Where a joke or beat could land harder

1. Only two graves get a unique urination reaction (Brawny, Whiplash) despite eight graves total
   supporting inspection — a wider spread of tribute-specific reactions (even for the memorial
   graves, which currently only get the flat inspection line) would reward players who check every
   stone, since the objective explicitly counts "Pay respect or disrespect · 0/8."
2. **Colton's "smells like Asian feet"** and **GeeWiz's "one spelling nobody ever agreed on"**
   are both punchlines that trail off without a second beat — most of the other epitaphs
   (Babs, Sheep, Echo) build a small scene in one sentence; these two read as unfinished jokes by
   comparison.
3. **Sauce's open grave** is a strong visual (a name already cut into a temporary marker for
   someone not yet dead) but the only dialogue acknowledging it is the rejected "put HotDog here
   instead" exchange — there's no idle inspection line for Sauce's grave itself the way the other
   seven graves get one, despite `sauce` being in the `GRAVES` table with its own `line` field
   (it does have one — "An open plot with SAUCE already cut..." — but it is never delivered as a
   third-person "inspecting the grave" beat the way the others are, since Sauce isn't dead yet and
   the copy reads oddly next to "GRAVES" data that implies an inspection interaction).

### Placeholder / unfinished

- None — 22 of 28 lines (79%) are voiced, and every one of the scripted beats (arrival, burial,
  Echo, Sauce, barks) has a take. The unvoiced lines are pure HUD narration (picking up/placing the
  body), which is consistent with how HUD prose is treated as non-VO across the whole game.

---

## 6. The Jerky Motel

### Inconsistencies

1. **Rico and Chino's characterization contradicts the mission briefing.** Snow's brief describes
   a straightforward buy ("Room twelve. Meat first. Money second.") but the dialogue tree and the
   `MOTEL_STORY_LINES` corpus reveal Rico running an active bait-and-switch (fake product, a hidden
   Room Eleven stash, a betrayal offer to cut Snow out) that Snow's brief gives no hint of — which
   is presumably intentional (a "simple job" going wrong is the whole mission), but there is no
   line anywhere establishing *why* Snow trusted this deal enough to walk in clean; a single
   line of Snow's own doubt ("This should be simple" or similar) would sharpen the eventual reveal.
2. **`allMotelVoiceLines()` throws on cue collision** (`throw new Error('Motel voice cue
   collision...')`) — a defensive check, not a bug per se, but it means the Motel's voice pipeline
   is fragile: two different lines that happen to normalize to the same words+speaker would break
   the build. Worth flagging to engineering rather than story, but it constrains what synonymous
   rewrites ("Snow" saying the same short line twice with different intent) are safe to author.
3. **The "Third man"** ("Prospect. Third man. Of course there is a third man.") in
   `MOTEL_STORY_LINES` implies Tony expects exactly one extra threat and is unsurprised, but no
   earlier line in the Motel or Bing content establishes a "count the men in the room" pattern he
   would be extending — reads as a joke assuming a setup this half doesn't actually contain.

### Callback / foreshadowing opportunities

- **The revolver handoff** ("Compact revolver. Six in the wheel. For emergencies and disrespect."
  / Snow: "Under the coat. Seven in it. Do not let them see the crest...") directly references the
  Family crest as a liability if seen — a strong, specific detail that never returns in this half
  but is exactly the kind of prop-continuity a later scene (Silver Room, Heist) could pay off by
  having someone recognize the weapon.
- **"We paid forty thousand dollars for gas-station product."** is the single most quotable
  betrayal-outcome line in the corpus and would land even harder with an earlier scene establishing
  the actual number Lou is expecting back — right now "forty thousand" appears with no prior
  anchor for what a "good" haul would have looked like.
- **The ending's "It survived the way a rumour survives."** (failure state) is a genuinely good
  closing image for a botched job and pairs cleanly with the No Wake chapter's paranoid, rumour-
  and-secrecy tone that follows immediately after — a strong connective thread if the writers
  intend the Motel's outcome to color how nervous the No Wake chapter's radio silence reads.
- **Snow's dry humor ("I grabbed a case. It is full of smoked turkey. It is warm.")** on the
  wrong-case ending is a great capper with no earlier setup for "wrong case" confusion in the scene
  — a single earlier line establishing there are multiple similar cases in the room would turn this
  from a random punchline into an earned one.

### Where a joke or beat could land harder

1. **The EXPERT dialogue branch is consistently the "smartest" and most narratively rewarding
   option** (highest `read` values, unlocks Room Eleven) but its jokes are drier and less
   quotable than the INSULT branch's ("I have eaten belts with better texture." / "Belts. He says
   belts. In my room.") — since EXPERT is the "correct" playstyle, giving it one or two lines with
   as much personality as the insult branch would reward smart play with better writing, not just
   better outcomes.
2. **Chino is thinner than Rico across the whole tree** — he gets reactive one-liners ("Rico. He
   knows.") but no equivalent to Rico's world-building monologue lines; a beefed-up Chino line in
   the `ricoOffer` betrayal beat (where he's conspicuously silent) would sell the "which of these
   two is actually loyal to whom" tension the mission clearly wants.
3. **The getaway node's four reply variants ("Then we are rich. I am still shaking." / "Driving.
   Driving." / "I parked facing the exit. Mostly." / "Humidity touched everything tonight.")** are
   a nice full-circle callback to each dialogue style, but only fire based on the player's LAST
   chosen tone across the whole scene rather than their dominant tone — a player who was calm four
   times and threatening once currently gets the threatening ending line, which may read as a
   character inconsistency rather than a reward for the dominant playstyle.
4. **The bathroom-window and second-floor-watcher clues** ("The bathroom window opened an inch...”
   / "Second floor. He looked away a half second late.") are sharp, specific spycraft observations
   that never resolve into anything mechanically distinct from the other MOTEL_STORY_LINES beats —
   they read as Chekhov's guns (an ambush from upstairs, a bathroom escape route) that the mission
   doesn't appear to use, based on what's in this file alone.
5. **"That is not sauce."** is a great, confusing one-liner completely without context in the
   extracted corpus — worth checking against the runtime for what triggers it, since as a standalone
   line it currently reads as either a strong dark joke (blood) or a continuity nod to the Sauce
   grave from the Graveyard scene, and it's unclear from the text alone which was intended. If it's
   the latter, it's a great callback that deserves a starker delivery to make the connection land.

### Placeholder / unfinished

- 18 of 197 lines (9%) unvoiced — the best "mostly finished" ratio outside Squatchfather/Beef
  Run. Spot-check the specific 18 for priority, since they're scattered rather than a single system
  (unlike the Bing's block-unvoiced ambient chatter).

---

## 7. Apartment PC Apps — Squatch Mail

### Inconsistencies

1. **The live inbox is not "five messages."** The current build ships **12 live messages** (plus
   a 13th, "Uncle Lou — Tomorrow," explicitly excluded from the runtime inbox via a `.filter()` in
   `mail.js`). If any design doc or task brief describes "the five-message inbox," it is
   describing an earlier build state — worth a quick sync with whoever owns that spec, since the
   current mail app is meaningfully richer (and the excluded Lou email is itself worth restoring or
   permanently deleting rather than leaving as dead array data).
2. **The excluded Uncle Lou email is the *only* place in the entire mail app that explicitly
   frames "tomorrow night" as an initiation** ("Tomorrow night is yours... turn up as yourself").
   Every message that survived the cut (Booski x2, Deathmegatron, Irish, Ape, Lou Sasole) still
   assumes the reader already knows this context ("good luck tomorrow night," "for the initiation")
   but the one message that actually explains what "tomorrow" and "the initiation" mean was cut.
   A first-time player reading only the live inbox gets six messages confidently referencing an
   event whose stakes and shape are only explained in a message they'll never see.
3. **Same vestigial-meeting problem as Scene 1**: mail.js's `meeting: true` flag and
   `onMeeting?.()` hook still fire `learnAboutMeeting()` exactly like the chat and radio do, keeping
   three redundant delivery paths alive for a flag nothing downstream uses meaningfully.

### Callback / foreshadowing opportunities

- **Deathmegatron's hate mail** is a striking tonal outlier — the only unambiguously cruel,
  unprompted message in the game's early hours, sent at 3:47 AM by a character who is otherwise
  warm and funny in the Bing hangout scripts (self-aware about her intimidating name, casually kind
  — "Relax, kid. Nobody dies on a Tuesday"). Nothing in Days 1–2 reconciles "hangout DeathMegatron"
  with "hate-mail DeathMegatron"; if this is meant to read as a specific, isolated cruelty (as
  opposed to a characterization split), a single acknowledgment scene — even just a walk-up line
  where she's visibly awkward about it — would resolve the dissonance. As written, a player who
  reads both could reasonably conclude they're two different uses of the same character concept
  that were never reconciled.
- **Aubbie's mundane "buzzer repair" mail** is a well-placed piece of advance-planting — Aubbie
  becomes load-bearing in the Bing Visit Two cleanup crew, and this is the one place in Days 1–2
  that establishes him as a person before he's needed as a specialist. Good model for how
  "throwaway" mail content can double as cast-priming.
- **Lou Sasole's flying offer ("do you want me to take you flying sometime?")** directly
  foreshadows the entire Beef Run mission mechanically (Tony ends up flying the Brushrunner) but is
  never explicitly connected — a line in the Beef Run acknowledging "so THIS is what he meant" would
  reward players who read their mail.
- **Tony's spoken reactions** (the `mail.*` voice banks) are an excellent piece of unsung
  craft — every reaction is a specific, characterful response rather than a generic acknowledgment,
  and they're fully voiced. This is some of the best-integrated writing in the whole corpus and
  should be the reference standard for how other apps (HR reply, fired notice) handle reactions.

### Where a joke or beat could land harder

1. **The HR "reply" gag** (every keystroke outputs the next character of a pre-written expletive-
   laden resignation) is a strong mechanical joke, but its payoff line set ("Sent. Copied nobody.
   Perfect." / "I feel I struck the right tone there." / "That is the most honest thing I have
   written in four years.") undersells the specific line he sent — none of the three reactions
   quote or reference "squatch meeting" back, missing a chance to tie the joke explicitly to the
   vestigial-meeting content one more time.
2. **The Vehicle Services Dept. and Goy Corp IT spam emails** are pure environmental comedy with
   no reaction voice line and no payoff — appropriately, since they're spam — but they're also the
   only two "unread" (`unread: false`) messages alongside the merch order, meaning they're visually
   deprioritized in the UI despite being some of the funniest copy in the file ("Do not delay. Once
   this offer expires you will be unable to PURCHASE"). Worth considering surfacing at least one
   spam email as "new" so players are more likely to find it.
3. **Irish's gift email** is comedically dense but the follow-up reactions treat it as one joke
   ("Overwhelmingly Positive... reviewed") rather than escalating — a fourth reaction line
   specifically about the in-game Steam library entry showing up somewhere else (even just a toast
   next time he's at the PC) would sell the bit as a running gag rather than a single email.
4. **Booski's two-part thread** (logistics mail, then sincere mail four hours later) is
   structurally the strongest piece of writing in the mail app — the two-message gap where "the
   next one is not logistics" is a great instinct — but it's the only sender who gets this treatment;
   giving one more Family member (Ape or Irish, both already warm) a similar two-beat arc would
   make it feel like a pattern rather than a one-off.

### Placeholder / unfinished

- The `Uncle Lou "Tomorrow"` email — fully written, unused, explicitly filtered from the live
  inbox. This is the single most complete piece of orphaned content across the whole Days 1–2
  corpus: a polished four-paragraph letter that establishes tone, stakes and the Initiation's
  values, sitting in source with a one-line comment killing it.
- Message bodies are never voiced (by design — nobody reads mail aloud), which is consistent and
  not a gap; only the reaction barks are VO'd, and those are complete for every message that has a
  `vo` key.

---

## Cross-scene summary

**Total lines extracted: 1,257** (Apartment hub 264 · Bada Bing 436 · Squatchfather 35 · Beef Run
260 · Graveyard 28 · Jerky Motel 197 · Squatch Mail 37). Voiced: 775 (62%) / Unvoiced: 482 (38%).

The single biggest structural finding is that **two campaigns are layered on top of each other**
in the apartment hub and mail app: the shipping, mission-based, four-day campaign
(`campaign.js`/`apartment-story.js`) that all six field scenes belong to, and a fully-written,
partly-voiced, entirely disconnected "Wednesday Squatch Meeting" narrative (`goals.js`, most of
`chat.js`, the radio's `MEETING_NOTICE`, several `mail.js` messages, and the excluded Uncle Lou
email) that the door no longer checks and whose six ending cards can never be shown. Every other
inconsistency in this report is a smaller-scale version of the same root cause: recordings, story
text, and gating logic that were updated independently and never fully reconciled against each
other.
