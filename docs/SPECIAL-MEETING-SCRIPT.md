# THE SPECIAL MEETING — script

The bridge from the Cartel Palace to Initiation Night. Tony comes home, gets a
phone call, and three men he knows come and collect him in a car.

> **Read `docs/TONE-AND-PARODY.md` first.** This scene plays completely
> straight. Nothing in it winks, nothing in it acknowledges what it resembles,
> and nobody in the car is doing a bit. The comedy is that these are
> Sasquatches in a Lincoln. The scene itself is not a comedy scene.

---

## What this scene is for

The player has spent the entire campaign trying to become part of the family.
This is the ten minutes before he gets it. For those ten minutes he should be
thinking: **I have made a catastrophic career decision.**

Three established Squatches rearrange an entire car so that the Prospect ends
up sitting beside the driver. Nobody is rude to him. Nobody threatens him.
Nobody raises their voice. **That is what makes it unbearable.**

## THE RULE — never release the tension

**No character in this scene may say any version of "don't worry, we're not
killing you."** Not directly, not softened, not as a joke, not as a slip. The
scene works because nobody reassures him and nobody explains anything.

The **only** pressure valve in the entire scene is the one the owner wrote:

> NUMBSKULL "Relax." / PROSPECT "That's usually not something you want to hear
> from the guy sitting behind you." / NUMBSKULL "Fair."

One small laugh, then straight back down. **SM-410 exists specifically to put
it straight back down and must not be cut.**

### Lines that must never be written into this scene

Anybody adding, punching up or localising dialogue here — these break it:

- "Relax, nothing's going to happen." / "You're fine." / "You're not in trouble."
- "You'll like this." / "It's a good thing." / "It's a nice surprise."
- Anyone smiling at Tony to let him off the hook.
- Anyone naming the ceremony, the fire, the Circle, the founders, or the word
  *initiation*, before the trees open at SM-560.
- Anyone in the car finding Tony's fear funny **to his face**. Numbskull's
  quiet chuckle at SM-330 is the owner's and is the ceiling.
- Any line where a character notices the situation resembles anything.

---

## Cast, register, and who sits where

| Who | Voice profile | Register in this scene |
|---|---|---|
| **PROSPECT** (Tony Squatchtana) | `player` | Dry, understated, British-inflected. He confirms, he asks the one question anybody would ask, and he does not get an answer. He is never hysterical. He negotiates politely with his own funeral. |
| **BOOSKIBRO** | `booski` | Phone only. Founder. Brusque, unhurried, gives no information and does not notice he is giving none. |
| **SEFF** | `seff` | Driving. Transactional, flat, always mid-errand. Has a "situation" he keeps deferring. Answers questions with the smallest true thing. |
| **LAG** | `lag` | Back left, behind Seff. Detached, literal, observational, half on his phone. Latency brain. Not unkind — just does not experience the moment as tense. |
| **NUMBSKULL** | `numbskull` | Back right — **directly behind the Prospect**. Enormous, sincere, gentle, literal. Says the quiet thing out loud without malice. He is the most frightening man in the car and he is being nice the entire time. |
| **KITTENBOSS** | `kittenboss` *(new, cast)* | **She.** In the trunk. Another Prospect. Aggrieved, deadpan, weirdly chipper. Treats being in a trunk as a logistics failure, not a crime. **Never explains it.** Same age and same rank as Tony, never comic relief, never frightened. |

### The seating, which is the whole scene

The car arrives with **Lag in the front passenger seat**. By the time it pulls
away, the car has silently rearranged itself:

```
        SEFF (driving)      PROSPECT (front passenger)
        LAG (behind Seff)   NUMBSKULL (behind the Prospect)
```

Nobody ever explains why. The one time Tony is offered a change (SM-410), the
seat behind him refills itself without a word.

### Production notes for whoever wires this

- **Every spoken cue must be named `vo.*`** or the analyser is never built and
  the mouths fall back to a synthesised envelope. See `src/core/audio.js`.
- Seff, Lag and Numbskull have **no face photos**, so they have real mouth
  geometry and lip-sync properly. Booski wears `booski.png` and can only nod —
  which is fine here, because **Booski is voice-only in this scene.**
- **This is not the existing `vo.call.booski.bignight.*` bank.** That call is
  already written and recorded and says different things. This call gets its
  own bank — suggested `vo.call.booski.special_meeting.*` with Tony's half at
  `vo.call.booski.special_meeting.tony.*` — so nothing existing is overwritten.
- **Kittenboss is a woman.** This document, `src/specialmeeting/script.js`,
  `src/core/wardrobe.js`, `src/core/characters.js` and the manifest's booth
  note all said *he* when the scene was first drafted — the cast row, the
  production note, and roughly a dozen stage directions ("**He** climbs out
  under **his** own power", "**He** brushes **himself** down", "**He** starts
  up the trail"). All of them were corrected on 2026-08-20 on the owner's
  ruling. **None of her lines changed**, and neither did her rank, her age or
  her register: she is the other Prospect, she is not comic relief, and she is
  never frightened. The one spoken word that moved is Tony's **[VERBATIM]**
  question at SM-420, which is now "Why was **she** in the trunk?" — the
  pronoun only, on the owner's own instruction.
- Kittenboss **is cast**. She had no ElevenLabs id when this document was
  written and the note here used to say her lines played as subtitles over
  silence and that this was the intended state rather than a defect. That was
  true then and is no longer: the owner has supplied a woman's id, it is on
  `voices.kittenboss` in `assets/sfx/manifest.json`, and every
  `vo.specialmeeting.kittenboss.*` cue is a real take.

### Reading this document

- **`[VERBATIM]`** — the owner wrote this line. **Do not rewrite it, do not
  trim it, do not "tighten" it.** These are the spine.
- Everything unmarked is connective tissue and may be tuned, but must stay in
  register.
- *[Italics in square brackets]* are stage directions.
- Choice blocks list the option text the player sees and the beat it leads to.

---

# ACT ONE — THE FLAT

Evening. Tony is home from the Cartel Palace. The Sauce question is closed.
Nobody has yet told him whether closing it was the right call.

## SM-010 — idle, alone in the flat

Fires on the apartment's existing idle timer, one at a time, well spaced. He is
not anxious yet. He is a man with nothing to do and no one to tell.

| Cue | PROSPECT |
|---|---|
| 1 | "Right. That's Sauce dealt with. That's a sentence I've said out loud now." |
| 2 | "Nobody's rung. Nobody's rung all day." |
| 3 | "I keep waiting for someone to tell me whether that was the right call." |
| 4 | "The flat's exactly the same. That's the strange bit." |
| 5 | "I could ring somebody. And say what." |
| 6 | "I've had a shower and I can still smell that house." |
| 7 | "Shoes are ruined. Not mine, that. That's the good version." |
| 8 | "Sit down, Tony. That's the whole plan. That's the entire plan." |

## SM-020 — the phone rings

*[No warning beat. It rings.]*

## SM-030 — THE CALL

**Every line in SM-030 is [VERBATIM]. The whole exchange. Do not touch it.**

| # | Speaker | Line |
|---|---|---|
| 1 | BOOSKI | "Prospect." **[VERBATIM]** |
| 2 | PROSPECT | "What's up?" **[VERBATIM]** |
| 3 | BOOSKI | "We're having a meeting tonight." **[VERBATIM]** |
| 4 | PROSPECT | "Yeah?" **[VERBATIM]** |
| 5 | BOOSKI | "Yeah. Special one." **[VERBATIM]** |
| — | — | *[pause — hold it. This pause is the whole call.]* |
| 6 | PROSPECT | "What kinda special?" **[VERBATIM]** |
| 7 | BOOSKI | "You'll find out." **[VERBATIM]** |
| 8 | PROSPECT | "Where?" **[VERBATIM]** |
| 9 | BOOSKI | "Don't worry about that. We're sending some guys over to pick you up." **[VERBATIM]** |
| 10 | PROSPECT | "Who?" **[VERBATIM]** |
| 11 | BOOSKI | "Seff, Lag and Numbskull. They'll be there soon." **[VERBATIM]** |
| 12 | PROSPECT | "Booski, what is this?" **[VERBATIM]** |
| 13 | BOOSKI | "It's a meeting, Prospect. Put on something decent." **[VERBATIM]** |
| — | — | *[click]* |

*[Booski hangs up first, mid-air, without waiting. He does not say goodbye. He
never does — do not add one.]*

## SM-040 — the dead line

*[Tony stands with the phone still at his ear for a second longer than he needs
to. Then he takes it away and looks at it.]*

**PROSPECT:** "…Right."

## SM-050 — ringing him back *(optional, player-initiated)*

The player may call Booski back from the phone. He should be allowed to. It
must go nowhere.

*[It rings. And rings. It does not go to voicemail and it does not get
answered. It just rings until the player hangs up.]*

Afterwards, one of:

- **PROSPECT:** "He's not picking up. He literally just put the phone down."
- **PROSPECT:** "It's not even ringing out. It's just ringing."
- **PROSPECT:** "Fine. Fine."

## SM-060 — alone in the flat, after the call

Fires on the idle timer now, replacing SM-010. Same flat, different man.

| Cue | PROSPECT |
|---|---|
| 1 | "'Special one.'" |
| 2 | "He's never once told me where. Not once. In a year." |
| 3 | "Seff, Lag and Numbskull. That's three." |
| 4 | "Three of them. To collect one bloke." |
| 5 | "Put on something decent. Right. Decent." |
| 6 | "It's a meeting. He said it's a meeting." |
| 7 | "I'm reading into it. I'm aware I'm reading into it." |
| 8 | "I'd feel better if he'd shouted at me." |

## SM-070 — getting ready

Chore beats, in the flat's existing chore frame. He is dressing for something
and he doesn't know what.

- *[At the wardrobe]* **PROSPECT:** "What do you wear to a special one."
- *[At the mirror]* **PROSPECT:** "That'll do. That's decent."
- *[At the mirror, alt]* **PROSPECT:** "That's the jacket, then. That's the one I've picked."
- *[Straightening the collar, quietly]* **PROSPECT:** "It's a meeting. It's a meeting and I've been asked to it."
  *[He is talking himself down and it is not working. **He is the only person
  in this entire scene permitted to say anything reassuring to Tony, and it has
  to fail.**]*

## SM-080 — door refusals, while he waits

If the player tries to leave before the car arrives. Recordable refusal bank —
give it three alternates like the rest of the door.

| Cue | PROSPECT |
|---|---|
| 1 | "No. He said they're coming here. I'm not walking out on that." |
| 2 | "They're picking me up. If I'm not in when they get here, that's on me." |
| 3 | "I don't know where it is. That's rather the point." |

## SM-090 — headlights

*[Headlights swing across the ceiling of the flat and stop. The engine keeps
running. Nobody knocks.]*

One of:

- **PROSPECT:** "That's them, then."
- **PROSPECT:** "They're early." *[beat]* "Or I'm late. One of the two."
- **PROSPECT:** "Right. Down we go."

*[The engine does not switch off. It is still running when he gets outside.]*

---

# ACT TWO — THE FRONT SEAT

Street outside the flat. A big four-door with the engine running. **Seff at the
wheel. Lag in the front passenger seat. Numbskull in the back, right side.**

## SM-100 — arrival

*[Lag gets out of the front and stands with the door open behind him, looking
at his phone. Numbskull gets out of the back, unhurried, and walks round the
car. Seff stays in the driver's seat and leans across.]*

**SEFF:** "Tony. Hey."

**SEFF:** "You look alright. That's a good jacket."

**LAG:** *[not looking up]* "Nice out."

**SEFF:** "Quick thing before we go — no. Forget it. Later."
*[He does not say what the thing was. He never does. Do not resolve this.]*

**LAG:** "Forty minutes, roughly. There's no signal past the reservoir. I checked."

*[Numbskull arrives at the front passenger door, waits for Lag to step clear of
it, and opens it. He holds it. He does not let go of it for the rest of the
scene until Tony is sitting in it.]*

**NUMBSKULL:** "Front." **[VERBATIM]**

## SM-110 — THE HUB

*[The front door is open. Numbskull is holding it. Lag has stepped back. Nobody
is looking at Tony expectantly — that is the point, they are all just waiting,
comfortably, for the normal thing to happen.]*

Options **1–3** are available immediately. **4–7** unlock after the player has
declined once. **8** unlocks after the player has declined twice.

| # | Option text | Leads to |
|---|---|---|
| 1 | "I'll sit in the back." | **SM-120** |
| 2 | "Why do I have to sit up front?" | **SM-130** |
| 3 | "All right." | **SM-190** |
| 4 | "Is Lag not sitting there?" | **SM-140** |
| 5 | "Am I in trouble?" | **SM-150** |
| 6 | "Can I just follow you in my own car?" | **SM-160** |
| 7 | *[Say nothing.]* | **SM-170** |
| 8 | "I really don't like this." | **SM-180** |

Every branch returns to **SM-110** except **SM-180**, which returns to it once,
and **SM-190**, which is the seat. There is no branch that does not end in the
front seat. Nobody escalates. Nobody raises their voice at any point.

## SM-120 — "I'll sit in the back."

**PROSPECT:** "I'll sit in the back." **[VERBATIM]**

**NUMBSKULL:** "Nah. Take the front." **[VERBATIM]**

**PROSPECT:** "I'm good back there." **[VERBATIM]**

*[A look. Not angry. Numbskull just looks at him for slightly too long, the way
you look at somebody who has said something that does not parse.]* **[VERBATIM
STAGE DIRECTION — the note "not angry" is load-bearing]**

**NUMBSKULL:** "Prospect. Sit up front." **[VERBATIM]**

*[Lag casually opens the rear door and gets in.]* **[VERBATIM STAGE DIRECTION]**

*[He does it without ceremony, without looking up, still on his phone — the way
a man gets into a car. The back seat is now full. Nobody points this out.]*

→ **SM-110**

## SM-130 — "Why do I have to sit up front?"

**PROSPECT:** "Why do I have to sit up front?" **[VERBATIM]**

**SEFF:** "Because we're asking you to sit up front." **[VERBATIM]**

**PROSPECT:** "That's not really an answer." **[VERBATIM]**

**LAG:** "It's the answer you're getting." **[VERBATIM]**

*[Lag says this without any edge at all. He is reporting a fact about the
situation, the same way he'd report a ping. Then he goes back to his phone.]*

→ **SM-110**

## SM-140 — "Is Lag not sitting there?"

**PROSPECT:** "Is Lag not sitting there?"

**LAG:** "I was."

*[beat]*

**LAG:** "It's free now."

**PROSPECT:** "Right."

→ **SM-110**

## SM-150 — "Am I in trouble?"

*[The direct question. He is allowed to ask it. He is not allowed to get an
answer.]*

**PROSPECT:** "Am I in trouble?"

*[Seff genuinely considers this. He is not being coy — he is thinking about it.]*

**SEFF:** "With who?"

*[beat]*

**PROSPECT:** "I don't know. That's why I asked."

**SEFF:** "Well. There you go."

*[Seff turns back to the wheel. That was not a deflection. He thinks he
answered.]*

→ **SM-110**

## SM-160 — "Can I just follow you in my own car?"

**PROSPECT:** "Can I just follow you in my own car?"

**LAG:** "You'd never find it."

**PROSPECT:** "You could give me the address."

**LAG:** "There isn't one."

*[Lag returns to his phone. He has answered the question completely, from his
point of view, and has nothing to add.]*

→ **SM-110**

## SM-170 — *[Say nothing.]*

*[Tony says nothing. Nobody fills the silence for him. Numbskull keeps holding
the door. Lag keeps scrolling. Seff watches the road ahead through the
windscreen. The engine idles. Hold this longer than is comfortable.]*

Then, mildly:

**SEFF:** "We're alright for time."

*[Nobody moves.]*

→ **SM-110**

## SM-180 — final resistance

*[Only after two declines. This is the last thing Tony has.]*

**PROSPECT:** "I really don't like this." **[VERBATIM]**

**NUMBSKULL:** "You're making it weird." **[VERBATIM]**

*[beat]* **[VERBATIM]**

**NUMBSKULL:** "Get in." **[VERBATIM]**

*[This is the hardest line anybody says in the scene and it is still not
aggressive. He is embarrassed for Tony. Play it that way.]*

→ **SM-110** *(hub, now with options 1, 2 and 4–7 spent; option 3 remains)*

## SM-190 — the seat

**PROSPECT:** "All right." **[VERBATIM]**

*[Tony gets in. Numbskull closes the door for him — a courtesy, done properly,
with two hands. Then Numbskull walks around the back of the car and gets in
behind him.]*

*[Lag is behind Seff. Numbskull is behind Tony. Seff adjusts the rear-view
mirror, and in doing so ends up looking at Tony. He does not hold it. He is
just adjusting the mirror.]*

*[The central locking goes. Nobody remarks on it. Do not have anybody remark on
it.]*

**SEFF:** "Belt."

**PROSPECT:** "Right."

*[They pull away.]*

---

# ACT THREE — THE DRIVE

Town, then the road out, then the dirt road. The scene gets quieter as it goes.

## SM-200 — the radio

*[Lag reaches forward between the seats and turns the radio on. Two seconds of
the station announcer mid-sentence. Seff reaches over and turns it off.]*

*[Neither of them says anything about it. Lag does not try again.]*

## SM-210 — the sandwich

*[From directly behind Tony's head, the sound of a paper bag.]*

**NUMBSKULL:** "You want half of this?"

| # | Option text | Leads to |
|---|---|---|
| 1 | "No. Thanks." | **SM-211** |
| 2 | "…Yeah. Go on." | **SM-212** |
| 3 | "What is it?" | **SM-213** |

### SM-211
**NUMBSKULL:** "It's good."

*[He does not offer again. He eats it behind Tony's head for the next minute.]*

### SM-212
*[A hand comes over Tony's shoulder holding half a sandwich. Tony takes it.]*

**PROSPECT:** *[eating]* "…It is good."

**NUMBSKULL:** "I said."

*[Now Tony is eating a sandwich that a man in the seat behind him handed to
him, and there is nothing wrong with that, and he cannot stop thinking about
it.]*

### SM-213
**NUMBSKULL:** "It's from the place by the laundrette."

**PROSPECT:** "That's not what I asked."

**NUMBSKULL:** "Oh. It's ham."

→ back to SM-210's options 1 and 2.

## SM-220 — the turn-off

*[Streetlights end. The tarmac ends. A cattle grid rattles the whole car.
Trees close over the road. Seff puts the full beams on and nobody says
anything for a while.]*

## SM-230 — DIRT ROAD, first block

**Every line in SM-230 is [VERBATIM].**

**PROSPECT:** "So where are we going?" **[VERBATIM]**

**SEFF:** "Meeting." **[VERBATIM]**

**PROSPECT:** "Yeah, I caught that part." **[VERBATIM]**

*[silence]* **[VERBATIM]**

**PROSPECT:** "Where's the meeting?" **[VERBATIM]**

**LAG:** "Out here." **[VERBATIM]**

**PROSPECT:** "No shit." **[VERBATIM]**

*[Numbskull chuckles quietly]* **[VERBATIM]**

**PROSPECT:** "How far?" **[VERBATIM]**

**SEFF:** "Not far." **[VERBATIM]**

## SM-240 — DIRT ROAD, second block

**PROSPECT:** "You guys always hold meetings in the middle of nowhere?" **[VERBATIM]**

**NUMBSKULL:** "Some meetings." **[VERBATIM]**

## SM-250 — THE LONG SILENCE

**This beat is the floor of the scene. It must be genuinely long — target
twenty to twenty-five seconds of real playtime with nobody speaking.** The
player can look around the car. He can look at Seff, at the mirror, at Lag's
phone glow, at the trees. He can look over his shoulder at Numbskull, who will
be looking out of his own window and will not notice.

**Nothing fills this. No music sting, no bark, no HUD prompt.** Just the engine,
the road under the tyres, and one indicator tick when Seff takes a bend he did
not need to indicate for.

The player may break it. If he does, he gets almost nothing and the silence
resumes:

| # | Option text | Leads to |
|---|---|---|
| 1 | "Is anyone going to say anything?" | **SM-251** |
| 2 | "How long have you three known each other?" | **SM-252** |
| 3 | *[Say nothing. Sit in it.]* | **SM-253** |

### SM-251
**LAG:** "About what?"

*[Silence resumes. Full length again.]*

### SM-252
**SEFF:** "Long time."

*[Silence. Then, a good ten seconds later, unprompted:]*

**SEFF:** "Numbskull's the newest."

**NUMBSKULL:** "Nine years."

*[Silence resumes.]*

### SM-253
*[The silence runs its full length. Nobody rescues it. At the very end of it,
quietly, from the back seat, unprompted:]*

**NUMBSKULL:** "Nice night for it."

*[Nobody says what "it" is. Nobody asks. **Do not let anybody ask.**]*

## SM-260 — the chain

*[The car slows and stops. Headlights on a rusted chain strung across a track
between two posts.]*

*[Lag gets out without being asked, unhooks the chain, drops it in the dirt,
gets back in. The car goes through. Lag gets out again, hooks the chain back up
behind them, and gets back in.]*

*[Nobody says one word about any of this.]*

Optional, if the player speaks:

**PROSPECT:** "Was that locked?"

**LAG:** "It is now."

*[Lag goes back to his phone. He was answering the question. He has no idea he
said anything.]*

## SM-270 — DIRT ROAD, third block

**PROSPECT:** "I know what goes on out in the woods." **[VERBATIM]**

*[silence, Lag looks over]* **[VERBATIM]**

**LAG:** "You do?" **[VERBATIM]**

**PROSPECT:** "Yeah." **[VERBATIM]**

**LAG:** "Huh." **[VERBATIM]**

*[and Lag just looks back out the window]* **[VERBATIM]**

*[Nobody follows this up. Not Seff, not Numbskull. **The single most important
non-event in the scene** — Tony has just said the quiet part and it landed in
absolutely nothing.]*

## SM-280 — the thing in the back

*[Two of them having a conversation that has nothing to do with Tony, in front
of Tony.]*

**LAG:** "Seff. Did you bring it?"

**SEFF:** "It's in the back."

**LAG:** "Okay."

*[That is the entire exchange. It ends. Neither of them continues. Hold for
long enough that the player understands nobody is going to say anything else.]*

**PROSPECT:** "Did you bring what?"

**SEFF:** "It's in the back."

*[Same words, same delivery. That is the whole answer. Seff is not stonewalling
— from where he is sitting, he has now told Tony twice.]*

Optional, if the player pushes:

**PROSPECT:** "That's not what I asked."

**SEFF:** "I know."

*[Nothing further. Ever. This is not explained until SM-440, and it is not
explained there either.]*

## SM-290 — the window

*[Small, quiet, from behind him.]*

**NUMBSKULL:** "You want the window down?"

**PROSPECT:** "No."

**NUMBSKULL:** "Okay."

*[Of the three of them, Numbskull is the one thinking about air. Plant this.
It pays at SM-430 and nobody ever connects the two out loud.]*

## SM-300 — DIRT ROAD, fourth block

**PROSPECT:** "Booski could've just told me where we were going." **[VERBATIM]**

**SEFF:** "He could've." **[VERBATIM]**

**PROSPECT:** "But he didn't." **[VERBATIM]**

**SEFF:** "Nope." **[VERBATIM]**

*[long silence]* **[VERBATIM]**

*[Give this one at least ten seconds. It is the run-up to the only laugh in the
scene.]*

## SM-310 — THE VALVE

**The only pressure release in the entire scene. Every line [VERBATIM].**

**NUMBSKULL:** "Relax." **[VERBATIM]**

**PROSPECT:** "That's usually not something you want to hear from the guy sitting behind you." **[VERBATIM]**

**NUMBSKULL:** "Fair." **[VERBATIM]**

*[Numbskull says "Fair" completely sincerely. He has considered the point and
conceded it. He does not laugh. Nobody in the car laughs.]*

## SM-320 — straight back down

**This beat exists to close the valve. It follows SM-310 immediately and it is
not optional.**

*[Nobody laughs. The car keeps going. Twenty metres of road.]*

Then, from behind him, helpfully:

**NUMBSKULL:** "You want me to move?"

**PROSPECT:** "…What?"

**NUMBSKULL:** "Seats. If you want, I'll move."

*[beat]*

| # | Option text | Leads to |
|---|---|---|
| 1 | "No. You're fine." | **SM-321** |
| 2 | "Yeah. Actually — yeah." | **SM-322** |
| 3 | *[Say nothing.]* | **SM-323** |

### SM-321
**NUMBSKULL:** "Okay."

*[He does not move. Tony has now chosen the arrangement himself, out of
manners, and he knows it.]*

### SM-322
**NUMBSKULL:** "Okay."

*[Numbskull undoes his belt and shifts across the back seat, behind Seff.]*

*[And Lag — without being asked, without looking up from his phone, mid-scroll
— slides across into the seat Numbskull has just left. Directly behind Tony.]*

*[Nobody says anything about it. The car has quietly reorganised itself to
preserve the arrangement.]*

**LAG:** "Better?"

*[He is asking sincerely. He wants to know if Tony is more comfortable.]*

### SM-323
**NUMBSKULL:** "I'll stay, then."

## SM-330 — arrival

*[The car slows, turns off the track onto a flat spur of dirt, and stops. Seff
kills the engine. The headlights stay on for three or four seconds, on nothing
— just trunks, and dark between them — and then he turns those off too.]*

*[Total dark. The tick of a cooling engine. Somewhere a long way off through
the trees, orange, moving.]*

---

# ACT FOUR — THE TRUNK

## SM-400 — getting out

*[Doors open. Nobody is in a hurry. Seff stretches his back. Lag zips his
jacket up and puts his phone away for the first time all night — which reads as
worse than anything he has said.]*

*[Numbskull gets out and stands beside Tony's door. When Tony opens it,
Numbskull takes a step back to give him room. Courteous. Nobody opens it for
him this time.]*

## SM-410 — pop the trunk

**NUMBSKULL:** "Pop the trunk." **[VERBATIM]**

*[Seff reaches in through the driver's door. A clunk. The lid rises on its
own, slowly, and the little bulb inside comes on.]*

## SM-420 — Kittenboss

*[Pick one at random per playthrough. Both are the owner's.]*

**KITTENBOSS:** "Jesus Christ. Finally." **[VERBATIM]**

*or*

**KITTENBOSS:** "Next time somebody crack a window." **[VERBATIM]**

*[She climbs out under her own power, unhurried, like somebody getting off a
long coach. She is dressed up. She has also put on something decent. It is
extremely creased.]*

**PROSPECT:** "Who the hell is this?" **[VERBATIM]**

**LAG:** "Kittenboss." **[VERBATIM]**

**KITTENBOSS:** "Hey." **[VERBATIM]**

**PROSPECT:** "Why was she in the trunk?" **[VERBATIM]**

**NUMBSKULL:** *[shuts the trunk]* "Long story." **[VERBATIM]**

*[Numbskull shuts it on the last word and that is the end of the subject. **It
is never explained. Not in this scene, not at the fire, not afterwards.**]*

## SM-430 — Kittenboss, continued

*[She brushes herself down. Rolls one shoulder. Looks at the trees, then at
the car, then at Tony.]*

**KITTENBOSS:** "There's a spare wheel in there. Nobody tells you that."

**KITTENBOSS:** "How long was that? Honestly. Ballpark."

**SEFF:** "Forty minutes."

**KITTENBOSS:** "It was not forty minutes."

**SEFF:** "Forty-two."

**KITTENBOSS:** "Right. Thank you."

*[Seff is not being funny. He is being accurate.]*

## SM-440 — talking to Kittenboss

Available while the four of them sort themselves out by the car. Ask as many as
the player likes.

| # | Option text | Leads to |
|---|---|---|
| 1 | "Are you all right?" | **SM-441** |
| 2 | "Why were you in the trunk?" | **SM-442** |
| 3 | "Are you a prospect?" | **SM-443** |
| 4 | "Do you know what this is?" | **SM-444** |
| 5 | "Nice to meet you." | **SM-445** |
| 6 | *[Say nothing.]* | **SM-446** |

### SM-441
**KITTENBOSS:** "I'm annoyed. That's different."

### SM-442
**KITTENBOSS:** "You'd have to ask them."

**PROSPECT:** "I did."

**KITTENBOSS:** "And?"

**PROSPECT:** "Long story."

**KITTENBOSS:** "Yeah. That's what I got."

*[Two prospects who do not know. **This is the moment the player realises
nobody is going to tell either of them anything, ever.**]*

### SM-443
**KITTENBOSS:** "Since March."

*[beat]*

**KITTENBOSS:** "You?"

**PROSPECT:** "…Yeah."

**KITTENBOSS:** "Right."

*[She looks at the trees. Neither of them says the obvious thing. **This is the
first evidence the player is not being executed — two prospects, brought to the
same place on the same night — and it arrives only after the peak of the dread,
and it arrives with one of them having come in the boot. Do not let anybody
underline it.**]*

### SM-444
**KITTENBOSS:** "Do you know what this is?"

**PROSPECT:** "No."

**KITTENBOSS:** "You've been around longer than me."

**PROSPECT:** "I have."

**KITTENBOSS:** "So."

**PROSPECT:** "So I don't know."

**KITTENBOSS:** "Okay. Good. Good."

*[She is not reassured. She is talking herself down, badly, and Tony can hear
her doing it.]*

### SM-445
**KITTENBOSS:** "Is it?"

*[beat — she hears herself]*

**KITTENBOSS:** "Sorry. That was— yeah. You too."

### SM-446
*[Kittenboss falls in beside him anyway.]*

**KITTENBOSS:** "Do I look all right?"

**PROSPECT:** "You've got—" *[gestures at his own collar]*

**KITTENBOSS:** "Yeah." *[fixes it]* "Thanks."

---

# ACT FIVE — THE WALK

A trail into black woods. The dread has to survive all of this and stay alive
right up to the last frame of the scene.

## SM-500 — off we go

**SEFF:** "Come on. They're waiting." **[VERBATIM]**

## SM-510 — you first

*[Seff points up the trail with two fingers, the way you give directions.]*

**SEFF:** "Trail's up there. Straight up. You can't miss it."

**SEFF:** "You go ahead."

**PROSPECT:** "You're not leading?"

**LAG:** "It's one trail."

**NUMBSKULL:** "We're right behind you."

*[Numbskull says this to be helpful. **It is the worst line in the scene and it
is said kindly.**]*

## SM-520 — options at the trailhead

| # | Option text | Leads to |
|---|---|---|
| 1 | "You first." | **SM-521** |
| 2 | "Walk with me." | **SM-522** |
| 3 | "How far is it?" | **SM-523** |
| 4 | "Kittenboss. You go first." | **SM-524** |
| 5 | *[Start walking.]* | **SM-530** |

All roads lead to SM-530. Nobody argues, nobody insists twice, and nobody lays
a hand on him. **They just wait, comfortably, and waiting wins.**

### SM-521
**PROSPECT:** "You first."

**SEFF:** "Nah, go on."

**PROSPECT:** "I'd rather follow."

**LAG:** "You'd rather follow."

*[Not a question. He is repeating it back to check he heard it. Then nothing.]*

**NUMBSKULL:** "It's a nice trail."

*[Nobody moves. Nobody is going to. → **SM-530** when the player walks.]*

### SM-522
**PROSPECT:** "Walk with me."

**NUMBSKULL:** "Sure."

*[He does. He walks beside Tony for four steps and then, without any apparent
decision, drifts half a step back.]*

**PROSPECT:** "You're still behind me."

**NUMBSKULL:** "Yeah."

→ **SM-530**

### SM-523
**PROSPECT:** "How far is it?"

**SEFF:** "You'll see the fire."

**PROSPECT:** "There's a fire?"

**SEFF:** "There's a fire."

*[That is all he says. He starts walking. → **SM-530**]*

### SM-524
**PROSPECT:** "Kittenboss. You go first."

**KITTENBOSS:** "Why me?"

**PROSPECT:** "You've been here longer tonight than I have."

**KITTENBOSS:** *[genuinely weighs this]* "That's fair."

*[She starts up the trail.]*

**LAG:** "Both of you."

*[So both prospects walk in front, side by side, with three men behind them.
Which is somehow worse, and is also the clearest evidence yet, and neither of
those cancels the other.]*

→ **SM-530**

## SM-530 — the trail

Dark. Roots. Breath. Beats fire on distance travelled, spaced well apart.

*[**Lag has his phone torch out and is pointing it at the ground in front of
Tony's feet — so all the light on the path is coming from behind him, and his
own shadow is thrown up the trail ahead of him.** Nobody mentions this.]*

### SM-531 — Kittenboss, quietly
**KITTENBOSS:** "Are we allowed to talk?"

**PROSPECT:** "I don't know."

**KITTENBOSS:** "Right."

*[They keep walking.]*

### SM-532 — the men behind
*[Seff and Lag, behind them, having an entirely ordinary conversation. They are
not lowering their voices. **They are not talking about tonight at all.**]*

**SEFF:** "So the mattress thing. If I get the truck for Thursday—"

**LAG:** "You're not getting the truck."

**SEFF:** "*If* I get the truck."

**LAG:** "Mm."

**SEFF:** "That's all I'm saying. If."

*[Nothing comes of it. It just stops, the way conversations do.]*

### SM-533 — Kittenboss tries
**KITTENBOSS:** *[low, so only Tony hears]* "Hey. If this goes bad—"

**PROSPECT:** "Yeah?"

*[Kittenboss thinks about it for a long moment. She is genuinely trying to find
the end of that sentence.]*

**KITTENBOSS:** "No. I had nothing. Sorry."

*[Do not play this for the laugh. She tried to comfort a man and could not find
anything to say, and they both have to keep walking.]*

### SM-534 — first light
*[Ahead, the trunks nearest the path pick up an orange edge on one side. Not a
glow yet — just an edge, and it moves.]*

*[Nobody mentions it. Do not have anybody mention it.]*

Optional:

**PROSPECT:** "Is that it?"

**SEFF:** "Keep going."

### SM-535 — on the record
*[Close behind him, quiet, almost private.]*

**NUMBSKULL:** "I told them I like you."

**PROSPECT:** "…Okay."

**NUMBSKULL:** "I wanted that said."

*[beat]*

**PROSPECT:** "Said to who?"

*[Numbskull does not answer. Twigs. Boots. The orange getting stronger on the
left-hand side of every trunk.]*

*[**He is not threatening Tony. He is a man who has put something on a record
before something happens, and Tony can hear the shape of that.**]*

### SM-536 — voices
*[Ahead through the trees: not words. Just the shape of a lot of men talking at
once, low, the sound a room makes.]*

*[Then it stops. All of it, at once, the way a room goes quiet when a door
opens.]*

**PROSPECT:** "They've gone quiet."

**LAG:** "Yeah."

*[Nobody says anything else. **This is the last exchange before the trees
open.**]*

## SM-540 — HAND-OFF

*[The trail opens out. Firelight on a lot of faces, all of them already turned
this way. Nobody in the clearing is moving. Nobody in the clearing is smiling.]*

*[From behind him, quietly:]*

**SEFF:** "Go on."

**→ The scene ends here and INITIATION NIGHT takes over.**

The Initiation owns its own approach — a long walk in through night forest to
the fire. **This scene must not duplicate it.** THE SPECIAL MEETING ends at the
treeline with the dread still fully loaded, and Initiation Night picks Tony up
walking, from behind, with three men following him and another prospect at his
shoulder.

**Nothing in this scene ever tells him what it is. He finds out when the player
does.**

---

## Appendix — beat index

| Beat | What |
|---|---|
| SM-010 | Idle, alone in the flat, before the call |
| SM-020 | The phone rings |
| **SM-030** | **THE CALL — entirely verbatim** |
| SM-040 | The dead line |
| SM-050 | Ringing Booski back (goes nowhere) |
| SM-060 | Idle, after the call |
| SM-070 | Getting ready |
| SM-080 | Door refusals while he waits |
| SM-090 | Headlights |
| SM-100 | The car arrives — Seff, Lag, and "Front." |
| **SM-110** | **The hub — eight ways to refuse the front seat** |
| SM-120–180 | The refusal branches |
| SM-190 | He sits down |
| SM-200 | The radio, off |
| SM-210 | The sandwich |
| SM-220 | The turn-off |
| **SM-230–240** | **Dirt road, verbatim blocks one and two** |
| **SM-250** | **The long silence** |
| SM-260 | The chain |
| **SM-270** | **"I know what goes on out in the woods."** |
| SM-280 | The thing in the back |
| SM-290 | The window (plants SM-420) |
| **SM-300** | **"He could've." / "Nope."** |
| **SM-310** | **THE VALVE — the only laugh** |
| **SM-320** | **Straight back down — "You want me to move?"** |
| SM-330 | Arrival, engine off, dark |
| SM-400 | Getting out |
| **SM-410–420** | **Pop the trunk. Kittenboss.** |
| SM-430–446 | Kittenboss, and the first evidence |
| **SM-500–520** | **"We're right behind you."** |
| SM-530–536 | The trail, the torch from behind, firelight, the voices stopping |
| **SM-540** | **Hand-off to Initiation Night** |
