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
structural rather than decorative. Voluntary sleep should advance to the next
**07:00** rather than a flat 12 hours, so one sleep gets you from Tuesday night
to Wednesday morning. 🔨

**Miss it and the day rolls over.** There is another meeting next Wednesday.
The game does not end; it just notes what happened. This is warmer than a hard
fail and fits the tone better.

---

## The gates

Five things stand between you and the door. Each is revealed only when you try
to leave without it.

| Gate | State | Where it lives | Status |
|---|---|---|---|
| **Piss** | `bladder` below 0.35 | bathroom, exists | ✅ mechanic / ⬜ gate |
| **Shit** | `bowel` at 0 | toilet, exists | ✅ mechanic / ⬜ gate |
| **Shower** | `showered` | the bath, currently does nothing | ⬜ |
| **Dressed** | `dressed` | laundry pile / nightstand drawer | ⬜ |
| **Fed** | `fed` | the eggs, the cooktop | ⬜ |
| **A game with the boys** | five deaths in Counter-Squatch | the PC | ⬜ gate only |
| **Sober enough** | `drunk.level` under 0.45 | everywhere | ✅ mechanic / ⬜ gate |

Sober-enough is checked **at the door**, not banked — you can drink at 10 AM
and be fine by 7 PM. The other six, once done, stay done.

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

### Shower ⬜
The bath and shower riser are modelled and inert. Water, steam, the noise, and
a `showered` flag. The single biggest sensory upgrade left in the flat.

### Change ⬜
Clean shirt out of the nightstand drawer, or off the laundry pile. First-person
so it is abstract, but "you are wearing what you slept in" is a good excuse and
the drawer is already modelled.

### Eat ⬜
The pasture-raised eggs are in the fridge, the cooktop is right there, and 97.8
has been telling you to eat those pasture raised eggs folks all morning. Pan,
two eggs, a wait, a plate. The callback lands on its own.

### Piss and shit ✅
Both already built, including the bit where four cigarettes start a countdown.
They just need wiring to the gate.

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

## Endings

Checked at the door, at 19:00 Wednesday.

1. **Ready, and on time.** You go. The good one.
2. **Ready, but you took the shrooms.** You go. You should not have gone.
3. **You leave holding a beer.** The door lets you. That is its own ending.
4. **Too drunk at 7.** You get as far as the corridor.
5. **Asleep at 7.** You wake at 07:00 Thursday. The note is still on the
   corkboard. There is another one next Wednesday.
6. **You never found out there was a meeting.** You can play forever. The
   narrator eventually stops mentioning it.

---

## How you find out

Three ways, none of them a pop-up:

- **The corkboard**, which is already on the wall doing nothing. A pinned card:
  *WED 7PM · SQUATCH MEETING · BOOSKI DRIVING.*
- **The second monitor.** Booski's messages arrive as the clock advances. You
  can read them from across the room and keep ignoring them. The last one is
  just `ok`.
- **The radio.** 97.8 reads community notices. Once, quietly, between shows.

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

### Where he speaks ✅ (wired) / ⬜ (written, not wired)

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
| The fridge, the radio commercial | 4 | ⬜ |
| Counter-Squatch deaths (early, late) and the one kill | 7 | ⬜ needs the CS rework |
| Squatch Smash | 2 | ⬜ |
| The bong, the mushrooms | 4 | ⬜ needs the effects |
| Shower, eating, getting dressed | 5 | ⬜ needs the verbs |
| **The door's eight excuses, in his own voice** | 10 | ⬜ needs the goal system |

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
