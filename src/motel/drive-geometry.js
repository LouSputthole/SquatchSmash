import * as THREE from 'three';

import { lambert } from '../../game/src/world.js';
import { aimHeadlightBeam, createHeadlightBeam } from '../core/vehicles/headlights.js';

export const MOTEL_DRIVE_SEGMENT_COUNT = 24;
export const MOTEL_DRIVE_SEGMENT_LENGTH = 50;

function own(object, assemblyId, policy = {}) {
  object.userData.geometryGate = {
    ...(object.userData.geometryGate ?? {}),
    assemblyId,
    ...policy,
  };
  return object;
}

/** Wheels and lamp faces, shared by the player car and traffic. */
function finishDriveCar(group, assemblyId) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1.5, 1.5]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10),
        lambert(0x14141a),
      );
      wheel.name = 'motel.drive.car-wheel';
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 0.95, 0.45, sz);
      group.add(wheel);
    }
  }
  for (const sx of [-0.65, 0.65]) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.24, 0.1),
      lambert(0xfff0c0, { emissive: 0xffe090 }),
    );
    lamp.name = 'motel.drive.car-headlamp';
    lamp.position.set(sx, 0.9, -2.32);
    group.add(lamp);
  }
  own(group, assemblyId);
  return group;
}

/** A soft wedge of light, brightest a few metres out and fading down the road. */
let poolTexture = null;
function headlightPoolTexture() {
  if (poolTexture) return poolTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 168, 8, 128, 168, 122);
  gradient.addColorStop(0, 'rgba(255,244,208,0.85)');
  gradient.addColorStop(0.4, 'rgba(255,238,190,0.34)');
  gradient.addColorStop(1, 'rgba(255,232,170,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  poolTexture = new THREE.CanvasTexture(canvas);
  poolTexture.colorSpace = THREE.SRGBColorSpace;
  return poolTexture;
}

/** Build the exact player convertible or spawned sedan used by the chase. */
export function buildMotelDriveCar(color, player = false) {
  const assemblyId = player ? 'motel.drive.player-car' : 'motel.drive.traffic-car';
  const group = new THREE.Group();
  group.name = assemblyId;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 4.6), lambert(color));
  body.name = 'motel.drive.car-body';
  body.position.y = 0.85;
  group.add(body);

  if (!player) {
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.8, 2.2),
      lambert(0x121820, { emissive: 0x0a1016 }),
    );
    cabin.name = 'motel.drive.sedan-cabin';
    cabin.position.set(0, 1.65, -0.2);
    group.add(cabin);
    return finishDriveCar(group, assemblyId);
  }

  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 2.2), lambert(0x1a1c22));
  tub.name = 'motel.drive.cockpit-tub';
  tub.position.set(0, 1.31, 0.2);
  group.add(tub);
  for (const sx of [-0.45, 0.45]) {
    const cushion = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.12, 0.6),
      lambert(0x5a2c2c),
    );
    cushion.name = 'motel.drive.seat-cushion';
    cushion.position.set(sx, 1.4, 0.5);
    group.add(cushion);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.44, 0.12),
      lambert(0x5a2c2c),
    );
    back.name = 'motel.drive.seat-back';
    back.position.set(sx, 1.62, 0.86);
    back.rotation.x = -0.14;
    back.userData.role = 'seat-back';
    group.add(back);
  }

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.18, 0.36),
    lambert(0x14161c, { emissive: 0x101418 }),
  );
  dash.name = 'motel.drive.dashboard';
  dash.position.set(0, 1.44, -0.62);
  dash.userData.role = 'dash';
  group.add(dash);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.03, 6, 14), lambert(0x0e0f13));
  wheel.name = 'motel.drive.steering-wheel';
  wheel.position.set(-0.45, 1.56, -0.44);
  wheel.rotation.x = -1.15;
  group.add(wheel);
  const shield = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.5, 0.05),
    lambert(0xbcd2e0, { transparent: true, opacity: 0.18 }),
  );
  shield.name = 'motel.drive.windshield';
  shield.position.set(0, 1.72, -0.92);
  shield.rotation.x = 0.3;
  shield.userData.role = 'windshield';
  group.add(shield);
  const shieldFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.86, 0.05, 0.06),
    lambert(0x8a8f98),
  );
  shieldFrame.name = 'motel.drive.windshield-frame';
  shieldFrame.position.set(0, 1.95, -0.85);
  shieldFrame.rotation.x = 0.3;
  group.add(shieldFrame);

  for (const sx of [-0.65, 0.65]) {
    const spot = new THREE.SpotLight(0xfff0c8, 1600, 90, 0.5, 0.45, 1);
    spot.castShadow = false;
    spot.position.set(sx, 1.0, -2.3);
    spot.target.position.set(sx * 1.3, 0, -16);
    spot.userData.role = 'headlight';
    group.add(spot, spot.target);
    const beam = createHeadlightBeam({
      reach: 13,
      farRadius: 0.9,
      name: 'motel.drive.headlight-beam',
      color: 0xfff2c8,
      opacity: 0.05,
    });
    beam.position.copy(spot.position);
    aimHeadlightBeam(beam, spot.target.position.clone().sub(spot.position));
    beam.renderOrder = -1;
    beam.userData.role = 'headlight-beam';
    beam.userData.sceneAuditIgnore = true;
    group.add(beam);
  }

  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 30),
    new THREE.MeshBasicMaterial({
      map: headlightPoolTexture(),
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pool.name = 'motel.drive.headlight-pool';
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.03, -14);
  pool.renderOrder = -2;
  pool.userData.role = 'headlight-pool';
  pool.userData.sceneAuditIgnore = true;
  group.add(pool);
  return finishDriveCar(group, assemblyId);
}

/** Build the complete chase road and the initial player vehicle. */
export function buildMotelDriveScene() {
  const scene = new THREE.Scene();
  scene.name = 'motel.drive.scene';
  scene.background = new THREE.Color(0x090c16);
  scene.fog = new THREE.Fog(0x0d1220, 30, 170);
  scene.add(new THREE.HemisphereLight(0x33405c, 0x0a0a0c, 0.22));
  const key = new THREE.DirectionalLight(0x9fb4e8, 0.16);
  key.position.set(-20, 40, -30);
  scene.add(key);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, MOTEL_DRIVE_SEGMENT_COUNT * MOTEL_DRIVE_SEGMENT_LENGTH),
    lambert(0x16241c),
  );
  ground.name = 'motel.drive.ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -(MOTEL_DRIVE_SEGMENT_COUNT - 1) * MOTEL_DRIVE_SEGMENT_LENGTH / 2;
  own(ground, 'motel.drive.ground', { structural: true });
  scene.add(ground);

  const road = [];
  for (let i = 0; i < MOTEL_DRIVE_SEGMENT_COUNT; i += 1) {
    const z = -i * MOTEL_DRIVE_SEGMENT_LENGTH;
    const segment = new THREE.Mesh(
      new THREE.PlaneGeometry(20, MOTEL_DRIVE_SEGMENT_LENGTH),
      lambert(0x1e1e24),
    );
    segment.name = `motel.drive.road-segment.${i}`;
    segment.rotation.x = -Math.PI / 2;
    segment.position.set(0, 0.01, z);
    own(segment, `motel.drive.road-segment.${i}`, { structural: true });
    scene.add(segment);

    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 14),
      lambert(0xd8c86a, { emissive: 0x6a5a20 }),
    );
    dash.name = `motel.drive.center-dash.${i}`;
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.03, z);
    own(dash, `motel.drive.center-dash.${i}`);
    scene.add(dash);

    const palm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.4, 8, 6),
      lambert(0x5c4a32),
    );
    palm.name = `motel.drive.palm.${i}`;
    palm.position.set(-18, 4, z);
    own(palm, `motel.drive.palm.${i}`);
    scene.add(palm);

    const fixtures = [];
    for (const [side, x] of [['right', 14], ['left', -14]]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 6.85, 6),
        lambert(0x4a4a52),
      );
      pole.name = `motel.drive.lamp-pole.${side}.${i}`;
      pole.position.set(x, 3.425, z);
      own(pole, `motel.drive.lamp-fixture.${side}.${i}`);
      scene.add(pole);
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.3, 0.6),
        lambert(0xffe6a8, { emissive: 0xffb060 }),
      );
      lamp.name = `motel.drive.lamp.${side}.${i}`;
      lamp.position.set(x, 7, z);
      own(lamp, `motel.drive.lamp-fixture.${side}.${i}`);
      scene.add(lamp);
      fixtures.push({ side, lamp, pole });
    }

    road.push({
      seg: segment,
      dash,
      palmL: palm,
      lamp: fixtures[0].lamp,
      pole: fixtures[0].pole,
      lampL: fixtures[1].lamp,
      poleL: fixtures[1].pole,
      z,
    });
  }

  const car = buildMotelDriveCar(0x6b2f3a, true);
  scene.add(car);
  return { scene, car, road, segmentCount: road.length };
}
