import * as THREE from 'three';
import { box, cylinder, plane, mat } from '../../world/build.js';
import { Person } from '../../core/person.js';
import { APE_FAMILY_MEMBER, APE_FACE_URL } from '../../bing/family-ape.js';

/**
 * The car ride over — a cutscene rig, not a drivable vehicle. Tony (the
 * player, "Prospect" in the dialogue) never gets the wheel because he was
 * never driving; Ape talks the whole way while the city slides past outside
 * a windshield that never needs to be more than a dark, lit-up smear.
 *
 * Kept small and centred near local origin — roughly x:[-1.2,1.2],
 * z:[-1.5,1.5] — so it never overlaps ApartmentScene.js's own coordinates
 * (hallway/apartment run x:[0,12]). main.js is expected to toggle
 * `root.visible` and teleport the player between the two rather than moving
 * either set of geometry.
 */

// ---- Anchors main.js feeds straight into the Player controller and Ape's
// seat. Player.js's yaw is a *camera* yaw, where forward = (-sin(yaw), 0,
// -cos(yaw)); yaw 0 already looks down -z (three.js's default camera
// forward), which is "straight out the windshield" here.
export const CAR_ANCHORS = Object.freeze({
  playerSeat: Object.freeze({ x: 0.5, y: 1.1, z: 0.4 }),
  playerYaw: 0,
  yawRange: 0.6,
  pitchMin: -0.42,
  pitchMax: 0.38,
  // Driver's seat, to Tony's left. Facing forward at yaw 0, "left" is -x
  // (right = forward × up = +x, so left is the opposite).
  driverSeat: Object.freeze({ x: -0.5, y: 0, z: 0.4 }),
  // Person's own facing convention is different from the camera's: its
  // `facing()` returns (sin(heading), 0, cos(heading)), so heading 0 faces
  // +z and heading PI faces -z — the same "out the windshield" direction.
  driverYaw: Math.PI,
});

/** A cheap 128x32 canvas of blurred streetlights, tiled and scrolled. */
function windshieldTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#050608';
  g.fillRect(0, 0, 128, 32);
  const lights = [[6, '#ffcf8a'], [34, '#ffd9a8'], [58, '#ffb877'], [90, '#fff0c6'], [112, '#ffcf8a']];
  for (const [x, colour] of lights) {
    const grad = g.createRadialGradient(x, 14, 0, x, 14, 10);
    grad.addColorStop(0, colour);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - 12, 2, 24, 24);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(2.4, 1);
  return tex;
}

/**
 * Person has no knee joint and no seated pose of its own — this is a cheap,
 * safe approximation (a modest hip-forward lean) rather than translating the
 * whole rig down onto a seat, which would either sink his feet through the
 * floor or leave his legs floating clear of it.
 */
function seatApe(person, seat, yaw) {
  person.group.position.set(seat.x, seat.y, seat.z);
  person.group.rotation.y = yaw;
  person.heading = yaw;
  person.legL.rotation.x = 0.35;
  person.legR.rotation.x = 0.35;
  person.armR.rotation.x = 0.25; // resting near the wheel
  person.armL.rotation.x = 0.3;
}

export function buildCarInterior() {
  const root = new THREE.Group();
  root.name = 'carInterior';

  const M = {
    dash: mat({ color: 0x1c1a1e, roughness: 0.7 }),
    trim: mat({ color: 0x100f12, roughness: 0.6 }),
    seat: mat({ color: 0x2a2224, roughness: 0.95 }),
    seatDark: mat({ color: 0x181314, roughness: 0.95 }),
    headliner: mat({ color: 0x141316, roughness: 0.9 }),
    carpet: mat({ color: 0x0f0e10, roughness: 1 }),
    wheel: mat({ color: 0x141112, roughness: 0.55 }),
    window: mat({
      color: 0x0a1018, roughness: 0.3, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    }),
  };

  // Floor + headliner, so the rig doesn't read as a dashboard floating in a
  // void when the player looks down or up.
  const floor = plane(2.4, 3.2, M.carpet);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0.3);
  root.add(floor);
  const roof = plane(2.4, 3.2, M.headliner);
  roof.rotation.x = Math.PI / 2;
  roof.position.set(0, 1.95, 0.3);
  root.add(roof);

  // Bench seat, wide enough for both of them.
  root.add(box({ size: [2.2, 0.42, 0.85], pos: [0, 0.21, 0.55], mat: M.seat }));
  root.add(box({ size: [2.2, 0.55, 0.16], pos: [0, 0.62, 0.98], mat: M.seatDark }));

  // Dashboard — ahead of the bench, below the windshield.
  root.add(box({ size: [2.3, 0.34, 0.55], pos: [0, 0.82, -0.85], mat: M.dash }));
  root.add(box({ size: [2.3, 0.08, 0.6], pos: [0, 1.0, -0.85], mat: M.trim }));

  // Steering wheel + column, in front of the driver.
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 20), M.wheel);
  wheel.position.set(-0.5, 0.95, -0.55);
  wheel.rotation.x = Math.PI / 2.4;
  root.add(wheel);
  root.add(cylinder({ r: 0.03, h: 0.35, pos: [-0.5, 0.78, -0.72], rotX: 1.0, mat: M.trim }));

  // Side door panels + windows, so the cabin reads as enclosed.
  for (const side of [-1, 1]) {
    root.add(box({ size: [0.1, 1.05, 2.6], pos: [side * 1.15, 0.7, 0.3], mat: M.dash }));
    const win = plane(0.9, 0.55, M.window);
    win.position.set(side * 1.14, 1.25, 0.3);
    win.rotation.y = Math.PI / 2;
    root.add(win);
  }

  // Windshield — dark, tinted, with a texture of streetlights that scrolls
  // sideways to fake motion cheaply.
  const windTex = windshieldTexture();
  const windMat = new THREE.MeshStandardMaterial({
    color: 0x03050a,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: windTex,
    emissiveIntensity: 0.9,
  });
  const windshield = plane(2.2, 1.05, windMat);
  windshield.position.set(0, 1.42, -1.42);
  windshield.rotation.x = -0.18;
  root.add(windshield);
  root.add(box({ size: [2.3, 0.1, 0.08], pos: [0, 1.95, -1.4], mat: M.trim }));

  // Ape, at the wheel.
  const ape = new Person({
    shirt: APE_FAMILY_MEMBER.model.shirt,
    shirtDark: 0x0a0a0e,
    pants: 0x1a1a20,
    skin: APE_FAMILY_MEMBER.model.skin,
    hair: APE_FAMILY_MEMBER.model.hairColour,
    face: APE_FACE_URL,
  });
  // Person's box rig has no height/build sliders of its own — approximate
  // APE_FAMILY_MEMBER.model's canonical height (1.88) and build (1.3) with a
  // uniform scale rather than inventing new proportions for him. 1.9 is a
  // plain "generic adult" reference height for the unscaled rig.
  const BASE_HEIGHT = 1.9;
  ape.group.scale.set(
    APE_FAMILY_MEMBER.model.build,
    APE_FAMILY_MEMBER.model.height / BASE_HEIGHT,
    APE_FAMILY_MEMBER.model.build,
  );
  seatApe(ape, CAR_ANCHORS.driverSeat, CAR_ANCHORS.driverYaw);
  root.add(ape.group);

  let scrollT = 0;
  function update(dt) {
    scrollT += dt * 0.12;
    windTex.offset.x = scrollT % 1;
    windMat.emissiveIntensity = 0.75
      + Math.sin(scrollT * 14) * 0.08
      + Math.sin(scrollT * 31 + 1.3) * 0.05;
  }

  return {
    root,
    ape,
    update,
    anchors: CAR_ANCHORS,
  };
}
