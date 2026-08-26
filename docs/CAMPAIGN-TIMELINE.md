# Campaign timeline — current production flow (updated 2026-08-26)

> **This file is the record of what is BUILT, not the plan.**
>
> The owner's campaign story bible arrived on 2026-08-26 and lives at
> `docs/CAMPAIGN-STORY-BIBLE.md`, with the thirty-one beats as data in
> `src/core/campaign-spine.js`. Where that spine and this timeline disagree,
> the spine is where the campaign is going and this page is where it is now.
> `tests/campaign-spine.test.mjs` counts the distance between them: fifteen
> beats do not yet play in the position the bible puts them, and that number
> is a budget that may only fall.
>
> The five structural moves still outstanding: the cabin comes forward from
> the post-heist lay-low to the Squatchfather extraction; Beef Run moves
> inside it; THE TAKE moves back to sit between coming home from the motel and
> Lou's new-space call; the luxury apartment becomes the second home for the
> whole back half; and the Margo arc inverts so the date precedes NO WAKE
> rather than following it.


The owner's connected campaign route implemented by campaign schema v19. The
original four-day apartment spine remains intact. After THE TAKE cleanup, Lou
sends Tony to a separate furnished cabin in the countryside to lay low. That
second home base then connects The Silver Case, PROJECT SILENT SQUATCH,
Mansion Under Siege, Enola Squatch, the repaired-mansion briefing, and Cartel
Palace. Initiation remains a protected terminal WIP until the owner has
playtested and approved changes to that scene.

## Built but deliberately unplaced: the luxury apartment

`luxury-apartment.html` is a standalone late-game home hub with a two-level
loft plan, panoramic city windows, the original apartment's activities and art
collection, and additional gallery and game-space dressing. It does not
replace the original apartment, alter the route table below, or claim a story
checkpoint yet. Its eventual unlock, move-in beat, and return routing stay an
owner story decision; until then it is available only from the preview gallery
as a future-hub scene.

## Campaign premise

The Silver Sasquatches are a gaming organization whose mascot is a silver
Bigfoot sasquatch. Tony Squatchtana is pledging the organization as a Prospect:
the fraternity-style errand boy who has to prove he can be trusted before he is
initiated as a Squatch.

The organization adopts a Cosa Nostra-family persona and plays it completely
straight inside the campaign. Missions restage and remix recognizable mafia
and other movie situations as deadpan parody; the comedy comes from the Family's
absolute seriousness, the gaming-organization details inside genre scenes, and
the humiliating distance between Tony's status as an errand boy and the grandeur
the Family assigns to every job. The campaign endpoint is Tony's formal
initiation into the Silver Sasquatches.

## Current connected route

This is the production route implemented by `src/core/campaign.js` and covered
by `npm run verify:campaign-route`:

| Chapter | Apartment gate | Mission route | Return / chapter change |
|---|---|---|---|
| 1 | Eat, shower, poop, change clothes, answer Big Uncle Lou | Bada Bing one → apartment whiskey nerve-settle → Squatchfather | Return home and sleep |
| 2 | Wake 7:00 AM, answer Booskibro | Beef Run → apartment, answer Big Uncle Lou → Bada Bing two / HotDog incident → Squatch Graveyard → Jerky Motel | Return home 4:30 AM and sleep |
| 3 | Wake noon, answer Big Uncle Lou's vague harbor call | NO WAKE → apartment, answer Margo → Front and Center | Return home and sleep |
| 4 | Margo's morning-after beat, answer Big Uncle Lou's Silver Pines call | Silver Pines → apartment, answer Lou's heist call and collect seven loadout pieces → THE TAKE → apartment cleanup | Read Lou's lay-low message and drive north; the apartment remains the original hub |
| Lay low | Countryside cabin: a second home base with the apartment's domestic utility | Sleep one night at the cabin; optionally explore the creek, ridge overlook, forestry shed, and firepit | Take the parked car to The Silver Case after the required rest |
| Final chapter | No additional apartment detour | The Silver Case → Lou's Mansion / PROJECT SILENT SQUATCH → quiet mansion evening and guest-room sleep → Mansion Under Siege → Enola Squatch → repaired Mansion return → Cartel Palace | Cartel Palace opens Initiation; Initiation is entered `in_progress` and remains frozen |

Every external mission owns a registered scene/spawn and either returns to the
apartment, passes through the later cabin hub, or hands directly to the next
mission. The save survives reloads at each seam. The connected topology is
complete through entry to Initiation; the remaining campaign-ending decision
is the protected Initiation scene itself, not a missing route into the final
chapter.

## Day 1 — Welcome to the Life

**Apartment, morning.** The player wakes as an unknown Prospect. The flat is
anonymous: **no trophies from previous missions**, because there have been
none. Day 1 is deliberately unhurried — he wakes early and has to kill time
until the club that night. The door's four readiness beats are required:

- eat · shower · poop · change clothes
- answer Lou's physical phone call: come to the Bada Bing later

Everything else is optional characterization and play:

- check email · explore the apartment · use the phone and answering machine
- use the computer and play Squatch Smash

Story time advances through those authored actions rather than real waiting;
idle exploration never silently moves the campaign clock.

**Bada Bing, scene one.** Exciting, not threatening. The Prospect thinks he has
found the coolest group of lunatics on Earth.

**The Squatchfather.** He proves he can act under pressure. The campaign's
first irreversible step: before this he was hanging around criminals; after it
he is one.

## Day 2 — Trusted With Business

**Apartment, morning.** The flat reacts to Day 1: radio or television mentions
the restaurant incident, a new voicemail from Lou, bloodstained or discarded
clothing, more contacts in the phone, slightly more money, new computer content
and emails, and a different outfit to choose.

**The Beef Run.** Captain Lou Sasole's smuggling flight — the world beyond
restaurants and clubs, and proof that family business is ridiculous,
dangerous, and surprisingly organised.

**Bada Bing two / the Billy HotDog incident.** The return begins as a closed
party and becomes a sudden attack, a body problem, and a physical cleanup. Tony
must secure and load HotDog before the route can move on.

**The Squatch Graveyard.** Tony carries HotDog to the plot, places him, and
buries him. The required burial unlocks the Motel; the surrounding markers,
tributes, and disrespect choices form an optional memorial museum with durable
state.

**The Jerky Motel.** The grimier underbelly — the point where the campaign
stops feeling glamorous. Day 2 ends with the Prospect exhausted, rattled, and
more valuable to the family.

## Day 3 — Loyalty Gets Ugly

**Apartment, noon.** The atmosphere turns: rain or grey light, radio news about
the motel, Lou telling him to dress casually and meet at the docks, the call
unusually vague, and **Willy gone from his contacts and messages**. The player
should know something is wrong before knowing what.

**NO WAKE — built and connected.** The boat: dock, board with Lou Sputthole,
Booski, Willy and the Prospect, open water, conversation souring, the family
presenting Willy as the traitor, the others preparing, shooting him, disposing
of the body, and riding back in silence. At this point Tony and the family
believe they killed an enemy. The Palace evidence later proves they killed the
wrong man and clears Willy posthumously. Willy's permanent large-belly model is
shared with his earlier appearance so his body does not change between scenes.

**Front and Center.** The Copacabana date with Margo, deliberately placed
after the hit for the tonal whiplash: that afternoon he killed a friend; that
evening every door opens, the staff know him, the table is carried out front
and center, the band plays, and Margo sees the glamorous version of his life.
The player is allowed to enjoy it while small details keep the boat underneath.
Ends with a cutscene of the apartment with Margo.

## Day 4 — The Peak

**Apartment, morning, with Margo.** A short cutscene: the Prospect rolls over,
Margo wakes beside him, gives a line or two — warm but not sentimental,
slightly awkward, she enjoyed last night, she may tease him about acting
important — dresses, and leaves before the criminal plot takes over. Then the
phone rings: Lou invites him to three holes at Silver Pines before the big job.
**The flat now shows his rise**: cash, expensive
clothes, club memorabilia, weapons, photographs, mission souvenirs — the den of
a newly minted Squatch criminal who has accumulated money, enemies, souvenirs,
and one extremely questionable laundry basket.

**A Morning at Silver Pines — built and connected.** Lou, Rippinflow, and Eric
take Tony through three holes. The quiet, invitation-only round is a status
reward after Front and Center and a pressure-release before the mechanical
climax. Its scorecard, strokes, penalties, memorable golf outcomes, and Lou's
invitation conversation persist. Completing the third hole returns Tony home;
only then does Lou call about the heist and the seven-piece loadout appear.

**THE TAKE — built and connected.** Crew: the Prospect, Numbskull,
Rippinflow, the Shubenator, DeathMegatron, Snow. The mechanical climax
combining everything taught: driving, instructions, weapons, crowd control,
timed objectives, carrying loot, crew coordination, police response, escape
routing, injuries, decisions under pressure. It does not end at the escape —
it decompresses: vehicle swap, safehouse, counting money, arguing over
mistakes, checking who survived, and Lou putting the crew's performance on the
record before the Family decides Tony's future later. Its briefing,
bank, vault, street, garage, vehicle-swap, driving, loot, injuries, settlement,
and retry checkpoints persist. The safehouse returns Tony home, where washing,
changing, and hiding the gear are physical door requirements.

**The countryside cabin — built and connected.** Completing the apartment
cleanup does not replace or retire the apartment. Tony reads Lou's lay-low
instructions, packs light, and drives north to a separate second hub. The
cabin imports the apartment's familiar domestic utility and collected art into
a rural home base, while its detailed property opens onto a trail, creek,
ridge overlook, forestry shed, firepit, porch, and surrounding woods. Sleeping
one night is the only required cabin beat. Exploring the property is optional,
durable, and advances the clock once per landmark.

**The final chapter — built and connected.** After the cabin rest, the parked
car opens The Silver Case, then hands directly through PROJECT SILENT SQUATCH,
the quiet mansion evening and guest-room sleep, Mansion Under Siege, Enola
Squatch, the repaired-mansion briefing, and Cartel Palace. Cartel Palace is the
last combat mission. Its successful extraction exposes Initiation.

The final chapter uses authored, exact-once clock events at every travel and
mission handoff. Reloading or replaying a completion cannot add the duration a
second time, and preview campaigns keep these events in page-local storage.

| Beat | Campaign clock after the authored event |
|---|---|
| Arrive at the countryside cabin | Day 4, 6:55 PM |
| Wake after laying low | Day 5, 2:30 PM |
| Leave for The Silver Case | Day 5, 4:00 PM |
| Complete The Silver Case | Day 5, 5:30 PM |
| Arrive at Lou's Mansion | Day 5, 5:55 PM |
| Complete PROJECT SILENT SQUATCH | Day 5, 8:10 PM |
| Sleep in the guest room | Day 6, 4:10 AM |
| Complete Mansion Under Siege | Day 6, 6:10 AM |
| Leave for Enola Squatch after regrouping | Day 6, 2:00 PM |
| Complete Enola Squatch | Day 6, 6:00 PM |
| Return to the repaired Mansion | Day 6, 6:30 PM |
| Complete the return briefing | Day 6, 7:15 PM |
| Leave for Cartel Palace | Day 6, 8:30 PM |
| Extract from Cartel Palace | Day 6, 11:00 PM |

The cabin rows show the required route with no optional detours. Creek, ridge,
shed, and firepit exploration add their own exact-once time without gating the
car or rewriting the final-arc schedule backwards.

The workbook's **Day 5 night** label for Mansion Under Siege is a narrative
label for the overnight begun on Day 5. The guest-room sleep crosses midnight,
so the campaign's calendar clock correctly begins Siege on Day 6 at 4:10 AM.

The 2:00 PM Enola row is the drive and the aircraft prep, matching
`campaign.js`'s own comment — Sasole's handoff at the end of the siege
promises the night flight ("We fly tonight"): wheels-up follows the prep, and
the raid flies in full dark.

**Initiation night — WIP, DO NOT TOUCH.** The protected ceremonial payoff at the Bada
Bing, not another action sequence: old faces return, the Prospect is praised
for specific campaign actions, Lou explains what membership means, the oath,
formal acceptance, and "Prospect" replaced by his chosen name or Squatch
title. Let the player breathe, talk to everyone, hear callbacks, drink. Final
image: Lou raises a glass, the family cheers, the camera pulls back from the
club, a television quietly reports the search for the heist crew, credits.
The current campaign enters this runtime `in_progress`; none of the proposed
rewrite or ending behavior below is implemented without owner approval.

## HISTORICAL MANSION ARC DESIGN — superseded by schema v14

The sections below preserve the 2026-08-05 design record. They are not current
implementation status and must not be used as a build order. The authoritative
route and current owner decisions are in
`CAMPAIGN-FLOW-AND-POLISH-REPORT-2026-08-08.md` and
`FINAL-CAMPAIGN-INTEGRATION-2026-08-08.md`.

**Where it hangs.** PROJECT SILENT SQUATCH is built and playable — the
Prospect carries the case to Lou, the lab finishes the weapon, Booski has the
scientists gassed, and the Prospect walks back up the stairs. What happens
next is presently nothing. This arc is what happens next.

### 1 · The night at the mansion — the seam, not a mission

Booski tells the Prospect he is staying the night, and he can have the room
downstairs in the basement. The Prospect goes to sleep. **That completes
SILENT SQUATCH.**

The sleep is doing real work and it is worth being explicit about why: it is a
LOAD SEAM. It ends one mission cleanly and gives us the chance to bring up a
second, different version of the mansion — the same house, on fire. Without
it we would be trying to mutate a twelve-thousand-mesh building live.

The basement room is also the right place to be sleeping. It is one floor
above a laboratory full of dead men he watched die a few hours earlier, and
nobody remarks on that.

#### The evening before bed — a hub, not a corridor

Owner, 2026-08-05: *"I'll want a bunch of optional objectives in the mansion —
before going to bed. Some may be mandatory. You can go flirt with the girls by
the pool. Almost the whole cast will have a thing you can talk to them about
and do. Go watch movies in the home theater with X and Y and we'll wire in
lines depending on what you are watching, maybe we can play pool."*

This turns the seam into the last quiet evening of the campaign, and it is the
mirror of Initiation night: the player has just helped murder six people, and
the house responds by offering him a drink and a film. Nobody in it mentions
the basement.

**Shape.** A short list of things to do before sleeping. **Some mandatory,
most optional** — the mandatory ones gate the bed the way the flat's chores
gate the front door (`DEPARTURE_REQUIREMENTS` in `src/core/apartment-story.js`
is the working precedent, including its refusal lines and its hint-on-second-
attempt rule). The optional ones are the reason to walk the house.

**Almost every member of the cast has ONE thing.** Not a conversation tree per
person — one thing you can talk to them about and one thing you can do with
them. `src/bing/family.js` already implements exactly this and should be the
model rather than a new system: a roster row, a spot, a walk-up conversation,
and a `vo.` cue per line.

**Named so far:**

- **The girls by the pool** — flirting, in the club's register, and the player
  can be turned down. Same performer-form constraints as the Bing.
- **The home theatre with two of the cast** — and the interesting part is the
  owner's: *"we'll wire in lines depending on what you are watching."* So the
  dialogue keys off the CHANNEL. `src/core/tv.js` already has `videoChannel()`
  and the mansion already mounts real sets, so the machinery exists; what is
  needed is a line bank per film per companion. This is the cheapest big win
  on the list — two men on a sofa reacting to what is on screen is a lot of
  character for very little geometry.
- **Pool, in the billiard bay** — owner: *"maybe we can play pool i'll see if
  that's doable."* FLAGGED AS UNDECIDED. Real pool is a physics minigame and
  a genuine piece of work; a two-shot scripted version with banter over it is
  a fraction of the cost and probably reads the same at this point in the
  night. Decide before building, not during.

**What already exists:** the theatre, the billiard bay and its bar, the pool
and its patio, the walk-up conversation system, the objective HUD, and — after
the cast pass — the people themselves standing in those rooms. The mandatory/
optional gate is the only new mechanism, and the flat already has one.

**Still owed by the owner:** `assets/video/the-feature.mp4`, which the theatre
has been waiting on. The film everybody is watching is currently missing, and
the theatre beat needs it.

### 2 · The cartel attack — MANSION UNDER SIEGE

**Now specified in full: `docs/MANSION-SIEGE-NIGHT.md`.** That document is
authoritative for this beat; what follows is the campaign-level summary.

He wakes in the middle of the night. **The attack is already happening.**

The register is the SCARFACE parody: "say hello to my little friend". Read
`docs/TONE-AND-PARODY.md` before writing a line of it — the reference is the
scene, not a wink at the audience, and nobody in the house should notice they
are in one.

**The design problem the owner named — the player needs a REASON to go
upstairs, so the fight happens from the balcony — is solved, and it is solved
by the building rather than by an objective.** He wakes in the basement with a
pistol. The armory is at the other end of the cellar corridor, so the first
move is sideways, not up. Once he is armed, the only route out of the cellar
is the basement stair, and it comes up into the rear hall at the north end of
the foyer with the horseshoe on both flanks and the front door twenty-two
metres away, full of men. Upstairs is where the family is, and the gallery
rail is the only position in the house that covers the foyer floor and both
flights at once. Nobody has to be told.

**The technical decision, and it is the one that matters:** the siege is a
DAMAGE-STATE OVERLAY on the canonical mansion, not a forked copy of it. Same
two builders, same geometry, six named states (`clean`, `alert`,
`under_attack`, `damaged`, `post_battle`, `repaired`). The mansion overview
can keep moving without three maps needing the same repair, and improvements
the siege exposes go in that document's future-edit table rather than into
`Mansion_Base` twice.

The house is already staffed — the man on the door, six guards on their posts,
the bartender, Snow, Gratin, and the Family hanging out in it. **That roster
is the cast of this attack.** Everyone the player has met in that building for
an evening is now in a firefight in it, which is worth more than any set piece
we could build cold.

### 3 · The retaliation — the Enola Squatch

After the attack, **Lou expedites the attack plan**, and that plan is the
Enola Squatch mission — which is already built. The bomber, the crew, the
target city, the Fat Squatch. It currently sits in the campaign with no
argument for why anybody would do it. This gives it one: they came to his
house in the night.

Silver Pines already seeds this — Lou, on the second green, mentions a thing
after the thing that "needs an aeroplane", six thousand pounds of it, and a
captain who is another Lou with a clipboard. That seed pays off here rather
than out of nowhere.

### 4 · The talk going in

Owner: *"i'll want to plan the voice lines for this because the talk going
into this one is going to be epic."*

So: **the writing for the Enola briefing is a deliberate, separate piece of
work, planned with the owner, and it is not to be improvised alongside the
level.** It is the emotional payoff of the whole mansion arc — the room where
the family decides to do the thing — and it should be written the way PROJECT
SILENT SQUATCH's script was: as data, in one file, before anybody builds a
scene around it.

### 5 · The wrong city — back at the mansion, clean

The player returns to the mansion in the `repaired` state: **the canonical
house with a story flag, never the siege damage written back.** That is a
design rule, not an implementation detail — the wreckage was a mission
overlay and it comes off.

Lou tells him three things, in this order and played as a scene rather than a
HUD toast:

1. They bombed the **wrong city**. The intended cartel target is untouched.
2. While the operation was running, **Sauce was taken**.
3. The cartel is holding him at **Mark's estate**. There is going to be a
   final infiltration.

Grim absurdity is the register. Six thousand pounds of Fat Squatch went into
somebody else's town and the room has to sit with that before it moves on.

### 6 · The cartel palace — the actual final mission

Presented as a rescue. It is not one.

**The truth the player discovers on site:** Sauce was never a prisoner. He
moves freely, he is armed, he is treated as a guest, and he helped set the
whole thing up — the attack, the story, the operation. The complete evidence
trail also proves the inside leak continued after Willy's death: Willy was not
the rat, Sauce was, and Sauce had help inside the organization. The rescue
becomes an elimination. **Mark is the cartel boss.** Both of them are targets
by the end.

Staged, not announced: documents, radio chatter, photographs, guard
conversation, his own belongings, security footage, and finally Sauce sitting
at Mark's table with a weapon on it. Do not spend the twist at the gate.

**Its own map — `Cartel_Palace_Final`.** Not Lou's mansion in a different
colourway and NOT another damage layer on it. It reuses systems, proportions,
props, stair modules, guard AI, encounter tooling and every set-dressing
lesson the mansion taught us; it differs in silhouette, material, plan,
courtyards, walls and gates, service passages, separate guard housing, a much
larger dining room, and light. A wealthy criminal compound built for privacy,
family life, intimidation and defence — not a theme park.

The shape is the 2015 SICARIO estate infiltration as RHYTHM, not shot list:
quiet approach, perimeter, controlled eliminations, deeper in, the evidence
about Sauce, rescue becomes betrayal, the dining room, Mark and Sauce, done.

The contrast with the siege is the point and should be protected: the siege
is loud, chaotic, defensive, ensemble-driven, automatic. The palace is quiet,
deliberate, predatory, nearly solitary, controlled.

Full direction: `docs/MANSION-SIEGE-NIGHT.md` PARTS X–XIII.

### 7 · Initiation

**Initiation is the ending scene, not the final mission.** The cartel palace
is the last thing the player fights through; Initiation is what the campaign
resolves into afterwards. The clearing now makes the Palace finding explicit:
Willy is cleared, Sauce's unidentified inside help forces the nuclear option,
and every remaining prospect kneels. Prospect Three, Four, Five, and Kittenboss
are executed in Tony's view. Gratin then aims at Tony; Big Uncle Lou stops him
with "Stop. This one is good." Tony alone is taken to the cabin because the
family is at quota and only one place remains.

### What already exists and can be reused

The mansion, inside and out, staffed and dressed. The weapon system and the
basement armory. The shared combat framework — `core/combat/*` plus
`core/weapons/*` — which the siege now drives and the palace will drive
after it, with `FACTIONS.CARTEL` already in the matrix. The Enola Squatch
mission entire. The campaign save, the checkpoint machinery, and the
scene-to-scene navigation. `src/mansion/cast.js` for placing people. The
siege's own damage-state overlay, wave director and mission model
(`src/mansion/siege/`), all of which the palace's infiltration can reuse
wholesale.

This arc is mostly staging and writing, not new systems. The two genuinely new
things are the damaged/burning state of the house — now built as an overlay —
and the cartel palace itself, which is a new map.

## Rhythm

Day 1 introduction and first blood · Day 2 trust, competence, expanding work ·
Day 3 betrayal, darkness, then glamorous reward · Day 4 personal payoff, a quiet
invitation into the inner circle, the heist, formal acceptance. The structural
keystone is putting the informant killing directly before Front and Center;
Silver Pines then gives the climax one last breath before THE TAKE.

**The apartment must visibly evolve after every chapter.**

## Remaining design or production gaps (2026-08-01)

1. **Bing scene two recognition beats** (bartender's new lines, dealer and
   performer campaign comments, Lou covering drinks, informant hints, a nervous
   Willy) belong to the older club-shaped draft. The connected second visit is
   now the dedicated HotDog party, so any revival must be designed into that
   scene instead of restoring the obsolete route.
2. The Front and Center closing **cutscene of the apartment with Margo** is not
   built; Day 4 opens with her in the bed instead.
3. **The current Initiation is not a campaign-complete state.** The apartment
   routes Tony into the frozen Initiation scene after THE TAKE, but that scene does not claim the
   campaign, record completion, or expose an outbound edge. The focused route
   contract therefore ends with Initiation `in_progress`, not `complete`.
4. **The finale has two authored shapes.** This timeline places an oath and
   callback ceremony at the Bada Bing, while `docs/STORY.md` preserves the
   Pines quiz, execution, gauntlet, roar, timber, and anointing. Reconcile those
   designs after the required playtest before wiring the final checkpoint.
5. **Silver Pines needs a human pacing and performance pass.** Its campaign,
   inventory, preview, Pages, scorecard, and three-hole route are now canonical.
   The owner still needs to judge shot feel, walk/ride pacing, camera comfort,
   dialogue repetition, and the handoff into heist preparation in one continuous
   Day Four playthrough.
