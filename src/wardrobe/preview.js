/**
 * The fitting room, and the workshop it grew into.
 *
 * `src/core/wardrobe.js` is the ledger of what the Family wears and
 * `src/core/appearances.js` is the ledger of who is in what while wearing it;
 * this is the mirror for both. It builds every model with the club's own
 * `makePerson`, under the club's own light, so that a note about a cuff or a
 * chain can be made against the actual geometry rather than against a
 * description of it.
 *
 * Three rules it follows, and they are the reason it is worth having:
 *
 *  1. **It reads the ledgers, it does not restate them.** Every figure here is
 *     a frozen model object imported from `src/core/wardrobe.js` or handed
 *     over by `src/core/appearances.js`. If the preview and the game ever
 *     disagree, the preview is wrong by construction, which is the only way a
 *     fitting room stays honest.
 *  2. **It shows the light the scene shows.** A gold chain under a studio
 *     key is jewellery; under one warm bulb at the Bing it is a smear. Both
 *     are real, so both are here, plus daylight for the boat and the golf —
 *     and picking a scene picks that scene's own rig, because a garment
 *     judged under the wrong room is a garment nobody has looked at.
 *  3. **It says what it is showing.** The caption is generated from the model
 *     object's own keys, so it cannot describe a watch the figure does not
 *     have. The same rule makes the across-scenes comparison honest: the
 *     differences it highlights are computed from the two models, never typed.
 *
 * ## The three views
 *
 * - **Canonical** — the original rail. One person, one model, the wardrobe's
 *   own answer with no scene's opinion on top.
 * - **By scene** — everybody in one scene, side by side, under that scene's
 *   rig. "Who is in this room and what have they got on."
 * - **By character** — one person in every scene they are in, side by side.
 *   This is the view the owner asked for and the one the appearance ledger
 *   was written to make possible: Big Uncle Lou's four outfits in one frame,
 *   which is a thing nobody in this project has ever been able to look at.
 */
import * as THREE from 'three';
import { makePerson } from '../bing/cast.js';
import { WARDROBE } from '../core/wardrobe.js';
import { BILLY_HOTDOG_MODEL } from '../core/hotdog-model.js';
import { APE_FAMILY_MEMBER } from '../bing/family-ape.js';
import {
  PHOTOS, SCENES, appearancesInScene, appearancesOf, isShowable,
} from '../core/appearances.js';

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
    note: 'One of the FIVE. Boss, not crew: a sharp midnight suit and the luxury finish, and none of the men’s gold — no chain, no watch.' },
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
    note: 'Luxury finish over a working shirt, and no watch — the roster’s women don’t wear one.' },
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
  { key: 'james_blond', name: 'James Blond', photo: 'blond.png', model: WARDROBE.james_blond,
    note: 'The one tuxedo on the roster. Midnight bib and satin lapels, a bow tie, nothing else fighting it for the same plane.' },
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
/* The comparison, computed rather than written                        */
/* ------------------------------------------------------------------ */

/**
 * One person's outfits across several scenes, as a table you can read down.
 *
 * The whole value of the by-character view is spotting that Numbskull is
 * 1.95 in five scenes and 1.72 in the sixth, so the difference has to be
 * COMPUTED. A hand-written "note the height change" is stale the moment
 * somebody edits the heist, and a hand-written one that was never true is
 * worse — this is the same argument `describe()` already makes about the
 * spec panel, applied to a row of people instead of one.
 *
 * Returns `{ columns, rows }`, where a row is
 * `{ key, values, differs }` — `values` in column order, `differs` true when
 * they are not all the same. Rows that are the same everywhere sort to the
 * bottom, because they are the ones nobody is looking for.
 */
export function compare(appearances) {
  const shown = appearances.filter(isShowable);
  const columns = shown.map((a) => ({
    scene: a.scene,
    label: SCENES[a.scene]?.short ?? a.scene,
    full: SCENES[a.scene]?.label ?? a.scene,
    where: a.where,
    appearance: a,
  }));
  const keys = [];
  for (const a of shown) {
    for (const [key] of describe(a.model)) if (!keys.includes(key)) keys.push(key);
  }
  const rows = keys.map((key) => {
    const values = shown.map((a) => {
      const found = describe(a.model).find(([k]) => k === key);
      return found ? String(found[1]) : '—';
    });
    return { key, values, differs: new Set(values).size > 1 };
  });
  rows.sort((a, b) => Number(b.differs) - Number(a.differs));
  return { columns, rows };
}

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
    /* Which of the three views is up: 'canonical' (the rail), 'scene'
     * (everybody in one room) or 'character' (one person across the
     * campaign). `subject` is the scene id or the character id. */
    view: 'canonical',
    subject: null,
    /* What is on the stand right now, left to right: `{ label, sub, model,
     * person, x }`. The page draws its own captions off this rather than the
     * room drawing 3D text, because a caption that is HTML can be selected,
     * wrapped and read, and a caption that is geometry is another eighty
     * meshes in a room built for looking at eighty meshes. */
    row: [],
    /* Rows the ledger has but this room cannot build — a scene that uses the
     * Beef Run's block rig. Carried so the page can still say the person is
     * in that scene instead of silently dropping him. */
    unshown: [],
    /* Which slice of a long scene is on the stand, and how many slices there
     * are. The Bing floor is twenty people and the mansion seventeen; the
     * original rail already learned that a row that long puts each man at a
     * sixth of the frame, which is enough to see that they read as one
     * family and not enough to see anything else. */
    page: 0,
    pages: 1,
  };

  function faceUrl(entry) {
    return faces.has(entry.photo) ? `assets/faces/${entry.photo}` : null;
  }

  /** The photo a ledger row's person wears, if that photo has landed. */
  function faceForCharacter(characterId) {
    const photo = PHOTOS[characterId];
    return photo && faces.has(photo) ? `assets/faces/${photo}` : null;
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
    state.view = 'canonical';
    state.subject = null;
    state.unshown = [];
    state.page = 0;
    state.pages = 1;
    clearStand();
    const entry = RAIL[state.index];
    const person = buildOne(entry);
    stand.add(person.group);
    state.height = entry.model.height ?? 1.78;
    state.row = [{ label: entry.name, sub: 'the canonical model', model: entry.model, person, x: 0 }];
    disc.visible = true;
    disc.scale.setScalar(1);
    applyMark(state.mark);
    return entry;
  }

  /**
   * Stand a list of people in a row and frame them.
   *
   * The one place a line-up is built, whether it is the canonical rail, a
   * scene or one man across the campaign. It was three copies of this loop
   * for about ten minutes and the spacing had already drifted between two of
   * them, which is the same failure the wardrobe itself exists to stop, one
   * level up.
   *
   * @param {{label:string, sub:string, model:object, face:?string}[]} items
   */
  /**
   * The slice of a long row that is worth looking at.
   *
   * Eight, because that is what the canonical rail already settled on after
   * sixteen came back unreadable, and because at eight a 1.83 m man still
   * fills two thirds of the frame. Anything shorter than nine is one page and
   * the control never appears.
   */
  const PAGE_SIZE = 8;
  function paginate(items) {
    state.pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    state.page = Math.max(0, Math.min(state.page, state.pages - 1));
    return items.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
  }

  function layOut(items) {
    clearStand();
    /* Spacing is by shoulder, not by name: a 1.45-build Numbskull beside a
     * 0.95-build Snow at a fixed pitch either overlaps or leaves a hole. */
    let x = 0;
    const placed = [];
    for (const item of items) {
      const person = makePerson({ ...item.model, face: item.face ?? null, castShadow: true });
      person.group.name = `fitting.${item.key ?? 'figure'}`;
      const halfWidth = 0.30 + (item.model.build ?? 1) * 0.16;
      x += halfWidth;
      person.group.position.x = x;
      stand.add(person.group);
      placed.push({ ...item, person, x });
      x += halfWidth + 0.10;
    }
    const width = x;
    for (const entry of placed) {
      entry.person.group.position.x -= width / 2;
      entry.x -= width / 2;
    }
    state.row = placed;
    state.lineup = true;
    disc.visible = false;
    state.target.set(0, 1.0, 0);
    state.lineupWidth = width;
    frameLineup();
    state.pitch = -0.03;
    state.yaw = 0;
    return width;
  }

  /**
   * The rail, or a slice of it.
   *
   * Sixteen people across one frame puts each of them at about a sixth of the
   * height, which is enough to check that they read as one family and not
   * enough to check anything else. Half a rail at a time is twice the man.
   */
  function showLineup(from = 0, count = RAIL.length) {
    state.view = 'canonical';
    state.subject = null;
    state.lineupFrom = from;
    state.lineupCount = count;
    state.unshown = [];
    state.page = 0;
    state.pages = 1;
    return layOut(RAIL.slice(from, from + count).map((entry) => ({
      key: entry.key,
      label: entry.name,
      sub: entry.key,
      model: entry.model,
      face: faceUrl(entry),
    })));
  }

  /** One ledger row on its own stand, with the detail cameras available. */
  function showAppearance(appearance) {
    if (!isShowable(appearance)) return null;
    state.view = state.view === 'canonical' ? 'scene' : state.view;
    state.lineup = false;
    state.unshown = [];
    state.pages = 1;
    clearStand();
    const person = makePerson({
      ...appearance.model,
      face: faceForCharacter(appearance.character),
      castShadow: true,
    });
    person.group.name = `fitting.${appearance.character}`;
    stand.add(person.group);
    state.height = appearance.model.height ?? 1.78;
    state.row = [{
      key: appearance.character,
      label: appearance.name,
      sub: appearance.where,
      model: appearance.model,
      appearance,
      person,
      x: 0,
    }];
    disc.visible = true;
    disc.scale.setScalar(1);
    applyMark(state.mark);
    return appearance;
  }

  /**
   * Everybody in one scene, under that scene's own light.
   *
   * The rig follows the scene by default and that is not a nicety: the club's
   * gold is the thing most likely to be wrong and it is only wrong under one
   * warm bulb. Judging the Bing's people under a studio key is how a smear
   * gets signed off as jewellery.
   */
  function showScene(sceneId, { keepRig = false, page = 0 } = {}) {
    const scene = SCENES[sceneId];
    if (!scene) return null;
    if (state.subject !== sceneId || state.view !== 'scene') state.page = 0;
    if (page !== null) state.page = page;
    state.view = 'scene';
    state.subject = sceneId;
    if (!keepRig) applyRig(scene.rig);
    const cast = appearancesInScene(sceneId);
    state.unshown = cast.filter((a) => !isShowable(a));
    layOut(paginate(cast.filter(isShowable)).map((a) => ({
      key: a.character,
      label: a.name,
      sub: a.where,
      model: a.model,
      appearance: a,
      face: faceForCharacter(a.character),
    })));
    return scene;
  }

  /**
   * One person, in every scene they are in, side by side.
   *
   * Left to right in ledger order, which is campaign order, so the row reads
   * as the character's own progress through the game. The rig is left alone
   * here on purpose: a man compared across six rooms has to be compared under
   * ONE light, or every difference is a lighting difference.
   */
  function showCharacter(characterId, { page = 0 } = {}) {
    const cast = appearancesOf(characterId);
    if (cast.length === 0) return null;
    if (state.subject !== characterId || state.view !== 'character') state.page = 0;
    if (page !== null) state.page = page;
    state.view = 'character';
    state.subject = characterId;
    state.unshown = cast.filter((a) => !isShowable(a));
    const face = faceForCharacter(characterId);
    layOut(paginate(cast.filter(isShowable)).map((a) => ({
      key: `${a.character}.${a.scene}`,
      label: SCENES[a.scene]?.label ?? a.scene,
      sub: a.where,
      model: a.model,
      appearance: a,
      face,
    })));
    return cast;
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

  /**
   * Where each figure on the stand lands across the frame, 0..1.
   *
   * The page hangs its captions off this rather than off an even split,
   * because the row is spaced by shoulder and an even split puts Numbskull's
   * name under Snow. Projected through the same camera that just drew them,
   * so it is right at every aspect ratio and after every dolly.
   */
  function labelPositions() {
    stand.updateMatrixWorld(true);
    const point = new THREE.Vector3();
    return state.row.map((entry) => {
      point.set(entry.x, (entry.model.height ?? 1.78) * 0.5, 0);
      stand.localToWorld(point);
      point.project(camera);
      return { ...entry, at: (point.x + 1) / 2 };
    });
  }

  applyRig('bing');
  showSolo(0);

  return {
    scene, camera, renderer, state, stand,
    showSolo, showLineup, showScene, showCharacter, showAppearance,
    applyMark, applyRig, resize, render, labelPositions,
    current: () => RAIL[state.index],
    keys: () => RAIL.map((entry) => entry.key),
    /* What is on the stand, whatever put it there. */
    row: () => state.row,
  };
}
