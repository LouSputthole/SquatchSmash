/**
 * Camera-held presentation for the Cabin dungeon's scene-limited tools.
 *
 * Campaign/interrogation truth remains in CabinChapterRuntime. This module is
 * deliberately only the thing the player can see in their hand: selecting a
 * table tool replaces the prior one, using it plays one short controlled
 * motion, and clearing it removes every tool before the execution begins.
 */
import * as THREE from 'three';

const TOOL_IDS = Object.freeze([
  'pliers',
  'saw',
  'battery',
  'syringes',
  'towels',
  'leads',
  'bucket',
]);

const darkMetal = () => new THREE.MeshStandardMaterial({
  color: 0x3f4545,
  roughness: 0.48,
  metalness: 0.76,
});
const steel = () => new THREE.MeshStandardMaterial({
  color: 0x9da3a0,
  roughness: 0.34,
  metalness: 0.82,
});
const rubber = (color = 0x242522) => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.88,
  metalness: 0.02,
});

function box(name, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  return mesh;
}

function cylinder(name, radius, height, position, material, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 10), material);
  mesh.name = name;
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  return mesh;
}

function heldTool(id) {
  const root = new THREE.Group();
  root.name = `cabin-held-torture-tool-${id}`;
  const metal = steel();
  const dark = darkMetal();
  const grip = rubber();
  const red = rubber(0x7d211f);

  if (id === 'pliers') {
    for (const side of [-1, 1]) {
      const arm = box(`cabin-held-pliers-arm-${side}`, [0.045, 0.42, 0.045], [side * 0.055, -0.03, 0], side < 0 ? red : grip);
      arm.rotation.z = side * 0.10;
      root.add(arm);
      const jaw = box(`cabin-held-pliers-jaw-${side}`, [0.055, 0.22, 0.055], [side * 0.035, 0.28, 0], metal);
      jaw.rotation.z = -side * 0.13;
      root.add(jaw);
    }
    root.add(cylinder('cabin-held-pliers-pivot', 0.055, 0.075, [0, 0.13, 0], dark, [Math.PI / 2, 0, 0]));
  } else if (id === 'saw') {
    root.add(box('cabin-held-saw-blade', [0.48, 0.12, 0.018], [0, 0.16, 0], metal));
    root.add(box('cabin-held-saw-spine', [0.50, 0.035, 0.040], [0, 0.235, 0], dark));
    root.add(box('cabin-held-saw-handle', [0.22, 0.20, 0.10], [-0.30, 0.09, 0], grip));
  } else if (id === 'battery') {
    root.add(box('cabin-held-battery-case', [0.42, 0.31, 0.26], [0, 0.08, 0], dark));
    root.add(box('cabin-held-battery-label', [0.28, 0.12, 0.012], [0, 0.08, -0.136], red));
    root.add(cylinder('cabin-held-battery-positive', 0.035, 0.075, [-0.12, 0.275, 0], metal));
    root.add(cylinder('cabin-held-battery-negative', 0.035, 0.075, [0.12, 0.275, 0], metal));
  } else if (id === 'syringes') {
    root.add(cylinder('cabin-held-syringe-barrel', 0.025, 0.42, [0, 0.10, 0], metal));
    root.add(cylinder('cabin-held-syringe-plunger', 0.045, 0.08, [0, -0.16, 0], dark));
    root.add(cylinder('cabin-held-syringe-needle', 0.007, 0.22, [0, 0.42, 0], metal));
  } else if (id === 'towels') {
    root.add(box('cabin-held-towel', [0.48, 0.10, 0.28], [0, 0.08, 0], new THREE.MeshStandardMaterial({
      color: 0xd1c8b2,
      roughness: 1,
      metalness: 0,
    })));
    root.add(box('cabin-held-towel-fold', [0.40, 0.018, 0.30], [0, 0.14, 0], grip));
  } else if (id === 'leads') {
    const lead = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 8, 28, Math.PI * 1.72), red);
    lead.name = 'cabin-held-electrical-leads';
    lead.rotation.x = Math.PI / 2;
    root.add(lead);
    root.add(box('cabin-held-leads-clip', [0.14, 0.045, 0.055], [0.18, -0.15, 0], metal));
  } else if (id === 'bucket') {
    const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.145, 0.32, 14, 1, true), metal);
    pail.name = 'cabin-held-bucket-pail';
    pail.position.y = 0.08;
    root.add(pail);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.012, 7, 22, Math.PI), dark);
    handle.name = 'cabin-held-bucket-handle';
    handle.rotation.z = Math.PI;
    handle.position.y = 0.22;
    root.add(handle);
  }

  root.visible = false;
  return root;
}

const HOLD_POSE = Object.freeze({ x: 0.30, y: -0.30, z: -0.48 });

export class CabinTortureToolPresentation {
  constructor({ camera } = {}) {
    if (!camera?.add) throw new TypeError('Cabin torture-tool presentation requires a camera');
    this.camera = camera;
    this.selected = null;
    this.strikeTime = 0;
    this.strikeDuration = 0;
    this.tools = Object.freeze(Object.fromEntries(TOOL_IDS.map((id) => {
      const tool = heldTool(id);
      camera.add(tool);
      return [id, tool];
    })));
    this._pose();
  }

  select(id = null) {
    const next = TOOL_IDS.includes(id) ? id : null;
    this.selected = next;
    this.strikeTime = 0;
    this.strikeDuration = 0;
    for (const [toolId, tool] of Object.entries(this.tools)) tool.visible = toolId === next;
    this._pose();
    return this.selected;
  }

  strike({ duration = 0.55 } = {}) {
    if (!this.selected) return false;
    this.strikeDuration = Math.max(0.18, Number(duration) || 0.55);
    this.strikeTime = this.strikeDuration;
    return true;
  }

  update(dt = 0) {
    this.strikeTime = Math.max(0, this.strikeTime - Math.max(0, Number(dt) || 0));
    this._pose();
    return this.snapshot();
  }

  _pose() {
    const tool = this.selected ? this.tools[this.selected] : null;
    if (!tool) return;
    const progress = this.strikeDuration > 0 ? 1 - this.strikeTime / this.strikeDuration : 0;
    const arc = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
    tool.position.set(HOLD_POSE.x - arc * 0.16, HOLD_POSE.y + arc * 0.12, HOLD_POSE.z - arc * 0.20);
    tool.rotation.set(-0.14 - arc * 0.78, -0.30 + arc * 0.22, -0.20 - arc * 0.32);
    if (this.selected === 'battery' || this.selected === 'bucket') tool.scale.setScalar(0.82);
    else tool.scale.setScalar(1);
  }

  snapshot() {
    return Object.freeze({
      selected: this.selected,
      striking: this.strikeTime > 0,
      remaining: this.strikeTime,
      visible: Object.freeze(Object.fromEntries(
        Object.entries(this.tools).map(([id, tool]) => [id, tool.visible]),
      )),
    });
  }
}

export function createCabinTortureToolPresentation(options) {
  return new CabinTortureToolPresentation(options);
}
