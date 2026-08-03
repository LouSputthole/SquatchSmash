# Squatch Life — continuation summary (2026-08-03)

Written before any code changed, from the repository as it stands at
`8156788` ("Replace HotDog gun beat with Ape attack"), which is also the tip of
GitHub `main`. Every claim below was read out of the current source or docs, or
measured by running the gates; where a document and the code disagree, the code
is reported and the drift is called out.

**Squatch Smash is not the product.** It is the in-world computer game on the
desk in the Prospect's apartment (`game/`, launched from the apartment PC). The
product is **Squatch Life**, and the apartment is the hub every mission returns
to.

## Baseline measured on this commit

```text
node tests/run.mjs     389/389 passed
node tools/check.mjs   288 source files, 5 manifests — all good
```

A local (unpushed) Codex session reported `406/406`; the extra 17 come from
tests that exist only in that session's working tree. This repository's tree is
clean and contains none of that work.

---

## 1. Current campaign order

The scene graph in `src/core/campaign.js` (`SCENE_IDS`, `next` edges, lines
284–396) and the mission gates encode this route. It matches
`docs/CAMPAIGN-TIMELINE.md`.

| # | Day | Scene id | Page | Leaves to |
|---|---|---|---|---|
| 1 | 1 | `apartment` | `index.html` | Bada Bing one, after eat/shower/poop/change + Lou's call |
| 2 | 1 | `bada_bing_one` | `bing.html` | apartment (with Lou's package) |
| 3 | 1 | `apartment` | — | Squatchfather (whiskey nerve-settle in between) |
| 4 | 1 | `squatchfather` | `squatchfather.html` | apartment → sleep |
| 5 | 2 | `apartment` | — | Beef Run, after Booskibro's call (wake 07:00) |
| 6 | 2 | `airstrip_smuggling` | `beefrun.html` | apartment |
| 7 | 2 | `apartment` | — | Bada Bing two, after Big Uncle Lou's second call |
| 8 | 2 | `bada_bing_two` | `bing.html` | **`squatch_graveyard` directly** |
| 9 | 2 | `squatch_graveyard` | `graveyard.html` | **`jerky_motel` directly** |
| 10 | 2 | `jerky_motel` | `motel.html` | apartment (home 04:30) → sleep |
| 11 | 3 | `apartment` | — | NO WAKE, after Lou's vague harbor call (wake 12:00) |
| 12 | 3 | `no_wake` | `nowake.html` | apartment; completion advances straight into the `date` chapter |
| 13 | 3 | `apartment` | — | Silver Room, after Margo Salas's call |
| 14 | 3 | `silver_room` | `silver.html` | apartment (23:20) → sleep |
| 15 | 4 | `apartment` | — | Silver Pines, after Margo's morning beat + Lou's golf call (wake 10:00) |
| 16 | 4 | `silver_pines` | `golf.html` | apartment |
| 17 | 4 | `apartment` | — | THE TAKE, after Lou's heist call + seven loadout pickups |
| 18 | 4 | `bank_heist` | `heist.html` | apartment |
| 19 | 4 | `apartment` | — | Initiation, after wash / change / hide-gear |
| 20 | 4 | `initiation` | `initiation.html` | **no outbound edge — terminal WIP** |

Chapter machine (separate from calendar day, advanced only by sleep or by an
authored completion): `day_one → day_two → no_wake → date → big_night`.
`big_night` is the last chapter.

Two of the arrows are scene-to-scene rather than through the hub: Bada Bing two
hands directly to the graveyard, and the graveyard hands directly to the Motel.
Everything else returns to the apartment.

## 2. Existing playable scenes

All of these boot, run, and report completion into campaign state.

- **Apartment hub** (`index.html`, `src/world/apartment.js`, `src/core/apartment-story.js`) — chores, physical phone, answering machine, radio, wardrobe, PC, sleep, pause menu with two-step campaign reset.
- **Squatch Smash** (`game/`) — the in-world PC game: goals, Ranger Captain boss, ranks, persistent career under its own `squatchsmash.best` storage, deliberately separate from the story save.
- **Bada Bing one** (`bing.html`, `src/bing/`) — Lou's package, the club floor, blackjack, slots, the Family hangouts, Booskibro's shot beat, Lou's office briefing.
- **The Squatchfather** (`squatchfather.html`) — the restaurant hit, bathroom weapon, train horn.
- **The Beef Run** (`beefrun.html`, `src/beefrun/`) — preflight, taxi, runway 18 departure, mountain strip, loaded return, Whispering Pines landing, detection, landing rank.
- **Bada Bing two / HotDog incident** (`bing.html` second-visit route, `src/bing/hotdog-*.js`) — closed party, the Ape attack, body secure and load.
- **Squatch Graveyard** (`graveyard.html`) — carry, place, bury; optional memorial/tribute/disrespect ledger.
- **The Jerky Motel** (`motel.html`, `src/motel/`) — the deal, inspection, betrayal, recovery, escape; Snow is the ally.
- **NO WAKE** (`nowake.html`, `src/nowake/`) — dock, boarding, helm, the cruise, Willy's betrayal, the shot, disposal, silent return.
- **Front and Center / Silver Room** (`silver.html`) — the Copacabana date with Margo through the back of the house.
- **A Morning at Silver Pines** (`golf.html`, `src/golf/`) — three holes with Lou, Rippinflow, Eric; persistent scorecard.
- **THE TAKE** (`heist.html`, `src/heist/`) — briefing, bank, vault, street, garage, vehicle swap, safehouse settlement.
- **Preview harness** (`preview.html`) — opens later scenes in page-local memory without touching the real save.

## 3. Partially implemented scenes

- **Initiation** (`initiation.html`) — reachable and playable, but it never claims `campaign.enter`, records no completion event, and has no outbound edge. `SCENE_IDS.INITIATION` is registered with an empty `next`. The authored ceremony and outcome are deliberately **frozen pending the owner's playtest**. The approved-but-unbuilt rewrite is: recall Tony's campaign accomplishments, execute the failed rival prospects, admit Tony only if the required work is done, then transform Tony and every recognised member into literal sasquatches.
- **Front and Center closing cutscene** — the apartment-with-Margo beat that should close Day 3 is not built; Day 4 simply opens with her already in the bed.
- **Bada Bing two recognition beats** — bartender's new lines, dealer/performer campaign comments, Lou covering drinks, informant hints, a nervous Willy. These belong to an obsolete club-shaped draft; the connected second visit is now the dedicated HotDog party, so reviving them means designing them into that scene.
- **DJ request switch** — implemented, but only reachable on a legacy fallback path, not on the normal connected route.

## 4. Known bugs

Verified in the current source:

1. **Beef Run seats are mirrored.** The Brushrunner's nose is `+Z` (`aircraft.js:168`, `nose … 4.6`) and the cockpit camera is yawed by `π` to face it (`cameras.js:99–109`). With that frame the pilot's left is `+X`. But `pilotEye = (-0.42, …)` and `copilotSeat = (+0.42, …)` (`aircraft.js:715–716`), so the player is physically in the **right** seat and Captain Sasole sits in the **left** — while `mission.js:354` labels the objective "Get into the **left seat**" and `script.js:144` has Sasole say "I'll take the right seat." Rudder pedals are also pinned under the right seat (`aircraft.js:625`). This is exactly the reversal reported. The tail-brace mesh names (`aircraft.js:308`, `:326`) call `sx < 0` *port*, which is also backwards for this frame.
2. **Ctrl is a gameplay binding in the Beef Run.** `input.js:153` uses `Control`/`ControlLeft`/`ControlRight` for throttle-down, and `beefrun.html:138,187` advertise it. `e.preventDefault()` on `Control` (`main.js:415`) cannot suppress browser accelerators, so holding throttle-down and pressing the pitch key is literally **Ctrl+W — close tab**. Ctrl+D, Ctrl+S, Ctrl+R, Ctrl+N and Ctrl+T are all reachable the same way.
3. **Cockpit head-bob is applied in world space.** `cameras.js:96` adds the lateral bob to `_v.x` *after* `applyMatrix4(body.matrixWorld)`, so the shake is along world X rather than the airframe's lateral axis. Cosmetic, but wrong when the aeroplane is banked or on a non-axis heading.
4. **Documentation drift.** `CAMPAIGN_VERSION` is **10** (`campaign.js:258`) while the release audit and handoff still say "schema v9"/"v8". `docs/NEXT-SESSION-PROMPT.md` still describes the pre-graveyard, pre-golf, pre-heist route and is stale relative to `docs/CAMPAIGN-TIMELINE.md` and `docs/RELEASE-CANDIDATE-FLOW-2026-08-01.md`.
5. **`origin/main` in a fresh clone can be a stale orphan.** This container's `origin/main` ref points at `c68c883`, the abandoned standalone-game history, which shares **no** common ancestor with the real line. GitHub's `main` is `8156788`. Never rebase this work onto a locally-cached `origin/main` without confirming the SHA against the API.

Carried open from the audits (owner-judgement, not code faults): no full fresh-save human playthrough on this candidate; Beef Run landing feel; Front-and-Center staging; Silver Pines shot feel and dialogue repetition; initial audio/art payload still larger than necessary.

## 5. Active refinements (this session's brief)

1. Expand the first Bada Bing scene with more member interactions.
2. Add Irish to the boat informant scene (NO WAKE).
3. Rework the Motel into a tense transaction with an optional fast gunfight.
4. Add the Silverback Commander pistol.
5. Correct the reversed aircraft left/right instructions in the Beef Run — the perspective must be from **inside** the cockpit.
6. Add browser-shortcut warnings and remove Ctrl-based gameplay bindings (Beef Run).
7. Add more members waiting on the final Silver Pines hole.
8. Refine the Billy HotDog confrontation, aftermath and cleanup.
9. Preserve the existing campaign sequence and persistent-world plans.

## 6. Character and voice assignments

Registry: `src/core/characters.js`; canon: `docs/CHARACTER-ALIGNMENT.md`.

| Stable ID | Display | Voice | Notes |
|---|---|---|---|
| `prospect` | Tony Squatchtana | `player` | Human throughout the pre-Initiation campaign |
| `lou` | Big Uncle Lou Sputthole | `lou1` | Founder; owns the Bing thread and his office |
| `captain_lou_sasole` | Captain Lou Sasole | `lou2` | Separate person; owns the airstrip thread; cues `vo.beefrun.sasole.*`, speaker key `SASOLE` |
| `booski` | Booskibro | `booski` | Founder, patriarch; `booski` stays the save/voice id |
| `rippinflow` | Rippinflow | `rippinflow` | Founder |
| `shubes` | The Shubenator | `shubenator` | Founder; owns the signature line |
| `deathmegatron` | DeathMegatron | `deathmegatron` | Founder |
| `hogmama` | Hog Mama | `hogmama` | Matriarch; Circle id and radio voice only — **not** Margo |
| `ape` | Ape | `ape` | One identity: Initiation + Silver Room cameo + the Bing two attack |
| `irish` | Irish | `irish` | Procedure/grievance voice; Bing floor, `vo.bing.hang.irish.*`, gives Tony $100 |
| `eric` (`erican` alias) | Eric | `eric` | One person; the frozen Initiation card keeps the legacy spelling |
| `gratin` | Gratin | `gratin` | Member |
| `snow` | Snow | `snow` | Bing janitor / Motel ally; **never** enters player-hostile targeting |
| `billy_hotdog` | Billy HotDog | `hotdog` | Victim of the closed-party incident |
| `willy` | Willy | `willy` | The informant; permanent large-belly model shared across scenes |
| `margo` | Margo Salas | `margo` | Civilian; runs the kitchen at the Blue Hour on Ashland; not family, not on 97.8 |
| `aubbie` | Aubbie | `aubbie` | Utility man — locks, wiring, service access |
| `seff`, `old_stove`, `lag`, `numbskull` | as named | own profiles | Bing floor regulars |

The five locked founders are Booskibro, Big Uncle Lou Sputthole, Rippinflow,
The Shubenator, DeathMegatron. Every Circle member presents as human before the
Initiation verdict, using the supplied face photos in `assets/faces/`.

## 7. Audio triggers

Engine: `src/core/audio.js` (`AudioEngine`). `play(name, opts)` for one-shots,
`say(group, opts)` for VO groups, `startMusicLoop(key, url, opts)` for streamed
records — the last one takes an `onError` callback, which is the supported way
to degrade gracefully when a track file is not present.

Already wired:

- Club floor record on both Bing visits — `music.club`, chosen from the `bada_bing` venue pool in `assets/music/manifest.json` (Sallie J opens Day One; Squatch Up, BooskiBro and Squatches in the House are also in the pool). Zone-muffled against the office and the rain.
- **Lou's office radio** — `office.radio`, currently hard-coded to `assets/music/good-ole-days.mp3` (`src/bing/main.js:2912`), mixed at 0.22.
- Apartment radio — the persistent shared 97.8 receiver (`src/core/radio.js`), stations `uncle` (98.8) and `ksqch` (101.7), venue-scoped records, and `nehoo-with-a-guu` cut dead at 15s for the meeting notice.
- Silver Room performance — `front-and-center-bananaphone-*.mp3`, venue `silver_room`.
- Boat receiver in NO WAKE joins the same shared 97.8 state; the confrontation owns a deliberate silence.
- Beef Run headset audio, engine loops, and the contextual Sasole approach pools.
- **The Shubenator's signature line** — `src/core/shubenator-signature.js` holds one text (`Hey guys, what's going on?`) and three distinct authored takes: `vo.bing.hang.shubenator.signature.cheerful` (first meeting), `vo.bing2.shubenator.signature.gleeful` (HotDog aftermath), `heist.shubes_signature_cleanup` (heist cleanup). It is currently fired at three fixed scripted moments; there is **no** cooldown or rotation layer, so any ambient use would repeat freely.

Required and **not yet wired** (no asset, no cue, no reference anywhere in the
repo — confirmed by grep):

- **"Sensi Lou"** on entering Lou's office.
- **"Baby Snakes"** on Booski's first significant appearance in a scene.

Neither `assets/music/` nor `assets/sfx/` contains a matching file, so these
have to be wired with an explicit fallback until the recordings land.

## 8. Persistent state already tracked

One story save: `localStorage['squatchlife.campaign']`, schema
`CAMPAIGN_VERSION = 10`, with explicit migrations from v1 upward, a recovery
journal for malformed or future-version data, a visible warning to the player,
and a refusal to transition scenes when persistence fails.

Inside it: `version`, `scene` (`id` + `spawn`), story clock (day/time, advanced
only by named idempotent time events), `chapter`, `missions[…]` (`status` plus
per-mission checkpoint payloads), `events[…]` (one-shot calls and
`activity.*` / `phone.read.*` time events), inventory, and mission outcomes.

Named ledgers: `SCENE_IDS`, `MISSION_IDS`, `ITEM_IDS` (`parcel`, `phone`),
`EVENT_IDS` (`lou_first_call`, `lou_attaboy_call`, `booski_day_two_call`,
`lou_second_call`, `lou_no_wake_call`, `margo_date_call`, `lou_golf_call`,
`lou_heist_call`, `booski_big_night_call`), `TIME_EVENT_IDS`.

Deliberately separate storage: `squatchsmash.best` (Squatch Smash career —
survives a campaign reset), `squatch.graveyard`, `squatch.bing.dj.record`,
`squatch.fac.checkpoint`, and the accessibility keys `squatch.subs`,
`squatch.bigsubs`, `squatch.assist`, `squatch.reduceShake`.

Per-mission durable detail includes: Bing package result; Squatchfather dropped
weapon; Beef Run checkpoints / cargo / detection / landing rank; HotDog body
secure and load; graveyard burial and memorial ledger; Motel cargo, freshness,
heat and ending; NO WAKE betrayal, shot and disposal; Silver Room date outcome
and `seeingHerAgain`; Silver Pines three-hole scorecard, strokes, penalties and
outcomes; THE TAKE's six checkpoints and settlement.

## 9. Controls currently used

**Apartment / shared first-person** — `WASD` move · `Shift` sprint · `C` crouch
· `E` or left click interact · hold `E` second action · hold `F` drink/smoke ·
`Q` drop or stand · `G` fart · `T` flashlight · `R` skip radio on · `Esc`
release mouse and pause. At the PC: `Tab` desktop, number keys launch, `Q`
stands up; in Squatch Smash click to smash and `B` spends a Steady Hands charge.

**Bada Bing** — `WASD` · `Shift` hurry · `E`/click interact (hold for the other
thing) · `1`–`4` answer · `Q` get up / step away / pocket the phone · `F` drink
· `I` inventory · `P` phone · `Tab` pause and objective · `Esc`.

**Beef Run** — `W`/`S` or `↑`/`↓` pitch · `A`/`D` or `←`/`→` roll · `Q`/`E`
rudder in the air · `Shift` throttle up · **`Ctrl` throttle down (the binding to
remove)** · `Space` airbrake · `B` wheel brake · `V` parking brake · `F`/`G`
flaps · `C` camera · `E` interact on the ground · `M` mute · `H` help · `N` nav
· `1`/`2` engine start · `3` battery · `4` fuel · `[`/`]` split throttle.
Gamepad axes override the keyboard when moved.

**Motel** — `WASD` · `Shift` sprint · arrows turn/look · `Space` jump and
grapple mash · `E` use · `F` attack · `R` ranged · `G` drop weapon · `M` mute ·
`P` or `Tab` pause.

**NO WAKE** — `WASD` move and helm · `Space` jump · `E` interact (hold when
asked) · `Q` leave helm · `R` skip radio · click to fire, only when the moment
is yours · `B` bloom · `Esc`.

**Silver Pines** — `WASD` walk · `E`/click interact · `1`/`2`/`3` club · `Q`
back off · in the cart `W`/`S` drive, `A`/`D` steer, `Space` brake, `E` get out
at your ball.

**Silver Room** — `WASD` · `Shift` hurry (she notices) · `E`/click greet ·
`1`–`7` answer · `Q` get up · `F` drink · `R` ask her back when it is time ·
`Tab` pause · `Esc`.

**Graveyard** — `WASD` · `Shift` sprint · `Space` jump · `E` all interactions
(hold to pay respects or handle the body) · `Q` stop · `B` bloom · `Esc`.

Shared: every production scene mounts the five-slot bottom inventory bar, and
pause is shared across campaign scenes.

## 10. Work planned but not completed

1. **Initiation finale.** Owner playtest is the gate. Then: accomplishment
   review, rival executions, Tony's verdict, mass transformation, plus the
   scene's first `campaign.enter` claim, a completion time event, an outbound
   edge home, and credits/outro. Two authored shapes exist — the Bing oath
   ceremony in `CAMPAIGN-TIMELINE.md` and the Pines quiz/gauntlet/anointing in
   `STORY.md` — and they have to be reconciled first.
2. **Front and Center closing cutscene** (apartment with Margo), or an explicit
   owner decision to keep the ellipsis.
3. **Silver Room outcome visibility** — whether `missions.silver_room.outcome` /
   `seeingHerAgain` should surface at the Initiation. Owner call, not code.
4. **Bing scene-two recognition beats**, redesigned into the HotDog party rather
   than restored onto the obsolete route.
5. **Recording backlog.** `VOICE-LINES-TODO.md` is generated and authoritative
   (`npm run audio:todo`). The last audit put the direct pickup run at 42 files
   / 41 unique performances. Wired is not recorded.
6. **Open art/production decisions**: seven Family face photos; the unnamed
   Family-styled guard at Lou's office; Rico/Chino dialogue; performer detail
   and dance moves; Bing character-style unification; framed sasquatch-logo
   artwork; blackjack/slots VO (prospect win/lose, dealer); the TV programme
   follow-up; the apartment crooked-frame pre-stage and glue-minigame pacing;
   richer Snow-specific Motel dialogue.
7. **Performance and packaging**: finish scene-scoped audio banks, optional
   apartment lazy banks, streamed music, fast-start video, right-sized runtime
   art, then the installable PWA on the same Pages origin. Tauri only after
   that, if an offline installer is still wanted.
8. **Pages deploy of the exact `main` SHA** and a fresh-save human playthrough
   with recorded notes.

## Standing rules carried forward

- Preserve the Beef Run's flight model, terrain, mission geography and aircraft
  as canonical. Its campaign boundaries live in `src/beefrun/main.js`,
  `src/beefrun/mission.js` and `src/core/airstrip-story.js`.
- The two Lous never merge: `lou` / `lou1` at the Bing, `captain_lou_sasole` /
  `lou2` at the airstrip.
- Snow never enters player-hostile targeting or damage logic.
- Do not alter the Initiation runtime before its playtest.
- Do not replace working systems with simpler mock-ups, and do not restart a
  scene because a rewrite would be easier.
- A scene that loads is not a scene that is done: verify dialogue, triggers,
  controls, collision, mission progression, save state, failure states, audio
  cues, and the transitions into and out of the apartment hub.

---

# What this session changed (2026-08-03)

Branch `claude/squatch-life-continuation-2c23z0`, five commits on top of
`8156788`. Gates at the last commit: `npm test` **445/445**, `npm run check`
**clean**, `npm run check:flight` **every envelope**, `verify:beefrun` **68/68**,
`verify:bing` **158/158**, `verify:golf` **89/89**, `verify:no-wake` **44/44**.

## Done

1. **Beef Run frame (priority 5).** The nose is `+Z`, so the pilot's left is
   `+X`; every left/right word was authored from the apron. Mirrored the pilot
   station, pedals, dash furniture, boarding target and step-down side; moved
   engine 0 to the left wing and carried its moment arm with it; corrected the
   P-factor and torque signs so "she pulls left" is true; fixed the
   port/starboard mesh names and the flight-bench labels. Flight envelope
   unchanged — `check:flight` passes every gate including centreline drift.
2. **Ctrl removed from the Beef Run (priority 6).** Throttle-down is `Z`.
   Ctrl+W closed the tab mid-flight and `preventDefault` cannot stop it. All
   three control surfaces updated, all three warn, and reaching for the old
   lever raises a toast.
3. **Irish on the boat (priority 2).** Six lines: the egg story out, the count
   and the confirmation inside the confrontation, his hands below decks, the
   rail after the shot, and the back half he will not tell on the way in. He
   never fires — there are two guns aboard and neither is his.
4. **Silverback Commander + the Motel's fast gunfight (priorities 3 and 4).**
   Snow offers it in the car; it rides concealed so the transaction can still be
   played without a gun in the room. `X` draws it; drawing before the sellers
   move starts the fight on Tony's count, and denies the bathroom man his free
   swing. Costs police attention on the draw and every shot, fails the quiet
   exit, and abandoning it is worse than abandoning anything else because the
   crest makes it evidence against the Family.
5. **Sensi Lou, Baby Snakes, Shubes' cooldown (required audio).** See
   `src/core/signature-music.js` and `assets/music/README.md` — both records are
   wired to their trigger with a fallback and are **not** in the music manifest
   until the files land, because `check.mjs` fails the build for a manifest
   track with no file. The signature line now goes through a gate: a 210 s
   cooldown plus a rotation, with the three authored story beats exempt but
   arming it.
6. **The crew on the last green (priority 7).** Booskibro, The Shubenator,
   DeathMegatron, Numbskull and Snow wait between the final green and the
   clubhouse. Shared identity layer, ambient only, disposed with the hole.
7. **Twelve more Family interactions at the Bing (priority 1).** A second
   topic each, on its own branch, dead-ended so resume still has one position
   per member.
8. **Vendored the `img2threejs` skill** (Apache-2.0) beside the `threejs-*`
   notes.

## Not done

- **Priority 8 — the Billy HotDog confrontation, aftermath and cleanup.** Not
  started. `src/bing/hotdog-*.js` and `src/core/graveyard-story.js` are
  untouched by this session, and commit `8156788`'s Ape-attack rework is the
  most recent word on it.

## Side quest: License to Grill (added 2026-08-03)

Off the Bada Bing's back hallway, first visit only. Au Gratin has a foreign
intelligence officer tied to the store room chair and has got nowhere with him
for hours. Opening the store room door starts it.

**Built and playable:** the room's permanent fixtures (bolted chair, floor
drain, bare bulb, tool cart, utensil rail, portable radio); James Blond as a
registered campaign identity with a dinner jacket, bow tie and bare feet;
the 75-node interrogation with its questions, the cart, his belongings, his
counterattack and four answers, the Shubenator interruption, the car, the name
(**Vincent Mallard**, behind the laundromat on Thursdays) and three endings;
the cord's timing bar; the spy-jazz radio; the outcome persisted to
`squatch.bing.license-to-grill`.

**The design under the joke:** hitting him is worth almost nothing and his
belongings are worth three to five times a beating, so the player has to notice
what he is. The car is not a nudge — it ends the scene. `PRESSURE` in
`src/bing/license-to-grill.js` is the whole argument, and
`tests/license-to-grill.test.mjs` holds it.

**Not built yet:**

- The **"Licensed to Grill" apartment collectible**. The `card` flag is
  persisted on the shot ending; nothing in the apartment reads it.
- The **later callback**. `licenseToGrillCallback` is written and tested but is
  not mounted in any scene.
- The **spy tuxedo cosmetic**.
- The **Enola Squatch informant encounter**. The name and the meeting are
  persisted; no mission consumes them yet.
- `spy-jazz.mp3` itself — the radio plays `cosmic-drift.mp3` until it lands.

## Parked, by request

- **"Can't You Hear Me Knocking" on the Beef Run takeoff roll, at 45.** Owner's
  request 2026-08-03, deliberately **not implemented** — the file is coming and
  nothing should be guessing at a mix for a song nobody has heard in place. The
  full note, the existing hook it mirrors (`updateTakeoff` in
  `src/beefrun/mission.js`, where the rotation call already fires off one flag
  and `p.ias * KT > 58`) are in `assets/music/README.md`. Settled with the
  owner: **once, on the initial Whispering Pines takeoff only** — not the
  loaded El Hueso departure — and **about two minutes** of the record rather
  than all of it. Gate it on the `takeoff` phase rather than a one-shot flag:
  `rotateCalled` is deliberately reset so Sasole calls rotation on the second
  departure too, and anything copying that pattern will play the song twice.
  Still open: the mix against headset, engines and dialogue, which needs the
  file in place to judge.

## Bugs found and left alone

- **`verify:motel` is broken, on this branch and on `8156788` alike.**
  `forceInteract('knock')` runs an interaction only when its own `enabled()`
  agrees, and the knock's gate is `phase === 'lot' && !dialogue`. The harness
  reaches it with one of those false, so the call no-ops, Rico is never spawned,
  and the wait times out. Raising the ceiling to three minutes does not help.
  Diagnosed in a comment at the failing line; needs one instrumented run to say
  which gate is open.
- **`verify:bing-two` fails identically on both commits** at the same
  five-second wait.
- **Cockpit head-bob is applied in world space** (`cameras.js`, the `_v.x`
  nudge after `applyMatrix4`), so the shake runs along world X rather than the
  airframe's lateral axis. Cosmetic; deliberately not touched, because it is a
  feel change to a scene the standing rules call canonical.

## Repairs made to the verification harness

`verify:no-wake` could not reach its own scene. Its approved-pickup and
still-pending lists both named recordings that have since been delivered; its
title-card wait allowed 30 s for a start that decodes the harbour bank and
three radio shows; its aftermath wait was hard-coded to four lines and now
counts the authored list; and the disposal hold accumulates in the scene's
clamped step rather than wall clock, so a six-second press was measuring the
rasteriser. `nowake.html` and `graveyard.html` were also the only two pages
without the favicon link every other page carries, costing them a 404 and a
console error each.

The disposal itself was a real defect, not a harness artefact: Willy's own
figure was the hold target, a thin near-horizontal silhouette that Tony stood
almost directly over, so the ray grazed it and `holdTime` reset before reaching
the 0.85 s the lift needs — instrumented on `8156788` it peaked at 0.6 s with
the key held for six and a half seconds. It now has the same broad invisible
proxy the helm already used.
