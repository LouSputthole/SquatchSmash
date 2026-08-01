# Next-session prompt

Copy everything below into a new Codex session.

---

You are taking over the SquatchSmash consolidation as lead developer and
technical director. Continue from the documented GitHub checkpoint; do not
restart the repository audit. `main` is the deployed canonical game, while
`codex/recovered-playtest-fixes-20260731` is the active integration line that
carries the current recovery and playtest work.

Repository:

- GitHub: `https://github.com/LouSputthole/SquatchSmash`
- Canonical production branch: `main`
- Published checkpoint: current `main` (verify with `git rev-parse origin/main`)
- Active integration branch: `codex/recovered-playtest-fixes-20260731`
- Live Pages: `https://lousputthole.github.io/SquatchSmash/`
- Never force-push or overwrite `main`; make focused branches and reviewed PRs.

First:

1. Fetch origin, switch to `codex/recovered-playtest-fixes-20260731`, pull
   fast-forward-only, and inspect `git status --short`. Preserve any active
   in-progress work on that integration line; do not reset it to `main`.
2. Read these files completely before changing code:
   - `docs/CONSOLIDATION-HANDOFF.md` (historical; read its supersession note)
   - `docs/CHARACTER-ALIGNMENT.md`
   - `docs/NEXT-SESSION-PROMPT.md`
   - `README.md`
   - `docs/GAME-PLAN.md`
   - `docs/AUDIO-AUDITIONS.md`
3. Read the relevant vendored Three.js references under `.claude/skills/`
   before camera, geometry, interaction, lighting, post-processing, material,
   or asset-lifecycle work. These are engineering references, not runtime
   dependencies.
4. Run `npm test` and `npm run check`. Treat the exact verification results in
   the handoff as the baseline and investigate any drift before proceeding.

Current product facts:

- The apartment is the recurring hub.
- Story time advances only through authored tasks, calls, travel, missions,
  and sleep. Idle real time must not move campaign time.
- The whole confirmed order is now connected end to end through campaign state:
  apartment → Bada Bing One → apartment → Squatchfather → apartment/sleep →
  Beef Run → apartment → Bada Bing Two → Jerky Motel → apartment/sleep →
  **the Silver Room date** → apartment/sleep → Initiation on Day 4.
- The Beef Run is integrated at `beefrun.html`: Booskibro's answered call
  routes the apartment door there, the mission persists checkpoints, cargo,
  detection, landing rank, and completion, a reload resumes in the cockpit,
  and the end card returns home. `verify:beefrun` (22) and `check:flight`
  cover it. Preserve its flight model, terrain, and mission geography as
  canonical.
- The post-airstrip state contract, Lou's second call, reused Bada Bing Two,
  direct Jerky Motel transition, and Motel return exist.
- **The Silver Room is integrated (2026-07-30).** Home from the Motel at
  4:30 AM on Day 3, the door refuses until Tony sleeps; sleeping opens the new
  `date` chapter at Day 3 noon; **Margo Salas** rings once that afternoon
  (`DATE_MARGO_CALL`, `vo.call.margo.date.*`, +5 minutes) and unlocks
  `MISSION_IDS.SILVER_ROOM`; the door applies `travel.silver_room` (Day 3,
  7:30 PM) and navigates to `silver.html`. `src/core/silver-story.js` gates the
  evening and folds the mission's `persist()` payload into campaign state;
  completion applies `mission.silver_room` (Day 3, 11:20 PM) and the end card
  goes home. `verify:silver` (112) plays the evening; `verify:silver-story` (20)
  rides the campaign seam.
- The final apartment return is connected. After the date the door refuses
  until Tony sleeps; sleeping opens `big_night` at **Day 4, 10:00 AM**;
  Booskibro rings once about the big night (`vo.call.booski.bignight.*`,
  +5 minutes) and unlocks the Initiation; the door then applies
  `travel.initiation` (**Day 4, 7:00 PM**) and really navigates to
  `initiation.html`. `verify:big-night` (19) covers the whole beat.
- Sleep is the chapter machine and chapter is still separate from calendar day:
  `day_one` → `day_two` (needs Squatchfather, wakes Day 2 7:00 AM) →
  `date` (needs the Motel, wakes Day 3 12:00 PM) → `big_night` (needs the
  Silver Room, wakes **Day 4 10:00 AM**). `big_night` is the last chapter.
- `SCENE_IDS.INITIATION` is registered with no outbound edge because the scene
  does not read the campaign or report completion. `src/initiation/*` and
  `initiation.html` are byte-identical to the pre-consolidation build.
- `preview.html` opens the Beef Run, Motel, Bing Two, Squatchfather, **the
  Silver Room**, and the unchanged Initiation in page-local memory without
  reading or writing the real save. `verify:preview` (16) lists six.
- The apartment/computer, Squatchfather spawn, Bada Bing geometry/NPC/rain,
  and first-person Motel/Snow/pool/interior playtest fixes are implemented and
  verified. Preserve those fixes.
- Initiation is intentionally unchanged until the user has tested it.
- Apartment pause includes an explicit two-step **Restart campaign** action.
  It resets the story save to Day One but preserves Squatch Smash career/high
  score storage. Big Uncle Lou's Bada Bing objective briefing locks movement
  until its authored end; ambient dialogue remains non-modal.

Locked character/story canon:

- Prospect is **Tony Squatchtana**, an adult human prospect trying to join the
  Sasquatch family.
- Big Uncle Lou Sputthole is the Lou at the Bing.
- Captain Lou Sasole is a separate character and owns the Beef Run/airstrip
  thread.
- Display **Booskibro**; `booski` remains the stable save/voice ID. He is a
  boss and does **not** drive the cab in the Silver Room — that driver is a
  hired-car stranger who has never met either of them, deliberately.
- The Day 3 date is **Margo Salas** (`CHARACTER_IDS.MARGO`, role `civilian`),
  who runs the kitchen at the Blue Hour on Ashland. She is **not** Hog Mama and
  is **not** on 97.8 — the family's own station would put her inside the
  family, and you do not take the family on a date. `hogmama` stays a Circle
  id and a radio voice only. Her `voices.margo` manifest entry is a
  **provisional placeholder** borrowing `hogmama`'s ElevenLabs id; recast it
  before recording anything.
- **Ape** is `CHARACTER_IDS.APE` — one identity shared by the Initiation and
  his cameo at the Silver Room's pillar table.
- Snow is an adult human, Tony's friendly Motel ally, and may never enter
  player-hostile targeting or damage logic.
- Circle members present as humans before the Initiation verdict; supplied
  named face photos are authoritative.
- The five founders are Booskibro, Big Uncle Lou Sputthole, Rippinflow, The
  Shubenator, and DeathMegatron.
- Prospect One's execution and explicit gore remain.
- Future Initiation rewrite: recall Tony's campaign accomplishments, execute
  the failed rival prospects, admit Tony only if he completed the required
  campaign work, then visibly transform Tony and every recognized family
  member into literal sasquatches. Do not implement this rewrite until the
  user has playtested the current scene.

IMMEDIATE PICKUP (2026-07-31): fetch the active recovery branch and run the
stated safe-pickup commands before trusting any historical SHA or PR status.
The current focused follow-up adds campaign reset, objective-dialogue movement
locks, actual phone audio playback verification, and a freshly generated
`VOICE-LINES-TODO.md`.

Current recording queue: **0 voice lines and 0 effects**. The recovered 112
Bada Bing full-conversation takes are indexed and browser-verified as decoded
audio. The Day Two `vo.call.booski.airstrip.*` and second-Bing
`vo.call.lou.bing_second.*` banks are also present in the manifest and indexed;
do not recreate them. After any future recording pass run `npm run sfx:listen`,
then `npm run audio:todo` and the affected browser gates.

The phone is campaign-derived: it has a readable Family thread, dynamic
mission texts, wheel navigation in the apartment and Bing, and persisted read
markers in the existing campaign event ledger. Bing voice validation now proves
five recorded voice surfaces decode, enter a nonzero-gain SFX graph, and end at
their full decoded duration; do not weaken this to a cue-name-only check.

Current open production decisions: seven Family face photos; Margo's final
voice recast (her manifest mapping remains provisional); the unnamed
Family-styled guard at Lou's office; Rico/Chino dialogue; and the Beef Run
left-seat interior shell. Snow is the human, friendly Motel ally; do not call
him Manny or allow him into player-hostile logic. The Initiation playtest gate
below still stands.

Immediate implementation objective:

The Beef Run integration, the big-night apartment beat, and the Silver Room
date are all complete and verified (2026-07-30). Continue in this order:

1. **A human playtest of the current Initiation is the next gate.** The
   apartment door now reaches it through ordinary campaign state, and the scene
   is deliberately still unchanged. Nothing in `src/initiation/*` may change
   until the user has played it. After that playtest, implement the approved
   ending: accomplishment review, rival deaths, Tony's verdict, mass
   transformation, plus the scene's first `campaign.enter` claim, completion
   time event, and outbound edge home.
2. **The Silver Room's remaining work is owner calls, not code.** Recast
   Margo's voice off the `hogmama` placeholder in `assets/sfx/manifest.json`,
   and decide whether the recorded date outcome
   (`missions.silver_room.outcome` / `seeingHerAgain`) should be visible
   anywhere in the Initiation. Nothing is blocked on either.
3. The Booskibro-airstrip and Lou-second-call cue groups are authored in the
   manifest and have indexed recordings. Do not recreate them. Use
   `npm run audio:todo` for the live recording backlog instead.
4. The 2026-07-29 scene-polish backlog is largely DONE (2026-07-30 commits
   `b2f784f` through the club-audio pass; details in
   `docs/audits/2026-07-30-bada-bing-audit.md`): Squatchfather
   chairs/diners/waiter/revolver/blood, Motel pool/doors/car/headlights/
   stuck-fighter, Bing doorways/movers/stage/gambling, office radio +
   zone-muffled music + sallie-j on the floor, and the sounds pass (revolver,
   floorboards, car family, poop redone). Still open from the backlog:
   performer detail/dance moves and Bing character-style unification with
   Lou's face photo (blocked on the user's style/face decisions), fancy
   framed sasquatch-logo artwork, blackjack/slots VO lines (prospect
   win/lose, dealer), the TV program follow-up, the apartment crooked-frame
   pre-stage + glue-minigame pacing/moan, and richer Snow-specific Motel
   dialogue.
5. A human playtest gate sits between each polish pass and the next scene.

Standing integration rules:

- Preserve the Beef Run's aircraft, flight model, terrain, mission geography,
  and flight controls as canonical. Its campaign boundaries live in
  `src/beefrun/main.js` (boot/story/input), `src/beefrun/mission.js`
  (checkpoint/detection/ending hooks), and `src/core/airstrip-story.js`.
- Resolve the airstrip contact as stable character ID `captain_lou_sasole`,
  never `lou`. The mission speaker key is `SASOLE`, voice profile `lou2`,
  cue namespace `vo.beefrun.sasole.*`.
- Preserve the verified apartment, computer, Bing, Squatchfather, Motel, and
  current Initiation behavior.
- Keep commits focused and understandable. Push a focused branch, open a
  reviewed PR to `main`, and never force-push `main`.
- Before any push, run `npm test`, `npm run check`, `npm run check:flight`,
  and every focused verifier in `package.json`; inspect browser console
  errors; update documentation and exact check counts; verify the remote SHA.

Use actual code and runtime evidence. Do not call a scene complete merely
because files exist, and do not replace working systems for cosmetic
organization. If implementation reaches a character or ending decision not
covered above, stop at a clean checkpoint and ask the user focused design
questions.

---
