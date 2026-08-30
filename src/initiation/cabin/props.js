/**
 * INITIATION NIGHT — the five things on the table.
 *
 * A candle, a knife, a saint card, a glass of whiskey and a folded cloth.
 * Every one of them is USED, which is why they are objects with grips rather
 * than dressing: the card burns in the player's hand, the knife opens his
 * finger, the cloth takes the blood, the whiskey is drunk when it is done, and
 * the candle is the only thing lighting any of it.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TWO RULES, AND BOTH OF THEM ARE OLD SCARS
 *
 * 1. EVERY PROP'S ORIGIN IS ITS GRIP. Not its centre, not its base — the point
 *    a hand closes on. So `attachToHand(figure, 'R', knife.group)` needs no
 *    offset, no rotation and no tuning, which is the entire reason golfers
 *    ended up holding beer cans six inches off the side of their forearms:
 *    somebody attached a prop to a limb and then dialled in a magic number to
 *    make it look right in one pose.
 *
 * 2. NOTHING IS PLACED BY EYE. `restOn()` measures the built object and sets
 *    it down so its lowest point is EXACTLY on the surface. A candlestick
 *    dropped 3 mm into a table top is an interpenetration finding, one lifted
 *    5 cm above it is a floating one, and neither is something anybody spots
 *    in a screenshot of a dark room.
 */

import * as THREE from 'three';

import {
  assembly, bakedTexture, boxPart, cylinderPart, effect, glowMaterial, part,
} from './kit.js';
import { TABLE, TABLE_SOCKETS } from './site.js';

const _bounds = new THREE.Box3();

export const INITIATION_CARD_SLOT = 'initiation.ceremony.saint-card';
export const INITIATION_ART_SLOTS = ['initiation.ceremony.saint-card'];

/**
 * Put an object down on a surface.
 *
 * Rotation first, then measure, then set the height — in that order, because
 * the height a knife rests at depends on which way up it is lying.
 */
export function restOn(object, { x, z, surfaceY, rotation = null }) {
  if (rotation) object.rotation.set(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  object.position.set(x, 0, z);
  object.updateMatrixWorld(true);
  _bounds.setFromObject(object);
  const lift = surfaceY - _bounds.min.y;
  object.position.y += lift;
  object.updateMatrixWorld(true);
  return object;
}

/** Put a prop on the ceremony table, at its named socket. */
export function placeOnTable(prop, socketName, surfaceY = TABLE.topY) {
  const socket = TABLE_SOCKETS[socketName];
  if (!socket) throw new Error(`no table socket named "${socketName}"`);
  return restOn(prop.group, {
    x: socket.x, z: socket.z, surfaceY, rotation: prop.rest ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* The candle                                                          */
/* ------------------------------------------------------------------ */

/**
 * A brass stick with a used candle in it.
 *
 * The flame is an effect and is exposed so the scene can flicker it. It is
 * also the only thing in this room that goes OUT, which is worth knowing: the
 * card is lit from this.
 */
export function makeCeremonyCandle() {
  const group = assembly('prop.candle', 'initiation.prop.candle');
  group.add(cylinderPart('candle.foot', 0.075, 0.095, 0.022, 10, 0x6b5a2c, [0, 0.011, 0]));
  group.add(cylinderPart('candle.stem', 0.022, 0.03, 0.1, 8, 0x6b5a2c, [0, 0.072, 0]));
  group.add(cylinderPart('candle.cup', 0.05, 0.035, 0.03, 10, 0x7a672f, [0, 0.137, 0]));
  group.add(cylinderPart('candle.wax', 0.026, 0.03, 0.19, 9, 0xe8dcc0, [0, 0.247, 0]));
  const flame = effect(new THREE.Mesh(
    new THREE.ConeGeometry(0.017, 0.075, 6),
    glowMaterial(0xffd27a, 2.8),
  ));
  flame.name = 'candle.flame';
  flame.position.y = 0.382;
  group.add(flame);
  const light = new THREE.PointLight(0xffbe72, 5.5, 4.5, 2);
  light.position.y = 0.4;
  group.add(light);
  return { group, flame, light, rest: null, grip: { offset: { y: -0.14 } } };
}

/* ------------------------------------------------------------------ */
/* The knife                                                           */
/* ------------------------------------------------------------------ */

/**
 * Old, plain, and sharp. Not a dagger.
 *
 * Origin at the middle of the handle. Held, it points out of the fist; laid
 * on the table it is turned on its side, which `rest` says and `restOn`
 * measures.
 */
export function makeCeremonyKnife() {
  const group = assembly('prop.knife', 'initiation.prop.knife');
  group.add(boxPart('knife.handle', [0.028, 0.115, 0.034], [0, 0, 0], 0x2b1d12));
  group.add(boxPart('knife.bolster', [0.034, 0.016, 0.038], [0, 0.066, 0], 0x8a8f99));
  const blade = boxPart('knife.blade', [0.022, 0.155, 0.006], [0, 0.152, 0], 0xb9c0cc);
  group.add(blade);
  return {
    group,
    blade,
    /* On its side, across the grain of the table. */
    rest: { x: Math.PI / 2, y: 0, z: Math.PI / 2 },
    grip: { rotation: { x: 0, y: 0, z: 0 } },
  };
}

/* ------------------------------------------------------------------ */
/* The card                                                            */
/* ------------------------------------------------------------------ */

function saintCardTexture() {
  return bakedTexture(128, (context, size) => {
    context.fillStyle = '#d9cba8';
    context.fillRect(0, 0, size, size);
    context.fillStyle = '#8a7448';
    context.fillRect(4, 4, size - 8, size - 8);
    context.fillStyle = '#e6dcc2';
    context.fillRect(9, 9, size - 18, size - 18);
    /* A figure, roughed in. Nobody ever sees this from more than a metre. */
    context.fillStyle = '#6d5a3a';
    context.fillRect(size * 0.42, size * 0.22, size * 0.16, size * 0.18);
    context.fillRect(size * 0.34, size * 0.42, size * 0.32, size * 0.34);
    context.fillStyle = '#4a3c26';
    context.fillRect(size * 0.2, size * 0.82, size * 0.6, 3);
  }, { repeat: 1 });
}

/**
 * The saint card.
 *
 * Small, old, and printed on card that has been in somebody's wallet for
 * thirty years. It is put in the player's LEFT hand, because the right one is
 * about to be cut.
 */
export function makeSaintCard() {
  const group = assembly('prop.card', 'initiation.prop.card');
  const width = 0.098 * (2 / 3);
  const height = 0.098;
  const backing = part(
    new THREE.BoxGeometry(width, height, 0.0016),
    new THREE.MeshLambertMaterial({ color: 0xcbb783 }),
    0, 0, 0, 'card.backing',
  );
  group.add(backing);

  const frontMaterial = new THREE.MeshLambertMaterial({
    map: saintCardTexture(),
    transparent: true,
  });
  const front = part(
    new THREE.PlaneGeometry(width - 0.0018, height - 0.0018),
    frontMaterial,
    0, 0, 0.00086, 'card.face',
  );
  group.add(front);

  // A rising char front makes the burn legible without destroying or
  // modifying the supplied artwork. At completion the physical card vanishes
  // and every effect goes dark, leaving no light or particle leak in the hand.
  const charMaterial = new THREE.MeshBasicMaterial({
    color: 0x170805,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const char = part(
    new THREE.PlaneGeometry(width - 0.0014, height - 0.0014),
    charMaterial,
    0, -height / 2, 0.00102, 'card.char',
  );
  char.scale.y = 0.001;
  char.visible = false;
  group.add(char);

  const flame = effect(new THREE.Mesh(
    new THREE.ConeGeometry(0.0085, 0.026, 7),
    glowMaterial(0xffa044, 3.1),
  ));
  flame.name = 'card.burn-flame';
  flame.visible = false;
  group.add(flame);

  const light = new THREE.PointLight(0xff8f3d, 0, 0.8, 2);
  light.name = 'card.burn-light';
  group.add(light);

  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.012, 0.002, 0.003, 0.009, 0.008, 0.004,
    -0.004, 0.016, 0.004, 0.014, 0.022, 0.003,
  ], 3));
  const embers = effect(new THREE.Points(
    emberGeometry,
    new THREE.PointsMaterial({
      color: 0xffa24a,
      size: 0.005,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  ));
  embers.name = 'card.burn-embers';
  embers.visible = false;
  group.add(embers);

  let burnProgress = 0;
  let burnClock = 0;
  const setTexture = (texture) => {
    if (!texture) return false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    frontMaterial.map = texture;
    frontMaterial.needsUpdate = true;
    return true;
  };
  const resetBurn = () => {
    burnProgress = 0;
    burnClock = 0;
    backing.visible = true;
    front.visible = true;
    char.visible = false;
    char.scale.y = 0.001;
    char.position.y = -height / 2;
    charMaterial.opacity = 0;
    flame.visible = false;
    light.intensity = 0;
    embers.visible = false;
    embers.material.opacity = 0;
  };
  const setBurnProgress = (next) => {
    burnProgress = Math.max(burnProgress, THREE.MathUtils.clamp(Number(next) || 0, 0, 1));
    if (burnProgress >= 1) {
      backing.visible = false;
      front.visible = false;
      char.visible = false;
      flame.visible = false;
      light.intensity = 0;
      embers.visible = false;
      embers.material.opacity = 0;
      return burnProgress;
    }
    if (burnProgress <= 0) {
      resetBurn();
      return burnProgress;
    }
    const charHeight = Math.max(0.001, burnProgress);
    char.visible = true;
    char.scale.y = charHeight;
    char.position.y = -height / 2 + (height * charHeight) / 2;
    charMaterial.opacity = 0.35 + burnProgress * 0.58;
    const edgeY = -height / 2 + height * burnProgress;
    flame.visible = true;
    flame.position.set(0.004 * Math.sin(burnProgress * 19), edgeY, 0.006);
    light.position.copy(flame.position);
    light.intensity = 0.35 + 0.25 * Math.sin(burnProgress * 23) ** 2;
    embers.visible = true;
    embers.position.set(0, edgeY, 0.006);
    embers.material.opacity = 0.45 + burnProgress * 0.35;
    return burnProgress;
  };
  const updateBurn = (dt) => {
    if (burnProgress <= 0 || burnProgress >= 1) return;
    burnClock += Math.max(0, Number(dt) || 0);
    flame.scale.set(
      0.88 + Math.sin(burnClock * 19) * 0.12,
      0.92 + Math.sin(burnClock * 23 + 0.7) * 0.16,
      0.88,
    );
    flame.rotation.z = Math.sin(burnClock * 13) * 0.18;
    light.intensity = 0.42 + 0.18 * Math.sin(burnClock * 29) ** 2;
    embers.rotation.z += Math.max(0, Number(dt) || 0) * 1.7;
  };
  resetBurn();
  return {
    group,
    size: Object.freeze({ width, height }),
    card: backing,
    backing,
    front,
    char,
    flame,
    light,
    embers,
    setTexture,
    setBurnProgress,
    resetBurn,
    updateBurn,
    get burnProgress() { return burnProgress; },
    /* Face up on the table. */
    rest: { x: -Math.PI / 2, y: 0.22, z: 0 },
    /* The hand socket is the centre of a 16 x 16 x 17 cm fist. A prop placed
     * at its origin is therefore inside the hand and raycasts to FOREARM before
     * they ever reach the card. This offset sits the paper on the palm surface;
     * the rotation presents its printed face to the player. */
    grip: {
      offset: { x: 0.024, y: 0.045, z: 0.082 },
      rotation: { x: -0.5, y: 0, z: 0 },
    },
  };
}

/* ------------------------------------------------------------------ */
/* The whiskey                                                         */
/* ------------------------------------------------------------------ */

/**
 * Poured, and not touched.
 *
 * Four more of these are on the table for everybody else and they are not
 * touched either. That is the detail that says how long these men have been
 * standing in this room waiting for somebody to arrive.
 */
export function makeWhiskeyGlass() {
  const group = assembly('prop.whiskey', 'initiation.prop.whiskey');
  const glass = part(
    new THREE.CylinderGeometry(0.036, 0.031, 0.088, 12, 1, true),
    new THREE.MeshLambertMaterial({
      color: 0xc8d2dc, transparent: true, opacity: 0.34, side: THREE.DoubleSide,
    }),
    0, 0.044, 0, 'whiskey.glass',
  );
  group.add(glass);
  group.add(cylinderPart('whiskey.base', 0.031, 0.031, 0.012, 12, 0xb9c4d0, [0, 0.006, 0]));
  group.add(cylinderPart('whiskey.pour', 0.032, 0.03, 0.042, 12, 0x9a5a1e, [0, 0.031, 0]));
  return { group, rest: null, grip: { offset: { y: -0.05 } } };
}

/* ------------------------------------------------------------------ */
/* The cloth                                                           */
/* ------------------------------------------------------------------ */

/**
 * A folded cloth. White, ironed, and there for the blood.
 *
 * Three leaves rather than one box, because a folded cloth is the one prop on
 * this table whose whole meaning is that somebody prepared it.
 */
export function makeFoldedCloth() {
  const group = assembly('prop.cloth', 'initiation.prop.cloth');
  const leaves = [
    { size: [0.19, 0.008, 0.135], y: 0.004, colour: 0xd8d4c8 },
    { size: [0.175, 0.008, 0.125], y: 0.012, colour: 0xe2ded2 },
    { size: [0.16, 0.008, 0.112], y: 0.02, colour: 0xd0ccc0 },
  ];
  for (const leaf of leaves) {
    group.add(boxPart('cloth.leaf', leaf.size, [0, leaf.y, 0], leaf.colour));
  }
  return { group, rest: null, grip: { offset: { y: -0.01 } } };
}

/* ------------------------------------------------------------------ */
/* The table set                                                       */
/* ------------------------------------------------------------------ */

/**
 * Build all five, put them where site.js says, and hand them back by name.
 *
 * The ceremony code picks them up from here: `set.knife`, `set.card`. Nothing
 * else in this subtree knows what order they are used in, because that is the
 * script's business and this is the table's.
 */
export function buildCeremonyProps({ surfaceY = TABLE.topY } = {}) {
  const props = {
    candle: makeCeremonyCandle(),
    knife: makeCeremonyKnife(),
    card: makeSaintCard(),
    whiskey: makeWhiskeyGlass(),
    cloth: makeFoldedCloth(),
  };
  const group = new THREE.Group();
  group.name = 'ceremony.props';
  for (const [name, prop] of Object.entries(props)) {
    placeOnTable(prop, name, surfaceY);
    group.add(prop.group);
  }
  return { group, props };
}
