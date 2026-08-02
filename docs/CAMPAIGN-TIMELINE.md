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
