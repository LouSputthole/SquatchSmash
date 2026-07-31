/**
 * The Bada Bing.
 *
 * A low commercial building off a wet North Jersey highway, at 1 unit = 1
 * metre, built the same way the flat is: primitives, procedural textures, no
 * asset files. Every room the player can reach is modelled. The rooms behind
 * locked doors are not -- they are a door, a plate and a promise for later.
 *
 *                 z = -15  ┌─────────────┬──────────┐
 *   x = -21 ──────────────►│   storage   │          │
 *                          ├──────┬──────┴──────────┤ x = 21
 *                          │      │ H │ Lou's office│
 *                          │ MAIN │ A ├─────────────┤
 *                          │FLOOR │ L │  men's room │
 *                          │      │ L │             │
 *                 z =  11  └───┬──┴───┴─────────────┘
 *                              │vestibule│
 *                              └─────────┘ → the lot → z = 56
 */
import * as THREE from 'three';
import { mat, box, cylinder, sphere, collider, group } from '../world/build.js';
import { makeMaterials } from '../world/materials.js';
import { makeChair, makeWhiskeyBottle, makeShotGlass, makeAshtray, makeWallClock, makeFrame, makePlant, makeTv, makeRevolver, makeCigarettePack, makeToilet } from '../world/props.js';
import { clubCarpet, asphalt, brick, panelling, backTile, felt, printed, neonText, lit, sign, tiled, rand, pick, squatchArt } from './kit.js';
import { resolveGear } from '../world/gear.js';
import { Tv } from '../core/tv.js';

export const CEIL_MAIN = 4.5;
export const CEIL_BACK = 2.6;
export const DOOR_H = 2.05;
export const STAGE_H = 0.75;

export const ROOMS = {
  lot: { x0: -30, x1: 30, z0: 15.4, z1: 56 },
  vestibule: { x0: -4, x1: 4, z0: 11, z1: 15.4 },
  main: { x0: -21, x1: 5.4, z0: -11, z1: 11 },
  hallway: { x0: 5.6, x1: 7.8, z0: -9.5, z1: 4.5 },
  office: { x0: 7.9, x1: 13.9, z0: -9.5, z1: -4.5 },
  bathroom: { x0: 7.9, x1: 13.9, z0: -1.3, z1: 2.7 },
  storage: { x0: 5.6, x1: 13.6, z0: -15, z1: -9.6 },
  alley: { x0: 21, x1: 27.5, z0: -26, z1: 15.4 },
  /* The strip behind the building. Rooms are tested in order and every
   * interior one comes first, so this only ever resolves outside the walls --
   * which is the point: it is how the game knows you left by the back. */
  yard: { x0: 5, x1: 21, z0: -26, z1: -15 },
};

/** Which room a point is in. Used by audio zones, the mission and the crowd. */
export function roomAt(x, z) {
  for (const [name, r] of Object.entries(ROOMS)) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return name;
  }
  return 'outside';
}

/**
 * A door that physically swings. Its collider lives in the same array as every
 * wall, and comes out of that array while the leaf is open, which is the whole
 * trick: no teleporting, no trigger volumes, just a box that stops existing.
 */
export class Door {
  constructor({ pivot, leaf, colliders, box: cbox, locked = false, label, swing = -1.9, alarmed = false }) {
    this.pivot = pivot;
    this.leaf = leaf;
    this.colliders = colliders;
    this.box = cbox;
    this.locked = locked;
    this.label = label;
    this.swing = swing;
    this.alarmed = alarmed;
    this.open = false;
    this._t = 0;
    this.onOpen = null;
  }

  toggle() {
    if (this.locked) return false;
    this.open = !this.open;
    if (this.open) {
      const i = this.colliders.indexOf(this.box);
      if (i >= 0) this.colliders.splice(i, 1);
      this.onOpen?.(this);
    } else if (!this.colliders.includes(this.box)) {
      this.colliders.push(this.box);
    }
    return true;
  }

  update(dt) {
    const target = this.open ? this.swing : 0;
    const d = target - this._t;
    if (Math.abs(d) < 0.001) return;
    this._t += d * Math.min(1, dt * 6);
    this.pivot.rotation.y = this._t;
  }
}

export function buildClub(scene, { renderer } = {}) {
  /* The flat's material palette. Every prop maker in world/props.js takes it,
   * so borrowing a chair or a whiskey bottle from the apartment costs nothing. */
  const M = makeMaterials();

  const root = new THREE.Group();
  scene.add(root);

  const colliders = [];
  const floorZones = [];
  const doors = {};
  const anchors = {};
  const neon = [];      // things that flicker: { mesh, light, next, on, kind }
  const clocks = [];    // wall clocks, whose hands the campaign clock drives
  const ticking = [];   // per-frame closures the club owns
  /** Raised floors: the stage, and nothing else so far. */
  const platforms = [];
  /* Nav-only blockers: solid to anybody routed around the floor, invisible to
   * the player's capsule. The stage is the one place where those differ -- the
   * platforms above let Tony climb it (and security has a line about that),
   * but a patrolling guard treating the deck as walkable floor strolls
   * straight through the front of the show. */
  const navBlockers = [];

  const M_BRICK = mat({ map: tiled(brick(), 6, 1.4), roughness: 0.96 });
  const M_PANEL = mat({ map: tiled(panelling(), 6, 1), roughness: 0.9 });
  const M_BACKWALL = mat({ map: tiled(panelling('#3b3229'), 4, 1), roughness: 0.94 });
  const M_DARKWOOD = mat({ color: 0x2a1a12, roughness: 0.72 });
  const M_WOOD = mat({ color: 0x412a1c, roughness: 0.78 });
  const M_LEATHER = mat({ color: 0x5e161f, roughness: 0.62 });
  const M_LEATHER_DARK = mat({ color: 0x400f16, roughness: 0.6 });
  const M_BRASS = mat({ color: 0xb08d3a, roughness: 0.3, metalness: 0.85 });
  const M_CHROME = mat({ color: 0xb9c0cc, roughness: 0.18, metalness: 0.95 });
  const M_BLACKGLOSS = mat({ color: 0x0d0d12, roughness: 0.22, metalness: 0.2 });
  const M_STEEL = mat({ color: 0x6a707a, roughness: 0.45, metalness: 0.7 });
  const M_CONCRETE = mat({ color: 0x2f2f36, roughness: 0.97 });
  const M_GLASS = mat({ color: 0x9fb4cc, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.28 });

  /* Prop makers in world/props.js return { group, ... } while the helpers in
   * build.js return meshes, so add() takes either and hands back whatever it
   * actually put in the scene. */
  function add(...objs) {
    let first = null;
    for (const o of objs) {
      if (!o) continue;
      const obj = o.isObject3D ? o : o.group;
      if (!obj) continue;
      root.add(obj);
      first ??= obj;
    }
    return first;
  }

  /* ---- real art on club props ----
   * Slots in assets/art/manifest.json, resolved AFTER the room stands:
   * buildClub() is synchronous and loading an image is not. Each entry is
   * built with its drawn version first and only swapped if the real file
   * resolves, which is the art system's own rule -- a slot with no file on
   * disk keeps the placeholder rather than leaving a hole in the prop. */
  const artSlots = [];
  /**
   * Register a prop whose drawn version stands in until (and unless) the real
   * image resolves. `tilt` is the angle the REAL sticker wants on the mesh --
   * a drawn one can have its slant baked into the canvas instead, and would
   * be slanted twice if the mesh were turned as well.
   */
  function artSticker(mesh, slot, w, tilt = null) {
    mesh.userData.art = { slot, real: false };
    artSlots.push({ mesh, slot, w, tilt });
    return mesh;
  }

  /**
   * Swap in the real images. Die-cut vinyl, so the material is the flat's:
   * transparent with a low alphaTest, which keeps the soft edge of an outline
   * instead of squaring it off. Sized from the file's own aspect -- a square
   * sticker on a plate drawn for two lines of lettering is a stretched
   * sticker. Anything that does not resolve keeps what it was built with.
   */
  function dressArtSlots(gear) {
    const dressed = [];
    for (const entry of artSlots) {
      const g = gear.get(entry.slot);
      if (!g?.real) continue;
      const h = entry.w / (g.aspect || 1);
      entry.mesh.geometry.dispose();
      entry.mesh.geometry = new THREE.PlaneGeometry(entry.w, h);
      entry.mesh.material = new THREE.MeshStandardMaterial({
        map: g.texture, roughness: 0.42, transparent: true, alphaTest: 0.06,
      });
      if (entry.tilt !== null) entry.mesh.rotation.z = entry.tilt;
      entry.mesh.userData.art.real = true;
      dressed.push(entry.slot);
    }
    return dressed;
  }

  function solid(minX, minZ, maxX, maxZ, minY = 0, maxY = 3) {
    const b = collider([minX, minY, minZ], [maxX, maxY, maxZ]);
    colliders.push(b);
    return b;
  }

  function floor(r, material, surface, y = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    add(m);
    floorZones.push({
      box: new THREE.Box3(new THREE.Vector3(r.x0, -1, r.z0), new THREE.Vector3(r.x1, 1, r.z1)),
      surface,
    });
    return m;
  }

  function ceiling(r, material, y) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), material);
    m.rotation.x = Math.PI / 2;
    m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    add(m);
    return m;
  }

  /** Wall running along X or Z, with collision. */
  function wall(x0, z0, x1, z1, h, material, t = 0.18, y0 = 0) {
    const w = Math.max(Math.abs(x1 - x0), t);
    const d = Math.max(Math.abs(z1 - z0), t);
    add(box({ size: [w, h, d], pos: [(x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2], mat: material }));
    solid((x0 + x1) / 2 - w / 2, (z0 + z1) / 2 - d / 2, (x0 + x1) / 2 + w / 2, (z0 + z1) / 2 + d / 2, y0, y0 + h);
  }

  /** Wall with a doorway punched through it: two jambs and a lintel. */
  function wallGap(axis, fixed, from, to, gapFrom, gapTo, h, material, t = 0.18) {
    if (axis === 'x') {
      wall(from, fixed, gapFrom, fixed, h, material, t);
      wall(gapTo, fixed, to, fixed, h, material, t);
      add(box({ size: [gapTo - gapFrom, h - DOOR_H, t], pos: [(gapFrom + gapTo) / 2, DOOR_H + (h - DOOR_H) / 2, fixed], mat: material }));
    } else {
      wall(fixed, from, fixed, gapFrom, h, material, t);
      wall(fixed, gapTo, fixed, to, h, material, t);
      add(box({ size: [t, h - DOOR_H, gapTo - gapFrom], pos: [fixed, DOOR_H + (h - DOOR_H) / 2, (gapFrom + gapTo) / 2], mat: material }));
    }
  }

  /**
   * Hang a door leaf in a doorway.
   * @param axis 'x' (leaf swings in the XZ plane about a jamb on the X axis)
   */
  function hangDoor(id, { axis, fixed, from, to, material = M_DARKWOOD, locked = false, label, swing = -1.9, hinge = 'low', alarmed = false, glass = false }) {
    const width = to - from;
    const pivot = new THREE.Group();
    const leafMat = glass ? M_GLASS : material;
    const leaf = box({
      size: axis === 'x' ? [width, DOOR_H, 0.06] : [0.06, DOOR_H, width],
      pos: axis === 'x' ? [width / 2 * (hinge === 'low' ? 1 : -1), DOOR_H / 2, 0] : [0, DOOR_H / 2, width / 2 * (hinge === 'low' ? 1 : -1)],
      mat: leafMat,
    });
    pivot.add(leaf);
    // Handle, so it reads as a door from across a room
    const hx = axis === 'x' ? width * 0.85 * (hinge === 'low' ? 1 : -1) : 0.06;
    const hz = axis === 'x' ? 0.06 : width * 0.85 * (hinge === 'low' ? 1 : -1);
    pivot.add(cylinder({ r: 0.028, h: 0.1, pos: [hx, 1.02, hz], rotX: axis === 'x' ? Math.PI / 2 : 0, rotZ: axis === 'x' ? 0 : Math.PI / 2, mat: M_BRASS }));
    pivot.position.set(
      axis === 'x' ? (hinge === 'low' ? from : to) : fixed,
      0,
      axis === 'x' ? fixed : (hinge === 'low' ? from : to),
    );
    add(pivot);

    const cbox = axis === 'x'
      ? collider([from, 0, fixed - 0.08], [to, DOOR_H, fixed + 0.08])
      : collider([fixed - 0.08, 0, from], [fixed + 0.08, DOOR_H, to]);
    colliders.push(cbox);

    const door = new Door({ pivot, leaf, colliders, box: cbox, locked, label, swing, alarmed });
    doors[id] = door;
    return door;
  }

  /* ================================================================== */
  /* Night, rain, and the road outside                                   */
  /* ================================================================== */

  scene.background = new THREE.Color(0x07070d);
  scene.fog = new THREE.FogExp2(0x0a0a12, 0.014);

  add(new THREE.HemisphereLight(0x33405e, 0x0d0d14, 0.62));
  const moon = new THREE.DirectionalLight(0x9fb4e8, 0.8);
  moon.position.set(-30, 40, 30);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -40;
  moon.shadow.camera.right = 40;
  moon.shadow.camera.top = 40;
  moon.shadow.camera.bottom = -40;
  moon.shadow.camera.far = 120;
  moon.shadow.bias = -0.0012;
  add(moon, moon.target);

  {
    const tex = tiled(asphalt(), 26, 26);
    if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const g = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), mat({ map: tex, roughness: 0.42, metalness: 0.08 }));
    g.rotation.x = -Math.PI / 2;
    g.position.set(0, -0.01, 12);
    g.receiveShadow = true;
    add(g);
    floorZones.push({
      box: new THREE.Box3(new THREE.Vector3(-130, -1, -118), new THREE.Vector3(130, 1, 142)),
      surface: 'tile',
    });
  }

  // Roadside grass, the elevated highway, and the warehouses behind it
  {
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 46), mat({ color: 0x1b2418, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, 0.0, 78);
    add(grass);

    add(box({ size: [260, 1.5, 10], pos: [0, 8.4, 92], mat: M_CONCRETE }));
    for (let x = -120; x <= 120; x += 20) {
      add(cylinder({ r: 1.2, h: 8, pos: [x, 4, 92], mat: M_CONCRETE }));
    }
    // Trucks on it all night, reduced to a pair of lights and a shape
    for (let i = 0; i < 7; i++) {
      const dir = i % 2 ? 1 : -1;
      const t = group('truck',
        box({ size: [6.5, 3.2, 2.6], pos: [0, 0, 0], mat: mat({ color: 0x14141c, roughness: 1 }) }),
        box({ size: [0.4, 0.3, 0.5], pos: [dir * 3.3, -1.1, 0.9], mat: lit(dir > 0 ? 0xfff0c0 : 0xff4a3a, 3) }),
        box({ size: [0.4, 0.3, 0.5], pos: [dir * 3.3, -1.1, -0.9], mat: lit(dir > 0 ? 0xfff0c0 : 0xff4a3a, 3) }),
      );
      t.position.set(rand(-120, 120), 10.7, 92 + (i % 2 ? 2.6 : -2.6));
      add(t);
      ticking.push((dt) => {
        t.position.x += dir * rand(15, 16) * dt;
        if (t.position.x > 135) t.position.x = -135;
        if (t.position.x < -135) t.position.x = 135;
      });
    }

    /* Warehouses, with a few lit windows each. The windows are children of the
     * shed they belong to -- built loose in world space they ended up hanging
     * in the middle of the club, which is a good way to find out that `add()`
     * returns the object rather than positioning it. */
    for (let i = 0; i < 10; i++) {
      const w = rand(16, 30);
      const h = rand(6, 13);
      const d = rand(12, 22);
      const shed = group('warehouse',
        box({ size: [w, h, d], pos: [0, h / 2, 0], mat: mat({ color: pick([0x14141a, 0x1a1a22, 0x121218]), roughness: 1 }) }));
      for (let k = 0; k < 3; k++) {
        shed.add(box({
          size: [1.0, 0.8, 0.1],
          pos: [rand(-w / 2 + 2, w / 2 - 2), rand(2, h - 1.5), d / 2 + 0.05],
          mat: lit(pick([0xffd9a0, 0x9ab8d8]), 0.9),
        }));
      }
      shed.position.set(rand(-100, 100), 0, rand(-75, -34));
      add(shed);
    }
    // Power lines along the lot's edge
    for (let i = 0; i < 8; i++) {
      const px = -84 + i * 24;
      add(cylinder({ r: 0.18, h: 9, pos: [px, 4.5, 66], mat: M_WOOD }));
      add(box({ size: [0.14, 0.14, 3.0], pos: [px, 8.3, 66], mat: M_WOOD }));
    }
  }

  /* ================================================================== */
  /* The building shell                                                  */
  /* ================================================================== */

  const EXT_H = 6.2;
  function shell(x0, z0, x1, z1) {
    const w = Math.max(Math.abs(x1 - x0), 0.4);
    const d = Math.max(Math.abs(z1 - z0), 0.4);
    add(box({ size: [w, EXT_H, d], pos: [(x0 + x1) / 2, EXT_H / 2, (z0 + z1) / 2], mat: M_BRICK }));
    solid((x0 + x1) / 2 - w / 2, (z0 + z1) / 2 - d / 2, (x0 + x1) / 2 + w / 2, (z0 + z1) / 2 + d / 2, 0, EXT_H);
  }

  shell(-21, -15, -21, 11);
  shell(21, -15, 21, 11);
  shell(-21, -15, 8.4, -15);
  shell(9.7, -15, 21, -15);
  shell(-21, 11, -4, 11);
  shell(4, 11, 21, 11);
  add(box({ size: [42.8, 0.4, 26.8], pos: [0, EXT_H + 0.2, -2], mat: mat({ color: 0x24211c, roughness: 1 }) }));

  // Roof plant nobody has serviced since the nineties
  for (const [rx, rz] of [[-8, -8], [6, -3], [-15, 3]]) {
    add(box({ size: [2.8, 1.5, 2.2], pos: [rx, EXT_H + 1.15, rz], mat: M_STEEL }));
    const fan = cylinder({ r: 0.75, h: 0.16, pos: [rx, EXT_H + 1.95, rz], mat: M_STEEL });
    add(fan);
    ticking.push((dt) => { fan.rotation.y += dt * 2.4; });
  }

  /* ---- the vestibule bump-out, the canopy, and the sign ---- */
  const V = ROOMS.vestibule;
  shell(V.x0, V.z0, V.x0, V.z1);
  shell(V.x1, V.z0, V.x1, V.z1);
  wallGap('x', V.z1, V.x0, V.x1, -1.15, 1.15, 3.5, M_BRICK, 0.3);
  add(box({ size: [8.6, 0.3, 4.8], pos: [0, 3.6, 13.2], mat: mat({ color: 0x24211c, roughness: 1 }) }));

  {
    add(box({ size: [9.6, 0.34, 3.4], pos: [0, 4.0, 16.8], mat: mat({ color: 0x4d1520, roughness: 0.8 }) }));
    for (const sx of [-4.4, 4.4]) {
      add(cylinder({ r: 0.09, h: 4.0, pos: [sx, 2.0, 18.2], mat: M_BRASS }));
    }
    // Velvet rope on brass posts
    for (let i = 0; i < 4; i++) {
      const x = -3.45 + i * 2.3;
      add(cylinder({ r: 0.08, h: 1.0, pos: [x, 0.5, 18.9], mat: M_BRASS }));
      add(sphere({ r: 0.09, pos: [x, 1.05, 18.9], mat: M_BRASS }));
      if (i < 3) {
        add(cylinder({ r: 0.045, h: 2.3, pos: [x + 1.15, 0.84, 18.9], rotZ: Math.PI / 2, mat: mat({ color: 0x5e161f, roughness: 0.9 }) }));
      }
      solid(x - 0.12, 18.78, x + 0.12, 19.02, 0, 1.1);
    }
    // The heater the bouncer stands under
    add(cylinder({ r: 0.2, h: 1.9, pos: [3.7, 0.95, 17.5], mat: M_STEEL }));
    const glow = cylinder({ r: 0.34, h: 0.55, pos: [3.7, 2.05, 17.5], mat: lit(0xff7a3a, 3.2) });
    add(glow);
    const doorSpill = new THREE.PointLight(0xffb070, 14, 10, 2);
    doorSpill.position.set(0, 2.2, 15.9);
    add(doorSpill);
    const heaterLight = new THREE.PointLight(0xff7a3a, 6, 6, 2);
    heaterLight.position.set(3.7, 2.0, 17.5);
    add(heaterLight);
    ticking.push((dt, t) => { heaterLight.intensity = 6 + Math.sin(t * 3.1) * 0.6; });
  }

  // BADA BING, enormous, pink, and buzzing
  {
    add(box({ size: [11.4, 2.8, 0.4], pos: [0, 5.5, 15.6], mat: mat({ color: 0x120a16, roughness: 1 }) }));
    const letters = sign(neonText('bada-bing', 'BADA BING'), 10.4, 2.2, { x: 0, y: 5.5, z: 15.85, emissive: 0xff3d8b, intensity: 3.4 });
    add(letters);
    const signLight = new THREE.PointLight(0xff3d8b, 55, 30, 2);
    signLight.position.set(0, 5.0, 17.4);
    add(signLight);

    // The dancer: a neon squatch in a bandana, mid-kick, wired up wrong
    const dancer = sign(neonSilhouette(), 1.9, 2.7, { x: 6.7, y: 5.5, z: 15.85, emissive: 0xff77c0, intensity: 3.0 });
    add(dancer);
    const dancerLight = new THREE.PointLight(0xff77c0, 14, 14, 2);
    dancerLight.position.set(6.7, 5.5, 17);
    add(dancerLight);
    neon.push({ mesh: dancer, light: dancerLight, base: 14, next: rand(3, 8), on: true, kind: 'neon' });

    add(sign(printed('world-famous', ['WORLD FAMOUS ENTERTAINMENT'], {
      w: 1024, h: 128, bg: '#231a29', fg: '#7d7086', font: '800 60px "Trebuchet MS", sans-serif',
    }), 5.4, 0.68, { x: 0, y: 3.2, z: 15.42 }));
  }

  /* ---- exits, cameras, the alley ---- */
  {
    // Employee side door and two fire exits, glowing red and going nowhere tonight
    for (const [ex, ey, ez, ry] of [[21.06, 1.05, 6.5, Math.PI / 2], [-21.06, 1.05, -6, -Math.PI / 2]]) {
      add(box({ size: [0.08, DOOR_H, 1.0], pos: [ex, ey, ez], mat: M_STEEL }));
      add(sign(printed('exit', ['EXIT'], { w: 256, h: 96, bg: '#240606', fg: '#ff4a4a', font: '900 62px "Trebuchet MS", sans-serif' }),
        0.8, 0.28, { x: ex + (ex > 0 ? -0.1 : 0.1), y: 2.5, z: ez, rotY: ry, emissive: 0xff2a2a, intensity: 2.4 }));
    }

    // Dumpster enclosure down the delivery alley
    for (const [dx, dz, w, d] of [[24, -8.6, 5.2, 0.24], [21.5, -7, 0.24, 3.4], [26.5, -7, 0.24, 3.4]]) {
      add(box({ size: [w, 1.9, d], pos: [dx, 0.95, dz], mat: mat({ color: 0x33333a, roughness: 0.95 }) }));
    }
    solid(21.4, -8.8, 26.6, -5.2, 0, 1.9);
    add(box({ size: [2.5, 1.25, 1.45], pos: [24, 0.62, -7.2], mat: mat({ color: 0x24402c, roughness: 0.9 }) }));
    add(box({ size: [2.55, 0.12, 1.5], pos: [24, 1.3, -7.2], mat: mat({ color: 0x1c3423, roughness: 0.9 }) }));
    anchors.dumpster = new THREE.Vector3(24, 0, -5.6);
  }

  /* ================================================================== */
  /* The parking lot                                                     */
  /* ================================================================== */
  {
    const bay = lit(0xd8d4c0, 0.5);
    for (let i = 0; i < 24; i++) {
      const col = i % 12;
      const z = i < 12 ? 25 : 35;
      add(box({ size: [0.12, 0.02, 5.2], pos: [-26 + col * 4.6, 0.005, z], mat: bay, cast: false }));
    }
    add(box({ size: [2.7, 0.02, 5.0], pos: [8.5, 0.008, 18.8], mat: lit(0x8a2438, 0.6), cast: false }));
    const reserved = sign(printed('reserved', ['RESERVED'], {
      w: 512, h: 128, bg: null, fg: '#e8d0d8', font: '900 70px "Trebuchet MS", sans-serif',
    }), 2.2, 0.55, { x: 8.5, y: 0.02, z: 18.8 });
    reserved.rotation.x = -Math.PI / 2;
    reserved.material.transparent = true;
    add(reserved);

    // Lamp posts: cones of sodium light, the only warm thing out here
    // Two of these are out in the middle of the bays, because a lot lit only
    // round the edges is a lot full of black shapes.
    for (const [lx, lz] of [[-24, 21], [-24, 41], [17, 41], [26, 26], [0, 50], [-9, 30], [9, 30]]) {
      add(cylinder({ r: 0.1, h: 6.6, pos: [lx, 3.3, lz], mat: M_STEEL }));
      add(box({ size: [0.7, 0.16, 0.4], pos: [lx + 0.3, 6.6, lz], mat: M_STEEL }));
      add(box({ size: [0.55, 0.08, 0.32], pos: [lx + 0.35, 6.5, lz], mat: lit(0xffd9a0, 2.6) }));
      const l = new THREE.PointLight(0xffc98a, 42, 26, 2);
      l.position.set(lx + 0.35, 6.4, lz);
      add(l);
      solid(lx - 0.15, lz - 0.15, lx + 0.15, lz + 0.15, 0, 6.6);
    }
    // Drains, for the water to pretend to go somewhere
    for (const [dx, dz] of [[-12, 31], [10, 33], [-2, 45]]) {
      add(box({ size: [0.75, 0.02, 0.75], pos: [dx, 0.006, dz], mat: mat({ color: 0x101016, roughness: 1 }), cast: false }));
    }
  }

  /* ================================================================== */
  /* Floors, ceilings and partitions                                     */
  /* ================================================================== */
  const MAIN = ROOMS.main;
  const carpetTex = tiled(clubCarpet(), 9, 8);
  if (renderer) carpetTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const M_CARPET = mat({ map: carpetTex, roughness: 0.97 });
  floor(MAIN, M_CARPET, 'rug');
  ceiling(MAIN, mat({ color: 0x0d0a12, roughness: 1 }), CEIL_MAIN);
  floor(V, mat({ map: tiled(clubCarpet(), 3, 2), roughness: 0.97 }), 'rug');
  ceiling(V, mat({ color: 0x120c16, roughness: 1 }), 3.3);

  const M_TILE = mat({ map: tiled(backTile(), 5, 8), roughness: 0.68 });
  for (const r of [ROOMS.hallway, ROOMS.bathroom, ROOMS.storage]) {
    floor(r, M_TILE, 'tile', 0.004);
    ceiling(r, mat({ color: 0x191920, roughness: 1 }), CEIL_BACK);
  }
  floor(ROOMS.office, mat({ map: tiled(clubCarpet(), 2, 2), roughness: 0.97 }), 'rug', 0.004);
  ceiling(ROOMS.office, mat({ color: 0x1e1218, roughness: 1 }), CEIL_BACK);

  // Front wall of the club, with the inner doors through to the vestibule
  wallGap('x', 11, -21, 5.4, -1.15, 1.15, CEIL_MAIN, M_PANEL);
  // East wall, with the archway through to the back of house
  wallGap('z', 5.5, -11, 11, 2.4, 4.4, CEIL_MAIN, M_PANEL);
  wall(-21, -11, 5.5, -11, CEIL_MAIN, M_PANEL);

  /* Inner skins on the shell. The brick is the outside of the building; from
   * in here it is panelling to shoulder height and dark paint above, because
   * nobody has ever looked at a bare brick wall in a place like this. */
  {
    const dado = mat({ map: tiled(panelling('#3a2418'), 8, 0.6), roughness: 0.85 });
    const above = mat({ color: 0x1a1016, roughness: 0.98 });
    /* Sat proud of the shell's inner face (x = -20.8, z = -14.8, z = 11), not
     * inside it -- a skin buried in the wall it is skinning is just brick with
     * extra draw calls, which is exactly what the first pass shipped. */
    // West wall, behind the bar
    add(box({ size: [0.08, 1.3, 22], pos: [-20.74, 0.65, 0], mat: dado }));
    add(box({ size: [0.08, 3.2, 22], pos: [-20.74, 2.9, 0], mat: above }));
    // Front wall, either side of the doors
    for (const [cx, w] of [[-11.6, 18.6], [3.3, 4.2]]) {
      add(box({ size: [w, 1.3, 0.08], pos: [cx, 0.65, 10.84], mat: dado }));
      add(box({ size: [w, 3.2, 0.08], pos: [cx, 2.9, 10.84], mat: above }));
    }
    // The vestibule, which is small enough that its walls are most of it.
    // The front skin has to repeat the real doorway cut-out. The original
    // single 7.4 m panel covered the opening even after the physical door had
    // swung away, so from the lot an open door revealed an opaque wall.
    for (const [vx, vz, vw, vd] of [[-3.74, 13.2, 0.06, 4.4], [3.74, 13.2, 0.06, 4.4]]) {
      add(box({ size: [vw, 1.3, vd], pos: [vx, 0.65, vz], mat: dado }));
      add(box({ size: [vw, 1.9, vd], pos: [vx, 2.25, vz], mat: above }));
    }
    for (const [name, vx] of [['left', -2.425], ['right', 2.425]]) {
      add(box({
        name: `vestibule.front-skin.${name}.dado`,
        size: [2.55, 1.3, 0.06],
        pos: [vx, 0.65, 15.18],
        mat: dado,
      }));
      add(box({
        name: `vestibule.front-skin.${name}.upper`,
        size: [2.55, 1.9, 0.06],
        pos: [vx, 2.25, 15.18],
        mat: above,
      }));
    }
    add(box({
      name: 'vestibule.front-skin.lintel',
      size: [2.3, 3.2 - DOOR_H, 0.06],
      pos: [0, DOOR_H + (3.2 - DOOR_H) / 2, 15.18],
      mat: above,
    }));
  }

  const H = ROOMS.hallway;
  wall(H.x1, H.z0, H.x1, -8.0, CEIL_BACK, M_BACKWALL);
  wall(H.x1, -6.0, H.x1, -4.3, CEIL_BACK, M_BACKWALL);
  wall(H.x1, -3.3, H.x1, -0.1, CEIL_BACK, M_BACKWALL);
  wall(H.x1, 1.5, H.x1, 2.9, CEIL_BACK, M_BACKWALL);
  wall(H.x1, 3.9, H.x1, H.z1, CEIL_BACK, M_BACKWALL);
  wall(H.x0, H.z0, H.x0, 2.4, CEIL_BACK, M_BACKWALL);
  wall(H.x0, 4.4, H.x0, H.z1, CEIL_BACK, M_BACKWALL);
  wall(H.x0, H.z1, H.x1, H.z1, CEIL_BACK, M_BACKWALL);
  wallGap('x', H.z0, H.x0 - 0.1, H.x1 + 0.1, 6.2, 7.3, CEIL_BACK, M_BACKWALL);

  const O = ROOMS.office;
  wall(O.x1, O.z0, O.x1, O.z1, CEIL_BACK, M_PANEL);
  wall(O.x0, O.z0, O.x1, O.z0, CEIL_BACK, M_PANEL);
  wall(O.x0, O.z1, O.x1, O.z1, CEIL_BACK, M_PANEL);

  const B = ROOMS.bathroom;
  wall(B.x1, B.z0, B.x1, B.z1, CEIL_BACK, mat({ map: tiled(backTile(), 3, 2), roughness: 0.6 }));
  wall(B.x0, B.z0, B.x1, B.z0, CEIL_BACK, mat({ map: tiled(backTile(), 4, 2), roughness: 0.6 }));
  wall(B.x0, B.z1, B.x1, B.z1, CEIL_BACK, mat({ map: tiled(backTile(), 4, 2), roughness: 0.6 }));

  const S = ROOMS.storage;
  wall(S.x1, S.z0, S.x1, S.z1, CEIL_BACK, M_BACKWALL);
  wall(S.x0, S.z0 + 0.1, S.x0, S.z1, CEIL_BACK, M_BACKWALL);

  /* ---- doors ---- */
  hangDoor('front', { axis: 'x', fixed: 15.4, from: -1.15, to: 1.15, label: 'the front door', glass: false, material: M_DARKWOOD, swing: -2.0 });
  hangDoor('inner', { axis: 'x', fixed: 11, from: -1.15, to: 1.15, label: 'the club doors', material: M_LEATHER_DARK, swing: -2.0 });
  hangDoor('lou', { axis: 'z', fixed: 7.9, from: -7.6, to: -6.5, label: "Lou's office", material: M_WOOD, swing: 1.9 });
  hangDoor('manager', { axis: 'z', fixed: 7.9, from: -4.3, to: -3.3, locked: true, label: "the manager's office" });
  // Swings into the hallway; opening inward swept the leaf through the stalls.
  hangDoor('mens', { axis: 'z', fixed: 7.9, from: -0.1, to: 1.5, label: "the men's room", swing: -1.9 });
  hangDoor('ladies', { axis: 'z', fixed: 7.9, from: 2.9, to: 3.9, locked: true, label: "the ladies'" });
  hangDoor('storage', { axis: 'x', fixed: -9.5, from: 6.2, to: 7.3, label: 'the store room', swing: 1.9 });
  hangDoor('service', { axis: 'x', fixed: -15, from: 8.4, to: 9.7, label: 'the service door', alarmed: true, material: M_STEEL, swing: -1.9 });

  /* ---- the glass round Lou's door ----
   * The hallway wall stops at z -8.0 and starts again at -6.0, and the door
   * hung in that hole is 1.1 m wide: there were forty and fifty centimetres
   * of open air either side of it and a fifty-five centimetre gap over the
   * head. Sidelights and a transom -- wired glass in a timber frame, the way
   * every back office of this vintage borrows light off its corridor. Lou
   * can see who is coming down the hall without opening anything, the
   * hallway gets the office's amber through the panes, and the door is now
   * the only way into the room.
   */
  {
    const gx = 7.8;                       // the hallway wall's own plane
    const panes = [];
    const frameMat = M_WOOD;
    const glaze = (z0, z1, y0, y1, tag) => {
      const cz = (z0 + z1) / 2;
      const cy = (y0 + y1) / 2;
      const w = z1 - z0;
      const h = y1 - y0;
      const pane = box({
        name: `office.glass.${tag}`,
        size: [0.02, h - 0.1, w - 0.1],
        pos: [gx, cy, cz],
        mat: M_GLASS,
      });
      pane.castShadow = false;
      pane.receiveShadow = false;
      add(pane);
      panes.push(pane);
      add(box({ size: [0.075, h, 0.05], pos: [gx, cy, z0 + 0.025], mat: frameMat }));
      add(box({ size: [0.075, h, 0.05], pos: [gx, cy, z1 - 0.025], mat: frameMat }));
      add(box({ size: [0.075, 0.05, w], pos: [gx, y0 + 0.025, cz], mat: frameMat }));
      add(box({ size: [0.075, 0.05, w], pos: [gx, y1 - 0.025, cz], mat: frameMat }));
      // A glazing bar across the middle, so it reads as joinery not a hole
      add(box({ size: [0.06, 0.035, w - 0.1], pos: [gx, cy, cz], mat: frameMat }));
      solid(gx - 0.05, z0, gx + 0.05, z1, y0, y1);
    };
    glaze(-8.02, -7.58, 0.0, DOOR_H, 'south');
    glaze(-6.52, -5.98, 0.0, DOOR_H, 'north');
    glaze(-8.02, -5.98, DOOR_H, CEIL_BACK, 'transom');
    doors.lou.glass = panes;
  }

  /* ================================================================== */
  /* A. Entrance vestibule                                               */
  /* ================================================================== */
  {
    add(box({ size: [2.2, 1.05, 0.7], pos: [-2.6, 0.53, 13.2], mat: M_PANEL }));
    add(box({ size: [2.35, 0.08, 0.82], pos: [-2.6, 1.09, 13.2], mat: M_DARKWOOD }));
    solid(-3.75, 12.82, -1.45, 13.6, 0, 1.1);
    add(box({ size: [0.36, 0.28, 0.32], pos: [-2.0, 1.26, 13.2], mat: mat({ color: 0x2e2e36, roughness: 0.6 }) }));
    add(box({ size: [0.2, 0.1, 0.02], pos: [-2.0, 1.36, 13.37], mat: lit(0x2affc8, 2) }));
    for (let i = 0; i < 6; i++) {
      add(box({ size: [0.13, 0.75, 0.34], pos: [-3.4 + i * 0.26, 2.0, 12.85], mat: mat({ color: pick([0x22222a, 0x2e211c, 0x1c222c]), roughness: 0.9 }) }));
    }
    add(cylinder({ r: 0.02, h: 2.4, pos: [-2.6, 2.4, 12.85], rotZ: Math.PI / 2, mat: M_CHROME }));

    // Velvet, either side of the inner doors, hanging against the wall's
    // vestibule face (z 11.09) rather than a hand's width off it
    for (const sx of [-2.3, 2.3]) {
      add(box({ size: [1.5, 2.8, 0.12], pos: [sx, 1.45, 11.15], mat: mat({ color: 0x4a0f1a, roughness: 0.95 }) }));
    }

    // The monitor wall: four of the club, one of the lot. Backs a whisker off
    // the front skin (face z 15.15) -- they used to hang 25 cm out in the air.
    for (let i = 0; i < 4; i++) {
      add(box({
        size: [0.52, 0.38, 0.05],
        pos: [2.3 + (i % 2) * 0.58, 2.45 - Math.floor(i / 2) * 0.44, 15.12],
        mat: lit([0x1c3a2a, 0x2a1a3a, 0x18293a, 0x3a2a18][i], 0.9),
      }));
    }

    // A metal detector that may or may not work
    for (const sx of [-1.0, 1.0]) {
      add(box({ size: [0.18, 2.0, 0.32], pos: [sx, 1.0, 12.2], mat: mat({ color: 0x2a2a32, roughness: 0.8 }) }));
      solid(sx - 0.1, 12.05, sx + 0.1, 12.35, 0, 2.0);
    }
    add(box({ size: [2.2, 0.18, 0.32], pos: [0, 2.05, 12.2], mat: mat({ color: 0x2a2a32, roughness: 0.8 }) }));

    // Printed notices sit ON the front skin (face z 15.15), not a step out
    // from it: half a centimetre proud is a sticker, thirty is a seance.
    add(sign(printed('no-cameras', ['NO', 'CAMERAS'], { w: 256, h: 180, bg: '#1a1420', fg: '#e8e0e8', font: '900 52px "Trebuchet MS", sans-serif', border: '#e8e0e8' }),
      0.62, 0.44, { x: 3.2, y: 1.95, z: 15.145 }));
    add(sign(printed('atm', ['ATM INSIDE'], { w: 256, h: 110, bg: '#0f1a14', fg: '#6affb0', font: '900 42px "Trebuchet MS", sans-serif' }),
      0.62, 0.28, { x: 3.2, y: 1.45, z: 15.145, emissive: 0x2a8a5a, intensity: 1.2 }));

    /* The wall of stars. The frames hang off the west skin's inner face
     * (x -3.71): the old x put the whole frame, art and all, inside the
     * shell's brick, which read from the room as pictures adrift in a wall. */
    for (let i = 0; i < 4; i++) {
      add(makeFrame(M, {
        x: -3.674, y: 2.15, z: 11.9 + i * 0.72, rotY: Math.PI / 2, w: 0.42, h: 0.54,
        /* The wall of stars, and the star is the house's own mark rather
       * than a typographic asterisk: the same drawSquatchSilhouette every
       * poster, cabinet and tail fin in the game draws. */
      texture: squatchArt(`vest-photo${i}`, {
        title: [['THE', 'BING'], ['HOUSE', 'RULES'], ['TUESDAY', 'NIGHTS'], ['THE', 'FAMILY']][i],
        ink: '#c8a2d8', bg: '#2a1a24', w: 256, h: 320,
      }),
      }));
    }
    add(cylinder({ r: 0.17, h: 0.5, pos: [3.5, 0.25, 12.5], mat: M_STEEL }));
    add(makePlant(M, { x: -3.4, z: 14.7, scale: 0.9 }));

    const vestLight = new THREE.PointLight(0xff9a6a, 9, 9, 2);
    vestLight.position.set(0, 2.95, 13.2);
    add(vestLight);
    anchors.bouncerPost = new THREE.Vector3(1.6, 0, 12.4);
    anchors.coatCheck = new THREE.Vector3(-2.6, 0, 12.5);
  }

  /* ================================================================== */
  /* C. The stage                                                        */
  /* ================================================================== */
  {
    const stage = new THREE.Group();
    /* The main platform is a plain slab. The old extruded arc pointed its
     * cap backwards through the club wall and rode a storey above groundAt,
     * burying the performers to the waist; the round thrust the room sees is
     * the runway box plus the tip cylinder below. */
    const deckGeo = new THREE.BoxGeometry(10, STAGE_H, 7.4);
    const deck = new THREE.Mesh(deckGeo, M_BLACKGLOSS);
    deck.position.y = STAGE_H / 2;
    deck.receiveShadow = true;
    stage.add(deck);
    stage.add(box({ size: [1.9, STAGE_H, 3.6], pos: [0, STAGE_H / 2, 4.6], mat: M_BLACKGLOSS }));
    stage.add(cylinder({ r: 0.95, h: STAGE_H, pos: [0, STAGE_H / 2, 6.4], mat: M_BLACKGLOSS }));
    for (const [sx, sz, w, d, col] of [
      [0, 3.5, 10, 0.12, 0xff2a6a],
      [-1.0, 4.15, 0.1, 4.5, 0xff2a6a], [1.0, 4.15, 0.1, 4.5, 0x9a3aff],
    ]) {
      stage.add(box({ size: [w, 0.09, d], pos: [sx, STAGE_H - 0.05, sz], mat: lit(col, 2.6), cast: false }));
    }
    // The tip light follows the tip: a half-ring on the round thrust's edge
    // instead of a straight bar hanging off both sides of it.
    const tipArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.045, 6, 20, Math.PI),
      lit(0x9a3aff, 2.6),
    );
    tipArc.name = 'stage-tip-arc';
    tipArc.position.set(0, STAGE_H - 0.05, 6.4);
    tipArc.rotation.x = Math.PI / 2;
    stage.add(tipArc);
    stage.position.set(-12, 0, -7.2);
    add(stage);
    // Walkable, and the reason a security squatch has a line about it
    platforms.push({ x0: -17, x1: -7, z0: -11, z1: -3.6, y: STAGE_H });
    platforms.push({ x0: -13, x1: -11, z0: -3.6, z1: -0.6, y: STAGE_H });
    // The lip you can bump into, so you have to walk round to the steps
    solid(-17.1, -3.62, -13.05, -3.5, 0, STAGE_H);
    solid(-10.95, -3.62, -6.9, -3.5, 0, STAGE_H);
    // The whole raised footprint, for the crowd's routing: deck, runway, and
    // the round thrust. NPCs steer round the front of the stage instead of
    // wading through it; the player still mounts it via the platforms above.
    navBlockers.push(collider([-17.1, 0, -11], [-6.9, STAGE_H, -3.5]));
    navBlockers.push(collider([-13.05, 0, -4.5], [-10.95, STAGE_H, -0.7]));
    navBlockers.push(collider([-13.0, 0, -1.8], [-11.0, STAGE_H, 0.2]));

    anchors.poles = [];
    for (const px of [-15, -12, -9]) {
      add(cylinder({ r: 0.055, h: CEIL_MAIN, pos: [px, CEIL_MAIN / 2, -8.4], mat: M_CHROME }));
      anchors.poles.push(new THREE.Vector3(px, STAGE_H, -8.4));
    }
    anchors.runway = new THREE.Vector3(-12, STAGE_H, -2.9);
    anchors.stageFront = new THREE.Vector3(-12, 0, -2.2);

    // Rigging, speaker stacks, mirrored panels, a disco ball doing its best
    add(box({ size: [11, 0.16, 0.16], pos: [-12, CEIL_MAIN - 0.25, -9.6], mat: mat({ color: 0x101014, roughness: 1 }) }));
    add(box({ size: [11, 0.16, 0.16], pos: [-12, CEIL_MAIN - 0.25, -4.4], mat: mat({ color: 0x101014, roughness: 1 }) }));
    for (const sx of [-16.4, -7.6]) {
      add(box({ size: [0.75, 1.6, 0.65], pos: [sx, CEIL_MAIN - 1.1, -7.2], mat: mat({ color: 0x101014, roughness: 0.9 }) }));
    }
    const ball = sphere({ r: 0.42, pos: [-12, CEIL_MAIN - 0.95, -6.0], mat: mat({ color: 0xc8cede, roughness: 0.12, metalness: 1 }) });
    add(ball);
    ticking.push((dt) => { ball.rotation.y += dt * 0.8; });
    for (let i = 0; i < 8; i++) {
      add(box({ size: [0.5, 0.9, 0.04], pos: [-16.5 + i * 1.3, 3.5, -10.82], mat: mat({ color: 0x8a94a8, roughness: 0.15, metalness: 0.9 }) }));
    }

    // Two spots that sweep the stage, plus a wash that changes colour
    const spots = [];
    for (const [sx, colour] of [[-15.5, 0xff2a6a], [-8.5, 0x9a3aff]]) {
      const spot = new THREE.SpotLight(colour, 90, 16, 0.32, 0.6, 1.4);
      spot.position.set(sx, CEIL_MAIN - 0.4, -6.4);
      spot.target.position.set(sx, STAGE_H, -8);
      add(spot, spot.target);
      spots.push(spot);
    }
    ticking.push((dt, t) => {
      spots[0].target.position.set(-14 + Math.sin(t * 0.6) * 3, STAGE_H, -8 + Math.cos(t * 0.45) * 2);
      spots[1].target.position.set(-10 + Math.sin(t * 0.5 + 2) * 3, STAGE_H, -8 + Math.cos(t * 0.7 + 1) * 2);
      spots[0].intensity = 70 + Math.sin(t * 4) * 26;
      spots[1].intensity = 70 + Math.sin(t * 4 + 2.1) * 26;
    });

    // DJ booth, off to the side, running the whole night off two decks
    const dj = group('dj',
      box({ size: [2.0, 1.1, 0.85], pos: [0, 0.55, 0], mat: M_DARKWOOD }),
      box({ size: [2.1, 0.07, 0.95], pos: [0, 1.13, 0], mat: M_BLACKGLOSS }),
      cylinder({ r: 0.25, h: 0.04, pos: [-0.55, 1.18, 0], mat: mat({ color: 0x2a2a33, roughness: 0.5 }) }),
      cylinder({ r: 0.25, h: 0.04, pos: [0.55, 1.18, 0], mat: mat({ color: 0x2a2a33, roughness: 0.5 }) }),
      box({ size: [0.5, 0.2, 0.03], pos: [0, 1.22, 0.32], mat: lit(0x2affc8, 1.6) }),
    );
    dj.position.set(-5.6, 0, -10.1);
    dj.rotation.y = 0.25;
    add(dj);
    solid(-6.8, -10.6, -4.4, -9.6, 0, 1.2);
    anchors.dj = new THREE.Vector3(-5.6, 0, -9.2);
  }

  /* ================================================================== */
  /* D. The bar                                                          */
  /* ================================================================== */
  {
    const z0 = -3.5;
    const z1 = 8.5;
    const cx = -19.4;
    add(box({ size: [0.78, 1.05, z1 - z0], pos: [cx, 0.53, (z0 + z1) / 2], mat: M_PANEL }));
    add(box({ size: [0.98, 0.09, z1 - z0], pos: [cx, 1.1, (z0 + z1) / 2], mat: mat({ color: 0x14100f, roughness: 0.2, metalness: 0.15 }) }));
    solid(cx - 0.52, z0, cx + 0.42, z1, 0, 1.15);
    add(cylinder({ r: 0.05, h: z1 - z0, pos: [cx + 0.52, 0.2, (z0 + z1) / 2], rotX: Math.PI / 2, mat: M_BRASS }));

    add(box({ size: [0.5, 1.0, z1 - z0], pos: [-20.6, 0.5, (z0 + z1) / 2], mat: M_DARKWOOD }));
    solid(-20.9, z0, -20.3, z1, 0, 1.0);
    // The mirror behind the bottles: dark, and honest about the room
    add(box({ size: [0.05, 2.2, z1 - z0 - 0.4], pos: [-20.86, 2.1, (z0 + z1) / 2], mat: mat({ color: 0x2a2530, roughness: 0.1, metalness: 0.9 }) }));

    for (let s = 0; s < 3; s++) {
      add(box({ size: [0.34, 0.05, z1 - z0 - 0.6], pos: [-20.64, 1.24 + s * 0.52, (z0 + z1) / 2], mat: M_DARKWOOD }));
      for (let i = 0; i < 14; i++) {
        const b = makeWhiskeyBottle(M, {
          x: -20.64 + rand(-0.05, 0.05),
          y: 1.29 + s * 0.52,
          z: z0 + 0.7 + i * ((z1 - z0 - 1.4) / 13),
          rotY: rand(0, 3),
        }).group;
        b.scale.setScalar(rand(0.8, 1.05));
        add(b);
      }
    }
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffb060, 9, 7, 2);
      l.position.set(-20.35, 1.85 + (i % 2) * 0.5, z0 + 2.4 + i * 3.6);
      add(l);
    }

    // Taps, ice well, register, tip jar, glasses on the rail
    for (let i = 0; i < 5; i++) {
      add(cylinder({ r: 0.03, h: 0.3, pos: [-19.9, 1.28, 1.4 + i * 0.22], mat: M_CHROME }));
      add(box({ size: [0.1, 0.06, 0.07], pos: [-19.82, 1.45, 1.4 + i * 0.22], mat: mat({ color: pick([0xd92e2e, 0x2e6ed9, 0xd9a22e]), roughness: 0.6 }) }));
    }
    add(box({ size: [0.42, 0.3, 0.95], pos: [-20.12, 0.85, -1.5], mat: M_STEEL }));
    add(box({ size: [0.45, 0.32, 0.5], pos: [-20.2, 1.16, 5.8], mat: mat({ color: 0x2e2e36, roughness: 0.7 }) }));
    add(box({ size: [0.02, 0.16, 0.3], pos: [-19.96, 1.32, 5.8], mat: lit(0x2affc8, 1.6) }));
    for (let i = 0; i < 12; i++) add(makeShotGlass(M, { x: -19.35 + rand(-0.1, 0.1), y: 1.15, z: rand(z0 + 0.7, z1 - 0.7) }));
    add(makeAshtray(M, { x: -19.5, y: 1.15, z: 6.4 }));

    /* The clock behind the bar. Every room in this game knows what time it
     * is except the one where the whole point is that Lou has been waiting;
     * main.js drives these hands off the campaign clock, so the wall and the
     * HUD agree and both of them agree with the drive over. */
    /* Proud of the wall SKIN's inner face (x -20.70), not inside it: the
     * shell's dado runs -20.78..-20.70 and the first hanging put the whole
     * clock in the middle of it, where it rendered as a bright speck. */
    const barClock = makeWallClock(M, { x: -20.64, y: 2.72, z: -0.6, rotY: Math.PI / 2, r: 0.34 });
    add(barClock);
    clocks.push(barClock);

    // Small television showing a game nobody is watching
    const tvGlow = box({ size: [0.06, 0.52, 0.86], pos: [-20.72, 2.95, 6.9], mat: lit(0x2a4a6a, 1.2) });
    add(tvGlow);
    ticking.push((dt, t) => {
      if (Math.random() < 0.02) tvGlow.material.emissive.setHex(pick([0x2a4a6a, 0x2f5a3a, 0x5a4a2a]));
      void t;
    });

    const barNeon = sign(neonText('bar-bing', 'BADA BING', { font: '900 120px "Trebuchet MS", sans-serif' }), 2.0, 0.5,
      { x: -20.8, y: 3.05, z: 2.0, rotY: Math.PI / 2, emissive: 0xff3d8b, intensity: 3.0 });
    add(barNeon);
    const barNeonLight = new THREE.PointLight(0xff3d8b, 10, 9, 2);
    barNeonLight.position.set(-20.1, 3.05, 2.0);
    add(barNeonLight);
    neon.push({ mesh: barNeon, light: barNeonLight, base: 10, next: rand(6, 15), on: true, kind: 'neon' });

    anchors.barStools = [];
    for (let i = 0; i < 9; i++) {
      const sz = z0 + 0.9 + i * 1.3;
      const stool = group('stool',
        cylinder({ r: 0.24, h: 0.13, pos: [0, 0.78, 0], mat: M_LEATHER }),
        cylinder({ r: 0.05, h: 0.78, pos: [0, 0.39, 0], mat: M_CHROME }),
        cylinder({ r: 0.26, h: 0.04, pos: [0, 0.02, 0], mat: M_CHROME }),
        cylinder({ r: 0.18, h: 0.02, pos: [0, 0.3, 0], mat: M_BRASS }),
      );
      stool.position.set(-18.7, 0, sz);
      add(stool);
      solid(-18.95, sz - 0.25, -18.45, sz + 0.25, 0, 0.85);
      anchors.barStools.push(new THREE.Vector3(-18.7, 0, sz));
    }
    anchors.barService = new THREE.Vector3(-18.35, 0, 2.2);
    anchors.bartender = new THREE.Vector3(-20.05, 0, 2.2);
    anchors.barback = new THREE.Vector3(-20.05, 0, 7.2);
  }

  /* ================================================================== */
  /* E. The blackjack corner                                             */
  /* ================================================================== */
  const bj = { x: -13.5, z: 7.4 };
  {
    const table = new THREE.Group();
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 1.15, Math.PI, 0, true);
    shape.lineTo(-1.15, 0);
    const feltGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
    feltGeo.rotateX(-Math.PI / 2);
    const feltTop = new THREE.Mesh(feltGeo, mat({ map: felt(), roughness: 0.98 }));
    feltTop.position.y = 0.84;
    feltTop.receiveShadow = true;
    table.add(feltTop);
    const railShape = new THREE.Shape();
    railShape.absarc(0, 0, 1.3, Math.PI, 0, true);
    railShape.lineTo(-1.3, 0);
    const railGeo = new THREE.ExtrudeGeometry(railShape, { depth: 0.1, bevelEnabled: false });
    railGeo.rotateX(-Math.PI / 2);
    table.add(new THREE.Mesh(railGeo, M_LEATHER_DARK));
    table.children[1].position.y = 0.8;
    /* The felt's flat edge faces the dealer, and the group is turned half round
     * so the curve faces the room -- which means the dealer's own furniture
     * lives at local +z. Getting that backwards put the shoe and the chip rack
     * in the players' laps. */
    table.add(box({ size: [2.4, 0.76, 1.4], pos: [0, 0.38, 0.55], mat: M_DARKWOOD }));
    table.add(box({ size: [0.55, 0.08, 0.2], pos: [0, 0.92, 0.8], mat: M_WOOD }));
    table.add(box({ size: [0.24, 0.18, 0.3], pos: [0.72, 0.97, 0.72], mat: mat({ color: 0x2a1a12, roughness: 0.7 }) }));
    table.add(box({ size: [0.22, 0.1, 0.26], pos: [-0.72, 0.93, 0.72], mat: mat({ color: 0x2a1a12, roughness: 0.7 }) }));
    table.position.set(bj.x, 0, bj.z);
    table.rotation.y = Math.PI;
    add(table);
    solid(bj.x - 1.4, bj.z - 1.1, bj.x + 1.4, bj.z + 1.2, 0, 1.0);

    anchors.blackjack = new THREE.Vector3(bj.x, 0, bj.z);
    // Five seats round the curved side, dealer alone on the flat side. The
    // middle one is the seat they keep open for the prospect.
    anchors.blackjackSeats = [];
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.42;
      const sx = bj.x + Math.sin(a) * 1.62;
      const sz = bj.z + Math.cos(a) * 1.62;
      add(makeChair(M, { x: sx, z: sz, rotY: a + Math.PI }));
      anchors.blackjackSeats.push({
        x: sx,
        z: sz,
        // The player's camera looks along (-sin yaw, -cos yaw)...
        yaw: Math.atan2(sx - bj.x, sz - bj.z),
        // ...while a model's face is its +z, so the two are half a turn apart.
        faceYaw: Math.atan2(bj.x - sx, bj.z - sz),
        seat: i,
      });
    }
    anchors.dealer = new THREE.Vector3(bj.x, 0, bj.z - 1.75);

    // Brass lamp low over the felt: the only pool of light in the corner
    add(cylinder({ r: 0.02, h: 1.3, pos: [bj.x, 3.05, bj.z], mat: M_BRASS }));
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.44, 0.32, 14, 1, true),
      mat({ color: 0x2a1c10, roughness: 0.7, side: THREE.DoubleSide }),
    );
    shade.position.set(bj.x, 2.3, bj.z);
    add(shade);
    add(cylinder({ r: 0.4, h: 0.03, pos: [bj.x, 2.16, bj.z], mat: lit(0xffd9a0, 2.2) }));
    const tableLight = new THREE.PointLight(0xffd9a0, 16, 7, 2);
    tableLight.position.set(bj.x, 2.05, bj.z);
    // A shadow-casting point light renders six shadow maps. In this dense
    // room that repeated every person and every chair six times per frame.
    // The overhead emissive shade and the moon still ground the table without
    // paying that cube-shadow cost.
    tableLight.castShadow = false;
    add(tableLight);

    add(sign(printed('min-bet', ['$25', 'MIN'], { w: 256, h: 200, bg: '#e8e0cc', fg: '#1a1a1a', font: '900 76px "Trebuchet MS", sans-serif' }),
      0.3, 0.24, { x: bj.x + 1.05, y: 1.15, z: bj.z + 1.0, rotY: -0.6 }));
    for (const sx of [-2.2, 2.2]) {
      add(cylinder({ r: 0.07, h: 0.95, pos: [bj.x + sx, 0.47, bj.z + 2.3], mat: M_BRASS }));
    }
  }

  /* ================================================================== */
  /* F. The slot alcove                                                  */
  /* ================================================================== */
  const slot = { x: 3.2, z: 8.6 };
  {
    wall(4.5, 6.4, 4.5, 9.4, 2.9, M_PANEL, 0.16);
    wall(1.9, 9.4, 4.58, 9.4, 2.9, M_PANEL, 0.16);
    anchors.slotStand = new THREE.Vector3(slot.x, 0, slot.z - 1.15);
    anchors.slotMachine = new THREE.Vector3(slot.x, 0, slot.z);
    const alcoveLight = new THREE.PointLight(0xb06aff, 9, 7, 2);
    alcoveLight.position.set(slot.x, 2.5, slot.z - 0.6);
    add(alcoveLight);
    anchors.slotLight = alcoveLight;
    solid(slot.x - 0.55, slot.z - 0.4, slot.x + 0.55, slot.z + 0.4, 0, 2.2);
  }

  /* ================================================================== */
  /* B. The floor: booths, tables, cameras                               */
  /* ================================================================== */
  {
    function booth(x, z, rotY, width = 2.4) {
      /* The cushion tops out at 0.52 -- chair height. It used to sit at 0.675,
       * which is bar-stool height, and everybody seated on one was folded for
       * a chair and sunk to the hips in the upholstery. */
      const g = group('booth',
        box({ size: [width, 0.28, 0.72], pos: [0, 0.38, 0], mat: M_LEATHER }),
        box({ size: [width, 1.2, 0.24], pos: [0, 0.92, -0.36], mat: M_LEATHER_DARK }),
        box({ size: [width, 0.36, 0.78], pos: [0, 0.18, 0], mat: M_DARKWOOD }),
      );
      for (let i = 0; i < Math.floor(width / 0.6); i++) {
        g.add(sphere({ r: 0.05, pos: [-width / 2 + 0.4 + i * 0.6, 1.06, -0.26], mat: M_BRASS }));
      }
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      add(g);
      return g;
    }
    function boothTable(x, z) {
      add(group('btable',
        box({ size: [1.2, 0.07, 0.9], pos: [x, 0.76, z], mat: M_BLACKGLOSS }),
        cylinder({ r: 0.06, h: 0.75, pos: [x, 0.38, z], mat: M_CHROME }),
        cylinder({ r: 0.28, h: 0.04, pos: [x, 0.03, z], mat: M_CHROME }),
      ));
      solid(x - 0.55, z - 0.4, x + 0.55, z + 0.4, 0, 0.8);
    }

    anchors.booths = [];
    /* The east run stops SHORT of the archway through to the back of house
     * (z 2.4..4.4): the old fifth booth's collider lay across the mouth of
     * it, which is the way to the bathroom. Four sit south of the arch and a
     * shorter fifth tucks north of it against the slot alcove, so the count
     * -- and everything seated on it -- is unchanged. */
    for (let i = 0; i < 4; i++) {
      const bz = -8.5 + i * 3.2;
      booth(4.55, bz, -Math.PI / 2);
      solid(4.05, bz - 1.25, 5.4, bz + 1.25, 0, 1.5);
      boothTable(3.25, bz);
      anchors.booths.push(new THREE.Vector3(4.2, 0, bz));
    }
    {
      const bz = 5.4;
      booth(4.55, bz, -Math.PI / 2, 1.8);
      solid(4.05, bz - 0.95, 5.4, bz + 0.95, 0, 1.5);
      boothTable(3.25, bz);
      anchors.booths.push(new THREE.Vector3(4.2, 0, bz));
    }
    // Shifted north against the wall so the blackjack corner stops
    // overlapping the booth tables.
    for (let i = 0; i < 4; i++) {
      const bx = -19.0 + i * 3.4;
      booth(bx, 11.0, Math.PI);
      solid(bx - 1.25, 10.55, bx + 1.25, 11.05, 0, 1.5);
      boothTable(bx, 9.85);
      anchors.booths.push(new THREE.Vector3(bx, 0, 10.4));
    }

    // Candlelit two-tops around the stage
    anchors.tables = [];
    const candles = [];
    for (const [tx, tz] of [
      [-16.5, -1.2], [-13.4, 1.05], [-9.6, -1.6], [-7.2, 1.8], [-16.2, 3.4],
      [-12.6, 3.8], [-9.0, 3.4], [-5.4, -3.6], [-4.6, 5.6], [-8.2, 7.2], [-16.9, 6.6],
    ]) {
      add(group('twotop',
        cylinder({ r: 0.42, h: 0.06, pos: [tx, 0.78, tz], mat: M_BLACKGLOSS }),
        cylinder({ r: 0.05, h: 0.76, pos: [tx, 0.39, tz], mat: M_CHROME }),
        cylinder({ r: 0.3, h: 0.04, pos: [tx, 0.03, tz], mat: M_CHROME }),
      ));
      solid(tx - 0.44, tz - 0.44, tx + 0.44, tz + 0.44, 0, 0.82);
      // The candle: a red glass with a small flame in it, not a strip light
      add(cylinder({ r: 0.045, h: 0.1, pos: [tx, 0.86, tz], mat: mat({ color: 0x6a1a1a, roughness: 0.3, transparent: true, opacity: 0.85, emissive: new THREE.Color(0x3a0a06), emissiveIntensity: 1.4 }) }));
      const flame = cylinder({ rTop: 0.004, rBottom: 0.016, h: 0.05, seg: 6, pos: [tx, 0.93, tz], mat: lit(0xffb060, 4.5) });
      add(flame);
      const cl = new THREE.PointLight(0xff8a4a, 2.2, 3.2, 2);
      cl.position.set(tx, 0.95, tz);
      add(cl);
      candles.push({ flame, light: cl, phase: rand(0, 6) });
      anchors.tables.push(new THREE.Vector3(tx, 0, tz));
      for (const off of [[-0.85, 0.2], [0.85, -0.2]]) {
        add(makeChair(M, { x: tx + off[0], z: tz + off[1], rotY: Math.atan2(-off[0], -off[1]) }));
      }
    }
    ticking.push((dt, t) => {
      for (const c of candles) {
        const f = 0.85 + Math.sin(t * 9 + c.phase) * 0.1 + Math.sin(t * 21 + c.phase) * 0.05;
        c.light.intensity = 2.2 * f;
        c.flame.scale.y = f;
      }
    });

    // Cameras that see everything and are recorded by nothing
    anchors.cameras = [];
    for (const [cx, cy, cz, ry] of [[5.1, 4.0, 9.3, Math.PI * 0.78], [-20.7, 4.0, 9.3, -Math.PI * 0.78], [5.1, 4.0, -10.5, Math.PI * 0.25]]) {
      const cam = group('cctv',
        box({ size: [0.12, 0.11, 0.26], pos: [0, 0, 0], mat: mat({ color: 0x26262e, roughness: 0.8 }) }),
        cylinder({ r: 0.05, h: 0.1, pos: [0, 0, 0.17], rotX: Math.PI / 2, mat: M_BLACKGLOSS }),
        box({ size: [0.06, 0.16, 0.06], pos: [0, 0.13, -0.06], mat: mat({ color: 0x26262e, roughness: 0.8 }) }),
      );
      const led = sphere({ r: 0.018, pos: [0.05, 0.04, 0.14], mat: lit(0xff2a2a, 3) });
      cam.add(led);
      cam.position.set(cx, cy, cz);
      cam.rotation.y = ry;
      add(cam);
      neon.push({ mesh: led, base: 3, next: rand(1, 3), on: true, kind: 'led' });
      anchors.cameras.push(new THREE.Vector3(cx, cy, cz));
    }

    // House lights: pockets of colour, dark between them
    for (const [lx, lz, col, power] of [
      [-16, 2, 0xff7a4a, 12], [-9, 3.5, 0xff7a4a, 12], [-2, 6, 0xb06aff, 12],
      [1.5, -2, 0xff4a7a, 12], [-4, -6, 0x9a5aff, 10], [3, 9, 0xff3d8b, 8],
    ]) {
      const l = new THREE.PointLight(col, power, 13, 2);
      l.position.set(lx, 3.9, lz);
      add(l);
    }
  }

  /* ================================================================== */
  /* G. The rear hallway                                                 */
  /* ================================================================== */
  {
    for (let i = 0; i < 4; i++) {
      const z = H.z0 + 2 + i * 3.4;
      const tube = box({ size: [0.18, 0.06, 1.2], pos: [6.7, CEIL_BACK - 0.1, z], mat: lit(0xd8f0d8, 2.0), cast: false });
      add(tube);
      const l = new THREE.PointLight(0xcfe8cf, 9, 7.5, 2);
      l.position.set(6.7, CEIL_BACK - 0.3, z);
      add(l);
      if (i === 2) neon.push({ mesh: tube, light: l, base: 6, next: rand(1, 4), on: true, kind: 'fluoro' });
    }

    for (let i = 0; i < 3; i++) {
      add(makeFrame(M, {
        x: 5.73, y: 1.62, z: -8.4 + i * 1.1, rotY: Math.PI / 2, w: 0.34, h: 0.44,
        texture: printed(`permit${i}`, ['LICENCE', 'TO SERVE', 'ESSEX CO.'], {
          w: 256, h: 320, bg: '#d8d0bc', fg: '#3a3020', font: '700 32px "Trebuchet MS", sans-serif',
        }),
      }));
    }
    // Fire extinguisher, junction box, and a cleaning cart permanently in the way
    add(group('ext',
      cylinder({ r: 0.08, h: 0.42, pos: [5.78, 0.95, -4.4], mat: mat({ color: 0xa02020, roughness: 0.5 }) }),
      cylinder({ r: 0.03, h: 0.08, pos: [5.78, 1.2, -4.4], mat: M_STEEL }),
    ));
    add(box({ size: [0.1, 0.42, 0.34], pos: [5.72, 1.7, -1.2], mat: mat({ color: 0x44444c, roughness: 0.8 }) }));
    add(group('cart',
      box({ size: [0.5, 0.7, 0.7], pos: [0, 0.35, 0], mat: mat({ color: 0x7a7a2e, roughness: 0.9 }) }),
      cylinder({ r: 0.16, h: 0.5, pos: [0, 0.55, 0.42], mat: mat({ color: 0x2a4a6a, roughness: 0.9 }) }),
      cylinder({ r: 0.02, h: 1.4, pos: [0.1, 1.0, 0.42], mat: M_WOOD }),
    )).position.set(7.2, 0, 2.0);
    solid(6.9, 1.6, 7.6, 2.5, 0, 1.1);

    add(box({ size: [0.3, 0.62, 0.22], pos: [6.7, 1.5, 4.3], mat: mat({ color: 0x26262e, roughness: 0.8 }) }));
    add(makeChair(M, { x: 7.25, z: -7.9, rotY: -Math.PI / 2 }));
    anchors.hallGuard = new THREE.Vector3(7.15, 0, -7.7);
    anchors.hallMouth = new THREE.Vector3(6.7, 0, 3.6);
    anchors.louDoor = new THREE.Vector3(7.05, 0, -7.05);

    // On the jamb beside each door, not floating on the leaf itself -- and on
    // the hallway FACE of the wall (x 7.71), not embedded in its thickness.
    for (const [lz, label] of [[-3.8, 'MANAGER'], [3.4, 'LADIES']]) {
      add(sign(printed(`plate-${label}`, [label], { w: 256, h: 80, bg: '#26262e', fg: '#c8c8d0', font: '800 42px "Trebuchet MS", sans-serif' }),
        0.36, 0.11, { x: 7.7, y: 1.85, z: lz + 0.75, rotY: -Math.PI / 2 }));
    }

    /* The family's marks, hung like they matter: the gilt crest and its pink
     * sister flank the club doors on the main room's front wall, and the club
     * mark hangs in the back hallway. All three are seated on the faces of
     * the walls that carry them -- the crest pair used to sit at x 10.94,
     * which is inside the sealed room behind the manager's door, and the
     * hallway mark was buried in the wall's own thickness. */
    const crestTex = squatchArt('crest', {
      title: ['THE SILVER', 'SASQUATCHES'], footer: 'EST. 1979',
    });
    add(makeFrame(M, {
      x: -2.9, y: 1.95, z: 10.7645, rotY: Math.PI, w: 0.72, h: 0.9,
      texture: crestTex, tint: 0x6a4e1c,
    }));
    add(makeFrame(M, {
      x: 2.9, y: 1.9, z: 10.7645, rotY: Math.PI, w: 0.66, h: 0.5,
      texture: squatchArt('logo-bing-family', {
        title: ['BADA BING'], footer: 'A FAMILY PLACE',
        ink: '#ff5aa0', bg: '#241018', w: 512, h: 384,
      }),
      tint: 0x6a4e1c,
    }));
    add(makeFrame(M, {
      x: 7.6745, y: 1.85, z: -2.3, rotY: -Math.PI / 2, w: 0.5, h: 0.62,
      texture: printed('logo-club-mark', ['SS', 'MC', 'RIDE SILVER'], {
        w: 384, h: 480, bg: '#141018', fg: '#b8b8c4', font: '800 58px "Trebuchet MS", sans-serif',
      }),
      tint: 0x2a2a32,
    }));
  }

  /* ================================================================== */
  /* H. The men's room                                                   */
  /* ================================================================== */
  {
    const bx = (B.x0 + B.x1) / 2;
    /* ---- the basins ----
     * They were a slab and a stick. A basin is a rolled rim with a bowl
     * dropped through it, a splashback up the tile, two taps and a spout,
     * brackets under the front edge and a bottle trap you can see. */
    const porcelain = mat({ color: 0xdfe2e6, roughness: 0.24 });
    for (const sz of [-0.6, 0.2]) {
      const bx = B.x1 - 0.32;
      const basin = group('basin',
        // Rim, splashback, and the apron under the front lip
        box({ size: [0.5, 0.07, 0.44], pos: [0, 0.86, 0], mat: porcelain }),
        box({ size: [0.12, 0.26, 0.44], pos: [0.19, 0.96, 0], mat: porcelain }),
        box({ size: [0.44, 0.06, 0.4], pos: [-0.02, 0.815, 0], mat: porcelain }),
      );
      // The bowl itself: open, so it is a basin and not a shelf
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.155, 0.1, 0.13, 20, 1, true),
        porcelain,
      );
      bowl.position.set(-0.03, 0.815, 0);
      bowl.scale.z = 0.92;
      basin.add(bowl);
      basin.add(cylinder({ r: 0.1, h: 0.012, pos: [-0.03, 0.755, 0], mat: porcelain }));
      basin.add(cylinder({ r: 0.022, h: 0.012, pos: [-0.03, 0.762, 0], mat: mat({ color: 0x3a3a42, roughness: 0.5 }) }));
      // Spout and two cross-head taps
      basin.add(cylinder({ r: 0.018, h: 0.12, pos: [0.11, 0.93, 0], mat: M_CHROME }));
      basin.add(cylinder({ r: 0.016, h: 0.1, pos: [0.06, 0.985, 0], rotZ: Math.PI / 2, mat: M_CHROME }));
      for (const tz of [-0.12, 0.12]) {
        basin.add(cylinder({ r: 0.018, h: 0.05, pos: [0.13, 0.905, tz], mat: M_CHROME }));
        basin.add(box({ size: [0.012, 0.012, 0.07], pos: [0.13, 0.932, tz], mat: M_CHROME }));
        basin.add(box({ size: [0.05, 0.012, 0.012], pos: [0.13, 0.932, tz], mat: M_CHROME }));
      }
      // Bottle trap and the brackets carrying the front of the slab
      basin.add(cylinder({ r: 0.026, h: 0.16, pos: [-0.03, 0.68, 0], mat: M_CHROME }));
      basin.add(cylinder({ r: 0.034, h: 0.09, pos: [-0.03, 0.6, 0], mat: M_CHROME }));
      basin.add(cylinder({ r: 0.022, h: 0.2, pos: [0.08, 0.6, 0], rotZ: Math.PI / 2, mat: M_CHROME }));
      for (const kz of [-0.19, 0.19]) {
        const bracket = box({ size: [0.2, 0.03, 0.03], pos: [0.06, 0.75, kz], mat: M_STEEL });
        bracket.rotation.z = -0.5;
        basin.add(bracket);
      }
      basin.position.set(bx, 0, sz);
      add(basin);
    }
    // Soap on the wall between the two of them, and the paper towels below it
    add(box({ size: [0.1, 0.18, 0.12], pos: [B.x1 - 0.12, 1.12, -0.2], mat: mat({ color: 0x2e3238, roughness: 0.6 }) }));
    add(cylinder({ r: 0.012, h: 0.05, pos: [B.x1 - 0.14, 1.01, -0.2], rotZ: Math.PI / 2, mat: M_CHROME }));
    solid(B.x1 - 0.55, -0.85, B.x1 - 0.05, 0.45, 0, 0.95);
    anchors.mirror = new THREE.Vector3(B.x1 - 1.0, 0, -0.2);
    const mirror = box({ size: [0.04, 0.85, 1.5], pos: [B.x1 - 0.08, 1.6, -0.2], mat: mat({ color: 0x3a3a44, roughness: 0.08, metalness: 0.95 }) });
    add(mirror);
    // The crack across it, drawn as a thin dark quad rather than faked in a map
    add(box({ size: [0.01, 0.9, 0.02], pos: [B.x1 - 0.1, 1.6, -0.3], mat: mat({ color: 0x14141a, roughness: 1 }), rotX: 0.3 }));

    /* ---- the urinals ----
     * Two full-height bowls with rolled lips, a sparge pipe up to the flush
     * valve, a waste at the bottom and a modesty divider between them. The
     * left-hand lip is where somebody has left a line of something white;
     * main.js registers it. */
    const urinals = [];
    for (const sz of [1.5, 2.1]) {
      const ux = B.x1 - 0.26;
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.13, 0.5, 18, 1, true, Math.PI * 0.35, Math.PI * 1.3),
        porcelain,
      );
      bowl.position.set(0.03, 0.85, 0);
      // Wide enough to read as a bowl from the door rather than as a pipe.
      bowl.scale.set(1.18, 1, 1.1);
      const u = group('urinal',
        bowl,
        // Back plate against the tile, rolled lip, and the sump
        box({ size: [0.09, 0.78, 0.4], pos: [0.11, 0.82, 0], mat: porcelain }),
        cylinder({ r: 0.23, h: 0.06, pos: [0.03, 1.09, 0], mat: porcelain }),
        cylinder({ r: 0.15, h: 0.08, pos: [0.03, 0.6, 0], mat: porcelain }),
        cylinder({ r: 0.045, h: 0.06, pos: [0.03, 0.57, 0], mat: mat({ color: 0x3a3a42, roughness: 0.5 }) }),
        // Sparge pipe and the flush valve above it
        cylinder({ r: 0.017, h: 0.42, pos: [0.09, 1.34, 0], mat: M_CHROME }),
        box({ size: [0.1, 0.14, 0.1], pos: [0.09, 1.6, 0], mat: M_CHROME }),
        cylinder({ r: 0.014, h: 0.07, pos: [0.03, 1.53, 0], rotZ: Math.PI / 2, mat: M_CHROME }),
        // Waste, down to the floor
        cylinder({ r: 0.03, h: 0.5, pos: [0.03, 0.3, 0], mat: M_CHROME }),
      );
      u.position.set(ux, 0, sz);
      u.rotation.y = -Math.PI / 2;
      add(u);
      urinals.push(u);
      // The blue cube in the bottom of it, which is somehow always there
      add(box({ size: [0.05, 0.03, 0.05], pos: [ux - 0.03, 0.63, sz], mat: mat({ color: 0x3a7bd9, roughness: 0.8 }) }));
    }
    anchors.urinal = new THREE.Vector3(B.x1 - 0.42, 1.12, 1.5);
    // Modesty divider between the two of them
    add(box({ size: [0.42, 0.72, 0.04], pos: [B.x1 - 0.28, 1.02, 1.8], mat: mat({ color: 0x25302f, roughness: 0.8 }) }));
    /* The line on the left-hand lip. Somebody's evening, left where they
     * put it down. main.js makes it usable. */
    const powder = group('bathroom-powder',
      box({ size: [0.005, 0.006, 0.16], pos: [0, 0, 0], mat: mat({ color: 0xf4f4f8, roughness: 0.95 }) }),
      box({ size: [0.09, 0.001, 0.05], pos: [0.03, -0.004, 0.02], rotY: 0.3, mat: mat({ color: 0xe4e4ea, roughness: 1 }) }),
    );
    powder.position.set(B.x1 - 0.31, 1.122, 1.5);
    powder.rotation.y = 0.12;
    add(powder);
    anchors.powder = new THREE.Vector3(B.x1 - 0.31, 1.12, 1.5);
    anchors.stalls = [];
    for (let i = 0; i < 3; i++) {
      const sx = B.x0 + 1.0 + i * 1.2;
      add(box({ size: [0.06, 1.9, 1.5], pos: [sx - 0.6, 1.0, B.z0 + 0.9], mat: mat({ color: 0x25302f, roughness: 0.8 }) }));
      const pivot = new THREE.Group();
      pivot.position.set(sx - 0.6, 0, B.z0 + 1.65);
      const leaf = box({ size: [1.1, 1.7, 0.05], pos: [0.55, 1.05, 0], mat: mat({ color: 0x25302f, roughness: 0.8 }) });
      pivot.add(leaf);
      add(pivot);
      /* A real close-coupled toilet -- pedestal, bowl, water sitting in it,
       * seat, cistern -- the same suite the flat has, instead of the plain
       * porcelain block that stood in for one. Cistern backed to the wall. */
      add(makeToilet(M, { x: sx, z: B.z0 + 0.5, rotY: 0 }));
      anchors.stalls.push({ pivot, locked: i === 2, x: sx, z: B.z0 + 1.9, index: i });
      if (i === 1) {
        // The lost membership card, exactly where the stall line says it is
        add(box({ size: [0.09, 0.006, 0.055], pos: [sx + 0.06, 0.842, B.z0 + 0.2], rotY: 0.4, mat: mat({ color: 0xe8e2d0, roughness: 0.85 }) }));
      }
    }
    /* The run closes with one more divider. It was at B.x0 + 3.4 = 11.3,
     * which is the centre line of the THIRD stall -- so the panel that was
     * supposed to close the row stood inside the locked stall's toilet.
     * The dividers go at sx - 0.6, so the closing one goes at the last
     * sx + 0.6, and the block collider follows it out. */
    solid(B.x0 + 0.3, B.z0 + 0.1, B.x0 + 4.05, B.z0 + 1.6, 0, 2.0);
    add(box({ size: [0.06, 1.9, 1.5], pos: [B.x0 + 4.0, 1.0, B.z0 + 0.9], mat: mat({ color: 0x25302f, roughness: 0.8 }) }));

    const tube = box({ size: [1.6, 0.07, 0.15], pos: [bx, CEIL_BACK - 0.1, 0.6], mat: lit(0xd8f0e8, 2.0), cast: false });
    add(tube);
    const bl = new THREE.PointLight(0xd0e8e0, 10, 9, 2);
    bl.position.set(bx, CEIL_BACK - 0.3, 0.6);
    add(bl);
    neon.push({ mesh: tube, light: bl, base: 7, next: rand(0.5, 2), on: true, kind: 'fluoro' });

    /* The wall Booski signed.
     *
     * It was 1.8 m wide centred at z 2.55, on a stretch of wall that runs
     * from the door head at 1.5 to the room's north wall at 2.7 -- so it
     * overshot the room by three quarters of a metre at one end and the hand
     * dryer sat on top of it at the other. It is sized to the wall it is
     * painted on now and shifted right, away from the dryer's old spot and
     * still clear of the doorway gap (z -0.1..1.5). */
    add(sign(printed('graffiti', [
      'FOR A GOOD TIME, ASK LOU', 'THE DUCK GUY OWES ME', 'BOOSKI WAS HERE',
      'APE IS A CHEAT', 'SHUBES CRIED',
    ], { w: 512, h: 384, bg: '#2a2a32', fg: '#8a8a96', font: '700 30px "Trebuchet MS", sans-serif' }),
    1.06, 0.8, { x: B.x0 - 0.005, y: 1.52, z: 2.11, rotY: Math.PI / 2 }));
    anchors.graffiti = new THREE.Vector3(B.x0 + 0.95, 0, 2.11);

    add(box({ size: [0.06, 0.55, 0.85], pos: [B.x1 - 0.04, 1.95, 2.2], mat: lit(0x5a6a7a, 0.5) }));
    const vent = box({ size: [0.52, 0.06, 0.42], pos: [B.x0 + 1.3, CEIL_BACK - 0.05, B.z0 + 0.45], mat: M_STEEL });
    add(vent);
    anchors.vent = new THREE.Vector3(B.x0 + 1.3, 0, B.z0 + 1.0);
    /* The hand dryer, moved off the graffiti and down the wall to where a
     * hand dryer belongs: on the sink run, between the two basins, at the
     * height a hand comes up to. */
    add(group('hand-dryer',
      box({ size: [0.22, 0.34, 0.28], pos: [B.x1 - 0.19, 1.28, 0.75], mat: mat({ color: 0xc4c6cc, roughness: 0.38, metalness: 0.3 }) }),
      box({ size: [0.06, 0.3, 0.24], pos: [B.x1 - 0.06, 1.28, 0.75], mat: mat({ color: 0x8e9098, roughness: 0.5 }) }),
      // Nozzle underneath, and the little red lamp above it
      box({ size: [0.13, 0.05, 0.11], pos: [B.x1 - 0.24, 1.11, 0.75], mat: mat({ color: 0x8e9098, roughness: 0.5 }) }),
      sphere({ r: 0.012, pos: [B.x1 - 0.29, 1.38, 0.75], mat: lit(0xd92e2e, 1.6) }),
    ));
  }

  /* ================================================================== */
  /* I. Storage and service                                              */
  /* ================================================================== */
  const storeroom = {};
  {
    /* Kegs in their corner, shifted a hand north of where they were: the old
     * grid's nearest keg stood inside the service door's swing. */
    for (let i = 0; i < 6; i++) {
      const kx = S.x0 + 1.0 + (i % 3) * 0.72;
      const kz = S.z0 + 1.4 + Math.floor(i / 3) * 0.72;
      add(group('keg',
        cylinder({ r: 0.24, h: 0.62, pos: [kx, 0.31, kz], mat: M_STEEL }),
        cylinder({ r: 0.2, h: 0.07, pos: [kx, 0.66, kz], mat: M_STEEL }),
      ));
    }
    solid(S.x0 + 0.6, S.z0 + 1.0, S.x0 + 2.9, S.z0 + 2.6, 0, 0.7);

    /* Crates stacked the way a porter stacks them, not rolled by dice. The
     * old pass scattered twelve random boxes that overlapped each other and,
     * on a bad seed, the freezer -- exactly the mess the owner flagged. Each
     * cluster is authored, separated, and solid. */
    const crate = (x, z, s, rotY = 0, y = 0, shade = 0x7a5c38) =>
      add(box({ size: [s, s * 0.8, s * 0.9], pos: [x, y + s * 0.4, z], rotY, mat: mat({ color: shade, roughness: 0.95 }) }));
    // The double stack against the south wall, clear of the service door
    crate(10.1, -13.75, 0.62, 0.06);
    crate(10.78, -13.7, 0.56, -0.1, 0, 0x8a6a42);
    crate(10.42, -13.72, 0.5, 0.22, 0.5, 0x6b4f30);
    solid(9.75, -14.1, 11.1, -13.35, 0, 1.0);
    // Singles: one by the shelf run, one dumped mid-floor on its way somewhere
    crate(12.2, -14.35, 0.55, -0.18, 0, 0x8a6a42);
    solid(11.9, -14.65, 12.5, -14.05, 0, 0.5);
    crate(9.2, -11.3, 0.48, 0.35, 0, 0x6b4f30);
    solid(8.95, -11.55, 9.45, -11.05, 0, 0.45);
    // The mop sink was the one fixture in here you could walk through
    solid(S.x0 + 0.4, S.z1 - 1.28, S.x0 + 1.02, S.z1 - 0.73, 0, 0.66);

    /* ---- the easter egg ----
     * The delivery manifest has read "DUCK ..... ?" since the room was
     * built, and a patron out front swears somebody paid four hundred for
     * one. Here it is: a crate stencilled DUCK by the freezer, lid ajar,
     * with one rubber duck in the straw. main.js wires the interaction. */
    const duckCrate = group('duck-crate');
    duckCrate.position.set(11.3, 0, -10.95);
    duckCrate.rotation.y = -0.28;
    duckCrate.add(box({ size: [0.6, 0.46, 0.55], pos: [0, 0.23, 0], mat: mat({ color: 0x7a5c38, roughness: 0.95 }) }));
    const stencil = sign(printed('duck-stencil', ['DUCK'], {
      w: 256, h: 128, bg: null, fg: '#2a1c10', font: '900 64px "Trebuchet MS", sans-serif', rotate: -0.05,
    }), 0.5, 0.25, { x: 0, y: 0.26, z: 0.281 });
    stencil.material.transparent = true;
    duckCrate.add(stencil);
    const duckLid = box({ size: [0.62, 0.04, 0.57], pos: [0.1, 0.49, -0.05], rotZ: 0.16, mat: mat({ color: 0x6b4f30, roughness: 0.95 }) });
    duckCrate.add(duckLid);
    const straw = box({ size: [0.52, 0.05, 0.47], pos: [0, 0.4, 0], mat: mat({ color: 0xb89a52, roughness: 1 }) });
    duckCrate.add(straw);
    const duck = group('the-duck',
      sphere({ r: 0.075, ry: 0.06, rz: 0.082, pos: [0, 0.46, 0], mat: mat({ color: 0xe8c020, roughness: 0.55 }) }),
      sphere({ r: 0.044, pos: [0, 0.54, 0.05], mat: mat({ color: 0xe8c020, roughness: 0.55 }) }),
      box({ size: [0.032, 0.018, 0.05], pos: [0, 0.53, 0.1], mat: mat({ color: 0xd97a2e, roughness: 0.5 }) }),
    );
    duck.visible = false;
    duckCrate.add(duck);
    add(duckCrate);
    solid(10.95, -11.3, 11.65, -10.6, 0, 0.55);
    storeroom.crate = duckCrate;
    storeroom.lid = duckLid;
    storeroom.duck = duck;
    for (let s = 0; s < 3; s++) {
      add(box({ size: [0.62, 0.06, 4.4], pos: [S.x1 - 0.42, 0.55 + s * 0.7, S.z0 + 2.7], mat: M_STEEL }));
    }
    solid(S.x1 - 0.75, S.z0 + 0.5, S.x1 - 0.1, S.z0 + 4.9, 0, 2.0);
    add(box({ size: [0.95, 1.75, 0.8], pos: [S.x1 - 1.1, 0.87, S.z1 - 1.3], mat: mat({ color: 0xc0c0c6, roughness: 0.5 }) }));
    solid(S.x1 - 1.6, S.z1 - 1.75, S.x1 - 0.6, S.z1 - 0.85, 0, 1.8);
    add(box({ size: [0.62, 0.5, 0.5], pos: [S.x0 + 0.7, 0.4, S.z1 - 1.0], mat: M_STEEL }));
    add(box({ size: [0.42, 0.9, 0.3], pos: [S.x0 + 4.9, 1.3, S.z0 + 0.2], mat: mat({ color: 0x2e2e36, roughness: 0.8 }) }));
    // A broken sign that used to say something
    add(sign(neonText('broken-bin', 'BIN', { font: '900 130px "Trebuchet MS", sans-serif' }), 1.3, 0.4,
      { x: S.x0 + 5.6, y: 1.5, z: S.z0 + 0.25, emissive: 0x2a2a30, intensity: 0.3 })).rotation.z = 0.35;

    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xcfe8cf, 7, 10, 2);
      l.position.set(S.x0 + 2.6 + i * 4.6, CEIL_BACK - 0.3, (S.z0 + S.z1) / 2);
      add(l);
      add(box({ size: [1.2, 0.06, 0.15], pos: [S.x0 + 2.6 + i * 4.6, CEIL_BACK - 0.1, (S.z0 + S.z1) / 2], mat: lit(0xd8f0d8, 1.6), cast: false }));
    }

    /* ---- the thing behind the crates ----
     * Somebody's Tuesday went badly. He is face-down between the crate run
     * and the freezer with a tarpaulin thrown over most of him -- boots, one
     * hand and a spreading stain are what you actually see, and you only see
     * those if you come round the stack, which nobody has any reason to do.
     * main.js gives it a line. Nothing here is a jump scare; it is a fact
     * about the room, and the room is quieter for it. */
    {
      const bx = 12.15;
      const bz = -12.9;
      const tarpMat = mat({ color: 0x2a3a34, roughness: 0.98 });
      const body = group('back-room-body');
      body.position.set(bx, 0, bz);
      body.rotation.y = -0.42;
      // The shape under the tarp: shoulders high, hips lower, one arm out
      body.add(box({ size: [0.62, 0.3, 1.15], pos: [0, 0.15, -0.1], mat: tarpMat }));
      body.add(box({ size: [0.52, 0.22, 0.5], pos: [0.02, 0.11, 0.6], mat: tarpMat }));
      const fold = box({ size: [0.7, 0.04, 0.5], pos: [-0.02, 0.29, 0.28], mat: tarpMat });
      fold.rotation.x = 0.12;
      body.add(fold);
      // What the tarp does not cover
      for (const sx of [-0.14, 0.14]) {
        body.add(box({ size: [0.15, 0.16, 0.26], pos: [sx, 0.08, 0.99], mat: mat({ color: 0x14141a, roughness: 0.55 }) }));
        body.add(box({ size: [0.13, 0.1, 0.14], pos: [sx, 0.05, 1.16], mat: mat({ color: 0x14141a, roughness: 0.5 }) }));
      }
      body.add(box({ size: [0.34, 0.12, 0.13], pos: [-0.4, 0.06, -0.36], rotY: 0.5, mat: mat({ color: 0x2a2a32, roughness: 0.9 }) }));
      body.add(box({ size: [0.1, 0.05, 0.16], pos: [-0.6, 0.025, -0.5], rotY: 0.5, mat: mat({ color: 0xc99a72, roughness: 0.85 }) }));
      // What has run out from under it, soaking into the grout
      const stain = new THREE.Mesh(
        new THREE.CircleGeometry(0.52, 18),
        mat({ color: 0x2e0709, roughness: 1 }),
      );
      stain.rotation.x = -Math.PI / 2;
      stain.position.set(-0.28, 0.006, -0.22);
      stain.scale.set(1, 0.72, 1);
      stain.castShadow = false;
      body.add(stain);
      const stain2 = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), mat({ color: 0x1e0406, roughness: 1 }));
      stain2.rotation.x = -Math.PI / 2;
      stain2.position.set(-0.72, 0.005, -0.05);
      stain2.castShadow = false;
      body.add(stain2);
      add(body);
      storeroom.body = body;
      anchors.body = new THREE.Vector3(bx, 0.3, bz);
      solid(bx - 0.5, bz - 0.75, bx + 0.5, bz + 0.85, 0, 0.4);
    }

    add(sign(printed('manifest', ['DELIVERY MANIFEST', 'KEGS ..... 6', 'LIQUOR ... 4', 'DUCK ..... ?'], {
      w: 320, h: 400, bg: '#e8e2d0', fg: '#2a2a2a', font: '700 30px "Trebuchet MS", sans-serif',
    }), 0.32, 0.4, { x: 8.2, y: 1.5, z: S.z0 + 0.12 }));
    anchors.manifest = new THREE.Vector3(8.2, 0, S.z0 + 0.8);
    anchors.serviceDoor = new THREE.Vector3(9.05, 0, -14.2);
    // The alarm box above the service door, with a light that is definitely on
    add(box({ size: [0.26, 0.2, 0.12], pos: [9.05, 2.35, S.z0 + 0.2], mat: mat({ color: 0xd8d8dc, roughness: 0.6 }) }));
    const alarmLed = sphere({ r: 0.025, pos: [9.05, 2.35, S.z0 + 0.3], mat: lit(0x2aff5a, 3) });
    add(alarmLed);
    anchors.alarmLed = alarmLed;
  }

  /* ================================================================== */
  /* Lou's back office                                                   */
  /* ================================================================== */
  const office = {};
  {
    const ox = (O.x0 + O.x1) / 2;
    const oz = (O.z0 + O.z1) / 2;
    for (const [wx, wz, w, d] of [[ox, O.z0 + 0.09, O.x1 - O.x0, 0.07], [ox, O.z1 - 0.09, O.x1 - O.x0, 0.07], [O.x1 - 0.09, oz, 0.07, O.z1 - O.z0]]) {
      add(box({ size: [w, 1.1, d], pos: [wx, 0.55, wz], mat: M_WOOD }));
    }

    /* ---- the office's real wall planes ----
     * Every fixture in here is placed against one of these rather than by eye.
     * The dado above stands 3.5cm proud of the plaster it is nailed to, so the
     * face a cabinet actually touches on the north and east walls is the
     * DADO's, not the wall's; the west side is the hallway partition, which
     * has no dado in here and shows its bare face at 7.89.
     *   north (z0): -9.375   south (z1): -4.625   east (x1): 13.775
     *   west  (x0): hallway wall's office face, 7.89 */
    const WALLS = {
      north: O.z0 + 0.125,
      south: O.z1 - 0.125,
      east: O.x1 - 0.125,
      west: 7.89,
    };
    office.walls = WALLS;

    /* The filing corner: the cabinet hard into the north-west corner with its
     * back on the north dado, the standard lamp beside it, and the house crest
     * on the wall above it. All three are derived from one pair of numbers so
     * they cannot drift apart again. */
    const filingX = WALLS.west + 0.325;      // 0.31 half-width + 1.5cm off the wall
    const filingZ = WALLS.north + 0.275;     // 0.26 half-depth + 1.5cm off the dado

    // The desk: heavy, wooden, and covered in the evening's paperwork
    const dx = ox + 0.4;
    const dz = O.z0 + 1.6;
    add(group('desk',
      box({ size: [2.1, 0.09, 1.05], pos: [dx, 0.76, dz], mat: M_WOOD }),
      box({ size: [0.72, 0.72, 0.95], pos: [dx - 0.62, 0.38, dz], mat: M_DARKWOOD }),
      box({ size: [0.72, 0.72, 0.95], pos: [dx + 0.62, 0.38, dz], mat: M_DARKWOOD }),
      box({ size: [2.14, 0.02, 1.1], pos: [dx, 0.81, dz], mat: M_LEATHER_DARK }),
    ));
    for (let i = 0; i < 3; i++) {
      add(box({ size: [0.62, 0.16, 0.03], pos: [dx + 0.62, 0.62 - i * 0.2, dz + 0.49], mat: M_WOOD }));
      add(cylinder({ r: 0.02, h: 0.16, pos: [dx + 0.62, 0.62 - i * 0.2, dz + 0.52], rotZ: Math.PI / 2, mat: M_BRASS }));
    }
    solid(dx - 1.1, dz - 0.6, dx + 1.1, dz + 0.6, 0, 0.85);
    anchors.desk = new THREE.Vector3(dx, 0, dz);
    anchors.deskFront = new THREE.Vector3(dx, 0, dz + 1.35);
    anchors.louSeat = new THREE.Vector3(dx, 0, dz - 0.85);
    anchors.visitorSeat = { x: dx - 0.45, z: dz + 1.5, yaw: 0 };

    // Lou's chair, and two for whoever he is making wait
    add(group('lou-chair',
      box({ size: [0.62, 0.12, 0.6], pos: [dx, 0.48, dz - 0.9], mat: M_LEATHER_DARK }),
      box({ size: [0.62, 0.95, 0.14], pos: [dx, 1.0, dz - 1.18], mat: M_LEATHER_DARK }),
      cylinder({ r: 0.05, h: 0.42, pos: [dx, 0.24, dz - 0.9], mat: mat({ color: 0x18181e, roughness: 0.6 }) }),
    ));
    add(makeChair(M, { x: dx - 0.45, z: dz + 1.5, rotY: Math.PI }));
    add(makeChair(M, { x: dx + 0.75, z: dz + 1.5, rotY: Math.PI }));

    // The lamp: the warm pool of light Lou lives in
    add(group('lamp',
      cylinder({ r: 0.11, h: 0.03, pos: [dx + 0.78, 0.83, dz - 0.2], mat: M_BRASS }),
      cylinder({ r: 0.02, h: 0.3, pos: [dx + 0.78, 0.97, dz - 0.2], mat: M_BRASS }),
    ));
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.17, 0.2, 14, 1, true),
      /* The shade is CLOTH with a bulb behind it, and cloth does not glow
       * white. It read at 0.6 emissive over a seventeen-unit point light,
       * which put the whole corner of the office past the bloom threshold
       * and smeared a halo across half the frame -- the owner's "way too
       * hot". A quarter of the glow over half the light is the same warm
       * pool with nothing clipping in it; tools/verify-bing.mjs measures the
       * clipped-white percentage off a real render and holds it there. */
      mat({ color: 0xd9a24a, roughness: 0.8, side: THREE.DoubleSide, emissive: new THREE.Color(0xd9a24a), emissiveIntensity: 0.22 }),
    );
    shade.position.set(dx + 0.78, 1.2, dz - 0.2);
    add(shade);
    const deskLight = new THREE.PointLight(0xffb870, 8, 6.2, 2);
    deskLight.position.set(dx + 0.78, 1.25, dz - 0.2);
    // As at the blackjack table, the warm pool matters more than a six-face
    // point-light shadow map in an already shadowed office.
    deskLight.castShadow = false;
    add(deskLight);
    const officeFill = new THREE.PointLight(0xffa060, 6.5, 9, 2);
    officeFill.position.set(ox, CEIL_BACK - 0.4, oz + 0.6);
    add(officeFill);
    office.deskLight = deskLight;

    // The ledger he has been staring at, the receipts, the envelopes
    const ledger = box({ size: [0.44, 0.05, 0.34], pos: [dx - 0.1, 0.84, dz - 0.1], mat: mat({ color: 0x2a1a30, roughness: 0.8 }) });
    add(ledger);
    office.ledger = ledger;
    for (let i = 0; i < 3; i++) {
      add(box({ size: [0.2, 0.02 + i * 0.01, 0.28], pos: [dx - 0.5 + rand(-0.03, 0.03), 0.83 + i * 0.02, dz + 0.2], mat: mat({ color: 0xe8e2d0, roughness: 1 }) }));
    }
    for (let i = 0; i < 2; i++) {
      add(box({ size: [0.24, 0.03, 0.15], pos: [dx - 0.72, 0.83 + i * 0.03, dz - 0.35], mat: mat({ color: 0xd8cfae, roughness: 1 }) }));
    }
    add(makeAshtray(M, { x: dx + 0.5, y: 0.82, z: dz + 0.3 }));
    add(makeCigarettePack(M, { x: dx + 0.3, y: 0.82, z: dz + 0.42, rotY: 0.4 }));
    // Bada Bing mug, and a bowl of the wrapped sweets nobody ever takes
    add(cylinder({ r: 0.045, h: 0.1, pos: [dx + 0.28, 0.87, dz - 0.3], mat: mat({ color: 0x6a2a3a, roughness: 0.5 }) }));
    const bowl = sphere({ r: 0.11, ry: 0.055, pos: [dx - 0.85, 0.85, dz - 0.05], mat: mat({ color: 0x8a6a3a, roughness: 0.5 }) });
    add(bowl);
    for (let i = 0; i < 7; i++) {
      add(sphere({ r: 0.022, pos: [dx - 0.85 + rand(-0.06, 0.06), 0.9, dz - 0.05 + rand(-0.05, 0.05)], mat: mat({ color: pick([0xd92e2e, 0xe8c04a, 0x3a7bd9]), roughness: 0.4 }) }));
    }
    anchors.candy = new THREE.Vector3(dx - 0.85, 0.9, dz - 0.05);
    add(group('deskphone',
      box({ size: [0.26, 0.06, 0.19], pos: [dx + 0.88, 0.85, dz + 0.1], mat: mat({ color: 0x1a1a20, roughness: 0.6 }) }),
      box({ size: [0.28, 0.055, 0.07], pos: [dx + 0.88, 0.91, dz + 0.02], mat: mat({ color: 0x1a1a20, roughness: 0.6 }) }),
    ));

    /* The package, wrapped in cloth, on the desk once Lou puts it there.
     * It gets its own light: a low, dark red ember that breathes, nothing
     * like the honest amber of the desk lamp -- the one thing on the desk
     * the room's warmth refuses to touch. Subtle on purpose: the player
     * should feel drawn to it before he can say why. */
    const revolver = makeRevolver(M, { x: 0, y: 0, z: 0, rotY: 0.4 }).group;
    const wrapMat = mat({
      color: 0x1c1c22, roughness: 0.98, unique: true,
      emissive: new THREE.Color(0x3a0a08), emissiveIntensity: 0.16,
    });
    const wrap = box({ size: [0.34, 0.1, 0.22], pos: [0, 0.05, 0], mat: wrapMat });
    const parcel = group('parcel', wrap, revolver);
    revolver.position.set(0, 0.02, 0);
    revolver.visible = false;
    parcel.position.set(dx + 0.05, 0.83, dz + 0.36);
    parcel.visible = false;
    add(parcel);
    const parcelLight = new THREE.PointLight(0x8a1414, 0, 1.7, 2);
    parcelLight.position.set(dx + 0.05, 1.06, dz + 0.36);
    add(parcelLight);
    ticking.push((dt, t) => {
      if (!parcel.visible) {
        parcelLight.intensity = 0;
        return;
      }
      const breathe = 0.5 + Math.sin(t * 1.3) * 0.5;   // slow, like something asleep
      parcelLight.intensity = 0.9 + breathe * 0.9;
      wrapMat.emissiveIntensity = 0.12 + breathe * 0.18;
    });
    office.parcel = parcel;
    office.parcelCloth = wrap;
    office.parcelGun = revolver;
    office.parcelLight = parcelLight;
    anchors.parcel = new THREE.Vector3(dx + 0.05, 0.9, dz + 0.36);

    // The envelope with the restaurant in it
    const envelope = box({ size: [0.26, 0.02, 0.17], pos: [dx - 0.35, 0.84, dz + 0.45], mat: mat({ color: 0xd8cfae, roughness: 1 }) });
    envelope.visible = false;
    add(envelope);
    office.envelope = envelope;

    // Liquor cabinet, coffee machine, fridge, filing, coat rack
    const cab = group('cabinet',
      box({ size: [0.44, 1.1, 0.9], pos: [0, 0.55, 0], mat: M_WOOD }),
      box({ size: [0.48, 0.05, 0.94], pos: [0, 1.12, 0], mat: M_DARKWOOD }),
    );
    for (let i = 0; i < 4; i++) {
      cab.add(makeWhiskeyBottle(M, { x: 0, y: 1.15, z: -0.3 + i * 0.2, rotY: rand(0, 3) }).group);
    }
    cab.position.set(O.x1 - 0.5, 0, oz + 1.2);
    add(cab);
    solid(O.x1 - 0.75, oz + 0.7, O.x1 - 0.2, oz + 1.7, 0, 1.15);
    anchors.liquor = new THREE.Vector3(O.x1 - 1.15, 1.2, oz + 1.2);
    office.cabinet = cab;

    // Lou's radio, on the end of the cabinet: an old two-knob table set with
    // a lit dial. The music it plays is positional, so it fades on its own
    // as you leave the office.
    const radio = group('office-radio',
      box({ size: [0.34, 0.2, 0.16], pos: [0, 0.1, 0], mat: M_DARKWOOD }),
      box({ size: [0.2, 0.09, 0.02], pos: [-0.03, 0.11, 0.085], mat: lit(0xd8a24a, 0.9) }),
      cylinder({ r: 0.02, h: 0.02, pos: [0.11, 0.06, 0.09], rotX: Math.PI / 2, mat: M_CHROME }),
      cylinder({ r: 0.02, h: 0.02, pos: [0.11, 0.13, 0.09], rotX: Math.PI / 2, mat: M_CHROME }),
    );
    radio.position.set(O.x1 - 0.36, 1.15, oz + 0.55);
    radio.rotation.y = -Math.PI / 2;
    add(radio);
    anchors.officeRadio = new THREE.Vector3(O.x1 - 0.36, 1.26, oz + 0.55);

    /* ---- the ledge ----
     * The radio and the intercom both sat at cabinet-top height and neither
     * of them was over the cabinet: the radio hung sixteen centimetres off
     * the south end of it with nothing underneath, which is what the owner
     * saw. The cabinet is 0.94 deep and the two of them span 2.4, so the
     * cabinet top is now the near end of a proper wall ledge running the
     * length of that wall, carried on two corbels where it overhangs. */
    {
      const lz0 = oz - 1.05;      // past the intercom
      const lz1 = oz + 1.72;      // past the cabinet's far end
      const lcz = (lz0 + lz1) / 2;
      const ledge = group('office-ledge',
        box({ size: [0.5, 0.055, lz1 - lz0], pos: [O.x1 - 0.36, 1.1225, lcz], mat: M_DARKWOOD }),
        // A lipped front edge, so it reads as joinery and not as a plank
        box({ size: [0.05, 0.09, lz1 - lz0], pos: [O.x1 - 0.585, 1.105, lcz], mat: M_WOOD }),
        // The batten it is screwed to
        box({ size: [0.05, 0.07, lz1 - lz0], pos: [O.x1 - 0.115, 1.06, lcz], mat: M_WOOD }),
      );
      for (const bz of [oz - 0.75, oz - 0.05]) {
        const corbel = box({ size: [0.34, 0.22, 0.06], pos: [O.x1 - 0.42, 0.99, bz], mat: M_WOOD });
        corbel.rotation.z = -0.5;
        ledge.add(corbel);
      }
      add(ledge);
      office.ledge = ledge;
      solid(O.x1 - 0.62, lz0, O.x1 - 0.1, lz1, 0.98, 1.16);
      anchors.officeLedge = new THREE.Vector3(O.x1 - 0.36, 1.15, lcz);
    }

    /* The intercom. It was a plain grey box floating at ledge height with no
     * ledge under it; it is now a real wall set standing ON the ledge --
     * pressed grille, call keys, a handset in its cradle and a maker's plate
     * with nothing useful on it. */
    {
      const ix = O.x1 - 0.36;
      const iz = oz - 0.62;
      const shell = mat({ color: 0x26262e, roughness: 0.7 });
      const intercom = group('office-intercom',
        box({ size: [0.3, 0.38, 0.22], pos: [0, 0.19, 0], mat: shell }),
        box({ size: [0.32, 0.05, 0.24], pos: [0, 0.395, 0], mat: mat({ color: 0x1a1a20, roughness: 0.8 }) }),
      );
      // Speaker grille: slats, not a painted rectangle
      for (let i = 0; i < 7; i++) {
        intercom.add(box({ size: [0.2, 0.012, 0.008], pos: [-0.02, 0.32 - i * 0.022, 0.112], mat: mat({ color: 0x14141a, roughness: 0.95 }) }));
      }
      // Call keys down the front, one of them lit
      for (let i = 0; i < 4; i++) {
        intercom.add(box({ size: [0.05, 0.022, 0.014], pos: [-0.075 + (i % 2) * 0.1, 0.13 - Math.floor(i / 2) * 0.045, 0.112], mat: mat({ color: 0xd8d4cc, roughness: 0.6 }) }));
      }
      intercom.add(sphere({ r: 0.011, pos: [0.095, 0.145, 0.112], mat: lit(0x2aff5a, 2.2) }));
      // Handset on its cradle, down the near side
      intercom.add(box({ size: [0.045, 0.055, 0.2], pos: [0.115, 0.23, 0.02], mat: mat({ color: 0x1a1a20, roughness: 0.6 }) }));
      intercom.add(box({ size: [0.05, 0.05, 0.055], pos: [0.115, 0.29, 0.09], mat: mat({ color: 0x1a1a20, roughness: 0.6 }) }));
      intercom.add(sign(printed('intercom-plate', ['ACME 4-WAY'], {
        w: 256, h: 64, bg: '#c8c4bc', fg: '#2a2a30', font: '700 30px "Trebuchet MS", sans-serif',
      }), 0.16, 0.04, { x: -0.02, y: 0.06, z: 0.112 }));
      intercom.position.set(ix, 1.15, iz);
      intercom.rotation.y = -Math.PI / 2;
      add(intercom);
      office.intercom = intercom;
    }
    /* ---- the mini fridge ----
     * It was a white block. A bar fridge is black, has a door with a seam
     * round it, a bar handle down the hinge side, a compressor vent along
     * the bottom and four feet -- and this one has been in a nightclub
     * office for fifteen years, so it has stickers on it. TAMMY is one of
     * them. The house mark is the other. */
    {
      const fx = O.x0 + 0.55;
      const fz = O.z1 - 0.7;
      const shell = mat({ color: 0x1a1a1e, roughness: 0.42, metalness: 0.12 });
      const seam = mat({ color: 0x0e0e12, roughness: 0.9 });
      const fridge = group('mini-fridge',
        // Carcass, then the door proud of it so the seam is a real gap
        box({ size: [0.52, 0.78, 0.5], pos: [0, 0.43, 0], mat: shell }),
        box({ size: [0.5, 0.7, 0.03], pos: [0, 0.45, 0.265], mat: seam }),
        box({ size: [0.47, 0.66, 0.035], pos: [0, 0.45, 0.28], mat: shell }),
        // Bar handle down the opening edge
        cylinder({ r: 0.017, h: 0.46, pos: [-0.185, 0.45, 0.315], mat: M_CHROME }),
        box({ size: [0.03, 0.03, 0.04], pos: [-0.185, 0.66, 0.298], mat: M_CHROME }),
        box({ size: [0.03, 0.03, 0.04], pos: [-0.185, 0.24, 0.298], mat: M_CHROME }),
        // Compressor grille at the bottom, and the feet under it
        box({ size: [0.44, 0.05, 0.02], pos: [0, 0.09, 0.272], mat: mat({ color: 0x2e2e34, roughness: 0.95 }) }),
      );
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          fridge.add(cylinder({ r: 0.022, h: 0.04, pos: [sx * 0.22, 0.02, sz * 0.2], mat: seam }));
        }
      }
      /* The stickers. Somebody's name, and the house.
       *
       * Both are the flat's own artwork rather than a second drawing of it,
       * pulled through assets/art/manifest.json by the slot the image already
       * belongs to: TAMMY is `sticker.fridge`, the die-cut pin-up that has
       * been on Tony's own fridge door since before he lived there, and the
       * mark under it is `crest.round`, the crest off his shelf. Same file,
       * same sticker, two buildings.
       *
       * The lettered and drawn versions below are the fallback the art system
       * guarantees: a slot whose file is missing keeps what it was built with,
       * so a deleted PNG is a plainer sticker and never a bare fridge door. */
      const tammy = artSticker(sign(printed('fridge-tammy', ['TAMMY'], {
        w: 256, h: 128, bg: '#e8d84a', fg: '#2a1a10', font: '900 62px "Trebuchet MS", sans-serif', rotate: -0.09,
      }), 0.2, 0.1, { x: 0.09, y: 0.62, z: 0.3 }), 'sticker.fridge', 0.2, -0.09);
      fridge.add(tammy);
      const mark = artSticker(sign(squatchArt('fridge-squatch', { title: [], ink: '#e8e2d0', bg: '#3a1420', w: 192, h: 192, rule: false }),
        0.15, 0.15, { x: 0.05, y: 0.34, z: 0.3 }), 'crest.round', 0.17, 0.14);
      mark.rotation.z = 0.14;
      fridge.add(mark);
      office.fridgeStickers = { tammy, mark };
      fridge.position.set(fx, 0, fz);
      /* Door into the ROOM. It stands against the north wall, and every part
       * of it that is worth building -- the seam, the handle, the stickers --
       * is on the door, which was pointing at thirty centimetres of panelling. */
      fridge.rotation.y = Math.PI;
      add(fridge);
      office.fridge = fridge;
      solid(fx - 0.28, fz - 0.28, fx + 0.28, fz + 0.28, 0, 0.82);
    }

    /* ---- the filing cabinet ----
     * Four drawers with real fronts, a pull on each, and the little brass
     * label holders every cabinet of this vintage has. Plus the plinth it
     * stands on and the tray of paper nobody has filed.
     *
     * It stood 62cm off the north wall and 21cm off the west one -- marooned,
     * which is what the owner saw. Nobody leaves a filing cabinet standing in
     * the room; it goes in the corner with its back on the wall. Measured off
     * WALLS above rather than nudged: the carcass is 0.6 x 0.5, its deepest
     * back part is the plinth top at 0.26, so 1.5cm of daylight on both faces. */
    {
      const cx = filingX;
      const cz = filingZ;
      const carcass = mat({ color: 0x3a3a42, roughness: 0.62, metalness: 0.25 });
      const front = mat({ color: 0x44444c, roughness: 0.55, metalness: 0.3 });
      const filing = group('filing',
        box({ size: [0.6, 1.3, 0.5], pos: [0, 0.65, 0], mat: carcass }),
        box({ size: [0.62, 0.06, 0.52], pos: [0, 1.32, 0], mat: mat({ color: 0x2e2e36, roughness: 0.7 }) }),
        box({ size: [0.56, 0.06, 0.46], pos: [0, 0.03, 0], mat: mat({ color: 0x22222a, roughness: 0.9 }) }),
      );
      for (let i = 0; i < 4; i++) {
        const y = 0.22 + i * 0.3;
        filing.add(box({ size: [0.54, 0.27, 0.02], pos: [0, y, 0.255], mat: front }));
        // Recessed pull, and the card holder above it
        filing.add(box({ size: [0.17, 0.035, 0.035], pos: [0, y - 0.05, 0.272], mat: M_CHROME }));
        filing.add(box({ size: [0.19, 0.055, 0.012], pos: [0, y + 0.06, 0.268], mat: M_BRASS }));
        filing.add(box({ size: [0.16, 0.032, 0.004], pos: [0, y + 0.06, 0.276], mat: mat({ color: 0xe8e2d0, roughness: 1 }) }));
      }
      // The tray of paper on top, because it never gets filed
      filing.add(box({ size: [0.34, 0.02, 0.26], pos: [0.04, 1.36, 0.02], mat: M_STEEL }));
      for (let i = 0; i < 3; i++) {
        filing.add(box({ size: [0.3, 0.012, 0.22], pos: [0.04 + rand(-0.01, 0.01), 1.378 + i * 0.013, 0.02], mat: mat({ color: 0xe8e2d0, roughness: 1 }) }));
      }
      filing.position.set(cx, 0, cz);
      add(filing);
      office.filing = filing;
      solid(cx - 0.32, cz - 0.28, cx + 0.32, cz + 0.28, 0, 1.4);
    }

    /* ---- the floor lamp ----
     * The office had exactly one warm source in it and it was the thing that
     * was too bright. A standard lamp in the filing corner spreads the load:
     * low, soft, and nowhere near the bloom threshold.
     *
     * "The filing corner" was aspirational: it stood a metre and a half out
     * into the room, square in the walking line between Lou's door and Lou's
     * desk. It now stands where it says it does -- shoulder to shoulder with
     * the cabinet against the north wall, its shade 1.5cm off the dado and its
     * collider clear of the cabinet's by a comfortable hand's width. */
    {
      const lx = filingX + 0.635;
      const lz = WALLS.north + 0.225;
      const stand = group('floor-lamp',
        cylinder({ r: 0.17, h: 0.035, pos: [0, 0.02, 0], mat: mat({ color: 0x22222a, roughness: 0.7 }) }),
        cylinder({ r: 0.02, h: 1.42, pos: [0, 0.74, 0], mat: M_BRASS }),
        cylinder({ r: 0.035, h: 0.05, pos: [0, 1.47, 0], mat: M_BRASS }),
      );
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.21, 0.24, 12, 1, true),
        mat({ color: 0xd8c9a4, roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color(0xd8c9a4), emissiveIntensity: 0.16 }),
      );
      cone.position.set(0, 1.6, 0);
      stand.add(cone);
      stand.position.set(lx, 0, lz);
      add(stand);
      const lampLight = new THREE.PointLight(0xffc890, 5.5, 5.2, 2);
      lampLight.position.set(lx, 1.55, lz);
      lampLight.castShadow = false;
      add(lampLight);
      office.floorLamp = lampLight;
      solid(lx - 0.2, lz - 0.2, lx + 0.2, lz + 0.2, 0, 1.7);
    }

    /* ---- the coat stand ----
     * There used to be a bare dowel standing half a metre inside the office
     * across the door's swing and in front of the television. A coat stand
     * is a weighted base, a turned column, a crown of hooks and a ring for
     * umbrellas -- and it lives just inside the door against the north wall,
     * which is where you actually hang a coat. */
    {
      const kx = O.x0 + 1.7;
      const kz = O.z1 - 0.45;
      const stand = group('coat-stand',
        cylinder({ r: 0.19, h: 0.045, pos: [0, 0.022, 0], mat: mat({ color: 0x1e1a16, roughness: 0.8 }) }),
        cylinder({ r: 0.055, h: 0.12, pos: [0, 0.09, 0], mat: M_DARKWOOD }),
        cylinder({ r: 0.032, h: 1.62, pos: [0, 0.95, 0], mat: M_DARKWOOD }),
        cylinder({ r: 0.055, h: 0.09, pos: [0, 1.79, 0], mat: M_DARKWOOD }),
        sphere({ r: 0.045, pos: [0, 1.86, 0], mat: M_BRASS }),
        // Umbrella ring at shin height
        new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.011, 6, 14), M_BRASS),
      );
      stand.children[stand.children.length - 1].rotation.x = Math.PI / 2;
      stand.children[stand.children.length - 1].position.set(0, 0.3, 0);
      // Four hooks, angled up and out, with brass tips
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const arm = cylinder({ r: 0.016, h: 0.2, pos: [Math.sin(a) * 0.075, 1.71, Math.cos(a) * 0.075], mat: M_DARKWOOD });
        arm.rotation.x = Math.cos(a) * 0.7;
        arm.rotation.z = -Math.sin(a) * 0.7;
        stand.add(arm);
        stand.add(sphere({ r: 0.021, pos: [Math.sin(a) * 0.14, 1.775, Math.cos(a) * 0.14], mat: M_BRASS }));
      }
      // Lou's spare overcoat, hanging off the back of it
      const coat = box({ size: [0.3, 0.86, 0.14], pos: [-0.02, 1.28, -0.13], mat: mat({ color: 0x24242c, roughness: 0.95 }) });
      stand.add(coat);
      stand.add(box({ size: [0.2, 0.1, 0.12], pos: [-0.02, 1.68, -0.11], mat: mat({ color: 0x24242c, roughness: 0.95 }) }));
      stand.position.set(kx, 0, kz);
      add(stand);
      office.coatStand = stand;
      solid(kx - 0.22, kz - 0.22, kx + 0.22, kz + 0.22, 0, 1.9);
    }

    // Family photographs, the safe behind a picture, the clock, the telly.
    // Hung past the office door's swing arc, not inside its opening, and
    // seated on the hallway wall's office face (x 7.89) -- they used to hang
    // eight centimetres out into the room.
    /* The photographs.
     *
     * Two of the three still hang on the door wall, and THE OLD PLACE has
     * come south forty centimetres: at z -4.7 its right-hand edge was inside
     * the north wall, which is the clipping the owner spotted. SUNDAY AT THE
     * SHORE has moved to the wall behind Lou, where a man hangs the picture
     * he actually wants to be looked at over his own shoulder. */
    /* THE NEPHEWS has come left along the wall (in the office's own view of it:
     * you stand with your back to the room, so left is +z). Its frame is 0.41
     * across the mount, and at z -5.9 the near edge sat at -6.105 -- twelve
     * centimetres INSIDE the door's north sidelight, whose frame stops at
     * -5.98. Hung at -5.72 it clears the glazing by 5.5cm and still leaves
     * 21cm of wall between it and THE OLD PLACE. */
    for (const [i, pz] of [[1, O.z0 + 3.78], [2, O.z0 + 4.4]]) {
      add(makeFrame(M, {
        x: 7.926, y: 1.9, z: pz, rotY: Math.PI / 2, w: 0.34, h: 0.26,
        texture: printed(`lou-family${i}`, [['SUNDAY', 'AT THE SHORE'], ['THE NEPHEWS'], ['THE OLD PLACE']][i], {
          w: 320, h: 240, bg: '#3a2a20', fg: '#d8c8a8', font: '700 30px "Trebuchet MS", sans-serif',
        }),
      }));
    }
    const shorePic = makeFrame(M, {
      x: dx + 0.62, y: 1.76, z: O.z0 + 0.115, rotY: 0, w: 0.44, h: 0.34,
      texture: printed('lou-family0', ['SUNDAY', 'AT THE SHORE'], {
        w: 320, h: 240, bg: '#3a2a20', fg: '#d8c8a8', font: '700 30px "Trebuchet MS", sans-serif',
      }),
    });
    add(shorePic);
    office.shorePicture = shorePic.group;
    anchors.photos = new THREE.Vector3(O.x0 + 0.9, 1.9, O.z0 + 4.0);

    /* The house mark, framed, twice: the crest over the door wall and a
     * smaller plate on the wall behind the desk beside the shore. Same
     * drawSquatchSilhouette as the crest in the main room and the poster in
     * the flat -- squatchArt() in kit.js is the one place it is dressed. */
    const officeLogos = [];
    /* The crest hung at z -7.15 on the door wall, which is the dead centre of
     * the doorway (-7.6 to -6.5): from the hallway it was a picture floating
     * in the opening, and from a desk chair it was a picture behind an open
     * door. It has gone right along the same wall -- right, from the room's
     * side of it, being -z -- to the one piece of wall in here that was asking
     * for it: over the filing cabinet in the corner, centred on the cabinet
     * and clear of the north wall by 8.5cm. */
    officeLogos.push(makeFrame(M, {
      x: 7.926, y: 1.86, z: filingZ, rotY: Math.PI / 2, w: 0.38, h: 0.48,
      texture: squatchArt('office-crest', { title: ['BADA BING'], footer: 'EST. 1979' }),
      tint: 0x6a4e1c,
    }));
    officeLogos.push(makeFrame(M, {
      x: dx - 0.28, y: 1.72, z: O.z0 + 0.115, rotY: 0, w: 0.3, h: 0.38,
      texture: squatchArt('office-mark', { title: ['THE', 'FAMILY'], ink: '#d8c8a8', bg: '#241820' }),
      tint: 0x6a4e1c,
    }));
    for (const f of officeLogos) add(f);
    office.logos = officeLogos.map((f) => f.group);

    const safePic = makeFrame(M, {
      x: O.x1 - 0.13, y: 1.85, z: O.z0 + 1.2, rotY: -Math.PI / 2, w: 0.62, h: 0.48,
      texture: printed('safe-cover', ['THE BING', '1979'], { w: 512, h: 384, bg: '#2a1a24', fg: '#c8a2d8', font: '800 46px "Trebuchet MS", sans-serif' }),
    }).group;
    add(safePic);
    office.safePicture = safePic;
    const safe = box({ size: [0.08, 0.42, 0.52], pos: [O.x1 - 0.14, 1.85, O.z0 + 1.2], mat: mat({ color: 0x2a2a30, roughness: 0.5, metalness: 0.6 }) });
    safe.visible = false;
    add(safe);
    office.safe = safe;
    anchors.safe = new THREE.Vector3(O.x1 - 0.75, 1.85, O.z0 + 1.2);

    const officeClock = makeWallClock(M, { x: dx - 0.9, y: 2.1, z: O.z0 + 0.1, rotY: 0, r: 0.16 });
    add(officeClock);
    clocks.push(officeClock);
    // Lou's set runs all night on the nature channel, sound off. It is the
    // same channel system as the flat's telly, pinned to one programme.
    const officeTvProp = makeTv(M, { x: O.x0 + 0.7, z: O.z1 - 1.8, rotY: Math.PI / 2, w: 0.8 });
    add(officeTvProp);
    office.tv = new Tv({});
    office.tv.on = true;
    office.tv.index = 0;
    const officeTvTex = new THREE.CanvasTexture(office.tv.canvas);
    officeTvTex.colorSpace = THREE.SRGBColorSpace;
    officeTvTex.generateMipmaps = false;
    officeTvTex.minFilter = THREE.LinearFilter;
    officeTvProp.screen.material = new THREE.MeshBasicMaterial({
      map: officeTvTex, toneMapped: false,
    });
    office.tvScreen = officeTvProp.screen;

    /* The security monitor showing the parking lot, which matters later.
     * It hangs off a bracket on the back-right wall, angled down at the desk
     * the way every back-office CCTV set has hung since 1987 -- it used to
     * float in mid-air over the desk's rear corner with nothing holding it. */
    const monScreen = box({ size: [0.54, 0.4, 0.02], pos: [0, 0, 0.06], mat: lit(0x1a2a1a, 0.8) });
    const monitor = group('monitor',
      box({ size: [0.64, 0.5, 0.12], pos: [0, 0, 0], mat: mat({ color: 0x26262e, roughness: 0.7 }) }),
      monScreen,
    );
    monitor.position.set(13.44, 1.72, -9.0);
    monitor.rotation.y = -1.1;
    monitor.rotation.x = 0.12;
    add(monitor);
    // The mount: a plate on the wall face (x 13.81) and an arm to the set
    add(box({ size: [0.06, 0.3, 0.3], pos: [13.78, 1.72, -9.0], mat: M_STEEL }));
    add(box({ size: [0.32, 0.05, 0.06], pos: [13.6, 1.78, -9.0], mat: M_STEEL }));
    office.monitor = monitor;
    office.monitorScreen = monScreen;
    anchors.monitor = new THREE.Vector3(13.3, 1.7, -8.8);
  }

  /* ================================================================== */
  /* Rain, and the haze indoors                                          */
  /* ================================================================== */
  const rain = makeRain(root);
  const haze = makeHaze(root, MAIN, CEIL_MAIN);

  /* ================================================================== */
  /* Spawns                                                              */
  /* ================================================================== */
  // Centre Tony's car in the deliberately empty bay in the first row. It used
  // to sit sideways across this row and overlap the Lincoln to its west.
  anchors.playerCar = new THREE.Vector3(-0.7, 0, 25);
  anchors.suspiciousCar = new THREE.Vector3(19.5, 0, 20.5);
  anchors.louCar = new THREE.Vector3(8.5, 0, 18.8);
  anchors.lotExit = new THREE.Vector3(21, 0, 52);
  anchors.frontDoor = new THREE.Vector3(0, 0, 16.6);
  anchors.clubCentre = new THREE.Vector3(-8, 0, 2);
  anchors.alleyMouth = new THREE.Vector3(24, 0, 14);

  /* ================================================================== */
  /* Update                                                              */
  /* ================================================================== */
  let clock = 0;
  function update(dt, playerPos) {
    clock += dt;
    for (const fn of ticking) fn(dt, clock);
    for (const d of Object.values(doors)) d.update(dt);
    rain.update(dt, playerPos);
    haze.update(dt);
    if (office.tv) {
      office.tv.update(dt);
      if (office.tvScreen.material.map) office.tvScreen.material.map.needsUpdate = true;
    }

    for (const f of neon) {
      f.next -= dt;
      if (f.next > 0) continue;
      f.on = !f.on;
      if (f.kind === 'led') {
        f.mesh.material.emissiveIntensity = f.on ? f.base : 0.2;
        f.next = f.on ? rand(1.4, 3) : 0.14;
        continue;
      }
      f.mesh.visible = f.on;
      if (f.light) f.light.intensity = f.on ? f.base : 0;
      f.next = f.on
        ? rand(f.kind === 'fluoro' ? 2 : 5, f.kind === 'fluoro' ? 9 : 16)
        : rand(0.04, f.kind === 'fluoro' ? 0.35 : 0.18);
    }
  }

  /** Height of the walkable floor under a point -- the stage, or zero. */
  function groundAt(x, z) {
    for (const p of platforms) {
      if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return p.y;
    }
    return 0;
  }

  /* The art the club borrows off the flat's walls. Nothing waits on it -- the
   * room is already standing and dressed with its drawn versions -- but the
   * promise is handed out so a caller (and the verifier) can know when the
   * real images have landed. A failed manifest or a missing file is not an
   * error here: it leaves the placeholder up. */
  const artReady = resolveGear(artSlots.map((a) => a.slot))
    .then((gear) => dressArtSlots(gear))
    .catch(() => []);

  return {
    root, colliders, navBlockers, floorZones, doors, anchors, neon, office, storeroom, slot, bj,
    platforms, groundAt, update, roomAt, rooms: ROOMS, rain, clocks, artReady,
    /* Put every wall clock in the building on the same time -- the
     * campaign's, not the wall clock's own idea of one. */
    setClock(hour24, minute) {
      const h = ((hour24 % 12) + minute / 60) / 12;
      const m = (minute % 60) / 60;
      for (const c of clocks) {
        c.hourHand.rotation.z = -h * Math.PI * 2;
        c.minHand.rotation.z = -m * Math.PI * 2;
        c.secHand.rotation.z = 0;
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Weather                                                             */
/* ------------------------------------------------------------------ */

/**
 * Rain, as a block of points that follows the player around outside so the
 * whole lot does not have to be simulated. Indoors it is simply not drawn.
 */
function makeRain(root) {
  const COUNT = 2600;
  const SPAN = 34;
  const HEIGHT = 14;
  const pos = new Float32Array(COUNT * 3);
  const speed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = rand(-SPAN, SPAN);
    pos[i * 3 + 1] = rand(0, HEIGHT);
    pos[i * 3 + 2] = rand(-SPAN, SPAN);
    speed[i] = rand(16, 26);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xc8d8f0, size: 0.075, transparent: true, opacity: 0.62, depthWrite: false,
  }));
  points.frustumCulled = false;
  root.add(points);

  let centre = new THREE.Vector3();
  return {
    points,
    setVisible(v) { points.visible = v; },
    update(dt, playerPos) {
      if (playerPos) centre = playerPos;
      points.position.set(centre.x, 0, centre.z);
      if (!points.visible) return;
      const a = geo.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        a[i * 3 + 1] -= speed[i] * dt;
        a[i * 3] += dt * 1.4;          // the wind, such as it is
        if (a[i * 3 + 1] < 0) {
          a[i * 3 + 1] = HEIGHT;
          a[i * 3] = rand(-SPAN, SPAN);
          a[i * 3 + 2] = rand(-SPAN, SPAN);
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** Dust drifting up through the spotlights, because the room is that room. */
function makeHaze(root, r, ceil) {
  const COUNT = 300;
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = rand(r.x0 + 1, r.x1 - 1);
    pos[i * 3 + 1] = rand(0.5, ceil - 0.4);
    pos[i * 3 + 2] = rand(r.z0 + 1, r.z1 - 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffd0e0, size: 0.05, transparent: true, opacity: 0.42, depthWrite: false,
  }));
  root.add(points);
  return {
    points,
    update(dt) {
      if (!points.visible) return;
      const a = geo.attributes.position.array;
      for (let i = 1; i < a.length; i += 3) {
        a[i] += dt * 0.09;
        if (a[i] > ceil - 0.3) a[i] = 0.5;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** The neon dancer on the sign: a squatch in a bandana, mid-kick. */
function neonSilhouette() {
  return neonSilhouetteTex ??= (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 384;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 384);
    g.strokeStyle = '#ff77c0';
    g.shadowColor = '#ff77c0';
    g.shadowBlur = 22;
    g.lineWidth = 13;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(128, 92, 34, 0, Math.PI * 2);
    g.moveTo(128, 126); g.lineTo(128, 232);
    g.moveTo(128, 150); g.lineTo(62, 106);
    g.moveTo(128, 150); g.lineTo(198, 190);
    g.moveTo(128, 232); g.lineTo(82, 322);
    g.moveTo(128, 232); g.lineTo(208, 268);
    g.stroke();
    g.strokeStyle = '#ff2a3a';
    g.shadowColor = '#ff2a3a';
    g.lineWidth = 15;
    g.beginPath();
    g.moveTo(96, 72); g.lineTo(160, 72);
    g.moveTo(160, 72); g.lineTo(178, 58);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
}
let neonSilhouetteTex = null;
