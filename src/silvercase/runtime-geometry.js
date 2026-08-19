import { populateCast } from './cast/cast.js';
import { buildApartmentScene } from './scenes/ApartmentScene.js';
import { buildCarInterior } from './scenes/CarInterior.js';

/** Build both mutually exclusive worlds and the complete apartment cast. */
export function buildSilverCaseRuntimeGeometry(scene) {
  if (!scene?.add) throw new Error('Silver Case runtime geometry requires a Scene-like parent');
  const apartment = buildApartmentScene();
  const car = buildCarInterior();
  scene.add(apartment.root, car.root);
  apartment.root.visible = false;
  car.root.visible = false;

  const cast = populateCast(apartment.root);
  for (const [id, actor] of Object.entries({
    ape: cast.ape,
    deke: cast.deke,
    chester: cast.chester,
    winston: cast.winston,
    pruitt: cast.pruitt,
  })) {
    if (!actor?.group) throw new Error(`Silver Case runtime geometry: missing ${id}`);
    actor.group.userData.geometryGate = {
      ...(actor.group.userData.geometryGate ?? {}),
      assemblyId: `silvercase:${id}`,
    };
  }

  // These fixtures physically support their checkpoint occupants. Sharing the
  // actor's assembly suppresses only contacts inside that exact seated/fallen
  // actor-fixture unit; the rest of each room remains independently audited.
  apartment.props.couch.group.userData.geometryGate = {
    ...(apartment.props.couch.group.userData.geometryGate ?? {}),
    assemblyId: 'silvercase:deke',
  };
  apartment.props.chair.group.userData.geometryGate = {
    ...(apartment.props.chair.group.userData.geometryGate ?? {}),
    assemblyId: 'silvercase:chester',
  };
  apartment.props.weaponHints.couchGrip.userData.geometryGate = {
    ...(apartment.props.weaponHints.couchGrip.userData.geometryGate ?? {}),
    assemblyId: 'silvercase:deke',
  };

  return Object.freeze({ apartment, car, cast });
}
