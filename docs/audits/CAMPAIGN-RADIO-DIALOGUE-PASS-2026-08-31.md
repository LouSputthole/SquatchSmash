# Campaign Spine, Radio, and Dialogue Pass — 2026-08-31

## Implementation update — 2026-09-01

This section supersedes the status conclusions in the original audit retained
below. The implementation branch was refreshed from `origin/main` at
`bf8655657a906d0c9edb38e193e47b8b8b84d1b0`, then the owner-selected
remediation rows were implemented without the declined broad dialogue rewrite.

| Area | Current result | Verification evidence |
| --- | --- | --- |
| Campaign spine | One generated route authority plus a corrected full-chain driver | `verify:campaign-route` 1/1; `verify:campaign-marathon` 27/27 handoffs, durable landings, and reload proofs |
| Beat 27 · Luxury home prelude | SM-010 through SM-090 now run through one shared prelude in both supported apartment routes | Luxury Apartment 64/64; focused Special Meeting contracts 52/52 |
| Beat 28 · Special Meeting | Real pickup, seated route, forest travel, exact delivered announcer take, and Seff's two-second cut | Special Meeting browser 36/36; semantic smoke 20/20 |
| Beat 29 · Initiation ending | Slow positional stereo cabin music, fade before oath, permanent oath/end silence, full credits, and a large replay-anything portal to `preview.html` | Initiation browser 67/67; Preview browser 71/71 |
| Campaign radio | Beat/receiver-keyed programs, stable song IDs, resumable cursors, ident-before-intro, split promo, receiver news policies, explicit Nehoo 15-second successor, and playback receipts | Radio audit 31/31 beats, 341 cues, 4 declared orphans, 0 missing assets; loudness 28/28; distributable browser proof green |
| Voice production | All six campaign-critical Margo-call recordings are delivered and indexed | 544 exact rendered + 3,557 assumed-current = 4,101/4,102 playable lines; only optional `vo.door.refusal.campaign_complete.1` remains missing |
| Dialogue/audio proof | Required world lines must start, bind to a real visible speaker body, and finish naturally on the same receipt | Reachability covers 12 native adapters; Special Meeting natural-finish semantic receipt is green |
| Hub continuity | Phase-conditioned continuity now has one resolver with Apartment, Cabin, Luxury, and Mansion adapters | Hub continuity 3/3; Luxury 49/49; Cabin 125/125; Mansion Return browser 12/12 |
| Arrival music | Purpose-built, ducked one-shot scores added to Graveyard, Silver Case pickup, and Cartel Palace, with authored stop boundaries | Graveyard 44/44; Silver Case 96/96; Cartel Palace 88/88 |
| Distribution/build | Source runtime and shipped bundle now use the same inlined JSON seams | Bundle boots and plays under all three CSP/runtime scenarios |
| Registered regression suite | All newly exposed stale schema, media-count, gate-tier, and Special Meeting wait assumptions were corrected to current contracts | `npm test` 3,916/3,916; `npm run check` parses 758 files and validates 5 manifests |

The mechanically generated capability matrix remains intentionally honest:
166 cells are required contracts, 49 remain debt, 2 are known failures, 1 is
intentional N/A, and 2 are unknown. “Required” means the behavior is contracted;
it is not being mislabeled as live browser proof. The dialogue campaign ledger
likewise retains 12 UNKNOWN beats rather than turning incomplete reachability
evidence green.

Remediation rows 1–12, 14–17, 19, and 20 are complete. Rows 13 and 18 were not
requested and no broad copy rewrite or Graveyard/Enola tone rewrite was
performed. The current generated route is
[`CAMPAIGN-ROUTE-GENERATED.md`](../CAMPAIGN-ROUTE-GENERATED.md), and the
current capability ledger is
[`SEMANTIC-CAPABILITY-COVERAGE.md`](SEMANTIC-CAPABILITY-COVERAGE.md).

---

## Original audit verdict (pre-remediation)

> Historical evidence follows. Statements about missing Beat 27 content,
> absent Initiation music, global-only radio programming, and the old ending
> destination describe the pre-implementation repository and are no longer the
> current runtime status.

The current campaign is structurally connected from a fresh save through the
Initiation. It is not yet accurate to say that the whole experience works as
intended.

Three system-level gaps remain:

1. **Beat 27 is materially truncated.** The canonical Palace return reaches the
   luxury apartment, but that runtime plays only the SM-030 phone call. Seven
   authored Special Meeting prelude banks remain wired only to the legacy
   starter-flat adapter and cannot play on a fresh canonical route.
2. **The ending has competing handoff contracts.** Production rolls credits in
   Initiation and performs a bare navigation to `index.html`; the campaign
   marathon instead simulates a durable `INITIATION -> APARTMENT/front_door`
   transition. The starter/luxury epilogue decision is not consistently stated
   by the bible, Home Ladder, runtime, and tests.
3. **Radio programming is global, not scene-authored.** Every receiver shares
   one saved cycle, song cursor, selection cursor, reaction cursor, and bulletin
   history. A scene cannot currently promise what the player hears in its first
   five minutes. Different filtered playlists reuse that one numeric cursor,
   which can repeat or skip songs when the player changes locations.

The strongest material should be preserved: the Graveyard-to-Motel rationale,
the physical Silver Pines key handoff, the Margo stayover ordering, the Silver
Case through Palace causal chain, the Cabin dungeon, Hot Dog escalation, Silver
Case, Cartel Palace, Special Meeting ride, Mansion Return, and the core golf
invitation are all specific and internally coherent.

## Original source and verification boundary (pre-remediation)

This pass was refreshed to `origin/main` commit
`5e129daf3277449add6cc59bd24854c48f397add`. The final main update during the
audit changed only a NO WAKE evidence PNG, not campaign, radio, or dialogue
behavior.

Current automated evidence:

| Gate | Result | What it establishes |
| --- | --- | --- |
| `npm run verify:campaign-route` | PASS · 1/1 | Fresh-save state route reaches Initiation |
| `npm run verify:campaign-marathon` | PASS · 27/27 | State-level handoffs, durable landings, and reload proofs |
| `npm test` | PASS · 3,870/3,870 | Registered unit/static/geometry contracts |
| `npm run check` | PASS · 747 source files, 5 manifests | Parse and manifest integrity |
| `npm run check:line-presence` | PASS · 19 groups | Required voice profiles appear in hand-authored cast maps |
| `npm run check:reachability` | PASS · 5 covered scenes | Static dispatch scan for Mansion, Initiation, Beef Run, Enola, Bing |
| `npm run audit:rendered-voices:check` | PASS · 538/538 | Exact receipts for ledger entries marked `rendered` |
| `npm run audit:radio-content:check` | PASS · 298/298 | Current hash-bound spoken radio transcription receipts |
| `npm run audit:radio-loudness:check` | PASS · 24/24 | Current loudness/hash evidence for long-form masters |
| `npm run voice:needed:check` | CURRENT · 7 outstanding | Honest missing/rerecord production queue |

The first radio audit check failed because two generated source line numbers had
moved. The deeper source trace exposed nine stale or over-generalized claims in
the audit generator: Luxury news is enabled; Motel music belongs to the getaway;
Beef Run departs at 11:21; Mansion clamps the saved hour to 18:00–23:00; Special
Meeting's authored two-second gag is unwired; Initiation is missing its required
cabin music; NO WAKE forces the receiver on for about 4.9 seconds before Lou
turns it off; Hot Dog's party-record gain changes by location; and Silver Case
has an inert dashboard-radio prop rather than no radio at all. The generator and
its checked-in CSV/report outputs were corrected; game runtime was not changed.

## Campaign spine

The prose authority is
[`CAMPAIGN-STORY-BIBLE.md`](../CAMPAIGN-STORY-BIBLE.md), the mirrored route is
[`CAMPAIGN_SPINE`](../../src/core/campaign-spine.js), and the scene registry plus
runtime in [`campaign.js`](../../src/core/campaign.js) is actual behavior.

| Beats | Route | Current assessment | Highest-value refinement |
| --- | --- | --- | --- |
| 0–3 | Intro / Apartment -> Bada Bing I -> Squatchfather | Connected and reload-safe | Sharpen Squatchfather's abstract exposition and Tony's early acknowledgement replies |
| 4–7 | Cabin I -> calls -> Beef Run -> Cabin II | Strong causal loop back to one cabin | Deliver the six current Margo-call recordings; preserve the dungeon |
| 8–10 | Bada Bing II -> Graveyard -> Motel | Strong connective tissue | Sharpen Tony's Motel handoff and procedure-heavy Motel replies |
| 11–14 | Apartment -> THE TAKE -> new-space call -> Silver Pines -> Luxury | Correct order and physical key handoff | Strengthen THE TAKE debrief; fill the story-bible Silver Pines exit cell |
| 15–19 | Front & Center -> stayover -> morning -> NO WAKE -> Luxury | Durable relationship and mission ordering | Distinguish Tony's repeated service replies; use hub return for radio/news callbacks |
| 20–22 | Silver Case -> Mansion -> Silent Squatch | Correct causal final-arc entrance | Replace generic scientist hostage reactions with specialty-specific panic |
| 23–26 | Siege -> Enola -> Mansion Return -> Palace | Strong war chain and reveal ordering | Replace Enola shooter quips; preserve Mansion Return and Palace writing |
| 27 | Luxury: Special Meeting call | **DEBT: SM-030 only; seven authored banks unreachable** | Restore one shared home-prelude module in the luxury flat and show the Day-12-to-13 passage |
| 28 | Pickup / Ride | Connected, durable forest-spur resume | Preserve the authored dread; add only carefully ducked car music if desired |
| 29 | Initiation / credits | Ceremony completes, but production and test handoffs differ; required cabin music bed is absent | Deliver `initiation.cabin.music`, preserve oath/end silence, decide the epilogue home, and give the finale one durable handoff owner |

### Material continuity findings

#### P0 — restore the complete Special Meeting prelude

The starter apartment owns SM-010 through SM-090 in
[`SPECIAL_MEETING_ACT_ONE`](../../src/core/apartment-story.js), including the
dead line, callback, post-call idle, getting-ready remarks, door refusals, and
headlights. The canonical Palace exit returns to the luxury apartment, whose
runtime imports only `SPECIAL_MEETING_BOOSKI_CALL`. The fresh-route test answers
SM-030 and immediately leaves, so the truncation remains green.

Build one shared **home prelude** state machine with starter and luxury room
adapters. Run the luxury adapter on canonical saves; retain the starter adapter
only for migrated saves. Do not copy the writing a third time.

The same pass should make the time passage visible. Palace ends Day 12 at 23:00,
while the Special Meeting lift departure floors the clock to Day 13 at 17:55.
The current six-second phone delay represents almost nineteen hours of
decompression, sleep, and getting ready.

Evidence:

- [`src/core/apartment-story.js:920`](../../src/core/apartment-story.js#L920)
- [`src/core/apartment-story.js:983`](../../src/core/apartment-story.js#L983)
- [`src/luxury-apartment/main.js:37`](../../src/luxury-apartment/main.js#L37)
- [`src/luxury-apartment/main.js:272`](../../src/luxury-apartment/main.js#L272)
- [`src/core/campaign.js:945`](../../src/core/campaign.js#L945)

#### P1 — resolve the post-Initiation home and transition

The Home Ladder says the starter flat goes dark once Tony receives the luxury
keys. The bible still lists the post-campaign residence as unresolved. A later
continuity decision calls “the flat” the epilogue without resolving which flat.
Production records Initiation complete, rolls credits, then calls
`location.assign('./index.html')`. The apartment page subsequently claims the
starter apartment at `wake`; the marathon instead performs a campaign
transition to `front_door`.

Choose one explicit ending:

- **Starter bookend:** an intentional one-time exception to the Home Ladder,
  authored as an epilogue and documented as such; or
- **Luxury home:** the consistent residence progression and the cleanest place
  for post-campaign freeplay.

Whichever is chosen, use `navigateCampaign` so save-before-navigation and
rollback behavior are shared with every other handoff.

Evidence:

- [`src/initiation/main.js:165`](../../src/initiation/main.js#L165)
- [`src/core/campaign.js:5616`](../../src/core/campaign.js#L5616)
- [`tests/fresh-save-campaign-route.test.mjs:620`](../../tests/fresh-save-campaign-route.test.mjs#L620)
- [`docs/CONTINUITY-DECISIONS-2026-08-30.md:169`](../CONTINUITY-DECISIONS-2026-08-30.md#L169)

#### P1 — retire contradictory route documents

`CAMPAIGN-TIMELINE.md`, `STORY.md`, and `CONSOLIDATION-HANDOFF.md` still describe
retired campaign orders while presenting themselves as current. Some source
comments still call the completed Initiation a frozen temporary edge. Generate
secondary route tables from `CAMPAIGN_SPINE` and put a prominent superseded
banner on historical narrative documents.

## Radio: current reality

There is one live station: **97.8 THE SQUATCH**. Its current 21-slot cycle is:

`talk -> link -> song -> talk -> talk -> link -> song -> talk -> ad -> talk -> link -> song -> talk -> tape -> talk -> talk -> link -> song -> talk -> notice -> news`

The show is selected only by in-game hour. A tune-in resets the local queue but
resumes the saved global cycle and all saved selection cursors. The station has
no beat/chapter programming layer.

### Why the requested scene order does not exist today

The campaign stores one shared `cycle`, song `cursor`, selection/reaction
cursors, and bulletin history for every receiver. Only power is receiver-owned.
The apartment, Cabin, Beef Run, Golf, No Wake, Luxury, and Mansion filter
different playlist lengths and orders, then reuse the same numeric song cursor.
Consequences:

- a scene cannot know which cycle slot or record it starts on;
- changing venues can repeat a record or skip one;
- a scene cannot guarantee five minutes of new material;
- a player who misses a segment has no scene-aware rollover queue;
- a sheet can document the current algorithm, but not promise an exact
  per-scene sequence without knowing every prior second of listening and every
  skip/power action.

Mission news is currently enabled on the starter apartment, Cabin, **and
Luxury** receivers. Bing, Beef Run, Golf, No Wake, and Mansion do not pass the
campaign-news callback. That is more coverage than the previous generated
audit reported, but it is still an accidental per-scene wiring decision rather
than a declared programming policy.

Evidence:

- [`src/core/radio.js:136`](../../src/core/radio.js#L136)
- [`src/core/radio.js:548`](../../src/core/radio.js#L548)
- [`src/core/radio.js:615`](../../src/core/radio.js#L615)
- [`src/core/campaign.js:1883`](../../src/core/campaign.js#L1883)
- [`src/core/campaign.js:5558`](../../src/core/campaign.js#L5558)

### Measured clean-save first five minutes

On a clean Day-1 06:04 save, using delivered cue durations, the current station
begins as follows:

| Time | Current output |
| --- | --- |
| 0:00–0:08.568 | Lou & Lou show intro |
| 0:00–0:03.631 | Station ident overlaps the show intro |
| 0:09.968–0:28.154 | First Lou & Lou exchange |
| 0:29.554–0:32.506 | Station link |
| 0:33.906–1:03.906 | “Good Ole Days” excerpt |
| 1:05.306–1:31.741 | Two Lou & Lou exchanges |
| 1:33.141–1:37.112 | Station link |
| 1:38.512–2:08.512 | “Cosmic Drift” excerpt |
| 2:09.912–2:23.996 | Lou & Lou exchange |
| 2:25.396–4:36.460 | Full station-promo commercial block |
| 4:37.860–4:40.159 | Ad reaction |
| 4:41.559–4:57.264 | Lou & Lou exchange plus station link |
| 4:58.664 | “Through the Night” begins |

The 131-second promo consumes almost half of the five-minute window. The weekly
meeting notice does not naturally air until roughly 8:16. “Nehoo With a Guu”
first appears around 9:45, after the notice has already been heard, so its
15-second hard-cut condition is no longer eligible and it plays the ordinary
30-second excerpt. In Golf, `fullSongs: true` plus an ineligible notice can play
the entire roughly 251-second track.

The current hard cut can lead only to the weekly meeting notice, not to an ad.
It is gated by `_noticeEligible()` in
[`radio.js:924-978`](../../src/core/radio.js#L924). The manifest's intended gag
is therefore not reliably reachable.

There is also a tune-in overlap: `_pump()` starts the show intro and then the
receiver plays its ident on top of it. Sequence the ident first, then the show
intro, or treat them as one block.

### Host-program reachability

All eight host blocks exist, but the canonical route does not give all of them
a reasonable listening window. The schedule is defined in
[`stations.js:284`](../../src/core/stations.js#L284):

| In-game time | Program | Authored talk | Canonical-route exposure problem |
| --- | --- | ---: | --- |
| 06:00–10:00 | Lou & Lou | 14 exchanges / 41 lines | Strong opening exposure, but global cursors make repeats likely on later morning returns |
| 10:00–12:00 | The Rerun Hour | 7 / 16 | Cabin/Beef timing can expose it, but no visit owns a fresh ordered packet |
| 12:00–15:00 | Booski & Ape's CS Gambling Show | 11 / 28 | NO WAKE turns its forced-on radio off after about 4.9 seconds |
| 15:00–17:00 | Irish's Deep Dives | 23 / 23 | No normal radio-equipped campaign entry lands in this window |
| 17:00–20:00 | What's Happening in India! | 26 / 26 | Luxury can reach it, but that receiver is default-off and has no visit packet |
| 20:00–22:00 | The Squatch Evening Desk | 13 / 13 | Primarily optional Mansion/Luxury listening; no guaranteed first exposure |
| 22:00–02:00 | Hog Mama's Late Night Improv | 23 / 23 | Mostly a few seconds in the Bada Bing car unless the player waits deliberately |
| 02:00–06:00 | Automated Overnight | 6 exchanges / 14 lines | Cabin can expose it, but again resumes the shared global cycle |

The requested pass should therefore schedule **new talk by campaign visit**,
not simply hope that the campaign clock and player patience happen to line up.
Each hub packet can still match the host appropriate to that hour; the packet
ledger is what makes the content reachable without forcing the player to stand
beside a radio.

### Canonical radio architecture recommendation

Keep the shared `Radio` engine, audio spatialization, global generic rotation,
and heard-bulletin history. Add a thin **campaign programming layer**:

1. A data-only `RadioProgram` manifest keyed by campaign beat and receiver.
2. A resumable five-minute `entryPacket` containing ordered talk/news/song/ad
   blocks and a `talkFirst` or `musicFirst` policy.
3. A completed-block ledger. Mark a block heard only after its audio finishes;
   roll unfinished blocks into the next eligible receiver.
4. Stable song IDs rather than one numeric cursor across filtered playlists.
5. After the packet completes, resume today's global station cycle.
6. Every physical 97.8 receiver receives the same campaign-news callback unless
   it explicitly opts out in the program manifest.
7. Respect an explicit player power-off; do not force the station back on.

Required architecture checks:

- every campaign beat declares `radio: talkFirst | musicFirst | intentionalSilence | none`;
- every `talkFirst` hub has 240–300 seconds of unique ordered programming;
- every `musicFirst` scene names its exact songs and interruption rules;
- every spoken radio cue is assigned to at least one canonical-campaign packet
  or to the generic post-packet rotation;
- no cue repeats before all assigned cues in its pool have completed;
- “Nehoo With a Guu” starts at 0:00, hard-cuts at 0:15, and immediately starts
  the approved notice/ad target exactly once;
- no tune-in ident, host line, song, phone call, or mission dialogue overlaps
  outside an explicit ducking rule;
- generated documentation and the test use the same program manifest.

The workbook paired with this report contains the complete current source map,
the proposed per-beat entry packets, and the song placement ledger.

One related audio branch remains outside current `main`:
`origin/audio-beds-and-silent-props-20260830` adds Motel positional ambience and
then fixes its teardown during the getaway. It does not implement this radio
plan or modify the station engine. If that branch is merged later, preserve its
explicit stop behavior so the Motel ambience cannot bleed under the getaway
score.

## Dialogue pass

The repository is internally synchronized, but green manifest and cast checks
do not establish that the player hears the current performance. Seven voice
production items remain.

### Current recording work

Campaign-critical Cabin/Margo call:

1. `vo.call.margo.cabin_date.1` — rerecord
2. `vo.call.margo.cabin_date.2` — rerecord
3. `vo.call.margo.cabin_date.tony.1` — rerecord
4. `vo.call.margo.cabin_date.tony.2` — rerecord
5. `vo.call.margo.cabin_date.tony.3` — rerecord
6. `vo.call.margo.cabin_date.pickup` — missing

Lower-priority terminal refusal:

7. `vo.door.refusal.campaign_complete.1` — missing

Evidence:

- [`src/cabin/script.js:468`](../../src/cabin/script.js#L468)
- [`assets/sfx/rerecord.json`](../../assets/sfx/rerecord.json)
- [`VOICE-LINES-NEEDED.md`](../../VOICE-LINES-NEEDED.md)

### Writing findings

| Scene | Verdict | Evidence-backed issue | Direction |
| --- | --- | --- | --- |
| Cabin dungeon | KEEP | Gratin, prisoners, tools, Counter-Strike rationale, executions, aftermath are specific and coherent | Preserve; the character is **Lag**, not Wag |
| Squatchfather | P1 | “Business disagreement,” “Booski rejected my offer,” and similar lines are abstract exposition | Replace abstractions with witnessed insult, money, status, and dry menace |
| Bada Bing I / II | P1 / KEEP | NPC banter is strong; Tony often acts as an acknowledgement button | Rewrite only Tony's flat confirmations and the Motel handoff |
| THE TAKE | P1 | Tactics are strong; debrief becomes a state report | Lou should judge what kind of man Tony became, not summarize flags |
| Motel / Beef Run | P1 | Mission procedure leaks into mouths; Tony answers “Yes” and “Understood” | Keep procedure in HUD; make speech reveal motive and personality |
| Golf / Silver Room | P1-light | Relationship writing is strong; repeated “We're fine”/service replies are generic | Lightly distinguish context; preserve restraint |
| Silent Squatch | P1 | Six distinct scientists collapse into generic hostage pleas | Give each specialty-specific panic without inventing biography |
| Graveyard | P2 | “His grave smells like Asian feet” is crude without targeting Colton or story | Make the filth character-specific rather than ethnicity-specific |
| Enola | P2 | “Special delivery” / “Hope they're hungry” are shooter quips at the dread payoff | Replace with panic, guilt, or stunned procedure |
| Mansion Return | KEEP | Wrong city, crater, Sauce, and Palace evidence connect perfectly | Preserve verbatim |
| NO WAKE | OWNER | Clipped pressure-cooker writing is intentionally restrained | Do not automatically add jokes or pleading |
| Silver Case / Palace / Special Meeting | KEEP | Specific, mature, funny, and chronology-correct | Preserve; adjust pacing only after playthrough evidence |
| Initiation | FROZEN | Player-facing “Erican” conflicts with canonical Eric | Correct after the required human playtest, not before |

The systemic writing rule is simple:

> Every player response must reveal competence, anxiety, gallows humor, or
> status—unless clipped brevity is deliberately the dramatic point.

Examples of useful direction, not approved final copy:

- Squatchfather: “Your uncle said no to me in front of people. There's no
  version of that where he stays standing.”
- Bada Bing II: “What's in room twelve? And don't tell me on the way—I'd like
  the panic to have somewhere to sit.”
- THE TAKE: “That's not a robbery anymore, kid. That's a murder with a bank
  attached.”
- Beef Run: “What are we actually picking up? And don't say meat.”
- Enola: “It's gone. It's out. Turn us the hell around.”

## Why the green dialogue gates are partial

| Gate | What it proves | What it does not prove |
| --- | --- | --- |
| Scene `check:*vo` | Source text equals manifest metadata | File exists, MP3 contains current words, cue is reachable, correct body speaks, line finishes |
| `verify:dialogue:check` | Checked-in silent-cue report did not drift | Dialogue completeness; the verifier deliberately permits silent cues |
| `check:line-presence` | Voice profile appears somewhere in a cast map | Correct visible, nearby, oriented actor is speaking at runtime |
| `check:reachability` | Static references in five covered scenes | Campaign-wide runtime reachability; Silver/Golf are excluded and comments can count |
| `audit:rendered-voices:check` | 538 entries marked rendered match receipts | Total VO completeness; queued rerecords are excluded |
| `voice:needed:check` | Missing/rerecord/recast queue is current | Writing quality, chronology, or real-flow audibility |

No current gate judges scene chronology semantics, line intent, duplicate flat
choices, emotional tone, subtitle-versus-MP3 equivalence during the real flow,
or whether a line is cut off by a transition.

## Prioritized remediation

### P0 — stop false completion claims

1. Record/rerecord the six campaign-critical Cabin/Margo call files.
2. Restore the complete Special Meeting home prelude in the luxury apartment.
3. Add a production browser proof for Initiation credits through the chosen
   epilogue spawn; stop substituting a simulated state transition.

### P1 — make campaign media intentional

1. Add the beat-keyed radio-program manifest and resumable entry packets.
2. Fix the Nehoo 15-second gag, tune-in overlap, 131-second first commercial,
   and cross-playlist numeric song cursor.
3. Enable campaign news on all intended physical 97.8 receivers.
4. Wire the Special Meeting's already-authored two-second Lag radio gag; do not
   misclassify that beat as intentionally silent.
5. Deliver and wire the required `initiation.cabin.music` bed while preserving
   the deliberate oath/end silence.
6. Make each luxury-apartment return visibly accumulate campaign history.
7. Punch up Squatchfather, Tony's confirmation replies, THE TAKE debrief, Motel,
   Beef Run, and the scientist reactions.

### P2 — enforcement and documentation

1. Generate secondary route documents from `CAMPAIGN_SPINE`.
2. Generate the radio workbook from the program manifest and fail on drift.
3. Expand dialogue reachability to every playable beat and add a real-flow cue
   start/finish/speaker proof.
4. Add structured source/license fields for all 24 long-form masters; the repo
   currently cannot establish distribution provenance.

### P3 — deliberate polish

1. Add phase-conditioned props, news, callbacks, and cleanup to repeat hubs.
2. Consider a diegetic 97.8 lead-in on the Motel drive and Silver Case pickup
   only if it does not compete with stronger dialogue. The Special Meeting ride
   already has an authored two-second radio action and first needs that action
   wired as written.
3. Preserve intentional silence in Graveyard, Siege, the bomb release, and the
   Initiation ceremony unless a playthrough demonstrates dead air rather than
   tension.

## Recommended implementation order

1. Owner decision: starter-bookend or luxury epilogue; meeting-notice or ad as
   the Nehoo cut target.
2. Deliver the six Margo-call recordings and the terminal refusal pickup.
3. Extract and connect the shared Special Meeting home prelude.
4. Add the radio-program manifest and write its architecture tests before
   changing the receiver engine.
5. Implement entry packets, stable song IDs, rollover, and news coverage.
6. Perform the P1 dialogue rewrites scene by scene, regenerating cue/take/audio
   ledgers each time.
7. Run real browser flows for every changed scene, then the complete campaign
   marathon and a production credits-to-epilogue proof.

This is a consolidation and certification pass, not a rewrite proposal. Most
of the campaign spine and several major dialogue sequences are working well.
The priority is to make authored content reachable, make radio order data-owned,
and make the final handoff honest before adding more volume.
