/**
 * Headless rules for the Combat System development tool.
 *
 * The tool deliberately does not invent another health or firearm model:
 * targets are the campaign's shared CombatActor, gun damage passes through
 * resolveBallisticHits, and weapon numbers come from the shared catalog.
 * Keeping this seam free of THREE and the DOM gives the browser tool a fast,
 * deterministic regression loop for the exact hit/death/reset behavior it
 * demonstrates.
 */
import { CombatActor } from '../core/combat/actors.js';
import { resolveBallisticHits } from '../core/combat/ballistics.js';
import { FACTIONS, FactionMatrix } from '../core/combat/factions.js';
import { weaponDef } from '../core/weapons/catalog.js';

export const WHIP_DAMAGE = 34;
export const WHIP_RANGE = 2.7;
export const WHIP_FACING = 0.45;
export const WHIP_COOLDOWN = 0.72;

export const COMBAT_LAB_TARGETS = Object.freeze([
  Object.freeze({ id: 'alpha', label: 'ALPHA', maxHealth: 100, armor: 0 }),
  Object.freeze({ id: 'bravo', label: 'BRAVO', maxHealth: 100, armor: 0 }),
  Object.freeze({ id: 'charlie', label: 'CHARLIE / ARMOR', maxHealth: 120, armor: 45 }),
]);

const PLAYER_ATTACKER = Object.freeze({ id: 'prospect', faction: FACTIONS.CREW });

/** Resolve metadata from a hit child without assuming which mesh was hit. */
export function combatTargetFromObject(object) {
  let node = object ?? null;
  let multiplier = null;
  while (node) {
    if (multiplier === null && Number.isFinite(node.userData?.hitMultiplier)) {
      multiplier = Math.max(0.1, node.userData.hitMultiplier);
    }
    if (node.userData?.combatTargetId) {
      return {
        targetId: node.userData.combatTargetId,
        multiplier: multiplier ?? 1,
      };
    }
    node = node.parent ?? null;
  }
  return null;
}

export class CombatLabSession {
  constructor({ onFeedback = null } = {}) {
    this.matrix = new FactionMatrix();
    this.onFeedback = onFeedback;
    this.targets = new Map(COMBAT_LAB_TARGETS.map((definition) => {
      const actor = new CombatActor({
        id: definition.id,
        faction: FACTIONS.CARTEL,
        maxHealth: definition.maxHealth,
        armor: definition.armor,
      });
      return [definition.id, {
        definition,
        actor,
        initial: actor.snapshot(),
      }];
    }));
    this.whipCooldown = 0;
    this.sequence = 0;
    this.feedback = null;
  }

  target(id) { return this.targets.get(id) ?? null; }

  update(dt) {
    this.whipCooldown = Math.max(0, this.whipCooldown - Math.max(0, Number(dt) || 0));
  }

  _report(kind, fields = {}) {
    this.feedback = {
      sequence: ++this.sequence,
      kind,
      ...fields,
    };
    this.onFeedback?.(this.feedback);
    return this.feedback;
  }

  _damage(targetId, amount, kind, extra = {}) {
    const target = this.target(targetId);
    if (!target) return { applied: false, reason: 'unknown-target' };
    const [resolved] = resolveBallisticHits([
      { distance: 0, actor: target.actor },
    ], {
      attacker: PLAYER_ATTACKER,
      damage: amount,
      penetration: 0,
      playerShot: true,
      matrix: this.matrix,
      maxHits: 1,
    });
    const result = resolved?.result ?? { applied: false, reason: 'protected' };
    this._report(result.applied ? kind : `${kind}-blocked`, {
      targetId,
      damage: result.applied ? result.damage : 0,
      health: target.actor.health,
      dead: target.actor.incapacitated,
      ...extra,
    });
    return result;
  }

  weaponImpact(targetId, weaponId, { multiplier = 1 } = {}) {
    const definition = weaponDef(weaponId);
    if (!definition) return { applied: false, reason: 'unknown-weapon' };
    const scale = Math.max(0.1, Number(multiplier) || 1);
    return this._damage(targetId, definition.damage * scale, 'gun-hit', { weaponId });
  }

  whipImpact(targetId, { distance = Infinity, facing = -1 } = {}) {
    if (this.whipCooldown > 0) return { applied: false, reason: 'cooldown' };
    this.whipCooldown = WHIP_COOLDOWN;
    if (distance > WHIP_RANGE || facing < WHIP_FACING) {
      this._report('whip-miss', {
        targetId: targetId ?? null,
        damage: 0,
        health: this.target(targetId)?.actor.health ?? null,
        dead: this.target(targetId)?.actor.incapacitated ?? false,
      });
      return { applied: false, reason: distance > WHIP_RANGE ? 'out-of-range' : 'off-axis' };
    }
    return this._damage(targetId, WHIP_DAMAGE, 'whip-hit', { weaponId: 'cord-whip' });
  }

  reset() {
    for (const target of this.targets.values()) target.actor.restore(target.initial);
    this.whipCooldown = 0;
    this._report('reset', { targetId: null, damage: 0, health: null, dead: false });
    return this.snapshot();
  }

  snapshot() {
    return {
      whipCooldown: this.whipCooldown,
      feedback: this.feedback ? { ...this.feedback } : null,
      targets: [...this.targets.values()].map(({ definition, actor }) => ({
        id: definition.id,
        label: definition.label,
        health: actor.health,
        maxHealth: actor.maxHealth,
        armor: actor.armor,
        dead: actor.incapacitated,
      })),
    };
  }
}
