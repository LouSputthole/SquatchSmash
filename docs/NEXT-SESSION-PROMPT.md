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
- The post-airstrip state contract, Lou's second call, reused Bada Bing Two,
  direct Jerky Motel transition, and Motel return exist.
- `preview.html` opens Motel, Bing Two, Squatchfather, and the unchanged
  Initiation in page-local memory without reading or writing the real save.
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

Selectively integrate the finished Beef Run from
`origin/claude/beef-run-mission-di1vq9` at audited tip `f4ed391` into the
canonical integration branch. Do not merge the branch wholesale; it forked
from the older Squatch Life commit `570d05c`.

Bring across and adapt:

- `beefrun.html`
- `src/beefrun/*`
- `tools/beefrun-vo.mjs`
- `tools/flight-test.mjs`
- only the needed package scripts, VO manifest entries, and check/audio
  tooling

Required integration rules:

- Adapt Beef's `player.groundAt = terrainHeight` hook to the integration
  runtime's existing `world.groundAt = terrainHeight` contract.
- Enter through Booskibro's answered Day Two call.
- Resolve the contact as stable character ID `captain_lou_sasole`, never
  `lou`.
- Preserve Beef's aircraft, flight model, terrain, mission geography, and
  flight controls as the canonical implementation. Adapt its outer boundaries
  to the shared campaign/save, authored-time, objective, input-ownership, audio,
  and scene-transition contracts; do not rewrite verified flight behavior just
  to resemble the apartment player controller.
- Persist checkpoints, cargo, detection/failure/retry state, landing result,
  completion, and the return to the apartment.
- Add a save-isolated Beef Run preview route.
- Preserve the verified apartment, computer, Bing, Squatchfather, Motel, and
  current Initiation behavior.
- Keep commits focused and understandable. Push only the canonical integration
  branch; do not merge or force-push `main`.

Verification required before declaring the Beef Run integrated:

1. Run its flight-model test and static check.
2. Browser-test normal apartment departure after Booskibro's call.
3. Meet Captain Lou Sasole, complete preflight, takeoff, navigation/border
   crossing, remote landing, jerky pickup/loading, low-altitude return,
   detection avoidance/failure retry, home landing, and mission completion.
4. Return to the apartment with durable state and confirm the next Lou call
   does not duplicate.
5. Continue through Bing Two → Motel → apartment using normal transitions.
6. Reload at meaningful checkpoints and confirm state/calls do not replay.
7. Run every focused verifier listed in `package.json`, inspect browser console
   errors, update documentation and exact check counts, commit, push, and
   verify the remote SHA.

Use actual code and runtime evidence. Do not call a scene complete merely
because files exist, and do not replace working systems for cosmetic
organization. If implementation reaches a character or ending decision not
covered above, stop at a clean checkpoint and ask the user focused design
questions.

---
