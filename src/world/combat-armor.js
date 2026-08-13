import * as THREE from 'three';

const TIER = Object.freeze({
  light: Object.freeze({ width: 0.38, height: 0.46, depth: 0.055, colour: 0x394047 }),
  heavy: Object.freeze({ width: 0.48, height: 0.58, depth: 0.075, colour: 0x252a2f }),
});

/** Visible, actor-driven plate carrier presentation for humanoid combat rigs. */
export class CombatArmorPresentation {
  constructor({ body, actor, tier = 'light' } = {}) {
    if (!body?.add) throw new TypeError('CombatArmorPresentation requires a THREE body');
    this.body = body;
    this.actor = actor ?? null;
    this.tier = TIER[tier] ? tier : 'light';
    this.group = new THREE.Group();
    this.group.name = 'combat-armor-presentation';
    this.parts = [];
    this.broken = false;
    this.breakReported = false;
    const style = TIER[this.tier];
    const material = new THREE.MeshStandardMaterial({
      color: style.colour,
      roughness: 0.84,
      metalness: 0.08,
    });
    const plate = (name, z) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(style.width, style.height, style.depth),
        material,
      );
      mesh.name = name;
      mesh.position.set(0, 0.76, z);
      this.group.add(mesh);
      this.parts.push(mesh);
    };
    plate('combat-armor-front-plate', -0.17);
    plate('combat-armor-back-plate', 0.17);
    if (this.tier === 'heavy') {
      for (const side of [-1, 1]) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.075, style.height * 0.72, 0.22), material,
        );
        mesh.name = `combat-armor-side-${side < 0 ? 'left' : 'right'}`;
        mesh.position.set(side * style.width * 0.52, 0.74, 0);
        this.group.add(mesh);
        this.parts.push(mesh);
      }
    }
    body.add(this.group);
    this.restore();
  }

  applyResult(result = {}) {
    if (result?.armorBroken !== true || this.breakReported) return false;
    this.breakReported = true;
    this.broken = true;
    this.group.userData.breakImpulse = Math.max(0, Number(result.absorbed) || 0);
    for (const part of this.parts) {
      part.rotation.z += part.position.x >= 0 ? -0.12 : 0.12;
      part.material.opacity = 0.42;
      part.material.transparent = true;
    }
    return true;
  }

  restore() {
    const armored = (Number(this.actor?.armor) || 0) > 0;
    this.broken = !armored;
    this.breakReported = !armored;
    this.group.visible = true;
    for (const part of this.parts) {
      part.visible = true;
      part.rotation.z = 0;
      part.material.opacity = armored ? 1 : 0.28;
      part.material.transparent = !armored;
    }
    return this.report();
  }

  report() {
    const style = TIER[this.tier];
    return Object.freeze({
      state: this.broken ? 'broken' : 'armored',
      visiblePlates: this.parts.filter((part) => part.visible).length,
      width: style.width + (this.tier === 'heavy' ? 0.075 : 0),
      tier: this.tier,
    });
  }

  dispose() {
    this.body.remove(this.group);
    const geometries = new Set(this.parts.map((part) => part.geometry));
    const materials = new Set(this.parts.map((part) => part.material));
    for (const geometry of geometries) geometry?.dispose?.();
    for (const material of materials) material?.dispose?.();
    this.parts.length = 0;
  }
}
