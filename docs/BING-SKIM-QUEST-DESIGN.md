# The skimmed machine — quest design

Design proposal, 2026-08-22. Not implemented as dialogue yet — this maps the
thread out from what already exists in code to a proposed payoff, for review
and rewrite before anything gets scripted. Follow `docs/TONE-AND-PARODY.md`
once this is written for real: play it straight, no character winks at how
small the crime is.

## What already exists (do not rebuild this — extend it)

The setup is fully built and live in the first Bing visit:

- `src/bing/main.js:1686-1703` — inspecting the slot machine's side panel
  (hold `[E]`, 1 second) finds a second counter wired in behind the
  official one. On success: `mission.flags.secretPanel = true`, a HUD line
  (*"The panel is not screwed down. Behind it: a second counter, wired in
  after the fact, counting something that is not going in the ledger."*),
  and a mission note (*"Somebody is skimming the machine. That is a
  conversation for another night."*).
- `src/bing/main.js:2622` — if the flag is set, the end-of-visit debrief
  with Lou gets one extra line: *"And somebody is skimming that machine. You
  know it, and now Lou is going to know it."* This is the only payoff that
  currently exists, and it's a single sentence with no branch — Lou finds
  out, nothing about it is ever seen or heard from again.
- `src/bing/mission.js` and `src/bing/second-visit.js` **both** independently
  initialize `secretPanel: false` in their flag sets. They do not share
  state — finding the panel on visit one currently has zero effect on visit
  two (the HotDog-incident return). The thread doesn't carry forward at all
  right now; the "conversation for another night" line is a promise the code
  doesn't keep yet.

## Who's skimming — a recommendation, not a decision

**Old Stove.** Not asserted from nothing: `src/bing/family.js:110-118`
places him at *"the short booth by the slot alcove, complaining about the
ice in it"* — the one Family member physically seated next to the machine,
already characterized as a low-grade grumbler about small things. He also
already has an open, unrelated thread (`docs/ENGINE-TRAPS.md`: *"Old Stove's
missing face in the Bing... needs an empirical check"*), so a pass that
touches him for this quest can close that out at the same time.

He's a good pick mechanically as well as narratively: he's ambient roster,
not one of the six with a heist-crew slot or a mansion/siege role, so giving
him a real subplot doesn't compete with anyone whose fate is already spoken
for elsewhere in the campaign. If a different name reads better once this
is in front of dialogue, the panel/flag plumbing below doesn't care who the
answer is — only `family.js`'s casting and the new script lines change.

## Proposed beats

**1. Discovery — Bing One (exists).** No changes. The panel, the flag, the
debrief line all stay exactly as they are.

**2. Carry the flag forward.** `secretPanel` needs to survive from the first
visit's mission state into the second visit's, the same way other
cross-visit facts already do (Willy's absence after NO WAKE is the existing
pattern to copy — a fact set in one mission read as a precondition in
another, via campaign state, not scene-local memory). This is the one real
plumbing change this quest needs before any writing happens.

**3. Bing Two — an optional beat during the party, before the HotDog
incident.** The second visit already has a `partyBeats` set and an "enjoy
the party" objective (`second-visit.js`) — a walk-up-and-talk beat, same
shape as `src/bing/family.js`'s existing one-thing-per-person pattern. If
`secretPanel` is set:

- Find Old Stove at his booth. He's noticed the player noticing, weeks ago,
  and has been waiting to see what happens. He doesn't confess outright —
  he's scared, not stupid — but he says enough that it isn't ambiguous:
  he's covering a debt, or a sick relative, or something the tone doctrine
  wants specific and unglamorous rather than a movie-villain reason.
  Deadpan, not comic — the comedy is that this is happening at a Squatch
  gambling den, not in how Old Stove plays the scene.
- Two player choices, no HUD hint until he's spoken first (per the tone
  doc's `sayThenInstruct` rule):
  - **Tell Lou.** Consequence: Old Stove is gone by the time the player
    next has a reason to be at the Bing (empty booth, someone else has his
    seat, a single unremarked line from another Family member if the
    player asks). Nothing shown on screen — same restraint the game uses
    for Willy's disappearance from the fridge photo.
  - **Say nothing / cover for him.** Old Stove is still there later,
    visibly relieved in one small authored beat, and the player has a
    quiet piece of leverage over a made man that never gets spent unless a
    later pass wants it to.

**4. The physical payoff — the actual reason this belongs in the trophy
conversation.** Whichever way it goes, the player should be able to walk
away holding something:

- **Told Lou:** Lou cuts him in — a small envelope, on the pattern the
  Squatchfather sequence already uses for "the family rewards loyalty."
  Apartment trophy: a **fat envelope of skim cash**, small and specific
  (not just another cash-pile stack — those are chapter dressing, this is
  earned).
  - Condition: `state.missions.bada_bing_two.secretPanel === true &&
    state.missions.bada_bing_two.toldLouAboutSkim === true` (new flag,
    mirrors `louDebriefed`'s existing shape in `second-visit.js`).
- **Covered for him:** Old Stove leaves something at the player's usual
  seat next time — not cash (that would read as buying silence, which
  undercuts the beat), something personal and small: a lighter, a betting
  chit, a photo. Apartment trophy: **Old Stove's lighter**, or similar.
  - Condition: same flag pattern, opposite branch.

Both trophies follow the exact `tammyDashboardMug` template: a real prop in
`src/world/dressing.js`, read by `persistentDressingForCampaign()` off a
real campaign-state fact, no local scene state. Two small builder functions,
not one big one — see the Trophy Room for stand-ins already staged for
these two under `bing.skim.told-lou` and `bing.skim.covered`.

## What this is not

Not a new minigame, not a new UI, not a new interaction system — the panel
inspection, the walk-up conversation shape, and the trophy-shelf pattern all
already exist. This is one flag threaded between two missions and one new
authored conversation with two branches, which is why it's a good first
quest to actually build once the writing is approved.

## Open questions for the owner

1. Confirm or replace Old Stove as the skimmer.
2. Exact reason for the skim (debt / family / something else) — needs to be
   specific, per the tone doctrine's "detail is load-bearing" rule, not left
   vague.
3. Whether "cover for him" should ever pay off again later in the campaign
   (a favor called in), or stay a closed, one-scene beat.
