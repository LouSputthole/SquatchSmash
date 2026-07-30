# Silver Room (Front and Center) review — 2026-07-30

Full findings from the Opus review of the imported, unintegrated mission at
`b311555`. **Status: mechanical findings 1-12 are FIXED and merged
(verify:silver grew 54 → 75 checks; balance:silver accounts every event with
a real source scan — two events removed with reasons, CallTaken/CallDeclined
deferred to the phone-port integration).** The canon questions and the
integration checklist below still wait on the owner and the integration pass.

## Owner rulings needed (canon)

1. **Hog Mama collision**: the date, Delia Vance, is "on air as Hog Mama" —
   but `hogmama` is a locked Circle ID (Matriarch, authoritative face photo).
   Is Delia THE Hog Mama (then she needs the registry ID, face, and her
   Matriarch role reconciled with being Tony's date), or does her radio
   handle change?
2. **Booskibro drives the cab**: the taxi driver is named Booski and can be
   tipped $40. Keep the patriarch moonlighting as the driver, or rename him?
3. **Bare "Lou" (12 sites)** in silver dialogue — context implies Big Uncle
   Lou; the two-Lous rule requires it be explicit. Also "Lou has two radio
   shows" is new characterisation touching the Hog Mama question.
4. **No stable IDs in src/silver** — cast keys are scene-local; `ape` is used
   for a Circle member. The integration pass must route through
   `core/characters.js`.

## Integration checklist (for the "work it in" pass)

- Port the skipped `src/bing/cast.js` dress additions (`chef|porter|gown`)
  AND pass gender/bodyShape from silver call sites — without this Delia,
  the gowned diners, cooks, and porters all render as plain-shirt male
  frames. Highest-value item.
- Port `src/core/phone.js` Delia CALLS entry (the mission's entry point) and
  the in-mission ring (Woo.CallTaken/CallDeclined).
- Port the Bing prior-encounter hook (`src/bing/main.js` diff).
- Campaign: new SCENE/MISSION/TIME_EVENT ids, navigateCampaign to
  silver.html, return path; fold `mission.persist()`/`squatch.frontAndCenter`
  into campaign state.
- Tooling: add src/silver to check.mjs cueFiles AND author its ~30 synth-only
  cue names into assets/sfx/manifest.json in the same pass; add silver to
  verify-boot-errors; extend verify-silver to drive startSway()/
  offerInvitation() through the real paths (which is what hid the criticals).
- Landmine noted: during sitAt/standFrom tweens `player.eyeHeight` is
  absolute, so the third groundAt argument evaluates to 0 — fine at y=0
  tables, wrong if anything is ever seated above/below ground floor.

## Mechanical findings being fixed (summary)

1. startSway(): swayRunning=true 900ms before sway.start() → finishSway()
   'bad' on next frame + double-run (no re-entry guard). Woo.SwayCompleted
   unreachable.
2. Seated faceYaw points at the stage; Delia is behind his head outside the
   yaw clamp. Swap rows or faceYaw=π.
3. Cutscene.finish() unconditionally date.release() → she leaves her chair
   mid-show. Opt-out or re-seat in onDone.
4. Woo.InvitationRushed fires every run (inState reset by setState;
   resolve() never returns 'none'). Time the judgement properly.
5. taxi.leave() at +45s makes DriverTipped/FullTipStreak/"EVERYBODY EATS"
   miss-able by reading dialogue; interactable never unregistered.
6. sitAtTable() never seats Delia unless the optional chair-pull pad is used.
7. Checkpoints are write-only (restore only via debug.load) and omit
   mission.state/roundsDone/seated/ledger/latches.
8. finishSway() setState('performance') is refused (backwards in STATES) —
   mission stuck in 'sway', impatience barks stop.
9. flags.invitation='crude' never fires Woo.CrudeInvitation at score ≥80.
10. Ten scoring events unreachable (WaitedForDate, KeptPace, DoorInHerFace,
    TipRefused, WorkerInsulted, StaredAtStage, DrinkSpilled, FightStarted,
    GenerousTip, CallTaken/Declined) — balance doc overstates coverage;
    hotPan has no TIP_POINTS entry so the hazard→tip path is dead.
11. Sway.press() can be mashed — gate on the current beat index.
12. The band set loops forever → theOne re-fires offerSway/toasts.

## Integration pass — 2026-07-30, DONE

Every item on the checklist above is implemented. Disposition:

| Checklist item | Disposition |
|---|---|
| `bing/cast.js` dress additions + gender/bodyShape | Ported. `chef`/`porter`/`gown` added, existing kinds untouched, silver call sites pass the frame params, diner/queue rolls made coherent. Render-probed headless: all three read correctly. |
| `core/phone.js` Delia CALLS entry | **Adapted, not ported.** The campaign owns scheduled calls (`calls: []`), so she is `DATE_MARGO_CALL` in `src/core/apartment-story.js`, not an entry in the legacy `CALLS` array. Her copy comes from the recast's phone lines. |
| Bing prior-encounter hook | Ported, Scene One only, gated behind `includeMargo`. Sets `mission.flags.gaveNumber`; **not** a gate on the date. The branch's direct `silver.html` link out of the Bing ending was deliberately dropped — the campaign owns navigation. |
| Campaign ids, navigation, return path, persist fold | Done. `SCENE_IDS.SILVER_ROOM`, `MISSION_IDS.SILVER_ROOM`, `EVENT_IDS.MARGO_DATE_CALL`, `travel.silver_room`, `mission.silver_room`, `src/core/silver-story.js`. `squatch.frontAndCenter` is gone. |
| Tooling: check.mjs cueFiles + manifest | Done. The scan caught **25** cues that existed nowhere in the manifest; all authored with prompts, plus `vo.call.margo.date.1..4` and a provisional `voices.margo`. |
| Tooling: verify-boot-errors | Done (6 → 8). `silver.html` converted to the shared `boot-guard.js` panel. |
| Tooling: extend verify-silver through real paths | Already done by the mechanical-fix pass (54 → 75); now 76, and it boots through `?preview=1` so the new story gate opens. |
| Landmine: absolute `player.eyeHeight` in `groundAt` | **Still open.** Untouched by this pass — it remains correct at y=0 tables and wrong if anything is ever seated off the ground floor. |

Canon questions 1-4 from the top of this file are all resolved: 1 and 2 by the
recast (see below), 3 by making all 13 bare "Lou" sites explicitly Big Uncle
Lou, and 4 by adding `MARGO` and `APE` to `src/core/characters.js`.

## Owner rulings — 2026-07-30 morning

1. **Campaign slot**: the date is Day 3 EVENING — wake at noon after the
   Motel, Delia calls, the Silver Room is that evening. Booskibro's
   big-night call and the Initiation MOVE TO DAY 4 (sleep after the date
   turns the page). The Goodfellas calm-before-the-verdict beat.
2. ~~**Delia's radio handle changes** — she is NOT Hog Mama; pick a new
   on-air name and update the intro references. Circle canon untouched.~~
   **SUPERSEDED** by the branch recast at `48f028b`, which the owner endorsed:
   she is not a radio personality at all. She is **Margo Salas**, who runs the
   kitchen at the Blue Hour on Ashland — a civilian with no stake in Lou, the
   Bing, or anybody in the Silver Room, which is the only reason her good
   opinion costs anything. No new on-air name was invented. Circle canon and
   `core/stations.js` are untouched; `hogmama` remains a Circle id and a radio
   voice.
3. ~~**Booski stays the cab driver** — the patriarch moonlighting is the
   joke.~~ **SUPERSEDED** by the same recast: Booski is a boss and does not do
   the school run. The driver is a hired car and a man who has never met either
   of them — the only person all evening who does not know Prospect's name, and
   the only one who says thank you out loud for money, which is what the rest
   of the night is measured against.
4. (Earlier ruling) The mission is the Goodfellas Copacabana parody and is
   part of the campaign, not optional.

### Superseded by the branch recast (48f028b, owner-endorsed)

Rulings 2 and 3 above are superseded: the mission branch's own recast commit
makes the date MARGO (not a radio personality; name lives in one data field)
and the driver a hired stranger — deliberately the one person all evening who
does not know Prospect's name. The integration reconciles that recast with
the merged review fixes rather than inventing a new radio handle or keeping
Booski in the cab.
