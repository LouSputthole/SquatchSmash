import * as THREE from 'three';

import { CHARACTER_IDS } from '../core/campaign.js';
import { AUBBIE, BIG_UNCLE_LOU_MANSION, SAUCE } from '../core/wardrobe.js';
import { BILLY_HOTDOG_MODEL } from '../core/hotdog-model.js';
import { buildWrappedBody } from '../core/props/wrapped-body.js';
import { readActor } from '../core/staging.js';
import { box, cylinder, emissive, group, mat, sphere } from '../world/build.js';
import { Npc, STOOL_SIT } from './cast.js';
import { STAGE_H } from './club.js';
import { FAMILY, loadFaceIndex, populateFamily } from './family.js';
import { buildHotDogHouseStaff } from './hotdog-house-staff.js';
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

/**
 * Aubbie, kitted the way the man is actually kitted.
 *
 * He used to carry a leather tool pouch and a ring of four keys, which reads
 * as the building's handyman -- and he is not. `src/mansion/scenes/
 * SilentSquatch.js` establishes him as the LEAD SCIENTIST on Lou's programme:
 * lab coat, shirt and tie, the only one in that room with a tie showing. Same
 * man, so the same read here (owner, 2026-08-19).
 *
 * What is left is what a chemist carries into a room he has been called to
 * clean: a row of pens, a folded pair of nitrile gloves out of the breast
 * pocket, and the cigarette, which stays because it is his and because a man
 * who knows exactly what bleach does to a carpet smoking beside it is the
 * funniest thing on this side of the room.
 */
function attachAubbieTools(aubbie) {
  const ink = mat({ color: 0x1b1d22, roughness: 0.5 });
  const nitrile = mat({ color: 0x3f6fa8, roughness: 0.72 });
  for (let i = 0; i < 3; i++) {
    const pen = box({
      size: [0.012, 0.1, 0.012],
      pos: [0.13 + i * 0.022, 1.4, 0.135],
      mat: i === 1 ? mat({ color: 0x8f9492, roughness: 0.3, metalness: 0.8 }) : ink,
    });
    pen.rotation.z = (i - 1) * 0.05;
    aubbie.parts.body.add(pen);
  }
  const gloves = box({ size: [0.09, 0.06, 0.03], pos: [-0.16, 1.36, 0.132], mat: nitrile });
  gloves.rotation.z = 0.22;
  aubbie.parts.body.add(gloves);
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
  // Four short stand-offs terminate on the club wall at z=10.84. The cloth
  // keeps its authored proud-of-wall silhouette without hanging in open air.
  for (const x of [-15.2, -7.8]) {
    for (const y of [3.12, 3.98]) {
      banner.add(cylinder({ r: 0.015, h: 0.165, pos: [x, y, 10.71875], rotX: Math.PI / 2, mat: mat({ color: 0x27292b, roughness: 0.6, metalness: 0.6 }) }));
    }
  }
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

export function buildHotDogStageRig() {
  const g = group('party.stage-rig');
  const steel = mat({ color: 0x383b3d, roughness: 0.45, metalness: 0.72 });
  const mic = group('hogmama.microphone');
  mic.position.set(-12, 0, -3.45);
  mic.add(
    cylinder({ r: 0.022, h: 1.35, seg: 10, pos: [0, STAGE_H + 0.67, 0], mat: steel }),
    cylinder({ r: 0.12, h: 0.035, seg: 14, pos: [0, STAGE_H + 0.02, 0], mat: steel }),
    cylinder({ r: 0.055, h: 0.18, seg: 12, pos: [0, STAGE_H + 1.42, 0], mat: mat({ color: 0x181a1b, roughness: 0.7 }), rotZ: Math.PI / 2 }),
  );
  const cable = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.012, 5, 30, Math.PI * 1.35),
    mat({ color: 0x0c0d0e, roughness: 0.95 }),
  );
  cable.position.set(0.45, STAGE_H + 0.03, 0.2);
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

  // A dedicated authored key means the set never relies on the club's moving
  // ambience landing on Hog Mama by chance. It fades up with Shubenator's
  // introduction and stays aimed at the front edge of the stage.
  const spotlight = new THREE.SpotLight(0xffdfad, 0, 42, 0.42, 0.55, 1.25);
  spotlight.name = 'hogmama.spotlight';
  spotlight.position.set(-8.2, 5.4, 0.4);
  spotlight.castShadow = true;
  spotlight.shadow.mapSize.set(768, 768);
  const target = new THREE.Object3D();
  target.name = 'hogmama.spotlight-target';
  target.position.set(-12, STAGE_H + 1.05, -3.45);
  spotlight.target = target;
  g.add(spotlight, target);
  const setSpotlight = (on) => {
    spotlight.intensity = on ? 48 : 0;
    controls.userData.spotlightOn = Boolean(on);
  };
  setSpotlight(false);
  return { group: g, controls, mic, spotlight, setSpotlight };
}

/* Visual-only. Ape still settles the score with his fists; the knife is the
 * cold, deliberate prop he brings back after HotDog's brush joke. Keeping it
 * local avoids pulling the Motel's actor domain into this closed-party page. */
function attachApeKnife(ape) {
  if (!ape?.parts?.foreR) return null;
  const knife = group('ape.fur-brush-knife');
  const handle = cylinder({
    r: 0.035, h: 0.28, seg: 8, pos: [0, -0.13, 0],
    mat: mat({ color: 0x2a1a12, roughness: 0.84 }),
  });
  const bolster = cylinder({
    r: 0.045, h: 0.05, seg: 8, pos: [0, -0.28, 0],
    mat: mat({ color: 0x9fa6aa, roughness: 0.34, metalness: 0.82 }),
  });
  const blade = box({
    size: [0.052, 0.34, 0.092], pos: [0, -0.47, 0],
    mat: mat({ color: 0xbec7cd, roughness: 0.24, metalness: 0.88 }),
  });
  blade.rotation.z = -0.05;
  knife.add(handle, bolster, blade);
  knife.position.set(0.02, -0.36, 0.035);
  knife.rotation.set(-0.32, 0, 0.18);
  knife.visible = false;
  ape.parts.foreR.add(knife);
  return knife;
}

export function buildHotDogCleanupProps() {
  const g = group('hotdog.cleanup-props');
  const plastic = mat({ color: 0xd7dbe0, roughness: 0.48, transparent: true, opacity: 0.72 });
  const kit = group('stove.cleanup-kit');
  // The kit sits beyond the service-side wall return, not through its corner.
  kit.position.set(7.2, 0, -11.35);
  kit.add(
    box({ size: [1.0, 0.44, 0.62], pos: [0, 0.24, 0], mat: mat({ color: 0x30383c, roughness: 0.75, metalness: 0.25 }) }),
    box({ size: [0.78, 0.08, 0.48], pos: [0, 0.5, 0], mat: plastic }),
    cylinder({ r: 0.18, h: 0.62, pos: [-0.72, 0.31, 0], mat: mat({ color: 0xb6b0a3, roughness: 0.9 }) }),
  );
  const label = sign(printed('stove-kit-label', ["STOVE'S", 'CLEANING KIT'], {
    w: 256, h: 128, bg: '#d7d0b5', fg: '#29251f', font: '900 34px "Trebuchet MS", sans-serif',
  }), 0.46, 0.22, { x: 0, y: 0.26, z: 0.315 });
  kit.add(label);
  g.add(kit);

  /* Jewellery on a dark floor, not a pickup that glows in the dark. Both of
   * these used to be emissive, which is what made the room read like a
   * collectathon; they are metal and enamel now and the floor circle is the
   * only thing doing the pointing. */
  const cufflink = cylinder({
    r: 0.075, h: 0.032, seg: 12, pos: [-13.15, 0.05, 0.72],
    mat: mat({ color: 0xc4a94f, roughness: 0.24, metalness: 0.92 }),
  });
  cufflink.name = 'hotdog.cufflink';
  const lapel = box({
    size: [0.16, 0.032, 0.11], pos: [-10.45, 0.04, -1.0],
    mat: mat({ color: 0x8e1a24, roughness: 0.3, metalness: 0.45 }),
  });
  lapel.name = 'hotdog.lapel-pin';
  g.add(cufflink, lapel);

  /* A ring drawn on the floor, low and dim, in the vocabulary the owner asked
   * for: circle the thing on the ground. It lies flat and writes no depth, so
   * it reads as chalk on the boards rather than a lamp buried under them. */
  const floorCircle = (name, x, z, color, radius = 0.3) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.035, radius, 40),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.42, depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ring.name = name;
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.012, z);
    ring.renderOrder = 3;
    ring.castShadow = false;
    ring.receiveShadow = false;
    return ring;
  };

  const evidenceMarker = (name, object, color) => {
    const marker = group(`evidence-marker.${name}`);
    marker.add(floorCircle(`evidence-circle.${name}`, object.position.x, object.position.z, color));
    marker.visible = false;
    g.add(marker);
    return marker;
  };
  const evidenceMarkers = {
    cufflink: evidenceMarker('cufflink', cufflink, 0xffdf72),
    lapel: evidenceMarker('lapel', lapel, 0xff5c68),
  };

  const blood = group('hotdog.blood-splatter');
  blood.userData.presentation = 'irregular-floor-splatter';
  const bloodMaterial = mat({ color: 0x32080a, roughness: 1, transparent: true, opacity: 0.82, unique: true });
  const splashes = [
    { x: -15.95, z: -0.48, rx: 1.2, rz: 0.64, seed: 0.4 },
    { x: -15.15, z: -0.1, rx: 0.5, rz: 0.25, seed: 1.6 },
    { x: -16.7, z: -0.9, rx: 0.34, rz: 0.18, seed: 2.7 },
  ];
  for (const splash of splashes) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 13; i++) {
      const angle = i / 12 * Math.PI * 2;
      const wobble = 0.8 + Math.sin(i * 2.7 + splash.seed) * 0.13 + Math.cos(i * 4.1) * 0.08;
      const x = Math.cos(angle) * splash.rx * wobble;
      const y = Math.sin(angle) * splash.rz * wobble;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    const decal = new THREE.Mesh(new THREE.ShapeGeometry(shape), bloodMaterial.clone());
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(splash.x, 0.006, splash.z);
    decal.renderOrder = 2;
    decal.castShadow = false;
    blood.add(decal);
  }
  blood.visible = false;
  g.add(blood);

  const brokenStool = group('broken.bar-stool');
  // Rotate about the same authored pivot, then raise the lowest leg to the floor.
  // Keep the discarded stool beside the confrontation, clear of both the
  // fallen body and the permanent two-top.
  brokenStool.position.set(-15.5, 0.192, -2.15);
  brokenStool.rotation.set(0.08, 0.3, 1.18);
  brokenStool.add(
    cylinder({ r: 0.24, h: 0.1, pos: [0, 0.45, 0], mat: mat({ color: 0x6b1f27, roughness: 0.75 }) }),
    cylinder({ r: 0.035, h: 0.85, pos: [0, 0, 0], mat: mat({ color: 0x77787a, roughness: 0.45, metalness: 0.65 }) }),
  );
  brokenStool.visible = false;
  g.add(brokenStool);

  const wrap = group('hotdog.wrap');
  wrap.position.set(-15.9, 0, -0.45);
  /*
   * A wrapped body is only convincing at the size of the man inside it, so both
   * numbers come off Billy's canonical model rather than being typed here: his
   * standing height plus the toes he is now pointing, and his build.
   */
  const wrapped = buildWrappedBody({
    length: BILLY_HOTDOG_MODEL.height + 0.1,
    build: BILLY_HOTDOG_MODEL.build,
    stain: 0.7,
    seed: 1.7,
  });
  // Rippin and Aubbie rolled him onto the sheet; they did not lay him out
  // square to the room.
  wrapped.group.rotation.y = 0.12;
  // The cleanup toggles, the `prop.wrapped-body` collider and the browser
  // verifiers all reach the sheet by the name the capsule used to carry. It is
  // the same object in the same place doing the same job, so it keeps it.
  wrapped.sheet.name = 'hotdog.wrap-body';
  wrap.add(wrapped.group);
  wrap.visible = false;
  g.add(wrap);

  /* One bathroom, not two. The ladies' door at x 7.9, z 2.9..3.9 opens on a
   * strip that belongs to no room -- roomAt() calls it 'outside' -- so sending
   * the player in there walked them out of the building through a doorway that
   * was never built. It stays locked for the party and the sweep is the men's
   * room only. */
  /* Interaction target, not set dressing. This used to render as a brown
   * brick on the bathroom floor—the unexplained object from owner QA. Keep
   * the real aim/use surface but make the proxy visually inert. */
  const mensPad = box({
    size: [0.42, 0.06, 0.34],
    pos: [11.7, 0.03, 1.4],
    mat: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.01, depthWrite: false }),
    cast: false,
  });
  mensPad.name = 'bathroom-check.mens';
  g.add(mensPad);

  const loadPad = box({
    size: [1.35, 1.35, 0.08],
    pos: [9.05, 1.0, -14.1],
    mat: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.01, depthWrite: false }),
    cast: false,
  });
  loadPad.name = 'service-loading-pad';
  g.add(loadPad);

  /* Two doors, not a trail of arrows.
   *
   * The old guide laid three floor arrows at (3.5,-9.8), (6.3,-11.8) and
   * (8.35,-13.25). The first is in the main room and the next two are in the
   * store room, so the line they drew ran straight through the main room's
   * south wall -- it pointed at a route that does not exist. The way out is
   * east into the hallway, south through the store-room door at (6.75, -9.5),
   * then the service door at (9.05, -15). So mark those two doors and let the
   * player walk the building instead of following arrows into masonry. */
  const serviceGuide = group('service-exit-guide');
  serviceGuide.userData.guidanceText = 'THROUGH THE STORE ROOM / SERVICE DOOR';

  const storeRoomSign = sign(printed('service-route-store-room', ['STORE ROOM'], {
    w: 512, h: 128, bg: '#241a10', fg: '#ffca63', font: '900 62px "Trebuchet MS", sans-serif',
  }), 1.05, 0.26, { x: 6.75, y: 2.18, z: -9.42 });
  storeRoomSign.name = 'service-route.store-room-sign';
  serviceGuide.add(storeRoomSign);
  serviceGuide.add(floorCircle('service-route.store-room-circle', 6.75, -9.05, 0xffc34e, 0.5));

  const exitLamp = box({
    size: [1.1, 0.26, 0.08], pos: [9.05, 2.15, -14.92],
    mat: emissive(0xffb638, 2.4), cast: false,
  });
  exitLamp.name = 'service-route.exit-lamp';
  serviceGuide.add(exitLamp);
  const exitSign = sign(printed('service-route-exit', ['SERVICE EXIT'], {
    w: 512, h: 128, bg: '#241a10', fg: '#ffca63', font: '900 56px "Trebuchet MS", sans-serif',
  }), 1.1, 0.26, { x: 9.05, y: 1.86, z: -14.9 });
  exitSign.name = 'service-route.exit-sign';
  serviceGuide.add(exitSign);
  serviceGuide.add(floorCircle('service-route.exit-circle', 9.05, -14.1, 0xffc34e, 0.62));

  serviceGuide.visible = false;
  g.add(serviceGuide);

  return {
    group: g, kit, cufflink, lapel, blood, brokenStool, wrap,
    evidenceMarkers,
    bathroomPads: { mens: mensPad },
    loadPad,
    serviceGuide,
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
  food, stage, cleanup, all, hotdog, withoutBodies = new Set(),
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
    id: 'prop.stage-microphone', target: stage.mic,
    center: offsetCenter(0, STAGE_H, 0),
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
  // Half a metre tall, not a metre: the old numbers were sized to a capsule
  // standing on its side, and this one lies flat with its weight in the floor.
  // The gathered ends past the head and the feet buy back the extra length.
  add({
    id: 'prop.wrapped-body', target: cleanup.wrap,
    halfX: 0.5, halfZ: 1.16, minY: -0.03, maxY: 0.5,
  });

  /* WHO GETS A BODY.
   *
   * Everybody the player can walk into, which is everybody standing on the
   * floor. The bartender and the dealer are deliberately not on it: they work
   * INSIDE furniture that already collides -- the bar's own counter run and
   * the blackjack table's footprint -- so a body box on either of them is a
   * box permanently inside a wall, and the geometry gate is right to call it
   * one. Nothing can reach them to need it. */
  const cast = [];
  const bodied = [...new Set(all)].filter((npc) => !withoutBodies.has(npc));
  for (const [index, npc] of bodied.entries()) {
    const characterId = npc.characterId ?? npc.group.userData.npc?.characterId;
    const slug = characterId ?? String(npc.name || `guest-${index}`)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const entry = add({
      id: `cast.${slug}`,
      kind: 'cast',
      ownerActorId: readActor(npc.group)?.id,
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
    ['effect.blood', cleanup.blood],
    ['trigger.bathroom-men', cleanup.bathroomPads.mens],
    ['trigger.service-load', cleanup.loadPad],
    ['guide.service-exit', cleanup.serviceGuide],
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
  // This is the same Family as every other Bing visit. Load the canonical face
  // ledger before population so the closed party cannot silently downgrade
  // Ape, Snow, Hog Mama, Shubenator and the rest to generic heads.
  const faces = await loadFaceIndex();
  window.__squatchStage?.('Bringing the Family to the main bar...');
  /* Aubbie and Sauce are on the Bing roster for the ordinary floor, and this
   * party builds both of them itself, below, as hero figures with their own
   * business -- Aubbie's tool pouch, Sauce at the buffet. Seating them here as
   * well would put two of each man in one room, which is the exact fault the
   * one-identity rule exists to prevent. Same body, same id, built once. */
  const family = populateFamily(scene, club, {
    faces,
    present: FAMILY.filter((member) => member.id !== CHARACTER_IDS.AUBBIE
      && member.id !== CHARACTER_IDS.SAUCE),
  });
  const byId = family.byId;
  window.__squatchStage?.('Setting the party floor...');

  const partySpots = {
    [CHARACTER_IDS.BOOSKI]: [-18.25, 2.7, 1.45],
    [CHARACTER_IDS.DEATHMEGATRON]: [-17.4, -2.0, 1.2],
    [CHARACTER_IDS.SEFF]: [4.0, 2.8, -1.2],
    [CHARACTER_IDS.IRISH]: [-6.0, 4.8, -2.45],
    // Keep standing rigs clear of the permanent chairs, two-tops, and stage
    // controls. These are small staging offsets, not collision exemptions.
    [CHARACTER_IDS.GRATIN]: [-2.9, 5.4, -2.7],
    [CHARACTER_IDS.OLD_STOVE]: [3.55, 6.1, -1.7],
    [CHARACTER_IDS.LAG]: [3.8, 7.55, -2.55],
    [CHARACTER_IDS.ERIC]: [-8.4, 4.3, -2.7],
    [CHARACTER_IDS.WILLY]: [-18.3, 5.4, 1.4],
    [CHARACTER_IDS.APE]: [-14.2, 0.2, 1.35],
    [CHARACTER_IDS.HOG_MAMA]: [-12.0, -3.65, 0],
    [CHARACTER_IDS.SHUBENATOR]: [-6.0, -7.5, 2.6],
    [CHARACTER_IDS.RIPPINFLOW]: [-12.8, 2.8, 2.3],
    [CHARACTER_IDS.CAPTAIN_LOU_SASOLE]: [-10.4, 3.1, 2.4],
    [CHARACTER_IDS.SNOW]: [6.55, -3.2, 2.9],
    [CHARACTER_IDS.NUMBSKULL]: [-9.0, 1.0, 2.1],
  };
  const partyBarSeats = new Set([CHARACTER_IDS.BOOSKI, CHARACTER_IDS.WILLY]);
  /* THE TABLE IS OPEN -- from behind it.
   *
   * Lou has shut the club to the public, not to his own people, so the felt is
   * running: `buildHotDogHouseStaff` puts a dealer on the flat side of it. The
   * five chairs stay empty on purpose. A party guest seated in one of them
   * sits 8.12 on z against a table whose collision volume ends at 7.98, so
   * every cast body put in a blackjack chair interpenetrates the table it is
   * playing at -- the ordinary night gets away with it only because visit one
   * gives its patrons no collision bodies at all. The dealer working a lit
   * felt is the read; a man buried 7cm in the rail is not. */
  for (const [id, values] of Object.entries(partySpots)) {
    const npc = byId[id];
    if (!npc) continue;
    const barSeat = partyBarSeats.has(id);
    npc.job = barSeat ? 'sit' : 'stand';
    /* A seat has a HEIGHT, and this one is a bar stool. `sit()` folds the rig
     * 0.42 * heightScale below `baseY`, which is measured against a chair
     * cushion at 0.53 -- put a man on a stool from a base of zero and he is
     * buried in it to the waist. `STOOL_SIT` is the difference, and it is
     * exactly what the ordinary Family seating chart passes for these same two
     * men at these same two stools (see `src/bing/family.js`). The party was
     * relabelling them 'sit' and then flattening every base to zero, which is
     * why Booski and Willy drank the whole scene through their stools. */
    npc.baseY = id === CHARACTER_IDS.HOG_MAMA ? STAGE_H : (barSeat ? STOOL_SIT : 0);
    // These NPCs originate in the ordinary Family seating chart. Changing
    // the label alone leaves their knees folded while their root is moved to
    // standing height; force the same pose transition runtime update uses.
    npc._syncJob(true);
    npc.group.position.x = values[0];
    npc.group.position.z = values[1];
    npc.group.rotation.y = values[2];
    npc.homeX = values[0];
    npc.homeZ = values[1];
    npc.homeYaw = values[2];
  }

  const lou = makeNpc(scene, club, {
    name: 'Big Uncle Lou', characterId: CHARACTER_IDS.LOU,
    x: -16.2, z: 2.0, yaw: 2.25, job: 'stand',
    /* Owner QA: this is a private family party, not a normal night working his
     * room. Reuse the open camp shirt he wears at home and on No Wake; keep the
     * established Lou face and every authored floor mark unchanged. */
    model: { ...BIG_UNCLE_LOU_MANSION, face: faces.has('lou.png') ? 'assets/faces/lou.png' : null },
  });
  const hotdog = makeNpc(scene, club, {
    name: 'Billy HotDog', characterId: CHARACTER_IDS.BILLY_HOTDOG,
    x: -16.2, z: -0.2, yaw: -2.4, job: 'stand',
    model: BILLY_HOTDOG_MODEL,
  });
  const apeKnife = attachApeKnife(byId[CHARACTER_IDS.APE]);
  const aubbie = makeNpc(scene, club, {
    name: 'Aubbie', characterId: CHARACTER_IDS.AUBBIE,
    x: 6.1, z: -1.3, yaw: 2.4, job: 'stand', folded: true,
    model: AUBBIE,
  });
  aubbie.folded = true;
  attachAubbieTools(aubbie);
  // Lawnmower is Snow's nickname in the authored voice catalog. Keep the
  // alias, but never create a second body or second face for the same person.
  const lawnmower = byId[CHARACTER_IDS.SNOW];
  if (lawnmower) {
    lawnmower.group.userData.aliases = ['Lawnmower'];
    lawnmower.aliases = ['Lawnmower'];
  }
  /* The same man who sits at the two-top east of the runway on an ordinary
   * night, in the same whites: one id, one body, spread rather than typed out
   * again here. He is working the food because the food is the whole of him. */
  const sauce = makeNpc(scene, club, {
    name: 'Sauce', characterId: CHARACTER_IDS.SAUCE,
    x: -1.4, z: 4.9, yaw: -2.8, job: 'work',
    model: SAUCE,
  });

  /* The people working the room, rather than drinking in it: the bartender,
   * the dealer behind the felt, and two of Lou's men holding the inside of
   * the club doors. See src/bing/hotdog-house-staff.js -- every one of them
   * is an existing body, none of them is a new person. */
  const houseStaff = buildHotDogHouseStaff(club, (options) => makeNpc(scene, club, options));

  window.__squatchStage?.('Dressing the closed party...');

  const banner = partyBanner();
  const food = buffet();
  const stage = buildHotDogStageRig();
  const cleanup = buildHotDogCleanupProps();
  scene.add(banner, food.group, stage.group, cleanup.group);

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
    /* Owner, 2026-08-31: "Eric's camera is, like, through his body." It was:
     * parked at belly height (y 1.14) on z 0.14 with a quarter-turn, half the
     * 0.34 m case sat inside a torso whose front face is z 0.13, lens aimed
     * across his own stomach. Now it is a viewfinder hold: eye height, clear
     * of the chest (case spans z 0.13..0.47), lens on the body's forward +Z
     * where the man is looking -- rotation.y = PI because the lens is built
     * on the prop's -Z. The matching arms are `filming` in cast.js. */
    camera.position.set(0.16, 1.58, 0.30);
    camera.rotation.y = Math.PI;
    eric.parts.body.add(camera);
    eric.filming = true;
  }

  // The unrelated visit-one storage corpse cannot remain under the cleanup
  // kit. Scene Two is already about one body; hiding it avoids a continuity
  // collision and leaves the old easter egg intact on visit one.
  if (club.storeroom.body) club.storeroom.body.visible = false;

  window.__squatchStage?.('Party ready...');

  const all = [...new Set([
    ...family.all, lou, hotdog, aubbie, lawnmower, sauce, ...houseStaff.all,
  ].filter(Boolean))];
  const extra = {
    lou, hotdog, aubbie, lawnmower, sauce,
    bartender: houseStaff.bartender,
    dealer: houseStaff.dealer,
    securityL: houseStaff.security[0],
    securityR: houseStaff.security[1],
  };
  const collision = installPartyColliders(club, {
    food,
    stage,
    cleanup,
    all,
    hotdog,
    withoutBodies: new Set([houseStaff.bartender, houseStaff.dealer]),
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
    apeKnife,
    camcorder: camera,
  };
}
