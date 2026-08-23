# Shared systems audit

Checks every campaign scene, in play order, against the catalog in
`docs/SHARED-SYSTEMS-BANK.md`. Method: static import sweep (`grep` for each
canonical module's import path across `src/**/*.js`, 2026-08-21) plus reading
the doc comments the codebase already leaves at each documented exception.
This is a first pass, not a forensic audit — a missing import can mean "not
applicable to this scene," "reached indirectly through a shared cast/rig
class," or a genuine gap. Each row says which, where the evidence supports
it, and says "needs a look" where it doesn't.

Legend: **✓** confirmed present · **✓ (indirect)** reached through a wrapper
or shared class rather than a direct import · **— (n/a)** doesn't apply to
this scene's design, per a code comment or a design fact stated elsewhere in
`docs/` · **GAP** a documented or evidenced shortfall · **? needs a look**
absence with no supporting comment either way.

## Universal shell — every campaign scene

| Scene | Pause menu | Settings | Scene recovery | Player controller | Interaction | Campaign graph | Scene-inventory |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Apartment (hub) | ✓ | ✓ | ✓ (own hub Adapter, `apartment-recovery.js`) | ✓ | ✓ | ✓ | — (n/a, uses raw `Inventory`) |
| Bada Bing (both acts) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Squatchfather | ✓ | ✓ | ✓ | — (n/a, bespoke movement, documented) | — (n/a, bespoke input, documented) | ✓ | ✓ |
| Beef Run (+ Airstrip Smuggling) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Squatch Graveyard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Jerky Motel | ✓ | ✓ | ✓ | — (n/a, bespoke movement, documented) | — (n/a, bespoke input, documented) | ✓ | ✓ |
| NO WAKE | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Silver Room | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — (n/a, uses raw `Inventory`) |
| Silver Pines (Golf) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Bank Heist / THE TAKE | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Silver Case | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Mansion | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (indirect, via `mansion/loadout.js`) |
| Mansion Siege | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Enola Squatch | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — (n/a, has its own `payload/` loadout system — worth confirming it isn't a duplicate authority) |
| Mansion Return | ✓ (same Adapter as Mansion) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cartel Palace | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Special Meeting | ✓ | ✓ (indirect, via pause menu — no direct `settings.js` import) | ✓ (skip-only by design, per `campaign-scene-skip.js:44-54`) | ✓ | ✓ | ✓ | — (n/a, no pickable items) |
| Initiation Night | ✓ | ✓ | **GAP — not in `RECOVERABLE_CAMPAIGN_SCENES` and no `createSceneRecovery` import found.** No comment anywhere explains this the way Special Meeting's exception is explained. Worth a direct question: is a mid-Initiation checkpoint/restart genuinely undesirable (it's the finale night), or was it just never added? | — (n/a, bespoke movement, documented) | — (n/a, bespoke input, documented) | ✓ | ✓ |

**Reading this table:** the shell is in genuinely good shape. Pause menu,
settings and the campaign graph are universal with no exceptions. Player
controller and Interaction have exactly the three documented exceptions
(Motel, Squatchfather, Initiation) and nothing else — the "bespoke input"
decision was applied consistently, not partially. Scene recovery has exactly
one real gap: **Initiation Night has no recovery path**, and it's the only
cell in this table that isn't backed by an explicit design comment.

## Cast, voice & dialogue

| Scene | Dialogue (`core/dialogue`) | Mouth (`core/mouth`) | Staging (`core/staging`) | Wardrobe | Characters | HUD shell (`core/hud`) |
| --- | --- | --- | --- | --- | --- | --- |
| Apartment | ✓ (via `Npc.say`) | ✓ | — | — (n/a, hub cast dressed by scene-specific code) | — | ✓ |
| Bada Bing | ✓ (via `bing/dialogue.js`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Squatchfather | ✓ (via `characters/Figure.js`) | ✓ | — ? needs a look | — ? needs a look | — | — ? needs a look |
| Beef Run | ✓ (via `npc.js`) | ✓ | — ? needs a look | ✓ | — | ✓ |
| Squatch Graveyard | ✓ (via `Hud`/scene code) | ✓ | — ? needs a look | ✓ | — | ✓ |
| Jerky Motel | ✓ (via `actors.js`) | ✓ | ✓ | — ? needs a look | — | — ? needs a look |
| NO WAKE | ✓ direct | ✓ | ✓ | ✓ | — | ✓ |
| Silver Room | ✓ (via `script.js`/`cast.js`) | ✓ | — ? needs a look | — ? needs a look | ✓ | ✓ |
| Silver Pines (Golf) | ✓ (via `cast.js`) | ✓ | — ? needs a look | ✓ | ✓ | ✓ |
| Bank Heist | ✓ direct | ✓ (via `people.js`) | ✓ (via `people.js`) | ✓ | ✓ | — (own `heist/hud.js`, documented) |
| Silver Case | ✓ direct | ✓ | ✓ (via `cast/Actor.js`) | — ? needs a look | ✓ | — (documented: "nothing from core/hud.js") |
| Mansion | ✓ (via `script.js`) | ✓ | ✓ (via `cast.js`) | ✓ | ✓ | — (documented: "deliberately NOT core/hud.js") |
| Mansion Siege | ✓ direct | ✓ (via `SilentSquatch.js`, `SilentSquatchMission.js`) | — ? needs a look on the Siege side specifically | ✓ | — | — (same Mansion exception) |
| Enola Squatch | ✓ (via `dialogue/script.js`) | ✓ | — ? needs a look | ✓ | ✓ | ✓ |
| Cartel Palace | ✓ direct (`voice.js`) | — ? needs a look | — ? needs a look | ✓ | — | ✓ |
| Special Meeting | ✓ direct | — ? needs a look | ✓ | ✓ | — | ✓ |
| Initiation Night | ✓ direct | — ? needs a look | — ? needs a look | ✓ | — | — ? needs a look |

**Reading this table:** Mouth is the real success story here — 15 of 17
scenes use it, and the two blanks (Cartel Palace, Special Meeting, Initiation)
have no explaining comment, unlike the HUD exceptions, which are all
explicit. Worth checking those three scenes' dialogue code directly before
calling it a gap — the pattern elsewhere is that a scene either imports
`Mouth` itself or hands the job to a shared cast class that does, and it's
possible those three do the latter through a class this sweep didn't trace.

Staging (`core/staging.js`) has real, acknowledged partial coverage — see
`docs/STAGING-GATE.md`, which only ships allowlists for Bing, Mansion and
Silver Case. The "needs a look" cells above are exactly the scenes the
staging gate doesn't cover yet, which lines up with that doc rather than
contradicting it.

## Combat

Full context is REUSABLE-GAMEPLAY-SYSTEMS.md's migration matrix — this row
just restates it as an audit line so it's visible next to everything else.

| Scene | Weapon handling | Ground-combat truth | Blood & decals |
| --- | --- | --- | --- |
| Mansion Siege | ✓ canonical | ✓ production Adapter | ✓ |
| Cartel Palace | ✓ canonical | ✓ production Adapter | ✓ |
| Bank Heist | ✓ (`HeistFirearm` compatibility Adapter) | ✓ compatibility Adapter | ✓ |
| Mansion / Silent Squatch | ✓ | **GAP** — scripted firearm path, not yet on `CombatImpactResolver`'s full protocol (migration order #3b) | ✓ (already migrated ahead of the rest of the scene) |
| Jerky Motel | **GAP** — local `S.weapon`/`S.ammo`, local `segmentBlocked` (migration order #2) | **GAP** | — ? needs a look |
| Silver Case | **GAP** — older `ShotResolver`/`ImpactKit` (migration order #3a) | **GAP** | **GAP** (same old implementation) |
| Squatchfather | Gag prop only (`ToiletWeaponInteraction`) — not a combat scene | — (n/a) | **GAP** — `BulletHoles` at a guessed eye point, not the real ray intersection (migration order #3c) |
| Enola Squatch | — (n/a, flight weapons explicitly out of scope) | — (n/a) | — (n/a) |
| Bada Bing | — (n/a, no ground combat) but does consume shared blood for one attack beat | — (n/a) | ✓ (one beat) |
| Everyone else (Apartment, Squatch Graveyard, Beef Run, Silver Room, Silver Pines, Special Meeting, NO WAKE, Initiation) | — (n/a, no combat) | — (n/a) | — (n/a) |

Nothing new here versus the bank doc — this table exists so combat's gaps
sit in the same place as every other system's when someone is scanning scene
by scene rather than system by system.

## World props & set-dressing (only where a scene plausibly has the prop)

| Scene | TV | Radio | Smoke | Bong | Held drinks (`world/props.js`) |
| --- | --- | --- | --- | --- | --- |
| Apartment | ✓ | ✓ | ✓ | ✓ | ✓ canonical |
| Bada Bing | ✓ (`club.js`) | ✓ | — ? needs a look (no smoking beat found) | ✓ | **GAP** — local `poseDrink` copy, not `poseHeldDrink` (named directly in REUSABLE-GAMEPLAY-SYSTEMS.md) |
| Silver Room | ? needs a look — grep hit on `core/tv` is unconfirmed, could be a naming collision | — (n/a) | — (n/a) | — (n/a) | **GAP** — local `poseDrink` copy (same note as Bing) |
| Silver Pines (Golf) | — (n/a) | ✓ | ✓ (canonical, `hands.js`) | — (n/a) | ✓ canonical (`hands.js`) |
| Mansion (+ Siege, Silent Squatch) | ✓ (multiple rooms + theatre) | ✓ (multiple cabinets) | ✓ | ✓ (LAN room) | — (n/a) |
| Enola Squatch | — (n/a) | — (n/a) | ✓ (engine smoke, reusing the general pool) | — (n/a) | — (n/a) |
| Everyone else | — (n/a) | — (n/a) | — (n/a) | — (n/a) | — (n/a) |

The `HeldConsumableSequence` extraction REUSABLE-GAMEPLAY-SYSTEMS.md
describes (duration, cue callbacks, `pose`/`consume`/`cancel`) would close
both `poseDrink` gaps above at once — it's already on that doc's migration
order as step 1, just restated here as the two concrete scenes it unblocks.

## Open questions this audit doesn't answer yet

1. **Initiation Night has no scene-recovery path.** Every other campaign
   scene either has one or has a code comment explaining why not (Special
   Meeting). Initiation has neither. This needs a decision, not a grep.
2. **Six "needs a look" `Mouth` gaps** (Squatchfather, Beef Run, Graveyard,
   Silver Room, Silver Pines, Cartel Palace, Special Meeting, Initiation, in
   varying combinations across the two tables above) are almost certainly
   indirect — reached through a shared `Npc`/cast/rig class — but this sweep
   only traced direct imports. Worth a five-minute confirm per scene rather
   than trusting the blank cell.
3. **HUD shell absence in Motel, Squatchfather, Initiation, Combat Lab** has
   no explaining comment the way Mansion's and Silver Case's do. Either
   they're a fourth and fifth documented exception nobody wrote down, or
   they're missing subtitle/prompt chrome other scenes get for free.
4. **`src/airstrip/mission.js`** (the top-level `src/airstrip/` directory,
   distinct from `src/beefrun/airstrip.js`) has no import anywhere in `src/`
   or any `.html` entry point. The real Airstrip Smuggling mission lives in
   `src/beefrun/` instead. This directory looks orphaned — confirm before
   editing or deleting it.
5. **Enola Squatch's `payload/` system** versus `scene-inventory` — confirm
   it's a deliberate flight-mission-specific loadout and not a duplicate
   inventory authority the way `WeaponController` was for combat.

## Next step

Pick one open question above (Initiation's recovery gap is the cleanest —
it's a yes/no design call, not a code archaeology job) and resolve it, or
hand the six "needs a look" `Mouth`/HUD cells to someone with five minutes
and `grep` to turn them from "needs a look" into a real ✓ or GAP. This audit
is deliberately a skeleton: the shell and combat sections are solid because
they had a paper trail (`REUSE-FIRST.md`, the migration matrix,
`STAGING-GATE.md`) to check against; the cast/dialogue "needs a look" cells
are the ones worth another pass before anyone treats this as final.
