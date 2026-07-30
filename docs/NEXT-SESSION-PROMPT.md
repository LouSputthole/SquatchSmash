# Next-session prompt

Copy everything below into a new Codex session.

---

You are taking over the SquatchSmash consolidation as lead developer and
technical director. Continue from the documented GitHub checkpoint; do not
restart the repository audit and do not work from `main`.

Repository:

- GitHub: `https://github.com/LouSputthole/SquatchSmash`
- Canonical integration branch:
  `integration/post-airstrip-prep-20260729`
- Production `main` is still the old standalone Squatch Smash and must not be
  force-pushed, overwritten, or used as the implementation base.

First:

1. Fetch origin, switch to the canonical integration branch, pull
   fast-forward-only, and confirm the worktree is clean.
2. Read these files completely before changing code:
   - `docs/CONSOLIDATION-HANDOFF.md`
   - `docs/CHARACTER-ALIGNMENT.md`
   - `docs/NEXT-SESSION-PROMPT.md`
   - `README.md`
   - `docs/GAME-PLAN.md`
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
- Day One apartment → Bada Bing One → apartment → Squatchfather →
  apartment/sleep is connected.
- The Beef Run is integrated at `beefrun.html`: Booskibro's answered call
  routes the apartment door there, the mission persists checkpoints, cargo,
  detection, landing rank, and completion, a reload resumes in the cockpit,
  and the end card returns home. `verify:beefrun` (13) and `check:flight`
  cover it. Preserve its flight model, terrain, and mission geography as
  canonical.
- The post-airstrip state contract, Lou's second call, reused Bada Bing Two,
  direct Jerky Motel transition, and Motel return exist.
- `preview.html` opens the Beef Run, Motel, Bing Two, Squatchfather, and the
  unchanged Initiation in page-local memory without reading or writing the
  real save.
- The apartment/computer, Squatchfather spawn, Bada Bing geometry/NPC/rain,
  and first-person Motel/Manny/pool/interior playtest fixes are implemented and
  verified. Preserve those fixes.
- Initiation is intentionally unchanged until the user has tested it.

Locked character/story canon:

- Prospect is **Tony Squatchtana**, an adult human prospect trying to join the
  Sasquatch family.
- Big Uncle Lou Sputthole is the Lou at the Bing.
- Captain Lou Sasole is a separate character and owns the Beef Run/airstrip
  thread.
- Display **Booskibro**; `booski` remains the stable save/voice ID.
- Manny is an adult human, Tony's friendly Motel ally, and may never enter
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

Immediate implementation objective:

The Beef Run integration is complete and verified (2026-07-30). Continue the
consolidation in this order:

1. Extend the authored time ledger across the remaining mission/return beats
   (Bing Two travel/completion, Motel travel/completion, returns home), the
   same way `travel.airstrip` and `mission.airstrip` were added.
2. Add the final apartment return/big-night call and route the current
   Initiation through normal campaign state without rewriting the scene.
3. The 2026-07-29 scene-polish backlog is largely DONE (2026-07-30 commits
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
   pre-stage + glue-minigame pacing/moan, and the Manny "fellow prospect"
   relabel decision.
4. A human playtest gate sits between each polish pass and the next scene.

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
- Keep commits focused and understandable. Push only the canonical integration
  branch; do not merge or force-push `main`.
- Before any push, run `npm test`, `npm run check`, `npm run check:flight`,
  and every focused verifier in `package.json`; inspect browser console
  errors; update documentation and exact check counts; verify the remote SHA.

Use actual code and runtime evidence. Do not call a scene complete merely
because files exist, and do not replace working systems for cosmetic
organization. If implementation reaches a character or ending decision not
covered above, stop at a clean checkpoint and ask the user focused design
questions.

---
