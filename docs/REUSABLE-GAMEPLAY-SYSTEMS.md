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
| Bullet wounds and death blood | `src/world/blood.js`, over `src/world/bullets.js` | Canonical shared high-level Interface | Mansion Silent Squatch, Mansion Siege, Cartel Palace, Heist and Squatchfather; Silver Case remains an older Implementation to migrate |
| Held beer/drink model and motion | `src/world/props.js` | Canonical visual Interface; use-state orchestration still needs extraction | Apartment, Silver Pines, Cabin Hideout, Luxury Apartment, Bing and Silver share `poseHeldDrink` |
| Dress-help interaction | `src/world/dress-help.js` | Canonical shared sequence with scene rig Adapters | Apartment Margo and the second Mansion pool performer |
| TV playback and attenuation | `src/core/tv.js`, with `src/core/audio.js` listener state | Canonical | Apartment and Mansion televisions, including the Mansion theatre |
| Smoke and cigarette exhale | `src/world/smoke.js` | Canonical | Apartment, Silver Pines, Enola Squatch, Mansion bong behavior |
| Functioning bong | `src/world/bong.js` | Canonical | Apartment and Mansion LAN room |
| Weapon operation | `src/core/weapons/index.js` | Canonical; `Firearm` is the state authority | Cartel Palace, Mansion and Mansion Siege; CombatLab verifies; Heist runs catalog `Firearm` behind the `HeistFirearm` compatibility Adapter in `src/heist/combat.js` |
| Character weapon mounting | `src/core/weapons/character-mount.js` | Canonical catalog grip, bore-roll and firing-hand Interface | Mansion Siege, Cartel Palace, Silver Case, NO WAKE, Heist and Initiation presentation |
| Formal meeting appearance | `src/core/formal-appearance.js` | Canonical scene-variant garment Adapter; canonical bodies remain unchanged | Special Meeting and Initiation |
| Vehicle occupants | `src/core/vehicles/occupants.js` | Canonical vehicle-owned seat and camera-anchor Interface | Special Meeting, Motel, Golf, Bing and Silver Pines |
| Vehicle headlight beams | `src/core/vehicles/headlights.js` | Canonical forward-beam geometry and aiming Interface | Special Meeting forest/sedan traffic, Motel drive and Initiation cabin |
| Death-transition lifecycle | `src/core/death-transition.js` | Canonical lifecycle and spatial audit seam; authored fall animation remains a scene Adapter | Silver Case, Motel, Initiation and Squatchfather (Sal/McClawsky seated deaths) |
| Planar mirrors | `src/core/planar-mirror.js` | Canonical real reflection camera and mounted-plane derivation | Apartment, Luxury Apartment, Cabin and Squatchfather mirror Adapter |
| Reflected first-person body | `src/core/first-person-body.js` | Canonical reflection-layer pose, weapon and cross-scene outfit-continuity Interface | Apartment, Luxury Apartment and Cabin; Squatchfather retains its authored layer-1 Adapter |
| Surface footsteps | `AudioEngine.footstep()` in `src/core/audio.js` | Canonical cadence, delivered-sample variation and optional positional playback Interface | Shared Player scenes; Initiation now supplies only its `footingAt()` scene Adapter and uses the canonical forest/wood banks |
| Environment visibility budgets | `src/core/environment-visibility.js` | Canonical minimum contracts by environment archetype | Luxury Apartment skyline, Cabin wilderness and Special Meeting forest drive |
| Semantic prop placement | `src/core/semantic-placement.js` | Canonical opt-in floor, wall, facing, room and seam validator | Luxury Apartment, Cabin and Cartel Palace |
| Throwable ballistics | `src/core/throwable.js` | Canonical charge, continuous projectile and segment-impact foundation | Luxury Apartment darts; future thrown props should adapt this Module |
| Ground-combat truth | `src/core/combat/` | Canonical Modules behind scene Adapters | Mansion Siege and Cartel Palace are green production Adapters; Mansion's ensemble also proves friendly perception/aim/fire reuse; CombatLab is verification only |
| Player inventory | `src/core/inventory.js` | Canonical | Apartment, Bing, Silver, Silver Pines and Mansion final-arc loadout |
| Look/hold interactions | `src/core/interaction.js` | Canonical | All first-person scenes that use world-object prompts |
| Pause and failure recovery | `src/core/pause-menu.js`, `src/core/scene-recovery.js`, `src/core/campaign-scene-skip.js` | Canonical | Campaign scenes listed by `RECOVERABLE_CAMPAIGN_SCENES`; Apartment uses its hub Adapter |
| Player settings (subtitles, shake, assist, volume, sensitivity, keymap) | `src/core/settings.js`, rendered by `src/core/pause-menu.js` | Canonical | Every scene that mounts the pause menu (all campaign scenes, Initiation, Combat Lab); the Silver Room start screen delegates to it; `AudioEngine` and the Motel/Squatchfather/Initiation audio modules honour its volume; the shared `Player`, Beef Run cameras and the Enola gunner honour its sensitivity |

## Scene-polish foundations

The 2026-08-24 cross-scene polish pass exposed seven concepts that had already
started to fork. They now have small canonical Modules with narrow scene
Adapters:

- `VehicleOccupants` parents Object3D riders to vehicle-owned anchors. Players
  that are not Object3Ds ask the same anchor for `worldPoint()`. No passenger
  loop independently interpolates toward a moving car. `release()` preserves
  the rider's world transform when an NPC exits and resumes scene navigation.
- `createHeadlightBeam()` owns the transformed cone whose tip is at the lamp
  and whose beam points along local +X. Scenes may choose reach, width and aim;
  they may not rotate stock cone geometry and rediscover the backwards-beam
  bug.
- `beginDeathTransition()` disables live controller/navigation/animation
  state, freezes posture semantics and records the connected body hierarchy.
  `auditDeathTransition()` checks hierarchy, reactivation, rendered contact,
  wall/furniture clearance and floor/seat/stair support. Standing, seated,
  against-wall, furniture-adjacent, stair and scripted-execution contexts are
  covered by `tests/death-transition-contract.test.mjs`; scene Adapters still
  own the authored collapse pose.
- `PlanarMirror` derives its plane from the mounted mesh and owns reflection
  render-target lifecycle. A bathroom may provide grime, cracks and a distance
  policy, not a second reflection-camera implementation.
- `FirstPersonBody` owns the reflection-only figure layer, stable
  standing/seated/bed/scripted pose synchronization, walk gait, reflected
  weapon state and persistent outfit identity. Scenes supply only their
  palette/figure factory and their current player state; they do not fork the
  body lifecycle to make a different bathroom mirror work.
- `AudioEngine.footstep()` owns cadence, per-surface sample treatment,
  no-immediate-repeat selection and positional routing. A scene may map a world
  point to a surface and provide a per-actor cadence key; it may not rebuild the
  cue switch. The `forest` treatment rotates delivered dirt, grass and dry-leaf
  recordings, including a restrained higher-rate twig crack.
- `ENVIRONMENT_VISIBILITY` makes skyline, wilderness-hub and forest-drive
  distances reviewable together. `validateEnvironmentVisibility()` rejects
  trees beyond supporting terrain, camera clipping before the last chunk and
  undergrowth that outlives its near-detail band.
- `markSemanticPlacement()` attaches serializable floor, wall, orientation,
  room-envelope and seam contracts to important authored props. The validator
  fails missing supports and marked objects with no rendered bounds; an
  unmarked prop is not silently counted as certified.
- `ThrowCharge` and `BallisticProjectile` separate charge and continuous
  collision from dart scoring, audio and presentation. Future throwable scenes
  should provide colliders and policy instead of copying integration code.

The focused Interface proofs are
`tests/vehicle-presentation.test.mjs`,
`tests/death-transition-contract.test.mjs`,
`tests/environment-visibility.test.mjs`,
`tests/semantic-placement.test.mjs`, and
`tests/core-throwable.test.mjs`. Scene browser verifiers remain responsible for
proving that the real composition root mounts and exercises each Module.

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
- Mansion Siege and Cartel Palace both consume `BloodImpactSystem` for an
  applied Located hit and `DeathBloodPool` for an actual fatal result. Their
  checkpoint/restart Adapters reset both pools rather than saving decals as
  durable combat state.
- Heist / THE TAKE mounts `BloodImpactSystem`, `BloodSpurtSystem` and
  `DeathBloodPool` through `src/heist/combat.js#presentImpact`: applied hits
  attach shared wounds at the real ray point, fatal results own exactly one
  spreading floor pool, and the old scene-local sphere/decal pools are gone.
- Squatchfather constructs `BloodImpactSystem` and a two-entry
  `DeathBloodPool` in `src/squatchfather/runtime-geometry.js`. Its scene Adapter
  resolves the first visible centre-ray contact: ordered hits attach shared
  wounds at that exact point on the nearest safe animated body joint before the
  authored fall, wrong targets receive a nonfatal shared wound, restaurant
  blockers keep the existing bullet hole, and only accepted fatal hits create
  a floor pool and advance the scene.

`tests/blood-effects.test.mjs` is the deterministic public-Interface test. It
proves exact hit placement, attachment through body motion, bounded pooling,
explicit floor placement, deterministic pool growth and safe ownership when a
pooled wound is recycled.

`WeaponSystem._impact` now publishes a complete per-shot world-space record
with owned origin, direction, point and normal vectors. At fire time it also
captures frozen local point/normal contacts for every hit-object ancestor, so
`CombatImpactResolver` can select the authored body anchor after visible tracer
travel without converting the old world point through a moving target's new
transform. Scene Adapters can therefore attach blood at the exact resolved hit
point without guessing; the resolver freezes the world record before applying
damage.

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

- Apartment `src/main.js`, Silver Pines `src/golf/hands.js`, Bing
  `src/bing/main.js` and Silver `src/silver/main.js` call the shared motion
  Interface now.
- Hold duration, crack/sip/crush audio, cancellation, item consumption and
  intoxication effects are still orchestrated separately in Apartment, Bing,
  Silver and Golf. The next shared Module should be a `HeldConsumableSequence`
  whose Interface accepts duration, cue callbacks, `pose(progress)`,
  `consume()` and `cancel()`. Extract the apartment behavior rather than
  designing a new beer flow.

`tests/golf-consumables.test.mjs` proves Silver Pines uses the shared prop
labels and visible held models. `tests/held-drink-pose-contract.test.mjs` keeps
Bing and Silver on the canonical motion helper without moving their gameplay
sequences yet.

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

## Ground-combat architecture

### Vocabulary and ownership

Use these terms literally in combat work:

| Term | Meaning in this architecture |
| --- | --- |
| Module | A reusable owner of one piece of mechanical truth under `src/core/combat/`, `src/core/weapons/` or `src/world/blood.js`. |
| Interface | The public constructor, methods, returned data and stable `userData` protocol documented below. |
| Implementation | The code behind an Interface. A mission must not fork an Implementation to change story behavior. |
| Seam | A small, explicit data boundary: a full weapon impact, a Located hit, a copied perception point or a snapshot. |
| Adapter | Scene code that builds cast records, supplies authored geometry, translates Module results into mission and presentation behavior, and saves durable state. |
| Depth | Mechanical complexity hidden behind a compact Interface: collision sweeps, visibility, bore alignment, armor, ammo and shot truth. |
| Leverage | The number of missions and bug classes fixed by changing the canonical Module once. |
| Locality | Mission facts remain beside the mission: waves, tactics, story consequences, cover anchors, dialogue and visual staging do not move into generic Modules. |

The architecture deliberately puts high-Depth, high-Leverage mechanics in
Modules while preserving high Locality in each Adapter. The data flow is:

```text
player input -> WeaponSystem/Firearm -> immutable trigger and projectile paths
                                      -> material penetration / terminal contacts
                                      -> CombatImpactResolver -> CombatActor
                                                              -> CombatImpairments
                                                              -> blood / armor / audio Adapters

truthful missed paths -> CombatSuppressionField -> exposed SuppressionModels
terminal world contact -> BallisticImpactSystem -> bounded mark + material audio

CombatPerception -> copied sampled point -> CombatWeaponAim
                                        -> CombatFireControl -> CombatActor

AabbCombatSpace supplies the same blocker truth to movement, sight and shots.
```

`src/core/weapons/index.js` is the preferred weapon import surface.
`src/core/combat/index.js` is the preferred combat import surface when the
required export is available there. Direct constituent imports remain valid
for existing Adapters, but they are not permission to create scene-local
copies.

### Character weapon mount Interface

`src/core/weapons/character-mount.js` owns the high-Leverage character-to-
catalog Seam that scene-local forearm offsets previously duplicated. Catalog
models fire down local `-Z` and carry their sights on local `+Y`; the shared
mount applies the canonical forearm pitch and the equally important
`Rz(PI)` bore roll, then aligns the catalog weapon's measured grip with the
visible hand socket.

```js
const row = characterWeaponMount(weaponId);
const gun = mountCharacterWeapon(figure, weaponId, model, {
  side: 'R',
  parent,       // optional legacy-rig Adapter
  hand,         // optional explicit socket
  handPosition, // optional legacy local socket
});
```

Scenes retain Locality over pose, recoil, support-hand IK, shot timing and
story consequences. They must not copy catalog grip anchors or omit only the
bore roll. `tests/character-weapon-mount.test.mjs` is the reusable contract.

### Formal meeting appearance Adapter

`formalMeetingModel(characterId, canonicalModel)` changes only garment fields
for a formal scene. It preserves the established height, build, face, hair,
skin, gender/body shape and personal identity while selecting a stable
charcoal/navy/brown suit, ordinary tie and creased trousers. It deliberately
disables tuxedo, bow tie, pinstripe, three-piece and luxury flags: these are
nice suits, not a costume gala. The result is frozen scene data; it never
mutates the ordinary wardrobe model. `tests/formal-meeting-presentation.test.mjs`
proves identity preservation, restrained styling and cast variation.

### WeaponSystem and Firearm Interface

`WeaponSystem` is the player-weapon composition Module. `Firearm` is the
canonical per-gun state Module used inside it and directly by NPC Adapters.

```js
const weapons = new WeaponSystem({
  camera, world, audio, groundAt, hitTargets, range, onImpact, onEvent,
});
weapons.firearm(id);
weapons.equip(id);
weapons.stow({ silent });
weapons.setAimed(on);
weapons.setSuppression(valueOrObject, aimStability);
weapons.setTrigger(down);
weapons.triggerPress();
weapons.reload();
weapons.cancelPendingImpacts();
weapons.update(dt, { speed });
weapons.hud();
weapons.feedback();
weapons.dispose();

const firearm = new Firearm(idOrDefinition, { rounds, reserve });
firearm.setTrigger(down);
firearm.fire({ aimed, aimStability });
firearm.spreadNow({ aimed, aimStability });
firearm.resupply(rounds);
firearm.reload();
firearm.cancelReload();
firearm.update(dt);
firearm.snapshot();
firearm.restore(snapshot);
```

`WeaponSystem.onImpact` is the only player-ray Seam. It publishes a complete
per-projectile world-space record with owned vector values:

```js
{
  point, normal, origin, direction, distance,
  object, weapon, damage, penetration,
  material, penetrated, stopped,
  remainingEnergy, remainingPenetration,
  triggerId, projectileIndex, projectiles, triggerDamageCap,
  localContacts,
}
```

The existing `fire` event publishes immediate immutable Shot truth even when
the projectile reaches empty air. A single-projectile gun exposes one path;
the pump shotgun exposes seven frozen `shot.pellets` paths while spending one
shell and emitting one blast, recoil, flash and pump-cycle event. Each pellet
is raycast, penetrated and clipped independently. Scene Adapters aggregate a
trigger's actor damage against `triggerDamageCap`, de-duplicate physical audio
and near-miss pressure per actor, and allow only one fatal transition.

`localContacts` is frozen fire-time transport metadata: one `{ anchor, point,
normal }` sample for each Object3D ancestor of the ray hit. It is not a second
world-space impact record. `CombatImpactResolver` consumes the sample matching
its selected body anchor, while synchronous/custom impacts without the field
retain the ordinary world-to-local fallback.

No Adapter may discard the actual `object`, substitute a guessed body point,
reconstruct the ray from the current camera after tracer travel, or convert the
world normal twice. Hidden ancestors are filtered before an object can stop a
round. `CombatImpactResolver` clones and freezes the complete record before any
fatal pose can move the victim.

`WeaponSystem.feedback()` returns exactly
`{ aimed, aimBlend, spread, bloom, suppression }`; reticle and camera
presentation read that data but do not own accuracy. `Firearm` owns magazine
and reserve counts, semi/automatic trigger rules, cooldown, recoil, dry-click
latching and phased reload behavior. Its restore Interface intentionally keeps
durable ammunition but clears reload timers, recoil, cooldown and held-trigger
latches.

The `WeaponController` debt in `src/core/combat/weapon.js` is retired:
`WeaponController` has no production consumer left. Heist / THE TAKE — its
last scene — now runs canonical `Firearm` behind the `HeistFirearm`
compatibility Adapter in `src/heist/combat.js`, and Mansion Siege hostiles and
its friendly ensemble migrated earlier. Do not reintroduce a second
ammunition/reload authority anywhere; a scene that still speaks the old
trigger dialect gets a thin compatibility Adapter over `Firearm`, never new
behavior on `WeaponController`. `BurstController` remains a useful NPC
trigger policy and stays exported.

### CombatActor Interface: health, armor and lethal hits

```js
const actor = new CombatActor({
  id, faction, maxHealth, armor, maxArmor, core,
});
actor.applyHit({ amount, attacker, playerShot, matrix, lethal });
actor.heal(amount);
actor.replenishArmor(amount);
actor.setInjury(grade);
actor.snapshot();
actor.restore(snapshot);
actor.durableSnapshot();
actor.restoreDurable(snapshot);
```

`CombatActor` is the sole health and armor authority. Ordinary damage absorbs
up to 55 percent of raw damage from remaining armor, reports the exact absorbed
amount and `armorBroken`, then reduces health. A Located head hit passes
`lethal: true`: it bypasses armor but still obeys faction permission and core
protection. A protected core fatal attempt remains at one health and reports
`fatal: false`, `fatalPrevented: true` and `protectedCore: true`; `lethal` still
records the requested hit-location rule. A presentation Adapter therefore
cannot mistake that surviving actor for a corpse or death pool.

`applyHit` returns the mechanical truth, including `applied`, `reason`, `raw`,
`damage`, `absorbed`, `armorBefore`, `armorAfter`, `armorBroken`,
`healthBefore`, `healthAfter`, `lethal`, `fatal` and, when applicable,
`fatalPrevented`/`protectedCore`. `fatal` always means the actor actually became
incapacitated. Scene code must branch on this result rather than subtracting
health or armor itself. `FactionMatrix` remains the damage-permission Module;
`resolveBallisticHits` remains the lower-level ordered penetration Interface
for a genuinely multi-hit round.

### AabbCombatSpace, perception and visible aim

```js
const space = new AabbCombatSpace({
  boxes, bounds, radius, height, separation, verticalSeparation,
  floorClearance, headClearance,
});
space.trace(from, to, { boxes, skipRadius, ignore });
space.move(position, displacement, { boxes, bounds });
space.separate(subject, peers, {
  boxes, bounds, separation, verticalSeparation,
  positionOf, idOf, eligible, id,
});

const perception = new CombatPerception({
  range, fov, memorySeconds, awareness, awarenessGain,
  memoryAwarenessFloor, memoryAwarenessLoss, lostAwarenessLoss,
  samplePoint, eligible, score, idOf, space, trace,
});
perception.scan({
  origin, forward, candidates, boxes, range, fov,
  samplePoint, eligible, score, idOf, space, trace,
});
perception.tick(dt);
perception.snapshot();
perception.restore(snapshot);

const aim = new CombatWeaponAim(options);
aim.update(dt, {
  root, weaponModel, weaponController, targetPoint,
  muzzleHeight, settleScale, interrupted, pose,
});
aim.snapshot();
aim.restore(snapshot, { root, weaponController });
```

`AabbCombatSpace.trace` returns the deterministic nearest blocker with cloned
world data and a stable collider identity. It ignores the collider containing
the origin. `move` performs swept horizontal-axis movement with wall sliding,
bounds clamping and no tunneling through thin objects. `separate` resolves
crowds in stable id order and reuses collision checks, so separation cannot
push an actor through a wall. The scene Adapter remains responsible for
authoring the correct boxes, bounds and walk-over clearances.

`CombatPerception` can select only an eligible candidate inside range and FOV
with an unblocked trace. It copies the sampled aim point; memory may retain that
copy, but it never follows a hidden actor through a live object reference.
Deterministic score and id ordering resolve ties. Its public truth is
`target`, `targetVisible`, `sampledPoint`, `lastSeen`, `distance`, `memory` and
`awareness`.

`CombatWeaponAim` turns the actual actor root, drives pitch and an optional pose
callback, and derives the weapon model's world muzzle and local negative-Z
bore. `aligned` becomes true only when both the body aim and actual bore are
inside tolerance and the actor is not interrupted. A restored snapshot never
restores firing permission; the next update must prove alignment again. An NPC
that is shooting must therefore visibly face and point its weapon at the point
it sampled.

### Located impacts and hostile shot truth

```js
const impacts = new CombatImpactResolver();
const unregister = impacts.register(root, {
  actor, combatant, zoneOf, partOf, anchorOf, materialOf,
});
impacts.resolve(impact, {
  attacker, playerShot, damage, lethalHeadshots, damageScale,
});
unregister();

const fireControl = new CombatFireControl({
  random, space, colliders, alignmentTolerance, targetTolerance,
  nearMissRadius, whizCooldown, missMin, missMax,
});
fireControl.resolveShot({
  origin, boreDirection, aimPoint,
  target, targetPoint, targetVisible,
  attacker, damage, damageScale, accuracy, playerShot,
  areaFire, colliders, space, trace,
});
fireControl.update(dt);
fireControl.snapshot();
fireControl.restore(snapshot);
```

`CombatImpactResolver.register` walks a ray-hit object's ancestors to find the
registered combatant. Descriptor values may be constants or functions. The
Located-hit result preserves the frozen full impact record and adds `root`,
`combatant`, `actor`, `zone`, `part`, `anchor`, `material`,
`anchorLocalPoint`, `anchorLocalNormal`, `result`, `applied`, `lethal` and
`fatal`. WeaponSystem-supplied anchor-local point and normal are captured when
the shot is fired; synchronous callers are captured immediately before
`applyHit`. Target motion during tracer travel and a fatal fall therefore
cannot drag the wound back to an old world-space pose. The default humanoid
`head` zone requests a lethal hit. Invisible, inactive, down,
incapacitated and unregistered targets are rejected honestly. This Module
never creates blood, emits audio or calls mission callbacks.

`CombatFireControl` is data-only hostile-shot truth. It fires only along an
aligned actual bore. Actor damage additionally requires an explicitly visible
target whose current point remains within tolerance of the copied sampled aim
point. Area fire has no actor and can never damage one. A collider ends the
round at the blocker; a clean miss ends off the target; a wall prevents a
through-wall near miss. The shared pool-wide whiz cooldown makes `whiz` a
rate-limited permission rather than an audio side effect. Results carry cloned
`origin`, `direction`, `boreDirection` and `end` plus `fired`, `reason`,
`blocked`, `blocker`, `hit`, `nearMiss`, `whiz`, `distance`, `missDistance`,
`damage`, `applied`, `fatal`, `result`, `targetId`, `actor`, `areaFire` and
`boreError`. The Adapter alone turns those facts into tracers, impact particles,
sound, suppression and HUD feedback.

### Impairment, suppression, supplies and combat HUD

```js
const impairments = new CombatImpairments(options);
impairments.applyResolvedHit(locatedHit);
impairments.update(dt);
impairments.snapshot();
impairments.restore(snapshot);

const suppression = new SuppressionModel({ decay });
suppression.noteNearMiss(distance, energy);
suppression.update(dt);
suppression.snapshot();
suppression.restore(snapshotOrValue);
suppression.reset();
suppression.value;
suppression.aimStability;
suppression.vignette;

const supplies = new CombatSupplyState({
  triageCharges, resupplyCharges, triageHeal,
  armorPerUse, magazinesPerWeapon,
});
supplies.useTriage(actor, { heal });
supplies.useResupply({ actor, firearms });
supplies.snapshot();
supplies.restore(snapshot);
```

`CombatImpairments` accepts only an applied Located hit. Stagger temporarily
interrupts aim; leg wounds reduce `speedScale`; arm wounds reduce
`accuracyScale` and `aimSettleScale`. The Adapter feeds those scales into
movement, `Firearm` and `CombatWeaponAim`; it does not reproduce their math.

`SuppressionModel` grows only from honest near misses and decays over time. It
reduces aim stability and exposes vignette strength without taking control from
the player. `snapshot()` returns the JSON-safe `{ version: 1, value }` record;
`restore(snapshotOrValue)` accepts that record or the legacy scalar, clamps the
value to `[0, 1]`, and returns the Module. `reset()` clears pressure to zero and
also returns the Module. None of these Interfaces serializes presentation or
the Module instance.

`CombatSupplyState` owns finite triage and resupply charges. Triage consumes a
charge only when `CombatActor.heal` actually restores health. Resupply consumes
a charge only when it restores actor armor or adds bounded reserve ammunition
through `Firearm.resupply`. It cannot overfill either authority. Armor/health
display comes from the shared `combatVitals()` view model. Mansion Siege mounts
the complete `CombatStatusHud`, including its directional damage wedge. Cartel
Palace keeps its authored DOM/CSS Adapter but consumes `combatVitals()` rather
than duplicating health/armor math or inventing a second armor total.

### Ballistic material, suppression and presentation Interfaces

`AabbCombatSpace.traceAll()` returns deterministic ordered entry/exit contacts.
Only an explicit `combatMaterial` tag grants material behavior; transparency,
mesh names and render materials never imply penetration. `resolveMaterialPath`
spends penetration and energy through declared thin `glass`, `drywall`,
`wood_thin` and `car_door` contacts, while unknown geometry and concrete stop
at the truthful first point. Vision blocking remains an independent Adapter
decision.

`CombatSuppressionField.applyPlayerShot({ shot, combatants })` consumes the
finite terminal segment from Shot truth. It can call an exposed combatant's
existing `SuppressionModel.noteNearMiss` once per trigger, but cannot damage,
extend beyond a blocker, reach through side cover, or pressure an actor hit by
another projectile from the same trigger.

`CombatProjectilePattern` samples normalized independent rays for the shared
pump shotgun. It owns cone geometry only. `WeaponSystem` and
`CombatFireControl` still own ray/path resolution; `Firearm` remains the one
shell and cycle authority; each Adapter owns only actor aggregation and local
presentation.

`BallisticImpactSystem` maintains a bounded pool of exact-point, exact-normal
surface marks and selects material audio. Flesh stays exclusively with
`BloodImpactSystem`. `CombatArmorPresentation` consumes live `CombatActor`
armor and a resolved hit, builds a readable plate silhouette, presents one
break transition, and reconstructs from actor state after checkpoint restore.

`CombatAudio` maps mechanical truth to semantic positional cues: flesh/head/
armor impact, armor break, caliber whiz, material strike, supply use, ejecta,
takedown and body-fall surface. `CombatStepCadence` uses actual post-collision
travel per combatant and enforces both per-source cadence and a global voice
budget. Scene Adapters preload `GROUND_COMBAT_AUDIO_CUES`; dialogue and voiced
barks remain story-local and are never invented by these Modules.

### Stable `userData` protocol and body anchors

Every hittable humanoid Adapter uses this protocol:

```js
root.userData.combatant = sceneCombatant;
root.userData.combatActor = combatActor;

bodyAnchor.userData.hitZone = 'head' | 'chest' | 'limb';
bodyAnchor.userData.hitPart = 'head' | 'chest' | 'arm' | 'leg';
```

| Field | Stable meaning |
| --- | --- |
| `combatant` | Scene record containing identity and authored state such as `active`, `down`, role, root and figure. |
| `combatActor` | The canonical `CombatActor` health/armor authority. |
| `hitZone` | Damage-location category. `head` is lethal by default; `chest` and `limb` are ordinary armor-aware hits. |
| `hitPart` | Consequence category consumed by `CombatImpairments`: `arm` affects aim, `leg` affects movement. |
| body anchor | The nearest plain or uniformly scaled Object3D carrying `hitZone`/`hitPart`, or the value returned by the registration's `anchorOf`. It is the attachment frame for blood. |

A ray may hit any descendant mesh; ancestor walking supplies this protocol.
Do not make a non-uniformly scaled render mesh the body anchor. Do not require
scene-only aliases such as `palaceCombatant` for shared resolution. An Adapter
may keep an alias temporarily, but the stable fields above must also exist.

### Durable state rules

Checkpoint state stores model truth, never object-graph or presentation truth:

Cartel Palace stores one versioned `checkpointSnapshot` beside its existing
story checkpoint. That compound record owns the player's durable actor,
suppression scalar, five-slot loadout/ammunition and the Palace security
snapshot; v15 campaigns migrate to schema v16 with that field null and retain
the authored legacy staging fallback until the next real checkpoint.

- Use `CombatActor.snapshot()` only for an in-memory Runtime checkpoint that is
  allowed to retain authored relationships. Save `CombatActor.durableSnapshot()`
  and `Firearm.snapshot()` by stable id across a page or campaign Seam;
  `restoreDurable()` preserves the live `anchor`/`carrying` relationships while
  restoring only bounded scalar combat state.
  `Firearm.restore` deliberately restarts ready with no trigger latch, recoil,
  cooldown or half-finished reload.
- Save `CombatPerception.snapshot()`, `CombatWeaponAim.snapshot()`,
  `CombatImpairments.snapshot()`, `CombatFireControl.snapshot()` and
  `CombatSupplyState.snapshot()`. Perception restore clears the live target;
  aim restore clears `aligned`.
- Save `SuppressionModel.snapshot()` only where a mission requires durable
  pressure; its record contains the scalar `value`, restore clamps it and reset
  clears transient pressure at a retry boundary.
- Rebuild `AabbCombatSpace` from authored colliders and rebuild every
  `CombatImpactResolver` registration from the live cast. Do not serialize
  colliders, Object3D references, registry entries, actor references or target
  references.
- Call `WeaponSystem.cancelPendingImpacts()` before restoring actors. A delayed
  tracer from the discarded timeline must not damage the restored checkpoint.
- Blood marks, spatter, death pools, muzzle flashes, tracers, hit confirms,
  camera recoil, whiz audio and damage wedges are transient presentation.
  Reset pooled blood and feedback; never save them as story state.
- `CombatActor.anchor` and `carrying` are Runtime relationships and are never in
  Durable combat state. A separate mission-owned id may be stored when a story
  actually needs to reconstruct one of those relationships.

### Production Adapters, verification and scene-authored Locality

Mansion Siege and Cartel Palace are the two production ground-combat Adapters.
That reuse claim is proven for both player/hostile and hostile/player paths;
Mansion's friendly ensemble additionally proves the shared perception, rendered
aim, fire-control and impact stack without moving its authored cast or kill
budget into core. CombatLab is verification only: it demonstrates Modules and
catches regressions but is not a campaign Implementation and must not own
alternate rules.

| Adapter | Shared mechanical composition | Scene-authored Locality |
| --- | --- | --- |
| Mansion Siege | Player `WeaponSystem`, hostile pool and friendly ensemble use canonical `Firearm`, `CombatActor`, `AabbCombatSpace`, `CombatPerception`, `CombatWeaponAim`, `CombatImpairments`, `CombatImpactResolver`, `CombatFireControl`, `SuppressionModel`, `CombatSuppressionField`, `CombatSupplyState`, material impacts, armor presentation, combat audio and shared blood. | Waves, breach routes, room graph, tactical roles, Lou's ensemble, armory placement, difficulty scale, checkpoints, authored barks, hit-confirm styling, floor lookup and fatal pose. |
| Cartel Palace | Player `WeaponSystem` and hostile security use `Firearm`, `CombatActor`, `AabbCombatSpace`, `CombatPerception`, `CombatWeaponAim`, `CombatImpairments`, `CombatImpactResolver`, `CombatFireControl`, `SuppressionModel`, `CombatSuppressionField`, material impacts, armor presentation, combat audio and shared blood. Scripted allies do not constitute a generic friendly-combat Adapter. | Patrol and cover/flank posts, blackout sight tuning, stealth/alarm escalation, Mark phases, Sauce timing, takedown permission, callbacks, presentation and extraction objectives. |

What stays scene-authored in every Adapter: cast and faction membership, spawn
and wave timing, patrol/navigation anchors, cover and tactical choices,
objective consequences, dialogue/barks, difficulty multipliers, destructible or
penetrable material rules, floor lookup, body-fall pose, tracer/audio choices,
blood-pool floor placement, hit-confirm/HUD mounting and checkpoint composition.
Those choices consume Module results; they may not contradict collision, LOS,
alignment, ammo, armor or damage truth.

The deterministic contracts are `tests/weapons-core.test.mjs`,
`tests/combat-core.test.mjs`, `tests/combat-spatial-perception.test.mjs`,
`tests/combat-aim-impairments.test.mjs`,
`tests/combat-impact-fire.test.mjs`, `tests/combat-supplies.test.mjs`,
`tests/combat-hud.test.mjs`, `tests/blood-effects.test.mjs` and
`tests/ground-combat-adapters.test.mjs`. `npm run verify:ground-combat` is the
repeatable cross-Adapter gate. Production proof
also requires the real Adapter tests and browser verifiers:
`tests/mansion-siege-people.test.mjs`, `tests/mansion-siege.test.mjs`,
`tools/verify-mansion-siege.mjs`, `tests/cartel-palace-combat.test.mjs`,
`tests/cartel-palace-runtime.test.mjs` and
`tools/verify-cartel-palace.mjs`. A static import or CombatLab-only check is not
production proof.

### Remaining migration matrix and order

Migrate in this order. The ordering maximizes Leverage while keeping each
Adapter change local enough to verify:

| Order | Scene / current Implementation | Required Adapter migration | Acceptance boundary |
| --- | --- | --- | --- |
| 1 | Heist / THE TAKE — DONE: the compatibility Adapter is `src/heist/combat.js`. `HeistFirearm` puts catalog `Firearm` behind the old loadout surface; player and mission-tooling rounds resolve through one honest phase-geometry trace into `CombatImpactResolver`; hostile officers run `CombatPerception`, `CombatWeaponAim` (visible bore on a modelled weapon) and `CombatFireControl` per round; applied/fatal impacts drive shared blood. Hostages, police phases/waves, threat escalation, objectives and authored navigation stayed local. | Delivered: no wall or hostage damage without an honest trace (the `shootHostage` probe included); catalog damage/armor rules identical to every other scene; durable ammo and hostile-pipeline checkpoints. `tests/heist-combat-adapter.test.mjs` is the focused proof; `tools/verify-heist.mjs` remains the browser proof. | Do not regress: any new heist damage path must trace through the Adapter; no second ammunition authority; blood stays the shared systems'. |
| 2 | Motel: `S.weapon`/`S.ammo`, cone selection, `segmentBlocked`, direct actor/player damage and local gun feedback. | Move gun state to `Firearm`, register actors, then route movement/LOS/aim/hostile rounds/player impacts through the shared Modules. Preserve the authored Silverback consequences and combat/story state machine. Represent the intentional bathroom-wall shot as an explicit material Adapter, not a global exception that lets colliders leak damage. | Exact blocker/miss endpoints, no sight or damage through ordinary walls, visible NPC alignment, armor/head/limb behavior, shared blood, checkpoint-safe ammo and acceptable fight performance. |
| 3a | Silver Case: older `ShotResolver`/`ImpactKit` and reaction windows. | Replace its impact and blood Seam first; adopt `WeaponSystem`/`Firearm` only where the player actually owns ammo/reload. Keep reaction-window and narrative outcome logic local. | Real world hit point and body anchor survive motion; lethal/armor rules agree with `CombatActor`; no duplicate blood authority. |
| 3b | Regular Mansion / Silent Squatch: shared blood is already mounted, but the scripted firearm path and figure mapping remain scene-specific. | Register the cast with the stable protocol and feed the full `WeaponSystem` impact into `CombatImpactResolver`. Do not turn a stealth/scripted sequence into generic siege AI. | Exact wound and one fatal pool, stable reset, protected cast remains protected, existing mission timing unchanged. |
| 3c | Squatchfather — DONE: `src/squatchfather/combat.js` replaces guessed eye-point `BulletHoles` with an ordered centre-ray Adapter and shared blood. | Delivered: the script stays local; misses and blockers do not advance it, wrong targets are wounded nonfatally, actual body contacts select safe animated anchors, and accepted fatal hits create one bounded floor pool. `Firearm` remains out because ammunition is not gameplay state here. | Do not regress: actor hits keep their real intersections through joint motion, only the ordered target advances each beat, and checkpoint recovery clears every transient effect. |
| 3d | Remaining scripted firearm scenes after the named migrations. | Adopt the shared impact, blocker and blood seams only where a scene has ordinary on-foot firearm play; keep authored story sequencing in a scene Adapter. | Preserve exact-hit evidence, one fatal pool per accepted death and every scene-specific mission consequence. |

Air combat, arcade combat/targeting and cinematic Initiation are explicitly out
of scope. Enola flight weapons, vehicle/arcade rules and authored cinematic gun
beats are not ground-combat Adapters unless a later design explicitly introduces
ordinary on-foot hostile combat. Do not force this architecture into them merely
to increase the consumer count.

### Stable visual labels

- Held root: `weapons.viewmodel`.
- Flash: `weapons.muzzleflash`.
- Tracers: `tracer-pool`.
- Armory root: `armory`; holders: `armory-<weapon-id>-<index>`; lamps:
  `armory-lamp-<weapon-id>`.
- Model roots use catalog names: `revolver`, `pistol9`, `heist-carbine`, `saw`,
  `barrett`, `ak47`.
- Blood labels remain those in the blood section above. Ground-combat Adapters
  consume them; they do not create scene-prefixed blood Implementations.

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

The menu also renders the shared settings store, `src/core/settings.js`:
`get(name)`, `set(name, value)`, `subscribe(fn)`, `applyBody()` (the
`body.nosubs` / `body.bigsubs` classes and the shared subtitle rules), plus
`shakeScale()`, `lookSensitivity(base)` / `bindLookSensitivity(target, base)`,
`bindAudioVolume(engine)` and the keymap (`getKeymap()`, `bindKey()`,
`resetKeys()`, `translateKey(code)`). Storage keys are the Silver Room's
`squatch.*`. Scenes that forward keys to the shared `Player` pass them through
`translateKey` so a rebound key arrives as the code the Player reads; scenes
with bespoke movement keys (Motel, Squatchfather, Initiation) do not yet read
the keymap. Camera shake is multiplied by `shakeScale()` at the point it is
applied to the camera.

The recovery Interface is `getState()`, `restartFromCheckpoint()`,
`restartScene()` and `skipScene()`. Skip unlocks after two retries in any
combination of checkpoint and scene restarts. Failed storage writes retain
the retry ledger for the current page; successful writes remain durable. The persistent key is
`squatch-life.scene-recovery.v1`; preview runs use isolated preview/session
storage and must not touch the canonical campaign.

`src/core/objective-guide.js` provides scene-authored direction assistance.
Apartment, cabin, Bing, graveyard and luxury apartment adapters derive their
next target from live objectives and actual world objects. `[J]` reveals its
label, distance and a clamped screen marker for 14 active seconds; 45 seconds
without objective or distance progress reveals it automatically. Pause,
posture and dialogue time do not count. The pause menu also offers **Show
objective direction**, including when J is rebound to a movement action.
The guide never changes campaign state or completes an interaction.

### Stable UI labels

- Pause root: `[data-scene-pause]`.
- Resume: `[data-scene-pause-resume]`.
- Checkpoint restart: `[data-scene-recovery-action="checkpoint"]`.
- Scene restart: `[data-scene-recovery-action="scene"]`.
- Skip: `[data-scene-recovery-action="skip"]`.
- Settings block: `[data-scene-settings]`; each control
  `[data-scene-setting="subtitles|bigSubtitles|reduceShake|volume|sensitivity"]`,
  plus `assist` only in a scene that passes `assist: true` to
  `createPauseMenu` (today: The Silver Room's sway, the one thing that reads
  the setting — an accessibility switch that does nothing is worse than none);
  rebind buttons `[data-scene-rebind="forward|back|left|right|sprint|crouch|jump"]`;
  `[data-scene-rebind-reset]`. Proved by `npm run verify:settings`.

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

1. Extract the apartment held-consumable sequence once for all four drinking
   scenes now that Bing and Silver share `poseHeldDrink`.
2. Complete ground-combat Adapters in the matrix order above: Heist
   (`src/heist/combat.js`) and Squatchfather (`src/squatchfather/combat.js`) are
   done; Motel is next, then Silver Case, regular Mansion and the remaining
   scripted firearm scenes. This includes moving remaining applied hits to
   shared blood; air, arcade and cinematic Initiation combat remain excluded.
3. Continue replacing scene-local prop approximations with `world/props.js`
   builders plus the stable `reusableProp` vocabulary.
