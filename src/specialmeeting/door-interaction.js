/**
 * Passenger-door affordance for the shared InteractionSystem.
 *
 * The sedan's rendered door is below the player's eye line. Registering the
 * whole car therefore makes the action technically present but practically
 * undiscoverable: the centre-screen ray passes over the body. This Adapter
 * keeps the hit surface attached to the authored door anchor while presenting
 * a person-height convenience volume, the same `soft`-target pattern used by
 * the shared interaction Module for low furniture.
 */
import * as THREE from 'three';

import { DOORS } from './sedan.js';

export const FRONT_PASSENGER_DOOR_AFFORDANCE = Object.freeze({
  width: 2,
  height: 2.1,
  depth: 0.7,
  centreHeight: 1.1,
});

export function createFrontPassengerDoorTarget(sedan) {
  if (!sedan?.group?.add) throw new TypeError('A meeting sedan is required');

  const size = FRONT_PASSENGER_DOOR_AFFORDANCE;
  const target = new THREE.Mesh(
    new THREE.BoxGeometry(size.width, size.height, size.depth),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    }),
  );
  target.name = 'specialmeeting.front-passenger-door.interaction-target';
  target.position.set(
    DOORS.front_passenger.x,
    size.centreHeight,
    DOORS.front_passenger.z,
  );
  target.userData.role = 'interaction-proxy';
  target.userData.anchor = 'front_passenger_door';
  sedan.group.add(target);
  return target;
}
