# 97.8 THE SQUATCH — Radio Audit

Repo: `/home/user/SquatchSmash` ("Squatch Life"). No repo files were modified for this audit.

Primary sources read in full: `src/core/stations.js` (825 lines), `src/core/radio.js` (917 lines).
Supporting sources: `src/core/campaign.js`, `src/core/apartment-story.js`, `src/main.js`,
`docs/VOICE-CASTING.md`, `docs/AUDIO-AUDITIONS.md`, `VOICE-LINES-TODO.md`,
`assets/sfx/manifest.json`, `assets/music/manifest.json`.

---

## 1. How the radio engine actually works

**One station, one clock.** `STATIONS` in `src/core/stations.js` has exactly one entry, `squatch`
(`97.8 THE SQUATCH`), `kind: 'talk'`. (A comment records that it used to be three stations — talk
plus two music frequencies — and was collapsed to one so the station's own bands could play between
its own shows.)

**Scheduling is hour-of-day only, forever repeating.** `showAt(station, hour)`
(`src/core/stations.js:815-824`) walks `SQUATCH_SHOWS`, a fixed array of `{from, to, exchanges}`
blocks keyed by 24h hour, wrapping past midnight, and falls back to `OVERNIGHT` outside any show's
window. It takes **no day, no chapter, no campaign flag** — hour 15 is "Irish's Deep Dives" on Day
One, Day Two, Day Three and Day Four alike, word for word.

**Playback is block-based via a fixed rotation cycle.** `Radio._refill()`
(`src/core/radio.js:546-625`) walks a hardcoded `CYCLE` array:
`['talk','link','song','talk','talk','link','song','talk','ad','talk','link','song','talk','tape','talk','talk','link','song','talk','notice']`.
Each `talk` slot pulls the *next unheard exchange* (a multi-line back-and-forth) from the
current show via `_pick()` (`radio.js:628-634`), which is a **pure round-robin cursor** persisted
per key (`squatch:show:<name>`) — it walks the authored list in order, once through, then loops.
`link`/`song`/`ad`/`tape`/`notice` slots are similarly just "next item in a fixed list." None of
this reads campaign state beyond the hour.

**Voice resolution.** Every scripted line is `"SPEAKER: text"`. `speakerOf()`/`spokenText()`
(`stations.js:680-697`) strip the speaker tag and any `(stage direction)`, and `buildVoiceIndex()`
(`stations.js:729-793`) hashes `voice + text` into a stable cue name `radio.vo.<voice>.<hash>`
(FNV‑1a, so reordering the script doesn't reshuffle which clip a line plays). `Radio._playSegmentAudio()`
(`radio.js:678-709`) looks the cue up via `voiceOf(line)` and holds the segment on screen for exactly
the clip's decoded duration, falling back to a reading-speed estimate only if no clip exists.

**Day-scoped content that *does* exist, but lives entirely outside `stations.js`.**
`CHAPTER_NEWS` in `src/core/apartment-story.js:687-789` is a small, hand-authored table keyed by
`campaign.state.story.chapter` (`day_two`, `no_wake`, `date`, `golf_morning`, `heist_day`,
`post_heist`, `big_night`). `ApartmentStory.news()` (`apartment-story.js:1334-1336`) returns the
entry for the current chapter; `playNews()` in `src/main.js:3508-3529` calls `radio.broadcast()`
(`radio.js:721-741`), which **stops the normal running order** (`_stopBeds()`), plays one voiced
line as an "urgent bulletin" cued `announcer`, and then resumes the ordinary schedule
(`_tuneIn(false)`) as if nothing happened. Each bulletin fires once (dedup via
`hasHeardBulletin`/`markBulletinHeard`, keyed on the bulletin's own `vo` id, same mechanism the
Day One meeting notice uses). This is a one-shot news-wire cutaway, not a change to any show's
personality or script.

**Persistence.** `createCampaignRadioAdapter()` (`campaign.js:2276-2327`) is the *only* channel
between `Campaign` and `Radio`. It exposes: `volume`, playlist `cursor`, rotation `cycle`,
per-key `selections` (the `_pick()` cursors), `songReactionCursor`/`adReactionCursor`, per-receiver
`power`, and `heardBulletins`. **It does not expose `story.day` or `story.chapter` to the radio at
all.** The `Radio` constructor takes a `time` object and reads only `time.hour`.

**Music interleave.** `assets/music/manifest.json` lists player-supplied tracks; each can carry a
`station` tag (`uncle`/`ksqch`, vestigial from the three-station era) and/or a `venue` tag. `Radio.playlist`
(`radio.js:147-149`) filters only by `venue`, so most tracks (no `venue` field) play on every
receiver regardless of the old `station` tag. Songs play as a fixed 30s excerpt from 20% in
(`SONG_START_FRAC`), faded in/out, and the DJ never introduces the artist or track relevantly — it's
generic "that was one of ours" links (`stations.js:606-618`), picked round-robin, unrelated to which
song just played.

---

## 2. Segment inventory

Talk content lives entirely in `src/core/stations.js`. Every one of the ~211 scripted lines below
has a matching entry in `assets/sfx/manifest.json`'s `sfx` array *and* a corresponding `.mp3` under
`assets/sfx/` — verified programmatically: `voiceCues()` (`stations.js:803-812`) returns 222
distinct cues (211 script lines + community notice + 2 spooky interruptions, deduped by voice+text);
**all 222 are present in the manifest and all 222 have files on disk. Zero missing audio.** This
is a fully-recorded, fully-wired station — the "clips that don't make sense" complaint is about
writing/structure, not missing coverage.

| Show | Hours | Host(s) | Voice profile(s) | Exchanges | Lines | Source | Voice clips |
|---|---|---|---|---|---|---|---|
| Lou & Lou | 06:00–10:00 | Two Lous (one actor, alternating) | `lou1`, `lou2` | 14 | 41 | `stations.js:80-159` | All present |
| The Rerun Hour | 10:00–12:00 | Announcer + taped clips of the other 4 shows | `announcer`, tape-voiced lines | 7 | 16 | `stations.js:160-196` | All present |
| Booski & Ape's CS Gambling Show | 12:00–15:00 | Booski, Ape | `booski`, `ape` | 11 | 28 | `stations.js:197-253` | All present |
| Irish's Deep Dives | 15:00–17:00 | Irish (solo monologue) | `irish` | 23 | 23 | `stations.js:254-329` | All present |
| What's Happening in India! | 17:00–20:00 | Eric, Gratin | `eric`, `gratin` | 26 | 26 | `stations.js:330-414` | All present |
| The Squatch Evening Desk | 20:00–22:00 | Ape (solo) | `ape` | 13 | 13 | `stations.js:415-460` | All present |
| Hog Mama's Late Night Improv | 22:00–02:00 | Hog Mama (solo) | `hogmama` | 23 | 23 | `stations.js:461-536` | All present |
| Automated Overnight | 02:00–06:00 | Announcer (tape) | `announcer` | 6 | 14 | `stations.js:539-571` | All present |
| Station commercial (60s) | any, `ad` slot | Announcer | `announcer` | — | 16 segments | `stations.js:50-74` | All present |
| DJ record links | between songs, `link` slot | Announcer | `announcer` | — | 11 lines | `stations.js:606-618` | All present |
| Tape: "One Week Without The Housekeeper" | `tape` slot | Announcer intro/outro + recorded tape | `announcer` + `radio.tape.richguys` clip | — | 2 lines + 1 tape | `stations.js:628-635` | All present |
| Community meeting notice | `notice` slot, Day One only (`canPlayNotice`) | Announcer | `announcer` | — | 1 line | `stations.js:36-44` | Present |
| Song-end / ad-end reactions (Tony) | after any song/ad | Tony (player) | `player` | — | 6 song + 4 ad lines | `assets/sfx/manifest.json` `vo.radio.song.*` / `vo.radio.ad.*` | All present |
| Spooky interruptions | rare, apartment-only | Unknown / announcer | `unknown`, `announcer` | — | 2 lines | `stations.js:652-655` | Present |
| **Chapter news bulletins** (separate mechanism — see §1) | once per chapter, `radio.broadcast()` | Announcer | `announcer` | — | 6 chapter entries × radio+tv | `apartment-story.js:687-789` | Present (`news.radio.*`) |

Representative verbatim excerpts (full text is in `stations.js`, cited by line):
- Lou & Lou, `stations.js:114-131`: the three-exchange "seed-oil app" bit — the one explicitly-called-out example of intentional continuity *within* a single show.
- Irish's Deep Dives, `stations.js:260`: "Tonight: is Big Egg suppressing the pasture-raised truth?" — runs 23 standalone one-liners escalating a running joke about an egg conspiracy, entirely fictional/comedic, never touching the actual plot.
- Booski & Ape, `stations.js:203-251`: CS:GO gambling-addiction bit, self-contained.
- News bulletin, Day Two, `apartment-story.js:692-694`: "a disturbance last night at a family restaurant on the east side. No arrests." — the *only* line in the entire game that a radio ever says about a Tony-caused event, and it airs once, generically, then never again.

---

## 3. Diagnosis — why it reads as disconnected clips

1. **The schedule is a clock, not a story.** `showAt()` keys purely off `hour`; the same Irish
   monologue airs on Day One and Day Four. Four playthrough-days of identical programming reads as
   a tape loop, because after Day One it *is* one — `_pick()`'s cursor will have exhausted most
   short lists (Rerun Hour has only 16 lines) and started repeating verbatim.
2. **Hosts never learn anything happened.** Tony's off-screen crimes — the Squatchfather restaurant
   hit, the Billy HotDog beating (Bada Bing Two), the Jerky Motel deal/fire, the No Wake harbor run,
   Cumberland Fidelity (the bank job) — are entirely invisible to Lou & Lou, Booski & Ape, Irish,
   Eric & Gratin, and Hog Mama. Only a *generic, chapter-keyed, one-shot "wire" bulletin* voiced by
   the flat `announcer` profile ever mentions any of it (and only for 2 of the 5 named crimes — the
   restaurant and the motel; the HotDog beating and the harbor run get **no** news coverage at all,
   and the bulletin bank job/heist gets pre- and post-heist coverage but nothing that ties back to
   the actual hosts).
3. **The bulletin mechanism is structurally severed from the shows.** `radio.broadcast()` stops the
   normal show, reads one line, and hands control back to the *unmodified* rotation — Irish is still
   mid-egg-conspiracy a minute later as if the news never interrupted him. No host ever references
   the bulletin, follows up on it, or has an opinion about it.
4. **No recurring bits escalate across days**, because there are no days in the data model — only
   within a single day's Lou & Lou (seed-oil arc) or Irish (egg conspiracy numbering "Part fourteen…
   fifteen") does anything build, and both reset to their start the next in-game morning since the
   whole exchange list is finite and unaware of `story.day`.
5. **Ads and songs are similarly inert.** The commercial is one fixed 60-second script that never
   changes regardless of what's about to happen to Tony (no mattress-store-before-the-motel,
   bank-ad-before-the-heist foreshadowing). DJ links between songs ("That was one of ours…") are
   generic filler unconnected to the track that just played or the day's events.
6. **Net effect**: a fully-produced, fully-voiced (222/222 clips present) radio station whose
   *content* is structurally guaranteed to feel like unrelated clips, because nothing in the engine
   ever asks "what day is it" or "what has Tony done" before picking what plays next — except one
   narrow, once-per-chapter news cutaway that's disconnected from the actual DJs.

---

## 4. Capability assessment — what the engine already supports vs. what's missing

**Already supported, no new plumbing needed:**
- **Chapter-gating of a one-shot line**: `CHAPTER_NEWS` + `apartmentStory.news()` +
  `radio.broadcast()` is exactly a "play this exact line once, keyed to campaign chapter" system.
  Proven pattern, already wired to 6 of the game's ~8 chapters.
- **One-shot dedup ("heard this already")**: `hasHeardBulletin`/`markBulletinHeard`, backed by
  `campaign.state.radio.heardBulletins` (persisted, capped at 64 entries). Any new bulletin-style
  line can reuse this for free — it's how both the meeting notice and the chapter news avoid
  repeating.
- **Interrupting/overriding the normal rotation**: `radio.broadcast()` / `prepareBroadcast()`
  already stop the beds and play an arbitrary cue+line ahead of the queue. `_cutSong()` shows the
  same pattern used to hard-cut a song for the meeting notice.
- **Stable voice-cue generation from arbitrary new text**: `buildVoiceIndex()`'s hash-based naming
  means adding new dialogue to `stations.js` (or a new day-aware content module) automatically gets
  a stable, regenerable cue name — no manual cue-list bookkeeping. `tools/radio-cues.mjs` /
  `npm run sfx:vo` already regenerate whatever `voiceCues()` reports missing.
- **Per-exchange multi-line delivery with correct 2-voice alternation** (the Lou/Lou split logic,
  `stations.js:763-776`) — reusable for any two-host banter, e.g. Eric & Gratin reacting to a
  foreshadowed event.
- **Deterministic once-through-then-loop coverage** (`_pick()`) — good primitive for "play each of
  today's new bits once before repeating," if the *pool itself* were swapped per day.

**Missing — would need new code:**
- **No `day`/`chapter` reaches `Radio` or `showAt()` at all.** The `time` object passed to `Radio`
  only carries `.hour`. `createCampaignRadioAdapter()` would need to expose `story.day`/`story.chapter`
  (trivial — `campaign.state.story` already has both), and `showAt()`/`_refill()` would need to
  select an exchange *pool* by `(show, day)` or `(show, chapter)` rather than by show alone.
- **No general story-flag system for radio content.** The only gating primitive is the one-shot
  bulletin dedup; there's no equivalent of "this line is eligible only if flag X is set" for
  ordinary show exchanges. Would need a small predicate (e.g. `unlockedBy: (state) => …`) evaluated
  in `_refill()`/`_pick()` against campaign state, or precomputed pools swapped by day/chapter.
- **No mechanism for a bulletin to feed back into a show's own script** (a host referencing
  yesterday's bulletin). Bulletins and shows are two disconnected systems; unifying them means
  either folding `CHAPTER_NEWS`-style entries into named-host exchanges directly in `stations.js`,
  or having `_refill()` consult chapter state when picking a `talk` slot's exchange pool.
  **This is the central piece of new plumbing the redesign needs.**
  Building it is one function (day/chapter-aware pool selection in `_refill()`) plus data — not a
  rewrite of the engine.
- **No escalation/sequencing across days for a single bit** (e.g. "coyote problem" news thread
  growing over 4 days) — would reuse the same day/chapter-pool mechanism, just with ordered content
  per day rather than gated/off content.
- **No ad rotation tied to story state** — commercial is a single fixed script; foreshadowing ads
  (mattress store before the motel, bank ad before the heist) need the `ad` slot in `_refill()` to
  pick from a day-aware pool instead of always airing the one `st.commercial` array.
- **No coverage gaps for the HotDog beating or the harbor run** — these two off-screen crimes have
  *zero* existing bulletin content to build on; new lines from scratch, not extension of an existing
  entry.

**Bottom line**: the audio pipeline (voice casting, cue generation, playback, panning, ducking,
persistence) is complete and does not need touching. The missing piece is entirely in *selection
logic* — one new dimension (day/chapter) threaded from `campaign.state.story` through
`createCampaignRadioAdapter()` into `Radio._refill()`/`showAt()`, plus authored content organized
by day instead of one flat per-show list. The one-shot bulletin system already proves the
day-awareness pattern works end-to-end; it just needs to stop being a separate system from the
shows themselves.

---

## 5. Redesign proposal — day-by-day story-reactive programming grid

Grounded in the existing cast (Lou & Lou, Booski & Ape, Irish, Eric & Gratin, Hog Mama, the
Announcer/wire) and the existing 4-day campaign structure (`day_one` → `day_two` →
`no_wake`/`date` (day 3) → `golf_morning`/`heist_day`/`post_heist`/`big_night` (day 4)).
Crimes land one calendar day *after* they happen, matching how `CHAPTER_NEWS` already reports
Day One's restaurant hit on Day Two's wire.

### Day One (chapter `day_one`) — before anything has happened
No crimes to react to yet. This is where **foreshadowing ads** plant seeds:
- Commercial rotation gains a **Seff's Mattress Kingdom** spot ("no credit check, no questions,
  open all night off the county road") — foreshadows the Jerky Motel (Seff already exists as a
  Family hangout character in `docs/VOICE-CASTING.md`, reusable voice).
- Irish's Deep Dives keeps the egg bit but Irish drops one aside about "a coyote problem south of
  the border — somebody's dog going missing every week down there" — thread 1 of 4, played for a
  laugh, not yet sinister.
- Eric & Gratin's India show plugs **Cumberland Fidelity's** "downtown expansion" in a filler
  headline — foreshadows the bank.
- Existing meeting-notice mechanism stays exactly as-is (already day-one-gated, already dedup'd).

### Day Two (chapter `day_two`) — the restaurant hit, one day later
- Existing `CHAPTER_NEWS.day_two` bulletin fires as today (unchanged) — but now Lou & Lou's morning
  block gets a *new* exchange, gated to day 2, where the Lous riff nervously on "a family restaurant
  thing" without naming Tony — same evasive, comic voice the show already has, now pointed at the
  plot. Irish's egg-conspiracy numbering can absorb one aside ("Part sixteen — and don't ask me
  about the east side, I wasn't there either").
- Coyote thread escalates: Irish, "the coyote thing's crossed two counties now" — Cartel
  foreshadowing thread 2.
- Airstrip Smuggling, Bada Bing Two/HotDog, and Jerky Motel all happen *within* Day Two but currently
  get **no** dedicated bulletin — the proposal adds two more one-shot `CHAPTER_NEWS`-style entries
  (reusing the exact existing pattern) for HotDog and the motel, rather than leaving them silent.

### Day Three (`no_wake` then `date`) — the motel fire and the harbor, one day later
- Existing `no_wake`/`date` bulletin (motel fire) stays, but Booski & Ape's show gets a new exchange
  where Booski is cagier than usual about "county road" (Booski/Ape were adjacent to the motel deal
  narratively); Hog Mama's improv absorbs one bit riffing on "a motel fire, structurally" as an
  in-character bad-taste joke, reinforcing her established voice rather than adding a new one.
- Coyote thread 3: Eric & Gratin cut to a real headline for once — "the smuggling story we mentioned
  Tuesday has a name now: a cartel." Sets up Beef Run/harbor material paying off narratively.
- Harbor run (No Wake) gets its own new one-shot bulletin (currently missing entirely).

### Day Four (`golf_morning` → `heist_day` → `post_heist` → `big_night`) — the bank job and the finale
- Morning: existing `golf_morning`/`heist_day` "quiet downtown, Cumberland Fidelity opens at nine"
  bulletin is already, unknowingly, an ad for the bank the player is about to rob — keep it, but
  also let it recur as an actual **commercial spot** for Cumberland Fidelity in the `ad` slot that
  morning (reusing `CYCLE`'s existing `ad` slot with a day-4-specific commercial pool).
- `post_heist`: existing bulletin fires as today; add Booski & Ape reacting in-character (their CS
  gambling show already jokes about "money" constantly — one exchange where Ape reads the
  Cumberland Fidelity story off the wire mid-show, deadpan, folding the real bulletin's language
  into the hosts' voices instead of only playing it once as an interruption).
- `big_night`: existing bulletin ("quiet week on the wire… somebody's had a word") plus coyote
  thread payoff (Irish, deadpan: "and that's the last you'll hear about the coyotes, apparently") —
  closes the Cartel thread the same night the Initiation closes the game.

### Persistent personality arcs (no new engine work — content only)
Each host keeps its established comic engine and simply gets day-gated *additional* exchanges
appended to the existing pools, never replacing the pre-existing bits (Lou's seed-oil escalation,
Irish's egg numbering, Booski's gambling losses, Eric/Gratin's food derail, Hog Mama's bus). The
redesign is additive: same voices, same format, same round-robin `_pick()` mechanism, just fed from
a day-aware pool instead of one flat list.

### What this requires, concretely
1. `createCampaignRadioAdapter()` gains `getStory: () => campaign.state.story` (or similar) so
   `Radio` can read `day`/`chapter`.
2. `SQUATCH_SHOWS` exchanges gain an optional `unlockedChapter`/`unlockedDay` field; `_refill()`'s
   `talk` branch filters the show's exchange pool by current chapter/day before calling `_pick()`.
3. `st.commercial` becomes chapter-aware the same way (a small map of chapter → commercial variant,
   falling back to the existing default).
4. New `CHAPTER_NEWS`-style entries for the two currently-uncovered crimes (HotDog, harbor).
5. All new lines flow through the existing `buildVoiceIndex()`/`voiceCues()`/`npm run sfx:vo`
   pipeline unchanged — casting and generation tooling need no changes at all.

None of this touches audio graph, panning, ducking, persistence, or the skip/tune UX — it is a
selection-logic and content-authoring change layered on an already-complete playback engine.
