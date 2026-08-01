# Campaign timeline — the owner's structure (updated 2026-08-01)

The owner's authoritative four-day shape. Where this document and the code
disagree, this document is the intent and the code is the current state; every
divergence is listed at the bottom rather than silently resolved.

The Day-3 informant hit now exists as **NO WAKE** and is part of the connected
campaign. The Day-4 heist still **does not exist and must not be built** until
the owner says so. The Initiation is WIP and frozen until the owner has
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
| 2 | Wake 7:00 AM, answer Booskibro | Beef Run → apartment, answer Big Uncle Lou → Bada Bing two → Jerky Motel | Return home 4:30 AM and sleep |
| 3 | Wake noon, answer Big Uncle Lou's vague harbor call | NO WAKE → apartment, answer Margo → Front and Center | Return home and sleep |
| 4 | Margo's morning-after beat, answer Booskibro | Initiation reference | Terminal WIP: mission remains `in_progress` |

Every external mission owns a registered scene/spawn and either returns to the
apartment or hands directly to the next mission. The save survives reloads at
each seam; the current final gap is an approved Initiation completion event and
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

**Bada Bing two.** A victory lap that becomes another assignment. People
recognise him; the bartender has new lines; performers and dealers comment on
the campaign; Lou may cover his drinks; side conversations hint that somebody
is leaking information; **Willy appears and is slightly nervous** without
giving the twist away. This is the informant plot's planting scene.

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
phone rings: Lou says the big job is today, and the player prepares clothing,
weapons and equipment. **The flat now shows his rise**: cash, expensive
clothes, club memorabilia, weapons, photographs, mission souvenirs — the den of
a newly minted Squatch criminal who has accumulated money, enemies, souvenirs,
and one extremely questionable laundry basket.

**The heist — NOT BUILT, DO NOT BUILD.** Crew: the Prospect, Numbskull,
Rippinflow, the Shubenator, DeathMegatron, Snow. The mechanical climax
combining everything taught: driving, instructions, weapons, crowd control,
timed objectives, carrying loot, crew coordination, police response, escape
routing, injuries, decisions under pressure. It does not end at the escape —
it decompresses: vehicle swap, safehouse, counting money, arguing over
mistakes, checking who survived, and Lou saying be at the Bada Bing tonight.

**Initiation night — WIP, DO NOT TOUCH.** The ceremonial payoff at the Bada
Bing, not another action sequence: old faces return, the Prospect is praised
for specific campaign actions, Lou explains what membership means, the oath,
formal acceptance, and "Prospect" replaced by his chosen name or Squatch
title. Let the player breathe, talk to everyone, hear callbacks, drink. Final
image: Lou raises a glass, the family cheers, the camera pulls back from the
club, a television quietly reports the search for the heist crew, credits.

## Rhythm

Day 1 introduction and first blood · Day 2 trust, competence, expanding work ·
Day 3 betrayal, darkness, then glamorous reward · Day 4 personal payoff, the
heist, formal acceptance. The structural keystone is putting the informant
killing directly before Front and Center.

**The apartment must visibly evolve after every chapter.**

## Divergences between this document and the build (2026-08-01)

1. **Day 4 routing.** The doc runs the heist before the Initiation. The heist
   does not exist, so the build routes Day 4 as Booskibro's call → the
   Initiation.
2. **Bing scene two recognition beats** (bartender's new lines, dealer and
   performer campaign comments, Lou covering drinks, informant hints, a nervous
   Willy) are only partly implemented — the Family floor and its talk exist,
   the campaign-specific second-visit variants largely do not.
3. The Front and Center closing **cutscene of the apartment with Margo** is not
   built; Day 4 opens with her in the bed instead.
4. **The current Initiation is not a campaign-complete state.** The apartment
   can route Tony into the frozen Pines scene, but that scene does not claim the
   campaign, record completion, or expose an outbound edge. The focused route
   contract therefore ends with Initiation `in_progress`, not `complete`.
5. **The finale has two authored shapes.** This timeline places an oath and
   callback ceremony at the Bada Bing, while `docs/STORY.md` preserves the
   Pines quiz, execution, gauntlet, roar, timber, and anointing. Reconcile those
   designs after the required playtest before wiring the final checkpoint.
