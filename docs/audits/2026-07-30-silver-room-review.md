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

## Owner rulings — 2026-07-30 morning

1. **Campaign slot**: the date is Day 3 EVENING — wake at noon after the
   Motel, Delia calls, the Silver Room is that evening. Booskibro's
   big-night call and the Initiation MOVE TO DAY 4 (sleep after the date
   turns the page). The Goodfellas calm-before-the-verdict beat.
2. **Delia's radio handle changes** — she is NOT Hog Mama; pick a new
   on-air name and update the intro references. Circle canon untouched.
3. **Booski stays the cab driver** — the patriarch moonlighting is the joke.
4. (Earlier ruling) The mission is the Goodfellas Copacabana parody and is
   part of the campaign, not optional.
