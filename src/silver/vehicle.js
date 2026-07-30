/**
 * The car you turn up in, and the man driving it.
 *
 * A hired car off a rank, and a driver who has never seen either of them
 * before. That is the whole reason he is not somebody from the crew: the
 * mission is thirty minutes of everybody in a building knowing Prospect's
 * name, and it needs one person at the front who does not, so there is
 * something for the rest of the evening to be different from.
 *
 * He is also the only person all night who says thank you out loud for money.
 * Everybody inside the Silver Room takes it without acknowledging it, which is
 * the tell that they are used to it — and you cannot read that tell unless you
 * have just watched somebody do the normal thing.
 *
 * The brief's instruction not to spend the mission's budget building a
 * limousine is answered by not building one: it is the Bing's `makeCar` in a
 * colour, with a dent in it.
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
    name: 'the driver', tier: 'ambient', job: 'sit', look: true,
    x: dropOff.x + 1.2, z: dropOff.z + 14, yaw: -Math.PI / 2,
    model: {
      /* A man at the end of a long shift in his own clothes. No club colours,
       * no tracksuit, nothing that reads as connected to anybody. */
      height: 1.72, build: 1.16, dress: 'shirt', shirt: 0x3a3a42,
      hair: 'receding', hairColour: 0x4a4a48, glasses: true,
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
    /** He has three more of these before he is finished for the night. */
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
