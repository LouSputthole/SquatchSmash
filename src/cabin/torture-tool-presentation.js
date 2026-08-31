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

export const CABIN_TORTURE_TOOL_MOTIONS = Object.freeze({
  pliers: 'clamp',
  saw: 'saw',
  battery: 'shock',
  syringes: 'jab',
  towels: 'smother',
  leads: 'arc',
  bucket: 'douse',
});

const HOLD_POSES = Object.freeze({
  pliers: Object.freeze({ position: [0.30, -0.30, -0.48], rotation: [-0.14, -0.30, -0.20], scale: 1 }),
  saw: Object.freeze({ position: [0.34, -0.34, -0.52], rotation: [-0.06, -0.46, -0.10], scale: 0.96 }),
  battery: Object.freeze({ position: [0.27, -0.37, -0.56], rotation: [-0.08, -0.20, -0.12], scale: 0.82 }),
  syringes: Object.freeze({ position: [0.31, -0.28, -0.49], rotation: [-0.24, -0.18, -0.24], scale: 1 }),
  towels: Object.freeze({ position: [0.28, -0.31, -0.50], rotation: [-0.26, -0.34, 0.10], scale: 0.94 }),
  leads: Object.freeze({ position: [0.32, -0.32, -0.51], rotation: [-0.12, -0.28, -0.34], scale: 1 }),
  bucket: Object.freeze({ position: [0.24, -0.39, -0.58], rotation: [-0.04, -0.18, -0.08], scale: 0.82 }),
});

function motionOffset(id, progress) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  const envelope = Math.sin(p * Math.PI);
  if (id === 'clamp') {
    return { position: [-0.08 * envelope, 0.04 * envelope, -0.18 * envelope], rotation: [-0.42 * envelope, 0.10 * envelope, -0.28 * envelope], pulse: envelope };
  }
  if (id === 'saw') {
    const sweep = Math.sin(p * Math.PI * 8) * envelope;
    return { position: [0.24 * sweep, 0.02 * envelope, -0.09 * envelope], rotation: [0.05 * envelope, 0.22 * sweep, 0.18 * sweep], pulse: sweep };
  }
  if (id === 'shock') {
    const jolt = Math.sin(p * Math.PI * 18) * envelope;
    return { position: [0.018 * jolt, -0.035 * envelope, -0.24 * envelope], rotation: [0.14 * envelope, 0.03 * jolt, 0.08 * jolt], pulse: jolt };
  }
  if (id === 'jab') {
    return { position: [-0.02 * envelope, 0.015 * envelope, -0.32 * envelope], rotation: [-0.16 * envelope, 0.06 * envelope, -0.04 * envelope], pulse: envelope };
  }
  if (id === 'smother') {
    return { position: [-0.18 * envelope, 0.18 * envelope, -0.16 * envelope], rotation: [-0.25 * envelope, -0.10 * envelope, 0.55 * envelope], pulse: envelope };
  }
  if (id === 'arc') {
    const jolt = Math.sin(p * Math.PI * 12) * envelope;
    return { position: [0.10 * envelope, 0.02 * jolt, -0.25 * envelope], rotation: [-0.10 * envelope, -0.22 * envelope, 0.18 * envelope + 0.10 * jolt], pulse: jolt };
  }
  if (id === 'douse') {
    return { position: [-0.05 * envelope, 0.22 * envelope, -0.12 * envelope], rotation: [-1.05 * envelope, 0.05 * envelope, 0.25 * envelope], pulse: envelope };
  }
  return { position: [0, 0, 0], rotation: [0, 0, 0], pulse: 0 };
}

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

const glass = () => new THREE.MeshStandardMaterial({
  color: 0xcfd8d4,
  roughness: 0.18,
  metalness: 0.04,
  transparent: true,
  opacity: 0.62,
});
const cloth = (color = 0xd1c8b2) => new THREE.MeshStandardMaterial({
  color,
  roughness: 1,
  metalness: 0,
});

/** A named articulated part that carries its own detail with it. */
function part(name, position = [0, 0, 0]) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...position);
  return g;
}

/**
 * THE TOOL IN YOUR HAND HAS TO NAME ITSELF TOO.
 *
 * Owner, cabin playtest: *"We could use more detail on the tools. I really
 * like the battery and the effect there. The other tools is not really clear
 * what they are."*
 *
 * The held battery is the reference and is untouched: a case, a red label and
 * two posts that grow when it arcs. The other six were flat boxes -- the
 * pliers two bars and a pin, the syringe three plain cylinders, the towel two
 * slabs. Each is now built round the SAME named part `_articulate` already
 * drives, promoted from a mesh to a group so the detail moves with the
 * motion: the plier arm carries its grip, the jaw its serrations, the saw
 * handle its ferrule and bow, the plunger its thumb pad, the clip its jaws
 * and spring, the bail its rivets.
 */
function heldTool(id) {
  const root = new THREE.Group();
  root.name = `cabin-held-torture-tool-${id}`;
  const metal = steel();
  const dark = darkMetal();
  const grip = rubber();
  const red = rubber(0x7d211f);

  if (id === 'pliers') {
    for (const side of [-1, 1]) {
      const arm = part(`cabin-held-pliers-arm-${side}`, [side * 0.055, -0.03, 0]);
      arm.rotation.z = side * 0.10;
      arm.add(box(`cabin-held-pliers-shank-${side}`, [0.045, 0.24, 0.045], [0, 0.09, 0], metal));
      // Dipped rubber grip, and the two are deliberately different colours so
      // an open pair still reads as two separate handles at arm's length.
      arm.add(box(`cabin-held-pliers-grip-${side}`, [0.062, 0.22, 0.062], [0, -0.12, 0], side < 0 ? red : grip));
      arm.add(box(`cabin-held-pliers-grip-end-${side}`, [0.050, 0.030, 0.050], [0, -0.235, 0], dark));
      root.add(arm);
      const jaw = part(`cabin-held-pliers-jaw-${side}`, [side * 0.035, 0.28, 0]);
      jaw.rotation.z = -side * 0.13;
      jaw.add(box(`cabin-held-pliers-jaw-body-${side}`, [0.055, 0.14, 0.055], [0, -0.03, 0], metal));
      jaw.add(box(`cabin-held-pliers-jaw-nose-${side}`, [0.034, 0.11, 0.040], [0, 0.09, 0], dark));
      for (let i = 0; i < 3; i++) {
        jaw.add(box(`cabin-held-pliers-serration-${side}-${i}`, [0.058, 0.012, 0.014], [0, -0.06 + i * 0.035, side * 0.024], dark));
      }
      root.add(jaw);
    }
    root.add(cylinder('cabin-held-pliers-pivot', 0.055, 0.075, [0, 0.13, 0], dark, [Math.PI / 2, 0, 0]));
    root.add(box('cabin-held-pliers-cutter', [0.11, 0.05, 0.05], [0, 0.19, 0], metal));
  } else if (id === 'saw') {
    root.add(box('cabin-held-saw-blade', [0.48, 0.12, 0.016], [0, 0.16, 0], metal));
    root.add(box('cabin-held-saw-spine', [0.50, 0.035, 0.040], [0, 0.235, 0], dark));
    for (let i = 0; i < 9; i++) {
      const tooth = box(`cabin-held-saw-tooth-${i}`, [0.032, 0.032, 0.016], [-0.20 + i * 0.05, 0.098, 0], metal);
      tooth.rotation.z = Math.PI / 4;
      root.add(tooth);
    }
    const handle = part('cabin-held-saw-handle', [-0.30, 0.09, 0]);
    handle.add(box('cabin-held-saw-grip', [0.20, 0.15, 0.09], [0, 0, 0], grip));
    handle.add(cylinder('cabin-held-saw-ferrule', 0.048, 0.05, [0.115, 0.045, 0], dark, [0, 0, Math.PI / 2]));
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.024, 7, 18), grip);
    bow.name = 'cabin-held-saw-bow';
    bow.position.set(-0.09, -0.03, 0);
    handle.add(bow);
    root.add(handle);
  } else if (id === 'battery') {
    root.add(box('cabin-held-battery-case', [0.42, 0.31, 0.26], [0, 0.08, 0], dark));
    root.add(box('cabin-held-battery-label', [0.28, 0.12, 0.012], [0, 0.08, -0.136], red));
    root.add(cylinder('cabin-held-battery-positive', 0.035, 0.075, [-0.12, 0.275, 0], metal));
    root.add(cylinder('cabin-held-battery-negative', 0.035, 0.075, [0.12, 0.275, 0], metal));
  } else if (id === 'syringes') {
    root.add(cylinder('cabin-held-syringe-barrel', 0.026, 0.40, [0, 0.10, 0], glass()));
    root.add(cylinder('cabin-held-syringe-charge', 0.021, 0.19, [0, 0.01, 0], new THREE.MeshStandardMaterial({
      color: 0xb19534,
      roughness: 0.65,
      metalness: 0.02,
    })));
    root.add(box('cabin-held-syringe-flange', [0.10, 0.014, 0.10], [0, -0.105, 0], glass()));
    const plunger = part('cabin-held-syringe-plunger', [0, -0.16, 0]);
    plunger.add(cylinder('cabin-held-syringe-plunger-rod', 0.012, 0.16, [0, -0.03, 0], metal));
    plunger.add(box('cabin-held-syringe-thumb', [0.085, 0.016, 0.085], [0, -0.115, 0], dark));
    root.add(plunger);
    root.add(cylinder('cabin-held-syringe-hub', 0.032, 0.06, [0, 0.33, 0], dark));
    root.add(cylinder('cabin-held-syringe-needle', 0.006, 0.22, [0, 0.47, 0], metal));
  } else if (id === 'towels') {
    root.add(box('cabin-held-towel', [0.48, 0.10, 0.28], [0, 0.08, 0], cloth()));
    root.add(box('cabin-held-towel-hem', [0.48, 0.020, 0.030], [0, 0.08, 0.140], cloth(0xb9ac90)));
    root.add(box('cabin-held-towel-stain', [0.22, 0.012, 0.16], [0.08, 0.132, -0.04], cloth(0x5c2320)));
    const fold = part('cabin-held-towel-fold', [0, 0.14, 0]);
    fold.add(box('cabin-held-towel-fold-face', [0.40, 0.018, 0.30], [0, 0, 0], cloth(0xc4bba3)));
    fold.add(box('cabin-held-towel-fold-edge', [0.40, 0.030, 0.028], [0, -0.012, -0.150], cloth(0xb9ac90)));
    root.add(fold);
  } else if (id === 'leads') {
    const lead = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 8, 28, Math.PI * 1.72), red);
    lead.name = 'cabin-held-electrical-leads';
    lead.rotation.x = Math.PI / 2;
    root.add(lead);
    const clip = part('cabin-held-leads-clip', [0.18, -0.15, 0]);
    clip.add(box('cabin-held-leads-clip-boot', [0.09, 0.075, 0.075], [-0.075, 0, 0], red));
    clip.add(box('cabin-held-leads-clip-body', [0.10, 0.055, 0.055], [0.01, 0, 0], metal));
    clip.add(cylinder('cabin-held-leads-clip-spring', 0.030, 0.055, [0.005, 0, 0], dark, [0, 0, Math.PI / 2]));
    for (const jaw of [-1, 1]) {
      const blade = box(`cabin-held-leads-clip-jaw-${jaw}`, [0.11, 0.018, 0.050], [0.115, jaw * 0.022, 0], dark);
      blade.rotation.z = jaw * 0.20;
      clip.add(blade);
    }
    root.add(clip);
  } else if (id === 'bucket') {
    const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.145, 0.32, 14, 1, true), new THREE.MeshStandardMaterial({
      color: 0x9da3a0,
      roughness: 0.34,
      metalness: 0.82,
      side: THREE.DoubleSide,
    }));
    pail.name = 'cabin-held-bucket-pail';
    pail.position.y = 0.08;
    root.add(pail);
    root.add(cylinder('cabin-held-bucket-base', 0.145, 0.016, [0, -0.075, 0], dark));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.178, 0.014, 6, 20), metal);
    rim.name = 'cabin-held-bucket-rim';
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.24;
    root.add(rim);
    root.add(cylinder('cabin-held-bucket-water', 0.155, 0.010, [0, -0.02, 0], new THREE.MeshStandardMaterial({
      color: 0x111719,
      roughness: 0.30,
      metalness: 0.06,
    })));
    for (const side of [-1, 1]) {
      root.add(box(`cabin-held-bucket-ear-${side}`, [0.020, 0.040, 0.030], [side * 0.182, 0.205, 0], dark));
    }
    const handle = part('cabin-held-bucket-handle', [0, 0.22, 0]);
    handle.rotation.z = Math.PI;
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.012, 7, 22, Math.PI), dark);
    bail.name = 'cabin-held-bucket-bail';
    handle.add(bail);
    for (const side of [-1, 1]) {
      handle.add(cylinder(`cabin-held-bucket-bail-pin-${side}`, 0.016, 0.030, [side * 0.20, 0, 0], metal, [Math.PI / 2, 0, 0]));
    }
    root.add(handle);
  }

  root.visible = false;
  return root;
}

export class CabinTortureToolPresentation {
  constructor({ camera } = {}) {
    if (!camera?.add) throw new TypeError('Cabin torture-tool presentation requires a camera');
    this.camera = camera;
    this.selected = null;
    this.strikeTime = 0;
    this.strikeDuration = 0;
    this.activeMotion = null;
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
    this.activeMotion = null;
    for (const [toolId, tool] of Object.entries(this.tools)) tool.visible = toolId === next;
    this._pose();
    return this.selected;
  }

  strike({ duration = 0.55, motion = null } = {}) {
    if (!this.selected) return false;
    this.strikeDuration = Math.max(0.18, Number(duration) || 0.55);
    this.strikeTime = this.strikeDuration;
    const authored = Object.values(CABIN_TORTURE_TOOL_MOTIONS).includes(motion)
      ? motion
      : CABIN_TORTURE_TOOL_MOTIONS[this.selected];
    this.activeMotion = authored;
    return true;
  }

  update(dt = 0) {
    this.strikeTime = Math.max(0, this.strikeTime - Math.max(0, Number(dt) || 0));
    this._pose();
    if (this.strikeTime <= 0) this.activeMotion = null;
    return this.snapshot();
  }

  _pose() {
    const tool = this.selected ? this.tools[this.selected] : null;
    if (!tool) return;
    const hold = HOLD_POSES[this.selected];
    const progress = this.strikeDuration > 0 ? 1 - this.strikeTime / this.strikeDuration : 0;
    const motion = motionOffset(
      this.activeMotion ?? CABIN_TORTURE_TOOL_MOTIONS[this.selected],
      progress,
    );
    tool.position.set(
      hold.position[0] + motion.position[0],
      hold.position[1] + motion.position[1],
      hold.position[2] + motion.position[2],
    );
    tool.rotation.set(
      hold.rotation[0] + motion.rotation[0],
      hold.rotation[1] + motion.rotation[1],
      hold.rotation[2] + motion.rotation[2],
    );
    tool.scale.setScalar(hold.scale);
    this._articulate(tool, this.selected, Math.sin(THREE.MathUtils.clamp(progress, 0, 1) * Math.PI), motion.pulse);
  }

  _articulate(tool, id, envelope, pulse) {
    if (id === 'pliers') {
      for (const side of [-1, 1]) {
        tool.getObjectByName(`cabin-held-pliers-arm-${side}`).rotation.z = side * 0.10 * (1 - envelope * 0.78);
        tool.getObjectByName(`cabin-held-pliers-jaw-${side}`).rotation.z = -side * 0.13 * (1 - envelope * 0.78);
      }
    } else if (id === 'saw') {
      tool.getObjectByName('cabin-held-saw-handle').rotation.z = pulse * 0.24;
    } else if (id === 'battery') {
      for (const name of ['positive', 'negative']) {
        tool.getObjectByName(`cabin-held-battery-${name}`).scale.y = 1 + Math.abs(pulse) * 0.16;
      }
    } else if (id === 'syringes') {
      tool.getObjectByName('cabin-held-syringe-plunger').position.y = -0.16 + envelope * 0.17;
    } else if (id === 'towels') {
      const fold = tool.getObjectByName('cabin-held-towel-fold');
      fold.position.y = 0.14 - envelope * 0.045;
      fold.scale.z = 1 + envelope * 0.24;
    } else if (id === 'leads') {
      tool.getObjectByName('cabin-held-leads-clip').rotation.z = envelope * 0.52 + pulse * 0.10;
    } else if (id === 'bucket') {
      tool.getObjectByName('cabin-held-bucket-handle').rotation.x = -envelope * 0.92;
    }
  }

  snapshot() {
    return Object.freeze({
      selected: this.selected,
      striking: this.strikeTime > 0,
      remaining: this.strikeTime,
      motion: this.strikeTime > 0 ? this.activeMotion : null,
      visible: Object.freeze(Object.fromEntries(
        Object.entries(this.tools).map(([id, tool]) => [id, tool.visible]),
      )),
    });
  }
}

export function createCabinTortureToolPresentation(options) {
  return new CabinTortureToolPresentation(options);
}
