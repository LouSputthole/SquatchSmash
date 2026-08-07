# Right the First Time

**Date:** 2026-08-06. The owner, after four scenes shipped with the same
classes of fault: *"I want to create ways to do this shit all right the first
time. What are systems and procedures we could put in place to make sure this
shit is right?"*

This is the answer, written from the defects this project has actually paid
for — every rule below cites the incident that bought it. The short version:
**every fault the playtests keep finding belongs to a small number of
measurable classes, and each class already has, or now has, a machine that
catches it. The procedure is: no scene ships without its machines green.**

---

## 1. The defect classes, and the machine that catches each

| Class | Example the owner found | The machine |
|---|---|---|
| Floating / sunken / coplanar / mirrored / inverted geometry | "Cellar sign still floating" · "black bar… non-stop flicker" (a wall slab through 6.8 m of glazing) · chairs disassembled in mid-air (per-plank rotation about own centres) | `node tools/scene-audit.mjs <scene>` — boots the real scene, measures the built matrices, ranks findings |
| Things placed inside other things | Four pictures inside the surfaces they hang on; a trophy portrait 550 mm inside a marble column; the case delivered *into a wall* | Same audit (COPLANAR/containment), plus the per-scene verifier walking ON FOOT — `verify:mansion` walks every room through its real doorways precisely because a teleporting verifier once reported 21/21 green on a build the owner called broken |
| A scene that won't boot at all | `cast?.setCordInHand?.()` on a `const` in its temporal dead zone — **optional chaining does not save you from a TDZ**; only `verify:mansion` caught it | Every scene's `verify:*` boots the page in a real browser. `verify:boot-errors` covers the guard rails |
| Mission softlocks | Aubbie never left the lab: three method-name mismatches (`stepOut` vs `leaveLab`…) each silently swallowed by `?.()` | **Contract tests between mission and set** — `tests/silent-squatch-lab-contract.test.mjs` builds the real lab and asserts the mission's expected surface exists. Write one wherever a mission drives a scene object it doesn't own |
| Silent-failure stalls | Siege: F on the landing did nothing, three different ways, and said nothing | **The refused-input rule:** every gated interaction, when refused, must SAY WHY (borrow the hint line). The siege verifier now asserts refusals speak. Adopt per scene |
| Written-but-unwired audio | 33 `silent.*` cues authored in `SilentSquatch.js` that are not in the manifest — `npm run sfx` can never render them; invisible to `check` because they go through a local `sfx()` helper | Per-scene `tools/<scene>-vo.mjs` + `check:<scene>-vo`, and **never call audio through a local wrapper that hides the cue name from the greps**. ENGINE-TRAPS #3's corollary; it has now cost lines three times |
| Recording drift | Door-excuse takes matching neither the old nor the shipping text; `needsRerecord` flags shipping for weeks | `VOICE-LINES-TODO.md` / `VOICE-LINES-NEEDED.md` are GENERATED (`npm run audio:todo`, `voice:needed`) — regenerate after every dialogue change; the sheet is the truth, not memory |
| Stale docs lying to the next contributor | "not yet recorded" comments on fully recorded banks; a handoff pointing at a commit that isn't in this repo | Doc claims about state belong in generated files or verifier assertions. A hand-written "current state" line is stale the day after it's written |
| Cross-scene inconsistency | "We've fixed a lot of things in some scenes that aren't fixed in others" | The audit's full sweep (`node tools/scene-audit.mjs`) covers all 15 scenes including the siege; shared systems (weapons, PostFX, audio scoping, inventory) get adopted per scene with a verifier assertion so adoption is checkable |

## 2. The Definition of Done for a scene

A scene (new, or newly touched) is DONE when all of these are green, in this
order — cheap machines first:

1. `npm run check` — parses every file, validates manifests, `check:<scene>-vo`.
2. `npm test` — including the scene's contract tests (mission↔set, outfits,
   voice catalogs).
3. `node tools/scene-audit.mjs <scene>` — zero NEW findings vs. the previous
   run; pre-existing ones triaged, not ignored (half are legitimate — a hanging
   lamp IS floating; judgement stays with the reader).
4. `npm run verify:<scene>` — the on-foot browser playthrough. **A scene
   without a verifier is not done as a scene**; the graveyard ran without one
   for weeks and it was the only routed scene nobody could prove worked.
5. The recording sheets regenerated if any line changed.
6. The preview page reaches it — a play link, and `?checkpoint=` jumps for
   anything longer than five minutes (heist/beefrun/enola/siege pattern). **The
   siege sat finished and verified for days and the owner had never seen it,
   because nothing linked to it and the deploy didn't stage its html.**
7. The Pages workflow stages its html (`.github/workflows/pages.yml` copies by
   name — a new page is invisible in production until it's in that list).

## 3. Process rules that came out of this session

- **Verify with the machine the moment a fix lands, not at the end.** The
  no-wake redesign deleted an export its own verifier imported; the deferred
  browser run was exactly where it would have surfaced. If the verify must be
  deferred (machine load), the deferral is a TODO with an owner, not a pass.
- **Contract over courtesy in optional chaining.** `?.()` turns a wiring bug
  into a silent no-op. Where two modules must agree on names, write the
  contract test; where a call is genuinely optional, say so in a comment.
- **Generated files never merge by hand.** `VOICE-LINES-*.md` regenerate;
  `assets/sfx/manifest.json` merges by cue name, deletions win over stale
  copies (a union merge resurrected 30 deliberately-buried cues once).
- **Fixture discipline in tests.** `assert.deepEqual` walking two THREE.Group
  trees took the machine to 15.4 GB and killed every agent on the box. Compare
  names/ids/counts, never whole scene-graph objects.
- **Commit per item during long passes.** Three container restarts ate three
  uncommitted work sessions; the fourth attempt committed after every item and
  lost nothing.
- **Stale notes are real work.** Roughly a quarter of the owner's punch list
  was already fixed on main by the time an agent read it. First step of any
  punch-list item: verify it still reproduces; report "already fixed" as a
  result, not silence.
- **Shared-geometry changes get a coordination note.** The siege copies base
  coordinates in 8 files and cross-checks them against the live builders; the
  mansion owner's report listed every wall moved. That handshake is the reason
  the two largest parallel passes merged without breaking each other.

## 4. What to build next (the gaps the machines still have)

- **Name everything.** 9,252 meshes in the mansion audit carry no name because
  `cylinder()`/`sphere()` in `src/world/build.js` silently drop the `name`
  option — no check can ever assert an anonymous mesh. Fix the two builders,
  then burn down the unnamed count per scene.
- ~~**`silent.*` cue sync.**~~ **DONE, 2026-08-06.** All of PROJECT SILENT
  SQUATCH's sounds are in the manifest: `tools/mansion-sfx.mjs`
  (`npm run sfx:mansion` / `check:mansion-sfx`) promotes the scene's own cue
  table, `npm run check` fails on drift between the two, and they appear on
  `VOICE-LINES-TODO.md` under their own heading. The pass that closed it added
  sixteen more (the owner's "proper SFX pass": lab hums, core sounds, gunshots
  with room tone, cleanup foley), so the number is 51 rather than 33 — and
  three of the original ones turned out never to have been PLAYED by anything,
  which is the same fault one level down. A cue nothing triggers is a line item
  on a recording sheet that will never be heard.
- **Audit-in-CI.** The sweep deliberately doesn't gate (half its findings are
  legitimate), but a per-scene BASELINE COUNT can: fail CI when a scene's
  finding count rises above its recorded baseline. Ratchet down, never up.
- **A boot-smoke matrix.** One cheap CI job that opens every html entry
  headless and asserts no page error and a non-black frame — the TDZ class,
  caught in seconds for every page at once.
- **Verifier flake ledger.** Two known single-frame-sample flakes
  (`verify-beefrun` Cecilio mouth check, siege audit "target page closed").
  Track them by name; a flake nobody writes down becomes "the verifier is
  broken, ignore it."
