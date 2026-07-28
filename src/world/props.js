/**
 * Furniture and prop builders.
 *
 * Each builder returns a THREE.Group positioned in world space, and where a
 * prop has moving or interactive parts it also returns handles to them so
 * apartment.js can wire up interactions without digging through children.
 */
import * as THREE from 'three';
import { box, boxFrom, cylinder, sphere, plane, mat, group } from './build.js';
import { drawSquatchSilhouette } from './textures.js';

/* ------------------------------------------------------------------ */
/* Bedroom                                                             */
/* ------------------------------------------------------------------ */

/** Double bed with rumpled duvet, head against the north wall. */
export function makeBed(M, { x, z, w = 1.4, len = 2.0 }) {
  const g = group('bed');
  const x0 = x - w / 2;
  const z0 = z - len / 2;

  // Frame + legs.
  g.add(boxFrom(x0, 0.10, z0, x0 + w, 0.34, z0 + len, M.darkWood));
  for (const [lx, lz] of [[x0 + 0.08, z0 + 0.08], [x0 + w - 0.08, z0 + 0.08],
                          [x0 + 0.08, z0 + len - 0.08], [x0 + w - 0.08, z0 + len - 0.08]]) {
    g.add(box({ size: [0.09, 0.10, 0.09], pos: [lx, 0.05, lz], mat: M.darkWood }));
  }
  // Headboard.
  g.add(boxFrom(x0, 0.34, z0 - 0.06, x0 + w, 1.05, z0 + 0.04, M.darkWood));

  // Mattress + fitted sheet.
  g.add(boxFrom(x0 + 0.03, 0.34, z0 + 0.04, x0 + w - 0.03, 0.60, z0 + len - 0.03, M.sheet));

  // Duvet, thrown back as if someone just got out.
  const duvet = boxFrom(x0 + 0.01, 0.58, z0 + 0.62, x0 + w - 0.01, 0.72, z0 + len + 0.10, M.fabricBed);
  g.add(duvet);
  // Bunched fold where it was kicked off.
  g.add(box({ size: [w - 0.1, 0.20, 0.34], pos: [x, 0.74, z0 + 0.80], mat: M.fabricBed, rotX: -0.12 }));
  g.add(box({ size: [w - 0.25, 0.14, 0.26], pos: [x + 0.08, 0.84, z0 + 1.02], mat: M.fabricBed, rotX: 0.2, rotY: 0.15 }));

  // Pillows.
  g.add(box({ size: [0.60, 0.15, 0.38], pos: [x - 0.32, 0.67, z0 + 0.30], mat: M.pillow, rotZ: 0.06 }));
  g.add(box({ size: [0.58, 0.14, 0.36], pos: [x + 0.32, 0.66, z0 + 0.33], mat: M.pillow, rotZ: -0.05, rotY: 0.09 }));

  return { group: g, bounds: [[x0, 0, z0], [x0 + w, 0.72, z0 + len]] };
}

export function makeNightstand(M, { x, z }) {
  const g = group('nightstand');
  const w = 0.52, d = 0.44, h = 0.55;
  g.add(box({ size: [w, 0.05, d], pos: [x, h, z], mat: M.darkWood }));
  g.add(box({ size: [w - 0.05, h - 0.14, d - 0.04], pos: [x, h / 2 + 0.04, z], mat: M.lightWood }));
  // Drawer face + pull.
  g.add(box({ size: [w - 0.10, 0.16, 0.02], pos: [x, 0.40, z - d / 2 - 0.005], mat: M.darkWood }));
  g.add(cylinder({ r: 0.018, h: 0.09, pos: [x, 0.40, z - d / 2 - 0.03], rotZ: Math.PI / 2, mat: M.chrome }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box({ size: [0.05, 0.12, 0.05], pos: [x + sx * (w / 2 - 0.05), 0.06, z + sz * (d / 2 - 0.05)], mat: M.darkWood }));
    }
  }
  return { group: g, top: h + 0.025, bounds: [[x - w / 2, 0, z - d / 2], [x + w / 2, h, z + d / 2]] };
}

/** Digital alarm clock. Returns the display mesh so the time can tick. */
export function makeAlarmClock(M, { x, y, z, rotY = 0 }) {
  const g = group('alarmclock');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(box({ size: [0.16, 0.075, 0.10], pos: [0, 0.038, 0], mat: M.plasticBlack }));

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = plane(0.115, 0.048, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(0, 0.042, 0.051);
  g.add(screen);

  const draw = (text, dim = false) => {
    const c = canvas.getContext('2d');
    c.fillStyle = '#120303';
    c.fillRect(0, 0, 256, 128);
    c.font = 'bold 78px "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = '#ff2a1e';
    c.shadowBlur = dim ? 8 : 22;
    c.fillStyle = dim ? '#8e1a12' : '#ff3325';
    c.fillText(text, 128, 66);
    tex.needsUpdate = true;
  };
  draw('6:04');

  return { group: g, draw };
}

/* ------------------------------------------------------------------ */
/* Desk + gaming PC                                                    */
/* ------------------------------------------------------------------ */

/**
 * The desk setup. `screen` is the mesh the arcade game renders onto;
 * apartment.js swaps its material map for the game's CanvasTexture.
 */
export function makeDesk(M, { x, z, w = 2.4, d = 0.70 }) {
  const g = group('desk');
  const top = 0.74;
  const x0 = x - w / 2;
  const z0 = z - d / 2;

  g.add(boxFrom(x0, top - 0.04, z0, x0 + w, top, z0 + d, M.deskTop));
  // Steel frame legs.
  for (const lx of [x0 + 0.06, x0 + w - 0.06]) {
    g.add(box({ size: [0.05, top - 0.04, 0.05], pos: [lx, (top - 0.04) / 2, z0 + 0.06], mat: M.darkSteel }));
    g.add(box({ size: [0.05, top - 0.04, 0.05], pos: [lx, (top - 0.04) / 2, z0 + d - 0.06], mat: M.darkSteel }));
    g.add(box({ size: [0.04, 0.04, d - 0.12], pos: [lx, 0.08, z], mat: M.darkSteel }));
  }
  // Cable tray + a cable spilling over the back.
  g.add(box({ size: [w - 0.5, 0.03, 0.10], pos: [x, top - 0.12, z0 + 0.12], mat: M.plasticGrey }));

  /* ---- monitor ---- */
  const monX = x - 0.22;
  const monBaseZ = z0 + 0.14;
  g.add(box({ size: [0.28, 0.018, 0.20], pos: [monX, top + 0.009, monBaseZ], mat: M.plasticBlack }));
  g.add(box({ size: [0.055, 0.30, 0.055], pos: [monX, top + 0.16, monBaseZ], mat: M.plasticBlack }));
  // Panel: 16:9, tilted back a touch.
  const panel = group('panel');
  panel.position.set(monX, top + 0.43, monBaseZ + 0.02);
  panel.rotation.x = -0.06;
  panel.add(box({ size: [0.68, 0.41, 0.028], pos: [0, 0, -0.016], mat: M.plasticBlack }));
  const screen = plane(0.632, 0.356, M.screenOff.clone());
  screen.position.set(0, 0.006, 0.001);
  panel.add(screen);
  // Power LED.
  const powerLed = box({ size: [0.012, 0.006, 0.004], pos: [0.30, -0.196, 0.004], mat: M.bulbOff });
  panel.add(powerLed);
  g.add(panel);

  /* ---- keyboard, mouse, pad ---- */
  const kbZ = z0 + d - 0.20;
  g.add(box({ size: [0.60, 0.008, 0.32], pos: [x - 0.16, top + 0.004, kbZ], mat: M.black }));
  const kb = box({ size: [0.44, 0.022, 0.15], pos: [x - 0.16, top + 0.018, kbZ], mat: M.plasticBlack });
  g.add(kb);
  // Keycaps.
  const capMat = mat({ color: 0x2b2b31, roughness: 0.65 });
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 14; c++) {
      g.add(box({
        size: [0.024, 0.006, 0.024],
        pos: [x - 0.16 - 0.205 + c * 0.0315, top + 0.032, kbZ - 0.055 + r * 0.033],
        mat: capMat, cast: false,
      }));
    }
  }
  const mouse = sphere({ r: 0.035, ry: 0.018, rz: 0.055, pos: [x + 0.22, top + 0.018, kbZ], mat: M.plasticBlack });
  g.add(mouse);

  /* ---- headset on a hook, speakers, clutter ---- */
  g.add(cylinder({ r: 0.055, h: 0.02, pos: [x + 0.90, top + 0.01, z0 + 0.30], mat: M.plasticBlack }));
  g.add(box({ size: [0.09, 0.22, 0.09], pos: [x + 0.90, top + 0.12, z0 + 0.30], mat: M.plasticBlack }));
  g.add(box({ size: [0.09, 0.22, 0.09], pos: [x - 1.02, top + 0.12, z0 + 0.30], mat: M.plasticBlack }));

  /* ---- PC tower under the desk, RGB glow ---- */
  const towerX = x + 0.92;
  const tower = group('tower');
  tower.add(box({ size: [0.22, 0.46, 0.46], pos: [towerX, 0.25, z], mat: M.plasticBlack }));
  const sideGlass = plane(0.40, 0.40, new THREE.MeshPhysicalMaterial({
    color: 0x11131a, roughness: 0.1, transmission: 0.55, transparent: true, opacity: 0.6, thickness: 0.01,
  }));
  sideGlass.position.set(towerX - 0.111, 0.25, z);
  sideGlass.rotation.y = -Math.PI / 2;
  tower.add(sideGlass);
  const rgbStrip = box({ size: [0.02, 0.30, 0.02], pos: [towerX - 0.06, 0.25, z - 0.16], mat: M.ledBlue.clone() });
  tower.add(rgbStrip);
  const fanRing = cylinder({ r: 0.055, h: 0.012, pos: [towerX - 0.06, 0.34, z + 0.10], rotX: Math.PI / 2, mat: M.ledBlue.clone() });
  tower.add(fanRing);
  g.add(tower);

  return {
    group: g,
    top,
    screen,
    panel,
    powerLed,
    rgb: [rgbStrip, fanRing],
    monitorPos: new THREE.Vector3(monX, top + 0.43, monBaseZ + 0.02),
    bounds: [[x0, 0, z0], [x0 + w, top, z0 + d]],
  };
}

/** Rolling gaming chair. Returns the seat group so it can swivel. */
export function makeChair(M, { x, z, rotY = 0 }) {
  const g = group('chair');
  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  // Base star + castors.
  g.add(cylinder({ r: 0.045, h: 0.34, pos: [0, 0.28, 0], mat: M.darkSteel }));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box({ size: [0.05, 0.03, 0.30], pos: [Math.sin(a) * 0.15, 0.10, Math.cos(a) * 0.15], mat: M.plasticBlack });
    leg.rotation.y = a;
    g.add(leg);
    g.add(cylinder({ r: 0.032, h: 0.03, pos: [Math.sin(a) * 0.29, 0.035, Math.cos(a) * 0.29], rotX: Math.PI / 2, mat: M.plasticBlack }));
  }
  // Seat + back + racing bolsters.
  g.add(box({ size: [0.50, 0.10, 0.48], pos: [0, 0.48, 0], mat: M.fabricCouch }));
  g.add(box({ size: [0.09, 0.09, 0.44], pos: [-0.22, 0.55, 0], mat: M.fabricCouch }));
  g.add(box({ size: [0.09, 0.09, 0.44], pos: [0.22, 0.55, 0], mat: M.fabricCouch }));
  const back = box({ size: [0.48, 0.62, 0.10], pos: [0, 0.84, -0.20], mat: M.fabricCouch, rotX: 0.10 });
  g.add(back);
  g.add(box({ size: [0.10, 0.58, 0.06], pos: [-0.21, 0.86, -0.16], mat: M.plasticBlack, rotX: 0.10 }));
  g.add(box({ size: [0.10, 0.58, 0.06], pos: [0.21, 0.86, -0.16], mat: M.plasticBlack, rotX: 0.10 }));
  // Armrests.
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.05, 0.16, 0.05], pos: [sx * 0.27, 0.61, -0.02], mat: M.plasticBlack }));
    g.add(box({ size: [0.08, 0.03, 0.26], pos: [sx * 0.27, 0.70, 0.02], mat: M.plasticBlack }));
  }
  // Headrest.
  g.add(box({ size: [0.30, 0.14, 0.09], pos: [0, 1.14, -0.24], mat: M.plasticBlack, rotX: 0.10 }));

  return { group: g, bounds: [[x - 0.32, 0, z - 0.32], [x + 0.32, 0.5, z + 0.32]] };
}

/* ------------------------------------------------------------------ */
/* Kitchen                                                             */
/* ------------------------------------------------------------------ */

/**
 * Fridge against the east wall, door hinged on its north edge.
 * Returns { doorPivot, interior, light, beerSlots }.
 */
export function makeFridge(M, { x, z, w = 0.80, d = 0.72, h = 1.85 }) {
  const g = group('fridge');
  const z0 = z - w / 2;      // north edge (hinge side)
  const x0 = x - d / 2;      // front face (west, faces into the room)

  // Body: an open-fronted box so the interior is visible when the door swings.
  const body = group('fridgeBody');
  body.add(boxFrom(x0, 0, z0, x0 + d, 0.06, z0 + w, M.plasticBlack));           // base
  body.add(boxFrom(x0, h - 0.06, z0, x0 + d, h, z0 + w, M.steel));              // top
  body.add(boxFrom(x0 + d - 0.05, 0.06, z0, x0 + d, h - 0.06, z0 + w, M.plasticGrey)); // back
  body.add(boxFrom(x0, 0.06, z0, x0 + d - 0.05, h - 0.06, z0 + 0.05, M.plasticGrey));  // north side
  body.add(boxFrom(x0, 0.06, z0 + w - 0.05, x0 + d - 0.05, h - 0.06, z0 + w, M.plasticGrey)); // south side
  g.add(body);

  // Interior liner + shelves.
  const liner = mat({ color: 0xe9ebe6, roughness: 0.7 });
  const inX0 = x0 + 0.06, inX1 = x0 + d - 0.06;
  const inZ0 = z0 + 0.06, inZ1 = z0 + w - 0.06;
  g.add(boxFrom(inX1 - 0.01, 0.10, inZ0, inX1, h - 0.10, inZ1, liner, { cast: false }));
  const shelfY = [0.42, 0.78, 1.14, 1.48];
  const shelfMat = new THREE.MeshPhysicalMaterial({
    color: 0xdfe8ee, roughness: 0.1, transmission: 0.7, transparent: true, opacity: 0.5, thickness: 0.01,
  });
  for (const sy of shelfY) {
    g.add(boxFrom(inX0, sy, inZ0, inX1, sy + 0.012, inZ1, shelfMat, { cast: false }));
  }

  // Stock: beers on the second shelf, sad leftovers elsewhere.
  const beerSlots = [];
  for (let i = 0; i < 6; i++) {
    const bx = inX0 + 0.14 + (i % 3) * 0.19;
    const bz = inZ0 + 0.18 + Math.floor(i / 3) * 0.26;
    const can = makeBeerCan(M, { x: bx, y: 0.79, z: bz });
    g.add(can.group);
    beerSlots.push(can.group);
  }
  g.add(box({ size: [0.22, 0.10, 0.18], pos: [(inX0 + inX1) / 2, 1.20, inZ0 + 0.24], mat: M.cardboard }));
  g.add(cylinder({ r: 0.035, h: 0.20, pos: [inX0 + 0.14, 1.59, inZ1 - 0.16], mat: mat({ color: 0xc23a2a, roughness: 0.4 }) }));
  g.add(cylinder({ r: 0.032, h: 0.17, pos: [inX0 + 0.24, 1.575, inZ1 - 0.16], mat: mat({ color: 0xd8b53a, roughness: 0.4 }) }));
  // Half a lime, going grey.
  g.add(sphere({ r: 0.035, pos: [inX1 - 0.14, 0.455, inZ0 + 0.14], mat: mat({ color: 0x8fa054, roughness: 0.9 }) }));

  // Interior light, off until the door opens.
  const light = new THREE.PointLight(0xfff0d0, 0, 1.4, 2);
  light.position.set(inX1 - 0.10, h - 0.20, (inZ0 + inZ1) / 2);
  g.add(light);

  /* ---- door ----
   * Hinged on the south edge so it swings into the open corner. Hinging it
   * north would sweep the door straight through the counter run.
   * Door geometry runs along local -z from the pivot.
   */
  const doorPivot = new THREE.Group();
  doorPivot.position.set(x0 + 0.02, 0, z0 + w - 0.03);
  const door = group('fridgeDoor');
  const dw = w - 0.06;
  const binMat = mat({ color: 0xdfe2de, roughness: 0.6 });
  door.add(box({ size: [0.06, h - 0.08, dw], pos: [0, h / 2, -dw / 2], mat: M.steel }));
  // Inner shelf lip + condiment door bins.
  door.add(box({ size: [0.09, 0.10, w - 0.16], pos: [0.06, 0.62, -dw / 2], mat: binMat }));
  door.add(box({ size: [0.09, 0.10, w - 0.16], pos: [0.06, 1.05, -dw / 2], mat: binMat }));
  // Vertical bar handle, on the free edge.
  door.add(cylinder({ r: 0.016, h: 0.85, pos: [-0.075, 1.02, -(w - 0.16)], mat: M.chrome }));
  door.add(box({ size: [0.05, 0.03, 0.03], pos: [-0.05, 1.44, -(w - 0.16)], mat: M.chrome }));
  door.add(box({ size: [0.05, 0.03, 0.03], pos: [-0.05, 0.60, -(w - 0.16)], mat: M.chrome }));
  doorPivot.add(door);
  g.add(doorPivot);

  // Magnets and a takeout menu on the door front.
  for (const [my, mz, col] of [[1.30, -0.30, 0xff5a3c], [1.22, -0.46, 0x3ca0ff], [1.44, -0.52, 0xffd23c]]) {
    door.add(cylinder({
      r: 0.018, h: 0.008, pos: [-0.035, my, mz], rotZ: Math.PI / 2,
      mat: mat({ color: col, roughness: 0.5 }),
    }));
  }
  const menu = plane(0.16, 0.22, M.paper);
  menu.position.set(-0.032, 1.26, -0.40);
  menu.rotation.y = -Math.PI / 2;
  menu.rotation.z = 0.06;
  door.add(menu);

  return {
    group: g,
    doorPivot,
    door,
    light,
    beerSlots,
    handlePos: new THREE.Vector3(x0 - 0.02, 1.02, z0 + 0.13),
    bounds: [[x0, 0, z0], [x0 + d, h, z0 + w]],
  };
}

/** A single beer can. */
export function makeBeerCan(M, { x, y, z, crushed = false, rotY = 0 }) {
  const g = group('beer');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  if (crushed) {
    g.add(cylinder({ r: 0.033, h: 0.05, pos: [0, 0.025, 0], mat: M.aluminium, rotZ: 0.4 }));
    return { group: g };
  }
  g.add(cylinder({ r: 0.033, h: 0.115, pos: [0, 0.058, 0], mat: M.beerLabel }));
  g.add(cylinder({ r: 0.030, h: 0.012, pos: [0, 0.121, 0], mat: M.aluminium }));
  g.add(cylinder({ r: 0.030, h: 0.010, pos: [0, 0.005, 0], mat: M.aluminium }));
  return { group: g };
}

/** Counter run with sink, cooktop, upper cabinets and a microwave. */
export function makeKitchen(M, { x, z0, z1, d = 0.62, wallX = 5 }) {
  const g = group('kitchen');
  const top = 0.92;
  const x0 = wallX - d;

  // Toe kick + carcass + counter top.
  g.add(boxFrom(x0 + 0.06, 0, z0, wallX, 0.10, z1, M.plasticGrey));
  g.add(boxFrom(x0, 0.10, z0, wallX, top - 0.04, z1, M.lightWood));
  g.add(boxFrom(x0 - 0.02, top - 0.04, z0, wallX, top, z1, M.counter));

  // Door fronts + pulls.
  const nDoors = Math.max(2, Math.round((z1 - z0) / 0.55));
  const dw = (z1 - z0) / nDoors;
  for (let i = 0; i < nDoors; i++) {
    const cz = z0 + dw * (i + 0.5);
    g.add(box({ size: [0.02, top - 0.22, dw - 0.03], pos: [x0 - 0.012, 0.10 + (top - 0.18) / 2, cz], mat: M.cabinet }));
    g.add(cylinder({ r: 0.010, h: 0.11, pos: [x0 - 0.035, top - 0.16, cz], mat: M.chrome }));
  }

  // Sink.
  const sinkZ = (z0 + z1) / 2 + 0.35;
  g.add(boxFrom(x0 + 0.10, top - 0.16, sinkZ - 0.22, wallX - 0.10, top - 0.02, sinkZ + 0.22, M.steel, { cast: false }));
  g.add(cylinder({ r: 0.016, h: 0.26, pos: [wallX - 0.14, top + 0.13, sinkZ], mat: M.chrome }));
  g.add(cylinder({ r: 0.013, h: 0.16, pos: [wallX - 0.26, top + 0.24, sinkZ], rotZ: Math.PI / 2, mat: M.chrome }));
  // A couple of dishes nobody has dealt with.
  g.add(cylinder({ r: 0.09, h: 0.012, pos: [x0 + 0.26, top - 0.13, sinkZ - 0.06], mat: M.paper }));
  g.add(cylinder({ r: 0.085, h: 0.012, pos: [x0 + 0.26, top - 0.115, sinkZ + 0.04], mat: M.paper, rotZ: 0.03 }));

  // Cooktop.
  const stoveZ = z0 + 0.55;
  g.add(boxFrom(x0 + 0.06, top, stoveZ - 0.26, wallX - 0.06, top + 0.012, stoveZ + 0.26, M.black, { cast: false }));
  for (const [bx, bz] of [[-0.12, -0.13], [0.12, -0.13], [-0.12, 0.13], [0.12, 0.13]]) {
    g.add(cylinder({ r: 0.055, h: 0.006, pos: [x0 + d / 2 + bx, top + 0.019, stoveZ + bz], mat: M.darkSteel }));
  }

  // Upper cabinets.
  const upY0 = 1.48, upY1 = 2.22, upD = 0.34;
  g.add(boxFrom(wallX - upD, upY0, z0, wallX, upY1, z1, M.lightWood));
  for (let i = 0; i < nDoors; i++) {
    const cz = z0 + dw * (i + 0.5);
    g.add(box({ size: [0.02, upY1 - upY0 - 0.04, dw - 0.03], pos: [wallX - upD - 0.012, (upY0 + upY1) / 2, cz], mat: M.cabinet }));
    g.add(cylinder({ r: 0.010, h: 0.11, pos: [wallX - upD - 0.035, upY0 + 0.12, cz], mat: M.chrome }));
  }

  // Microwave at the north end of the run.
  const mwZ = z0 + 0.05 + 0.24;
  g.add(box({ size: [0.42, 0.28, 0.48], pos: [wallX - 0.24, top + 0.14, mwZ], mat: M.plasticGrey }));
  const mwDoor = plane(0.30, 0.20, new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.25 }));
  mwDoor.position.set(wallX - 0.451, top + 0.15, mwZ - 0.04);
  mwDoor.rotation.y = -Math.PI / 2;
  g.add(mwDoor);
  const mwClock = plane(0.10, 0.035, M.ledGreen);
  mwClock.position.set(wallX - 0.451, top + 0.24, mwZ + 0.17);
  mwClock.rotation.y = -Math.PI / 2;
  g.add(mwClock);

  // Kettle + mug + knife block, because a kitchen needs stuff on it.
  g.add(cylinder({ rTop: 0.075, rBottom: 0.085, h: 0.18, pos: [x0 + 0.28, top + 0.09, z1 - 0.45], mat: M.steel }));
  g.add(cylinder({ r: 0.042, h: 0.095, pos: [x0 + 0.24, top + 0.048, z1 - 0.20], mat: mat({ color: 0x2f6b8a, roughness: 0.4 }) }));
  g.add(box({ size: [0.14, 0.24, 0.12], pos: [x0 + 0.24, top + 0.12, sinkZ + 0.50], mat: M.darkWood, rotY: 0.2 }));

  return {
    group: g,
    top,
    bounds: [[x0 - 0.04, 0, z0], [wallX, top, z1]],
    upperBounds: [[wallX - upD, upY0, z0], [wallX, upY1, z1]],
    sinkPos: new THREE.Vector3(x0, top + 0.1, sinkZ),
    microwavePos: new THREE.Vector3(x0 + 0.1, top + 0.15, mwZ),
  };
}

/* ------------------------------------------------------------------ */
/* Living area                                                         */
/* ------------------------------------------------------------------ */

/** Two-seat couch. `facing` is 'east' (arm-to-arm runs along z). */
export function makeCouch(M, { x, z, len = 2.15, depth = 0.88 }) {
  const g = group('couch');
  const x0 = x - depth / 2;
  const z0 = z - len / 2;

  g.add(boxFrom(x0, 0.14, z0, x0 + depth, 0.38, z0 + len, M.fabricCouch));           // base
  g.add(boxFrom(x0, 0.38, z0 + 0.06, x0 + 0.30, 0.86, z0 + len - 0.06, M.fabricCouch)); // backrest
  g.add(boxFrom(x0, 0.38, z0, x0 + depth, 0.66, z0 + 0.16, M.fabricCouch));          // arm
  g.add(boxFrom(x0, 0.38, z0 + len - 0.16, x0 + depth, 0.66, z0 + len, M.fabricCouch)); // arm

  // Seat + back cushions, slightly askew.
  for (let i = 0; i < 2; i++) {
    const cz = z0 + 0.20 + i * (len - 0.40) / 2 + (len - 0.40) / 4;
    g.add(box({ size: [depth - 0.34, 0.16, (len - 0.44) / 2 - 0.03], pos: [x0 + 0.30 + (depth - 0.34) / 2, 0.46, cz], mat: M.fabricCouch, rotY: i ? 0.02 : -0.015 }));
    g.add(box({ size: [0.14, 0.38, (len - 0.44) / 2 - 0.05], pos: [x0 + 0.36, 0.62, cz], mat: M.fabricCouch, rotZ: i ? 0.03 : -0.02 }));
  }
  // Throw blanket over one arm.
  g.add(box({ size: [depth - 0.1, 0.05, 0.34], pos: [x + 0.02, 0.68, z0 + 0.26], mat: mat({ color: 0x8a5a3c, roughness: 1 }), rotZ: 0.04 }));
  // Feet.
  for (const [fx, fz] of [[x0 + 0.10, z0 + 0.10], [x0 + depth - 0.10, z0 + 0.10],
                          [x0 + 0.10, z0 + len - 0.10], [x0 + depth - 0.10, z0 + len - 0.10]]) {
    g.add(cylinder({ r: 0.03, h: 0.14, pos: [fx, 0.07, fz], mat: M.darkWood }));
  }
  return { group: g, bounds: [[x0, 0, z0], [x0 + depth, 0.66, z0 + len]] };
}

export function makeCoffeeTable(M, { x, z, w = 1.05, d = 0.56 }) {
  const g = group('coffeetable');
  const h = 0.42;
  g.add(box({ size: [w, 0.04, d], pos: [x, h, z], mat: M.darkWood }));
  g.add(box({ size: [w - 0.20, 0.03, d - 0.16], pos: [x, 0.16, z], mat: M.darkWood }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box({ size: [0.05, h, 0.05], pos: [x + sx * (w / 2 - 0.06), h / 2, z + sz * (d / 2 - 0.06)], mat: M.darkWood }));
    }
  }
  return { group: g, top: h + 0.02, bounds: [[x - w / 2, 0, z - d / 2], [x + w / 2, h, z + d / 2]] };
}

/** Greasy pizza box, lid ajar. */
export function makePizzaBox(M, { x, y, z, rotY = 0 }) {
  const g = group('pizzabox');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(box({ size: [0.40, 0.045, 0.40], pos: [0, 0.022, 0], mat: M.cardboard }));
  const lid = box({ size: [0.40, 0.02, 0.40], pos: [0, 0.20, -0.19], mat: M.cardboard, rotX: -1.15 });
  g.add(lid);
  // One surviving slice.
  const slice = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 12, 0, Math.PI / 4),
    mat({ color: 0xd8a44e, roughness: 0.85, side: THREE.DoubleSide }),
  );
  slice.rotation.x = -Math.PI / 2;
  slice.position.set(0.02, 0.047, 0.02);
  g.add(slice);
  return { group: g };
}

/** Sideboard the radio lives on. */
export function makeSideboard(M, { x, z, w = 1.6, d = 0.44 }) {
  const g = group('sideboard');
  const h = 0.70;
  g.add(box({ size: [w, 0.045, d], pos: [x, h, z], mat: M.darkWood }));
  g.add(box({ size: [w - 0.06, h - 0.20, d - 0.04], pos: [x, h / 2 + 0.05, z], mat: M.lightWood }));
  for (let i = 0; i < 2; i++) {
    const dx = x - w / 4 + i * (w / 2);
    g.add(box({ size: [w / 2 - 0.08, h - 0.28, 0.02], pos: [dx, h / 2 + 0.05, z + d / 2 - 0.005], mat: M.darkWood }));
    g.add(cylinder({ r: 0.012, h: 0.10, pos: [dx, h / 2 + 0.05, z + d / 2 + 0.02], rotZ: Math.PI / 2, mat: M.chrome }));
  }
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.06, 0.14, 0.06], pos: [x + sx * (w / 2 - 0.08), 0.07, z], mat: M.darkWood }));
  }
  // Record crate underneath.
  const crate = group('records');
  crate.position.set(x + w / 2 - 0.32, 0, z - 0.02);
  crate.add(box({ size: [0.34, 0.34, 0.34], pos: [0, 0.17, 0], mat: M.cardboard }));
  for (let i = 0; i < 7; i++) {
    crate.add(box({
      size: [0.31, 0.31, 0.006],
      pos: [0, 0.19, -0.12 + i * 0.03],
      mat: mat({ color: new THREE.Color().setHSL((i * 0.13) % 1, 0.4, 0.4), roughness: 0.8 }),
      rotZ: (i - 3) * 0.008,
    }));
  }
  g.add(crate);

  return { group: g, top: h + 0.023, bounds: [[x - w / 2, 0, z - d / 2], [x + w / 2, h, z + d / 2]] };
}

/**
 * Vintage receiver / boombox. Returns handles for the dial, VU needle and
 * power LED so the radio can animate while playing.
 */
export function makeRadio(M, { x, y, z, rotY = 0 }) {
  const g = group('radio');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const bodyMat = mat({ color: 0x2a2724, roughness: 0.6 });
  const faceMat = mat({ color: 0x3a3530, roughness: 0.5 });
  g.add(box({ size: [0.52, 0.24, 0.22], pos: [0, 0.12, 0], mat: bodyMat }));
  g.add(box({ size: [0.50, 0.22, 0.01], pos: [0, 0.12, 0.111], mat: faceMat }));
  // Wood end caps.
  g.add(box({ size: [0.03, 0.24, 0.22], pos: [-0.262, 0.12, 0], mat: M.lightWood }));
  g.add(box({ size: [0.03, 0.24, 0.22], pos: [0.262, 0.12, 0], mat: M.lightWood }));

  // Speaker grilles.
  const grille = mat({ color: 0x17150f, roughness: 0.95 });
  for (const sx of [-0.17, 0.17]) {
    g.add(cylinder({ r: 0.072, h: 0.008, pos: [sx, 0.115, 0.116], rotX: Math.PI / 2, mat: grille }));
    for (let i = 0; i < 3; i++) {
      g.add(cylinder({ r: 0.062 - i * 0.018, h: 0.010, pos: [sx, 0.115, 0.118], rotX: Math.PI / 2, mat: M.plasticBlack, cast: false }));
    }
  }

  // Tuning scale with a needle.
  const dialFace = plane(0.14, 0.055, mat({ color: 0xd8c89a, roughness: 0.6, emissive: 0x000000 }));
  dialFace.position.set(0, 0.175, 0.117);
  g.add(dialFace);
  const needle = box({ size: [0.004, 0.05, 0.004], pos: [0, 0.175, 0.120], mat: M.ledRed });
  g.add(needle);

  // Knobs + a lit power ring.
  g.add(cylinder({ r: 0.022, h: 0.026, pos: [-0.20, 0.062, 0.118], rotX: Math.PI / 2, mat: M.plasticGrey }));
  g.add(cylinder({ r: 0.022, h: 0.026, pos: [0.20, 0.062, 0.118], rotX: Math.PI / 2, mat: M.plasticGrey }));
  const led = cylinder({ r: 0.008, h: 0.008, pos: [0, 0.055, 0.120], rotX: Math.PI / 2, mat: M.bulbOff });
  g.add(led);

  // Telescopic antenna.
  g.add(cylinder({ r: 0.004, h: 0.42, pos: [-0.22, 0.44, -0.06], rotZ: -0.22, mat: M.chrome }));

  return { group: g, needle, led, dialFace };
}

/* ------------------------------------------------------------------ */
/* Lighting fixtures                                                   */
/* ------------------------------------------------------------------ */

export function makeCeilingLight(M, { x, z, y = 2.62 }) {
  const g = group('ceilinglight');
  g.add(cylinder({ r: 0.012, h: 0.14, pos: [x, y + 0.10, z], mat: M.darkSteel }));
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.20, 24, 1, true),
    M.lampShade,
  );
  shade.position.set(x, y, z);
  shade.rotation.x = Math.PI;
  shade.castShadow = false;
  g.add(shade);
  const bulb = sphere({ r: 0.045, pos: [x, y - 0.05, z], mat: M.bulbOff, cast: false });
  g.add(bulb);
  return { group: g, bulb, pos: new THREE.Vector3(x, y - 0.06, z) };
}

export function makeFloorLamp(M, { x, z }) {
  const g = group('floorlamp');
  g.add(cylinder({ r: 0.14, h: 0.03, pos: [x, 0.015, z], mat: M.darkSteel }));
  g.add(cylinder({ r: 0.015, h: 1.42, pos: [x, 0.72, z], mat: M.darkSteel }));
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.19, 0.24, 20, 1, true),
    M.lampShade,
  );
  shade.position.set(x, 1.52, z);
  g.add(shade);
  const bulb = sphere({ r: 0.04, pos: [x, 1.50, z], mat: M.bulbOff, cast: false });
  g.add(bulb);
  return { group: g, bulb, pos: new THREE.Vector3(x, 1.50, z), bounds: [[x - 0.16, 0, z - 0.16], [x + 0.16, 0.1, z + 0.16]] };
}

/* ------------------------------------------------------------------ */
/* Odds and ends                                                       */
/* ------------------------------------------------------------------ */

export function makePlant(M, { x, z, scale = 1 }) {
  const g = group('plant');
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  g.add(cylinder({ rTop: 0.17, rBottom: 0.13, h: 0.26, pos: [0, 0.13, 0], mat: M.terracotta }));
  g.add(cylinder({ r: 0.155, h: 0.02, pos: [0, 0.26, 0], mat: M.soil }));
  g.add(cylinder({ r: 0.02, h: 0.5, pos: [0, 0.5, 0], mat: mat({ color: 0x4a3a24, roughness: 1 }) }));
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + i * 0.7;
    const h = 0.55 + (i % 4) * 0.14;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7), M.leaf);
    leaf.scale.set(1, 0.28, 0.55);
    leaf.position.set(Math.sin(a) * 0.16, h, Math.cos(a) * 0.16);
    leaf.rotation.set(0.5, a, 0.35);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return { group: g, bounds: [[x - 0.18, 0, z - 0.18], [x + 0.18, 0.3, z + 0.18]] };
}

export function makeWallClock(M, { x, y, z, rotY = 0 }) {
  const g = group('wallclock');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(cylinder({ r: 0.14, h: 0.04, pos: [0, 0, 0.02], rotX: Math.PI / 2, mat: M.darkWood }));
  const face = plane(0.24, 0.24, M.paper);
  face.position.set(0, 0, 0.041);
  g.add(face);
  const hourHand = box({ size: [0.012, 0.07, 0.004], pos: [0, 0.03, 0.046], mat: M.black });
  const minHand = box({ size: [0.008, 0.10, 0.004], pos: [0, 0.045, 0.048], mat: M.black });
  g.add(hourHand, minHand);
  return { group: g, hourHand, minHand };
}

/** Squatch bobblehead — the desk mascot. Head is returned so it can wobble. */
export function makeBobblehead(M, { x, y, z, rotY = 0 }) {
  const g = group('bobblehead');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(cylinder({ rTop: 0.045, rBottom: 0.055, h: 0.018, pos: [0, 0.009, 0], mat: M.black }));
  g.add(box({ size: [0.05, 0.07, 0.035], pos: [0, 0.055, 0], mat: M.fur }));
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.018, 0.06, 0.018], pos: [sx * 0.038, 0.058, 0], mat: M.fur, rotZ: sx * 0.25 }));
    g.add(box({ size: [0.02, 0.05, 0.025], pos: [sx * 0.018, 0.018, 0], mat: M.fur }));
  }
  const head = group('bobbleHead');
  head.position.set(0, 0.098, 0);
  head.add(sphere({ r: 0.042, ry: 0.046, pos: [0, 0, 0], mat: M.fur }));
  head.add(box({ size: [0.062, 0.012, 0.012], pos: [0, 0.014, 0.036], mat: mat({ color: 0x2a1d13, roughness: 1 }) }));
  for (const sx of [-1, 1]) {
    head.add(sphere({ r: 0.006, pos: [sx * 0.015, 0.006, 0.038], mat: mat({ color: 0xf0e8d0, roughness: 0.5 }) }));
  }
  g.add(head);
  return { group: g, head };
}

/** Cheap CRT-era desk speaker / bookshelf unit for the shelf. */
export function makeBooks(M, { x, y, z, count = 9, along = 'x' }) {
  const g = group('books');
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const h = 0.18 + ((i * 37) % 9) / 100;
    const t = 0.022 + ((i * 53) % 5) / 300;
    const col = new THREE.Color().setHSL(((i * 0.17) % 1), 0.35, 0.32 + ((i % 3) * 0.06));
    const lean = i === count - 2 ? 0.22 : 0;
    const b = box({
      size: along === 'x' ? [t, h, 0.15] : [0.15, h, t],
      pos: along === 'x' ? [x + cursor, y + h / 2, z] : [x, y + h / 2, z + cursor],
      mat: mat({ color: col, roughness: 0.9 }),
      rotZ: along === 'x' ? lean : 0,
      rotX: along === 'z' ? lean : 0,
    });
    g.add(b);
    cursor += t + 0.004;
  }
  return { group: g, extent: cursor };
}

/** Wall shelf with brackets. */
export function makeShelf(M, { x, y, z, w = 1.1, d = 0.22, rotY = 0 }) {
  const g = group('shelf');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(box({ size: [w, 0.035, d], pos: [0, 0, 0], mat: M.darkWood }));
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.025, 0.14, 0.16], pos: [sx * (w / 2 - 0.12), -0.085, -d / 2 + 0.08], mat: M.darkSteel }));
  }
  return { group: g };
}

/** Boots by the door. */
export function makeBoots(M, { x, z, rotY = 0 }) {
  const g = group('boots');
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const leather = mat({ color: 0x53381f, roughness: 0.9 });
  for (const sx of [-0.09, 0.09]) {
    g.add(box({ size: [0.11, 0.09, 0.28], pos: [sx, 0.045, 0], mat: leather, rotY: sx > 0 ? 0.12 : -0.1 }));
    g.add(box({ size: [0.11, 0.16, 0.12], pos: [sx, 0.14, -0.07], mat: leather, rotY: sx > 0 ? 0.12 : -0.1 }));
  }
  return { group: g };
}

/** Laundry pile — a few soft lumps. */
export function makeLaundry(M, { x, z }) {
  const g = group('laundry');
  g.position.set(x, 0, z);
  const cols = [0x3b4a58, 0x6a4038, 0x4a4a3c, 0x2f3a3a];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 0.12 + (i % 3) * 0.07;
    const lump = sphere({
      r: 0.13 + (i % 3) * 0.03,
      ry: 0.07 + (i % 2) * 0.02,
      pos: [Math.sin(a) * r, 0.06 + (i % 2) * 0.05, Math.cos(a) * r],
      mat: mat({ color: cols[i % cols.length], roughness: 1 }),
    });
    lump.rotation.set(0.2, a, 0.3);
    g.add(lump);
  }
  return { group: g };
}

/** Corkboard with pinned photos and a map — sets up the squatch-hunter vibe. */
export function makeCorkboard(M, { x, y, z, rotY = 0, w = 0.9, h = 0.66 }) {
  const g = group('corkboard');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(box({ size: [w, h, 0.02], pos: [0, 0, 0], mat: mat({ color: 0xb2864f, roughness: 1 }) }));
  g.add(box({ size: [w + 0.04, h + 0.04, 0.012], pos: [0, 0, -0.008], mat: M.frame }));

  const notes = [
    [-0.28, 0.16, 0.16, 0.12, 0xe9e0cb, -0.06],
    [-0.02, 0.19, 0.14, 0.18, 0xd8d2bd, 0.05],
    [0.26, 0.12, 0.20, 0.15, 0xe9e0cb, -0.03],
    [-0.24, -0.13, 0.18, 0.14, 0xf0e6a8, 0.08],
    [0.10, -0.16, 0.22, 0.16, 0xe9e0cb, -0.07],
  ];
  for (const [nx, ny, nw, nh, col, rot] of notes) {
    const n = box({ size: [nw, nh, 0.004], pos: [nx, ny, 0.013], mat: mat({ color: col, roughness: 1 }), rotZ: rot });
    g.add(n);
    g.add(cylinder({ r: 0.008, h: 0.012, pos: [nx, ny + nh / 2 - 0.015, 0.021], rotX: Math.PI / 2, mat: M.ledRed }));
  }
  // Red string connecting two of them, obviously.
  const string = box({ size: [0.42, 0.004, 0.004], pos: [-0.02, 0.02, 0.024], mat: mat({ color: 0xc0281e, roughness: 1 }), rotZ: -0.55 });
  g.add(string);
  return { group: g };
}

/**
 * A framed picture. If `texture` is null it renders a procedurally drawn
 * placeholder so the wall is never empty before the player adds their own art.
 */
export function makeFrame(M, { x, y, z, rotY = 0, w = 0.5, h = 0.65, texture = null, tint = 0x1c1712 }) {
  const g = group('frame');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const bezel = 0.035;
  g.add(box({ size: [w + bezel * 2, h + bezel * 2, 0.035], pos: [0, 0, -0.018], mat: mat({ color: tint, roughness: 0.55 }) }));
  // Mount board peeking out around the art.
  g.add(box({ size: [w + 0.012, h + 0.012, 0.004], pos: [0, 0, 0.001], mat: M.paper }));

  const artMat = texture
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.62 })
    : new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8 });
  const art = plane(w, h, artMat);
  art.position.set(0, 0, 0.004);
  g.add(art);

  // Glass sheen.
  const glass = plane(w + 0.01, h + 0.01, new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.06,
  }));
  glass.position.set(0, 0, 0.02);
  g.add(glass);

  return { group: g, art, artMat };
}

/**
 * A photo frame that stands on furniture, with an easel leg behind it.
 * `w`/`h` are the picture size; the frame is built around them.
 */
export function makeStandingFrame(M, { x, y, z, rotY = 0, w = 0.16, h = 0.20, texture = null, tint = 0x2a1d12 }) {
  const g = group('standingFrame');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const bezel = 0.022;
  const panel = group('framePanel');
  panel.rotation.x = 0.14;          // tipped back, like a real easel frame
  panel.position.y = h / 2 + bezel;

  panel.add(box({ size: [w + bezel * 2, h + bezel * 2, 0.014], pos: [0, 0, -0.007], mat: mat({ color: tint, roughness: 0.5 }) }));
  panel.add(box({ size: [w + 0.008, h + 0.008, 0.003], pos: [0, 0, 0.0005], mat: M.paper }));

  const art = plane(w, h, texture
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55 })
    : new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8 }));
  art.position.set(0, 0, 0.003);
  panel.add(art);

  const glass = plane(w + 0.006, h + 0.006, new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.08,
  }));
  glass.position.set(0, 0, 0.008);
  panel.add(glass);

  // Easel leg, splayed back to meet the surface.
  const leg = box({ size: [0.03, h * 0.8, 0.008], pos: [0, 0, -0.02], mat: mat({ color: tint, roughness: 0.7 }) });
  leg.rotation.x = -0.42;
  panel.add(leg);

  g.add(panel);
  return { group: g, art };
}

/**
 * Round wall crest / patch. Alpha-cut so a transparent logo reads as a
 * circular badge rather than a square card, with a thin backing disc.
 */
export function makeRoundCrest(M, { x, y, z, rotY = 0, r = 0.22, texture = null }) {
  const g = group('crest');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  // Backing disc, so the badge has thickness against the wall.
  g.add(cylinder({
    r: r * 0.93, h: 0.018, pos: [0, 0, -0.010], rotX: Math.PI / 2,
    mat: mat({ color: 0x1d1a26, roughness: 0.6 }),
  }));

  const face = plane(r * 2, r * 2, texture
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, transparent: true, alphaTest: 0.35 })
    : new THREE.MeshStandardMaterial({ color: 0x3b3350, roughness: 0.7 }));
  face.position.z = 0.002;
  g.add(face);

  return { group: g, face };
}

/**
 * Flat decal for stickers and fridge magnets. The caller parents it, so it
 * rides along with whatever it is stuck to -- like a swinging fridge door.
 */
export function makeDecal(M, { texture, w = 0.16, h = 0.16, magnet = false }) {
  const g = group('decal');
  const face = plane(w, h, texture
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, transparent: true, alphaTest: 0.3 })
    : new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 }));
  g.add(face);
  if (magnet) {
    // A little disc at one corner so it reads as held on, not printed on.
    g.add(cylinder({
      r: 0.012, h: 0.006, pos: [w * 0.30, h * 0.32, -0.005], rotX: Math.PI / 2,
      mat: mat({ color: 0x2b2b30, roughness: 0.5 }),
    }));
  }
  return { group: g, face };
}

/**
 * Hanging fabric banner / flag — the other classic way to display gear.
 * Slight wave built into the geometry so it does not read as a flat card.
 */
export function makeBanner(M, { x, y, z, rotY = 0, w = 0.9, h = 1.2, texture = null }) {
  const g = group('banner');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const geo = new THREE.PlaneGeometry(w, h, 14, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    pos.setZ(i, Math.sin((px / w) * Math.PI * 2.2) * 0.016);
  }
  geo.computeVertexNormals();

  const m = texture
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color: 0x2f3a30, roughness: 0.95, side: THREE.DoubleSide });
  const cloth = new THREE.Mesh(geo, m);
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  g.add(cloth);

  // Dowel + cord.
  g.add(cylinder({ r: 0.012, h: w + 0.10, pos: [0, h / 2 + 0.02, 0], rotZ: Math.PI / 2, mat: M.lightWood }));
  return { group: g, cloth, material: m };
}

/** A cap hanging on a wall peg. */
export function makeCapOnPeg(M, { x, y, z, rotY = 0, color = 0x3a4a3c }) {
  const g = group('cap');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(cylinder({ r: 0.012, h: 0.09, pos: [0, 0, -0.045], rotX: Math.PI / 2, mat: M.lightWood }));
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.088, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat({ color, roughness: 0.9 }));
  crown.position.set(0, -0.02, 0.01);
  crown.rotation.x = 0.5;
  crown.castShadow = true;
  g.add(crown);
  const brim = new THREE.Mesh(new THREE.CircleGeometry(0.10, 16, 0, Math.PI), mat({ color, roughness: 0.9, side: THREE.DoubleSide }));
  brim.position.set(0, -0.055, 0.075);
  brim.rotation.set(-1.1, 0, 0);
  g.add(brim);
  return { group: g };
}

/**
 * Soft pack of cigarettes, lid flipped open, with a couple standing proud.
 * Returned `pack` is the whole thing so it can be hidden once picked up.
 */
export function makeCigarettePack(M, { x, y, z, rotY = 0 }) {
  const g = group('cigs');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const packMat = mat({ color: 0xb8352c, roughness: 0.62 });
  const foilMat = mat({ color: 0xc9b06a, roughness: 0.35, metalness: 0.5 });
  const paperMat = mat({ color: 0xf2ece0, roughness: 0.9 });
  const filterMat = mat({ color: 0xc59a58, roughness: 0.95 });

  // Body, with a white band round the base like every soft pack.
  g.add(box({ size: [0.056, 0.084, 0.024], pos: [0, 0.042, 0], mat: packMat }));
  g.add(box({ size: [0.058, 0.016, 0.026], pos: [0, 0.010, 0], mat: paperMat }));
  // Foil liner peeking out of the open top.
  g.add(box({ size: [0.048, 0.014, 0.018], pos: [0, 0.090, 0], mat: foilMat }));
  // Flip-top lid, hinged back.
  g.add(box({ size: [0.056, 0.030, 0.024], pos: [0, 0.098, -0.020], mat: packMat, rotX: -0.85 }));

  // Two cigarettes standing up out of the foil.
  for (const [ox, oz, lean] of [[-0.010, 0.002, 0.06], [0.011, -0.004, -0.09]]) {
    g.add(cylinder({ r: 0.0035, h: 0.030, pos: [ox, 0.106, oz], mat: paperMat, rotZ: lean }));
    g.add(cylinder({ r: 0.0035, h: 0.010, pos: [ox, 0.090, oz], mat: filterMat, rotZ: lean }));
  }

  // Lighter lying beside the pack.
  const lighter = group('lighter');
  lighter.position.set(0.062, 0, 0.014);
  lighter.rotation.y = 0.5;
  lighter.add(box({ size: [0.022, 0.012, 0.058], pos: [0, 0.006, 0], mat: mat({ color: 0xd8a11e, roughness: 0.4 }) }));
  lighter.add(box({ size: [0.016, 0.008, 0.012], pos: [0, 0.015, -0.020], mat: M.chrome }));
  g.add(lighter);

  return { group: g, lighter };
}

/** Glass ashtray with a couple of dead soldiers in it. */
export function makeAshtray(M, { x, y, z, rotY = 0 }) {
  const g = group('ashtray');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xb9c6c9, roughness: 0.12, transmission: 0.7,
    transparent: true, opacity: 0.55, thickness: 0.02,
  });
  g.add(cylinder({ rTop: 0.052, rBottom: 0.040, h: 0.022, pos: [0, 0.011, 0], mat: glass }));
  g.add(cylinder({ r: 0.038, h: 0.004, pos: [0, 0.020, 0], mat: mat({ color: 0x4a463f, roughness: 1 }) }));
  const butt = mat({ color: 0xd9cdb4, roughness: 0.95 });
  for (const [bx, bz, r] of [[-0.012, 0.008, 0.5], [0.014, -0.006, 2.1], [0.004, 0.018, 1.2]]) {
    g.add(cylinder({ r: 0.0035, h: 0.020, pos: [bx, 0.024, bz], rotZ: Math.PI / 2, rotY: r, mat: butt }));
  }
  return { group: g };
}

/**
 * The lit cigarette held in view while smoking: a stub with a glowing ember.
 * Parented to the camera by main.js; the smoke itself comes from SmokeSystem.
 */
export function makeHeldCigarette() {
  const g = group('heldCig');
  const paperMat = mat({ color: 0xf2ece0, roughness: 0.9 });
  g.add(cylinder({ r: 0.0038, h: 0.052, pos: [0, 0, 0], rotZ: Math.PI / 2, mat: paperMat }));
  g.add(cylinder({ r: 0.0038, h: 0.016, pos: [-0.030, 0, 0], rotZ: Math.PI / 2, mat: mat({ color: 0xc59a58, roughness: 0.95 }) }));
  const ember = cylinder({
    r: 0.0042, h: 0.006, pos: [0.028, 0, 0], rotZ: Math.PI / 2,
    mat: new THREE.MeshStandardMaterial({
      color: 0x1a0a04, emissive: 0xff5a1e, emissiveIntensity: 2.2, roughness: 1,
    }),
  });
  g.add(ember);
  // Small warm light so the ember actually reads in a dark room.
  const glow = new THREE.PointLight(0xff6a24, 0.35, 0.5, 2);
  glow.position.set(0.030, 0, 0);
  g.add(glow);
  return { group: g, ember, glow };
}

/** Free-standing "SQUATCH CROSSING" sign leaning in a corner. */
export function makeCrossingSign(M, { x, z, rotY = 0 }) {
  const g = group('sign');
  g.position.set(x, 0, z);
  g.rotation.set(0, rotY, 0.09);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d');
  c.fillStyle = '#e8c11c';
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = '#1a1a1a';
  c.lineWidth = 10;
  c.strokeRect(14, 14, 228, 228);
  drawSquatchSilhouette(c, 128, 176, 128, '#151515');
  c.fillStyle = '#151515';
  c.font = 'bold 26px "Courier New", monospace';
  c.textAlign = 'center';
  c.fillText('CROSSING', 128, 222);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  g.add(cylinder({ r: 0.018, h: 1.1, pos: [0, 0.55, 0], mat: M.darkSteel }));
  const board = box({ size: [0.44, 0.44, 0.014], pos: [0, 1.16, 0.01], mat: mat({ map: tex, roughness: 0.6 }) });
  g.add(board);
  return { group: g, bounds: [[x - 0.24, 0, z - 0.12], [x + 0.24, 1.4, z + 0.12]] };
}
