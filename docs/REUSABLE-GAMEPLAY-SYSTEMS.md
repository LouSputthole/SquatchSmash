# Reusable Gameplay Systems

This is the source-of-truth catalog for gameplay behavior that appears in more
than one scene. It records the canonical Module, its public Interface, current
Implementations and consumers, stable object labels, and the next migration.

The rule is simple: import the canonical Module and write only the narrow scene
Adapter needed for that scene's cast, story facts, or authored geometry. Do not
start a second Implementation because a scene has a different name or set.

A shared-system adoption is complete only when all four are present:

1. The scene imports the canonical Module.
2. Its important objects expose stable `.name` and `userData` labels.
3. A focused test proves the public Interface and the failure that prompted the
   adoption.
4. The scene verifier proves the real composition root mounted the Module.

## Canonical map

| Capability | Canonical Module | Canonical status | Existing consumers |
| --- | --- | --- | --- |
| Bullet wounds and death blood | `src/world/blood.js`, over `src/world/bullets.js` | Canonical shared high-level Interface | Mansion Silent Squatch; Silver Case remains the reference older Implementation being consolidated |
| Held beer/drink model and motion | `src/world/props.js` | Canonical visual Interface; use-state orchestration still needs extraction | Apartment and Silver Pines share `poseHeldDrink`; Bing and Silver still carry local motion |
| Dress-help interaction | `src/world/dress-help.js` | Canonical shared sequence with scene rig Adapters | Apartment Margo and the second Mansion pool performer |
| TV playback and attenuation | `src/core/tv.js`, with `src/core/audio.js` listener state | Canonical | Apartment and Mansion televisions, including the Mansion theatre |
| Smoke and cigarette exhale | `src/world/smoke.js` | Canonical | Apartment, Silver Pines, Enola Squatch, Mansion bong behavior |
| Functioning bong | `src/world/bong.js` | Canonical | Apartment and Mansion LAN room |
| Weapon operation | `src/core/weapons/index.js` | Canonical | Combat Lab, Cartel Palace, Mansion, Mansion Siege; Heist shares selected weapon models/audio |
| Damage, factions and ballistics | `src/core/combat/` | Canonical | Combat Lab, Heist, Cartel Palace, Mansion Siege and its attackers/ensemble |
| Player inventory | `src/core/inventory.js` | Canonical | Apartment, Bing, Silver, Silver Pines and Mansion final-arc loadout |
| Look/hold interactions | `src/core/interaction.js` | Canonical | All first-person scenes that use world-object prompts |
| Pause and failure recovery | `src/core/pause-menu.js`, `src/core/scene-recovery.js`, `src/core/campaign-scene-skip.js` | Canonical | Campaign scenes listed by `RECOVERABLE_CAMPAIGN_SCENES`; Apartment uses its hub Adapter |

## Blood impact and death pools

### Canonical Module

- `src/world/blood.js` owns visible blood evidence.
- `src/world/bullets.js` remains the lower-level pooled attached-decal
  Implementation used by the blood Module.
- `src/core/combat/` owns damage and fatality. Blood must not decide who can be
  hurt or whether a hit kills.

### Public Interface

```js
const impacts = new BloodImpactSystem(scene, { random });
impacts.hit({ actor, anchor, point, normal, from, spatter, spatterAnchor });
impacts.marksFor(actor);
impacts.marksOn(actor);
impacts.clearActor(actor);
impacts.update(dt);
impacts.reset();

const pools = new DeathBloodPool(scene, { capacity, growthSeconds, random });
pools.spill(point, { floorY, size, opacity, delay, seed });
pools.update(dt);
pools.reset();
```

`point` is the real world-space ray intersection. `anchor` is a plain or
uniformly scaled body/head Group chosen by the scene Adapter, not the
non-uniformly scaled mesh hit by the ray. `floorY` is mandatory and separate
from the wound point so a chest hit cannot create a pool in mid-air.

### Stable labels

| Object | `.name` | `userData` |
| --- | --- | --- |
| Entry wound | `blood.impact` | `reusableSystem: 'blood'`, `bloodEffect: 'impact'`, `hitOwner` |
| Secondary spatter | `blood.spatter` | `reusableSystem: 'blood'`, `bloodEffect: 'spatter'`, `hitOwner` |
| Floor pool | `blood.death-pool.01` through the configured capacity | `reusableSystem: 'blood'`, `bloodEffect: 'death-pool'`, `seed` |

### Current Implementations and migration

- `src/silvercase/combat/Shooting.js` (`ShotResolver` and `ImpactKit`) is the
  best prior Implementation: it keeps the real hit point and attaches marks
  to the actor. Its semantics are now captured by `BloodImpactSystem`.
- Mansion Silent Squatch now passes the full hit record from
  `src/mansion/mission/mount.js` through
  `src/mansion/mission/SilentSquatchMission.js` to the figure Adapter. Aubbie
  and xXx use body-attached shared marks, all six fatal scientists plus xXx
  create exactly one shared floor pool each, and both Mansion recovery paths
  reset pooled visuals and actor blood ownership.
- `src/heist/main.js` has scene-local blood particles and floor circles. Keep
  particles as scene flavor if wanted, but move persistent wounds and death
  pools to the shared Module.
- `src/squatchfather/main.js` uses `BulletHoles` at a guessed eye point. Move it
  to the real resolved intersection before claiming exact impact placement.

`tests/blood-effects.test.mjs` is the deterministic public-Interface test. It
proves exact hit placement, attachment through body motion, bounded pooling,
explicit floor placement, deterministic pool growth and safe ownership when a
pooled wound is recycled.

One weapon Seam must be corrected during migration: `WeaponSystem._impact`
currently publishes `hit.face.normal` in mesh-local coordinates. Transform it
through the hit object's normal matrix before handing it to blood.

## Beer and held drinks

### Canonical Module

`src/world/props.js` owns both the reusable geometry and the apartment's exact
drink motion:

```js
makeBeerCan(materials, { x, y, z, crushed, rotY });
makeHeldDrinks(materials); // { group, can, bottle, jug }
poseHeldDrink(drinks, 'can' | 'bottle' | 'jug', progress);
```

`poseHeldDrink` clamps normalized progress and applies the same lift, tilt and
roll everywhere. A scene owns the gameplay result of drinking, but it must not
copy those transforms.

### Stable labels

- Shared held rig: `heldDrinks`, with `heldCan`, `heldBottle`, `heldJug`.
- Reusable stocked beer: `userData.reusableProp = 'squatch-beer'`.
- Reusable cigarette pack: `userData.reusableProp = 'cigarette-pack'`.
- Reusable nicotine tin: `userData.reusableProp = 'zyn-tin'`.
- Silver Pines camera Adapter: `golf-held-props`, `golf-held-drinks`,
  `golf-held-cigarette`, `golf-held-zyn-tin`.

### Current Implementations and migration

- Apartment `src/main.js` and Silver Pines `src/golf/hands.js` call the shared
  motion Interface now.
- `src/bing/main.js` and `src/silver/main.js` still contain local `poseDrink`
  copies. Replace them with `poseHeldDrink`.
- Hold duration, crack/sip/crush audio, cancellation, item consumption and
  intoxication effects are still orchestrated separately in Apartment, Bing,
  Silver and Golf. The next shared Module should be a `HeldConsumableSequence`
  whose Interface accepts duration, cue callbacks, `pose(progress)`,
  `consume()` and `cancel()`. Extract the apartment behavior rather than
  designing a new beer flow.

`tests/golf-consumables.test.mjs` proves Silver Pines uses the shared prop
labels and visible held models. A focused motion test should be added when Bing
and Silver migrate.

## Margo dress-help interaction

### Canonical Module and Interface

`src/world/dress-help.js` owns the exact authored seven-pull sequence:

```js
const sequence = createDressHelpSequence({
  timingBar: TimingBar,
  audio,
  rig,
  onProgress,
  onComplete,
  onAbandon,
});

sequence.start();
sequence.update(dt);
sequence.press();
sequence.abandon();
sequence.reset();
// getters: active, hits, misses, debug
```

The audio Adapter exposes `play`, `startLoop`, `stopLoop` and may expose
`position()` for spatial placement. The rig Adapter exposes `begin`,
`onHit({ index, total })`, `onMiss({ index })`, `finish` and `reset`.
`onProgress` receives `{ index, total, progress }`; completion callbacks
receive `{ hits, misses, earned }`.

The apartment composes that Module with:

- `src/core/timingbar.js` `TimingBar` for the seven successful presses.
- `src/world/dressing.js` `makeMorningGuest()` for the rig Adapter.
- `src/main.js` for Margo's pose, authored body-impact takes, HUD posture,
  glue result and chapter continuation.
- One `InteractionSystem.register(apartment.margo.helpTarget, descriptor)`
  registration. Margo remains standing until the player presses the authored
  interaction; only `startMargoDressHelp` changes her to `kneeling`.

The rig Interface is:

```js
margo.setPose('lying' | 'sitting' | 'kneeling' | 'standing');
margo.setDressHelpProgress(progress);
margo.setDressGlue(amount);
margo.helpTarget;
```

### Stable labels

- Root: `margo`.
- Interaction owner: `margo-dress-help`.
- Garment seam: `margo.outfit.dress-closure`.
- Result group: `margo.dress.glue`.
- Result marks: `margo.dress.glue.1`, `.2`, and so on.

### Current proof and migration

Do not copy the apartment functions into another scene and do not replace them
with a three-click dialogue state. Mansion supplies a rig Adapter for the
second recliner performer's pose, progress and dress-strap visuals while using
the shared sequence unchanged.
`tests/dress-help-sequence.test.mjs` proves the timing constants, seven-hit
progression, misses, ordered cue stages, abandon/reset behavior and one-shot
completion. `tests/margo-morning.test.mjs` remains the visual-rig contract;
`verify:big-night` proves the apartment Adapter in a real browser, and
`verify:mansion` drives the second performer through the same seven-hit
sequence, including miss/no-advance, abandon/retry and spatial cue staging.

## TV playback and positional attenuation

### Canonical Module and Interface

`src/core/tv.js` owns channels and set state:

```js
const channel = videoChannel({ name, file, files, card, glow, startAt });
const tv = new Tv({ audio });
tv.register(channel);
tv.toggle();
tv.next();
tv.update(dt);
tv.glow();
```

`videoChannel.enter({ audio, position })` wires one media element through a
low-pass filter, gain and `PannerNode` to `audio.busMusic`. The shared
`TV_AUDIO_SPATIAL_PROFILE` uses HRTF/linear attenuation: full near-field level
through `refDistance = 3`, monotonic falloff, and silence at and beyond
`maxDistance = 14`. `tvGainAtDistance(distance)` exposes that exact curve for
deterministic tests. `leave()` pauses the video. `AudioEngine.updateListener`
must continue to receive the live camera so distance actually follows the
player.

### Current consumers and labels

- Apartment uses the shared `Tv` against the `tv` prop group.
- Bada Bing uses the shared `Tv` for its drawn, sound-off office set.
- Mansion mounts the same Module to lounge, kitchen, suite, bedroom, cellar and
  theatre screens. Screen names are currently scene-authored (`tv-screen`,
  `suite-tv-screen`, `theatre-screen`, and bedroom-specific names); the mounted
  `Tv.id` is the stable runtime identity.
- Channel `name` is the stable content label. A `videoChannel` closure must not
  be shared between two simultaneously independent sets because it owns one
  decoder.

### Current proof and migration

Never play a TV through a raw unpanned video element or scene-wide volume.
`tests/tv-video-start.test.mjs` proves editorial start/loop/leave behavior;
`tests/tv-spatial-audio.test.mjs` proves the shared curve and matching Panner
configuration; `verify:mansion` compares near-room and outside-room gain. If
closed doors later need stronger occlusion, add a shared spatial-media
cutoff/gain Seam; do not add per-room volume hacks.

## Smoke, cigarettes and bong

### Canonical Modules and Interfaces

`src/world/smoke.js`:

```js
const smoke = new SmokeSystem(scene);
smoke.emit(origin, direction, options);
smoke.wisp(origin);
smoke.update(dt);
smoke.dispose();
emitCigaretteExhale(smoke, origin, direction);
```

`src/world/bong.js`:

```js
const bong = buildInteractiveBong(materials, { x, y, z, rotY });
registerInteractiveBong(interaction, bong, { onUse, enabled });
const behavior = createBongBehavior({
  blocked, audio, highs, smoke, origin, direction, hud, onUsed,
});
behavior.use();
```

The bong Module deliberately owns the geometry, generous hit target, 0.9
second hold interaction, audio sequence, smoke and intoxication call. Position
and scene gating are the Adapter.

### Stable labels

- Smoke sprites: `shared-smoke-puff-01` through `-64`, with
  `userData.reusableSystem = 'smoke'`.
- Bong root: `bong.interactive`.
- Bong bowl: `bong.interactive.bowl`.
- Bong interaction owner: `bong.interactive.target`, with
  `userData.bongRoot` pointing to the root.

### Current consumers and migration

Apartment and Mansion LAN already build and register the same bong Module.
Apartment and Silver Pines share `emitCigaretteExhale`; Enola Squatch reuses
the general smoke pool for engine smoke. All future bongs and cigarette clouds
must import these Modules. Do not reuse only `makeBong` geometry and leave a
dead prop. `tests/mansion-interactions.test.mjs` proves apartment/Mansion bong
parity; `tests/smoke-system.test.mjs` proves pooled smoke labels and lifetime.

## Weapons and combat

### Canonical Modules

- `src/core/weapons/index.js` is the canonical preferred import surface for
  weapon catalog, models, `Firearm`, `WeaponSystem`, audio, armory and tracer
  exports. Some older scene compositions still import its constituent Modules
  directly and should migrate when next touched.
- `src/core/combat/actors.js` owns `CombatActor` health, armor, protection,
  injury and snapshot state.
- `src/core/combat/ballistics.js` owns distance ordering, penetration and
  faction-safe hit resolution through `resolveBallisticHits`.
- `src/core/combat/factions.js` owns factions and damage permission.

### Public Interface

```js
const weapons = new WeaponSystem({
  camera, world, audio, groundAt, hitTargets, range, onImpact, onEvent,
});
weapons.equip(id);
weapons.stow();
weapons.setTrigger(down);
weapons.triggerPress();
weapons.reload();
weapons.update(dt, { speed });
weapons.hud();
weapons.dispose();

const actor = new CombatActor({ id, faction, maxHealth, armor, core });
actor.applyHit({ amount, attacker, playerShot, matrix });
resolveBallisticHits(hits, { attacker, damage, penetration, playerShot, matrix });
```

`WeaponSystem` owns operation of the gun and its world ray. It intentionally
does not own a cast list. A scene Adapter maps a hit Object3D to `CombatActor`,
then calls `resolveBallisticHits`; resolved non-protected hits feed
`BloodImpactSystem`, and fatal results feed `DeathBloodPool`.

### Stable labels and consumers

- Held root: `weapons.viewmodel`.
- Flash: `weapons.muzzleflash`.
- Tracers: `tracer-pool`.
- Armory root: `armory`; holders: `armory-<weapon-id>-<index>`; lamps:
  `armory-lamp-<weapon-id>`.
- Model roots use catalog names: `revolver`, `pistol9`, `heist-carbine`, `saw`,
  `barrett`, `ak47`.

Combat Lab is the verification consumer, not a competing combat framework.
Cartel Palace, Mansion and Mansion Siege use `WeaponSystem`; Heist and Mansion
Siege use `CombatActor` and shared ballistic rules. Scene-local mission logic
may decide objectives, but it must not reimplement ammo, reload, penetration,
faction protection or hit permission. `tests/weapons-core.test.mjs`,
`tests/combat-core.test.mjs` and `tests/combatlab-tool.test.mjs` are the core
contracts.

## Inventory

### Canonical Module and Interface

`src/core/inventory.js`:

```js
const inventory = new Inventory(slotCount);
inventory.held;
inventory.full;
inventory.has(id);
inventory.count();
inventory.add(id);
inventory.remove(id);
inventory.removeAt(slotIndex, expectedId);
inventory.clearSelected();
inventory.select(index);
inventory.cycle(direction);
inventory.clear();
inventory.onChange = (inventory) => {};
bindHeldItem(legacyState, inventory);
```

### Ownership, consumers and migration

The slot array and selected index are the authoritative ownership state. Held
meshes are views of `inventory.held`, never a second inventory. Apartment,
Bing, Silver and Silver Pines use `Inventory`; Mansion final-arc loadout uses
it through `src/mansion/loadout.js`.

Scripted handoffs must capture the exact slot and call
`removeAt(index, expectedId)`. `remove(id)` can remove an older duplicate after
the player changes selection. New scene item presentation can extend the item
catalog, but must not introduce a local pocket array or club-only hotbar.
`tests/inventory.test.mjs` and `tests/inventory-view.test.mjs` are the contracts.

## Interaction ownership and reusable labels

### Canonical Module and Interface

`src/core/interaction.js` owns the center-screen ray and all prompt/hold state:

```js
const interaction = new InteractionSystem(camera, hud);
interaction.register(ownerObject, descriptor);
interaction.unregister(ownerObject);
interaction.setOccluders(objects);
interaction.setExclusiveTarget(ownerObjectOrNull);
interaction.update(dt);
interaction.press();
interaction.release();
interaction.setPaused(paused);
```

The descriptor Interface supports `label`, `key`, `hold`, `holdLabel`,
`enabled`, `soft`, `onUse`, `onTap`, `onLook` and `onHoldProgress`.
`register` writes that descriptor to the exact owner object's
`userData.interact`; descendant ray hits walk upward to that owner.

### Label vocabulary

Use `.name` for stable human/tool lookup and reserve these `userData` fields:

| Field | Meaning |
| --- | --- |
| `interact` | Descriptor owned and written by `InteractionSystem`; do not hand-maintain a duplicate |
| `reusableSystem` | Shared runtime family such as `blood` or `smoke` |
| `reusableProp` | Shared visible prop identity such as `squatch-beer`, `cigarette-pack` or `zyn-tin` |
| `hitOwner` | Current logical owner of a pooled attached hit mark |
| `bloodEffect` | `impact`, `spatter` or `death-pool` |
| `bongRoot` | Visible bong root associated with its invisible interaction target |

Register one intentional owner, normally a named root or generous invisible
target. Do not register both a child mesh and its parent. Use `soft: true` only
for convenience volumes that must yield to solid foreground objects.

Every new reusable prop should expose a stable `.name`; if several scenes need
to find it by meaning, also assign `userData.reusableProp`. Scene verifiers
should assert both the label and the registered owner.

## Pause menu and scene recovery

### Canonical Modules and Interface

- `src/core/pause-menu.js` owns the Tab/resume UI and recovery buttons.
- `src/core/scene-recovery.js` owns the durable restart ledger and unlock
  policy.
- `src/core/campaign-scene-skip.js` owns campaign-scene reset and guarded skip
  Adapters.
- `src/core/apartment-recovery.js` is the hub-specific Adapter for Apartment's
  changing durable beat.

```js
const recovery = createSceneRecovery({
  sceneId,
  restartCheckpoint,
  canRestartCheckpoint,
  restartScene,
  completeAndSkip,
});

createPauseMenu({
  title, instructions, getObjective, canPause, onPause, onResume, recovery,
});
```

The recovery Interface is `getState()`, `restartFromCheckpoint()`,
`restartScene()` and `skipScene()`. Skip unlocks after either two checkpoint
restarts or two scene restarts. The persistent key is
`squatch-life.scene-recovery.v1`; preview runs use isolated preview/session
storage and must not touch the canonical campaign.

### Stable UI labels

- Pause root: `[data-scene-pause]`.
- Resume: `[data-scene-pause-resume]`.
- Checkpoint restart: `[data-scene-recovery-action="checkpoint"]`.
- Scene restart: `[data-scene-recovery-action="scene"]`.
- Skip: `[data-scene-recovery-action="skip"]`.

### Campaign completion rule and migration

`createCampaignSceneRecovery` is the canonical campaign Adapter. Its skip path
first commits the scene's canonical completion facts through the same campaign
Seam used by normal play, verifies that completion succeeded, and only then
navigates. This prevents later objectives from seeing a skipped scene as
unfinished.

Every playable campaign scene must mount `createPauseMenu` with a recovery
Adapter. Do not add local skip counters or navigate directly from a Skip
button. Add a scene to `RECOVERABLE_CAMPAIGN_SCENES`, provide a canonical
completer/destination, and extend `tests/campaign-scene-skip.test.mjs` and
`tests/scene-recovery-wiring.test.mjs`. `tests/scene-recovery.test.mjs` proves
the threshold, durability and preview isolation.

## Migration order

1. Move Bing and Silver drink motion to `poseHeldDrink`; then extract the
   apartment held-consumable sequence once for all four drinking scenes.
2. Transform `WeaponSystem` impact normals to world space and feed resolved
   combat hits into the shared blood Module.
3. Continue replacing scene-local prop approximations with `world/props.js`
   builders plus the stable `reusableProp` vocabulary.
