# Squatch Life

## The Wednesday Night Squatch Meeting

The working spec. Everything below is either built (✅), being built (🔨), or
agreed but not started (⬜). This file is the source of truth for what the game
is; if the code and this file disagree, one of them is a bug.

---

## The premise

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

---

## The clock

A full day is **15 real minutes** — the clock already runs at that rate. ✅

| | in-game | real time from wake |
|---|---|---|
| Wake up | Tue 06:04 | 0:00 |
| Tuesday evening | Tue 19:00 | ~8 min |
| Sleep → Wednesday | Wed 07:00 | ~8 min (skipped) |
| **The meeting** | **Wed 19:00** | ~16 min |

Sleeping in the bed is how you skip the dead hours, which makes the bed
structural rather than decorative. Voluntary sleep lands on the next **07:00**;
passing out drunk is still a flat twelve hours, wherever that leaves you. ✅

Measured: **2216 in-game minutes from waking to the meeting — 23.1 real
minutes**, or about eight if you sleep Tuesday night away.

**Miss it and the day rolls over.** There is another meeting next Wednesday.
The game does not end; it just notes what happened. This is warmer than a hard
fail and fits the tone better.

---

## The gates

Five things stand between you and the door. Each is revealed only when you try
to leave without it.

| Gate | State | Where it lives | Status |
|---|---|---|---|
| **Shower** | `showered` | the bath | ✅ |
| **Dressed** | `dressed` | the nightstand drawer | ✅ |
| **Fed** | `fed` | the eggs, the pan on the hob | ✅ |
| **A game with the boys** | five deaths in Counter-Squatch | the PC | ✅ |
| **Piss** | `bladder` below 0.35 | bathroom | ✅ |
| **Shit** | `bowel` at 0 | toilet | ✅ |
| **Empty hands** | not holding a drink | anywhere | ✅ |
| **Sober enough** | `drunk.level` under 0.45 | everywhere | ✅ |

Sober-enough and empty-hands are checked **at the door**, not banked — you can
drink at 10 AM and be fine by 7 PM. The other six, once done, stay done:
showering on Tuesday counts on Wednesday.

### The door's excuses

One per attempt, in priority order, so it feels like a person making them:

- *"You have not had a shower. You are aware of this."*
- *"You are wearing what you slept in."*
- *"You have not eaten since yesterday."*
- *"You said you would get a game in with the boys. You have not."*
- *"You need a piss. Ninety minutes, that room, those chairs. Go."*
- *"You are not going anywhere with that in you."*
- *"You are holding a beer."*
- *"You are too drunk to be seen."*

When nothing is left: the door just opens.

---

## What you do

### Get a game in with the boys

**No rework.** Getting a game in means getting smoked by a cheater for a
handful of rounds, which is exactly what Counter-Squatch already does. Play
five rounds, die five times, task complete. The joke does not need an arc.

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
countdown. They are wired to the gate now.

---

## The optional stuff

This is the antagonist. None of it is required and all of it is available.

| | Effect | Status |
|---|---|---|
| **Beer** ×6 | First two steady your hands at the PC. After that, the floor has opinions. | ✅ |
| **Jack AND Daniels** | Twice a beer, half the time. | ✅ |
| **Cigarettes** ×17 | Four of them start the other countdown. | ✅ |
| **Zyns** ×15 | Forty-two minutes of steadier hands. | ✅ |
| **The bong** | Everything slows down. See below. | ✅ |
| **The mushrooms** | Everything bends. See below. | ✅ |

**Neither of these costs you Wednesday.** You can be as high as you like and
still make the meeting. They are in because they change how the flat feels,
and the flat is the game.

### Weed — slower

Hold <kbd>E</kbd> on the bong. One bowl runs about three and a half minutes and
they stack.

- the world itself runs at up to 70% speed — smoke, the room, the PC
- you walk up to a third slower
- **the camera lags the mouse**: your input is banked and bled out over the
  following frames rather than tracked, which is the part that actually feels
  like something
- the room warms and the corners soften

The clock is deliberately exempt. A day is fifteen minutes whether or not you
have had a bowl.

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

## Endings ✅

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

## How you find out

Three ways, none of them a pop-up:

- **The corkboard** ✅ — a card pinned there a fortnight ago:
  *WED 7PM · SQUATCH MEETING · BOOSKI DRIVING · BRING NOTHING.*
- **The second monitor** ✅ — Booski's messages arriving on the in-game clock,
  four of them mentioning Wednesday. The monitor shows an unread count you can
  see from across the room and ignore all game. Reading it is holding [E] on
  the panel, not walking past it. The last one is just `ok`.
- **The radio** ✅ — 97.8 reads a community notice every eleven segments:
  Wednesday, seven, come showered and fed. Hearing it is knowing it, so
  leaving the set on is enough on its own.

---

## The radio ✅

Three stations, tuned by holding <kbd>E</kbd> on the set.

| Dial | Station | What |
|---|---|---|
| **97.8** | THE SQUATCH | Talk. Five shows on a real schedule against the in-game clock, plus the 60-second commercial. |
| **98.8** | UNCLE SQUATCH BEATS | Good Ole Days. |
| **101.7** | KSQCH | Squatch Up · 10 Drunk Cigarettes · BooskiBro · I Ain't Gay. |

**Voice acting is the biggest single upgrade available.** Every line for every
show is written in `src/core/stations.js`; right now you read them while a
filtered murmur plays. Real voices would change the whole flat.

---

## Audio ⚠️

**167 cues, none generated yet.** Everything falls back to the procedural
synth, because:

1. `ELEVENLABS_API_KEY` is not set in the cloud environment, and
2. the environment's network policy denies `api.elevenlabs.io` outright
   (`CONNECT tunnel failed, response 403`).

Fix either by running `npm run sfx` locally with a key, or by allowlisting
`api.elevenlabs.io` and adding the key to the environment so it can be run
from a session.

### Two kinds of cue ✅

| | | endpoint |
|---|---|---|
| **90 sound effects** | `{ "prompt": "..." }` | `/v1/sound-generation` |
| **77 spoken lines** | `{ "say": "..." }` | `/v1/text-to-speech/{voice_id}` |

Sound-generation has no concept of a voice, which is why the split exists.

### One voice for the character ✅

Every spoken line names a voice, and every voice resolves through the
`voices` block at the top of `assets/sfx/manifest.json`. That block is the
only place a voice id appears in the whole project — one id, one voice, every
line he says. Change it there and the entire performance changes together.

```bash
npm run sfx:voices   # list the voices on your account
# paste an id into assets/sfx/manifest.json -> voices.player.id
npm run sfx:vo       # generate just the 77 spoken lines
npm run sfx          # everything
```

Nothing spoken will generate until that id is set, and the tool says so once
rather than failing 77 times against the API.

### Where he speaks — all wired ✅

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

## Build order

1. ~~**Loading and diagnostics**~~ ✅ — WebGL failures, module failures and
   silent hangs all now say what happened, on screen, where somebody without
   a console can read it.
2. **The goal system** — `src/core/goals.js`, the door excuses, the endings.
   Nothing else can be tested until this exists.
3. **The three missing verbs** — shower, change, eat.
4. **The CS rework** — thirteen rounds, the boys, the one kill.
5. **The bong and the mushrooms** — effects, not just props.
6. **The corkboard note and Booski's messages.**
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
| **Booski's last message** ✅ | Second monitor, 9 PM | Nineteen messages across Tuesday, and the last one — after all the plans and the arguing — is just `ok`. |
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
