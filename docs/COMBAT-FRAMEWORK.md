# The Combat Framework

A reusable, mission-agnostic combat foundation for Squatch Life, built by
extending the systems that already worked rather than replacing them. This
document is the record the owner asked for: what existed, what was reused,
what was replaced and why; the architecture; the data formats; and the plan
for taking the mansion siege first.

Play it: `npm start` → `http://localhost:5173/combatlab.html`
(add `?debug=1` for the debug drawer, `?difficulty=easy|normal|hard`).

Prove it: `npm test` (711 tests, ~90 of them combat) and
`npm run verify:combatlab` (headless browser pass over the lab).

---

## 1. What existed before, and what happened to it

The audit found **four combat implementations that never talked to each
other**, plus scripted-kill patterns in every narrative mission.

| Existing system | Where | Verdict |
|---|---|---|
| Shared weapon runtime: `WeaponSystem`, `Firearm` (two-phase reload), `WEAPON_CATALOG` (6 guns), `TracerPool`, `EjectaPool`, `mountArmory`, per-weapon audio-cue contract | `src/core/weapons/` | **Reused and extended.** Now also: ADS, pellets, muzzle-obstruction, stance-true spread hook, shell-by-shell shotgun reload, empty-reload cost, a `combat` data block per weapon, and three new weapons. `WEAPON_ORDER` (the rack six) is untouched — a test pins it. |
| `CombatActor`, `FactionMatrix`, `resolveBallisticHits`, `SuppressionModel`, `WeaponController`/`BurstController` | `src/core/combat/` | **Reused.** `FactionMatrix`, `SuppressionModel`, `WeaponController`, `BurstController` and `TracerPool` are load-bearing parts of the new framework. `CombatActor` and `resolveBallisticHits` stay untouched because THE TAKE runs and saves against them; `Vitals` + `ShotResolver` are their richer successors, and heist can migrate at leisure (§9). |
| THE TAKE's firefight: police raycasts inline in `heist/main.js`, `PoliceDirector` spawn budgeting, `CheckpointDirector` | `src/heist/` | **Left alone; patterns adopted.** `CheckpointDirector` is imported by the lab as-is. `PoliceDirector`'s budget/gate idea became `EncounterController`'s reinforcement entries. |
| Silvercase combat: `ShotResolver` (camera-ray → Actor), `Actor` (hp + locked-hostile + collapse), `ImpactKit` (three `BulletHoles` pools), `ReactionWindow` | `src/silvercase/` | **Patterns promoted to core.** The new shared `ShotResolver` generalises the ray-walk; `Combatant` is the `Actor` shape grown up (same collapse-tween ragdoll philosophy); `ImpactEffects` is `ImpactKit` with material profiles and pooling ceilings. Silvercase itself is untouched. |
| Motel brawler: its own `Actor`, `WEAPON_STATS`, hp/stun/blind | `src/motel/` | **Left alone.** Melee is out of scope for this pass; noted as the merge candidate it already was. |
| NO WAKE / Squatchfather / HotDog executions: pure time-scripted beats | various | **Left alone; the framework adds the missing bridge.** `Combatant.scriptHold()` / `scriptKill()` give future scripted moments real damage, real death pipelines and real kill events without `setTimeout` fakery (§8). |
| Enola Squatch air combat, arcade shooters | `src/enolasquatch/`, `src/arcade/`, `game/` | **Left alone.** The raid already shares `TracerPool`. Vehicle/boat/aircraft combat later mounts the same `ShotResolver`/`Vitals` against vehicle hulls — nothing in the framework assumes a walking body except `Combatant` itself. |
| NPC bodies: `makePerson`/`Npc` (the one shared rig), procedural animation, AABB nav-clearance walking | `src/bing/cast.js` | **Reused untouched.** `Combatant` wraps an `Npc`; hitboxes parent to its pivot groups; combat "possesses" the pose only while fighting and hands the body back after. |
| No navmesh anywhere | — | **Accepted.** Combat movement uses the same collider-clearance stepping every walking NPC already uses, plus authored cover nodes and encounter boundaries. A navmesh remains future work (§10). |

Nothing that previously shipped changed behaviour: all 667 pre-existing
tests pass unmodified (now 711 with the combat suites).

## 2. Architecture

One rule everywhere: **guns produce rays; `ShotResolver` is the only thing
that decides whether a ray hurts someone.** The player's `WeaponSystem` and
every NPC's trigger both hand their rays to the same resolver, which walks
materials (penetration, ricochet), gates people through `CombatRules`,
applies damage through `Vitals`, and reports every surface for effects.

```
                         DATA (pure tables, node-testable)
  weapons/catalog.js   combat/config.js   combat/materials.js
  (9 guns + combat     (difficulty +      (what walls are,
   blocks)              tuning ceilings)    to a bullet)
  combat/hit-regions.js         combat/archetypes.js
  (8 body regions)              (10 NPC types + friendlyCrew)
        │
        ▼
                         LOGIC (pure, node-testable)
  damage.js ── falloff · region mult · vest/helmet arithmetic
  vitals.js ── ONE health model: player, goon, heavy, ally
  recoil.js ── learnable camera recoil + stance accuracy (shared by both sides)
  perception.js · squad.js · cover.js · morale.js ── what an NPC knows/feels
  brain.js ── the 14-state combat mind (roles bend weights, not the machine)
  rules.js ── friendly-fire modes + protected characters
  encounter.js ── spawn groups, reinforcements, completion, checkpoints
  log.js ── the readable record
        │
        ▼
                         SCENE (THREE / DOM)
  shots.js ─────────── THE shot resolver (every gun's ray)
  hitboxes.js ───────── 8 volumes riding the Npc rig's pivots
  combatant.js ──────── Npc + Vitals + Brain + gun + reactions + death
  effects.js ────────── pooled decals/chips/blood/audio from material rows
  player-combat.js ──── Player + WeaponSystem + Vitals + recoil + ADS bound
  combat-hud.js ─────── health/ammo/truthful crosshair/hit confirms
  debug.js ──────────── the drawer (only constructed with ?debug=1)
        │
        ▼
  src/combatlab/ ── the proving ground (level.js + main.js + combatlab.html)
```

Player fire path: `WeaponSystem._onShot` → `resolveShot` hook →
`ShotResolver.resolve` → `Vitals.applyHit` → `Combatant.noteShotResult`
(reactions/death) → `EncounterController.reportKill` → mission callbacks.
NPC fire path: `CombatBrain` intent → `Combatant._updateFire` → the same
resolver → the same everything.

## 3. Files

**New — framework** (`src/core/combat/`): `config.js`, `materials.js`,
`hit-regions.js`, `archetypes.js`, `damage.js`, `vitals.js`, `recoil.js`,
`perception.js`, `squad.js`, `cover.js`, `morale.js`, `brain.js`,
`rules.js`, `log.js`, `encounter.js`, `hitboxes.js`, `shots.js`,
`combatant.js`, `effects.js`, `player-combat.js`, `combat-hud.js`,
`debug.js`, `index.js` (the barrel, with the layer map in its docstring).

**New — the lab**: `combatlab.html`, `src/combatlab/level.js`,
`src/combatlab/main.js`, `tools/verify-combatlab.mjs`.

**New — tests**: `tests/combat-framework.test.mjs`,
`tests/combat-ai.test.mjs`, `tests/combat-encounter.test.mjs`.

**Modified**: `src/core/weapons/catalog.js` (combat blocks, 3 new weapons,
`COMBAT_WEAPON_ORDER`), `Firearm.js` (shell reloads, empty-reload extra),
`WeaponSystem.js` (ADS, pellets, obstruction, eye-origin rays, spread hook,
`resolveShot` hook), `models.js` (pump12/smg9/br308 builders), `audio.js`
(15 stand-in cues), `weapons/index.js`, `tests/run.mjs`.

**Untouched on purpose**: every mission, `core/player.js`,
`core/combat/actors.js`/`ballistics.js`, the campaign save.

## 4. Weapon data format

A weapon is one row in `WEAPON_CATALOG` (`src/core/weapons/catalog.js`).
The original fields (capacity, reserve, rps, auto, reload phases, eject
style, tracer, rack) are unchanged; the framework adds a `combat` block:

```js
combat: {
  headshot: 2.4,            // damage multiplier on the head region
  pellets: 1,               // rays per trigger pull (shotgun: 8)
  pelletSpread: 0,          // extra per-pellet cone, radians
  falloff: { start: 28, end: 80, floor: 0.55 },  // metres, fraction kept
  ads: { spread: 0.3, zoom: 1.35, time: 0.18 },  // aimed multiplier/fov/settle
  moveSpread: 1.7, crouchSpread: 0.8,            // stance multipliers
  emptyExtra: 0.4,          // extra seconds on an empty reload
  recoil: { pitch, yaw, firstShot, recovery, climb, model },
  suppression: 0.55,        // how frightening a near miss is
  noise: 90,                // metres a shot alerts NPCs
  npc: { burst: { min: 2, max: 5, pause: 0.6 }, spread: 1.0 },
}
```

Nine weapons cover every category asked for: `revolver` (.45),
`pistol9` (semi-auto pistol), `pump12` (shotgun, tube-fed shell-by-shell),
`smg9` (SMG), `carbine` + `ak47` (assault rifles), `br308` (battle rifle),
`saw` (machine gun), `barrett` (sniper). The new three have full procedural
models, stand-in audio (real manifest cues, pitched), and 15 wanted
`weapon.<id>.<slot>` cue names for the recording pipeline.

## 5. NPC archetype format

`src/core/combat/archetypes.js` — one row per enemy kind:

```js
rifleman: {
  health: 100, vest: 0, helmet: 0,        // durability — capped ≤120 by test
  weapon: 'ak47',
  skill: { spread: 1.0, reaction: 0.55, burstDiscipline: 0.5 },
  painThreshold: 22, suppressResist: 0.2, staggerResist: 0.1,
  morale: { start: 0.75, fightToDeath: false },
  role: 'rifleman',                        // one of the ten ROLES
  engage: { near: 10, far: 35 },           // preferred band, metres
  voice: 'goon', ragdoll: 'topple',
}
```

Ten roles ship (`rifleman`, `rusher`, `coverShooter`, `flanker`,
`shotgunner`, `smg`, `marksman`, `machineGunner`, `squadLeader`,
`armored`) plus `friendlyCrew`. Roles are weights on ONE brain, not
separate AIs. `customArchetype(base, overrides)` gives a mission its own
variant without touching the table. **No row exceeds 120 health** — a test
enforces it; the armored heavy is hard because of 120 vest + 60 helmet.

## 6. Encounter configuration format

`EncounterController` (`src/core/combat/encounter.js`):

```js
{
  id: 'yard',
  groups: [{ id, archetype, count, faction, spawns: [{x,z,yaw}],
             patrol?, alert?: 'unaware'|'alerted', leader? }],
  entries: { gate: { x, z, yaw } },        // believable arrival points
  reinforcements: [{ id, group, entry, onDeaths?|after?|onAlert?,
                     count?, limit?, stagger? }],
  boundary?: { x, z, w, d },
  retreatPoints?: [{x,z}],
  missionCritical?: [...], failOnKill?: [...],
  complete?: { allDead?|survive?|custom? }, fail?: { playerDead?|custom? },
}
```

Callbacks: `onSpawn` (the scene builds the body), `onReinforce`, `onKill`,
`onComplete`, `onFail`, `onMusic`, `onDialogue`. `capture()`/`restore()`
are `CheckpointDirector`-compatible; kills are idempotent so a restore
never double-counts, and completion waits for owed reinforcement waves.

## 7. What the lab demonstrates

- **Shooting range**: 6 lanes, paper at 10/25/50 m, two moving-target rails.
- **Material wall**: drywall, wood, glass, metal, brick, concrete, a junker
  car, furniture — penetration, ricochet chance, per-material impacts.
- **Killhouse**: two storeys, four+ rooms, working doors, staircase,
  balcony over the main room — the mansion-siege shape in miniature.
- **Cover yard**: 52 authored cover nodes across the map, high/low.
- **Long lane**: 100 m with a steel gong, for falloff and the Barrett.
- **Armory**: all nine weapons racked; E takes, Q racks, R reloads,
  right-mouse aims.
- **Encounters**: `1` yard fight (7 enemies, 4 roles, flanker
  reinforcements through the gate), `2` killhouse fight (5 roles across two
  floors, rushers through the rear door), `3` stress wave (12+4).
- **`4`** fields a friendly crew Squatch (same framework, crew faction,
  hold-fire when the player crosses his lane). **`5`** spawns the armored
  heavy: pistol headshot → helmet save, sparks, stagger, helmet knocked
  off; follow-up is a real headshot. The four facts (head struck / headshot
  damage / helmet saved / headshot killed) are distinct in the log.
- **F5/F9**: full checkpoint capture/restore (player health+ammo+position,
  roster, encounter progress; the dead stay dead, nobody duplicates).
- **`?debug=1`**: god mode, infinite ammo, spawn any archetype, hitbox
  wireframes, AI state labels, cover markers, bullet rays, slow motion,
  force alert/surrender, kill-all, the rolling combat log.

## 8. Cinematic control (the boat rule)

Story moments use the same pipeline instead of bypassing it:
`combatant.scriptHold(true)` freezes the AI in place;
`combatant.scriptKill({ direction, weapon, headshot })` runs the REAL death
pipeline — vitals, collapse direction, kill event, cleanup registration —
so a scripted execution still registers for mission progression and still
falls believably. Protected characters are `protectedCore` + `CombatRules`
ids: a would-be kill reports `protectedCore: true` and the mission decides,
never a hidden health hack.

## 9. Migration notes for existing missions

- **THE TAKE**: keeps `CombatActor` today. When touched next, its police
  become `Combatant`s with a `police` archetype and its inline raycast
  swaps for `ShotResolver`; `CheckpointDirector` adapters already match.
- **Silvercase / NO WAKE / Squatchfather**: no change needed; when a beat
  wants real ballistics, `scriptKill` is a drop-in for the `kill()` calls.
- **Motel**: its ranged actors map to archetypes almost 1:1; melee stays
  its own until a melee pass.

## 10. Known limitations

- **No navmesh.** Movement is straight-line stepping with collider
  clearance (the repo's established pattern). Rooms and doorways work;
  a long path around a U-shaped wall can stall a flanker (he gives up and
  re-covers after `stuckTime`). Authored patrol routes and cover placement
  are the practical mitigations, as they are everywhere else in the repo.
- **Ragdolls are authored collapse tweens**, not skeletal physics — the
  house style (silvercase `COLLAPSE`), directional and settle-and-stop.
  They cannot drape over railings or stairs.
- **NPC voice barks are events, not audio yet** (`onEvent {type:'bark'}`).
  The lab logs them; VO wants a `goon`/`crew` bark set added to the
  recording pipeline (`vo.combat.*`) before they can be heard.
- **Player hit volumes are two boxes** (torso + head) following the
  camera; NPCs cannot shoot the player's limbs distinctly.
- **Suppression fire at last-known** uses ray truth (it chews the wall the
  ghost hid behind) but NPCs do not model penetration when CHOOSING to
  fire — they will hose drywall correctly but won't reason "I can shoot
  through this".
- **Perception light term** is a scalar hook (`lit`), wired to 1 in the
  lab; a mission with a day/night or interior-lighting model supplies it.
- **The lab's AI LOS raycasts** test the full 414-mesh list per query at
  15 Hz per NPC. Fine at 16 NPCs in verification; a mission with much
  larger casts should pass a reduced occluder list (walls only).
- **NPCs in cover sometimes shoot their own cover.** The brain has a
  `peeking` intent but the firing muzzle is not yet offset out of the
  cover volume while peeking, so a share of rounds from a barrier land in
  the barrier. It reads as poor marksmanship, not a bug, but a muzzle
  offset during peeks is the next brain/cover refinement — along with
  raising cover-fire cadence if missions want busier-sounding fights.
- **Headless combat requires `scene.updateMatrixWorld()` per simulated
  step** (the render normally does it). The lab's `tick()` does this; any
  future scene driving combat under a suspended renderer must too, or
  every ray is cast against frozen bodies.

## 11. Recommendations: the mansion siege first

The mansion is already the best-prepared site — the killhouse is its dress
rehearsal.

1. **Level prep** (`scenes/MansionInterior.js` / `MansionGrounds.js`):
   tag shootable meshes with `userData.material` (walls `drywall`/`brick`,
   doors `wood`, windows `glass`, cars `vehicle`), export authored
   `coverPoints` per room (foyer columns, the horseshoe stair rails,
   bedroom doorframes, the balcony), and reuse the existing per-storey
   collider discipline — the lab proved `groundAt(x, z, fromY)` handles
   balcony-over-foyer.
2. **Cast**: the three patrol guards + posts in `mansion/cast.js` become
   `Combatant`s with `alert: 'unaware'` and their existing `patrol` routes
   (combat possession hands the body back when calm — patrols survive).
   Snow and named family go in `CombatRules.protectedIds`.
3. **Encounter**: one `EncounterController` per wave of the siege —
   grounds wave (gate + lawn entries), foyer wave (front doors), upstairs
   defence (attackers up both stairs; the balcony is the player's cover),
   basement last stand. Reinforcement entries: the gate, the front doors,
   the two stairwells, the kitchen door. `boundary` per wave keeps fights
   in their rooms.
4. **The armory matters**: the basement `mountArmory` already works with
   the framework — kit the player there between waves; `ammoScale` from
   the difficulty profile governs resupply.
5. **Checkpoints**: one `CheckpointDirector` capture per wave completed,
   committed to the campaign via the existing `updateRequired` pattern.
6. **Keep Silent Squatch intact**: the mission FSM and the siege
   encounter are separate mounts; the siege should be a new mission file
   using the same `contract` pattern (`mansion/mission/mount.js`) so the
   two never share state by accident.

## 12. Performance

Everything pooled and ceilinged (`COMBAT_TUNING.limits`): tracers one
InstancedMesh (160), chips one InstancedMesh (96), decals rotating
`BulletHoles` pools (48), casings capped by `EjectaPool` (24), ragdolls
zero-cost after settling (the collapse tween frees itself), AI on a 15 Hz
budget with per-frame movement, gunfire audio rate-limited (14 starts/s).
Measured by `npm run verify:combatlab` (33 checks, headless swiftshader):
six simulated seconds of the seven-man yard fight cost ~294 ms of wall
clock; five simulated seconds of 13 combatants at 1/30 steps cost
~180–210 ms — about **1.2–1.4 ms per simulated step** with all AI,
raycasts and effects running. The verifier also proved the fights bite:
standing still in the open yard costs the player all 100 health inside
six seconds.
