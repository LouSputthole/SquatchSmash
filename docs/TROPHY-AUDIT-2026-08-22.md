# Trophy and collectible audit — 2026-08-22

The game's own prose promises a lot of accumulated stuff: "cash, expensive
clothes, club memorabilia, weapons, photographs, mission souvenirs" (Day
Four's apartment description, `README.md`), an end-of-mission "trophy"
system on multiple scenes, and a shelf that's supposed to fill up as the
campaign goes. This audit checks what's actually a rendered 3D object the
player can walk up to, versus a name, a flag, or a line of dialogue.

Method: grepped `trophy`, `trophies`, `souvenir`, `memorabilia`, `collectible`
across `src/` and read every hit in context.

## What's real

**One (1) genuinely mission-outcome-earned, physically-built trophy exists
in the entire game:** `tammyDashboardMug`.

- Earned by: completing Beef Run (`state.missions.airstrip_smuggling.status
  === 'complete'`).
- Built: `src/world/dressing.js:473`, a real modeled mug prop.
- Wired: `persistentDressingForCampaign()` in the same file adds it to the
  apartment's shown set; `src/world/apartment.js:1210` places it at a fixed
  desk position.
- This is the correct pattern — campaign truth in, a real object out, no
  local state kept anywhere else — and it's the template everything below
  should follow.

Separately, `DAY_DRESSING` (same file) is a **calendar-gated** prop table —
things like `cashStacks`, `suitBag`, `gunCase`, `jerkyHaul`, `silverMatches`,
`laundryHeap` appear automatically once a story chapter is reached. These are
real, well-built props, and the apartment's accumulating-den effect on Day
Four genuinely works — but they aren't earned by playing well or making a
choice, only by having reached that day. They're set dressing, not trophies.

## What's promised and not built

**Five of Beef Run's own six "earned unlocks" are computed, named, and
narrated — and then go nowhere.**

`src/beefrun/mission.js:2349` (`earnedUnlocks()`) returns up to six tokens
based on real performance:

| Token | Condition | Built anywhere? |
| --- | --- | --- |
| `prospectFlightJacket` | always, on completion | **No.** Zero hits in `dressing.js` or `apartment.js`. |
| `brushrunnerAccess` | always, on completion | **No.** |
| `tammyDashboardMug` | always, on completion | **Yes** — see above. |
| `stoveBusinessCard` | 3+ guns delivered | **No.** |
| `silverbackOrnament` | cargo damage < 25% and 18+ packages delivered | **No.** |
| `elHuesoFreeFlight` | mountain landing quality > 0.5 | **No.** |

These tokens are real — they're computed from genuine session facts (the
function's own comment: "The end card used to list six of these
unconditionally out of a literal array, and none of them reached the save.
Each one is now a fact about something that happened"). They reach the save.
They just never reach the apartment. The end card names them; the flat
never shows them.

**PROJECT SILENT SQUATCH's trophy doesn't exist as an object at all.**

- `src/core/silent-squatch-story.js:24` describes the mission's reward list
  in a comment: *"conspiracy board · a new apartment trophy, a miniature
  glowing Squatchanium container."*
- `night.trophyAwarded = true` is set on completion (same file, line 142)
  and threaded everywhere a completion fact needs to travel: campaign state
  (`src/core/campaign.js`, five separate locations), the finale highlights
  reel (`src/core/campaign-finale.js:97-98`: *"PROJECT SILENT SQUATCH left a
  trophy in the flat"*), and the scene-skip completion check
  (`src/core/campaign-scene-skip.js:232`).
- `persistentDressingForCampaign()` — the one function that actually decides
  what's on the apartment shelf — **never reads `trophyAwarded` and never
  checks the Silent Squatch mission at all.** Grepped for it directly; zero
  hits.
- The only `squatchanium-container` object in the codebase
  (`src/mansion/scenes/SilentSquatch.js:4221`) is the full-size mission prop
  inside the mansion lab scene, not a miniature apartment trophy.

So the finale screen is currently capable of telling the player *"PROJECT
SILENT SQUATCH left a trophy in the flat"* while the flat has never shown
one. That's the single biggest gap here — a completion flag your own
completion-highlights code trusts, connected to nothing downstream.

**Golf has no trophy hook at all, but the data to build one is already
sitting in the save.** `state.missions.silver_pines.toPar` (relative-to-par
across the round) and `.ace` (hole-in-one) are both real, already-persisted
fields — `src/core/campaign.js:1327-1340`. Nothing reads them for a reward;
see the new one below.

## What's decorative, not a player trophy (correctly so — no action needed)

- `src/initiation/cabin/interior.js`'s `buildTrophies()` — literal hunting
  trophies (antlers, a plaque, a skull) as cabin set dressing. Not
  player-earned, not meant to be.
- `src/cartel-palace/conversations.js:236` — a line of dialogue using
  "trophy" as a word, not a mechanic.
- `src/heist/script.js`'s "no souvenirs" lines — a heist *rule* (don't take
  personal items off a body), the opposite of a collectible.
- `MansionGrounds.js`'s `TROPHY_HALL` — a room name, not a reward system.

## What this pass adds

1. **A real golf trophy**, on the `tammyDashboardMug` pattern: earned at
   `toPar <= 0` (even par or better) across the three holes, a real modeled
   prop, wired through `persistentDressingForCampaign`. See
   `src/world/dressing.js`'s `golfTrophy` builder and `src/golf/mission.js`.
2. **The Trophy Room** (`trophyroom.html`) — a dev-only showcase scene
   listing every trophy this audit found, each labeled with its source
   mission, its earn condition, and whether it's a real prop or a stub
   standing in for one that was promised and never built. Walk up to a stub
   and the label says exactly that, so nothing here is silently presented as
   finished. Not part of the campaign; a review tool, same shape as
   `combatlab.html` / `roster.html` / `wardrobe.html`.

## Recommended follow-up (not done in this pass)

- Build the five missing Beef Run props and wire them into
  `persistentDressingForCampaign` the same way `tammyDashboardMug` is —
  `prospectFlightJacket` and `brushrunnerAccess` are the two guaranteed
  ones, so they're the highest-leverage next build.
- Build the Silent Squatch miniature Squatchanium trophy and read
  `trophyAwarded` in `persistentDressingForCampaign` — this is the one item
  on this list where the game's own completion text already promises a
  specific object exists, so leaving it unbuilt is the most visible gap.
- Once more real trophies exist, consider whether the apartment needs a
  dedicated "shelf" surface (per the comment at `campaign.js:1416`, *"the
  shelf the trophy stands on"* — singular today, but the language already
  assumes plural) rather than scattering each new trophy at its own
  hand-placed desk/bookshelf coordinate.
