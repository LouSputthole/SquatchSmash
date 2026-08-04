/**
 * The fitting room.
 *
 * `src/core/wardrobe.js` is the ledger of what the Family wears; this is the
 * mirror. It builds every canonical model with the club's own `makePerson`,
 * under the club's own light, so that a note about a cuff or a chain can be
 * made against the actual geometry rather than against a description of it.
 *
 * Three rules it follows, and they are the reason it is worth having:
 *
 *  1. **It reads the ledger, it does not restate it.** Every figure here is
 *     the frozen model object imported from `src/core/wardrobe.js`. If the
 *     preview and the game ever disagree, the preview is wrong by
 *     construction, which is the only way a fitting room stays honest.
 *  2. **It shows the light the scene shows.** A gold chain under a studio
 *     key is jewellery; under one warm bulb at the Bing it is a smear. Both
 *     are real, so both are here, plus daylight for the boat and the golf.
 *  3. **It says what it is showing.** The caption is generated from the model
 *     object's own keys, so it cannot describe a watch the figure does not
 *     have.
 */
import * as THREE from 'three';
import { makePerson } from '../bing/cast.js';
import { WARDROBE } from '../core/wardrobe.js';
import { BILLY_HOTDOG_MODEL } from '../core/hotdog-model.js';
import { APE_FAMILY_MEMBER } from '../bing/family-ape.js';

/* Who is on the rail, in the order the player meets them. `photo` is the file
 * the face WILL come from -- present or not; the index decides. */
export const RAIL = [
  { key: 'lou', name: 'Big Uncle Lou Sputthole', photo: 'lou.png', model: WARDROBE.lou,
    note: 'Every expensive thing at once. Suit, gold buckle, gold watch, gold rope, pocket square.' },
  { key: 'captain_lou_sasole', name: 'Captain Lou Sasole', photo: 'sasole.png', model: WARDROBE.captain_lou_sasole,
    note: 'A working pilot. The good thing he owns is the jacket; everything else is serviceable.' },
  { key: 'booski', name: 'Booskibro', photo: 'booski.png', model: WARDROBE.booski,
    note: 'Old money by comparison — the same gold, but on a knit, and the chain is layered rather than loud.' },
  { key: 'deathmegatron', name: 'DeathMegatron', photo: 'deathmegatron.png', model: WARDROBE.deathmegatron,
    note: 'One of the FIVE. Boss, not crew: midnight suit, luxury finish, layered gold on the founders’ crest.' },
  { key: 'ape', name: 'Ape', photo: 'ape.png', model: APE_FAMILY_MEMBER.model,
    note: 'The one who does the work. Black tee, boots and a belt, and nothing else.' },
  { key: 'snow', name: 'Snow', photo: 'snow.png', model: WARDROBE.snow,
    note: 'Cleans up after people. A belt and boots and nothing else, and that is the point.' },
  { key: 'shubenator', name: 'Shubenator', photo: 'shubes.png', model: WARDROBE.shubenator,
    note: 'The blue tee and the frame that comes through a door before he does.' },
  { key: 'rippinflow', name: 'Rippinflow', photo: 'rippinflow.png', model: WARDROBE.rippinflow,
    note: 'One thin silver line and nothing hanging off it. A different man saying a different thing with his neck.' },
  { key: 'numbskull', name: 'Numbskull', photo: 'numbskull.png', model: WARDROBE.numbskull,
    note: 'Tallest and heaviest on the roster. Bald, plain, and takes up a doorway.' },
  { key: 'hogmama', name: 'Hog Mama', photo: 'hogmama.png', model: WARDROBE.hogmama,
    note: 'Luxury finish and a gold watch over a working shirt.' },
  { key: 'willy', name: 'Willy', photo: 'willy.png', model: WARDROBE.willy,
    note: 'The gut is the silhouette. Receding, bearded, belted under it.' },
  { key: 'eric', name: 'Eric', photo: 'erican.png', model: WARDROBE.eric,
    note: 'Trim on, watch on: he is somebody the player stands in front of and talks to.' },
  { key: 'gratin', name: 'Gratin', photo: 'gratin.png', model: WARDROBE.gratin,
    note: 'Loyal to the wrong shrimp. Olive shirt, leather belt.' },
  { key: 'irish', name: 'Irish', photo: 'irish.png', model: WARDROBE.irish,
    note: 'Green over the beard, on the dock or on the boat.' },
  { key: 'aubbie', name: 'Aubbie', photo: 'aubbie.png', model: WARDROBE.aubbie,
    note: 'Work clothes, because that is what the night turns into.' },
  { key: 'billy', name: 'Billy HotDog', photo: 'billy.png', model: BILLY_HOTDOG_MODEL,
    note: 'The man in the trunk. Canonical from src/core/hotdog-model.js so the body is visibly the man who went down.' },
];

/* ------------------------------------------------------------------ */
/* The caption, generated from the model rather than written           */
/* ------------------------------------------------------------------ */

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * What this figure is actually wearing, read off the frozen model object.
 * Written this way so the panel cannot describe a watch the figure does not
 * have -- the commonest way a "reference" sheet goes stale.
 */
export function describe(model) {
  const rows = [];
  const push = (k, v) => { if (v !== undefined && v !== false && v !== null) rows.push([k, v]); };
  push('height', `${model.height.toFixed(2)} m`);
  push('build', model.build?.toFixed(2));
  if (model.gut) push('gut', model.gut.toFixed(2));
  push('dress', model.dress ?? 'shirt');
  push('shirt', model.shirt !== undefined ? hex(model.shirt) : null);
  push('shirtAccent', model.shirtAccent !== undefined ? hex(model.shirtAccent) : null);
  push('jacketColour', model.jacketColour !== undefined ? hex(model.jacketColour) : null);
  push('patches', model.patches ? 'squadron' : false);
  push('trim', model.trim ? 'collar, placket, buttons, cuffs' : false);
  push('belt', model.belt);
  push('trouserFit', model.trouserFit && model.trouserFit !== 'plain' ? model.trouserFit : false);
  push('watch', model.watch);
  push('chain', model.chain === true ? 'gold' : model.chain);
  push('chainStyle', model.chain ? (model.chainStyle ?? 'single') : false);
  push('pendant', model.chain && model.pendant !== false ? (model.pendantStyle ?? 'disc') : false);
  push('luxury', model.luxury ? 'yes' : false);
  push('neckline', model.neckline);
  push('hair', model.hair ?? 'short');
  push('beard', model.beard ? 'yes' : false);
  push('glasses', model.glasses ? 'yes' : false);
  push('gender', model.gender && model.gender !== 'unspecified' ? model.gender : false);
  push('bodyShape', model.bodyShape && model.bodyShape !== 'average' ? model.bodyShape : false);
  return rows;
}

/* ------------------------------------------------------------------ */
/* Light                                                               */
/* ------------------------------------------------------------------ */

/* Three rigs, because these people are judged in three different rooms and a
 * garment that only works in one of them is not finished. `bing` is the club:
 * one warm practical, almost no fill, which is where the gold either reads or
 * disappears. `day` is the boat and the golf. `studio` is the neutral one for
 * judging colour and cut without a room's opinion on top. */
export const RIGS = {
  bing: {
    label: 'Bada Bing — one warm bulb',
    bg: 0x0d0b0c,
    hemi: [0x3a2a24, 0x120c0a, 0.42],
    key: { colour: 0xffb066, power: 2.5, pos: [1.6, 3.0, 2.2] },
    fill: { colour: 0x3c4a78, power: 0.42, pos: [-2.6, 1.6, -2.0] },
    ground: 0x17110f,
  },
  day: {
    label: 'Daylight — deck and fairway',
    bg: 0x8fb2d4,
    hemi: [0xcfe2f2, 0x6a6a52, 1.25],
    key: { colour: 0xfff3dd, power: 2.1, pos: [2.6, 4.2, 2.6] },
    fill: { colour: 0xa8c8e8, power: 0.6, pos: [-2.8, 2.0, -1.8] },
    ground: 0x5d6a4a,
  },
  studio: {
    label: 'Studio — neutral, for cut and colour',
    bg: 0x1b1d22,
    hemi: [0xc4ccd8, 0x2a2c33, 1.05],
    key: { colour: 0xffffff, power: 1.8, pos: [2.2, 3.6, 3.0] },
    fill: { colour: 0xdfe6f2, power: 0.75, pos: [-2.6, 2.2, 1.2] },
    ground: 0x24262c,
  },
};

/* ------------------------------------------------------------------ */
/* Detail marks                                                        */
/* ------------------------------------------------------------------ */

/* `aim` is the part the camera should actually look at, found by name in the
 * figure that was just built. A detail camera placed at a guessed fraction of
 * the height is wrong for somebody else's proportions and wrong again the
 * moment the turntable moves -- the first wrist shot framed a hip, from
 * inside the jacket, because 0.50 of Lou's height is not where Lou's watch
 * is. `y`/`x` are the fallback for a figure that has no such part: fractions
 * of the figure's own height, and metres sideways. The figures face +Z, so a
 * character's own LEFT hand -- the watch hand -- is on +X. */
export const MARKS = {
  full: { label: 'Full length', y: 0.50, dist: 3.55, x: 0, pitch: -0.04 },
  face: { label: 'Head', aim: 'head', y: 0.925, dist: 0.95, x: 0, pitch: 0.02 },
  chest: {
    label: 'Collar & chain',
    aim: ['necklace.pendant', 'necklace.chain', 'tuxedo.shirt.front', 'person.collar'],
    y: 0.79, dist: 1.25, x: 0, pitch: -0.02,
  },
  wrist: {
    label: 'Watch hand',
    aim: ['person.watch.dial', 'person.watch.bracelet', 'handL'],
    y: 0.50, dist: 0.55, x: 0.235, pitch: -0.05,
  },
  waist: {
    label: 'Belt & trousers',
    aim: ['belt.buckle', 'person.belt'],
    y: 0.53, dist: 1.30, x: 0, pitch: -0.03,
  },
  feet: { label: 'Shoes & turn-ups', y: 0.13, dist: 1.30, x: 0, pitch: -0.14 },
};

export const MARK_ORDER = ['full', 'face', 'chest', 'wrist', 'waist', 'feet'];

/* ------------------------------------------------------------------ */
/* The room                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the fitting room into a canvas.
 *
 * Returns a small handle rather than taking over the page, so the shot tool
 * can drive it frame by frame while the browser drives it with a mouse.
 */
const _aim = new THREE.Vector3();

export function createFittingRoom(canvas, { faces = new Set() } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.top = 3; key.shadow.camera.bottom = -1;
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  const fill = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(hemi, key, fill, key.target, fill.target);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.96 });
  /* Big enough that the line-up camera, which stands well back, is still over
   * it. At radius 9 the whole bottom third of the rail shot was the void the
   * floor had run out into. */
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'fitting.ground';
  scene.add(ground);

  /* A turntable disc under the figure, because a figure standing on an
   * infinite plane has nothing to be rotating against and the turntable
   * reads as the camera swinging instead. */
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.66, 0.05, 40),
    new THREE.MeshStandardMaterial({ color: 0x3a3d46, roughness: 0.7, metalness: 0.15 }),
  );
  disc.position.y = 0.025;
  disc.receiveShadow = true;
  disc.name = 'fitting.turntable';
  scene.add(disc);

  /** The one figure on the stand, or the whole rail in lineup mode. */
  const stand = new THREE.Group();
  stand.name = 'fitting.stand';
  scene.add(stand);

  const state = {
    index: 0,
    rig: 'bing',
    mark: 'full',
    lineup: false,
    lineupWidth: 0,
    lineupFrom: 0,
    lineupCount: RAIL.length,
    turntable: true,
    spin: 0,
    yaw: 0,
    pitch: -0.04,
    dist: 3.15,
    target: new THREE.Vector3(0, 0.95, 0),
    height: 1.8,
  };

  function faceUrl(entry) {
    return faces.has(entry.photo) ? `assets/faces/${entry.photo}` : null;
  }

  function clearStand() {
    for (const child of [...stand.children]) {
      stand.remove(child);
      child.traverse?.((n) => {
        if (n.geometry) n.geometry.dispose?.();
      });
    }
  }

  function buildOne(entry) {
    const person = makePerson({ ...entry.model, face: faceUrl(entry), castShadow: true });
    person.group.name = `fitting.${entry.key}`;
    person.group.userData.wardrobeKey = entry.key;
    return person;
  }

  function showSolo(index) {
    state.index = ((index % RAIL.length) + RAIL.length) % RAIL.length;
    state.lineup = false;
    clearStand();
    const entry = RAIL[state.index];
    const person = buildOne(entry);
    stand.add(person.group);
    state.height = entry.model.height ?? 1.78;
    disc.visible = true;
    disc.scale.setScalar(1);
    applyMark(state.mark);
    return entry;
  }

  /**
   * The rail, or a slice of it.
   *
   * Sixteen people across one frame puts each of them at about a sixth of the
   * height, which is enough to check that they read as one family and not
   * enough to check anything else. Half a rail at a time is twice the man.
   */
  function showLineup(from = 0, count = RAIL.length) {
    state.lineup = true;
    state.lineupFrom = from;
    state.lineupCount = count;
    clearStand();
    /* Spacing is by shoulder, not by name: a 1.45-build Numbskull beside a
     * 0.95-build Snow at a fixed pitch either overlaps or leaves a hole. */
    let x = 0;
    const placed = [];
    for (const entry of RAIL.slice(from, from + count)) {
      const person = buildOne(entry);
      const halfWidth = 0.30 + (entry.model.build ?? 1) * 0.16;
      x += halfWidth;
      person.group.position.x = x;
      stand.add(person.group);
      placed.push(person);
      x += halfWidth + 0.10;
    }
    const width = x;
    for (const person of placed) person.group.position.x -= width / 2;
    disc.visible = false;
    state.target.set(0, 1.0, 0);
    state.lineupWidth = width;
    frameLineup();
    state.pitch = -0.03;
    state.yaw = 0;
    return width;
  }

  /* Pull back until the rail fits the frame HORIZONTALLY. A fixed multiple of
   * the width is only correct at one aspect ratio, and the first contact sheet
   * was shot into a 370px column between two panels, which cut seven people
   * off the ends. */
  function frameLineup() {
    const halfV = THREE.MathUtils.degToRad(camera.fov) / 2;
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    state.dist = (state.lineupWidth / 2) / Math.tan(halfH) * 1.06;
  }

  /** The first part on the list that this figure actually has, or null. */
  function findPart(names) {
    for (const wanted of [names].flat()) {
      let hit = null;
      stand.traverse((n) => { if (!hit && n.name === wanted) hit = n; });
      if (hit) return hit;
    }
    return null;
  }

  function applyMark(name) {
    const mark = MARKS[name] ?? MARKS.full;
    state.mark = MARKS[name] ? name : 'full';
    if (state.lineup) return;
    const h = state.height;
    state.dist = mark.dist * (h / 1.8);
    state.pitch = mark.pitch;
    const part = mark.aim ? findPart(mark.aim) : null;
    if (part) {
      /* Into the stand's own space, so the turntable carries the camera round
       * with the detail instead of leaving it pointed where the watch was. */
      stand.updateMatrixWorld(true);
      part.getWorldPosition(state.target);
      stand.worldToLocal(state.target);
    } else {
      state.target.set(mark.x, mark.y * h, 0);
    }
  }

  function applyRig(name) {
    const rig = RIGS[name] ?? RIGS.bing;
    state.rig = RIGS[name] ? name : 'bing';
    scene.background = new THREE.Color(rig.bg);
    hemi.color.setHex(rig.hemi[0]);
    hemi.groundColor.setHex(rig.hemi[1]);
    hemi.intensity = rig.hemi[2];
    key.color.setHex(rig.key.colour);
    key.intensity = rig.key.power;
    key.position.set(...rig.key.pos);
    fill.color.setHex(rig.fill.colour);
    fill.intensity = rig.fill.power;
    fill.position.set(...rig.fill.pos);
    groundMat.color.setHex(rig.ground);
    return rig;
  }

  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    if (state.lineup) frameLineup();
  }

  function render(dt = 0) {
    if (state.turntable && !state.lineup) state.spin += dt * 0.45;
    stand.rotation.y = state.lineup ? 0 : state.spin;
    disc.rotation.y = state.spin;
    /* `state.target` is in the STAND's space, not the world's, so a detail
     * camera locked onto a watch stays locked onto it while the turntable
     * turns. Carry it round by hand rather than parenting the camera to the
     * stand, which would spin the lighting with it. */
    const s = Math.sin(stand.rotation.y);
    const c = Math.cos(stand.rotation.y);
    _aim.set(
      state.target.x * c + state.target.z * s,
      state.target.y,
      -state.target.x * s + state.target.z * c,
    );
    /* The figures face +Z, so the camera starts on +Z looking back at them:
     * yaw 0 is a front view, which is what a fitting room owes you first. */
    const cx = Math.sin(state.yaw) * Math.cos(state.pitch) * state.dist;
    const cz = Math.cos(state.yaw) * Math.cos(state.pitch) * state.dist;
    const cy = Math.sin(state.pitch) * state.dist;
    camera.position.set(_aim.x + cx, _aim.y + cy, _aim.z + cz);
    camera.lookAt(_aim);
    key.target.position.copy(_aim);
    fill.target.position.copy(_aim);
    key.target.updateMatrixWorld();
    fill.target.updateMatrixWorld();
    renderer.render(scene, camera);
  }

  applyRig('bing');
  showSolo(0);

  return {
    scene, camera, renderer, state, stand,
    showSolo, showLineup, applyMark, applyRig, resize, render,
    current: () => RAIL[state.index],
    keys: () => RAIL.map((entry) => entry.key),
  };
}
