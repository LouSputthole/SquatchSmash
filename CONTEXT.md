# SquatchSmash gameplay context

This vocabulary keeps shared gameplay Modules and scene Adapters aligned while
the campaign moves the same player, weapons, and combat rules between authored
missions.

## Language

**Combatant**:
A person participating in faction-governed ground combat. Each Combatant owns
one `CombatActor` for rules and one scene-authored rig for presentation.
_Avoid_: Enemy, NPC, target

**Combat Adapter**:
The scene-owned mapping from authored cast, geometry, navigation, animation,
audio, and mission consequences into the shared ground-combat Modules.
_Avoid_: Local combat system, AI framework

**Sampled aim point**:
The world position a Combatant actually perceived and is allowed to aim at.
It is a copied position, never a live reference that can follow someone behind
cover.
_Avoid_: Target position, live target

**Area fire**:
Fire directed at a fixed world position to suppress it without an associated
CombatActor. Area fire can create a near miss or hit geometry, but cannot
damage a hidden Combatant.
_Avoid_: Blind hit, wall shot

**Located hit**:
A complete weapon impact mapped to a Combatant, body zone, body part, and
attachment anchor before damage or a fall changes the rig.
_Avoid_: Damage callback, hit multiplier

**Shot truth**:
The immutable world-space record of one trigger pull: origin, direction,
ordered contacts, terminal point, material energy loss, and blocked/stopped
state. Empty-air shots still have a finite terminal point.
_Avoid_: Tracer target, visual-only ray

**Combat material**:
An explicit geometry tag that defines ballistic resistance independently from
whether the same surface blocks vision. Appearance, opacity, and object names
never imply penetration behavior.
_Avoid_: Mesh material, transparent means penetrable

**Ballistic path**:
The ordered set of Combat-material contacts reached by one projectile after
penetration and energy loss. A shotgun trigger owns several independent paths
but spends one shell and produces one weapon event.
_Avoid_: Multi-hit callback, shotgun blast sphere

**Suppression field**:
The finite, blocker-clipped region beside a truthful missed shot. It can disturb
an exposed Combatant once per trigger but can neither cause damage nor pass
through the surface that stopped the projectile.
_Avoid_: Near-enemy radius, wall suppression

**Combat audio event**:
A semantic, positional event such as armor break, wood impact, reload, whiz, or
body fall. Combat Adapters select it from Shot truth and CombatActor results;
they do not play legacy filenames as gameplay authority.
_Avoid_: Sound filename, random variant

**Runtime checkpoint**:
An in-memory scene rewind that may retain authored encounter state and object
relationships.
_Avoid_: Save game

**Durable combat state**:
The versioned, JSON-safe health, armor, ammunition, impairment, and perception
state that can cross a page or campaign reload. It never contains Object3D
references, callbacks, held triggers, or pending tracer impacts.
_Avoid_: Actor snapshot, scene snapshot

## Flagged ambiguities

**NPC** is already the preserved Initiation party-dialogue system described in
`docs/NPC-SYSTEM.md`. Ground firearm behavior therefore uses **Combatant** and
must not inherit from or replace that dialogue system.

## Example dialogue

> **Designer:** The Palace guard should remember Tony after he ducks behind the
> fountain, but he must not track Tony through it.
>
> **Developer:** The Palace Combat Adapter gives the shared perception Module a
> copied sampled aim point and the live collider set. The Combatant may inspect
> that last point, while only clear sight can refresh it or permit actor damage.
>
> **Designer:** Can the same rule run in Mansion Siege?
>
> **Developer:** Yes. Mansion supplies its authored routes and defence-post area
> fire; the shared Modules still own sight, bore alignment, shot truth,
> collision-safe movement, Located hits, and Durable combat state.
