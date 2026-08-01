import * as THREE from 'three';

import { CHARACTER_IDS } from '../core/campaign.js';
import { BILLY_HOTDOG_MODEL } from '../core/hotdog-model.js';
import { box, cylinder, emissive, group, mat, sphere } from '../world/build.js';
import { makeRevolver } from '../world/props.js';
import { Npc } from './cast.js';
import { STAGE_H } from './club.js';
import { populateFamily } from './family.js';
import { printed, sign } from './kit.js';
import { createPartyCollider } from './party-collision.js';

function makeNpc(scene, club, options) {
  const npc = new Npc(scene, {
    tier: 'hero',
    colliders: club.colliders,
    navBlockers: club.navBlockers,
    ...options,
  });
  if (options.characterId) {
    npc.characterId = options.characterId;
    npc.group.userData.npc.characterId = options.characterId;
  }
  return npc;
}

function attachAubbieTools(aubbie) {
  const steel = mat({ color: 0x8f9492, roughness: 0.32, metalness: 0.82 });
  const leather = mat({ color: 0x3e291d, roughness: 0.9 });
  const pouch = box({ size: [0.24, 0.22, 0.1], pos: [0.21, 0.78, 0.11], mat: leather });
  aubbie.parts.body.add(pouch);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 16), steel);
  ring.position.set(-0.2, 0.78, 0.12);
  aubbie.parts.body.add(ring);
  for (let i = 0; i < 4; i++) {
    const key = box({ size: [0.022, 0.11, 0.012], pos: [-0.2 + (i - 1.5) * 0.025, 0.69 - (i % 2) * 0.02, 0.13], mat: steel });
    key.rotation.z = (i - 1.5) * 0.18;
    aubbie.parts.body.add(key);
  }
  const cigarette = cylinder({ r: 0.008, h: 0.1, seg: 8, pos: [0.16, 1.68, 0.02], mat: mat({ color: 0xe5dfcf, roughness: 0.85 }), rotZ: Math.PI / 2 });
  aubbie.parts.body.add(cigarette);
}

function partyBanner() {
  const banner = group('hotdog.banner');
  const cloth = box({ size: [7.8, 1.0, 0.035], pos: [-11.5, 3.55, 10.62], mat: mat({ color: 0x6f1a20, roughness: 0.94 }), cast: false });
  banner.add(cloth);
  const words = sign(printed('hotdog-party-banner', [
    'WELCOME HOME',
    'BILLY HOTDOG',
  ], {
    w: 1024, h: 256, bg: null, fg: '#f2d9a4',
    font: '900 86px "Trebuchet MS", sans-serif',
  }), 6.9, 0.82, { x: -11.5, y: 3.55, z: 10.595 });
  words.material.transparent = true;
  banner.add(words);
  return banner;
}

function buffet() {
  const g = group('party.buffet');
  const cloth = mat({ color: 0xd7cfb8, roughness: 0.96 });
  const steel = mat({ color: 0x8f8f8c, roughness: 0.38, metalness: 0.65 });
  g.add(
    box({ size: [4.6, 0.12, 1.05], pos: [-2.3, 0.82, 6.8], mat: cloth }),
    box({ size: [0.14, 0.82, 0.86], pos: [-4.3, 0.41, 6.8], mat: mat({ color: 0x2b211b, roughness: 0.92 }) }),
    box({ size: [0.14, 0.82, 0.86], pos: [-0.3, 0.41, 6.8], mat: mat({ color: 0x2b211b, roughness: 0.92 }) }),
  );
  for (let i = 0; i < 4; i++) {
    g.add(box({ size: [0.78, 0.12, 0.62], pos: [-3.7 + i * 0.92, 0.93, 6.8], mat: steel }));
    for (let j = 0; j < 5; j++) {
      g.add(sphere({ r: 0.075, ry: 0.045, pos: [-3.95 + i * 0.92 + j * 0.12, 1.01, 6.8 + ((j % 2) - 0.5) * 0.22], mat: mat({ color: i % 2 ? 0xb88245 : 0x69412b, roughness: 0.92 }) }));
    }
  }
  const cake = group('party.cake');
  cake.position.set(-0.3, 0, 5.2);
  const cakePedestal = group('party.cake-pedestal');
  cakePedestal.add(
    cylinder({ r: 0.44, h: 0.08, pos: [0, 0.04, 0], mat: steel }),
    cylinder({ r: 0.085, h: 0.66, pos: [0, 0.39, 0], mat: steel }),
    cylinder({ r: 0.68, h: 0.08, pos: [0, 0.76, 0], mat: mat({ color: 0x443027, roughness: 0.72 }) }),
    cylinder({ r: 0.64, h: 0.04, pos: [0, 0.84, 0], mat: steel }),
  );
  cake.add(
    cakePedestal,
    cylinder({ r: 0.58, h: 0.22, pos: [0, 0.97, 0], mat: mat({ color: 0xe7d7bc, roughness: 0.84 }) }),
    cylinder({ r: 0.42, h: 0.2, pos: [0, 1.17, 0], mat: mat({ color: 0xeee2ce, roughness: 0.84 }) }),
  );
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    cake.add(cylinder({ r: 0.008, h: 0.18, pos: [Math.cos(a) * 0.27, 1.34, Math.sin(a) * 0.27], mat: mat({ color: i % 2 ? 0xc52d28 : 0x2c5f9e, roughness: 0.8 }) }));
    cake.add(sphere({ r: 0.025, ry: 0.045, pos: [Math.cos(a) * 0.27, 1.45, Math.sin(a) * 0.27], mat: emissive(0xffb53e, 2.3), cast: false }));
  }
  g.add(cake);
  return { group: g, cake, cakePedestal };
}

function stageRig() {
  const g = group('party.stage-rig');
  const steel = mat({ color: 0x383b3d, roughness: 0.45, metalness: 0.72 });
  const mic = group('hogmama.microphone');
  mic.add(
    cylinder({ r: 0.022, h: 1.35, seg: 10, pos: [-12, STAGE_H + 0.67, -5.7], mat: steel }),
    cylinder({ r: 0.12, h: 0.035, seg: 14, pos: [-12, STAGE_H + 0.02, -5.7], mat: steel }),
    cylinder({ r: 0.055, h: 0.18, seg: 12, pos: [-12, STAGE_H + 1.42, -5.7], mat: mat({ color: 0x181a1b, roughness: 0.7 }), rotZ: Math.PI / 2 }),
  );
  const cable = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.012, 5, 30, Math.PI * 1.35),
    mat({ color: 0x0c0d0e, roughness: 0.95 }),
  );
  cable.position.set(-11.55, STAGE_H + 0.03, -5.5);
  cable.rotation.x = Math.PI / 2;
  mic.add(cable);
  g.add(mic);

  const controls = group('party.stage-controls');
  controls.position.set(-5.55, 0, -8.45);
  controls.add(
    box({ size: [0.78, 0.84, 0.58], pos: [0, 0.42, 0], mat: mat({ color: 0x17191d, roughness: 0.7 }) }),
    box({ size: [0.68, 0.05, 0.5], pos: [0, 0.88, 0], mat: steel, rotX: -0.15 }),
  );
  for (let i = 0; i < 6; i++) {
    controls.add(box({ size: [0.06, 0.035, 0.16], pos: [-0.25 + i * 0.1, 0.92, 0], mat: emissive(i < 2 ? 0xd64235 : 0x4c9b60, 1.8), cast: false }));
  }
  g.add(controls);
  return { group: g, controls, mic };
}

function cleanupProps() {
  const g = group('hotdog.cleanup-props');
  const plastic = mat({ color: 0xd7dbe0, roughness: 0.48, transparent: true, opacity: 0.72 });
  const kit = group('aubbie.cleanup-kit');
  kit.position.set(7.2, 0, -11.2);
  kit.add(
    box({ size: [1.0, 0.44, 0.62], pos: [0, 0.24, 0], mat: mat({ color: 0x30383c, roughness: 0.75, metalness: 0.25 }) }),
    box({ size: [0.78, 0.08, 0.48], pos: [0, 0.5, 0], mat: plastic }),
    cylinder({ r: 0.18, h: 0.62, pos: [-0.72, 0.31, 0], mat: mat({ color: 0xb6b0a3, roughness: 0.9 }) }),
  );
  const label = sign(printed('aubbie-kit-label', ['AUBBIE', 'CORRECT KIT'], {
    w: 256, h: 128, bg: '#d7d0b5', fg: '#29251f', font: '900 34px "Trebuchet MS", sans-serif',
  }), 0.46, 0.22, { x: 0, y: 0.26, z: 0.315 });
  kit.add(label);
  g.add(kit);

  const cufflink = cylinder({ r: 0.055, h: 0.025, seg: 12, pos: [-15.7, 0.045, 0.2], mat: mat({ color: 0xd2bd68, roughness: 0.22, metalness: 0.88 }) });
  cufflink.name = 'hotdog.cufflink';
  const lapel = box({ size: [0.12, 0.025, 0.08], pos: [-10.45, 0.03, -1.0], mat: mat({ color: 0xb3212c, roughness: 0.35, metalness: 0.22 }) });
  lapel.name = 'hotdog.lapel-pin';
  g.add(cufflink, lapel);

  const revolver = makeRevolver(null, { x: -15.1, y: 0.08, z: -0.62, rotY: 0.9 });
  revolver.group.scale.setScalar(1.45);
  revolver.group.visible = false;
  g.add(revolver.group);

  const blood = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 28),
    mat({ color: 0x32080a, roughness: 1, transparent: true, opacity: 0.88, unique: true }),
  );
  blood.rotation.x = -Math.PI / 2;
  blood.position.set(-16.1, 0.012, -0.55);
  blood.scale.set(1.25, 0.7, 1);
  blood.visible = false;
  g.add(blood);

  const brokenStool = group('broken.bar-stool');
  brokenStool.position.set(-15.5, 0, -1.25);
  brokenStool.rotation.set(0.08, 0.3, 1.18);
  brokenStool.add(
    cylinder({ r: 0.24, h: 0.1, pos: [0, 0.45, 0], mat: mat({ color: 0x6b1f27, roughness: 0.75 }) }),
    cylinder({ r: 0.035, h: 0.85, pos: [0, 0, 0], mat: mat({ color: 0x77787a, roughness: 0.45, metalness: 0.65 }) }),
  );
  brokenStool.visible = false;
  g.add(brokenStool);

  const wrap = group('hotdog.wrap');
  wrap.position.set(-15.9, 0, -0.45);
  wrap.add(
    box({ size: [0.86, 0.14, 1.9], pos: [0, 0.12, 0], mat: plastic }),
    box({ size: [0.93, 0.04, 1.95], pos: [0, 0.23, 0], mat: plastic }),
  );
  wrap.visible = false;
  g.add(wrap);

  const mensPad = box({ size: [0.42, 0.06, 0.34], pos: [11.7, 0.03, 1.4], mat: mat({ color: 0x534b3c, roughness: 0.92 }) });
  const ladiesPad = box({ size: [0.42, 0.06, 0.34], pos: [10.0, 0.03, 0.2], mat: mat({ color: 0x534b3c, roughness: 0.92 }) });
  mensPad.name = 'bathroom-check.mens';
  ladiesPad.name = 'bathroom-check.ladies';
  g.add(mensPad, ladiesPad);

  const loadPad = box({
    size: [1.35, 1.35, 0.08],
    pos: [9.05, 1.0, -14.1],
    mat: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.01, depthWrite: false }),
    cast: false,
  });
  loadPad.name = 'service-loading-pad';
  g.add(loadPad);

  return {
    group: g, kit, cufflink, lapel, blood, brokenStool, wrap,
    bathroomPads: { mens: mensPad, ladies: ladiesPad },
    gun: revolver.group,
    loadPad,
  };
}

function offsetCenter(x, y, z) {
  return (target, out) => {
    target.getWorldPosition(out);
    out.x += x;
    out.y += y;
    out.z += z;
    return out;
  };
}

function installPartyColliders(club, {
  food, stage, cleanup, all, hotdog,
}) {
  const entries = [];
  const byId = {};
  const add = (options) => {
    const entry = createPartyCollider(options);
    entries.push(entry);
    byId[entry.id] = entry;
    club.colliders.push(entry.box);
    return entry;
  };

  add({
    id: 'prop.buffet', target: food.group,
    center: offsetCenter(-2.3, 0, 6.8),
    halfX: 2.3, halfZ: 0.53, maxY: 1.08,
  });
  add({
    id: 'prop.cake-table', target: food.cake,
    halfX: 0.68, halfZ: 0.68, maxY: 1.5,
  });
  add({
    id: 'prop.stage-controls', target: stage.controls,
    halfX: 0.4, halfZ: 0.3, maxY: 1.02,
  });
  add({
    id: 'prop.stage-microphone', target: stage.group,
    center: offsetCenter(-12, STAGE_H, -5.7),
    halfX: 0.08, halfZ: 0.08, minY: 0, maxY: 1.55,
  });
  add({
    id: 'prop.cleanup-kit', target: cleanup.kit,
    center: offsetCenter(-0.2, 0, 0),
    halfX: 0.72, halfZ: 0.34, maxY: 0.64,
  });
  add({
    id: 'prop.broken-stool', target: cleanup.brokenStool,
    halfX: 0.42, halfZ: 0.42, minY: -0.06, maxY: 0.74,
  });
  add({
    id: 'prop.wrapped-body', target: cleanup.wrap,
    halfX: 0.48, halfZ: 0.99, minY: -0.03, maxY: 0.32,
  });

  const cast = [];
  for (const [index, npc] of [...new Set(all)].entries()) {
    const characterId = npc.characterId ?? npc.group.userData.npc?.characterId;
    const slug = characterId ?? String(npc.name || `guest-${index}`)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const entry = add({
      id: `cast.${slug}`,
      kind: 'cast',
      target: npc.group,
      halfX: characterId === CHARACTER_IDS.LOU ? 0.25 : 0.2,
      halfZ: characterId === CHARACTER_IDS.LOU ? 0.25 : 0.2,
      minY: -0.06,
      maxY: npc.parts.profile.height,
      bounds: () => {
        if (npc === hotdog && Math.abs(npc.group.rotation.z) > 0.65) {
          return { halfX: 0.78, halfZ: 0.36, minY: -0.3, maxY: 0.4 };
        }
        const gut = npc.parts.profile.gut ?? 0;
        const half = Math.min(0.27, 0.19 + gut * 0.08);
        return { halfX: half, halfZ: half };
      },
    });
    npc.partyCollider = entry;
    cast.push(entry);
  }

  /* Cast bodies are for Tony. Feeding an NPC its own dynamic box makes every
   * route fail at the first _navClear(), and a dense party should not turn
   * Ape's scripted walkout into a room full of frozen people. This iterable
   * remains live as doors splice their ordinary boxes in and out. */
  const npcNavigationColliders = {
    get length() { return club.colliders.length; },
    *[Symbol.iterator]() {
      for (const collision of club.colliders) {
        if (collision.userData?.partyCollisionKind !== 'cast') yield collision;
      }
    },
  };
  for (const npc of all) npc.colliders = npcNavigationColliders;

  const nonblocking = [
    ['evidence.cufflink', cleanup.cufflink],
    ['evidence.lapel-pin', cleanup.lapel],
    ['evidence.revolver', cleanup.gun],
    ['effect.blood', cleanup.blood],
    ['trigger.bathroom-men', cleanup.bathroomPads.mens],
    ['trigger.bathroom-ladies', cleanup.bathroomPads.ladies],
    ['trigger.service-load', cleanup.loadPad],
  ].map(([id, object]) => {
    object.userData.partyCollision = { id, mode: 'nonblocking' };
    return { id, object };
  });

  return {
    all: entries,
    cast,
    props: entries.filter((entry) => entry.kind === 'prop'),
    byId,
    nonblocking,
  };
}

export async function buildHotDogParty(scene, club) {
  // The closed-party cast uses the established procedural face fallback. It
  // keeps this dense one-off crowd deterministic and avoids holding the whole
  // incident behind an optional face-photo request.
  const faces = new Set();
  window.__squatchStage?.('Bringing the Family to the main bar...');
  const family = populateFamily(scene, club, { faces });
  const byId = family.byId;
  window.__squatchStage?.('Setting the party floor...');

  const partySpots = {
    [CHARACTER_IDS.BOOSKI]: [-18.25, 2.7, 1.45],
    [CHARACTER_IDS.DEATHMEGATRON]: [-17.4, -2.0, 1.2],
    [CHARACTER_IDS.SEFF]: [4.0, 2.8, -1.2],
    [CHARACTER_IDS.IRISH]: [-6.0, 4.8, -2.45],
    [CHARACTER_IDS.GRATIN]: [-3.1, 5.4, -2.7],
    [CHARACTER_IDS.OLD_STOVE]: [3.9, 6.1, -1.7],
    [CHARACTER_IDS.LAG]: [3.8, 8.5, -2.55],
    [CHARACTER_IDS.ERIC]: [-8.6, 4.1, -2.7],
    [CHARACTER_IDS.WILLY]: [-18.3, 5.4, 1.4],
    [CHARACTER_IDS.APE]: [-14.2, 0.2, 1.35],
    [CHARACTER_IDS.HOG_MAMA]: [-12.0, -5.9, 0],
    [CHARACTER_IDS.SHUBENATOR]: [-6.0, -7.8, 2.6],
    [CHARACTER_IDS.RIPPINFLOW]: [-12.8, 2.8, 2.3],
    [CHARACTER_IDS.CAPTAIN_LOU_SASOLE]: [-10.2, 3.2, 2.4],
    [CHARACTER_IDS.SNOW]: [6.55, -3.2, 2.9],
    [CHARACTER_IDS.NUMBSKULL]: [-9.0, 1.0, 2.1],
  };
  for (const [id, values] of Object.entries(partySpots)) {
    const npc = byId[id];
    if (!npc) continue;
    npc.job = 'stand';
    npc.baseY = id === CHARACTER_IDS.HOG_MAMA ? STAGE_H : 0;
    npc.group.position.set(values[0], npc.baseY, values[1]);
    npc.group.rotation.y = values[2];
    npc.homeX = values[0];
    npc.homeZ = values[1];
    npc.homeYaw = values[2];
  }

  const lou = makeNpc(scene, club, {
    name: 'Big Uncle Lou', characterId: CHARACTER_IDS.LOU,
    x: -16.2, z: 2.0, yaw: 2.25, job: 'stand',
    model: {
      height: 1.83, build: 1.38, gut: 0.42, dress: 'suit', shirt: 0x20242c,
      hairColour: 0x17110d, skin: 0xd7a67e, face: faces.has('lou.png') ? 'assets/faces/lou.png' : null,
      chain: true,
    },
  });
  const hotdog = makeNpc(scene, club, {
    name: 'Billy HotDog', characterId: CHARACTER_IDS.BILLY_HOTDOG,
    x: -16.2, z: -0.2, yaw: -2.4, job: 'stand',
    model: BILLY_HOTDOG_MODEL,
  });
  const aubbie = makeNpc(scene, club, {
    name: 'Aubbie', characterId: CHARACTER_IDS.AUBBIE,
    x: 5.9, z: -1.3, yaw: 2.4, job: 'stand', folded: true,
    model: {
      height: 1.77, build: 1.05, dress: 'work', shirt: 0x24292c,
      hair: 'short', hairColour: 0x8a3e20, beard: true, skin: 0xd7a67e,
    },
  });
  aubbie.folded = true;
  attachAubbieTools(aubbie);
  const lawnmower = makeNpc(scene, club, {
    name: 'Lawnmower', x: -7.2, z: 2.8, yaw: -2.5, job: 'stand',
    model: { height: 1.75, build: 1.0, dress: 'work', shirt: 0x36503b, hair: 'crop', hairColour: 0x3c2c1e, skin: 0xc08a5e },
  });
  const sauce = makeNpc(scene, club, {
    name: 'Sauce', x: -1.4, z: 4.9, yaw: -2.8, job: 'work',
    model: { height: 1.72, build: 1.08, dress: 'chef', shirt: 0xe7e2d6, hair: 'short', hairColour: 0x241913, skin: 0xe8c39c },
  });

  window.__squatchStage?.('Dressing the closed party...');

  const banner = partyBanner();
  const food = buffet();
  const stage = stageRig();
  const cleanup = cleanupProps();
  scene.add(banner, food.group, stage.group, cleanup.group);

  const closedSign = sign(printed('blackjack-closed-party', ['TABLE CLOSED', 'FAMILY PARTY'], {
    w: 512, h: 256, bg: '#211519', fg: '#e3c987', font: '900 48px "Trebuchet MS", sans-serif',
  }), 1.25, 0.62, { x: -12.8, y: 1.25, z: 8.2 });
  closedSign.rotation.y = Math.PI;
  scene.add(closedSign);

  // Eric's old camcorder is the evidence problem without inventing Ericran as
  // a second person. It rides his hand and remains visible during the show.
  const camera = group('eric.camcorder');
  camera.add(
    box({ size: [0.2, 0.14, 0.34], pos: [0, 0, 0], mat: mat({ color: 0x25272a, roughness: 0.64 }) }),
    cylinder({ r: 0.055, h: 0.1, pos: [0, 0, -0.2], mat: mat({ color: 0x111316, roughness: 0.3 }), rotX: Math.PI / 2 }),
    box({ size: [0.2, 0.08, 0.03], pos: [0.19, 0.02, 0], mat: emissive(0x395b4f, 0.7), cast: false }),
  );
  const eric = byId[CHARACTER_IDS.ERIC];
  if (eric) {
    camera.position.set(0.24, 1.14, 0.14);
    camera.rotation.y = Math.PI / 2;
    eric.parts.body.add(camera);
  }

  // The unrelated visit-one storage corpse cannot remain under the cleanup
  // kit. Scene Two is already about one body; hiding it avoids a continuity
  // collision and leaves the old easter egg intact on visit one.
  if (club.storeroom.body) club.storeroom.body.visible = false;

  window.__squatchStage?.('Party ready...');

  const all = [...family.all, lou, hotdog, aubbie, lawnmower, sauce];
  const extra = { lou, hotdog, aubbie, lawnmower, sauce };
  const collision = installPartyColliders(club, {
    food,
    stage,
    cleanup,
    all,
    hotdog,
  });
  return {
    family,
    byId,
    all,
    extra,
    banner,
    food,
    stage,
    cleanup,
    collision,
    closedSign,
    camcorder: camera,
  };
}
