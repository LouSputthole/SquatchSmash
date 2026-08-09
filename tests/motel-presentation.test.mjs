import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { Actor, CAST, buildWeaponMesh } from '../src/motel/actors.js';
import { makeMotelArrivalCar } from '../src/motel/vehicle.js';

test('the normal Motel start cannot escape to the apartment', () => {
  const html = fs.readFileSync(new URL('../motel.html', import.meta.url), 'utf8');
  const start = html.match(/<div id="menu"[\s\S]*?(?=<div id="pause")/)?.[0] ?? '';
  const bootFailure = html.match(/<div id="bootFailure"[\s\S]*?(?=<script src="\.\/src\/core\/boot-guard)/)?.[0] ?? '';

  assert.match(start, /id="startBtn"[^>]*>START THE DEAL/);
  assert.doesNotMatch(start, /href="\.\/index\.html"/,
    'normal flow exposes an apartment escape before the mission starts');
  assert.match(html, /id="continueBtn"[^>]*>RETURN TO APARTMENT/,
    'mission completion lost its campaign return');
  assert.match(bootFailure, /href="\.\/index\.html"[^>]*>APARTMENT/,
    'boot failure lost its recovery route');
});

test('Rico has a stable face identity and an animated speaking mouth', () => {
  const scene = new THREE.Scene();
  const rico = new Actor(scene, { ...CAST.rico(), x: 0, z: 0, state: 'deal' });
  assert.equal(rico.identity, 'rico');
  assert.equal(rico.rig.faceMesh?.name, 'actor.face.rico');
  assert.equal(rico.rig.mouth?.name, 'actor.mouth');

  const ctx = { player: { x: 0, z: 4 }, floorAt: () => 0, blocked: () => false };

  /* A TIMER ALONE NO LONGER OPENS HIS MOUTH, and that is the point of the
   * shared mouth system: `talkT` is the head/hand beat, and the mouth is a
   * separate thing driven by the voice (src/core/mouth.js). Setting the timer
   * by hand used to flap the jaw; if this ever starts passing, the mouth has
   * been reconnected to a clock. */
  rico.talkT = 1;
  for (let i = 0; i < 8; i += 1) rico.update(0.05, ctx);
  assert.equal(rico.rig.mouth.scale.y, 1, 'a bare talk timer must not drive the mouth');

  /* Said properly, through the API a scene uses. Several frames, because the
   * envelope has syllables in it -- a mouth that is open on every single frame
   * is a hinge, not speech -- so the assertion is on the peak. */
  rico.say(1.2);
  let peak = 0;
  for (let i = 0; i < 12; i += 1) {
    rico.update(0.05, ctx);
    peak = Math.max(peak, rico.rig.mouth.scale.y);
  }
  assert.ok(peak > 1, 'mouth opens while Rico owns a voice turn');

  // And it shuts again when the line is over, without anybody asking it to.
  for (let i = 0; i < 30; i += 1) rico.update(0.05, ctx);
  assert.ok(Math.abs(rico.rig.mouth.scale.y - 1) < 0.001, 'mouth did not settle');
});

test('Rico wears one continuous tropical shirt across panels, shoulders, and sleeves', () => {
  const cfg = CAST.rico();
  const rico = new Actor(new THREE.Scene(), { ...cfg, x: 0, z: 0, state: 'deal' });
  const dimensions = (mesh) => {
    const p = mesh.geometry?.parameters;
    return p ? [p.width, p.height, p.depth] : [];
  };
  const findBox = (root, expectedName, size) => {
    let fallback = null;
    root.traverse((object) => {
      if (object.name === expectedName) fallback = object;
      const measured = dimensions(object);
      if (!fallback && object.isMesh && measured.length === size.length
          && measured.every((value, i) => value === size[i])) {
        fallback = object;
      }
    });
    return fallback;
  };

  const parts = [
    ['actor.garment.shoulders', rico.rig.body, [0.58, 0.14, 0.28]],
    ['actor.garment.sleeve.left', rico.rig.armL, [0.13, 0.38, 0.15]],
    ['actor.garment.sleeve.right', rico.rig.armR, [0.13, 0.38, 0.15]],
    ['actor.garment.tropical.panel.left', rico.rig.body, [0.17, 0.66, 0.06]],
    ['actor.garment.tropical.collar', rico.rig.body, [0.5, 0.08, 0.28]],
  ].map(([name, root, size]) => [name, findBox(root, name, size)]);

  for (const [name, mesh] of parts) {
    assert.ok(mesh, `${name} is missing`);
    assert.equal(mesh.material.color.getHex(), cfg.tropical,
      `${name} is not using Rico's tropical garment colour`);
    assert.equal(mesh.name, name, `${name} is not reusable by semantic name`);
  }
});

test('all seven fixed Motel actors expose complete semantic Object3D names', () => {
  const fixed = ['snow', 'rico', 'chino', 'slicer', 'lookout', 'watcher', 'clerk'];
  const common = [
    'actor.rig.body',
    'actor.garment.pants.waist',
    'actor.anatomy.torso',
    'actor.garment.shoulders',
    'actor.anatomy.neck',
    'actor.joint.head',
    'actor.joint.shoulder.left',
    'actor.joint.shoulder.right',
    'actor.garment.sleeve.left',
    'actor.garment.sleeve.right',
    'actor.anatomy.forearm.left',
    'actor.anatomy.forearm.right',
    'actor.anatomy.hand.left',
    'actor.anatomy.hand.right',
    'actor.joint.hip.left',
    'actor.joint.hip.right',
    'actor.garment.pants.leg.left',
    'actor.garment.pants.leg.right',
    'actor.garment.shoe.left',
    'actor.garment.shoe.right',
  ];
  const required = {
    snow: ['actor.face.snow'],
    rico: [
      'actor.face.rico', 'actor.hair.crown', 'actor.hair.back',
      'actor.eye.left', 'actor.eye.right', 'actor.mouth',
      'actor.garment.tropical.panel.left', 'actor.garment.tropical.panel.right',
      'actor.garment.tropical.collar', 'actor.accessory.shades',
      'actor.accessory.mustache', 'actor.accessory.chain', 'actor.accessory.medal',
      'weapon.thermometer', 'weapon.thermometer.probe', 'weapon.thermometer.dial',
    ],
    chino: [
      'actor.face.chino', 'actor.hair.crown', 'actor.hair.back',
      'actor.eye.left', 'actor.eye.right', 'actor.mouth',
      'actor.garment.apron', 'actor.garment.apron.stain',
      'actor.garment.glove.left', 'actor.garment.glove.right',
      'weapon.cleaver', 'weapon.cleaver.handle', 'weapon.cleaver.blade',
    ],
    slicer: [
      'actor.face.bathroom seller', 'actor.hair.crown', 'actor.hair.back',
      'actor.eye.left', 'actor.eye.right', 'actor.mouth',
      'actor.garment.glove.left', 'actor.garment.glove.right',
      'weapon.slicer', 'weapon.slicer.body', 'weapon.slicer.blade',
    ],
    lookout: [
      'actor.face.lookout', 'actor.hair.crown', 'actor.hair.back',
      'actor.eye.left', 'actor.eye.right', 'actor.mouth',
      'weapon.knife', 'weapon.knife.handle', 'weapon.knife.blade',
    ],
    watcher: [
      'actor.face.watcher', 'actor.hair.crown', 'actor.hair.back',
      'actor.eye.left', 'actor.eye.right', 'actor.mouth',
      'weapon.hook', 'weapon.hook.shaft', 'weapon.hook.tip',
    ],
    clerk: [
      'actor.face.clerk', 'actor.hair.crown', 'actor.hair.back',
      'actor.eye.left', 'actor.eye.right', 'actor.mouth',
      'actor.accessory.cap', 'actor.accessory.cap.brim',
    ],
  };

  /* Snow's photographed face normally asks the browser to load a texture.
   * Naming is pure model construction, so give the public builder a harmless
   * texture in Node and keep the actual asset path untouched. */
  const loadTexture = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  try {
    for (const key of fixed) {
      const actor = new Actor(new THREE.Scene(), { ...CAST[key](), x: 0, z: 0, state: 'idle' });
      const names = new Set();
      const anonymous = [];
      actor.group.traverse((object) => {
        if (object.name) names.add(object.name);
        else anonymous.push(`${object.type} under ${object.parent?.name || '<anonymous>'}`);
      });

      assert.equal(actor.group.name, `actor.${actor.identity}`,
        `${key} has no stable identity root`);
      assert.deepEqual(anonymous, [], `${key} still has anonymous reusable nodes: ${anonymous.join(', ')}`);
      for (const name of [...common, ...required[key]]) {
        assert.ok(names.has(name), `${key} is missing semantic part ${name}`);
      }
    }
  } finally {
    THREE.TextureLoader.prototype.load = loadTexture;
  }
});

test('a Motel actor keeps the authored body scale after its first update', () => {
  const scene = new THREE.Scene();
  const rico = new Actor(scene, { ...CAST.rico(), x: 0, z: 0, state: 'deal' });
  const authoredScale = CAST.rico().scale;
  const ctx = { player: { x: 0, z: 4 }, floorAt: () => 0, blocked: () => false };

  assert.equal(rico.group.scale.x, authoredScale, 'Rico starts at his authored scale');
  rico.update(0.05, ctx);
  assert.equal(rico.group.scale.x, authoredScale,
    'the animation update must not normalize the authored body scale');
});

test('Snow can occupy a moving car seat without snapping to the lot floor, then stand outside it', () => {
  const snow = new Actor(new THREE.Scene(), { ...CAST.snow(), x: 0, z: 0, state: 'idle' });
  const seat = new THREE.Vector3(-8.4, -0.1, 17.2);
  const ctx = { player: { x: -8.4, z: 17.2 }, floorAt: () => 0, blocked: () => false };

  const authoredScale = snow.baseScale;
  snow.sitAt(seat, 0.4, { scaleFactor: 0.82, headYaw: 0.72, armPitch: -1.05 });
  snow.update(0.2, ctx);
  assert.equal(snow.state, 'seated');
  assert.ok(snow.group.position.distanceTo(seat) < 0.001,
    'the seated driver fell out of the moving car onto the world floor');
  assert.ok(snow.rig.legL.rotation.x < -0.8 && snow.rig.legR.rotation.x < -0.8,
    'Snow is standing through the driver seat instead of sitting in it');
  assert.ok(Math.abs(snow.group.scale.x - authoredScale * 0.82) < 1e-9,
    'the shared adult rig is not refitted to the car cabin while seated');
  assert.equal(snow.rig.head.rotation.y, 0.72,
    'Snow cannot glance toward Tony while his body and hands stay oriented to the wheel');
  assert.equal(snow.rig.armL.rotation.x, -1.05,
    'Snow does not hold his arms forward toward the steering wheel');

  const pavement = new THREE.Vector3(-6.3, 0, 16.8);
  snow.standAt(pavement, Math.PI);
  snow.update(0.01, ctx);
  assert.equal(snow.state, 'idle');
  assert.equal(snow.group.position.y, 0,
    'Snow did not leave the car on grounded pavement');
  assert.equal(snow.group.scale.x, authoredScale,
    'Snow did not return to his canonical adult scale after leaving the car');
  assert.equal(snow.rig.head.rotation.y, 0,
    'Snow kept the in-car glance after returning to the ordinary actor loop');
  assert.ok(Math.abs(snow.rig.legL.rotation.x) < 0.8
      && Math.abs(snow.rig.legR.rotation.x) < 0.8,
  'Snow kept the seated leg pose after getting out');
});

test('the passenger pull-in composition contains Snow, his shoulders, hands, wheel, and dashboard', () => {
  const scene = new THREE.Scene();
  const car = makeMotelArrivalCar(scene);
  car.placeArrival(0.35);
  const loadTexture = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  try {
    const snow = new Actor(scene, { ...CAST.snow(), state: 'seated' });
    const forward = car.forwardYaw();
    const towardTony = car.driverFacingPassengerYaw();
    const glance = THREE.MathUtils.clamp(
      Math.atan2(Math.sin(towardTony - forward), Math.cos(towardTony - forward)),
      -Math.PI / 2,
      Math.PI / 2,
    );
    snow.sitAt(car.driverActorPosition(), forward, {
      scaleFactor: 0.74,
      headYaw: glance,
      armPitch: -1.05,
    });

    const camera = new THREE.PerspectiveCamera(75, 1280 / 720, 0.1, 400);
    camera.position.copy(car.passengerPosition());
    const yaw = car.passengerArrivalYaw(0.35);
    const pitch = 0.04;
    camera.lookAt(
      camera.position.x + Math.sin(yaw) * Math.cos(pitch) * 8,
      camera.position.y + Math.sin(pitch) * 8,
      camera.position.z + Math.cos(yaw) * Math.cos(pitch) * 8,
    );
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);

    const ndc = (object) => {
      const bounds = new THREE.Box3().setFromObject(object);
      const points = [];
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            points.push(new THREE.Vector3(x, y, z).project(camera));
          }
        }
      }
      return {
        x0: Math.min(...points.map((point) => point.x)),
        x1: Math.max(...points.map((point) => point.x)),
        y0: Math.min(...points.map((point) => point.y)),
        y1: Math.max(...points.map((point) => point.y)),
      };
    };
    const contained = (object) => {
      const box = ndc(object);
      return box.x0 >= -1 && box.x1 <= 1 && box.y0 >= -1 && box.y1 <= 1;
    };
    const centered = (object) => {
      const point = new THREE.Vector3();
      object.getWorldPosition(point);
      point.project(camera);
      return Math.abs(point.x) < 1 && Math.abs(point.y) < 1;
    };
    const face = snow.group.getObjectByName('actor.face.snow');
    const shoulders = snow.group.getObjectByName('actor.garment.shoulders');
    const hands = ['actor.anatomy.hand.left', 'actor.anatomy.hand.right']
      .map((name) => snow.group.getObjectByName(name));
    const faceBox = ndc(face);
    const faceCenter = (faceBox.x0 + faceBox.x1) / 2;
    const faceWorld = new THREE.Vector3();
    face.getWorldPosition(faceWorld);
    const photoNormal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(face.getWorldQuaternion(new THREE.Quaternion()));
    const photoFacingTony = photoNormal.dot(camera.position.clone().sub(faceWorld).normalize());

    assert.ok(contained(face) && contained(shoulders),
      `Snow's head/shoulders clip the arrival frame: ${JSON.stringify({ face: faceBox, shoulders: ndc(shoulders) })}`);
    assert.ok(Math.abs(faceCenter) > 0.45,
      `Snow occupies the middle instead of a side third: ${faceCenter}`);
    assert.ok(photoFacingTony > 0.7,
      `Snow's photographed face is turned away from Tony: ${photoFacingTony}`);
    assert.ok(hands.every(centered), 'Snow loses one or both hands outside the arrival frame');
    assert.ok(centered(car.group.getObjectByName('cockpit.steering-wheel')),
      'the wheel is absent from the passenger composition');
    assert.ok(centered(car.group.getObjectByName('cockpit.dashboard')),
      'the dashboard is absent from the passenger composition');
    const cameraClips = [];
    scene.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.computeBoundingBox();
      const localEye = object.worldToLocal(camera.position.clone());
      if (object.geometry.boundingBox?.containsPoint(localEye)) {
        cameraClips.push(object.name || object.geometry?.type || 'anonymous mesh');
      }
    });
    assert.deepEqual(cameraClips, [],
      `Tony's passenger eye clips a car or body mesh: ${cameraClips.join(', ')}`);
  } finally {
    THREE.TextureLoader.prototype.load = loadTexture;
  }
});

test('the Motel hit flash scales from and returns to the authored body size', () => {
  const scene = new THREE.Scene();
  const rico = new Actor(scene, { ...CAST.rico(), x: 0, z: 0, state: 'deal' });
  const base = CAST.rico().scale;
  const ctx = { player: { x: 0, z: 4 }, floorAt: () => 0, blocked: () => false };

  rico.damage(1, false, 0, -4);
  rico.update(0, ctx);
  assert.ok(Math.abs(rico.group.scale.x - base * (1 + 0.18 * 0.35)) < 1e-9,
    'the flash multiplier is applied on top of Rico’s authored scale');

  rico.update(0.2, ctx);
  assert.equal(rico.group.scale.x, base, 'the actor returns to his authored scale after the flash');
});

test('the first-person revolver reads as a complete gun, not two boxes', () => {
  const revolver = buildWeaponMesh('revolver');
  const parts = new Set();
  revolver.traverse((node) => {
    if (node.name) parts.add(node.name);
  });
  for (const part of ['revolver.barrel', 'revolver.cylinder', 'revolver.grip', 'revolver.muzzle']) {
    assert.equal(parts.has(part), true, `${part} is visible in the held model`);
  }
});
