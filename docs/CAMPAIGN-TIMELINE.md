# Campaign timeline — current production flow (updated 2026-08-28)

> The exact beat/scene/spawn/exit table is generated directly from the live
> spine in [`CAMPAIGN-ROUTE-GENERATED.md`](./CAMPAIGN-ROUTE-GENERATED.md).
> This narrative document supplies context; it is not a second route ledger.

> **This file is the record of what is BUILT, not the plan.**
>
> The owner's campaign story bible arrived on 2026-08-26 and lives at
> `docs/CAMPAIGN-STORY-BIBLE.md`, with the thirty-one beats as data in
> `src/core/campaign-spine.js`. Where that spine and this timeline disagree,
> the spine is where the campaign is going and this page is where it is now.
> `tests/campaign-spine.test.mjs` counts the distance between them.
>
> **All five structural moves are made.** The cabin came forward from the
> post-heist lay-low to the Squatchfather extraction with Beef Run inside it
> (2026-08-26); THE TAKE moved back to sit between coming home from the motel
> and Lou's new-space call, the luxury apartment became the second home for
> the whole back half, and the Margo arc inverted so the date precedes NO WAKE
> (2026-08-27). The two-floor Margo stayover and morning departure are staged,
> and Beat 27 now rings in the luxury apartment before the existing pickup,
> ride, trunk reveal, arrival and ceremony. All thirty-one beats are wired.

The owner's connected campaign route implemented by campaign schema v26. Two
homes: the starter apartment for beats 0 to 13, and the luxury apartment from
the moment Lou hands over the keys on the eighteenth green at Silver Pines.
The Home Ladder climbs there and never comes back down. Initiation remains a
protected terminal WIP until the owner has playtested and approved changes to
that scene.

## The second home: the luxury apartment

`luxury-apartment.html` is the late-game home hub — a two-level loft plan,
panoramic city windows, the original apartment's activities and art
collection, and additional gallery and game-space dressing. It was standalone
and unplaced until 2026-08-27; it now owns bible beats 14, 16, 17, 19 and 27, and
`src/core/luxury-apartment-story.js` is its campaign seam. The page still
boots as a standalone developer preview when the save is not standing in it,
which is what `routed` decides in `src/luxury-apartment/main.js`.

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
| Act One (Days 1–4) | Eat, shower, poop, change clothes, answer Big Uncle Lou | Bada Bing one → Family driver directly to Squatchfather → Cabin I → Beef Run → Cabin II → Bada Bing two / HotDog incident → Squatch Graveyard → Jerky Motel | Snow waits for daylight, then drops Tony at the starter apartment once the block is clean |
| 3 (Day 5) | Wake noon, get a game of Counter-Squatch in, answer Lou's heist call and collect seven loadout pieces | THE TAKE → apartment cleanup | Lou rings about a new space; sleep |
| 4 (Day 6) | Wake 7:00 AM, warm the eye up on Squatch Shoot — no call, Lou rang last night | Silver Pines | Three holes and the keys: the starter flat goes dark and the route moves to the luxury apartment |
| Luxury (Days 6–7) | GET READY FOR YOUR DATE — the appointment was made from the cabin | Front and Center → luxury apartment with her; sleep; the morning; Lou's harbour call → NO WAKE → luxury apartment | Booskibro rings about something small and sensitive; the lift opens The Silver Case |
| Final chapter | No starter-apartment detour | The Silver Case → Lou's Mansion / PROJECT SILENT SQUATCH → quiet mansion evening and guest-room sleep → Mansion Under Siege → SQUATCHOLA GAY → repaired Mansion return → Cartel Palace → luxury-apartment call → existing Special Meeting pickup and ride | Special Meeting opens Initiation; Initiation is entered `in_progress` and remains frozen |

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
stops feeling glamorous. Snow holds Tony under the jerky cover until the block
is clean, then gets him home in daylight at 6:30 AM on Day 5: exhausted,
rattled, and more valuable to the family.

## Day 5 — The Take

**Apartment, noon.** Snow waits until the watched block is clean, drops him
home in daylight at 6:30 AM, and Tony sleeps until midday. The atmosphere turns: rain or grey light,
radio news about the motel, and one game of Counter-Squatch with Booskibro's
boys before the phone. Then Lou: a car is coming, gray suit, armor underneath,
and everything he owns on the table.

**THE TAKE — built and connected.** Crew: the Prospect, Numbskull,
Rippinflow, the Shubenator, DeathMegatron, Snow. The mechanical climax
combining everything taught: driving, instructions, weapons, crowd control,
timed objectives, carrying loot, crew coordination, police response, escape
routing, injuries, decisions under pressure. It does not end at the escape —
it decompresses: vehicle swap, safehouse, counting money, arguing over
mistakes, checking who survived, and Lou putting the crew's performance on the
record. The safehouse returns Tony home after dark, where washing, changing,
and hiding the gear are physical door requirements.

**Beat 12 — Lou's new-space call.** The last thing the starter flat ever does.
*"Kid. Sit down. We got a new space. Come meet us on the course."* Eight
o'clock, Silver Pines, second gate, and nothing about what the new space is.
The owner's ruling put the job first: the call reads as the reward for it.

## Day 6 — The Keys, and the Table

**A Morning at Silver Pines — built and connected.** Lou, Rippinflow, and Eric
take Tony through three holes. The quiet, invitation-only round is a status
reward for the bank and a pressure-release before the second half of the
chapter. Its scorecard, strokes, penalties, memorable golf outcomes, and Lou's
invitation conversation persist. **Completing the third hole does not return
Tony home** — it hands him a set of keys, and the starter apartment goes dark
for good.

**Beat 14 — the luxury apartment, a quarter to twelve.** Two floors, a private
lift, and the whole afternoon to GET READY FOR YOUR DATE. The cabin call
already fixed Front & Center's Silver Room table for nine; the lift waits only
for the shower, date clothes, and phone, then goes directly to the venue.

**Front and Center.** The Copacabana date with Margo, on the night of the
handover: every door opens, the staff know him, the table is carried out front
and center, the band plays, and Margo sees the glamorous version of his life.
Woo changes the warmth of her answer; both live endings send her home with him.
The old cab, awkward and disaster endings remain save-compatible data only.

**Beat 16 — the stayover.** She comes home to the new place, comments on it,
walks the deliberate two-floor route to the loft, asks for help with the dress,
then sleeps and snores while Tony remains free to wander. Nothing criminal
rings tonight, and the bed is the only way out of the evening.

## Day 7 — Loyalty Gets Ugly

**Beat 17 — the morning.** Ten past seven. She has a delivery at eleven and a
man who cannot be trusted with a delivery, so she asks for the dress help once
more, leaves by the two-floor path, and only then can Lou's call ring.

**NO WAKE — built and connected.** The boat: dock, board with Lou Sputthole,
Booski, Willy and the Prospect, open water, conversation souring, the family
playing a wire recording that proves Willy leaked the earlier strip operation,
the others preparing, shooting him, disposing of the body, and riding back in
silence. Willy never confesses, but the evidence is hard. The Palace later
proves Sauce committed the separate Silver Case/mansion betrayal tied to the
Short Bus mole thread; it does not clear Willy's earlier leak. Willy's permanent
large-belly model is shared with his earlier appearance so his body does not
change between scenes.

**Beat 19 — home from the dock, twenty past five.** A quiet hour in a flat he
has lived in for a day and a half, and then Booskibro: there is a thing that
needs moving tomorrow. Small. Sensitive. It goes to Lou himself.

THE TAKE's briefing, bank, vault, street, garage, vehicle-swap, driving, loot,
injuries, settlement, and retry checkpoints all persist.

**The countryside cabin is in ACT ONE, and no route reaches it from here.**
The whole Cabin Hideaway chapter is Days 2 to 4 — the lay-low, the Beef Run
inside it, and the dungeon — and the post-heist drive north was retired with
beat 19. The property's own page above covers it.

**The final chapter — built and connected.** The luxury apartment's lift
opens The Silver Case, then hands directly through PROJECT SILENT SQUATCH,
the quiet mansion evening and guest-room sleep, Mansion Under Siege, Enola
Squatch, the repaired-mansion briefing, and Cartel Palace. Cartel Palace is the
last combat mission. Its successful extraction returns Tony to the luxury
apartment, where Booskibro's exact-once call sends him downstairs to the
existing Special Meeting pickup and ride; that scene exposes Initiation.

The final chapter uses authored, exact-once clock events at every travel and
mission handoff. Reloading or replaying a completion cannot add the duration a
second time, and preview campaigns keep these events in page-local storage.

These are the hours `npm run verify:campaign-marathon` prints at each landing,
not a plan. They read Day 4 to Day 6 before the Act-One cabin took Days 2 to 4
and beats 12-19 gave Chapter 3 the two days it needed.

| Beat | Campaign clock after the authored event |
|---|---|
| Home from South Harbor | Day 7, 5:20 PM |
| Booskibro rings about the case | Day 7, 5:25 PM |
| Leave for The Silver Case | Day 8, 4:00 PM |
| Complete The Silver Case | Day 8, 5:30 PM |
| Arrive at Lou's Mansion | Day 8, 5:55 PM |
| Complete PROJECT SILENT SQUATCH | Day 8, 8:10 PM |
| Sleep in the guest room | Day 9, 2:10 AM |
| Complete Mansion Under Siege | Day 9, 4:10 AM |
| Leave for SQUATCHOLA GAY after regrouping | Day 9, 2:00 PM |
| Complete SQUATCHOLA GAY | Day 9, 6:00 PM |
| Return to the repaired Mansion | Day 12, 6:30 PM |
| Complete the return briefing | Day 12, 7:15 PM |
| Leave for Cartel Palace | Day 12, 8:30 PM |
| Extract from Cartel Palace | Day 12, 11:00 PM |
| Special Meeting pickup | Day 13, 5:55 PM |
| Arrive at the Initiation | Day 13, 7:00 PM |
| Complete the ceremony | Day 13, 8:50 PM |

The deliberate jump is the exact-once `RETURN_TO_MANSION` handoff after Enola:
it floors the repaired-house return at Day 12, 6:30 PM without rewinding a
later save. The Palace keeps its 8:30 PM night approach. Beat 27 then waits for
the following evening: the car collects Tony at 5:55 PM, Seff's stated
forty-two-minute ride plus twenty-three minutes at the spur and on the trail
lands the Initiation at its 7:00 PM anchor exactly. Schema v23 floors saves
that had already consumed one of those markers; it never replays a marker,
invents progress, or winds a later clock back.

Schema v25 also carries forward two corrected clock promises without replaying
their exact-once events. Completed Motel saves still earlier than Day 5 06:30
are floored to that daylight return. Mansion saves are adjusted only when they
match the exact v24 clocks produced by the retired eight-hour guest-room rest:
04:10 before the siege or 06:10 immediately after it. A later clock is never
rewound.

Schema v26 adds bounded final `shotsFired` and `peopleKilled` counters to THE
TAKE's durable mission record. The safehouse debrief saves them before Lou's
phone rings, so a reload during the ring or after answering cannot zero the
campaign-wide Prospect's Record or fold it twice. Version 25 saves migrate both
new counters to zero because their old summaries cannot prove missed rounds or
officer kills; already-recorded aggregate statistics are preserved.

The workbook's **Day 5 night** label for Mansion Under Siege is a narrative
label for the overnight begun on the day the case is delivered. The guest-room
sleep crosses midnight, so the campaign's calendar clock correctly begins Siege
on the following morning at 2:10 AM, inside the story bible's 2–3 AM window.

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

The register is the SCARFACE last stand. Read `docs/TONE-AND-PARODY.md` before
writing a line of it — the reference is the scene, not a quote or a wink at the
audience, and nobody in the house should notice they are in one.

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

### 3 · The retaliation — SQUATCHOLA GAY

After the attack, **Lou expedites the attack plan**, and that plan is the
SQUATCHOLA GAY mission — which is already built. The bomber, the crew, the
target city, the Fat Squatch. It currently sits in the campaign with no
argument for why anybody would do it. This gives it one: they came to his
house in the night.

The post-siege phone threat establishes who attacked. Lou then names the route
package recovered from the attackers' command car; the Family reads it as the
location of the A-Team desert compound and gives it to Sasole. That reachable
line is the bombing order's source. The interpretation is wrong, which is why
the later instrument payoff matters. Silver Pines no longer spoils the bomber
or the Initiation before either is actionable.

### 4 · The talk going in

Owner: *"i'll want to plan the voice lines for this because the talk going
into this one is going to be epic."*

The counterstrike setup is authored data in the Siege aftermath: original
A-Team phone confrontation, recovered route package, then the Sasole handoff.
It is played straight and does not reuse the film monologue. The flight itself
never points out the wrong-city discrepancy.

### 5 · The wrong city — back at the mansion, clean

The player returns to the mansion in the `repaired` state: **the canonical
house with a story flag, never the siege damage written back.** That is a
design rule, not an implementation detail — the wreckage was a mission
overlay and it comes off.

Lou tells him three things, in this order and played as a scene rather than a
HUD toast:

1. They bombed the **wrong city**. The intended cartel target is untouched.
2. While the operation was running, **Sauce was taken**.
3. A separate trace points to an **unnamed A-Team leadership estate**. There is
   going to be a final infiltration. Mark's name is withheld until his fight.

Grim absurdity is the register. Six thousand pounds of Fat Squatch went into
somebody else's town and the room has to sit with that before it moves on.

### 6 · The cartel palace — the actual final mission

Presented as a rescue. It is not one.

**The truth the player discovers on site:** Sauce was never a prisoner. He
moves freely, he is armed, he is treated as a guest, and he helped set the
whole thing up — the attack, the story, the operation. The complete evidence
trail proves the inside leak continued after Willy's death: Willy's earlier
strip leak still stands, while Sauce is the separate Short Bus mole behind the
Silver Case/mansion betrayal and had help inside the organization. The rescue
becomes an elimination. **Mark is the cartel boss.** Both of them are targets
by the end.

Staged, not announced: documents, radio chatter, photographs, guard
conversation, his own belongings, security footage, and finally Sauce sitting
at Mark's table with a weapon on it. The office route addendum is the hard
datum: Sauce's consultant number signs both the Silver Case delivery to Lou's
mansion at 17:55 and the 02:10 next-morning breach window. SHORT BUS names the
operation, and a redacted active-prospect countersign proves Sauce still had
help inside the Family. Do not spend the
twist at the gate or name Mark before the dining-room reveal.

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
Willy's earlier strip leak still stands, while Sauce's separate betrayal and
unidentified inside help force the nuclear option, and every remaining
prospect kneels. Prospect Three, Four, Five, and Kittenboss are executed in
Tony's view. Gratin then aims at Tony; Big Uncle Lou stops him with "Stop. This
one is good." Tony alone is taken to the cabin because the family is at quota
and only one place remains.

### What already exists and can be reused

The mansion, inside and out, staffed and dressed. The weapon system and the
basement armory. The shared combat framework — `core/combat/*` plus
`core/weapons/*` — which the siege now drives and the palace will drive
after it, with `FACTIONS.CARTEL` already in the matrix. SQUATCHOLA GAY
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
2. **The current Initiation is not a campaign-complete state.** The Special
   Meeting routes Tony into the frozen Initiation scene after the Cartel Palace, but
   that scene does not claim the
   campaign, record completion, or expose an outbound edge. The focused route
   contract therefore ends with Initiation `in_progress`, not `complete`.
3. **The finale has two authored shapes.** This timeline places an oath and
   callback ceremony at the Bada Bing, while `docs/STORY.md` preserves the
   Pines quiz, execution, gauntlet, roar, timber, and anointing. Reconcile those
   designs after the required playtest before wiring the final checkpoint.
4. **Silver Pines needs a human pacing and performance pass.** Its campaign,
   inventory, preview, Pages, scorecard, and three-hole route are now canonical.
   The owner still needs to judge shot feel, walk/ride pacing, camera comfort,
   dialogue repetition, and the handoff into heist preparation in one continuous
   Day Six playthrough.
