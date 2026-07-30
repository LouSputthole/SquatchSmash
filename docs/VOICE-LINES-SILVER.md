# Front and Center — voice-line manifest

Everything anybody says in the Silver Room, and where the file goes.

## How this works, and why nothing is blocked on it

Same pipeline as the radio and the phone. A line plays `vo.<bank>.<n>`; if the
mp3 is not there yet the line still appears on screen and holds for a reading
beat instead. So the mission is fully playable and fully subtitled today, and
recording it is dropping files into `assets/sfx/vo/` — no code changes, no
re-timing, no re-wiring.

That is deliberate. The radio shipped this way and had 214 lines recorded
afterwards without a line of `radio.js` moving.

**Naming.** `vo.<bank>.<n>.mp3`, where `n` is the index within the bank, one
based. Reply lines inside a phone call are `vo.<bank>.r<n>.mp3`. This matches
`src/core/phone.js` and `tools/generate-sfx.mjs`.

**Timing.** Do not pad. The hold is `duration + 0.45s` when a file exists, so a
recording with two seconds of room tone on the end reads as a pause the writer
did not write.

**Subtitles.** Every intelligible line is already subtitled — the dialogue box
*is* the subtitle, and it is on for all of them, not just the recorded ones.
`<em>` is stage direction and renders in amber; it is never spoken.

---

## Margo (bank: `vo.margo`)

The largest part in the mission by some distance, and the only one that has to
carry a whole personality rather than a job.

**Who she is.** Margo Salas, mid-thirties, runs the kitchen at the Blue Hour —
a twenty-four-hour place on Ashland. She is a **civilian**: no connection to
Lou, the Bing, the station or anybody in the Silver Room. That is the point of
her. She is the only person in the mission with nothing at stake, which is what
makes her good opinion worth earning.

**Direction.** Works nights and sounds like it — warm, a bit worn, not bright.
Her timing is better than his and she knows it. She has spent fifteen years
listening to men perform competence in kitchens, so she is never impressed on
the first take and never sarcastic on the second. When she laughs it should be
an actual laugh, badly timed, cut off by her own glass; the polite version is a
different sound and the game uses both.

**The thing to get right.** She is the only guest in the building who can read
the back of house professionally. When she says nobody puts down a pan, she is
not making an observation — she is pricing it. Play those lines flat and
technical, not charmed.

| Beat | Bank | Lines | Notes |
| --- | --- | --- | --- |
| Bada Bing, first meeting | `vo.margo.bing` | 16 | Tired, guard up, end of a shift. |
| The phone call | `vo.margo.call` | 5 + 8 replies | Down a phone. Compress the dynamics. |
| Arrival, the front entrance | `vo.margo.arrive` | 11 | Outdoors, over traffic. |
| Alley / side door / cellar / kitchen / corridor barks | `vo.margo.route` | 11 | Half of these are over her shoulder while walking. |
| Reactions to tips, to being recognised | `vo.margo.notice` | 5 | Quiet. Almost to herself. |
| Left behind, waiting, frustration | `vo.margo.wait` | 5 | Escalating, never shrill. |
| The table being built | `vo.margo.table` | 5 | The one moment she is genuinely wrong-footed. |
| Round 1 — the entrance | `vo.margo.r1` | 6 | |
| Round 2 — what do you do | `vo.margo.r2` | 12 | The construction riff. Dry, not arch. |
| The drink order | `vo.margo.drink` | 4 | "One. They always bring three." |
| The family interruption | `vo.margo.ape` | 6 | |
| "You're funny" / "Funny how?" | `vo.margo.funny` | 5 | See the note below. |
| Round 6 — the personal question | `vo.margo.personal` | 10 | The burn on her arm. Play it flat — she has told this story a hundred times and it still costs her nothing. |
| The band | `vo.margo.band` | 5 | Over music; she raises her voice and enjoys it. |
| The sway | `vo.margo.sway` | 7 | Two of these are her wheezing. |
| The invitation, all outcomes | `vo.margo.end` | 9 | One per ending. |
| Ambient, seated | `vo.margo.idle` | 6 | |

**The "Funny how?" beat.** Her line — *"Funny like a man who has practised that
question in a mirror"* — has to be delivered without a flicker. She is not
frightened and she is not playing along; she has stood in front of angrier men
than this for a living, and she has decided to let him finish it. If she sounds
like she is enjoying it, the room's silence stops being funny.

## Prospect (bank: `vo.prospect`)

He is the established quiet one. Do not make him suave — the joke is that he is
running an act that is about two per cent beyond him, and it mostly works.

| Beat | Bank | Lines |
| --- | --- | --- |
| Phone replies | `vo.prospect.call` | 6 |
| Arrival, the side entrance | `vo.prospect.arrive` | 8 |
| Greetings along the route | `vo.prospect.route` | 14 |
| Table reaction, rounds 1–2 | `vo.prospect.table` | 16 |
| Drink orders | `vo.prospect.drink` | 8 |
| Introducing her | `vo.prospect.intro` | 4 |
| "Funny how?" | `vo.prospect.funny` | 3 |
| Personal answers | `vo.prospect.personal` | 8 |
| Band, toast, sway | `vo.prospect.band` | 12 |
| The invitation | `vo.prospect.invite` | 7 |

## Staff

| Who | Bank | Lines | Direction |
| --- | --- | --- | --- |
| The driver | `vo.driver` | 6 | A hired car at the end of a long shift. **Not anybody** — no name, no connection, never seen again. He is the only person all night who says thank you out loud for money, and that has to land as ordinary so that everything after it lands as strange. |
| Vinny, side door | `vo.vinny` | 5 | Opens the door before he speaks. |
| Marco, cellar | `vo.marco` | 5 | |
| Delivery driver | `vo.delivery` | 4 | Half under a stack of crates. |
| Porter | `vo.porter` | 4 | Moving the whole time. |
| Chef | `vo.chef` | 7 | Shouting at the line between sentences, not at you. |
| Dishwasher | `vo.dish` | 4 | Cheerful. Talking to nobody. |
| Service bar | `vo.servicebar` | 5 | |
| Coat check | `vo.coatcheck` | 5 | The standing-offer line is the important one. |
| Host | `vo.host` | 6 | Officious until he is overruled, then instantly not. |
| Manager | `vo.manager` | 8 | Never raises his voice. That is the whole character. |
| Waiter | `vo.waiter` | 14 | |
| Photographer | `vo.photog` | 5 | |
| Announcer | `vo.announcer` | 2 | |
| Bandleader | `vo.bandleader` | 8 | Out of breath and delighted. |

## Recurring characters

| Who | Bank | Lines | Notes |
| --- | --- | --- | --- |
| Ape | `vo.ape.silver` | 16 | Established on `Booski & Ape's CS Gambling Show`. Same performer. He eats at her diner and is delighted about it, and he is trying not to be. |
| The Bing's bouncer | `vo.bouncer.silver` | 2 | In a suit that is nearly his size. |

## Background barks

Room tone with words in it. Six to eight takes of each so they do not repeat
audibly; the game already refuses to play the same one twice running.

| Zone | Bank | Lines |
| --- | --- | --- |
| Alley | `vo.bark.alley` | 2 |
| Cellar | `vo.bark.cellar` | 2 |
| Kitchen | `vo.bark.kitchen` | 6 |
| Corridor | `vo.bark.corridor` | 3 |
| Dining room | `vo.bark.floor` | 7 |

The kitchen barks are the ones that matter. They are the only thing telling the
player the room is real, and three of them ("Behind!", "Hot — hot — HOT —",
"Heard") should be shouted across the player rather than at him.

---

## Still to produce

Everything above is written, wired, subtitled and timed. What does not exist
yet is the audio, plus:

| Item | State | Note |
| --- | --- | --- |
| Voice recordings | Not recorded | ~340 lines. Playable and readable without them. |
| The Midnight Pines' four stems | **Synthesised** | `band.rhythm / horns / piano / vocal` in `core/audio.js`. Real, mixable, and ducking correctly — but they are oscillators. A recorded septet would be a straight swap at the same four keys. |
| Facial animation | Not supported | The figure has a jaw that opens on speech and eyes that track. There is no viseme system in this engine and this mission did not add one. |
| Lip sync | Not supported | Same. The jaw works off line duration. |
| Crowd extras beyond 40 | Deliberate | The dining room runs ~60 figures at three update tiers. More is affordable; more is not better. |
| A real partner dance | **Deliberately not attempted** | See `perform.js`. Two figures in contact slide in this library and would undo the twenty careful minutes before it. Replaced with the standing sway, the song request, the toast and the photograph, which the brief explicitly allows. |
