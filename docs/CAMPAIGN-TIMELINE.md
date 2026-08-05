# Campaign timeline — current production flow (updated 2026-08-01)

The owner's authoritative four-day shape and the connected route implemented
by campaign schema v9. NO WAKE, the Billy HotDog incident and graveyard, Front
and Center, Silver Pines, and the Day Four heist are all built and connected.
The Initiation is still a terminal WIP and remains frozen until the owner has
playtested it.

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

| Day | Apartment gate | Mission route | Return / chapter change |
|---|---|---|---|
| 1 | Eat, shower, poop, change clothes, answer Big Uncle Lou | Bada Bing one → apartment whiskey nerve-settle → Squatchfather | Return home and sleep |
| 2 | Wake 7:00 AM, answer Booskibro | Beef Run → apartment, answer Big Uncle Lou → Bada Bing two / HotDog incident → Squatch Graveyard → Jerky Motel | Return home 4:30 AM and sleep |
| 3 | Wake noon, answer Big Uncle Lou's vague harbor call | NO WAKE → apartment, answer Margo → Front and Center | Return home and sleep |
| 4 | Margo's morning-after beat, answer Big Uncle Lou's Silver Pines call | Silver Pines → apartment, answer Lou's heist call and collect seven loadout pieces → THE TAKE → apartment cleanup → Initiation reference | Terminal WIP: Initiation remains `in_progress` |

Every external mission owns a registered scene/spawn and either returns to the
apartment or hands directly to the next mission. The save survives reloads at
each seam; the final campaign gap is an approved Initiation completion event and
outbound ending, not a missing route into the final day.

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
Booski, Willy and the Prospect, open water, conversation souring, Willy's
betrayal revealed, the others prepare, they shoot him, body disposal, and a
silent ride back. The emotional low point — the restaurant's dead were
enemies; Willy was one of them. Willy's permanent large-belly model is shared
with his earlier appearance so his body does not change between scenes.

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
mistakes, checking who survived, and the invitation to tonight. Its briefing,
bank, vault, street, garage, vehicle-swap, driving, loot, injuries, settlement,
and retry checkpoints persist. The safehouse returns Tony home, where washing,
changing, and hiding the gear are physical door requirements.

**Initiation night — WIP, DO NOT TOUCH.** The ceremonial payoff at the Bada
Bing, not another action sequence: old faces return, the Prospect is praised
for specific campaign actions, Lou explains what membership means, the oath,
formal acceptance, and "Prospect" replaced by his chosen name or Squatch
title. Let the player breathe, talk to everyone, hear callbacks, drink. Final
image: Lou raises a glass, the family cheers, the camera pulls back from the
club, a television quietly reports the search for the heist crew, credits.

## THE MANSION ARC — planned 2026-08-05, not built

Owner's direction. This is design, not a build order: nothing below exists
yet, and the point of writing it down now is that PROJECT SILENT SQUATCH is
already in the game and currently just ends.

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

### 2 · The cartel attack — a new mission

He wakes in the middle of the night. **The attack is already happening.**

The register is the SCARFACE parody: "say hello to my little friend". Read
`docs/TONE-AND-PARODY.md` before writing a line of it — the reference is the
scene, not a wink at the audience, and nobody in the house should notice they
are in one.

**The design problem, named by the owner and worth solving before anything is
modelled: the player needs a REASON to go upstairs, so the fight happens from
the balcony.** Waking in the basement and being told to go up is not a reason.
Candidates, none chosen: the armory is down there and the guns are not; Lou is
up there and the radio has stopped answering; the balcony is the only firing
position that covers the drive; the basement stair is the only way out and it
goes up. Whatever it is, it has to be something the player works out rather
than something an objective tells him.

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

### What already exists and can be reused

The mansion, inside and out, staffed and dressed. The weapon system and the
basement armory. The Enola Squatch mission entire. The campaign save, the
checkpoint machinery, and the scene-to-scene navigation. `src/mansion/cast.js`
for placing people. This arc is mostly staging and writing, not new systems —
the one genuinely new thing is the damaged/burning state of the house.

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
