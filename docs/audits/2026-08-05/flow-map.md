# Squatch Life — Scene Flow Map & Orphan/Gap Ledger

Audit date: 2026-08-05. Repo: `/home/user/SquatchSmash` (no files modified).
Authoritative registry: `src/core/campaign.js` (2358 lines, `CAMPAIGN_VERSION = 12`
at `src/core/campaign.js:297`).

Prior art: `docs/CAMPAIGN-AUDIT-2026-08-01.md` is a stale audit — it still calls
Silver Pines "prototype only, absent from `main`" (`docs/CAMPAIGN-AUDIT-2026-08-01.md:135`)
and the heist "Unbuilt / design-frozen". Both are now shipped and routed. Treat this
document as superseding it.

---

## 0. The registry, in one place

`SCENE_IDS` — 13 scenes (`src/core/campaign.js:44-61`):
`apartment, bada_bing_one, squatchfather, airstrip_smuggling, bada_bing_two,
squatch_graveyard, jerky_motel, no_wake, silver_room, silver_pines, bank_heist,
initiation, mansion`.

`MISSION_IDS` — 11 missions (`src/core/campaign.js:81-95`). Note there is **no
mission id for `squatch_graveyard`**: the graveyard is a second scene inside the
`bada_bing_two` mission record.

**Not in `SCENE_IDS` at all:** The Silver Case (`silvercase.html`), The Enola
Squatch (`enolasquatch.html`), the campground game (`game/`), the fitting room
(`wardrobe.html`), the roster (`roster.html`), preview (`preview.html`).

`SCENES` graph (`src/core/campaign.js:346-462`):

| Scene | href | defaultSpawn | spawns | `next` (legal outbound transitions) |
|---|---|---|---|---|
| `apartment` | `index.html` | `wake` | `wake, front_door, motel_retry` | all 12 other scenes (`:351-364`) |
| `bada_bing_one` | `bing.html` | `driver_seat` | `driver_seat, club_entrance` | `apartment` |
| `squatchfather` | `squatchfather.html` | `restaurant_exterior` | `restaurant_exterior, development_entry` | `apartment` |
| `airstrip_smuggling` | `beefrun.html` | `hangar` | `hangar` | `apartment` |
| `bada_bing_two` | `bing.html?visit=2` | `driver_seat` | `driver_seat, club_entrance` | **`squatch_graveyard` only** (`:388`) |
| `squatch_graveyard` | `graveyard.html` | `headlights` | `headlights` | `jerky_motel` only (`:394`) |
| `jerky_motel` | `motel.html` | `passenger_seat` | `passenger_seat` | `apartment` |
| `no_wake` | `nowake.html` | `gate_c` | `gate_c` | `apartment` |
| `silver_room` | `silver.html` | `kerb` | `kerb` | `apartment` |
| `silver_pines` | `golf.html` | `car_park` | `car_park, first_tee` | `apartment` |
| `bank_heist` | `heist.html` | `safehouse` | 7 phase spawns (`:431-439`) | `apartment` |
| `initiation` | `initiation.html` | `gathering` | `gathering` | **`[]` — no outbound edge** (`:450`) |
| `mansion` | `mansion.html` | `gate` | `gate, foyer, cellar` | `apartment` (`:460`) |

`transition()` throws if the edge is not in `next` (`src/core/campaign.js:1692-1694`).
`enter()` is the escape hatch for direct-URL entry and does not validate edges
(`:1642-1649`).

---

## 1. Campaign spine table

The chapter machine is `SLEEP_CHAPTERS` in `src/core/apartment-story.js:480-508`
plus two in-mission chapter writes. Sleeping is the only thing that turns a page
(`src/core/apartment-story.js:960-999`), except NO WAKE → `date` and Silver Pines
→ `heist_day`, which advance without a night.

| # | Chapter | Day / clock at open | Scene | Entry gate (event + flag) | What marks it complete | Next scene / chapter |
|---|---|---|---|---|---|---|
| 1 | `day_one` | Day 1, 06:04 (`campaign.js:488-489`) | `apartment` (`wake`) | fresh save | 4 chores + `LOU_FIRST_CALL` answered → `bada_bing_one` = `available` (`apartment-story.js:855-859`); door needs all of `DEPARTURE_REQUIREMENTS` (`apartment-story.js:1290-1295`) | `bada_bing_one` |
| 2 | `day_one` | Day 1, 23:41 (`DEPART_BADA_BING_ONE`, `campaign.js:209-211`) | `bada_bing_one` (`bing.html`) | `bada_bing_one.status = available` | `mission.ending()` → ending card → `navigateCampaign(APARTMENT, front_door)` (`src/bing/main.js:2830`); package `parcel` concealed | `apartment` (`front_door`) |
| 3 | `day_one` | same night | `apartment` (`front_door`) | carries `ITEM_IDS.LOU_PACKAGE` | whiskey shot (`activities.whiskeyRelaxed`) then door (`apartment-story.js:1276-1288`) | `squatchfather` |
| 4 | `day_one` | frozen scene | `squatchfather` | `squatchfather.status` available + package concealed (`core/squatchfather-story.js:18-27`) | story `complete()` sets `weaponDropped` (`squatchfather-story.js:48`); `navigateCampaign(APARTMENT, front_door)` (`src/squatchfather/main.js:1269`) | `apartment` |
| 5 | `day_one` | Day 2, 03:00 — applied **on arrival in the flat**, `TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER` (`src/main.js:221-223`, `campaign.js:216-218`) | `apartment` | — | optional `LOU_ATTABOY_CALL` rings here (`apartment-story.js:1422-1426`), gates nothing; **sleep** (`sleep()` requires `SQUATCHFATHER` complete) | chapter → `day_two` |
| 6 | `day_two` | Day 2, 07:00 (`apartment-story.js:486-487`) | `apartment` (`wake`) | — | `BOOSKI_DAY_TWO_CALL` answered → `airstrip_smuggling` = available (`apartment-story.js:871-877`) | `airstrip_smuggling` |
| 7 | `day_two` | Day 2, 09:10 depart (`campaign.js:220-222`) | `airstrip_smuggling` (`beefrun.html`) | `AIRSTRIP_SMUGGLING` available; `campaign.enter(...)` at `src/beefrun/main.js:246` | `AirstripStory.complete()` → status complete + `COMPLETE_AIRSTRIP` (Day 2, 20:30) (`core/airstrip-story.js:119-123`); `navigateCampaign(APARTMENT)` (`src/beefrun/main.js:287`) | `apartment` |
| 8 | `day_two` | Day 2, 23:00 (`campaign.js:228-230`) | `apartment` → `bada_bing_two` | `LOU_SECOND_CALL` answered → `bada_bing_two` available (`apartment-story.js:879-885`) | HotDog incident + cleanup → `ARRIVE_SQUATCH_GRAVEYARD` (Day 3, 00:15) then `navigateCampaign(SQUATCH_GRAVEYARD)` (`core/bada-bing-two-story.js:79-102`, `src/bing/hotdog-main.js:949,1065`) | `squatch_graveyard` |
| 9 | `day_two` | Day 3, 00:15 | `squatch_graveyard` (`graveyard.html`) | `bada_bing_two.checkpoint ∈ {body_loaded, graveyard}` (`core/graveyard-story.js:20-31`) | burial → `COMPLETE_BADA_BING_TWO` (Day 3, 00:45) + `jerky_motel` = available (`graveyard-story.js:88-93`); then `DEPART_JERKY_MOTEL` + `navigateCampaign(JERKY_MOTEL)` (`graveyard-story.js:105-106`) | `jerky_motel` |
| 10 | `day_two` | Day 3, 01:30 (`campaign.js:240-242`) | `jerky_motel` (`motel.html`) | `jerky_motel` available (`core/motel-story.js:10-19`) | `complete()` → `COMPLETE_JERKY_MOTEL` (Day 3, 04:30) (`motel-story.js:34-41`); `navigateCampaign(APARTMENT, front_door|motel_retry)` (`src/motel/main.js:382-383`) | `apartment` |
| 11 | `day_two` | Day 3, 04:30 | `apartment` | — | **sleep** requires `JERKY_MOTEL` complete (`apartment-story.js:489-496`) | chapter → `no_wake`, Day 3, 12:00 |
| 12 | `no_wake` | Day 3, 12:00 | `apartment` (`wake`) | `LOU_NO_WAKE_CALL` answered → `no_wake` available (`apartment-story.js:887-893`) | door → `no_wake` (`apartment-story.js:1161-1171`); depart 12:45 (`campaign.js:248-250`) | `no_wake` |
| 13 | `no_wake` | Day 3, 12:45 | `no_wake` (`nowake.html`) | `NoWakeStory.begin()` needs motel complete + Lou call (`core/no-wake-story.js:22-32`) | `complete()` → `COMPLETE_NO_WAKE` (Day 3, 16:40) **and sets `story.chapter = 'date'`** (`no-wake-story.js:66-74`); `navigateCampaign(APARTMENT)` (`src/nowake/main.js:908,1199`) | `apartment`, chapter → `date` (no sleep) |
| 14 | `date` | Day 3, 16:40 | `apartment` (`front_door`) | `MARGO_DATE_CALL` answered → `silver_room` available (`apartment-story.js:895-901`) | door → `silver_room`, depart 19:30 (`campaign.js:258-260`) | `silver_room` |
| 15 | `date` | Day 3, 19:30 | `silver_room` (`silver.html`) | `SilverStory.begin()` needs motel + no_wake complete + Margo call (`core/silver-story.js:41-56`) | `complete()` → `COMPLETE_SILVER_ROOM` (Day 3, 23:20) (`silver-story.js:80-108`); `navigateCampaign(APARTMENT)` (`src/silver/main.js:2054`) | `apartment` |
| 16 | `date` | Day 3, 23:20 | `apartment` | door returns `stay / sleep_before_big_night` (`apartment-story.js:1191-1195`) | **sleep** requires `SILVER_ROOM` complete (`apartment-story.js:497-504`) | chapter → `golf_morning`, Day 4, 07:00 |
| 17 | `golf_morning` | Day 4, 07:00 | `apartment` (`wake`) | `MARGO_WAKE` cutscene (`campaign.js:142,196-198`); `LOU_GOLF_CALL` answered → `silver_pines` available (`apartment-story.js:903-909`) | door → `silver_pines`, depart 07:30 (`campaign.js:268-270`) | `silver_pines` |
| 18 | `golf_morning` | Day 4, 07:30 | `silver_pines` (`golf.html`) | `GolfStory.begin()` needs chapter `golf_morning`, Lou call, `DEPART_SILVER_PINES` marker **and** `scene.id === silver_pines` (`core/golf-story.js:39-62`) | round end → `COMPLETE_SILVER_PINES` (Day 4, 10:30) **and sets `story.chapter = 'heist_day'`** (`golf-story.js:130-141`); `navigateCampaign(APARTMENT)` (`src/golf/main.js:2087`) | `apartment`, chapter → `heist_day` (no sleep) |
| 19 | `heist_day` | Day 4, 10:30 | `apartment` (`front_door`) | `LOU_HEIST_CALL` answered → `bank_heist` available (`apartment-story.js:911-917`); door additionally requires all 7 `HEIST_PREPARATION_ITEMS` (`apartment-story.js:1136-1146`) | depart 11:15 + status `in_progress` (`src/main.js:2847-2852`) | `bank_heist` |
| 20 | `heist_day` | Day 4, 11:15 | `bank_heist` (`heist.html`) | `BankHeistStory.begin()` needs golf + silver complete, Lou call, prep complete (`core/bank-heist-story.js:71-99`); 6 checkpoints (`campaign.js:325-332`) | `complete()` → `COMPLETE_BANK_HEIST` (Day 4, 17:20), **sets `story.chapter = 'post_heist'` and `initiation.status = 'available'`** (`bank-heist-story.js:148-176`); `navigateCampaign(APARTMENT)` (`src/heist/main.js:1525`) | `apartment`, chapter → `post_heist` |
| 21 | `post_heist` | Day 4, 17:20 | `apartment` (`front_door`) | door requires `HEIST_CLEANUP_ITEMS` washed/changed/gearSecured (`apartment-story.js:1091-1101`) then `initiation.status !== 'locked'` | departure sets `initiation.status = 'in_progress'` + `DEPART_INITIATION` (Day 4, 19:00) (`src/main.js:2853-2861`, `campaign.js:284-286`) | `initiation` |
| 22 | `post_heist` | Day 4, 19:00 | **`initiation` (`initiation.html`) — TERMINAL** | `SCENES.initiation.next = []` (`campaign.js:450`) | **Nothing.** The page never imports `campaign.js` (only `src/core/scene-inventory.js`); no story module; no completion event; no `navigateCampaign` | **dead end** — plain `<a href="./index.html">` (`initiation.html:284,295`) or `replayBtn` reload (`src/initiation/main.js:938`) |

### The last reachable scene

**`initiation` is the last reachable scene, and it has no completion event and no
outbound edge.** `src/core/campaign.js:442-451` states this explicitly:

> "The scene itself is deliberately untouched: it does not read the campaign,
> claim the scene, or report completion yet, so it has no outbound edge and
> nothing here waits on one."

`MISSION_IDS.INITIATION` has exactly one field, `status`
(`campaign.js:652-654`, `:1386-1388`), and nothing anywhere writes `'complete'`
to it — the only two writes are `'available'` (`bank-heist-story.js:175`,
`apartment-story.js:923`) and `'in_progress'` (`src/main.js:2858`).

---

## 2. Per-scene status table

| Scene / surface | Entry HTML | Entry module | Build state | Wired or orphaned | Verify coverage |
|---|---|---|---|---|---|
| Apartment (hub) | `index.html` | `src/main.js` (181 KB) | Playable, hub for all 8 chapters | **Wired** — spine root | `verify:day-one`, `verify:day-two`, `verify:big-night`, `verify:computer`, `verify:boot-errors`, `verify:direct-entry`, plus `tests/apartment-story.test.mjs`, `fresh-save-campaign-route.test.mjs` |
| Bada Bing visit 1 | `bing.html` | `src/bing/router.js` → `src/bing/main.js` | Playable end-to-end | **Wired** | `verify:bing`, `tests/bing-*.test.mjs` |
| Squatchfather | `squatchfather.html` | `src/squatchfather/main.js` | Playable, frozen cinematic | **Wired** | `verify:squatchfather`, `tests/squatchfather-story.test.mjs` |
| Beef Run / airstrip | `beefrun.html` | `src/beefrun/main.js` | Playable, 4 durable checkpoints + 1 demo pose (`preview-mode.js:91-97`) | **Wired** | `verify:beefrun`, `verify:beefrun-checkpoints`, `check:flight`, 6 `tests/beefrun-*` |
| Bada Bing visit 2 (HotDog) | `bing.html?visit=2` | `router.js` → `src/bing/hotdog-main.js` | Playable | **Wired** | `verify:bing-two`, `tests/bada-bing-two-mission.test.mjs`, `hotdog-attack.test.mjs` |
| Squatch Graveyard | `graveyard.html` | `src/graveyard/main.js` | Playable | **Wired** | **No dedicated verify script.** Covered inside `tools/verify-bing-two.mjs` (loads `graveyard.html`) and `verify:direct-entry`; unit tests `graveyard-mission`, `graveyard-controls`, `hotdog-graveyard-story` |
| Jerky Motel | `motel.html` | `src/motel/main.js` | Playable, has retry spawn | **Wired** | `verify:motel`, 4 `tests/motel-*` |
| NO WAKE | `nowake.html` | `src/nowake/main.js` | Playable | **Wired** | `verify:no-wake`, 3 `tests/no-wake-*` |
| Silver Room | `silver.html` | `src/silver/main.js` | Playable | **Wired** | `verify:silver`, `verify:silver-story`, `tests/silver-*` |
| Silver Pines (golf) | `golf.html` | `src/golf/main.js` | Playable, 3 holes | **Wired** | `verify:golf`, `balance:silver`, `tests/golf-*`, `silver-pines.test.mjs` |
| THE TAKE (heist) | `heist.html` | `src/heist/main.js` | Playable, 6 checkpoints, settlement | **Wired** | `verify:heist`, 10 `tests/heist-*` |
| Initiation | `initiation.html` | `src/initiation/main.js` | Playable ceremony; **campaign-blind** — never imports `campaign.js` | **Wired inbound only.** Terminal, no outbound edge | `verify:initiation` (153 lines, smoke-level), `tests/initiation-canon`, `initiation-voice` |
| Lou's Mansion / PROJECT SILENT SQUATCH | `mansion.html` | `src/mansion/main.js` | Playable house + full mission (`src/mansion/mission/*`, 8 checkpoints, `campaign.js:312-321`) | **ORPHANED** — registered in `SCENES` (`campaign.js:456-461`) and reachable via `APARTMENT.next` (`:363`), but **no code anywhere routes to it**. Not in `SCENE_LABELS` (`apartment-story.js:191-203`), not in any `tryLeave` branch, not in `APARTMENT_RETURN_PRIORITY` (`:510-518`) | `verify:mansion` (2716 lines, very thorough), `tests/silent-squatch-mission.test.mjs`, `silent-squatch-voice.test.mjs`, `vo:mansion` |
| The Silver Case | `silvercase.html` | `src/silvercase/main.js` | Playable end-to-end (18-state FSM, 1 checkpoint) | **ORPHANED** — not a `SCENE_ID` at all. `src/silvercase/main.js:30-32`: "Standalone: no import of core/campaign.js, no navigateCampaign call anywhere in this file." | `verify:silvercase` (1016 lines), `tests/silvercase-cast.test.mjs`, `vo:silvercase` |
| The Enola Squatch | `enolasquatch.html` | `src/enolasquatch/main.js` | Playable end-to-end (walkaround → flight → bombing → return) | **ORPHANED** — not a `SCENE_ID`. `src/enolasquatch/main.js:4-5`: "A standalone scene, entered directly (no apartment, no campaign save)". `MissionController` accepts an optional `story` hook (`mission/MissionController.js:55`) that `main.js` never supplies | `verify:enolasquatch` (1490 lines), `tests/enolasquatch-combat.test.mjs`, `vo:enolasquatch` |
| Campground game | `game/index.html` | `game/src/main.js` (own Three.js runtime) | Playable, own career save | **Wired diegetically** — iframed onto the apartment PC monitor (`src/arcade/campground.js:17` `GAME_URL = 'game/index.html'`, mounted via `src/arcade/mount.js`, `src/main.js:21`). Not a campaign scene | `verify:squatch-smash`, `verify:bundle`, `tests/squatch-smash-goals.test.mjs` |
| Fitting room | `wardrobe.html` | inline module → `src/wardrobe/preview.js` | Dev tool: renders `src/core/wardrobe.js` models under 3 lighting rigs | **Orphaned dev tool.** Not linked from `preview.html`, not in `README.md`, **and not staged by CI** (`.github/workflows/pages.yml` copies 16 html files, wardrobe is not one) | `shots:wardrobe` (screenshot tool, not a pass/fail verifier). No test |
| Cast/voice roster | `roster.html` | inline module → `src/core/characters.js` | Dev tool: cast + voice + SFX table with audio playback | **Orphaned dev tool.** Staged by CI but not linked from anywhere | None. `tests/characters.test.mjs` covers the underlying registry |
| Preview index | `preview.html` | static links | Dev index of 11 apartment checkpoints + 14 scene links | **Dev tool** | `verify:preview` |

---

## 3. Orphaned content

### 3.1 Lou's Mansion / PROJECT SILENT SQUATCH — the big one

**What it contains.** A complete mission, not a stub:
- Environment: `src/mansion/scenes/MansionGrounds.js`, `MansionInterior.js` (3800+ lines), `SilentSquatch.js` (the basement laboratory).
- Mission: `src/mansion/mission/SilentSquatchMission.js`, `SilentSquatchStateMachine.js`, `DialogueController.js`, `hud.js`, `contract-lab.js`, `mount.js`.
- Cast: `src/mansion/cast.js` — door man, guards, the Bing's bartender, Snow, Gratin.
- Writing: `src/mansion/script.js`. Spec: `docs/MISSION-SILENT-SQUATCH.md`.
- Campaign seam: `src/core/silent-squatch-story.js` (164 lines) with 8 checkpoints (`campaign.js:312-321`), 11 persisted fields (`campaign.js:659-677`), a respect award (`SILENT_SQUATCH_RESPECT = 15`, `campaign.js:309`), and 4 rewards.
- Verifier: `tools/verify-mansion.mjs`, 2716 lines, walks every room on foot.

**Campaign state it reads:** `missions.silent_squatch.status/checkpoint`,
`inventory` for `ITEM_IDS.SILVER_CASE` (`silent-squatch-story.js:54-62`),
`scene.id` to compute `unrouted` (`:56`).

**Campaign state it writes:** all 11 `silent_squatch` fields, `story.familyRespect`
+15, removes `SILVER_CASE`, adds `SQUATCHANIUM_MINIATURE` (`silent-squatch-story.js:120-157`),
and `COMPLETE_SILENT_SQUATCH` (+135 min).

**How it ends / where it sends the player:** `mansion.html:178,186` — a plain
`<a href="./index.html">APARTMENT</a>` link. No `navigateCampaign`. `SCENES.mansion.next`
is `[apartment]` but nothing calls the transition.

**Where it was meant to slot in.** `campaign.js:287-291` says it outright:

> "PROJECT SILENT SQUATCH runs on the clock rather than at a fixed hour: it
> follows The Silver Case, which is not yet a routed scene, so pinning it to a
> wall-clock time would be inventing a place for it in a day the campaign has
> not written yet."

And `docs/MISSION-SILENT-SQUATCH.md:2-3`: "Set in Lou's mansion, **immediately
after The Silver Case**." So the intended chain is
`… → silver_case → mansion → apartment`, with `DEPART_MANSION` (25 min,
`campaign.js:292`) as the travel event. Judging by `SILENT_SQUATCH` being the
first thing to write `familyRespect`, this was designed as a late-campaign or
post-`initiation` chapter.

### 3.2 The Silver Case (`silvercase.html`)

**Contains:** an 18-state mission FSM (`src/silvercase/state/SilverCaseStateMachine.js:22-43`)
— car ride, hallway, knock, establish control, case reveal, couch shooting, Lou
question, squatch prayer, chair shooting, bathroom ambush, aftermath, optional
`EXECUTE_WINSTON`, pick up case, exit. One checkpoint at `SQUATCH_PRAYER`
(`:59`). Full cast, dialogue script, revolver, the case prop.

**Campaign state:** **none**. Reads and writes nothing. `src/silvercase/cast/ape.js:3`
imports `CHARACTER_IDS` from campaign.js purely for the identity constant.

**How it ends:** `S.SCENE_COMPLETE` shows `#sceneCompleteOverlay`
(`src/silvercase/main.js:1258-1272`) with a `PLAY AGAIN` button
(`silvercase.html:241`) and a plain `<a href="./index.html">APARTMENT</a>` (`:249`).

**Where it was meant to slot in.** Directly before the mansion. `ITEM_IDS.SILVER_CASE`
exists in the registry (`campaign.js:69`) with the comment "THE SAME CASE. The one
recovered in The Silver Case, carried into Lou's office…". `silent-squatch-story.js:64-68`
compensates for its absence by *granting* the case if the save has never heard of it:
"which is every save today, because The Silver Case does not write one."
It needs a `SCENE_ID`, a mission record, an entry gate, and a `COMPLETE_SILVER_CASE`
time event.

### 3.3 The Enola Squatch (`enolasquatch.html`)

**Contains:** a full heavy-bomber mission built on Beef Run's flight stack —
`EnolaSquatch.js` airframe, `FatSquatch.js` payload, `TargetCity.js`,
`Detonation.js`, `GunnerStation.js`, `Autopilot.js`, `Interceptors.js`,
`Defense.js`, `Targeting.js`, crew, livery, preflight, an on-foot walkaround.

**Campaign state:** **none**. `MissionController` has an optional `story` hook
"same shape as Beef Run's, all optional-chained" (`mission/MissionController.js:55`)
that `src/enolasquatch/main.js` never passes.

**How it ends:** report card + `es-again` button → `window.location.reload()`
(`src/enolasquatch/main.js:1654`). `enolasquatch.html` has no link back to the
apartment at all — it is the only orphan without an exit link.

**Where it was meant to slot in.** `docs/MISSION-SILENT-SQUATCH.md:24` names
"**Fat Squatch** | the completed deployable payload (**already flown in the Enola
Squatch**)" — so in fiction it happens *after* Silent Squatch builds the payload.
It is written as a standalone sibling of `beefrun.html` (`main.js:4-6`) and would
need its own `SCENE_ID` + story module (Beef Run's `airstrip-story.js` is the
template) to join the spine.

### 3.4 The `big_night` chapter (dead branch, not a dead scene)

Fully authored and **unreachable on the live route**:
- `CHAPTER_PLAN.big_night` (`apartment-story.js:246-250`)
- `BIG_NIGHT_BOOSKI_CALL` with 4 lines + 4 replies + `vo: 'call.booski.bignight'` (`apartment-story.js:548-567`)
- `CHAPTER_MESSAGES.big_night` (`:664`), `CHAPTER_NEWS.big_night` (`:775`)
- `tryLeave` branch (`:1148-1159`), `#pendingCall` branch (`:1394-1397`)
- Apartment dressing (`src/world/dressing.js:7,68`)

Nothing in production sets `story.chapter = 'big_night'`. The only writers are
`MIGRATIONS[6]` grandfathering (`campaign.js:866-874`) and preview seeding
(`campaign.js:2246`). The live route replaced it with `post_heist`
(`bank-heist-story.js:174`). `apartment-story.js:245` acknowledges it:
"Grandfathered saves that already exposed Initiation retain this route."

### 3.5 `wardrobe.html` / `src/wardrobe/preview.js`

The fitting room. Builds every canonical figure from `src/core/wardrobe.js` under
club/daylight/studio rigs. Documented in `docs/THE-FITTING-ROOM.md` and
`docs/DRESSING-THE-CAST.md:70`. Not in `README.md`, not linked from `preview.html`,
and **excluded from the GitHub Pages deploy** — `.github/workflows/pages.yml` stages
`index bing squatchfather motel beefrun graveyard nowake silver golf heist
initiation silvercase mansion enolasquatch preview roster` and no wardrobe.
Only consumer is `npm run shots:wardrobe`.

### 3.6 `roster.html`

Cast + voice-casting + SFX audition table generated from `src/core/characters.js`.
Deployed but unlinked. Dev tool only.

### 3.7 `src/airstrip/mission.js`

Legacy model superseded by `src/beefrun/*` + `src/core/airstrip-story.js`. Still
imported by `tests/airstrip-mission.test.mjs`. Flagged for removal in
`docs/CAMPAIGN-AUDIT-2026-08-01.md:136`; still present.

### 3.8 Registered-but-unused spawns

- `mansion`: `foyer`, `cellar` (`campaign.js:459`) — no code passes either.
- `silver_pines`: `first_tee` (`campaign.js:422`) — only `car_park` is used (`src/golf/main.js:2323`).
- `bank_heist`: the 6 non-default phase spawns (`campaign.js:431-439`) — `src/heist/main.js:82` calls `campaign.enter(SCENE_IDS.BANK_HEIST)` with the default; the preview instead uses `?checkpoint=` parsed by `previewCheckpointForLocation` (`preview-mode.js:99-102`).

---

## 4. Gap ledger

### G1 — `initiation` is a hard dead end that loops the door back into itself
`SCENES.initiation.next = []` (`campaign.js:450`); the scene never imports
`campaign.js`; nothing sets `initiation.status = 'complete'`. Returning via
`initiation.html:295`'s plain link lands in `src/main.js:210-212`, which calls
`campaign.enter(APARTMENT, {spawn: 'wake'})`. Chapter is still `post_heist` and
`initiation.status` is still `in_progress`, so `tryLeave` (`apartment-story.js:1091-1109`)
returns `{kind:'go', destination: INITIATION}` **again**, forever.
`sleep()` cannot help: `SLEEP_CHAPTERS` (`apartment-story.js:480-505`) has no
`from: 'post_heist'` entry, so it returns `{ok:false, reason:'unknown_chapter'}`
(`:963-969`). **The campaign has no exit.**

### G2 — Mansion registered but unroutable
`SCENE_IDS.MANSION` is in `APARTMENT.next` (`campaign.js:363`) yet appears in
zero routing decisions: no `SCENE_LABELS` entry (`apartment-story.js:191-203`,
so a door that did route there would print the raw id `mansion`), no `tryLeave`
branch, no `APARTMENT_RETURN_PRIORITY` entry (`:510-518`, so returning from it
would not be recognised as a return). Only `seedPreviewCampaign` (`campaign.js:2020-2024`)
can put a campaign into it.

### G3 — `TIME_EVENT_IDS.DEPART_MANSION` is defined and never used
Declared `campaign.js:177`, given 25 minutes at `:292`, referenced nowhere else
in `src/`, `tests/` or `tools/`. Its sibling `COMPLETE_SILENT_SQUATCH` *is* used
(`silent-squatch-story.js:156`) — so the mission can end without ever having begun
the travel leg that its own clock budget assumes.

### G4 — Silent Squatch writes four rewards nothing reads
`basementUnlocked`, `notesRecovered`, `conspiracyBoard`, `trophyAwarded`
(`silent-squatch-story.js:138-141`) are commented as being read by "the mansion
basement, the apartment computer, the conspiracy board and the shelf the trophy
stands on" (`campaign.js:668-672`). Grep over `src/` finds **zero readers** outside
`silent-squatch-story.js` itself and `tests/silent-squatch-mission.test.mjs:466-469`.
Same for `story.familyRespect` (written `:143-145`, read nowhere in gameplay) and
`ITEM_IDS.SQUATCHANIUM_MINIATURE` (pushed to `inventory.carried` at `:152-154`,
never rendered, never listed). The only real consumer of the mission is
`src/world/dressing.js:268`, where `silent_squatch` is in `PAID_JOBS` and adds
cash bundles to the flat.

### G5 — The Silver Case completes and nothing consumes it
`silvercase.html` reaches `S.SCENE_COMPLETE` (`src/silvercase/main.js:1258`) and
writes nothing. `ITEM_IDS.SILVER_CASE` therefore has exactly one producer:
`silent-squatch-story.js:68`, which fakes it. The comment at `:29-31` names the
consequence: "The day that scene claims its own state, the `unrouted` branch is
what tightens."

### G6 — Enola Squatch completes and nothing consumes it
No `SCENE_ID`, no mission record, no story module, and the one hook that exists
(`MissionController`'s `story` option) is never wired. It also has no exit link
back to the apartment (`enolasquatch.html` — only `es-again` → reload).

### G7 — `preview.html` exposes two scenes `previewSceneForLocation` cannot map
`preview.html:347` links `silvercase.html?preview=1` and `:361` links
`enolasquatch.html?preview=1`. `previewSceneForLocation` (`preview-mode.js:130-175`)
has no branch for either pathname and falls through to `return 'apartment'`
(`:174`). It *does* have branches for `initiation.html` (`:159-161`) and
`mansion.html` (`:166-168`) with comments explaining exactly why the fallthrough
would be wrong. Today the mismatch is harmless only because neither page calls
`createCampaign()`; the moment either does, `preview=1` will seed an **apartment**
preview campaign instead of its own.

### G8 — `big_night` chapter is authored, gated, and unreachable
See §3.4. A call with recorded-VO cue names (`call.booski.bignight`), machine
messages, radio/TV news, apartment dressing, a `tryLeave` branch and a
`#pendingCall` branch, all behind a chapter value nothing in production sets.
`BOOSKI_BIG_NIGHT_CALL`/`EVENT_IDS.BOOSKI_BIG_NIGHT_CALL` is dead on the live
route; `apartment-story.js:919-926` (the handler that would unlock the Initiation
via that call) is unreachable, because `bank-heist-story.js:175` already did it.

### G9 — `bing.html` without `?visit=2` can take a second-visit save down an illegal edge
`src/bing/main.js:218-219` sets `isSecondVisit` from `?visit=2` **or**
`campaign.state.scene.id === SCENE_IDS.BADA_BING_TWO`. The router
(`src/bing/router.js:3-4`) only loads `hotdog-main.js` when the query string says
`visit=2`, so opening bare `bing.html` on a `bada_bing_two` save runs the legacy
`SecondVisitMission` path in `main.js`, whose exit calls
`navigateCampaign(campaign, SCENE_IDS.JERKY_MOTEL, …)` (`src/bing/main.js:2830`).
`SCENES.bada_bing_two.next` is `[squatch_graveyard]` only (`campaign.js:388`), so
`transition()` throws `Cannot transition from "bada_bing_two" to "jerky_motel"`
(`campaign.js:1692-1694`). Two live entry points for one scene with divergent exits.

### G10 — The graveyard has no dedicated verifier and no mission record
`squatch_graveyard` is a full `SCENE_ID` with its own page, story module and
runtime, but: (a) there is no `MISSION_IDS.SQUATCH_GRAVEYARD` — its state lives
inside `bada_bing_two` (`campaign.js:540-553`); (b) `package.json` has no
`verify:graveyard`, unlike every other routed scene. It is exercised only as a
leg of `tools/verify-bing-two.mjs` and by `verify:direct-entry`.

### G11 — `LOU_ATTABOY_CALL` is a designed-loseable event, but the loss is total and silent
`campaign.js:99-104` and `apartment-story.js:294-307` deliberately make it
non-gating. But `normalize()` cannot reconstruct it (`campaign.js:1416-1423`:
"A save already past that night never will"), and `#pendingCall` only offers it
while `chapter === 'day_one'` (`:1422-1426`). Sleeping through Day One erases it
permanently with no feedback. Intentional — logged here because it is the only
event in the campaign whose `answered` state can never be inferred.

### G12 — `wardrobe.html` is not deployed
`.github/workflows/pages.yml` stages 16 root HTML files by name;
`wardrobe.html` is absent while `roster.html` and `preview.html` are present. The
fitting room works locally (`npm start` → `/wardrobe.html`, per
`docs/THE-FITTING-ROOM.md:3`) and 404s on the published site. It is also the only
root HTML page with no `verify:` script and no test.

### G13 — README documents 12 of 17 root experiences
`README.md:3` "Twelve playable or preserved experiences" and the table at
`:7-18`. Undocumented: `mansion.html`, `silvercase.html`, `enolasquatch.html`
(all three deployed by CI and all three with 1000+ line verifiers), plus
`roster.html` and `wardrobe.html`. `README.md:36` "All twelve are static
ES-module sites" and the `npm start` block (`:21-34`) are equally stale.

### G14 — `post_heist` has no sleep and no chapter successor
`SLEEP_CHAPTERS` ends at `date → golf_morning` (`apartment-story.js:497-504`),
and `LAST_CHAPTER = 'heist_day'` (`:508`) — so even the "already at the end"
refusal message (`:966-967`) names the wrong chapter once you are in `post_heist`;
the player gets `unknown_chapter` instead. This is the mechanical face of G1.

### G15 — Motel campaign fields are largely write-only across scenes
`jerky_motel.packagesIntact` and `.freshness` are written at
`src/motel/main.js:883-884` and read by **nothing** outside the motel itself.
`.policeHeat` has exactly one cross-scene reader (`src/nowake/main.js:527`).
Contrast `src/golf/script.js:1706-1776`, which is the campaign's main payoff
surface for prior-mission facts (`bing.ending`, `airstrip.landingQuality`,
`squatchfather.weaponDropped`, `silver.seeingHerAgain`) — the motel's detail
never reaches it.

---

## 5. What surprised me

1. **The campaign has no ending.** Not "an unsatisfying ending" — no exit at all.
   Finishing THE TAKE, cleaning up, and walking into the Initiation leaves the
   save permanently in `post_heist` / `initiation: in_progress`, with the
   apartment door pointing back at the Initiation and `sleep()` refusing with
   `unknown_chapter`. The one authored terminal scene is the one scene that
   cannot report that it happened.

2. **The most thoroughly verified scene in the repo is unreachable.**
   `tools/verify-mansion.mjs` is 2716 lines and walks every room on foot
   *because* an earlier version teleported and reported 21/21 green on a build
   the owner said was broken. That engineering rigour sits behind a scene no
   campaign route can reach. `verify-silvercase.mjs` (1016) and
   `verify-enolasquatch.mjs` (1490) are the same story. Roughly **5,200 lines of
   verification tooling guard three orphans.**

3. **`silent-squatch-story.js` knows it is orphaned and papers over it in code.**
   `begin()` computes an `unrouted` boolean (`:56`) and hands the player the
   Silver Case if the save has never seen one (`:64-68`), with a comment naming
   the future fix. The seam is not an oversight — it is a documented,
   load-bearing workaround for a missing route.

4. **`bada_bing_two` and `squatch_graveyard` are the only scenes that do not
   return to the apartment.** Their `next` arrays are single-element chains
   (`campaign.js:388,394`) forming the campaign's only three-scene run without
   a hub stop: club → graveyard → motel. It works, but it means a crash between
   any two of them strands the save at a scene whose `next` does not include
   `apartment` — recovery depends entirely on `enter()` bypassing edge validation.

5. **A whole authored chapter (`big_night`) was superseded and left standing.**
   Recorded-VO cue names, answering-machine messages, radio and TV news, apartment
   dressing, a door branch and a call branch — all live code, all unreachable,
   preserved for grandfathered saves. It is the clearest evidence that the Day 4
   design was rewritten (golf + heist inserted) without pruning.

6. **`preview.html` is ahead of `preview-mode.js`.** Someone added Silver Case and
   Enola Squatch tiles to the dev index without adding the two matching pathname
   branches to `previewSceneForLocation` — even though the file already contains
   two hand-written branches (`initiation`, `mansion`) whose comments exist
   precisely to prevent that fallthrough.

7. **The apartment PC is a real second application boundary.** `src/arcade/mount.js`
   installs eight apps, two of which (`Campground` → `game/index.html`, `Doom`)
   are whole external web applications iframed over the monitor
   (`src/arcade/campground.js:17`, `src/arcade/webapp.js`). The campground game is
   simultaneously a documented "experience" in the README and a diegetic prop.
