# Scene Certification

Squatch Smash now has one behavioral Scene Contract Module. It exists to stop
an import, object count, or empty scan from masquerading as proof that a player
can use a scene.

The registry is `src/core/scene-contracts.js`. Each campaign scene declares its
runtime entrypoints and its input, camera, objective, interaction, checkpoint,
minimum-subject, and progression obligations. The allowed dispositions are:

- `required`: certification must execute and pass the obligation.
- `debt`: the behavior is required, but the current Implementation is local or
  otherwise outside the canonical architecture.
- `known_failure`: current evidence proves the obligation fails.
- `intentional_na`: a reviewed exception with a concrete reason.
- `unknown`: the Adapter cannot currently observe enough to decide.

`UNKNOWN` is not green. A zero-subject scan is not green. Importing a shared
Module is not proof that its Interface is connected.

## The five certification foundations

### 1. Scene Contract

`src/core/scene-contract.js` validates the registry and generates semantic
smoke obligations. `tools/scene-contracts.mjs` prints the entrypoint inventory;
`tools/verify-semantic-smoke.mjs --strict` enforces contract readiness while
debt, known failures, or unknown declarations remain. It is static and is not
itself behavioral certification; `npm run certify:semantic-smoke` owns that.

Adding a campaign scene without a contract fails the registry test. Alternate
entrypoints stay separate: the two Bing 2 roots and Mansion, Mansion Return,
and Mansion Siege are not collapsed into one reassuring row.

### 2. Real-input Semantic Smoke

`src/core/first-person-input.js` is the canonical browser Adapter for shared
Player input. It owns translated movement keys, mouse look, pointer lock,
interaction press/release, focus-loss cleanup, pause, resume, and observable
input receipts. Scene policy such as numbered dialogue choices remains local.

The Special Meeting remains the reference smoke:
`tools/verify-specialmeeting.mjs` clicks the canvas, acquires pointer lock,
moves the mouse, holds a real movement key, and measures Player displacement.
The canonical Adapter is now constructed by every non-frozen playable
first-person root. Scene-local policy lives in small `controls.js` seams rather
than duplicate DOM event stacks. Initiation is deliberately still reported as
`UNKNOWN` while its human-playtest freeze remains in force.

Focused `--input-only` verifier modes make the real-input obligation cheap and
bounded enough to run while changing a scene. A migration is not promoted only
because the architecture lint passes: the browser must still prove click,
pointer lock, look, movement, key release, and a clean error channel. A renderer
diagnostic, a shared-HTML sibling failure, or an unbounded verifier remains
`UNKNOWN`/debt even when the input measurements themselves succeed.

Generated obligations cover every registered runtime entrypoint. An entrypoint
without an executable browser Adapter remains `UNKNOWN`/debt until its real
state can be observed. HTTP 200 is boot evidence, not route evidence: a route
passes only when the runtime publishes the exact entrypoint, href, composition
root, and observed exit set. Architecture lint likewise requires the canonical
input Adapter to be constructed; an unused import is a failure.

### 3. Mission liveness

`src/core/mission-liveness.js` evaluates one invariant:

```text
terminal
OR pending automatic transition
OR at least one enabled and reachable progress action
```

The liveness Interface distinguishes known `NO`, unobserved `UNKNOWN`, and a
probe `REFUSED` by its Adapter. `tools/verify-scene-liveness.mjs` fails both
dead and unresolved states. Checkpoint and restore paths must be supplied as
their own labeled observations; an empty observation file is `UNKNOWN`.

The deterministic catalog still enumerates exported NO WAKE and Hot Dog state
models. `tools/verify-persisted-checkpoint-liveness.mjs` adds the separate live
Seam: it writes checkpoints through public Campaign APIs, proves the exact
serialized bytes survive a browser reload, boots the canonical non-preview
runtime, and requires one enabled production action to advance. Its owned
inventory is five NO WAKE checkpoints and four Hot Dog/Graveyard checkpoints.
Removing a path or replacing the action with a debug-only skip is a failure.

This live verifier does not replace full traversal. It proves durable restore
to a live production action; semantic smoke owns the physical player path to
that action. Long browser runners must also publish bounded phase progress.
Silence from an unbounded runner is an infrastructure `UNKNOWN`, never a pass.

### 4. Typed spatial meaning

`src/core/spatial-contract.js` separates what a volume *is* from where its
bounds happen to be. Current kinds include world, actor body, seat, vehicle,
prop, door, trigger, interaction, and spawn. Collision, vision, navigation,
and ballistics are independent channels.

The geometry Adapter preserves these facts. Staging and framing use them before
legacy heuristics, and Player ignores typed non-collision volumes. Vehicle and
Apartment collider producers now publish stable spatial IDs and semantic
types; required actor landmarks publish exact rendered eye/hip points instead
of relying on model origins.

Player-facing staging observes only actors that are actually rendered through
their ancestor visibility chain. Certification separately records the full
marker inventory, visible actors, and visibility-filtered actors, so hiding or
deleting cast cannot make debt disappear. The ratchet pins sorted actor IDs as
well as counts, preventing one hidden actor from being silently substituted for
another. Every geometry state declares either a minimum required cast or a
reviewed `intentional_na` reason. An intentional no-cast state must still
complete its staging and spatial scan; it does not erase untyped-volume debt.
Legacy untyped volumes therefore remain explicit
`UNKNOWN` coverage while compatibility heuristics keep old scenes analyzable.

### 5. Dialogue and audio truth

`AudioEngine` records every request as buffer, synth, stand-in, or silent,
including requested versus actual cue, start state, fallback reason, speaker,
and positional metadata. Authored dialogue defaults to `requiredRecorded` and
returns `accepted`, `retry`, or `drop` acceptance alongside its legacy result.

Browser certification may install this policy before a scene boots:

```js
window.__SQUATCH_QA_AUDIO__ = {
  strictRequiredRecordings: true,
  engines: [],
};
```

Strict QA throws when a required recording is silent, synthesized, or replaced
by a stand-in. Ordinary runtime fallback remains compatible until strict QA is
enabled. Shared weapon fallbacks publish their requested canonical cue so a
generic gunshot can no longer look like proof that the shotgun take played.
Variant barks now use `speakVariant()` and `AudioEngine.selectVoiceVariant()`;
legacy `AudioEngine.say()` delegates through that same pipeline rather than
maintaining a second speech engine. The Adapter preserves speaker/follower,
position, mix, subtitles, duration, analyser, bus, acceptance, and receipt
truth while selecting a decoded take exactly once.

Every observable browser Adapter must require an AudioEngine, a nonzero number
of required-recording receipts, and the expected scene-local cue prefix. A
receipt proves that the requested buffer was scheduled; it does not yet prove
physical audibility through the listener, gain graph, or output device.
Only canonical `AudioEngine` instances currently register with this policy.
Fully custom scene dialogue engines remain explicit future consolidation debt;
this pass removes the shared voice-variant fork without pretending every
scene-specific dialogue controller has already disappeared.

## Adoption rule

The canonical Modules are deep Seams; a scene should provide policy and data,
not another Implementation of their mechanics. Migration is incremental:

1. Declare the truthful disposition in the Scene Contract.
2. Add an Adapter that exposes real state; never infer a pass from source text.
3. Run the generated obligation with real browser input or explicit runtime
   observations.
4. Move local plumbing behind the canonical Interface.
5. Change `debt` or `unknown` to `required` only when the executable gate
   proves it.

This preserves Locality and compatibility while steadily increasing Leverage.
The registry is a ratchet, not a claim that the current game is already
certified.

## No-new-debt CI ratchet

Strict commands continue to answer whether certification is complete and stay
red while any debt or `UNKNOWN` remains:

- `npm run certify:scene-architecture`
- `npm run enforce:semantic-smoke-contracts`
- `npm run certify:scene-liveness`
- `npm run certify:spatial-semantics`

Pull-request CI instead runs `npm run certify:debt-ratchet`. Its reviewed
baseline is `tools/certification-debt-baseline.json`. Each architecture,
semantic-contract, liveness, and spatial record is pinned by a stable ID,
status, semantic fingerprint, and per-ID count. Therefore replacing one known
problem with a different problem fails even if the total stays flat. Changing
what an existing ID means or increasing its count also fails.

CI reads the trusted ceiling from the immutable pull-request base commit with
`git show`; it never trusts a baseline edited by the pull request. The
checked-in candidate must be a subtractive subset of that trusted ceiling *and*
must exactly match the current report. Therefore removing a record or reducing
its count requires lowering the baseline in the same change. Leaving the old
permission behind fails as `STALE_BASELINE`, preventing a fixed debt ID from
quietly returning later. Missing refs, shallow history, and git errors fail
closed. A missing baseline path is allowed only for the reviewed initial
bootstrap after the base commit resolves and `git ls-tree` proves absence.

Debt disappearance also requires proof that the audited subject still exists.
The baseline pins the complete architecture-finding, semantic-obligation,
liveness-state, and spatial-state proof inventories. Removing a scene,
entrypoint, checkpoint, state, or actor is therefore not accepted as fixing its
finding; previously observed proof IDs cannot disappear, and spatial actor
counts cannot shrink. Architecture and liveness debt can be removed only when
the same finding/state reports `PASS`. Spatial debt must retain a successfully
built and scanned state. Semantic contract declarations are not executable
proof, so semantic debt promotion remains frozen until the browser certifier
publishes an exact obligation-level `PASS` receipt.

`npm run audit:certification-debt` prints the deterministic current snapshot.
When a reviewed architecture change intentionally alters the ledger, run
`node tools/certification-debt-ratchet.mjs --write-baseline` and review the
entire baseline diff. Baseline regeneration is never part of CI or an
automatic fix: accepting a larger baseline is accepting new debt.
