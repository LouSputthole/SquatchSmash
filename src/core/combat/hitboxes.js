/**
 * Simplified hit volumes that ride the animated rig.
 *
 * The visual figure is a stack of scaled slabs; raycasting it directly gives
 * hits that depend on tailoring (a suit jacket is wider than a tee), misses
 * between slabs, and phantom hits on hair. So combat raycasts THESE instead:
 * eight slightly generous boxes parented to the rig's pivot GROUPS (never to
 * a scaled mesh — scale-parenting shears children, the same trap the wound
 * decals learned), one per hit region, tagged so the shot resolver can read
 * region and owner straight off the intersected object:
 *
 *   mesh.userData.hitRegion  'head' | 'neck' | 'upperTorso' | ...
 *   mesh.userData.combatant  whoever this body belongs to
 *
 * The boxes render nothing (material.visible = false — the raycaster still
 * intersects geometry) until debug mode paints them.
 *
 * Anchor numbers come from `makePerson`'s own frame (1.78 m): legs pivot at
 * 0.90, shoulders at 1.44, head group at 1.50, skull centre +0.168. The
 * person group's own scale handles height, so these are constant.
 */
import * as THREE from 'three';

const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
const DEBUG_COLOURS = {
  head: 0xff4444, neck: 0xff8844, upperTorso: 0xffcc44, lowerTorso: 0xcccc44,
  armL: 0x44ccff, armR: 0x44ccff, legL: 0x8844ff, legR: 0x8844ff,
};
const debugMats = new Map();
function debugMat(region) {
  let m = debugMats.get(region);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: DEBUG_COLOURS[region] ?? 0xffffff,
      wireframe: true, transparent: true, opacity: 0.7, depthTest: false,
    });
    debugMats.set(region, m);
  }
  return m;
}

const _unit = new THREE.BoxGeometry(1, 1, 1);

/** The volume table: parent part name, local centre, size. */
const VOLUMES = Object.freeze([
  { region: 'head', part: 'head', pos: [0, 0.17, 0], size: [0.32, 0.36, 0.34] },
  { region: 'neck', part: 'head', pos: [0, -0.03, 0], size: [0.16, 0.12, 0.16] },
  { region: 'upperTorso', part: 'body', pos: [0, 1.28, 0], size: [0.44, 0.34, 0.32] },
  { region: 'lowerTorso', part: 'body', pos: [0, 1.0, 0.01], size: [0.4, 0.26, 0.3] },
  { region: 'armL', part: 'armL', pos: [0, -0.32, 0], size: [0.15, 0.68, 0.15] },
  { region: 'armR', part: 'armR', pos: [0, -0.32, 0], size: [0.15, 0.68, 0.15] },
  { region: 'legL', part: 'legL', pos: [0, -0.24, 0], size: [0.18, 0.5, 0.18] },
  { region: 'legR', part: 'legR', pos: [0, -0.24, 0], size: [0.18, 0.5, 0.18] },
  // Shins ride the knee joint so a seated or collapsing figure stays honest.
  { region: 'legL', part: 'shinL', pos: [0, -0.24, 0.02], size: [0.16, 0.52, 0.2], name: 'shin' },
  { region: 'legR', part: 'shinR', pos: [0, -0.24, 0.02], size: [0.16, 0.52, 0.2], name: 'shin' },
]);

export class HitboxRig {
  /**
   * @param {object} parts  makePerson()'s parts table (or any object with
   *   head/body/armL/armR/legL/legR/shinL/shinR groups)
   * @param {object} owner  the combatant these boxes report
   */
  constructor(parts, owner) {
    this.owner = owner;
    this.meshes = [];
    for (const v of VOLUMES) {
      const parent = parts[v.part];
      if (!parent) continue;
      const m = new THREE.Mesh(_unit, HIDDEN);
      m.name = `hitbox.${v.region}${v.name ? `.${v.name}` : ''}`;
      m.position.fromArray(v.pos);
      m.scale.fromArray(v.size);
      m.userData.hitRegion = v.region;
      m.userData.combatant = owner;
      m.castShadow = false;
      m.receiveShadow = false;
      parent.add(m);
      this.meshes.push(m);
    }
    this.debug = false;
  }

  setDebug(on) {
    this.debug = on === true;
    for (const m of this.meshes) {
      m.material = this.debug ? debugMat(m.userData.hitRegion) : HIDDEN;
    }
  }

  /** Remove from the rig (a body being reclaimed). */
  dispose() {
    for (const m of this.meshes) m.parent?.remove(m);
    this.meshes.length = 0;
  }
}
