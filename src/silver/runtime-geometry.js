import { makeBand, populate } from './cast.js';
import { Date_ } from './date.js';
import { buildRoom } from './room.js';
import { makeTaxi } from './vehicle.js';

function assignAssembly(root, assemblyId) {
  if (!root) throw new Error(`Silver runtime geometry: missing root for ${assemblyId}`);
  root.userData.geometryGate = {
    ...(root.userData.geometryGate ?? {}),
    assemblyId,
  };
}

/** Build only the authored room, preserving the browser's loading-stage seam. */
export function buildSilverRuntimeRoom(scene, { renderer = null } = {}) {
  return buildRoom(scene, { renderer });
}

/** Add every non-player runtime producer that is mounted after the room. */
export function populateSilverRuntimeEnvironment(scene, room) {
  const cast = populate(scene, room);
  const band = makeBand(scene, room);
  const taxi = makeTaxi(scene, room.anchors.dropOff);

  const castKeyByGroup = new Map(
    Object.entries(cast.byName).map(([key, npc]) => [npc.group, key]),
  );
  const claimedFixtures = new Map();
  cast.all.forEach((npc, index) => {
    const key = castKeyByGroup.get(npc.group) ?? `unkeyed-${index}`;
    const assemblyId = npc.geometryAssemblyId ?? `silver-cast:${key}`;
    assignAssembly(npc.group, assemblyId);
    if (!npc.geometrySeat) return;
    const table = npc.geometryTable;
    if (!table?.isObject3D || table.geometryAssemblyId !== assemblyId
        || !table.geometrySeats?.some(({ chair }) => chair === npc.geometrySeat)) {
      throw new Error(`Silver runtime geometry: invalid authored seating provenance at ${key}`);
    }
    for (const fixture of [table, ...table.geometrySeats.map(({ chair }) => chair)]) {
      const claimed = claimedFixtures.get(fixture);
      if (claimed && claimed !== assemblyId) {
        throw new Error(`Silver runtime geometry: seating fixture has conflicting owners at ${key}`);
      }
      claimedFixtures.set(fixture, assemblyId);
      assignAssembly(fixture, assemblyId);
    }
  });
  band.members.forEach((npc, index) => assignAssembly(npc.group, `silver-band:${index}`));
  assignAssembly(taxi.group, 'silver-taxi');
  assignAssembly(taxi.driver.group, 'silver-taxi');

  return Object.freeze({ cast, band, taxi });
}

/** Build the room and every non-player geometry producer present at boot. */
export function buildSilverRuntimeEnvironment(scene, options = {}) {
  const room = buildSilverRuntimeRoom(scene, options);
  return Object.freeze({ room, ...populateSilverRuntimeEnvironment(scene, room) });
}

/** Build Margo after the caller has assembled the hooks her dialogue needs. */
export function buildSilverRuntimeDate(scene, room, hooks = {}) {
  const date = new Date_(scene, room, hooks);
  assignAssembly(date.group, 'silver-date');
  return date;
}
