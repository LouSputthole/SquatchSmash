# Squatch Life — apartment design archive

> **Historical design notes, not the production source of truth.** This file
> preserves the original apartment-only design and useful interaction details.
> The campaign has since expanded into the apartment-led mission spine. Use
> `docs/CONSOLIDATION-HANDOFF.md` for implementation state and
> `docs/CHARACTER-ALIGNMENT.md` for locked canon. When this archive conflicts
> with those documents or the verified runtime, this archive is superseded.

---

## Original apartment-only premise — superseded

You wake up in your flat on **Tuesday morning at 6:04 AM**. You did not set an
alarm.

There is a **Squatch meeting on Wednesday night** — the whole roster, 7 PM.
It is not a big deal. It is also the only thing on. Between now and then there
is a flat, a fridge, a PC, and about thirty-seven hours to fill.

The game is those thirty-seven hours. You can be ready and go, or you can not
be ready, or you can be so comprehensively not ready that Wednesday happens
without you. Everything that makes leaving hard is also the fun part, which is
the whole joke.

**No quest log.** The front door is the only thing that tells you what you have
forgotten, and it tells you one thing at a time, as an excuse rather than an
objective.

The current game instead starts on Day One at 6:04 AM, exposes a clear
four-chore objective, waits for Big Uncle Lou's call, and routes into the
multi-mission campaign documented in the consolidation handoff.

---

## The clock

Campaign time advances through completed tasks and mission beats, not real
waiting. This supersedes the original fifteen-real-minute day.

- Wake: Day 1, 06:04.
- First-time apartment chores add authored durations.
- Answered story calls add a small authored duration.
- Travel can advance to a fixed minimum arrival time; the first Bing remains
  Day 1, 23:41.
- Mission checkpoints and returns add their own durations.
- Sleep creates deliberate day/chapter checkpoints.
- Idle exploration, pausing, dialogue reading speed, and computer play do not
  move campaign time.

Every beat has a stable ID in `story.timeEvents`, so repeating a completed
interaction cannot advance the clock twice. Calendar day is presentation data;
story chapter gates calls and missions. That distinction allows a late Day One
mission to cross midnight without prematurely firing Day Two events.

The user permits additional days before the final meeting. The later mission
schedule should choose whatever number of sleep/checkpoint breaks makes the
story breathe, rather than compressing the campaign into a fixed real-time
deadline.

---

## The Day One gates

The campaign door uses four persistent morning requirements and Big Uncle
Lou's answered call. It lists every missing chore in a single clear response;
there is no invisible wall and no requirement to guess which joke interaction
counts.

| Gate | Campaign state | Where it lives | Status |
|---|---|---|---|
| **Eat** | `activities.eaten` | pizza or cooked eggs | ✅ |
| **Shower** | `activities.showered` | the shower | ✅ |
| **Poop** | `activities.pooped` | the toilet timing interaction | ✅ |
| **Change clothes** | `activities.changedClothes` | the nightstand drawer | ✅ |
| **Answer Lou** | `events.lou_first_call = answered` | physical nightstand phone | ✅ |

Email is optional characterization. Counter-Squatch, peeing, sobriety, empty
hands, and every goof-around interaction remain available but do not silently
block the first mission. Each completed chore and answered call records its
authored time event once. When all four chores are complete and Lou has
authorized the job, the door routes to Bada Bing Scene One.

---

## What you do

### Get a game in with the boys — optional

**No rework.** Getting a game in means getting smoked by a cheater for a
handful of rounds, which is exactly what Counter-Squatch already does. It is
available through the PC but no longer blocks Lou's first mission.

### Shower ✅
Aim at the bath. You step in, it runs for nine seconds, steam comes off the
head, and you come out a person who has had a shower.

### Change ✅
Hold <kbd>E</kbd> on the nightstand drawer. A clean shirt. That is the whole
interaction and it does not need to be more.

### Eat ✅
Take the eggs from the fridge, crack them into the pan on the hob, wait eleven
seconds, eat them standing at the counter out of the pan. 97.8 has been telling
you to eat those pasture raised eggs folks all morning, so the callback lands
on its own.

### Piss and shit ✅
Both already existed, including the bit where four cigarettes start a
countdown. Pooping is the required Day One activity; peeing remains optional.

---

## The optional stuff

This is the antagonist. None of it is required and all of it is available.

| | Effect | Status |
|---|---|---|
| **Beer** ×6 | First two steady your hands at the PC. After that, the floor has opinions. | ✅ |
| **Jack AND Daniels** | Twice a beer, half the time. | ✅ |
| **Cigarettes** ×17 | Four of them start the other countdown. | ✅ |
| **Zyns** ×15 | Ninety real seconds of steadier hands. | ✅ |
| **The bong** | Everything slows down. See below. | ✅ |
| **The mushrooms** | Everything bends. See below. | ✅ |

**Neither of these advances campaign time.** They are optional because they
change how the apartment feels, not because they are mission gates.

### Weed — slower

Hold <kbd>E</kbd> on the bong. One bowl runs about three and a half minutes and
they stack.

- the world itself runs at up to 70% speed — smoke, the room, the PC
- you walk up to a third slower
- **the camera lags the mouse**: your input is banked and bled out over the
  following frames rather than tracked, which is the part that actually feels
  like something
- the room warms and the corners soften

The authored campaign clock is deliberately exempt. A task or mission advances
the same amount whether or not you have had a bowl.

### Mushrooms — bent

Hold <kbd>E</kbd> on the bag. Nothing happens for ninety-five seconds, which
is the joke, and then it arrives over the next minute.

- the hue rotates continuously, one way, and **unwinds back to normal** as it
  fades, so you are not left in a permanently green flat
- saturation climbs to nearly double
- the whole frame breathes in and out, slowly
- the camera rolls on a wider, slower rhythm than the drink does — that
  difference is what stops it reading as just being drunker

Roughly a quarter of an hour end to end: ninety-five seconds up, a peak, then
a long fade. Both layer on top of the drink rather than replacing it.

---

## Historical apartment-only endings — superseded

These were prototype outcomes for leaving the apartment for a Wednesday
meeting. They are preserved as writing reference only; they are not current
campaign routes or failure states.

Chosen at the moment you step out, from the state you are in.

| | |
|---|---|
| **clean** | Showered, fed, dressed, out at ten to seven. |
| **merry** | Two ahead of everyone before you arrived. |
| **stoned** | It took a while to get down the stairs. |
| **tripping** | The chairs are stacked in a way that means something. |
| **late** | You got the last chair, the one with the wobble. |
| **missed** | Eight o'clock and the flat is exactly as it was on Tuesday. |

You never actually fail. Miss it and the card is still on the corkboard, and
there is another one next Wednesday.

And if you never read the card, there is no meeting. The door stays a door and
you can potter about in there indefinitely, which is its own ending.

---

## Historical meeting-discovery ideas — superseded

These discovery hooks belong to the original Wednesday-meeting prototype.
Current progression comes from authored calls, objectives, and mission state.

Three ways, none of them a pop-up:

- **The corkboard** ✅ — a card pinned there a fortnight ago:
  *WED 7PM · SQUATCH MEETING · BOOSKIBRO DRIVING · BRING NOTHING.*
- **The second monitor** ✅ — Booskibro's messages arriving on the in-game clock,
  four of them mentioning Wednesday. The monitor shows an unread count you can
  see from across the room and ignore all game. Reading it is holding [E] on
  the panel, not walking past it. The last one is just `ok`.
- **The radio** ✅ — 97.8 reads a community notice every eleven segments:
  Wednesday, seven, come showered and fed. Hearing it is knowing it, so
  leaving the set on is enough on its own.

---

## The radio ✅

The current radio is one combined local station. It interleaves talk blocks,
community notices, commercials, and the roster's local music instead of making
the player tune between separate talk and music frequencies.

| Dial | Station | What |
|---|---|---|
| **97.8** | THE SQUATCH | Scheduled talk, the station commercial, notices, and local tracks from `assets/music/`. |

Every written line and its speaker mapping lives in `src/core/stations.js`.
Generated recordings are preferred when present; the radio retains text and
audio fallbacks when a cue or local track is unavailable.

---

## Audio

The repository now contains a large recorded/generated cue library as well as
procedural fallbacks. Counts change as scenes and dialogue are integrated, so
do not rely on the original apartment-only totals below. Use
`assets/sfx/manifest.json`, `npm run check`, and `npm run audio:todo` for the
current inventory.

### Two kinds of cue ✅

| | | endpoint |
|---|---|---|
| **Sound effects** | `{ "prompt": "..." }` | `/v1/sound-generation` |
| **Spoken lines** | `{ "say": "..." }` | `/v1/text-to-speech/{voice_id}` |

Sound-generation has no concept of a voice, which is why the split exists.

### One voice for the character ✅

Every spoken line names a voice, and every voice resolves through the
`voices` block at the top of `assets/sfx/manifest.json`. That block is the
only place a voice id appears in the whole project — one id, one voice, every
line he says. Change it there and the entire performance changes together.

```bash
npm run sfx:voices   # list the voices on your account
# paste an id into assets/sfx/manifest.json -> voices.player.id
npm run sfx:vo       # generate just the spoken lines
npm run sfx          # everything
```

Missing voice IDs or cues are reported by the tooling without invalidating
already generated audio.

### Original apartment voice plan — historical reference

| Moment | Lines | |
|---|---|---|
| Waking, getting up, lying down, sleeping | 9 | ✅ |
| Opening a beer, first two, three or more, the last one | 8 | ✅ |
| Whiskey | 3 | ✅ |
| Lighting a cigarette, dragging, the last one | 5 | ✅ |
| Zyn | 2 | ✅ |
| Peeing, the urge, the aftermath | 6 | ✅ |
| Farting | 3 | ✅ |
| Sitting at the PC | 2 | ✅ |
| Muttering to himself while idle | 5 | ✅ |
| Hearing one of the band's own records | 2 | ✅ |
| The fridge, the radio commercial | 4 | ✅ |
| Counter-Squatch deaths (early, late) and the one kill | 7 | ✅ |
| Squatch Smash | 2 | ✅ |
| The bong, the mushrooms | 4 | ✅ |
| Shower, eating, getting dressed | 5 | ✅ |
| **The door's eight excuses, in his own voice** | 10 | ✅ |

The door excuses being *spoken by him* rather than narrated is the bit worth
protecting. It is not a quest log telling you what to do; it is a man standing
at his own front door talking himself out of leaving.

The picker never plays the same line twice running, never overlaps two lines,
and does nothing at all when a cue has not been generated — there is no
procedural fallback for the voice on purpose, because a synthesised one would
be worse than silence.

---

## Historical apartment build order — complete and superseded

Do not resume work from this list. Current priorities begin with selective Beef
Run integration in `docs/CONSOLIDATION-HANDOFF.md`.

1. ~~**Loading and diagnostics**~~ ✅ — WebGL failures, module failures and
   silent hangs all now say what happened, on screen, where somebody without
   a console can read it.
2. **The goal system** — `src/core/goals.js`, the door excuses, the endings.
   Nothing else can be tested until this exists.
3. **The three missing verbs** — shower, change, eat.
4. **The CS rework** — thirteen rounds, the boys, the one kill.
5. **The bong and the mushrooms** — effects, not just props.
6. **The corkboard note and Booskibro's messages.**
7. **Voice acting and ElevenLabs**, whenever the key and the network allow.

---

## Easter eggs ✅

Nothing here is required, signposted, or rewarded. The test for whether
something belongs in this section is simple: if a player never finds it, they
should not be able to tell it was missing.

| | Where | What |
|---|---|---|
| **The catchphrases** ✅ | Any framed photo | Catching a frame under the crosshair is enough — no button. Half the bank is the group's own sayings rather than descriptions of the picture: *let me hear you, let me sing* · *it is all love* · *piping hot*. Once per frame per run, 55% chance, 14-second shared cooldown. |
| **The fluke kill** ✅ | Counter-Squatch | The cheater is on screen for 0.37 seconds before he shoots. You can hit him. Almost nobody will. The scoreboard says `1 kills` afterwards and it is the best thing that happens all day. |
| **The glue** ✅ | Desk, under the crooked frame | Six squeezes, a long groan, and the whole bottle up the wall. Sounds like something else the entire way through and is glue at every point. The wall stays like that. |
| **Booskibro's last message** ✅ | Second monitor, 9 PM | Nineteen messages across Tuesday, and the last one — after all the plans and the arguing — is just `ok`. |
| **The Rerun Hour** ✅ | 97.8, 10 AM–noon | Two hours the station could not fill, filled with this morning's tape. *"That was from this morning. Four hours ago. We are aware."* |
| **Irish and the eggs** ✅ | 97.8, 3–5 PM | Part fifteen of an investigation into whether Big Egg is suppressing the pasture-raised truth. There is string on the whiteboard. |
| **Lou has landed there** ✅ | 97.8, breakfast | *"You cannot land there. I want to be clear that you cannot land there." / "I have landed there."* |
| **The bottle** ✅ | Sideboard | Six pulls of Jack & Daniel's. The label is the real one off the crest, de-checkered and cropped by hand. |
| **Nobody is in the building** ✅ | 97.8, 2–6 AM | Stay up. The overnight tape has been running for eleven years and knows it. |

### Deliberately not rewarded

Sitting on the couch. Lying on the bed without sleeping. Turning the radio off
and standing in the quiet. Farting. Reading the evidence board. Pointing the
flashlight at things. None of these advance anything, and that is the point —
a flat where only the useful actions work is a to-do list with walls.

---

# A Quick Stop at the Bing ✅

The second location, and the first one with anybody else in it.
`bing.html` -> `src/bing/`.

## The premise

Day One, 11:41 PM. You are sat in your own car in a wet lot off the highway
with the engine running, and Lou has something for you in the back office. Get
in, find him, take it, leave. That is all of it.

The club is deliberately much bigger than the errand. It is a hub: a bar that
serves you properly, a table that deals you in, a machine that takes your
money, a store room with a live alarm on the back door, and roughly thirty
people who were here before you turned up and will be here after.

## The rule

**You never lose control because somebody important started talking.** Lou
says his piece while you walk round his office, sit down, open his liquor
cabinet, read his ledger, take the package, put it back, or leave. Every reply
is optional and the conversation lapses if you walk out of the room, the same
way a conversation does. There is no cutscene in the level, including the
ending: the mission finishes when you drive out of the lot yourself.

## The state machine

`lot -> outside -> club -> hallway -> office -> package -> briefed ->
leaving -> lot-return -> done`. It only ever runs forwards, and nothing in the
club can break it — the machine, the table and the bar report *into* it
without being able to move it.

## Lou's patience

Starts when you walk in, stops when you take the package. Nothing fails.

| | |
|---|---|
| 2 minutes | *LOU: You sightseeing?* |
| 5 minutes | *LOU: Back office. Now.* |
| 8 minutes | He sends somebody, who finds you wherever you are. |
| 3 / 6 / 10 hands of blackjack | The same three beats, on a different clock. |

What changes is what he says when you finally get there — and if you hit the
jackpot on the way, he heard it through the wall and opens with that.

## Endings

Four, chosen by what you did about the grey sedan in the lot rather than by
whether you "won":

| | |
|---|---|
| **followed** | You ignored it. It pulls out four cars back. |
| **plate** | You read the plate on the way past. They leave first. |
| **warned** | You told Lou; one of his men is under the canopy when you come out. |
| **rear** | You went out through the store room and down the alley, and the two men whose entire job was to watch you leave did not. |

## Deliberately not rewarded

Sitting in a booth. Tipping the performer. Losing four hundred dollars to a
machine with a duck on it. Reading the graffiti in the men's room, which is
the roster with two names spelled right. Drinking at the bar before seeing a
made man, which does nothing except change his first line to a comment about
it.

## Playtest constraints now enforced

- The open front door has a real visible/collision-clear portal.
- Eighteen vehicle footprints are separated and grounded; car and table exits
  resolve to validated standing positions.
- Walking <kbd>Q</kbd> provides a safe unstuck without competing with seated
  get-up behavior.
- Drinkers are seated, patrols respect colliders, movers update smoothly at
  30 Hz, and nonhero NPC parts do not cast thousands of unnecessary shadows.
- All four adult performer roles use the dedicated female, curvy, non-nude
  bikini presentation.
- Rain is full outside, door-dependent in the vestibule, and quiet/low-passed
  inside. Audio automation changes only when the target mix changes.

## Verification

`npm run verify:bing` plays the whole mission headlessly and asserts the state
machine at every beat — the bouncer, the floor, the machine, the table, the
hallway, Lou, the package, the lot, the ending card. It is the only thing that
catches "the office where nothing happens", which is what every wiring mistake
in here looks like from the inside. Its 46-check structural pass also measures
the portal, vehicles, safe exits, performer contract, NPC cadence/shadows, rain
mix, and runtime errors; `verify:bing-two` repeats the shared-location contract
for Lou's second visit.
