import * as THREE from 'three';

const LIFT = 0.004;
const CUE = Object.freeze({
  wood: 'combat.bullet.impact.wood',
  wood_thin: 'combat.bullet.impact.wood',
  metal: 'combat.bullet.impact.metal',
  glass: 'combat.bullet.impact.glass',
  dirt: 'combat.bullet.impact.dirt',
  soil: 'combat.bullet.impact.dirt',
  concrete: 'heist.bullet.impact',
  stone: 'heist.bullet.impact',
  plaster: 'gun.impact',
  drywall: 'gun.impact',
});

const COLOUR = Object.freeze({
  wood: 0x2b1710,
  wood_thin: 0x2b1710,
  metal: 0x111820,
  glass: 0x9ec9d5,
  dirt: 0x493b2a,
  soil: 0x493b2a,
  concrete: 0x211f1d,
  stone: 0x211f1d,
  plaster: 0x302b27,
  drywall: 0x302b27,
});

function cloneVector(value, fallback) {
  return value?.isVector3 ? value.clone() : fallback.clone();
}

function visibleHierarchy(object) {
  let node = object ?? null;
  while (node) {
    if (node.visible === false) return false;
    node = node.parent ?? null;
  }
  return true;
}

/** Bounded world-surface marks and explicitly material-selected impact audio. */
export class BallisticImpactSystem {
  constructor(scene, { audio = null, capacity = 24, random = Math.random } = {}) {
    if (!scene?.add) throw new TypeError('BallisticImpactSystem requires a THREE scene');
    this.scene = scene;
    this.audio = audio;
    this.capacity = Math.max(1, Math.trunc(Number(capacity) || 24));
    this.random = typeof random === 'function' ? random : Math.random;
    this.pool = [];
    this.next = 0;
    const geometry = new THREE.CircleGeometry(0.045, 12);
    for (let index = 0; index < this.capacity; index++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x211f1d,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      const mark = new THREE.Mesh(geometry, material);
      mark.name = `combat-surface-impact-${index}`;
      mark.visible = false;
      mark.renderOrder = 3;
      scene.add(mark);
      this.pool.push(mark);
    }
  }

  hit({
    point,
    normal,
    direction = null,
    material = 'concrete',
    energy = 1,
    object = null,
  } = {}) {
    if (!visibleHierarchy(object)) return null;
    const id = String(material || 'concrete').toLowerCase();
    if (id === 'flesh' || id === 'body' || id === 'blood') return null;
    const contact = cloneVector(point, new THREE.Vector3());
    const surfaceNormal = cloneVector(normal, new THREE.Vector3(0, 0, 1));
    if (surfaceNormal.lengthSq() < 1e-8) surfaceNormal.set(0, 0, 1);
    surfaceNormal.normalize();
    const mark = this.pool[this.next % this.pool.length];
    this.next++;
    mark.position.copy(contact).addScaledVector(surfaceNormal, LIFT);
    mark.lookAt(contact.clone().add(surfaceNormal));
    mark.rotateZ(this.random() * Math.PI * 2);
    const scale = 0.82 + Math.max(0, Math.min(1, Number(energy) || 0)) * 0.35;
    mark.scale.setScalar(scale);
    mark.material.color.setHex(COLOUR[id] ?? COLOUR.concrete);
    mark.visible = true;
    mark.userData.combatMaterial = id;
    const cue = CUE[id] ?? CUE.concrete;
    if (typeof this.audio?.worldImpact === 'function') {
      this.audio.worldImpact({ material: id, position: contact.clone(), energy });
    } else {
      this.audio?.play?.(cue, { position: contact.clone(), volume: 0.7 });
    }
    return Object.freeze({
      point: contact,
      normal: surfaceNormal,
      direction: cloneVector(direction, surfaceNormal.clone().negate()).normalize(),
      material: id,
      energy: Math.max(0, Number(energy) || 0),
      mark,
      cue,
    });
  }

  get visibleCount() { return this.pool.filter((mark) => mark.visible).length; }

  report() {
    return Object.freeze({ capacity: this.capacity, visibleCount: this.visibleCount });
  }

  update() {}

  reset() {
    for (const mark of this.pool) mark.visible = false;
    this.next = 0;
  }

  dispose() {
    const geometries = new Set();
    for (const mark of this.pool) {
      this.scene.remove(mark);
      geometries.add(mark.geometry);
      mark.material?.dispose?.();
    }
    for (const geometry of geometries) geometry?.dispose?.();
    this.pool.length = 0;
  }
}
