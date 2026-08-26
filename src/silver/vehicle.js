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
import { VehicleOccupants } from '../core/vehicles/occupants.js';

/** How far up the street the car starts, and how far it goes when it leaves. */
const APPROACH = 22;

export function makeTaxi(scene, dropOff) {
  const car = makeCar('sedan', 0x2a3a4a, { dented: true });
  /* Parked parallel to the kerb, nose up the street. makeCar authors cars long
   * on local X with the headlights at +x, and the street runs along x — the
   * first pass drove it down the z axis, which is a sedan sliding sideways
   * across the pavement and stopping with its nose through the canopy posts.
   * The park spot sits the body wholly on the road: kerbline at z 38.55, car
   * half-width 1.11, so z 39.85 leaves a shoe's width of tarmac between the
   * sill and the kerb, which is where a driver who is not stopping here stops. */
  const park = { x: dropOff.x + 0.8, z: dropOff.z + 1.65 };
  car.group.position.set(park.x - APPROACH, 0, park.z);
  car.group.rotation.y = 0;
  scene.add(car.group);
  const occupants = new VehicleOccupants(car.group, {
    driverActor: { x: 0.55, y: 0.16, z: 0.28 },
  });

  const driver = new Npc(scene, {
    name: 'the driver', tier: 'ambient', job: 'sit', look: true,
    x: park.x + 0.55, z: park.z + 0.28, yaw: Math.PI,
    model: {
      /* A man at the end of a long shift in his own clothes. No club colours,
       * no tracksuit, nothing that reads as connected to anybody. */
      height: 1.72, build: 1.16, dress: 'shirt', shirt: 0x3a3a42,
      hair: 'receding', hairColour: 0x4a4a48, glasses: true,
    },
  });
  /* Sat in a car rather than on a chair: lower, in the front half of the
   * cabin, turned to the kerbside glass — for the next forty-five seconds he
   * is a head in a window. */
  driver.group.position.set(park.x + 0.55, 0.16, park.z + 0.28);
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
    occupants,
    window: win,
    park,
    /** He has three more of these before he is finished for the night. */
    leave() {
      if (leaving) return;
      /* Keep the generic Bing Npc in scene space while he is parked and
       * interactable: its faceToward policy is intentionally scene-owned.
       * The moment he becomes a moving occupant, hand him to the canonical
       * vehicle anchor so the whole departure transform is inherited. Keep
       * whatever final glance the parked interaction left him on. */
      const localYaw = driver.group.rotation.y - car.group.rotation.y;
      occupants.attach('driverActor', driver.group, { localYaw });
      leaving = 1;
    },
    update(dt) {
      if (!leaving) {
        driver.update(dt, null);
        return;
      }
      // Off up the street the way he was already pointing, not across the kerb
      leaving += dt;
      car.group.position.x += 9 * dt;
      if (car.group.position.x > park.x + APPROACH * 2) {
        car.group.visible = false;
      }
    },
  };
}
