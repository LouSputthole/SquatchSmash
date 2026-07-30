/**
 * The car you turn up in.
 *
 * Booski said he was driving, on the phone, the day before the meeting — so
 * it is Booski's car and Booski is in it, and the brief's instruction not to
 * spend the mission's budget building a limousine is answered by not building
 * one. It is the Bing's `makeCar` in a colour, with somebody behind the wheel.
 */
import * as THREE from 'three';
import { makeCar } from '../bing/vehicles.js';
import { Npc } from '../bing/cast.js';

export function makeTaxi(scene, dropOff) {
  const car = makeCar('sedan', 0x2a3a4a, { dented: true });
  car.group.position.set(dropOff.x + 1.2, 0, dropOff.z + 14);
  car.group.rotation.y = 0;
  scene.add(car.group);

  const driver = new Npc(scene, {
    name: 'Booski', tier: 'ambient', job: 'sit', look: true,
    x: dropOff.x + 1.2, z: dropOff.z + 14, yaw: -Math.PI / 2,
    model: {
      height: 1.74, build: 1.08, dress: 'tracksuit', shirt: 0x1c2f4a,
      hair: 'crop', bandana: true,
    },
  });
  /* Sat in a car rather than on a chair: lower, and turned to the window,
   * because for the next forty-five seconds he is a head in a window. */
  driver.group.position.y = 0.16;
  driver.baseY = 0.16;

  /* Something to aim the interaction at. The car's own glass is one mesh for
   * the whole cabin, so the prompt would follow you round the vehicle. */
  const win = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.9, 0.3),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  win.position.set(0, 1.35, -1.0);
  car.group.add(win);

  let leaving = 0;
  return {
    group: car.group,
    car,
    driver,
    window: win,
    /** He has a match at four, in a region he cannot pronounce. */
    leave() { if (!leaving) leaving = 1; },
    update(dt) {
      if (!leaving) {
        driver.update(dt, null);
        return;
      }
      leaving += dt;
      car.group.position.z += 9 * dt;
      driver.group.position.z = car.group.position.z;
      if (car.group.position.z > dropOff.z + 40) car.group.visible = false;
    },
  };
}
