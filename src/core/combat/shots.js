/**
 * The one answer to "does this bullet hurt this person".
 *
 * Every gun in the game — the player's, an enemy's, an ally's — hands its
 * ray to this resolver. It walks the sorted intersections, spends the
 * round's penetration budget on materials (`materials.js`), gates people
 * through the mission's rules (`rules.js`), applies damage through their
 * Vitals, writes the log, and reports every surface it touched so the
 * effects layer can dress it. The audit's finding was four parallel damage
 * systems that never talked; this file is where that stops.
 *
 * Pure-ish: THREE for the ray itself, but no scene, no audio, no DOM.
 */
import * as THREE from 'three';
import { materialProfile, penetrate } from './materials.js';

const _end = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _toP = new THREE.Vector3();

export class ShotResolver {
  /**
   * @param {object} o
   * @param {number} [o.range]
   * @param {object} o.rules      CombatRules
   * @param {object} [o.log]      CombatLog
   * @param {number} [o.maxSurfaces] surfaces one round may pass
   * @param {()=>number} [o.rng]
   */
  constructor({ range = 120, rules, log = null, maxSurfaces = 4, rng = Math.random } = {}) {
    this.range = range;
    this.rules = rules;
    this.log = log;
    this.maxSurfaces = maxSurfaces;
    this.rng = rng;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = range;
  }

  /**
   * Resolve one ray.
   *
   * @param {object} o
   * @param {THREE.Vector3} o.origin
   * @param {THREE.Vector3} o.dir       normalised
   * @param {object} o.weapon           catalog definition
   * @param {object} o.attacker         {id, faction, isPlayer, combatant?}
   * @param {THREE.Object3D[]} o.targets combined hitbox + world meshes
   * @param {number} [o.scale]          outer damage scale (difficulty etc.)
   * @param {number} [o.distanceOffset] metres already flown (NPC muzzle vs eye)
   * @returns {{
   *   surfaces: Array,  // every touch: {kind:'world'|'body', point, normal,
   *                     //  material?, region?, combatant?, record?, stopped}
   *   end: THREE.Vector3, // where the round finally stopped
   *   killed: object|null, // the combatant this ray killed, if any
   * }}
   */
  resolve({ origin, dir, weapon, attacker, targets, scale = 1, distanceOffset = 0 }) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = this.range;
    const hits = this.raycaster.intersectObjects(targets, true);

    const surfaces = [];
    const touchedBodies = new Set();
    let carried = 1; // damage fraction surviving penetrations
    let penLeft = Math.max(0, Math.min(1, weapon.penetration ?? 0));
    let end = _end.copy(origin).addScaledVector(dir, this.range).clone();
    let killed = null;

    for (const hit of hits) {
      if (surfaces.length >= this.maxSurfaces) break;
      const mesh = hit.object;
      const combatant = mesh.userData.combatant ?? findOwner(mesh);

      if (combatant) {
        // The shooter's own body never stops the shooter's own round.
        if (combatant === attacker.combatant) continue;
        // One region per body per ray: an arm crossed over a chest is one
        // wound, in the first region the round met.
        if (touchedBodies.has(combatant)) continue;
        touchedBodies.add(combatant);

        const region = mesh.userData.hitRegion ?? 'upperTorso';
        const gate = this.rules.gate({
          attacker,
          target: combatant,
          playerShot: attacker.isPlayer === true,
          damage: weapon.damage,
        });
        if (!gate.allowed) {
          /* A protected body still blocks the round — Snow is not a window —
           * but takes nothing. */
          surfaces.push({
            kind: 'body', point: hit.point.clone(), normal: hit.face?.normal ?? null,
            combatant, region, record: null, stopped: true, blocked: gate.reason,
          });
          end = hit.point.clone();
          break;
        }

        const distance = hit.distance + distanceOffset;
        const record = combatant.vitals.applyHit({
          weapon,
          distance,
          region,
          carried,
          scale: scale * gate.scale,
          attacker,
          direction: { x: origin.x - hit.point.x, z: origin.z - hit.point.z },
        });

        if (record.applied) {
          this.log?.hit({
            shooter: attacker.id,
            weapon: weapon.id,
            target: combatant.id,
            region,
            raw: record.raw,
            damage: record.damage,
            armorSpent: (record.vestSpent ?? 0) + (record.helmetSpent ?? 0),
            distance,
            fatal: record.fatal,
            headshot: record.headshotDamage === true,
            helmetSaved: record.helmetSaved === true,
            friendly: gate.friendly,
          });
          this.rules.judge({
            targetId: combatant.id, record, friendly: gate.friendly,
            playerShot: attacker.isPlayer === true,
          });
        }

        surfaces.push({
          kind: 'body', point: hit.point.clone(), normal: hit.face?.normal ?? null,
          combatant, region, record, stopped: true, friendly: gate.friendly,
        });
        if (record.applied && record.fatal && !record.protectedCore) killed = combatant;

        /* Only the heaviest rounds keep going through a person. */
        const through = penetrate('flesh', 0.25, penLeft);
        if (!through.through) { end = hit.point.clone(); break; }
        penLeft -= through.spent;
        carried *= through.keep;
        continue;
      }

      /* World geometry. */
      const material = mesh.userData.material
        ?? mesh.parent?.userData.material
        ?? 'concrete';
      const profile = materialProfile(material);
      const thickness = mesh.userData.materialThickness
        ?? mesh.parent?.userData.materialThickness;
      const through = penetrate(material, thickness, penLeft);
      const ricochet = !through.through && this.rng() < profile.ricochet;

      surfaces.push({
        kind: 'world', point: hit.point.clone(), normal: hit.face?.normal ?? null,
        object: mesh, material, stopped: !through.through, ricochet,
        distance: hit.distance + distanceOffset,
      });

      if (!through.through) { end = hit.point.clone(); break; }
      penLeft -= through.spent;
      carried *= through.keep;
    }

    return { surfaces, end, killed };
  }

  /**
   * Near-miss bookkeeping for one flown round: everyone close to the line
   * (but not hit) gets scared and gets a bearing to investigate.
   *
   * @param {object} o
   * @param {THREE.Vector3} o.origin
   * @param {THREE.Vector3} o.end
   * @param {Array} o.combatants  each needs {x, z, suppression?, perception?, vitals}
   * @param {object} o.weapon
   * @param {number} [o.radius]
   * @param {*} [o.exclude]
   */
  notifyNearMisses({ origin, end, combatants, weapon, radius = 3.2, exclude = null }) {
    _seg.copy(end).sub(origin);
    const segLen2 = Math.max(1e-6, _seg.lengthSq());
    const strength = weapon.combat?.suppression ?? 0.5;
    for (const c of combatants) {
      if (c === exclude || c.vitals?.dead) continue;
      _toP.set(c.x - origin.x, (c.y ?? origin.y) - origin.y, c.z - origin.z);
      const t = Math.max(0, Math.min(1, _toP.dot(_seg) / segLen2));
      const px = origin.x + _seg.x * t;
      const pz = origin.z + _seg.z * t;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d > radius) continue;
      c.suppression?.noteNearMiss(d, strength);
      c.perception?.hear(
        { x: origin.x, z: origin.z, radius: 60, priority: 0.55 },
        { x: c.x, z: c.z },
      );
    }
  }
}

/** Walk up from an intersected mesh to whoever owns it, if anybody. */
function findOwner(mesh) {
  let o = mesh;
  while (o) {
    if (o.userData?.combatant) return o.userData.combatant;
    o = o.parent;
  }
  return null;
}
