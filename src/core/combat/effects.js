/**
 * What a hit looks and sounds like.
 *
 * One manager per combat scene: the shot resolver reports every surface a
 * round touched, and this turns each into the right decal, the right burst
 * of chips or blood or sparks, and the right noise — all from the SAME
 * material profile the penetration math used, so a wall never sounds like
 * what it refused to be.
 *
 * Everything is pooled to the config ceilings: decals reuse `BulletHoles`
 * (already pooled), particles are one InstancedMesh of chips recycled
 * oldest-first, and the audio rate-limits itself so a SAW magazine into a
 * brick wall is loud without being 100 overlapping samples.
 */
import * as THREE from 'three';
import { BulletHoles } from '../../world/bullets.js';
import { materialProfile } from './materials.js';
import { COMBAT_TUNING } from './config.js';

const _hidden = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
const _dummy = new THREE.Object3D();
const _colour = new THREE.Color();

const CHIP_COLOURS = {
  dust: 0x9a9184, splinters: 0x7a5a34, sparks: 0xffcf6a,
  glass: 0xbcd8e2, blood: 0x6a1210, chips: 0x8f8a80,
};

/** A shared burst pool: little chips that fly off an impact and die fast. */
class ChipPool {
  constructor(parent, capacity = 96) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.02, 0.02, 0.02),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      capacity,
    );
    this.mesh.name = 'combat.chips';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, _hidden);
    parent.add(this.mesh);
    this.parts = new Array(capacity).fill(null);
    this._next = 0;
  }

  burst(point, normal, colour, count = 6, speed = 2.2) {
    for (let i = 0; i < count; i++) {
      const idx = this._next;
      this._next = (this._next + 1) % this.capacity;
      const n = normal ?? { x: 0, y: 1, z: 0 };
      this.parts[idx] = {
        x: point.x, y: point.y, z: point.z,
        vx: (n.x + (Math.random() - 0.5) * 1.4) * speed * (0.5 + Math.random()),
        vy: (n.y + Math.random() * 0.9) * speed * (0.5 + Math.random()),
        vz: (n.z + (Math.random() - 0.5) * 1.4) * speed * (0.5 + Math.random()),
        life: 0.28 + Math.random() * 0.22,
        size: 0.6 + Math.random(),
      };
      _colour.setHex(colour);
      this.mesh.setColorAt(idx, _colour);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.parts[i];
      if (!p) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        this.parts[i] = null;
        this.mesh.setMatrixAt(i, _hidden);
        continue;
      }
      p.vy -= 9.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.scale.setScalar(p.size * Math.min(1, p.life * 4));
      _dummy.rotation.set(p.life * 9, p.life * 7, 0);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.parent?.remove(this.mesh); }
}

export class ImpactEffects {
  /**
   * @param {object} o
   * @param {THREE.Object3D} o.scene
   * @param {object} [o.audio]
   * @param {object} [o.limits] overrides for COMBAT_TUNING.limits
   */
  constructor({ scene, audio = null, limits = {} }) {
    this.scene = scene;
    this.audio = audio;
    this.limits = { ...COMBAT_TUNING.limits, ...limits };
    /* Three decal pools: world holes, body wounds, spatter — the silvercase
     * ImpactKit split, now shared. Each BulletHoles pool holds 8; several
     * pools rotate so the ceiling is config's, not the revolver's. */
    this.holePools = [];
    this._holeAt = 0;
    const poolCount = Math.max(1, Math.ceil(this.limits.decals / 8));
    for (let i = 0; i < poolCount; i++) this.holePools.push(new BulletHoles(scene, 'hole'));
    this.wounds = new BulletHoles(scene, 'blood');
    this.chips = new ChipPool(scene, 96);
    this._audioBudget = this.limits.audioShotsPerSecond;
    this.counts = { world: 0, body: 0, ricochets: 0 };
  }

  _cue(name, opts) {
    if (!this.audio || this._audioBudget <= 0) return;
    this._audioBudget -= 1;
    this.audio.play(name, opts);
  }

  /** One world surface from the resolver. */
  worldImpact(surface) {
    const profile = materialProfile(surface.material);
    this.counts.world++;
    const pool = this.holePools[this._holeAt];
    this._holeAt = (this._holeAt + 1) % this.holePools.length;
    if (profile.decal) pool.punch(surface.point, surface.normal ?? undefined);
    this.chips.burst(
      surface.point, surface.normal,
      CHIP_COLOURS[profile.particle] ?? 0x999999,
      profile.particle === 'sparks' ? 8 : 5,
      profile.particle === 'sparks' ? 3.2 : 2.0,
    );
    this._cue(profile.cue, { volume: 0.3, position: surface.point });
    if (surface.ricochet) {
      this.counts.ricochets++;
      // The sing of a glance-off: the metal impact pitched up and thinned.
      this._cue('car.impact.metal', { volume: 0.22, rate: 1.6, position: surface.point });
    }
  }

  /**
   * One body surface from the resolver.
   * @param {object} surface
   * @param {object} [attachTo] a part group to carry the wound decal
   */
  bodyImpact(surface, attachTo = null) {
    this.counts.body++;
    const record = surface.record;
    const saved = record?.helmetSaved || (record?.vestSpent ?? 0) > (record?.damage ?? 0);
    if (saved) {
      // Plate or helmet ate it: sparks and a ring, no blood.
      this.chips.burst(surface.point, surface.normal, CHIP_COLOURS.sparks, 7, 3.0);
      this._cue('car.impact.metal', { volume: 0.34, rate: 1.25, position: surface.point });
      return;
    }
    this.chips.burst(surface.point, surface.normal, CHIP_COLOURS.blood, 6, 1.6);
    if (attachTo) this.wounds.punchAttached(attachTo, surface.point, surface.normal ?? undefined);
    this._cue('gun.impact', { volume: 0.4, position: surface.point });
  }

  /** The sharp confirmation only the player's own headshot kill earns. */
  headshotConfirm() {
    this._cue('cs.headshot', { volume: 0.28, rate: 1.05 });
  }

  update(dt) {
    this.chips.update(dt);
    for (const p of this.holePools) p.update(dt);
    this.wounds.update(dt);
    this._audioBudget = Math.min(
      this.limits.audioShotsPerSecond,
      this._audioBudget + this.limits.audioShotsPerSecond * dt,
    );
  }

  reset() {
    for (const p of this.holePools) p.reset();
    this.wounds.reset();
  }

  dispose() {
    this.chips.dispose();
  }
}
