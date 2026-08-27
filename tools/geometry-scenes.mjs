/**
 * Headless scene-builder Adapters for the strict geometry gate.
 *
 * Runtime scenes expose deliberately different Interfaces: some return one
 * root, some add directly to a Scene, and some contain several mutually
 * exclusive authored states.  This Module keeps those differences on this
 * side of the Seam and hands the worker one uniform snapshot input.
 *
 * IMPORTANT: this file has no static imports from runtime modules.  The worker
 * must install tools/three-shim.mjs before importing or calling this Module.
 */

import { APARTMENT_PREVIEW_VARIANTS } from '../src/core/preview-mode.js';
import { HOTDOG_PREVIEW_CHECKPOINTS } from '../src/bing/preview.js';
import { HEIST_PREVIEW_CHECKPOINTS } from '../src/heist/config.js';

export const GEOMETRY_ACTOR_EXPECTATION_DISPOSITIONS = Object.freeze({
  REQUIRED: 'REQUIRED',
  INTENTIONAL_NA: 'INTENTIONAL_NA',
});

const requiredActors = (reason) => Object.freeze({
  disposition: GEOMETRY_ACTOR_EXPECTATION_DISPOSITIONS.REQUIRED,
  minimum: 1,
  reason,
});

const intentionalNoActors = (reason) => Object.freeze({
  disposition: GEOMETRY_ACTOR_EXPECTATION_DISPOSITIONS.INTENTIONAL_NA,
  minimum: 0,
  reason,
});

const APARTMENT_VISIBLE_MARGO_VARIANTS = new Set(['after-silver-room', 'day-four-wake']);

function apartmentActorExpectation(variant) {
  return APARTMENT_VISIBLE_MARGO_VARIANTS.has(variant)
    ? requiredActors(`Apartment ${variant} visibly stages Margo.`)
    : intentionalNoActors(`Apartment ${variant} intentionally hides Margo and has no other cast.`);
}

const APARTMENT_CHAPTER = Object.freeze({
  'day-one-wake': 'day_one',
  'after-bing-one': 'day_one',
  'after-squatchfather': 'day_one',
  'day-two-wake': 'day_two',
  'after-beef-run': 'day_two',
  'after-motel': 'day_two',
  'day-three-wake': 'no_wake',
  'after-no-wake': 'date',
  'after-silver-room': 'date',
  'day-four-wake': 'golf_morning',
  'after-golf': 'heist_day',
  'after-heist': 'post_heist',
});

const MANSION_PREVIEW_CHECKPOINTS = Object.freeze([
  'arrival', 'office', 'basement', 'lab', 'core_complete',
  'locked', 'aubbie_down', 'silent_night', 'clear', 'suite',
]);

const MANSION_SIEGE_PREVIEW_CHECKPOINTS = Object.freeze([
  'wake', 'armed', 'briefed', 'wave_one',
]);

const MANSION_SIEGE_NO_CAST_DAMAGE_STATES = Object.freeze({
  clean: 'The clean pre-siege house intentionally mounts no battle or aftermath ensemble.',
  alert: 'The alert damage preview is environment-only; the battle ensemble is not active yet.',
  repaired: 'The repaired post-siege house intentionally removes the battle and aftermath ensemble.',
});

function mansionSiegeActorExpectation(damageState) {
  const reason = MANSION_SIEGE_NO_CAST_DAMAGE_STATES[damageState];
  return reason ? intentionalNoActors(reason) : requiredActors(
    `Mansion Siege ${damageState} visibly stages the siege ensemble.`,
  );
}

const entry = (scene, state, adapter, launcherIds, options = {}) => {
  const {
    actorExpectation = requiredActors(`${scene}:${state} must expose its visible staged cast.`),
    ...metadata
  } = options;
  return Object.freeze({
    id: `${scene}:${state}`,
    scene,
    state,
    adapter,
    launcherIds: Object.freeze([...launcherIds]),
    actorExpectation,
    ...metadata,
  });
};

/**
 * Every independently authored geometry state exercised by the blocking gate.
 * `launcherIds` tie the deeper state inventory back to the public preview
 * inventory so adding a page cannot silently omit it from this gate.
 */
export const GEOMETRY_SCENE_STATES = Object.freeze([
  ...APARTMENT_PREVIEW_VARIANTS.map((variant) => entry(
    'apartment', variant, 'apartment', [`apartment:${variant}`],
    {
      chapter: APARTMENT_CHAPTER[variant],
      actorExpectation: apartmentActorExpectation(variant),
    },
  )),
  entry('bing', 'visit-one', 'bing', ['bing']),
  entry('bing', 'performer-bathroom', 'bing', [], { geometryStage: 'performer-bathroom' }),
  ...HOTDOG_PREVIEW_CHECKPOINTS.map((checkpoint) => entry(
    'bing', checkpoint, 'bing-party', ['bing-two'], { checkpoint },
  )),
  entry('mansion', 'tour', 'mansion', ['mansion']),
  entry('mansion', 'return', 'mansion', ['mansion-return']),
  entry('mansion', 'silent-closed', 'silent-squatch', ['mansion']),
  entry('mansion', 'silent-open', 'silent-squatch', ['mansion'], { open: true }),
  ...MANSION_PREVIEW_CHECKPOINTS.map((checkpoint) => entry(
    'mansion', `checkpoint-${checkpoint.replaceAll('_', '-')}`, 'mansion', ['mansion'],
    { checkpoint },
  )),
  entry('golf', 'hole-one', 'golf', ['golf'], { hole: 1, checkpoint: 'hole1' }),
  entry('golf', 'hole-two', 'golf', ['golf'], { hole: 2, checkpoint: 'hole2' }),
  entry('golf', 'hole-three', 'golf', ['golf'], { hole: 3, checkpoint: 'hole3' }),
  entry('golf', 'grille', 'golf', ['golf'], { hole: 3, checkpoint: 'grille' }),
  entry('silver', 'default', 'silver', ['silver']),
  ...['dock', 'underway', 'inlet', 'confrontation', 'body', 'return'].map((checkpoint) => entry(
    'nowake', checkpoint, 'nowake', ['nowake'], { checkpoint },
  )),
  entry('nowake', 'weighted', 'nowake', ['nowake'], { geometryStage: 'weighted' }),
  ...['preflight', 'takeoff', 'flak', 'bombrun', 'detonation', 'return'].map((checkpoint) => entry(
    'enolasquatch', checkpoint, 'enolasquatch', ['enolasquatch'], { checkpoint },
  )),
  ...HEIST_PREVIEW_CHECKPOINTS.map((checkpoint) => entry(
    'heist', checkpoint.replaceAll('_', '-'), 'heist', ['heist'], { checkpoint },
  )),
  /* THE CABIN IS NO LONGER ACTORLESS. Lag lives visibly at the woodpile, so an
   * empty cabin cast is a defect. */
  entry('cabin', 'property', 'cabin', ['cabin'], {
    actorExpectation: requiredActors(
      'The countryside hideout visibly stages Lag at the woodpile.',
    ),
  }),
  /* The luxury flat came back to this list on the owner's note of 2026-08-26:
   * "who are these guys at my poker table? Get rid of them." Its only cast was
   * the three civilian poker patrons, and the empty table is the authored
   * state now -- he has the room, and nobody is in it yet. */
  entry('luxury-apartment', 'property', 'luxury-apartment', ['luxury-apartment'], {
    actorExpectation: intentionalNoActors(
      'The luxury flat is his alone: the poker table is furniture and nobody sits at it.',
    ),
  }),
  entry('motel', 'property', 'motel', ['motel'], { geometryStage: 'startup' }),
  entry('motel', 'late-cast', 'motel', [], { geometryStage: 'late' }),
  entry('motel', 'drive', 'motel', [], {
    geometryStage: 'drive',
    actorExpectation: intentionalNoActors(
      'The Motel drive snapshot is vehicle-only; its cast is outside this authored world state.',
    ),
  }),
  ...['arrival', 'carried', 'placed', 'buried'].map((checkpoint) => entry(
    'graveyard', checkpoint, 'graveyard', ['graveyard'], { checkpoint },
  )),
  ...['preflight', 'takeoff', 'approach', 'departure', 'return', 'landing'].map((checkpoint) => entry(
    'beefrun', checkpoint, 'beefrun', ['beefrun'], { checkpoint },
  )),
  entry('silvercase', 'car', 'silvercase-car', ['silvercase'], { checkpoint: 'car' }),
  ...['hallway', 'room', 'prayer', 'bathroom', 'aftermath'].map((checkpoint) => entry(
    'silvercase', checkpoint, 'silvercase-apartment', ['silvercase'], { checkpoint },
  )),
  entry('squatchfather', 'default', 'squatchfather', ['squatchfather']),
  ...['approach', 'perimeter', 'estate', 'betrayal', 'dining_room', 'clear'].map((checkpoint) => entry(
    'cartel-palace', checkpoint.replaceAll('_', '-'), 'cartel-palace', ['cartel-palace'], { checkpoint },
  )),
  ...['clean', 'alert', 'under_attack', 'damaged', 'post_battle', 'repaired'].map((damageState) => entry(
    'mansion-siege', damageState.replaceAll('_', '-'), 'mansion-siege', ['mansion-siege'],
    { damageState, actorExpectation: mansionSiegeActorExpectation(damageState) },
  )),
  ...MANSION_SIEGE_PREVIEW_CHECKPOINTS.map((checkpoint) => entry(
    'mansion-siege', `checkpoint-${checkpoint.replaceAll('_', '-')}`, 'mansion-siege', ['mansion-siege'],
    { checkpoint, damageState: 'under_attack' },
  )),
  /* The Special Meeting is one campaign scene over two mutually exclusive
   * worlds, so it registers three states rather than one. `kerb` is the
   * street, authored in the two arrangements the runtime actually builds
   * (SPECIAL_MEETING_GEOMETRY_STATES in
   * src/specialmeeting/runtime-geometry.js): `waiting`, where the pavement,
   * doorway and alley are read with no car on them, and `arrived`, the only
   * state where the boot lid is up and overhanging. `spur` is the patch of
   * dirt in the woods on the far side of the cut to black. Same reason the
   * Silver Case splits: one page, one scene, two worlds that never coexist.
   *
   * All three claim the `special-meeting` launcher. That id ties this
   * inventory to the preview page in tools/scene-audit-scenes.mjs, and
   * geometryLauncherCoverage() is held to exactly that inventory by
   * tests/geometry-scene-registry.test.mjs ("must neither omit nor invent
   * public scene launchers") -- one page, one launcher, three worlds behind
   * it. */
  ...['waiting', 'arrived'].map((blockState) => entry(
    'specialmeeting', `kerb-${blockState}`, 'specialmeeting-kerb', ['special-meeting'],
    { blockState },
  )),
  entry('specialmeeting', 'spur', 'specialmeeting-spur', ['special-meeting']),
  /* Initiation Night, no longer frozen: see buildInitiation for why the
   * waiver's reason stopped being true. Two states, 36 m of trail apart. */
  entry('initiation', 'clearing', 'initiation', ['initiation']),
  entry('initiation', 'cabin', 'initiation', ['initiation']),
]);

/**
 * Initiation is deliberately frozen pending the owner playtest.  Its geometry
 * is interleaved with top-level WebGL boot code and has no builder Interface.
 * Keeping the waiver in the registry makes it visible and testable without
 * changing src/initiation/**
 * Scenes deliberately outside the blocking gate.
 *
 * Empty, and worth keeping empty. Initiation was the last entry here; its
 * stated reason -- "no extractable headless builder" -- had been false since
 * the cabin ceremony was written, and the waiver simply outlived it. A waiver
 * whose reason nobody re-reads is a hole in the gate that looks like a
 * decision.
 */
export const GEOMETRY_FROZEN_WAIVERS = Object.freeze([]);

const BY_ID = new Map(GEOMETRY_SCENE_STATES.map((state) => [state.id, state]));

export function geometrySceneState(id) {
  return BY_ID.get(String(id)) ?? null;
}

export function geometryLauncherCoverage() {
  const coverage = new Map();
  for (const state of GEOMETRY_SCENE_STATES) {
    for (const launcherId of state.launcherIds) {
      if (!coverage.has(launcherId)) coverage.set(launcherId, []);
      coverage.get(launcherId).push(state.id);
    }
  }
  for (const waiver of GEOMETRY_FROZEN_WAIVERS) coverage.set(waiver.launcherId, [`waiver:${waiver.source}`]);
  return new Map([...coverage].map(([id, states]) => [id, Object.freeze(states.toSorted())]));
}

function noop() {}

function noopProxy(overrides = {}) {
  return new Proxy(overrides, {
    get(target, key) {
      if (key in target) return target[key];
      return noop;
    },
  });
}

function installHeadlessGlobals(THREE) {
  globalThis.window ??= {};
  Object.assign(globalThis.window, {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    __squatchStage: noop,
  });
  globalThis.window.location ??= { search: '', pathname: '/', href: '' };
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => null });
  return {
    audio: noopProxy({ startLoop: () => null, stopLoop: noop, play: noop, say: noop }),
    hud: noopProxy(),
    interaction: noopProxy({ register: noop, unregister: noop, setOccluders: noop }),
    time: {
      isDark: false,
      sunIntensity: 1,
      sunColour: new THREE.Color(0xffffff),
      sunPos: new THREE.Vector3(30, 50, 20),
      fillIntensity: 1,
      hemiIntensity: 1,
      hemiSky: new THREE.Color(0xffffff),
      hemiGround: new THREE.Color(0x444444),
      ambIntensity: 1,
      ambColour: new THREE.Color(0xffffff),
      skyFrom: 'day',
      skyTo: 'day',
      skyBlend: 0,
      minutes: 12 * 60,
    },
  };
}

function result(descriptor, roots, colliders = [], metadata = {}) {
  return {
    id: descriptor.id,
    scene: descriptor.scene,
    state: descriptor.state,
    roots: roots.filter(({ root }) => root?.traverse),
    colliders: colliders.filter(Boolean),
    metadata,
  };
}

const APARTMENT_ROOM_GROUPS = new Set(['bathroom', 'kitchen', 'desk', 'closet']);
function annotateApartmentPropAssemblies(root) {
  const ordinals = new Map();
  for (const child of root.children) {
    if (!child?.isGroup || !child.name) continue;
    const ordinal = ordinals.get(child.name) ?? 0;
    ordinals.set(child.name, ordinal + 1);
    if (APARTMENT_ROOM_GROUPS.has(child.name)) continue;

    const existing = child.userData?.geometryGate?.assemblyId
      ?? child.userData?.geometryGateAssemblyId;
    if (existing) continue;

    child.userData ??= {};
    child.userData.geometryGate = {
      ...(child.userData.geometryGate ?? {}),
      assemblyId: `apartment-prop:${child.name}:${ordinal}`,
    };
  }

  // This chapter prop is authored as a jacket draped over the desk chair.
  const chairs = root.children.filter(({ name }) => name === 'chair');
  const jackets = root.children.filter(({ name }) => name === 'dress:casualJacket');
  if (jackets.length > 1 || (jackets.length === 1 && chairs.length !== 1)) {
    throw new Error('Apartment jacket-to-chair geometry ownership is ambiguous');
  }
  if (jackets.length === 1) {
    const assemblyId = chairs[0].userData?.geometryGate?.assemblyId;
    if (!assemblyId) throw new Error('Apartment desk chair is missing geometry ownership');
    jackets[0].userData.geometryGate = {
      ...(jackets[0].userData.geometryGate ?? {}),
      assemblyId,
    };
  }
}

async function buildApartment(descriptor, THREE, collaborators) {
  const [
    { buildApartment: build },
    { apartmentPreviewCampaignState },
    { cashPilesForCampaign, persistentDressingForCampaign },
    { stageApartmentPreviewGeometry },
  ] = await Promise.all([
    import('../src/world/apartment.js'),
    import('../src/core/campaign.js'),
    import('../src/world/dressing.js'),
    import('../src/world/apartment-preview-geometry.js'),
  ]);
  const { state: campaignState, spawn } = apartmentPreviewCampaignState(descriptor.state);
  if (campaignState.story.chapter !== descriptor.chapter) {
    throw new Error(`${descriptor.id} chapter disagrees with canonical preview campaign state`);
  }
  const persistentDressing = persistentDressingForCampaign(campaignState);
  const cashPiles = cashPilesForCampaign(campaignState);
  const scene = new THREE.Scene();
  const apartment = await build({
    scene,
    ...collaborators,
    chapter: campaignState.story.chapter,
    persistentDressing,
    cashPiles: () => cashPiles,
    gunUnlocked: campaignState.missions.bada_bing_one.packageReceived === true,
  });
  apartment.applyChapterDressing(campaignState.story.chapter);
  annotateApartmentPropAssemblies(apartment.root);
  const previewGeometry = stageApartmentPreviewGeometry(apartment, descriptor.state);
  let totalMeshCount = 0;
  apartment.root.traverse((object) => { if (object.isMesh) totalMeshCount += 1; });
  const dressingProducerCount = apartment.dressing?.size ?? 0;
  const margoProducerCount = apartment.root.children.filter(({ name }) => name === 'margo').length;
  if (totalMeshCount !== 1729) {
    throw new Error(`Apartment Adapter expected 1729 procedural meshes; found ${totalMeshCount}`);
  }
  const whiteLine = apartment.whiteLine;
  if (whiteLine?.group?.name !== 'apartment-counter-powder'
    || whiteLine?.line?.name !== 'apartment-counter-line'
    || whiteLine?.card?.name !== 'apartment-counter-line-card'
    || whiteLine?.target?.name !== 'apartment-counter-line-target'
    || whiteLine.consumed !== false) {
    throw new Error('Apartment Adapter is missing the intact countertop white-line producer');
  }
  if (apartment.colliders.length !== 29 || dressingProducerCount !== 29 || margoProducerCount !== 1) {
    throw new Error(
      `Apartment Adapter producer drift: colliders=${apartment.colliders.length}, `
      + `dressing=${dressingProducerCount}, margo=${margoProducerCount}`,
    );
  }
  return result(
    descriptor,
    [{ label: 'apartment', root: apartment.root }],
    apartment.colliders,
    {
      apartmentPreview: {
        spawn,
        chapter: campaignState.story.chapter,
        persistentDressing: [...persistentDressing].sort(),
        cashPiles,
      },
      previewGeometry,
      producerCounts: {
        proceduralMeshes: totalMeshCount,
        colliders: apartment.colliders.length,
        dressing: dressingProducerCount,
        margo: margoProducerCount,
        whiteLine: 1,
      },
    },
  );
}

async function buildCabin(descriptor, THREE, collaborators) {
  const { buildCountrysideCabin } = await import('../src/cabin/world.js');
  const scene = new THREE.Scene();
  const cabin = await buildCountrysideCabin({
    scene,
    ...collaborators,
    externalLighting: true,
  });
  await cabin.models;
  const lagAssemblyId = 'cabin-resident:lag';
  setGeometryGateMetadata(cabin.lag?.group, { assemblyId: lagAssemblyId });
  cabin.lag?.group?.traverse((object) => {
    if (object.isGroup && object.name === 'forearm') {
      setGeometryGateMetadata(object, { fixedSupportAnchor: true });
    }
  });
  const lagCollider = cabin.colliders.find((entry) => entry?.name === 'cabin-lag-body');
  if (!lagCollider) throw new Error('Cabin geometry Adapter expected Lag body collider');
  setGeometryGateMetadata(lagCollider, { assemblyId: lagAssemblyId });
  return result(
    descriptor,
    [{ label: 'countryside-cabin-property', root: cabin.root }],
    cabin.colliders,
    {
      landmarkCount: Object.keys(cabin.interactionTargets ?? {})
        .filter((id) => ['creek', 'overlook', 'shed', 'firepit'].includes(id)).length,
      utilityCount: Object.keys(cabin.utilityTargets ?? {}).length,
      artCount: cabin.frames?.length ?? 0,
      landscape: cabin.landscape?.counts ?? {},
    },
  );
}

async function buildLuxuryApartment(descriptor, THREE, collaborators) {
  const { buildLuxuryApartment: build } = await import('../src/luxury-apartment/world.js');
  const scene = new THREE.Scene();
  const apartment = await build({
    scene,
    ...collaborators,
  });
  return result(
    descriptor,
    [{ label: 'luxury-apartment-property', root: apartment.root }],
    apartment.colliders,
    { metrics: apartment.metrics },
  );
}

function annotateBingNpcGeometry(scene, assemblyPrefix) {
  const candidates = [];
  scene.traverse((object) => {
    if (object?.userData?.npc) candidates.push(object);
  });
  if (candidates.length === 0) {
    throw new Error('Bing scene produced no NPC geometry identities');
  }

  const stableIds = new Set();
  const nameTotals = new Map();
  for (const object of candidates) {
    const npc = object.userData.npc;
    const stableId = String(npc.characterId ?? '').trim();
    const name = String(npc.name ?? '').trim();
    if (!stableId && !name) throw new Error('Bing NPC is missing a stable geometry identity');
    if (stableId) {
      if (stableIds.has(stableId)) {
        throw new Error(`Bing stable character identity is duplicated: ${stableId}`);
      }
      stableIds.add(stableId);
    } else {
      nameTotals.set(name, (nameTotals.get(name) ?? 0) + 1);
    }
  }

  const nameIndexes = new Map();
  for (const object of candidates) {
    const npc = object.userData.npc;
    const stableId = String(npc.characterId ?? '').trim();
    const name = String(npc.name ?? '').trim();
    const index = nameIndexes.get(name) ?? 0;
    nameIndexes.set(name, index + 1);
    const identity = stableId || (nameTotals.get(name) === 1 ? name : `${name}:${index}`);
    object.userData.geometryGate = {
      ...(object.userData.geometryGate ?? {}),
      assemblyId: `${assemblyPrefix}-npc:${identity}`,
    };
  }
}

const BING_COMPOUND_NAMES = new Set(['blackjack-table', 'slot-machine', 'toilet']);

function setGeometryAssembly(target, assemblyId) {
  if (!target) throw new Error(`Missing geometry target for ${assemblyId}`);
  target.userData ??= {};
  target.userData.geometryGate = {
    ...(target.userData.geometryGate ?? {}),
    assemblyId,
  };
}

function annotateBingCompoundGeometry(scene) {
  const ordinals = new Map();
  scene.traverse((object) => {
    if (!object?.isGroup || !BING_COMPOUND_NAMES.has(object.name)) return;
    const ordinal = ordinals.get(object.name) ?? 0;
    ordinals.set(object.name, ordinal + 1);
    setGeometryAssembly(object, `bing-compound:${object.name}:${ordinal}`);
  });
}

function annotateBingVehicleGeometry(vehicle, assemblyId) {
  if (!vehicle?.group?.isGroup || !vehicle.worldCollider) {
    throw new Error(`Bing vehicle ${assemblyId} is missing geometry or collider`);
  }
  setGeometryAssembly(vehicle.group, assemblyId);
  setGeometryAssembly(vehicle.worldCollider, assemblyId);
}

function bindBingPartyPerformanceProps(partyGeometry) {
  const hogMama = partyGeometry.byId.hogmama;
  const microphone = partyGeometry.stage?.mic;
  if (!hogMama?.group || !microphone?.isGroup) return 0;
  const actorPosition = hogMama.group.getWorldPosition(hogMama.group.position.clone());
  const fixturePosition = microphone.getWorldPosition(microphone.position.clone());
  if (Math.hypot(
    actorPosition.x - fixturePosition.x,
    actorPosition.z - fixturePosition.z,
  ) > 0.35) return 0;
  const assemblyId = 'bing-party-performance:hogmama-microphone';
  setGeometryAssembly(hogMama.group, assemblyId);
  setGeometryAssembly(microphone, assemblyId);
  return 1;
}

function bindBingPartyColliderOwners(partyGeometry) {
  const actorByCollider = new Map(
    partyGeometry.all.map((npc) => [npc.partyCollider, npc]),
  );
  for (const entry of partyGeometry.collision.all) {
    const actor = actorByCollider.get(entry);
    const assemblyId = actor
      ? actor.group.userData?.geometryGate?.assemblyId
      : entry.target.userData?.geometryGate?.assemblyId
        ?? `bing-party-prop:${entry.id}`;
    if (!assemblyId || !entry?.target?.isObject3D || !entry.box?.userData) {
      throw new Error(`Bing party collider ${entry?.id ?? 'unknown'} cannot be bound`);
    }
    setGeometryAssembly(entry.target, assemblyId);
    setGeometryAssembly(entry.box, assemblyId);
  }
  return partyGeometry.collision.all.length;
}

const BING_SEAT_FIXTURE_NAMES = new Set(['chair', 'lou-chair', 'booth', 'stool']);
const BING_DINING_FIXTURE_NAMES = new Set(['twotop', 'blackjack-table']);

function isVisibleInHierarchy(object, root) {
  for (let current = object; current; current = current.parent) {
    if (current.visible === false) return false;
    if (current === root) return true;
  }
  return false;
}

function bindBingSeatedFixtures(scene, THREE) {
  scene.updateMatrixWorld(true);
  const nameOrdinals = new Map();
  const diningNameOrdinals = new Map();
  const fixtures = [];
  const diningTables = [];
  const actors = [];
  scene.traverse((object) => {
    if (object?.isGroup && BING_SEAT_FIXTURE_NAMES.has(object.name)) {
      const ordinal = nameOrdinals.get(object.name) ?? 0;
      nameOrdinals.set(object.name, ordinal + 1);
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) throw new Error(`Bing seat fixture ${object.name}:${ordinal} is empty`);
      fixtures.push({
        object,
        id: object.userData?.geometryGate?.assemblyId
          ?? `bing-seat-fixture:${object.name}:${ordinal}`,
        bounds,
        center: bounds.getCenter(new THREE.Vector3()),
      });
    }
    if (object?.isGroup && BING_DINING_FIXTURE_NAMES.has(object.name)) {
      const ordinal = diningNameOrdinals.get(object.name) ?? 0;
      diningNameOrdinals.set(object.name, ordinal + 1);
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) throw new Error(`Bing dining fixture ${object.name}:${ordinal} is empty`);
      diningTables.push({
        object,
        id: `bing-dining-fixture:${object.name}:${ordinal}`,
        name: object.name,
        center: bounds.getCenter(new THREE.Vector3()),
      });
    }
    if (
      object?.userData?.npc
      && object.position.y < -0.04
      && isVisibleInHierarchy(object, scene)
    ) {
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) throw new Error('Bing seated NPC has empty geometry');
      actors.push({ object, bounds, center: bounds.getCenter(new THREE.Vector3()) });
    }
  });
  if (fixtures.length === 0) throw new Error('Bing scene produced no seat fixtures');

  const occupied = new Map();
  for (const actor of actors) {
    const ranked = fixtures
      .map((fixture) => {
        const dx = Math.max(
          fixture.bounds.min.x - actor.bounds.max.x,
          0,
          actor.bounds.min.x - fixture.bounds.max.x,
        );
        const dz = Math.max(
          fixture.bounds.min.z - actor.bounds.max.z,
          0,
          actor.bounds.min.z - fixture.bounds.max.z,
        );
        return {
          fixture,
          distance: Math.hypot(dx, dz),
          centerDistance: Math.hypot(
            actor.center.x - fixture.center.x,
            actor.center.z - fixture.center.z,
          ),
        };
      })
      .sort((left, right) => (
        left.distance - right.distance
        || left.centerDistance - right.centerDistance
        || left.fixture.id.localeCompare(right.fixture.id)
      ));
    const nearest = ranked[0];
    const identity = actor.object.userData.npc.characterId ?? actor.object.userData.npc.name;
    if (!nearest || nearest.distance > 0.04 || nearest.centerDistance > 1.4) {
      throw new Error(
        `Bing seated NPC "${identity}" has no contacting authored fixture`,
      );
    }
    const occupants = occupied.get(nearest.fixture.id) ?? [];
    occupants.push(actor.object);
    occupied.set(nearest.fixture.id, occupants);
  }

  for (const fixture of fixtures) {
    const occupants = occupied.get(fixture.id);
    if (!occupants) continue;
    fixture.object.userData ??= {};
    fixture.object.userData.geometryGate = {
      ...(fixture.object.userData.geometryGate ?? {}),
      assemblyId: fixture.id,
    };
    for (const actor of occupants) {
      actor.userData.geometryGate = {
        ...(actor.userData.geometryGate ?? {}),
        assemblyId: fixture.id,
      };
    }
  }
  const diningSeats = new Map();
  for (const fixture of fixtures) {
    if (fixture.object.name !== 'chair') continue;
    const ranked = diningTables
      .map((table) => ({
        table,
        distance: Math.hypot(
          fixture.center.x - table.center.x,
          fixture.center.z - table.center.z,
        ),
      }))
      .sort((left, right) => left.distance - right.distance || left.table.id.localeCompare(right.table.id));
    const nearest = ranked[0];
    const limit = nearest?.table.name === 'blackjack-table' ? 2.05 : 1.2;
    if (!nearest || nearest.distance > limit) continue;
    const list = diningSeats.get(nearest.table.id) ?? [];
    list.push(fixture);
    diningSeats.set(nearest.table.id, list);
  }

  for (const table of diningTables) {
    const seats = diningSeats.get(table.id);
    if (!seats) continue;
    setGeometryAssembly(table.object, table.id);
    for (const seat of seats) {
      setGeometryAssembly(seat.object, table.id);
      for (const actor of occupied.get(seat.id) ?? []) setGeometryAssembly(actor, table.id);
    }
  }

  return {
    actorCount: actors.length,
    fixtureCount: occupied.size,
    diningFixtureCount: diningSeats.size,
  };
}

function bindBingPerformanceFixtures(scene, THREE) {
  scene.updateMatrixWorld(true);
  const poles = [];
  const performers = [];
  scene.traverse((object) => {
    if (object?.isGroup && object.name === 'stage-pole') {
      const assemblyId = object.userData?.geometryGate?.assemblyId;
      if (!assemblyId) throw new Error('Bing stage pole is missing its exact assembly');
      const bounds = new THREE.Box3().setFromObject(object);
      poles.push({ object, assemblyId, center: bounds.getCenter(new THREE.Vector3()) });
    }
    if (object?.userData?.npc?.name === 'a dancer' && isVisibleInHierarchy(object, scene)) {
      performers.push({ object, center: object.getWorldPosition(new THREE.Vector3()) });
    }
  });
  if (poles.length !== 3) throw new Error(`Bing scene produced ${poles.length} stage poles; expected 3`);

  const occupied = new Set();
  for (const performer of performers) {
    const ranked = poles
      .map((pole) => ({
        pole,
        distance: Math.hypot(
          performer.center.x - pole.center.x,
          performer.center.z - pole.center.z,
        ),
      }))
      .sort((left, right) => left.distance - right.distance || left.pole.assemblyId.localeCompare(right.pole.assemblyId));
    const nearest = ranked[0];
    if (!nearest || nearest.distance > 0.2 || occupied.has(nearest.pole.assemblyId)) continue;
    setGeometryAssembly(performer.object, nearest.pole.assemblyId);
    occupied.add(nearest.pole.assemblyId);
  }
  return occupied.size;
}

async function buildBing(descriptor, THREE, party = false) {
  const { buildClub } = await import('../src/bing/club.js');
  const scene = new THREE.Scene();
  const club = buildClub(scene, { renderer: null });
  let metadata;
  if (party) {
    const [{ buildHotDogParty }, { stageHotDogCheckpointGeometry }] = await Promise.all([
      import('../src/bing/hotdog-party.js'),
      import('../src/bing/preview.js'),
    ]);
    const partyGeometry = await buildHotDogParty(scene, club);
    stageHotDogCheckpointGeometry(descriptor.checkpoint, partyGeometry);
    annotateBingCompoundGeometry(scene);
    annotateBingNpcGeometry(scene, 'bing-party');
    const seating = bindBingSeatedFixtures(scene, THREE);
    const polePerformerCount = bindBingPerformanceFixtures(scene, THREE);
    const partyPerformancePropCount = bindBingPartyPerformanceProps(partyGeometry);
    const ownedPartyColliderCount = bindBingPartyColliderOwners(partyGeometry);
    metadata = {
      checkpoint: descriptor.checkpoint,
      npcCount: partyGeometry.all.length,
      partyColliderCount: partyGeometry.collision.all.length,
      ownedPartyColliderCount,
      seatedActorCount: seating.actorCount,
      occupiedFixtureCount: seating.fixtureCount,
      occupiedDiningFixtureCount: seating.diningFixtureCount,
      polePerformerCount,
      partyPerformancePropCount,
    };
  } else {
    const [
      { populate, makeAssociate },
      { familyPresent, populateFamily },
      { makeSlotMachine },
      { Blackjack },
      { makePlayerCar, populateLot },
    ] = await Promise.all([
      import('../src/bing/cast.js'),
      import('../src/bing/family.js'),
      import('../src/bing/slots.js'),
      import('../src/bing/blackjack.js'),
      import('../src/bing/vehicles.js'),
    ]);
    const cast = populate(scene, club, { includeMargo: true });
    if (descriptor.geometryStage === 'performer-bathroom') {
      const { stageBingBathroomPerformer } = await import('../src/bing/performer-bathroom.js');
      const performer = cast.byName.performer3;
      if (!performer) throw new Error('Bing performer-bathroom Adapter found no runway performer');
      stageBingBathroomPerformer(performer);
    }
    const associate = makeAssociate(scene, club.anchors.hallMouth, club.colliders, club.navBlockers);
    const family = populateFamily(scene, club, {
      present: familyPresent({
        missions: {
          airstrip_smuggling: { status: 'locked' },
          no_wake: { status: 'locked' },
        },
      }),
      faces: new Set(),
    });
    const slotParts = makeSlotMachine({ x: club.slot.x, z: club.slot.z, rotY: Math.PI });
    scene.add(slotParts.group);
    const blackjack = new Blackjack(
      scene,
      { x: club.bj.x, z: club.bj.z },
      club.anchors.blackjackSeats[2],
      { getMoney: () => 300 },
    );
    const car = makePlayerCar(scene, {
      x: club.anchors.playerCar.x,
      z: club.anchors.playerCar.z,
      yaw: Math.PI / 2,
    });
    club.colliders.push(car.worldCollider);
    const lot = populateLot(scene, club.colliders, club.anchors);
    annotateBingCompoundGeometry(scene);
    annotateBingVehicleGeometry(car, 'bing-vehicle:player');
    for (const [index, vehicle] of lot.cars.entries()) {
      annotateBingVehicleGeometry(vehicle, `bing-vehicle:lot:${index}`);
    }
    annotateBingVehicleGeometry(lot.lou, 'bing-vehicle:lou');
    annotateBingVehicleGeometry(lot.watchers, 'bing-vehicle:watchers');
    annotateBingNpcGeometry(scene, 'bing-visit-one');
    const seating = bindBingSeatedFixtures(scene, THREE);
    const polePerformerCount = bindBingPerformanceFixtures(scene, THREE);
    metadata = {
      checkpoint: null,
      geometryStage: descriptor.geometryStage ?? 'startup',
      seatedActorCount: seating.actorCount,
      occupiedFixtureCount: seating.fixtureCount,
      occupiedDiningFixtureCount: seating.diningFixtureCount,
      polePerformerCount,
      castCount: cast.all.length,
      familyCount: family.all.length,
      associateId: associate.group.userData.npc.characterId ?? associate.name,
      slotMounted: slotParts.group.parent === scene,
      blackjackMounted: blackjack.root.parent === scene,
      playerCarMounted: car.group.parent === scene,
      lotVehicleCount: lot.cars.length,
    };
  }
  return result(
    descriptor,
    [{
      label: party
        ? `bing-two-${descriptor.checkpoint}`
        : descriptor.geometryStage === 'performer-bathroom'
          ? 'bing-one-performer-bathroom'
          : 'bing-one',
      root: scene,
    }],
    club.colliders,
    metadata,
  );
}

async function buildMansionBase(descriptor, THREE) {
  const [{ buildMansionGrounds }, { buildMansionInterior }] = await Promise.all([
    import('../src/mansion/scenes/MansionGrounds.js'),
    import('../src/mansion/scenes/MansionInterior.js'),
  ]);
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(scene);
  const interior = buildMansionInterior(grounds.shell);
  scene.add(grounds.root, interior.root);
  return { scene, grounds, interior, colliders: [...grounds.colliders, ...interior.colliders] };
}
async function mountMansionGeometryArmory(base, descriptor, THREE) {
  const { mountArmory } = await import('../src/core/weapons/Armory.js');
  const racks = base.interior.props?.basement?.armoryRacks;
  if (!Array.isArray(racks) || racks.length === 0) {
    throw new Error(`Mansion geometry Adapter found no armory racks in ${descriptor.id}`);
  }

  const interaction = noopProxy({ register: noop, unregister: noop });
  const firearmState = new Map();
  const system = {
    equipped: null,
    firearm(id) {
      if (!firearmState.has(id)) {
        firearmState.set(id, {
          rounds: 0,
          capacity: 0,
          reserve: 0,
          snapshot: () => ({ rounds: 0, capacity: 0, reserve: 0 }),
        });
      }
      return firearmState.get(id);
    },
    equip(id) { this.equipped = id; return true; },
    stow() { this.equipped = null; return true; },
  };
  const addedColliders = [];
  const armory = mountArmory({
    parent: base.scene,
    system,
    interaction,
    racks,
    enabled: () => true,
    retainTaken: true,
    addCollider: (x0, x1, y0, y1, z0, z1) => {
      addedColliders.push(new THREE.Box3(
        new THREE.Vector3(Math.min(x0, x1), y0, Math.min(z0, z1)),
        new THREE.Vector3(Math.max(x0, x1), y1, Math.max(z0, z1)),
      ));
    },
  });
  if (!armory?.root?.traverse || !(armory.stands instanceof Map)) {
    throw new Error(`Mansion geometry Adapter failed to mount the armory in ${descriptor.id}`);
  }
  if (armory.stands.size !== racks.length || addedColliders.length !== armory.stands.size) {
    throw new Error(
      `Mansion geometry Adapter armory mismatch in ${descriptor.id}: `
      + `${racks.length} rack specs, ${armory.stands.size} stands, `
      + `${addedColliders.length} colliders`,
    );
  }

  armory.root.name = 'mansion-armory';
  const rackIds = [];
  [...armory.stands.entries()].forEach(([id, stand], index) => {
    const assemblyId = `mansion-armory-rack:${id}`;
    if (!id || !stand?.built?.root?.traverse) {
      throw new Error(`Mansion geometry Adapter has an invalid armory stand at index ${index}`);
    }
    stand.built.root.name = `mansion-armory-rack-${id}`;
    setGeometryGateMetadata(stand.built.root, { assemblyId });
    const collider = addedColliders[index];
    collider.name = `mansion-armory-rack-${id}-collider`;
    setGeometryGateMetadata(collider, { assemblyId });
    rackIds.push(id);
  });
  base.colliders.push(...addedColliders);
  return {
    armory,
    evidence: {
      rackIds,
      rackCount: armory.stands.size,
      colliderCount: addedColliders.length,
    },
  };
}
async function mountMansionSilentEnvironment(base, descriptor, THREE) {
  const { buildSilentSquatch: build } = await import('../src/mansion/scenes/SilentSquatch.js');
  const interaction = noopProxy({ register: noop, unregister: noop });
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 220);
  camera.name = 'mansion-geometry-camera';
  camera.position.set(0, 1.7, 0);
  base.scene.add(camera);

  const silent = build({
    audio: null,
    interaction,
    camera,
    enabled: () => true,
    registerLight: noop,
  });
  if (!silent?.root?.traverse || !silent?.lab || !Array.isArray(silent.colliders)) {
    throw new Error(`Mansion geometry Adapter failed to build Silent Squatch in ${descriptor.id}`);
  }
  silent.root.name ||= 'silent-squatch-environment';
  base.scene.add(silent.root);
  base.colliders.push(...silent.colliders);
  base.interior.props?.masterSuite?.secretStair?.bindColliders?.(base.colliders);
  return {
    silent,
    camera,
    interaction,
    evidence: {
      rootName: silent.root.name,
      colliderCount: silent.colliders.length,
      hasLab: Boolean(silent.lab),
    },
  };
}

async function mountMansionGeometryMission(
  base,
  descriptor,
  THREE,
  environment,
  onSnowSummoned,
) {
  if (descriptor.state === 'return') return null;
  const [{ mountSilentSquatch }, { INSTRUCTIONS }] = await Promise.all([
    import('../src/mansion/mission/mount.js'),
    import('../src/mansion/script.js'),
  ]);
  const player = {
    position: new THREE.Vector3(0, 1.7, 0),
    eyeHeight: 1.7,
  };
  const lab = environment.silent.lab;
  const mounted = mountSilentSquatch({
    THREE,
    scene: base.scene,
    camera: environment.camera,
    interaction: environment.interaction,
    player,
    audio: null,
    lab,
    anchors: { ...base.grounds.anchors, ...base.interior.anchors },
    targets: {
      desk: lab.targets?.desk ?? base.interior.props?.office?.desk ?? null,
      bust: lab.targets?.bust ?? lab.targets?.bustSwitch ?? null,
      transferTable: lab.targets?.drawer ?? null,
      deskSpot: base.interior.props?.office?.caseSpot ?? null,
      tableSpot: lab.targets?.tableSpot ?? null,
      keypad: lab.targets?.keypad ?? null,
      silentNight: lab.targets?.silentNight ?? null,
    },
    enabled: () => true,
    autoStart: false,
    missionHud: noopProxy({ text: () => '' }),
    onSnowSummoned,
  });
  if (!mounted?.mission || !mounted?.debug || typeof mounted.update !== 'function') {
    throw new Error(`Mansion geometry Adapter failed to mount Silent Squatch mission in ${descriptor.id}`);
  }
  return { mounted, player, INSTRUCTIONS };
}

function stageMansionGeometryState(base, descriptor, environment, missionMount) {
  const secretStair = base.interior.props?.masterSuite?.secretStair;
  if (!missionMount) {
    return {
      mounted: false,
      checkpoint: null,
      beat: null,
      missionState: null,
    };
  }

  const { mounted, INSTRUCTIONS } = missionMount;
  const debug = mounted.debug;
  const DT = 1 / 30;
  const tick = () => {
    environment.silent.update(DT);
    mounted.update(DT);
    base.interior.update?.(DT);
  };
  const pump = (predicate, label, limit = 400) => {
    for (let elapsed = 0; elapsed < limit; elapsed += DT) {
      if (predicate()) return;
      tick();
    }
    if (!predicate()) {
      throw new Error(
        `Mansion geometry Adapter could not reach ${label} for ${descriptor.id}; `
        + `beat=${debug.beat}, state=${debug.state}, instruction=${debug.instruction}`,
      );
    }
  };

  mounted.mission.start();
  const toOffice = () => {
    debug.arrive('office');
    tick();
  };
  const toBasement = () => {
    toOffice();
    pump(() => debug.instruction === INSTRUCTIONS.PLACE_CASE, 'PLACE_CASE');
    debug.placeCase();
    pump(() => debug.instruction === INSTRUCTIONS.TAKE_CASE, 'TAKE_CASE');
    debug.takeCase();
    tick();
    debug.arrive('bust');
    pump(() => debug.instruction === INSTRUCTIONS.BUST_SWITCH, 'BUST_SWITCH');
  };
  const toLab = () => {
    toBasement();
    debug.bustSwitch();
    pump(() => debug.state === 'STAIRWELL', 'STAIRWELL', 200);
    debug.arrive('corridor');
    debug.arrive('xxx');
    debug.arrive('observation');
    tick();
    pump(() => debug.instruction === INSTRUCTIONS.DELIVER_CASE, 'DELIVER_CASE', 200);
  };
  const toCoreComplete = () => {
    toLab();
    debug.deliver();
    pump(() => debug.instruction === INSTRUCTIONS.KEYPAD, 'KEYPAD', 400);
  };
  const toLocked = () => {
    toCoreComplete();
    debug.enterCode('6969');
    pump(() => debug.instruction === INSTRUCTIONS.ELIMINATE_AUBBIE, 'ELIMINATE_AUBBIE', 100);
  };
  const toAubbieDown = () => {
    toLocked();
    base.scene.updateMatrixWorld(true);
    debug.shootPreview();
    pump(() => debug.instruction === INSTRUCTIONS.SILENT_NIGHT, 'SILENT_NIGHT', 200);
  };
  const toSilentNight = () => {
    toAubbieDown();
    debug.silentNight();
    pump(() => debug.instruction === INSTRUCTIONS.RETURN_UPSTAIRS, 'RETURN_UPSTAIRS', 400);
  };

  const checkpoint = descriptor.checkpoint ?? null;
  if (checkpoint === 'office') toOffice();
  else if (checkpoint === 'basement') toBasement();
  else if (checkpoint === 'lab') toLab();
  else if (checkpoint === 'core_complete') toCoreComplete();
  else if (checkpoint === 'locked') toLocked();
  else if (checkpoint === 'aubbie_down') toAubbieDown();
  else if (checkpoint === 'silent_night') toSilentNight();
  else if (checkpoint === 'clear') {
    toSilentNight();
    pump(() => debug.state === 'EXIT', 'EXIT', 60);
  } else if (checkpoint === 'suite') {
    if (!secretStair?.setOpen) {
      throw new Error(`Mansion geometry Adapter cannot stage suite bookcase in ${descriptor.id}`);
    }
    secretStair.setOpen(true);
  } else if (checkpoint !== null && checkpoint !== 'arrival') {
    throw new Error(`Mansion geometry Adapter does not know checkpoint ${checkpoint}`);
  }

  if (descriptor.open) {
    environment.silent.lab.hiddenWall.open();
    environment.silent.lab.unlockDoor();
    environment.silent.lab.openDoor();
    for (let index = 0; index < 120; index += 1) tick();
  }
  base.scene.updateMatrixWorld(true);
  return {
    mounted: true,
    checkpoint,
    beat: debug.beat,
    missionState: debug.state,
  };
}

async function mountMansionGeometryCast(base, descriptor, { lab = null } = {}) {
  const { mountMansionCast } = await import('../src/mansion/cast.js');
  const existingRoots = new Set(base.scene.children);
  const anchors = { ...base.grounds.anchors, ...base.interior.anchors };
  const world = {
    colliders: base.colliders,
    floorZones: [],
    groundAt: () => 0,
    snapGroundToSurface: true,
  };
  const visit = descriptor.state === 'return' ? 'return' : 'mission';
  const cast = mountMansionCast(base.scene, world, {
    anchors,
    lab,
    suite: base.interior.props.masterSuite,
    pool: base.grounds.props.poolPatio,
    theatre: base.interior.props.theatre,
    hud: noopProxy(),
    visit,
    enabled: () => true,
  });
  if (!cast || !cast.people || typeof cast.people !== 'object') {
    throw new Error(`Mansion geometry Adapter failed to mount cast for ${descriptor.id}`);
  }
  for (const id of ['snow', 'lou']) {
    if (!cast.people[id]?.group?.traverse) {
      throw new Error(`Mansion geometry Adapter is missing cast member ${id} in ${descriptor.id}`);
    }
  }

  cast.update?.(0);
  const fixtureOwner = (object, label, expected) => {
    if (!object?.traverse) {
      throw new Error(`Mansion geometry Adapter is missing ${label} in ${descriptor.id}`);
    }
    const owner = object.userData?.geometryGate?.assemblyId;
    if (owner !== expected) {
      throw new Error(
        `Mansion geometry Adapter expected ${label} owner ${expected} in ${descriptor.id}; got ${owner ?? '<none>'}`,
      );
    }
    return owner;
  };
  const fixtureBindings = new Map([
    ['eric', fixtureOwner(
      base.interior.props?.dining?.chairs?.east?.[2],
      'Eric dining chair',
      'mansion-dining-chair-east-2',
    )],
    ['sasole', fixtureOwner(
      base.interior.props?.lounge?.barStools?.[0],
      'Captain Lou Sasole bar stool',
      'mansion-lounge-bar-stool-0',
    )],
    ['hogmama', fixtureOwner(
      base.interior.props?.kitchen?.islandStools?.[1],
      'Hog Mama kitchen stool',
      'mansion-kitchen-island-stool-1',
    )],
    ['poolPerformer0', fixtureOwner(
      base.grounds.props?.poolPatio?.chairs?.[4],
      'first pool performer lounger',
      'mansion-pool-lounger-4',
    )],
    ['poolPerformer1', fixtureOwner(
      base.grounds.props?.poolPatio?.chairs?.[6],
      'second pool performer lounger',
      'mansion-pool-lounger-6',
    )],
    ['poolPerformer3', fixtureOwner(
      base.grounds.props?.poolPatio?.chairs?.[1],
      'third pool performer lounger',
      'mansion-pool-lounger-1',
    )],
    ['poolPerformer4', fixtureOwner(
      base.grounds.props?.poolPatio?.chairs?.[3],
      'fourth pool performer lounger',
      'mansion-pool-lounger-3',
    )],
  ]);
  const hotTubOwner = base.interior.props?.masterSuite?.tub?.assemblyId;
  if (hotTubOwner !== 'mansion-suite-hot-tub') {
    throw new Error(`Mansion geometry Adapter is missing the suite hot-tub owner in ${descriptor.id}`);
  }
  fixtureBindings.set('suitePerformer0', hotTubOwner);
  fixtureBindings.set('suitePerformer1', hotTubOwner);
  const dogCushionOwner = fixtureOwner(
    base.scene.getObjectByName('suite-dog-cushion'),
    'Lil Tom Cruze dog cushion',
    'mansion-suite-dog-cushion',
  );

  for (const [id, npc] of Object.entries(cast.people)) {
    if (npc.inFixture !== 'theatre recliner') continue;
    const seatIndex = npc.theatreSeat;
    if (!Number.isInteger(seatIndex)) {
      throw new Error(`Mansion geometry Adapter has no theatre seat index for ${id} in ${descriptor.id}`);
    }
    fixtureBindings.set(id, fixtureOwner(
      base.interior.props?.theatre?.seats?.[seatIndex],
      `${id} theatre recliner`,
      `mansion-theatre-recliner-${seatIndex}`,
    ));
  }
  const roster = Object.entries(cast.people);
  if (roster.length === 0) throw new Error(`Mansion geometry Adapter produced an empty cast for ${descriptor.id}`);
  const expectedRoots = new Set();
  for (const [id, npc] of roster) {
    if (!id || !npc?.group?.traverse || npc.group.parent !== base.scene) {
      throw new Error(`Mansion geometry Adapter has an invalid cast root ${id || '<unnamed>'} in ${descriptor.id}`);
    }
    npc.group.name = `mansion-cast-${id}`;
    const usesFixtureSupport = fixtureBindings.has(id) || npc.inFixture === 'the pool';
    setGeometryGateMetadata(npc.group, {
      assemblyId: fixtureBindings.get(id) ?? `mansion-cast:${id}`,
      ...(usesFixtureSupport ? { checkSupport: false } : {}),
    });
    if (usesFixtureSupport) {
      npc.group.traverse((object) => {
        if (object.isMesh) setGeometryGateMetadata(object, { checkSupport: false });
      });
    }
    expectedRoots.add(npc.group);
  }
  if (!cast.cart?.traverse || cast.cart.parent !== base.scene) {
    throw new Error(`Mansion geometry Adapter is missing Snow's cart root in ${descriptor.id}`);
  }
  cast.cart.name = 'mansion-snow-cart';
  setGeometryGateMetadata(cast.cart, { assemblyId: 'mansion-cast:snow-cart' });
  expectedRoots.add(cast.cart);
  if (!cast.dog?.group?.traverse || cast.dog.group.parent !== base.scene) {
    throw new Error(`Mansion geometry Adapter is missing Lil Tom Cruze in ${descriptor.id}`);
  }
  setGeometryGateMetadata(cast.dog.group, { assemblyId: dogCushionOwner });
  expectedRoots.add(cast.dog.group);

  const addedRoots = base.scene.children.filter((root) => !existingRoots.has(root));
  if (addedRoots.length !== expectedRoots.size || addedRoots.some((root) => !expectedRoots.has(root))) {
    const unclassified = addedRoots.filter((root) => !expectedRoots.has(root))
      .map((root) => root.name || root.userData?.npc?.name || root.type || '<unnamed>');
    throw new Error(`Mansion geometry Adapter found unclassified cast-owned roots in ${descriptor.id}: ${unclassified.join(', ')}`);
  }
  if (!Array.isArray(cast.colliders) || cast.colliders.length !== 1) {
    throw new Error(`Mansion geometry Adapter expected Snow's one cart collider in ${descriptor.id}`);
  }
  const [cartCollider] = cast.colliders;
  if (!cartCollider?.min || !cartCollider?.max) {
    throw new Error(`Mansion geometry Adapter received an invalid Snow cart collider in ${descriptor.id}`);
  }
  cartCollider.name = 'mansion-snow-cart-collider';
  setGeometryGateMetadata(cartCollider, { assemblyId: 'mansion-cast:snow-cart' });
  base.colliders.push(cartCollider);

  return {
    cast,
    evidence: {
      visit,
      roster: roster.map(([id]) => id).toSorted(),
      rootCount: addedRoots.length,
      colliderCount: cast.colliders.length,
      saucePresent: Boolean(cast.people.sauce),
      fixtureBindings: Object.fromEntries(
        [...fixtureBindings.entries()].sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
  };
}

async function buildMansionRuntime(descriptor, THREE, label) {
  const base = await buildMansionBase(descriptor, THREE);
  const environment = await mountMansionSilentEnvironment(base, descriptor, THREE);
  const armoryMount = await mountMansionGeometryArmory(base, descriptor, THREE);
  let liveCast = null;
  const missionMount = await mountMansionGeometryMission(
    base,
    descriptor,
    THREE,
    environment,
    () => liveCast?.snowToTheBasement?.() === true,
  );
  const castMount = await mountMansionGeometryCast(base, descriptor, {
    lab: environment.silent.lab,
  });
  liveCast = castMount.cast;
  const mission = stageMansionGeometryState(base, descriptor, environment, missionMount);
  return result(descriptor, [{ label, root: base.scene }], base.colliders, {
    mansionCast: castMount.evidence,
    silent: environment.evidence,
    armory: armoryMount.evidence,
    mission,
  });
}

async function buildMansion(descriptor, THREE) {
  return buildMansionRuntime(descriptor, THREE, 'mansion');
}

async function buildSilentSquatch(descriptor, THREE) {
  return buildMansionRuntime(descriptor, THREE, 'mansion-silent');
}

const GOLF_TREE_POSITION_TOLERANCE_M = 0.0001;

function golfTreeAdapterError(message) {
  throw new Error(`Golf geometry Adapter tree annotation failed: ${message}`);
}

function approximately(value, expected) {
  return Number.isFinite(value) && Math.abs(value - expected) <= 1e-9;
}

function setGeometryGateMetadata(object, values) {
  object.userData ??= {};
  const existing = object.userData.geometryGate;
  object.userData.geometryGate = {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...values,
  };
}


function matchingSceneObjects(root, predicate, label, minimum = 1) {
  const matches = [];
  root.traverse((object) => {
    if (predicate(object)) matches.push(object);
  });
  if (matches.length < minimum) {
    throw new Error(`Geometry Adapter expected ${label}; found ${matches.length}`);
  }
  return matches;
}

function namedSceneObjects(root, name, minimum = 1) {
  return matchingSceneObjects(root, (object) => object?.name === name, `name ${name}`, minimum);
}

function annotateNamedSceneObjects(root, name, values, minimum = 1) {
  const matches = namedSceneObjects(root, name, minimum);
  for (const object of matches) {
    setGeometryGateMetadata(object, typeof values === 'function' ? values(object) : values);
  }
  return matches;
}

function golfTreeParts(course) {
  const candidates = {
    pine: { trunks: [], crowns: [] },
    oak: { trunks: [], crowns: [] },
  };
  course.holeGroup.traverse((object) => {
    if (!object?.isInstancedMesh) return;
    const { type, parameters = {} } = object.geometry ?? {};
    if (
      type === 'CylinderGeometry'
      && approximately(parameters.height, 6.5)
      && approximately(parameters.radiusTop, 0.16)
      && approximately(parameters.radiusBottom, 0.30)
    ) {
      candidates.pine.trunks.push(object);
    } else if (
      type === 'CylinderGeometry'
      && approximately(parameters.height, 4.2)
      && approximately(parameters.radiusTop, 0.28)
      && approximately(parameters.radiusBottom, 0.46)
    ) {
      candidates.oak.trunks.push(object);
    } else if (
      type === 'ConeGeometry'
      && approximately(parameters.height, 3.4)
      && [2.5, 1.88, 1.26].some((radius) => approximately(parameters.radius, radius))
    ) {
      candidates.pine.crowns.push(object);
    } else if (
      type === 'IcosahedronGeometry'
      && approximately(parameters.detail, 0)
      && [2.3, 1.95, 1.6].some((radius) => approximately(parameters.radius, radius))
    ) {
      candidates.oak.crowns.push(object);
    }
  });

  const definitions = [];
  for (const kind of ['pine', 'oak']) {
    const candidate = candidates[kind];
    if (candidate.trunks.length !== 1 || candidate.crowns.length !== 3) {
      golfTreeAdapterError(
        `${kind} expected one trunk and three crowns; found ${candidate.trunks.length} and ${candidate.crowns.length}`,
      );
    }
    const trunk = candidate.trunks[0];
    const radius = (mesh) => Number(mesh.geometry.parameters.radius);
    candidate.crowns.sort((left, right) => radius(right) - radius(left));
    const expectedRadii = kind === 'pine' ? [2.5, 1.88, 1.26] : [2.3, 1.95, 1.6];
    if (candidate.crowns.some((mesh, index) => !approximately(radius(mesh), expectedRadii[index]))) {
      golfTreeAdapterError(`${kind} crown geometry signatures do not match the authored tiers`);
    }
    if (!Number.isInteger(trunk.count) || trunk.count < 1) {
      golfTreeAdapterError(`${kind} trunk has invalid instance count ${trunk.count}`);
    }
    if (candidate.crowns.some((mesh) => mesh.count !== trunk.count)) {
      golfTreeAdapterError(`${kind} tree parts do not share one instance count`);
    }

    const prefix = `golf-tree-${kind}`;
    trunk.name = `${prefix}-trunk`;
    setGeometryGateMetadata(trunk, {
      instanceAssemblyPrefix: prefix,
      // Course plants every trunk from heightAt() and emits its exact collider.
      // That same-owner collider cannot support its own visual envelope, so the
      // exact trunk batch carries the authored support fact for each instance.
      checkSupport: false,
    });
    candidate.crowns.forEach((mesh, index) => {
      mesh.name = kind === 'pine'
        ? `${prefix}-cone-tier-${index}`
        : `${prefix}-crown-${index}`;
      setGeometryGateMetadata(mesh, {
        instanceAssemblyPrefix: prefix,
        // AABB crowns from adjacent procedural trees intentionally overlap;
        // trunks and per-tree support remain fully audited.
        overlap: false,
      });
    });
    definitions.push({ kind, prefix, trunk, count: trunk.count });
  }
  return definitions;
}

function golfTreeInstances(definitions, THREE) {
  const instances = [];
  for (const definition of definitions) {
    definition.trunk.updateWorldMatrix?.(true, false);
    const local = new THREE.Matrix4();
    const world = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (let index = 0; index < definition.count; index += 1) {
      definition.trunk.getMatrixAt(index, local);
      world.multiplyMatrices(definition.trunk.matrixWorld, local);
      position.setFromMatrixPosition(world);
      instances.push({
        prefix: definition.prefix,
        index,
        assemblyId: `${definition.prefix}-${index}`,
        x: position.x,
        z: position.z,
      });
    }
  }
  return instances;
}

function annotateGolfTreeAssemblies(course, THREE) {
  if (!Number.isInteger(course.treeCount) || course.treeCount < 1) {
    golfTreeAdapterError(`invalid Course treeCount ${course.treeCount}`);
  }
  const definitions = golfTreeParts(course);
  const instances = golfTreeInstances(definitions, THREE);
  if (instances.length !== course.treeCount) {
    golfTreeAdapterError(
      `trunk instances ${instances.length} do not match Course treeCount ${course.treeCount}`,
    );
  }
  if (course.colliders.length < course.treeCount) {
    golfTreeAdapterError(
      `only ${course.colliders.length} colliders exist for ${course.treeCount} trees`,
    );
  }

  const treeColliders = course.colliders.slice(0, course.treeCount);
  const available = new Map(instances.map((instance) => [instance.assemblyId, instance]));
  const toleranceSquared = GOLF_TREE_POSITION_TOLERANCE_M ** 2;
  for (let colliderIndex = 0; colliderIndex < treeColliders.length; colliderIndex += 1) {
    const collider = treeColliders[colliderIndex];
    if (!(collider instanceof THREE.Box3)) {
      golfTreeAdapterError(`tree collider ${colliderIndex} is not a Box3`);
    }
    const x = (Number(collider.min?.x) + Number(collider.max?.x)) / 2;
    const z = (Number(collider.min?.z) + Number(collider.max?.z)) / 2;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      golfTreeAdapterError(`tree collider ${colliderIndex} has non-finite XZ centre`);
    }

    const exact = [...available.values()]
      .map((instance) => ({
        instance,
        distanceSquared: (instance.x - x) ** 2 + (instance.z - z) ** 2,
      }))
      .filter(({ distanceSquared }) => distanceSquared <= toleranceSquared)
      .sort((left, right) => (
        left.distanceSquared - right.distanceSquared
        || left.instance.assemblyId.localeCompare(right.instance.assemblyId)
      ));
    if (exact.length !== 1) {
      golfTreeAdapterError(
        `tree collider ${colliderIndex} at ${x},${z} matched ${exact.length} trunk instances`,
      );
    }

    const { instance } = exact[0];
    collider.name = `${instance.assemblyId}-collider`;
    setGeometryGateMetadata(collider, { assemblyId: instance.assemblyId });
    available.delete(instance.assemblyId);
  }
  if (available.size !== 0) {
    golfTreeAdapterError(`${available.size} trunk instances have no tree collider`);
  }
}

function annotateGolfSceneAssemblies(course) {
  // Course is one tessellated terrain AABB; heightAt/colliders own physical
  // support while the visual mesh would intersect every planted object.
  annotateNamedSceneObjects(course.holeGroup, 'course', { overlap: false });
  // The clubhouse and balcony are one authored compound, but remain visible
  // to collision checks against every independent course object.
  annotateNamedSceneObjects(course.holeGroup, 'clubhouse', {
    assemblyId: 'golf-clubhouse',
  });

  if (!course.grass?.mesh?.isInstancedMesh) {
    throw new Error('Geometry Adapter expected Course grass detail InstancedMesh');
  }
  course.grass.mesh.name = 'golf-grass-detail';
  setGeometryGateMetadata(course.grass.mesh, { checkSupport: false });

  // These fixtures are authored directly from heightAt(), while the dynamic
  // grass re-scatters from heightAt() around the player. A whole-course AABB
  // cannot prove their local contact, so preserve the stronger source fact.
  for (const name of [
    'flag',
    'hole-marker',
    'course-side-cooler',
    'tee-marker-left',
    'tee-marker-right',
  ]) {
    annotateNamedSceneObjects(course.holeGroup, name, { checkSupport: false });
  }
  for (const name of ['entrance-sign', 'next-tee-hint']) {
    annotateNamedSceneObjects(course.holeGroup, name, { checkSupport: false }, 0);
  }

  const people = matchingSceneObjects(
    course.holeGroup,
    (object) => object?.isGroup && object.name === 'person',
    'Golf gallery people',
    0,
  );
  people.forEach((person, index) => {
    setGeometryGateMetadata(person, {
      assemblyId: `golf-gallery-person-${index}`,
    });
  });
}

function withSeededGeometryRandom(label, build) {
  let seed = 0x811c9dc5;
  for (const char of label) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  const originalRandom = Math.random;
  Math.random = () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return build();
  } finally {
    Math.random = originalRandom;
  }
}

function objectPose(object) {
  return {
    x: object.position.x,
    y: object.position.y,
    z: object.position.z,
    yaw: object.rotation.y,
  };
}

function worldObjectPose(object) {
  object.updateWorldMatrix(true, false);
  const position = object.getWorldPosition(object.position.clone());
  const quaternion = object.getWorldQuaternion(object.quaternion.clone());
  const rotation = object.rotation.clone().setFromQuaternion(quaternion, 'YXZ');
  return { x: position.x, y: position.y, z: position.z, yaw: rotation.y };
}

function golfTerrainSupportCollider(THREE, heightAt, root, name) {
  root.updateWorldMatrix(true, false);
  const at = root.getWorldPosition(new THREE.Vector3());
  const terrainY = heightAt(at.x, at.z);
  if (![at.x, at.z, terrainY].every(Number.isFinite)) {
    throw new Error(`Golf geometry Adapter has invalid terrain support ${name}`);
  }
  // A small independent sample of the procedural heightfield. It proves
  // contact at the authored placement point without following a bad Y pose.
  const halfWidth = 0.08;
  const collider = new THREE.Box3(
    new THREE.Vector3(at.x - halfWidth, terrainY - 0.08, at.z - halfWidth),
    new THREE.Vector3(at.x + halfWidth, terrainY, at.z + halfWidth),
  );
  collider.name = name;
  return collider;
}

async function buildGolf(descriptor, THREE) {
  const [
    { buildGolfRuntimeGeometry, GOLF_RUNTIME_GOLFER_IDS },
    { golfPreviewStage },
    { activeHoleNumber, setActiveHole },
    { heightAt },
  ] = await Promise.all([
    import('../src/golf/runtime-geometry.js'),
    import('../src/golf/preview.js'),
    import('../src/golf/hole.js'),
    import('../src/golf/field.js'),
  ]);
  const callerHole = activeHoleNumber();
  try {
  const stage = golfPreviewStage(descriptor.checkpoint);
  if (stage.hole !== descriptor.hole) {
    throw new Error(`Golf geometry Adapter descriptor drift: ${descriptor.id}`);
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.05, 1200);
  scene.add(camera);
  const runtime = withSeededGeometryRandom(descriptor.id, () => buildGolfRuntimeGeometry(
    scene,
    camera,
    { renderer: null, hole: descriptor.hole, grille: stage.grille },
  ));
  const { course } = runtime;
  course.holeGroup.updateMatrixWorld(true);
  annotateGolfTreeAssemblies(course, THREE);
  annotateGolfSceneAssemblies(course);

  const golferEntries = Object.entries(runtime.golfers);
  if (golferEntries.length !== 3
      || GOLF_RUNTIME_GOLFER_IDS.some((id) => !runtime.golfers[id]?.group)) {
    throw new Error(`Golf geometry Adapter expected three named golfers in ${descriptor.id}`);
  }
  for (const [id, golfer] of golferEntries) {
    if (golfer.group.parent !== scene) throw new Error(`Golf geometry Adapter did not mount golfer ${id}`);
    setGeometryGateMetadata(golfer.group, { assemblyId: `golf-runtime-golfer:${id}` });
  }
  const cartEntries = [['lead', runtime.carts.lead], ['follow', runtime.carts.follow]];
  for (const [id, cart] of cartEntries) {
    if (cart?.group?.parent !== scene) throw new Error(`Golf geometry Adapter did not mount ${id} cart`);
    setGeometryGateMetadata(cart.group, { assemblyId: `golf-runtime-cart:${id}` });
  }
  if (runtime.bag?.parent !== scene) throw new Error('Golf geometry Adapter did not mount the stand bag');
  setGeometryGateMetadata(runtime.bag, { assemblyId: 'golf-runtime-bag' });
  if (runtime.ballMeshes.size !== 4 || runtime.markers.size !== 4) {
    throw new Error(`Golf geometry Adapter expected four balls and four markers in ${descriptor.id}`);
  }
  for (const [id, ball] of runtime.ballMeshes) {
    if (ball.parent !== scene) throw new Error(`Golf geometry Adapter did not mount ball ${id}`);
    setGeometryGateMetadata(ball, {
      // All four logical balls begin at the same physical tee and separate as
      // the foursome takes sequential shots. Treat only that exact stack as a
      // single startup assembly; every later independent placement stays live.
      assemblyId: 'golf-runtime-tee-balls',
      // putBallsOnActiveTee plants this exact mesh from heightAt(); the course
      // heightfield has no audit collider that can independently prove contact.
      checkSupport: false,
    });
  }
  const clubModels = runtime.playerClub.hold.children.filter(({ userData }) => userData.kind);
  if (clubModels.length !== 3 || runtime.playerClub.rig.parent !== camera) {
    throw new Error('Golf geometry Adapter expected the three-model player club rig');
  }
  if (runtime.landingPreview.parent !== scene || runtime.heldProps.group.parent !== camera) {
    throw new Error('Golf geometry Adapter omitted presentation or held-prop geometry');
  }
  if (runtime.smoke.puffs.length !== 64) {
    throw new Error(`Golf geometry Adapter expected 64 pooled smoke sprites; got ${runtime.smoke.puffs.length}`);
  }
  const expectedGallery = descriptor.hole === 3 ? 5 : 0;
  if (course.gallery.length !== expectedGallery) {
    throw new Error(`Golf geometry Adapter expected ${expectedGallery} gallery figures; got ${course.gallery.length}`);
  }

  const terrainSupportRoots = [
    ...golferEntries.map(([id, golfer]) => [`golfer-${id}`, golfer.group]),
    ...cartEntries.map(([id, cart]) => [`cart-${id}`, cart.group]),
    ...(runtime.bag.visible ? [['bag', runtime.bag]] : []),
    ...course.gallery.map((npc, index) => [`gallery-${index}`, npc.group]),
  ];
  const terrainSupports = terrainSupportRoots.map(([id, root]) => (
    golfTerrainSupportCollider(THREE, heightAt, root, `golf-terrain-support-${id}`)
  ));

  return result(descriptor, [{ label: `golf-${descriptor.checkpoint}`, root: scene }], [
    ...course.colliders,
    ...terrainSupports,
  ], {
    checkpoint: descriptor.checkpoint,
    hole: runtime.hole,
    grille: runtime.grille,
    treeCount: course.treeCount,
    producerCounts: {
      golfers: golferEntries.length,
      carts: cartEntries.length,
      bags: 1,
      balls: runtime.ballMeshes.size,
      markers: runtime.markers.size,
      playerClubs: clubModels.length,
      galleryFigures: course.gallery.length,
      smokePuffs: runtime.smoke.puffs.length,
      terrainSupportPatches: terrainSupports.length,
    },
    poses: {
      golfers: Object.fromEntries(golferEntries.map(([id, golfer]) => [id, objectPose(golfer.group)])),
      carts: Object.fromEntries(cartEntries.map(([id, cart]) => [id, objectPose(cart.group)])),
      bag: objectPose(runtime.bag),
    },
  });
  } finally {
    if (callerHole !== null) setActiveHole(callerHole);
  }
}

function annotateSilverGeometry(root) {
  for (const name of ['city-blocks', 'city-rooftops', 'city-warning-lights']) {
    annotateNamedSceneObjects(root, name, { overlap: false, checkSupport: false });
  }
  const moonMeshes = [];
  for (const moon of namedSceneObjects(root, 'moon')) {
    moon.traverse((object) => {
      if (!object.isMesh) return;
      moonMeshes.push(object);
      setGeometryGateMetadata(object, { overlap: false, checkSupport: false });
    });
  }
  if (moonMeshes.length !== 5) {
    throw new Error(`Silver geometry Adapter expected five exact moon meshes; got ${moonMeshes.length}`);
  }
  for (const name of ['coat-rail', 'knife-blade', 'dish-wall-rack', 'stage-spotlight']) {
    annotateNamedSceneObjects(root, name, { checkSupport: false });
  }
  for (const name of [
    'frame', 'sconce', 'staff-mirror', 'ticket-board', 'card-rack', 'curtain',
    'floor-plate', 'prep-shelf-board', 'prep-shelf-tub', 'knife-rail',
    'prep-board', 'wallclock', 'rota-board', 'fire-point', 'hose-reel',
    'service-door-light', 'kitchen-strip-light',
  ]) {
    annotateNamedSceneObjects(root, name, {
      assemblyId: 'silver-building-shell',
      checkSupport: false,
    });
  }
  annotateNamedSceneObjects(root, 'dish-rack', {
    assemblyId: 'silver-dish-station',
    checkSupport: false,
  });
  for (const name of ['extraction-hood-canopy', 'extraction-hood-lip', 'pot-rack', 'hood-utensils']) {
    annotateNamedSceneObjects(root, name, {
      assemblyId: 'silver-extraction-hood',
      checkSupport: false,
    });
  }
  for (const name of ['stage-curtain', 'stage-proscenium-pelmet', 'stage-proscenium-leg']) {
    annotateNamedSceneObjects(root, name, {
      assemblyId: 'silver-building-shell',
    });
  }
}

async function buildSilver(descriptor, THREE) {
  const { buildSilverRuntimeDate, buildSilverRuntimeEnvironment } = await import('../src/silver/runtime-geometry.js');
  const scene = new THREE.Scene();
  const runtime = withSeededGeometryRandom(descriptor.id, () => {
    const environment = buildSilverRuntimeEnvironment(scene, { renderer: null });
    const date = buildSilverRuntimeDate(scene, environment.room);
    return { ...environment, date };
  });
  const { room, cast, band, taxi, date } = runtime;
  annotateSilverGeometry(room.root);

  const castIds = Object.keys(cast.byName).toSorted();
  if (castIds.length !== cast.all.length || cast.all.some((npc) => npc.group.parent !== scene)) {
    throw new Error(`Silver geometry Adapter did not mount a one-to-one named cast in ${descriptor.id}`);
  }
  for (const required of ['doorman', 'chef', 'waiter', 'ape']) {
    if (!cast.byName[required]?.group) throw new Error(`Silver geometry Adapter omitted ${required}`);
  }
  if (band.members.length !== 7 || band.leader !== band.members[6]
      || band.members.some((npc) => npc.group.parent !== scene)) {
    throw new Error('Silver geometry Adapter expected exactly seven mounted band members');
  }
  if (taxi.group.parent !== scene || taxi.driver.group.parent !== scene || date.group.parent !== scene) {
    throw new Error('Silver geometry Adapter omitted taxi, driver, or Date geometry');
  }

  return result(descriptor, [{ label: 'silver-runtime', root: scene }], room.colliders, {
    producerCounts: {
      cast: cast.all.length,
      band: band.members.length,
      taxiRoots: 2,
      dates: 1,
    },
    castIds,
    poses: {
      taxi: objectPose(taxi.group),
      driver: objectPose(taxi.driver.group),
      date: objectPose(date.group),
    },
  });
}

function annotateNoWakeGeometry(scene) {
  const cruiser = namedSceneObjects(scene, '42-foot express cruiser')[0];
  const dock = annotateNamedSceneObjects(scene, 'South Harbor · Gate C finger', {
    assemblyId: 'no-wake-gate-c-dock',
  })[0];
  // One exact piling is the physical support provenance for the fixed dock
  // installation. The other mounted fixtures share the bounded dock owner.
  annotateNamedSceneObjects(dock, 'dock piling outboard 1', {
    checkSupport: false,
    fixedSupportAnchor: true,
  });
  annotateNamedSceneObjects(scene, 'dock mooring rope', {
    assemblyId: 'no-wake-dock-mooring-rope',
  });
  // The authored sagging curve has a long AABB that cuts through the boat even
  // though the rope itself stays outside it. Keep that exemption on the exact
  // curved strand; the cleat interaction and rope support remain auditable.
  annotateNamedSceneObjects(scene, 'dock mooring rope strand', { overlap: false });
  namedSceneObjects(scene, 'no-wake channel and inlet');
  // This is the marina's authored land mass and the datum for its tree row.
  annotateNamedSceneObjects(scene, 'harbor shoreline bank', { structural: true });

  // The hull and its long lofted trim are concave/tapered skins. Their AABBs
  // fill the cabin and side decks even though the rendered surfaces do not.
  // Keep each opt-out on the exact mesh that owns that false solid envelope.
  const hullShellNames = [
    'cream fiberglass hull',
    'burgundy sheer stripe port', 'burgundy sheer stripe starboard',
    'burgundy accent stripe port', 'burgundy accent stripe starboard',
    'rub strip port', 'rub strip starboard',
    'gunwale cap port', 'gunwale cap starboard',
    'transom face', 'transom name sign',
  ];
  for (const name of hullShellNames) {
    const [part] = annotateNamedSceneObjects(cruiser, name, {
      assemblyId: 'no-wake-cruiser-hull-shell',
    });
    if (part.geometry?.type === 'BufferGeometry') {
      setGeometryGateMetadata(part, { overlap: false });
    }
  }
  const hull = namedSceneObjects(cruiser, 'cream fiberglass hull')[0];
  setGeometryGateMetadata(hull, { overlap: false, checkSupport: false, fixedSupportAnchor: true });

  const boundedFixtureAssemblies = new Map([
    ['swim platform', 'no-wake-swim-platform'],
    ['starboard transom gate', 'no-wake-cockpit-coaming:starboard'],
    ['stern storage hatch', 'no-wake-stern-locker'],
    ['aft cockpit seating', 'no-wake-cockpit-seating'],
    ['smoked wraparound windshield', 'no-wake-windshield'],
    ['starboard helm station', 'no-wake-helm-station'],
    ['companionway head', 'no-wake-companionway-head'],
    ['visible physical boarding bridge', 'no-wake-boarding-bridge'],
    ['galley and wet bar', 'no-wake-cabin-fixed-fitout'],
    ['curved dinette', 'no-wake-cabin-fixed-fitout'],
    ['forward V-berth', 'no-wake-cabin-fixed-fitout'],
    ['cabin aft bulkhead', 'no-wake-cabin-fixed-fitout'],
    ['companionway', 'no-wake-cabin-fixed-fitout'],
    ['bow searchlight', 'no-wake-bow-searchlight'],
    ['forward ballast locker', 'no-wake-forward-ballast-locker'],
  ]);
  for (const [name, assemblyId] of boundedFixtureAssemblies) {
    annotateNamedSceneObjects(cruiser, name, { assemblyId });
  }

  for (const object of matchingSceneObjects(
    cruiser,
    (candidate) => /^(?:cockpit sole(?: nonslip)?|engine hatch (?:lid|seam \d+|lift ring \d+))$/.test(candidate?.name ?? ''),
    'NO WAKE cockpit deck and hatch meshes',
  )) {
    setGeometryGateMetadata(object, {
      assemblyId: object.name.startsWith('engine hatch')
        ? 'no-wake-engine-hatch'
        : 'no-wake-cockpit-sole',
    });
  }
  for (const object of matchingSceneObjects(
    cruiser,
    (candidate) => /^cabin trunk/.test(candidate?.name ?? ''),
    'NO WAKE cabin trunk meshes',
  )) setGeometryGateMetadata(object, { assemblyId: 'no-wake-cabin-trunk' });
  annotateNamedSceneObjects(cruiser, 'forward bulkhead', {
    assemblyId: 'no-wake-cabin-fixed-fitout',
  });
  for (const name of ['bow sun pad cushion', 'bow sun pad seam']) {
    annotateNamedSceneObjects(cruiser, name, { assemblyId: 'no-wake-bow-sun-pad' });
  }
  for (const name of ['anchor hatch lid', 'anchor hatch seam', 'anchor hatch lift ring']) {
    annotateNamedSceneObjects(cruiser, name, { assemblyId: 'no-wake-anchor-hatch' });
  }
  annotateNamedSceneObjects(cruiser, 'bow rope coil', { assemblyId: 'no-wake-bow-rope-coil' });
  annotateNamedSceneObjects(cruiser, 'bow navigation light housing', {
    assemblyId: 'no-wake-bow-navigation-light',
  });
  for (const side of ['port', 'starboard']) {
    for (const object of matchingSceneObjects(
      cruiser,
      (candidate) => candidate?.name?.startsWith(`${side} bow rail `)
        || candidate?.name?.startsWith(`${side} pulpit rail `),
      `NO WAKE ${side} bow rail meshes`,
    )) setGeometryGateMetadata(object, { assemblyId: `no-wake-bow-rail:${side}` });
    for (const name of [`${side} cockpit coaming`, `${side} coaming cap`]) {
      annotateNamedSceneObjects(cruiser, name, { assemblyId: `no-wake-cockpit-coaming:${side}` });
    }
    annotateNamedSceneObjects(cruiser, `stern mooring cleat ${side}`, {
      assemblyId: `no-wake-cockpit-coaming:${side}`,
    });
  }
  for (const object of matchingSceneObjects(
    cruiser,
    (candidate) => /^(?:radar arch|VHF whip antenna)/.test(candidate?.name ?? ''),
    'NO WAKE radar arch meshes',
  )) setGeometryGateMetadata(object, { assemblyId: 'no-wake-radar-arch' });
  for (let index = 1; index <= 3; index += 1) {
    for (const name of [`hanging dock fender ${index}`, `hanging fender lanyard ${index}`]) {
      annotateNamedSceneObjects(cruiser, name, { assemblyId: `no-wake-dock-fender:${index}` });
    }
    annotateNamedSceneObjects(cruiser, `hanging fender lanyard ${index}`, {
      checkSupport: false,
      fixedSupportAnchor: true,
    });
  }
  annotateNamedSceneObjects(cruiser, 'swim platform bracket port', {
    checkSupport: false,
    fixedSupportAnchor: true,
  });
  for (const name of ['stowed life jacket 1', 'stowed life jacket 2']) {
    annotateNamedSceneObjects(cruiser, name, { assemblyId: 'no-wake-cockpit-seating' });
  }
  // The cabin sole is the exact bolted datum for the fixed below-deck fitout.
  // Its parent boat hull is a concave surface rather than a reliable AABB
  // supporter, so preserve the physical provenance on this one structural mesh.
  annotateNamedSceneObjects(cruiser, 'cabin sole', {
    checkSupport: false,
    fixedSupportAnchor: true,
  });
  for (const object of matchingSceneObjects(
    cruiser,
    (candidate) => /^(?:cabin sole(?: runner)?|cabin hull liner|cabin veneer rail|cabin porthole|cabin ceiling|cabin overhead light)/.test(candidate?.name ?? ''),
    'NO WAKE cabin shell meshes',
  )) setGeometryGateMetadata(object, { assemblyId: 'no-wake-cabin-fixed-fitout' });

  const neighboringBoats = matchingSceneObjects(
    scene,
    (object) => /^detailed neighboring marina boat \d+$/.test(object?.name ?? ''),
    'NO WAKE neighboring marina boats',
    2,
  );
  if (neighboringBoats.length !== 2) {
    throw new Error(`NO WAKE Adapter expected two neighboring marina boats; found ${neighboringBoats.length}`);
  }
  for (const [index, boat] of neighboringBoats.entries()) {
    setGeometryGateMetadata(boat, { assemblyId: `no-wake-neighbor-boat:${index + 1}` });
    annotateNamedSceneObjects(boat, 'tapered neighboring hull', {
      checkSupport: false,
      fixedSupportAnchor: true,
    });
  }

  const houses = matchingSceneObjects(
    scene,
    (object) => /^shoreline house \d+$/.test(object?.name ?? ''),
    'NO WAKE shoreline houses',
    16,
  );
  if (houses.length !== 16) {
    throw new Error(`NO WAKE Adapter expected sixteen shoreline houses; found ${houses.length}`);
  }
  for (const [index, house] of houses.entries()) {
    setGeometryGateMetadata(house, {
      assemblyId: `no-wake-shoreline-house:${index + 1}`,
      wall: false,
    });
  }

  for (const name of [
    'west channel shoreline', 'east channel shoreline', 'wooded point headland', 'inlet head land',
  ]) {
    annotateNamedSceneObjects(scene, name, {
      assemblyId: 'no-wake-channel-landform',
      structural: true,
    });
  }
  annotateNamedSceneObjects(scene, 'quarry wall', {
    assemblyId: 'no-wake-channel-landform',
    structural: true,
    wall: false,
  });

  const marker = annotateNamedSceneObjects(scene, 'NO WAKE channel marker', {
    assemblyId: 'no-wake-channel-marker',
  })[0];
  annotateNamedSceneObjects(marker, 'NO WAKE sign piling', {
    checkSupport: false,
    fixedSupportAnchor: true,
  });

  const buoys = matchingSceneObjects(
    scene,
    (object) => /^channel buoy \d+$/.test(object?.name ?? ''),
    'NO WAKE channel buoys',
    14,
  );
  if (buoys.length !== 14) {
    throw new Error(`NO WAKE Adapter expected fourteen channel buoys; found ${buoys.length}`);
  }
  for (const [index, buoy] of buoys.entries()) {
    setGeometryGateMetadata(buoy, { assemblyId: `no-wake-channel-buoy:${index + 1}` });
    annotateNamedSceneObjects(buoy, `channel buoy body ${index + 1}`, {
      checkSupport: false,
      fixedSupportAnchor: true,
    });
  }

  const waterborne = matchingSceneObjects(
    scene,
    (object) => /^(?:channel buoy \d+|detailed neighboring marina boat \d+)$/.test(object?.name ?? ''),
    'NO WAKE waterborne scenery',
  );
  if (waterborne.length !== 16) {
    throw new Error(`NO WAKE Adapter expected sixteen waterborne scenic roots; found ${waterborne.length}`);
  }
}

function annotateNoWakeRuntimeGeometry(world, bodyRig) {
  if (!world.boat.hull?.isMesh) throw new Error('NO WAKE cruiser is missing its exact hull anchor');
  setGeometryGateMetadata(world.boat.hull, { checkSupport: false, fixedSupportAnchor: true });
  for (const [id, npc] of Object.entries(world.boat.cast)) {
    if (!npc?.group) throw new Error(`NO WAKE cast member ${id} has no geometry root`);
    setGeometryGateMetadata(npc.group, { assemblyId: `no-wake-cast:${id}` });
  }
  setGeometryGateMetadata(bodyRig.root, { assemblyId: 'no-wake-body-rig' });
  if (world.boat.ballast.parent === bodyRig.bag) {
    setGeometryGateMetadata(world.boat.ballast, { assemblyId: 'no-wake-body-rig' });
  }
}

function noWakeBoatWorldColliders(world) {
  const { boat } = world;
  boat.root.updateMatrixWorld(true);
  const colliders = [];
  for (const [space, local] of [
    ['deck', boat.localColliders],
    ['cabin', boat.cabinColliders],
  ]) {
    if (!Array.isArray(local) || local.length === 0) {
      throw new Error(`NO WAKE ${space} collision geometry is missing`);
    }
    for (const [index, box] of local.entries()) {
      if (!box?.isBox3) throw new Error(`NO WAKE ${space} collider ${index} is not a Box3`);
      const worldBox = box.clone().applyMatrix4(boat.root.matrixWorld);
      worldBox.name = `no-wake-boat-${space}:${box.name || index}`;
      worldBox.userData = { geometryGate: { assemblyId: 'no-wake-boat-collision-solid' } };
      colliders.push(worldBox);
    }
  }
  return colliders;
}

async function buildNoWake(descriptor, THREE) {
  const [{ buildNoWakeWorld }, { createBodyRig }, { stageNoWakeCheckpointGeometry }] = await Promise.all([
    import('../src/nowake/world.js'),
    import('../src/nowake/body.js'),
    import('../src/nowake/preview.js'),
  ]);
  const scene = new THREE.Scene();
  const camera = new THREE.Group();
  camera.name = 'no-wake-geometry-camera';
  scene.add(camera);
  const world = buildNoWakeWorld(scene);
  const bodyRig = createBodyRig(world.boat);
  const checkpoint = descriptor.checkpoint ?? descriptor.geometryStage;
  const staged = stageNoWakeCheckpointGeometry(checkpoint, { world, bodyRig, camera });
  if (Object.keys(world.boat.cast).length !== 4) {
    throw new Error(`NO WAKE Adapter expected four cast members; found ${Object.keys(world.boat.cast).length}`);
  }
  if (bodyRig.root.parent !== world.boat.root) {
    throw new Error('NO WAKE wrapped-body rig is not mounted to the cruiser');
  }
  annotateNoWakeGeometry(scene);
  annotateNoWakeRuntimeGeometry(world, bodyRig);
  const boatColliders = noWakeBoatWorldColliders(world);
  return result(
    descriptor,
    [{ label: 'no-wake', root: scene }],
    [...world.colliders, ...boatColliders],
    {
      checkpoint,
      producers: ['buildNoWakeWorld', 'createBodyRig', 'stageNoWakeCheckpointGeometry'],
      marinaColliderCount: world.colliders.length,
      deckColliderCount: world.boat.localColliders.length,
      cabinColliderCount: world.boat.cabinColliders.length,
      castCount: Object.keys(world.boat.cast).length,
      bodyStage: staged.bodyStage,
    },
  );
}

function isCollapsedEnolaInstanceMesh(mesh, THREE) {
  if (!mesh?.isInstancedMesh || !Number.isInteger(mesh.count) || mesh.count <= 0) return false;
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    const elements = matrix.elements;
    const scaleX = Math.hypot(elements[0], elements[1], elements[2]);
    const scaleY = Math.hypot(elements[4], elements[5], elements[6]);
    const scaleZ = Math.hypot(elements[8], elements[9], elements[10]);
    if (
      elements[13] > -399
      || scaleX > 0.001
      || scaleY > 0.001
      || scaleZ > 0.001
    ) return false;
  }
  return true;
}

function enolaLandmarkTerrainSupportCollider(THREE, city, landmark, supportPoint, index) {
  const worldX = city.group.position.x + supportPoint.x;
  const worldZ = city.group.position.z + supportPoint.z;
  const terrainY = supportPoint.y;
  if (![worldX, worldZ, terrainY].every(Number.isFinite)) {
    throw new Error(`Enola geometry Adapter has invalid landmark terrain support ${landmark.name}`);
  }
  // A point-local sample of the same procedural heightfield used to author
  // the landmark. The city-scale terrain AABB cannot prove this contact.
  const halfWidth = 0.08;
  const collider = new THREE.Box3(
    new THREE.Vector3(worldX - halfWidth, terrainY - 0.08, worldZ - halfWidth),
    new THREE.Vector3(worldX + halfWidth, terrainY, worldZ + halfWidth),
  );
  collider.name = `enola-landmark-terrain-support-${landmark.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${index}`;
  return collider;
}

function annotateEnolaGeometry(scene, { city, stage, aircraft, payload, crew, toolCart, weather, THREE }) {
  if (aircraft.group?.name !== 'enola-squatch' || !aircraft.parts?.wing?.isMesh) {
    throw new Error('Enola Adapter is missing the aircraft or its exact main-wing anchor');
  }
  setGeometryGateMetadata(aircraft.parts.wing, {
    assemblyId: 'enola-aircraft:wing',
    checkSupport: false,
    fixedSupportAnchor: true,
  });

  // EnolaSquatch is a vehicle, but not one opaque collision owner. Preserve
  // checks across its authored systems while joining only each named coherent
  // structure whose fitted parts are expected to key into one another.
  const namedAircraftAssemblies = [
    ['enola-aircraft:fuselage-shell', ['fuselage-open-shell', 'cabin-liner']],
    ['enola-aircraft:cockpit', ['cockpit']],
    ['enola-aircraft:nose', [
      'nose-cone', 'bombardier-glazing', 'nose-glazing-rib', 'nose-glazing-collar',
    ]],
    ['enola-aircraft:rear-gun', ['rear-gun-station']],
    ['enola-aircraft:dorsal-turret', ['dorsal-turret']],
    ['enola-aircraft:crew-door', ['crew-door-frame', 'crew-door-hinge']],
    ['enola-aircraft:boarding-ladder', ['boarding-ladder']],
    ['enola-aircraft:bomb-bay', ['bomb-bay-door-port', 'bomb-bay-door-starboard', 'payload-mount']],
    ['enola-aircraft:tail', [
      'vertical-fin', 'horizontal-stabilizer', 'tailplane-brace', 'tailplane-jury-strut',
    ]],
    ['enola-aircraft:wing', ['air-brake-left', 'air-brake-right']],
    ['enola-aircraft:gear-nose', ['gear-bay-nose', 'gear-leg-nose']],
    ['enola-aircraft:gear-port', ['gear-bay-port', 'gear-leg-port']],
    ['enola-aircraft:gear-starboard', ['gear-bay-starboard', 'gear-leg-starboard']],
  ];
  for (const [assemblyId, names] of namedAircraftAssemblies) {
    for (const name of names) annotateNamedSceneObjects(aircraft.group, name, { assemblyId });
  }
  // These are the interior face of the open fuselage shell. They are walls,
  // but fitted frames and cabin hardware are intentionally mounted through
  // them; exact wall-embed auditing is therefore meaningless for these panels.
  annotateNamedSceneObjects(aircraft.group, 'cabin-wall-liner', { checkWallEmbed: false });
  setGeometryGateMetadata(payload.group, {
    assemblyId: 'enola-fat-squatch-payload',
    ...(stage.checkpoint === 'detonation' ? { overlap: false } : {}),
  });
  if (!payload.parts?.body?.isMesh) throw new Error('Enola payload is missing its exact casing anchor');
  setGeometryGateMetadata(payload.parts.body, { checkSupport: false, fixedSupportAnchor: true });
  const crewFixtures = new Map([
    [crew.sasole, { fixture: aircraft.anchors.seats.copilot, id: 'copilot-sasole' }],
    [crew.irish, { fixture: aircraft.anchors.seats.navigator, id: 'navigator-irish' }],
    [crew.shubes, { fixture: aircraft.parts.rearGunSeatMount, id: 'rear-gunner-shubes' }],
  ]);
  for (const member of crew.all) {
    const id = member.group?.name;
    if (!id) throw new Error('Enola crew member is missing a stable geometry name');
    const fixture = crewFixtures.get(member);
    const assemblyId = fixture ? `enola-fixture:${fixture.id}` : `enola-crew:${id}`;
    if (fixture) {
      if (!fixture.fixture?.isObject3D) {
        throw new Error(`Enola crew fixture ${fixture.id} is missing its exact scene anchor`);
      }
      setGeometryGateMetadata(fixture.fixture, {
        assemblyId,
        supportAssemblyId: `${assemblyId}:furniture`,
      });
    }
    setGeometryGateMetadata(member.group, {
      assemblyId,
      supportAssemblyId: `${assemblyId}:occupant`,
      checkSupport: false,
    });
  }
  setGeometryGateMetadata(toolCart, { assemblyId: 'enola-tool-cart' });
  annotateNamedSceneObjects(scene, 'eastbound terrain ground', { structural: true, overlap: false });
  const cloudMeshes = [];
  weather.clouds.traverse((object) => { if (object.isMesh) cloudMeshes.push(object); });
  if (cloudMeshes.length === 0) throw new Error('Enola WeatherSystem produced no cloud geometry');
  for (const cloud of cloudMeshes) {
    setGeometryGateMetadata(cloud, { overlap: false, checkSupport: false });
  }
  namedSceneObjects(scene, 'squatchbourg');
  annotateNamedSceneObjects(scene, 'dog', { checkSupport: false });
  annotateNamedSceneObjects(scene, 'crow', { overlap: false });

  if (weather.cloudBits.length !== 44) {
    throw new Error(`Enola WeatherSystem expected 44 cloud groups; found ${weather.cloudBits.length}`);
  }
  if (aircraft.group.parent !== scene || crew.all.some((member) => !aircraft.group.getObjectById(member.group.id))) {
    throw new Error('Enola checkpoint did not mount the aircraft and complete seated crew');
  }

  const opsShackBodies = matchingSceneObjects(
    scene,
    (object) => (
      object?.isMesh
      && object.parent?.name === 'ops-shack'
      && object.geometry?.type === 'BoxGeometry'
      && approximately(object.geometry?.parameters?.width, 7)
      && approximately(object.geometry?.parameters?.height, 3.2)
      && approximately(object.geometry?.parameters?.depth, 5)
    ),
    'the single rotated ops-shack body',
  );
  if (opsShackBodies.length !== 1) {
    throw new Error(`Geometry Adapter expected one ops-shack body; found ${opsShackBodies.length}`);
  }
  setGeometryGateMetadata(opsShackBodies[0], { overlap: false });

  if (!stage.destroyed) return;
  if (!city.crater?.mesh || !city.crater?.glow) {
    throw new Error('Geometry Adapter expected crater mesh and glow in destroyed Enola state');
  }
  city.crater.glow.name = 'squatchbourg-crater-glow';
  for (const object of [city.crater.mesh, city.crater.glow]) {
    setGeometryGateMetadata(object, { assemblyId: 'enola-squatchbourg-crater', checkSupport: false });
  }
  const collapsed = matchingSceneObjects(
    city.group,
    (object) => isCollapsedEnolaInstanceMesh(object, THREE),
    'collapsed Enola instance meshes',
    0,
  );
  for (const mesh of collapsed) mesh.visible = false;
}

async function buildEnola(descriptor, THREE) {
  const [
    { buildAirfield },
    { WeatherSystem },
    { buildAirfieldScenery, ENOLA_HARDSTAND_SURFACE_OFFSET_M },
    { EnolaSquatch },
    { TargetCity },
    { FatSquatch },
    { createCrew, makeToolCart },
    { createEnolaWorldGeometry },
    { stageEnolaCheckpointGeometry },
    { ENOLA_PARKING, LANDMARKS_EAST, TARGET_X },
  ] = await Promise.all([
    import('../src/beefrun/airfield.js'),
    import('../src/beefrun/weather.js'),
    import('../src/enolasquatch/airfield-scenery.js'),
    import('../src/enolasquatch/scenes/EnolaSquatch.js'),
    import('../src/enolasquatch/scenes/TargetCity.js'),
    import('../src/enolasquatch/payload/FatSquatch.js'),
    import('../src/enolasquatch/crew.js'),
    import('../src/enolasquatch/world-geometry.js'),
    import('../src/enolasquatch/preview.js'),
    import('../src/enolasquatch/config.js'),
  ]);
  const scene = new THREE.Scene();
  const worldGeometry = createEnolaWorldGeometry(scene);
  const getHeight = worldGeometry.groundHeightCombined;
  const airfield = buildAirfield(scene, {});
  if (airfield.root?.parent !== scene) throw new Error('Enola Adapter did not mount the airfield producer');
  delete airfield.root.userData?.geometryGate?.checkSupport;
  const airfieldScenery = buildAirfieldScenery(scene, { getHeight });
  const aircraft = new EnolaSquatch();
  scene.add(aircraft.group);
  const payload = new FatSquatch();
  aircraft.anchors.payloadMount.add(payload.group);
  const compound = LANDMARKS_EAST.find((landmark) => landmark.id === 'compound');
  if (!compound) throw new Error('Enola Adapter cannot find the target compound landmark');
  const city = new TargetCity(scene, { x: TARGET_X, z: compound.z, getHeight });
  if (!Array.isArray(city.landmarks) || city.landmarks.length !== 26) {
    throw new Error(`Enola Adapter expected 26 city landmarks; found ${city.landmarks?.length ?? 'none'}`);
  }
  const landmarkNames = city.landmarks.map(({ name }) => name);
  if (landmarkNames.some((name) => typeof name !== 'string' || !name.trim())
      || new Set(landmarkNames).size !== landmarkNames.length) {
    throw new Error('Enola Adapter requires a unique stable name for every city landmark');
  }
  const landmarkTerrainSupports = city.landmarks.flatMap((landmark) => {
    if (!Array.isArray(landmark.supportPoints) || landmark.supportPoints.length === 0) {
      throw new Error(`Enola Adapter landmark ${landmark.name} has no authored support points`);
    }
    return landmark.supportPoints.map((supportPoint, index) => (
      enolaLandmarkTerrainSupportCollider(THREE, city, landmark, supportPoint, index)
    ));
  });
  if (landmarkTerrainSupports.length !== 29) {
    throw new Error(`Enola Adapter expected 29 landmark support points; found ${landmarkTerrainSupports.length}`);
  }
  const crew = createCrew();
  const toolCart = makeToolCart();
  scene.add(toolCart);
  const apronElevation = getHeight(ENOLA_PARKING.x, ENOLA_PARKING.z);
  toolCart.position.set(
    ENOLA_PARKING.x + 3.2,
    apronElevation + ENOLA_HARDSTAND_SURFACE_OFFSET_M,
    ENOLA_PARKING.z - 2.4,
  );
  toolCart.rotation.y = 0.6;
  const weather = new WeatherSystem(scene, null, { seed: 0xE57A11 });
  const stage = stageEnolaCheckpointGeometry(descriptor.checkpoint, {
    scene, aircraft, payload, crew, airfield, city, weather,
    groundHeight: getHeight, worldGeometry,
  });
  annotateEnolaGeometry(scene, { city, stage, aircraft, payload, crew, toolCart, weather, THREE });
  const scatter = scene.getObjectByName('eastbound terrain scatter');
  if (!scatter?.isInstancedMesh || scatter.count !== 620) {
    throw new Error(`Enola Adapter expected 620 eastbound scatter instances; found ${scatter?.count ?? 'none'}`);
  }
  if (!airfieldScenery?.root?.parent && !airfieldScenery?.group?.parent) {
    const sceneryPresent = scene.getObjectByName('airfield-scenery');
    if (!sceneryPresent) throw new Error('Enola Adapter did not mount the airfield scenery producer');
  }
  return result(
    descriptor,
    [{ label: 'enolasquatch', root: scene }],
    [...airfield.colliders, ...landmarkTerrainSupports],
    {
      checkpoint: descriptor.checkpoint,
      phase: stage.phase,
      producers: [
        'createEnolaWorldGeometry', 'buildAirfield', 'buildAirfieldScenery',
        'EnolaSquatch', 'FatSquatch', 'TargetCity', 'createCrew', 'makeToolCart', 'WeatherSystem',
      ],
      crewCount: crew.all.length,
      crewAboard: stage.crewAboard,
      payloadReleased: stage.payloadReleased,
      cityDestroyed: stage.destroyed,
      eastScatterCount: scatter.count,
      weatherCloudCount: weather.cloudBits.length,
      airfieldColliderCount: airfield.colliders.length,
      landmarkTerrainSupportCount: landmarkTerrainSupports.length,
    },
  );
}

async function buildHeist(descriptor, THREE) {
  const [{ buildHeistLevel }, { buildHeistCrew }, { stageHeistCheckpointGeometry }] = await Promise.all([
    import('../src/heist/level.js'),
    import('../src/heist/cast.js'),
    import('../src/heist/preview.js'),
  ]);
  const scene = new THREE.Scene();
  const heist = buildHeistLevel(scene);
  const crew = buildHeistCrew(heist.phases.safehouse.group);
  const staged = stageHeistCheckpointGeometry(descriptor.checkpoint, { level: heist, crew });
  const phase = heist.phases[staged.phase];
  return result(
    descriptor,
    [{ label: `heist-${descriptor.checkpoint}`, root: phase.group }],
    phase.colliders ?? [],
    { phase: staged.phase, crewCount: crew.size, checkpoint: descriptor.checkpoint },
  );
}

async function buildMotel(descriptor, THREE) {
  const meshCount = (root) => {
    let count = 0;
    root.traverse((object) => { if (object.isMesh) count += 1; });
    return count;
  };

  if (descriptor.geometryStage === 'drive') {
    const { buildMotelDriveCar, buildMotelDriveScene } = await import('../src/motel/drive-geometry.js');
    const drive = buildMotelDriveScene();
    const traffic = buildMotelDriveCar(0x2f3a6b, false);
    traffic.name = 'motel.drive.traffic-archetype';
    traffic.position.set(4, 0, -30);
    drive.scene.add(traffic);
    if (drive.segmentCount !== 24 || drive.road.length !== 24) {
      throw new Error(`Motel drive Adapter expected 24 road segments; found ${drive.road.length}`);
    }
    if (drive.car.parent !== drive.scene || traffic.parent !== drive.scene) {
      throw new Error('Motel drive Adapter failed to mount both runtime vehicle producers');
    }
    for (const [index, segment] of drive.road.entries()) {
      for (const key of ['seg', 'dash', 'palmL', 'lamp', 'pole', 'lampL', 'poleL']) {
        if (segment[key]?.parent !== drive.scene) {
          throw new Error(`Motel drive segment ${index} is missing ${key}`);
        }
      }
    }
    return result(
      descriptor,
      [{ label: 'jerky-motel-drive', root: drive.scene }],
      [],
      {
        geometryStage: 'drive',
        roadSegmentCount: drive.road.length,
        playerCarMeshCount: meshCount(drive.car),
        trafficCarMeshCount: meshCount(traffic),
        vehicleProducerCount: 2,
      },
    );
  }

  if (descriptor.geometryStage !== 'startup' && descriptor.geometryStage !== 'late') {
    throw new Error(`Unknown Motel geometry stage: ${descriptor.geometryStage}`);
  }
  const [{ buildMotel: buildMotelLevel }, { buildMotelCastGeometry }] = await Promise.all([
    import('../src/motel/level.js'),
    import('../src/motel/runtime-geometry.js'),
  ]);
  const scene = new THREE.Scene();
  const motel = buildMotelLevel(scene, null);
  if (!Array.isArray(motel.colliders) || motel.colliders.length === 0) {
    throw new Error('Motel property Adapter produced no colliders');
  }
  for (const [index, collider] of motel.colliders.entries()) {
    const owner = collider?.userData?.geometryGate?.assemblyId;
    if (typeof owner !== 'string' || !owner.trim()) {
      throw new Error(`Motel collider ${index} is missing exact geometry ownership`);
    }
  }
  if (descriptor.geometryStage === 'late') motel.refs.manCar.collider.enabled = true;
  const cast = buildMotelCastGeometry(scene, descriptor.geometryStage, {
    arrivalCar: motel.refs.manCar,
    deckY: motel.DECK_Y,
    floorAt: motel.floorAt,
  });
  const expectedCastCount = descriptor.geometryStage === 'startup' ? 4 : 10;
  if (cast.length !== expectedCastCount || cast.some(({ group }) => scene.getObjectById(group.id) !== group)) {
    throw new Error(
      `Motel ${descriptor.geometryStage} Adapter expected ${expectedCastCount} mounted actors; found ${cast.length}`,
    );
  }
  const actorStages = cast.map(({ group }) => group.userData.motelGeometryStage);
  if (actorStages.some((stage) => typeof stage !== 'string' || !stage)) {
    throw new Error(`Motel ${descriptor.geometryStage} Adapter produced an unstaged actor`);
  }
  return result(
    descriptor,
    [{ label: 'jerky-motel', root: scene }],
    motel.colliders,
    {
      geometryStage: descriptor.geometryStage,
      castCount: cast.length,
      actorStages,
      actorPoses: Object.fromEntries(cast.map(({ group }) => [
        group.userData.motelGeometryStage,
        worldObjectPose(group),
      ])),
      enabledColliderCount: motel.colliders.filter(({ enabled }) => enabled !== false).length,
      propertyMeshCount: meshCount(scene),
      arrivalCarAtPark: descriptor.geometryStage === 'late',
    },
  );
}

async function buildGraveyardState(descriptor, THREE) {
  const [{ buildGraveyard }, { GraveyardMission }, { stageGraveyardCheckpointGeometry }] = await Promise.all([
    import('../src/graveyard/world.js'),
    import('../src/graveyard/mission.js'),
    import('../src/graveyard/preview.js'),
  ]);
  const scene = new THREE.Scene();
  const graveyard = buildGraveyard(scene);
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.04, 180);
  camera.name = 'graveyard.geometry-carry-anchor';
  scene.add(camera);
  const mission = new GraveyardMission();
  const staged = stageGraveyardCheckpointGeometry(descriptor.checkpoint, {
    graveyard,
    mission,
    carryAnchor: camera,
    player: {
      position: camera.position,
      velocity: new THREE.Vector3(),
      clearKeys: noop,
      ground: 0,
      yaw: 0,
      pitch: 0,
    },
  });
  if (staged.bodyPhase !== graveyard.bodyPresentation().phase) {
    throw new Error(`Graveyard Adapter staged the wrong body phase for ${descriptor.id}`);
  }
  return result(descriptor, [{ label: `graveyard-${descriptor.checkpoint}`, root: scene }], graveyard.colliders, {
    checkpoint: descriptor.checkpoint,
    bodyPhase: staged.bodyPhase,
    missionState: mission.state,
    body: graveyard.bodyPresentation(),
    producerCounts: { worlds: 1, cast: 1 },
  });
}

async function buildBeefRun(descriptor, THREE, collaborators) {
  const [
    { buildAirfield },
    { buildAirstrip },
    { buildLandmarks },
    { Brushrunner },
    { TerrainStreamingSystem, terrainHeight },
    { WeatherSystem },
    { makeLou, makeOldStove },
    { Preflight },
    { AircraftPhysics },
    { stageBeefRunCheckpointGeometry },
  ] = await Promise.all([
    import('../src/beefrun/airfield.js'),
    import('../src/beefrun/airstrip.js'),
    import('../src/beefrun/landmarks.js'),
    import('../src/beefrun/aircraft.js'),
    import('../src/beefrun/terrain.js'),
    import('../src/beefrun/weather.js'),
    import('../src/beefrun/npc.js'),
    import('../src/beefrun/preflight.js'),
    import('../src/beefrun/physics.js'),
    import('../src/beefrun/preview.js'),
  ]);
  const scene = new THREE.Scene();
  const terrain = new TerrainStreamingSystem(scene);
  const weather = new WeatherSystem(scene, null, { seed: 0xbee5f17 });
  const landmarks = buildLandmarks(scene);
  const airfield = buildAirfield(scene, { terrain });
  const airstrip = buildAirstrip(scene);
  const aircraft = new Brushrunner();
  scene.add(aircraft.group);
  const physics = new AircraftPhysics({ getHeight: terrainHeight });
  const lou = makeLou();
  const stove = makeOldStove();
  scene.add(lou.group, stove.group);
  const preflight = new Preflight({
    scene,
    interaction: collaborators.interaction,
    aircraft,
    dialogue: collaborators.dialogue,
    audio: collaborators.audio,
  });
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 9000);
  scene.add(camera);
  const staged = stageBeefRunCheckpointGeometry(descriptor.checkpoint, {
    scene,
    physics,
    aircraft,
    terrain,
    weather,
    airfield,
    airstrip,
    lou,
    stove,
    preflight,
    camera,
    crosswindScale: 1,
  });
  if (terrain.chunks.size < 9 || weather.cloudBits.length !== 44) {
    throw new Error(`Beef Run Adapter omitted terrain/weather producers for ${descriptor.id}`);
  }
  if (staged.preflightArmed !== (descriptor.checkpoint === 'preflight')) {
    throw new Error(`Beef Run Adapter staged the wrong Preflight state for ${descriptor.id}`);
  }
  if (staged.louAboard !== (descriptor.checkpoint !== 'preflight')) {
    throw new Error(`Beef Run Adapter staged Captain Lou incorrectly for ${descriptor.id}`);
  }
  return result(
    descriptor,
    [{ label: `beef-run-${descriptor.checkpoint}`, root: scene }],
    [...airfield.colliders, ...airstrip.colliders],
    {
      checkpoint: descriptor.checkpoint,
      phase: staged.phase,
      producers: [
        'TerrainStreamingSystem', 'WeatherSystem', 'buildLandmarks', 'buildAirfield',
        'buildAirstrip', 'Brushrunner', 'makeLou', 'makeOldStove', 'Preflight',
      ],
      terrainChunkCount: terrain.chunks.size,
      weatherCloudCount: weather.cloudBits.length,
      airfieldColliderCount: airfield.colliders.length,
      airstripColliderCount: airstrip.colliders.length,
      preflightArmed: staged.preflightArmed,
      groundKitStowed: staged.groundKitStowed,
      louAboard: staged.louAboard,
      aircraftPosition: staged.aircraftPosition,
      stovePosition: staged.stovePosition,
      landmarkCount: Object.keys(landmarks.built ?? {}).length,
    },
  );
}

async function buildSilverCaseState(descriptor, THREE) {
  const [{ buildSilverCaseRuntimeGeometry }, { applySilverCasePreviewPose, silverCasePreviewPose }] = await Promise.all([
    import('../src/silvercase/runtime-geometry.js'),
    import('../src/silvercase/preview.js'),
  ]);
  const scene = new THREE.Scene();
  const runtime = withSeededGeometryRandom(
    descriptor.id,
    () => buildSilverCaseRuntimeGeometry(scene),
  );
  const pose = silverCasePreviewPose(descriptor.checkpoint);
  const { apartment, car, cast } = runtime;
  const setDoorColliderOpen = (colliderBox, open) => {
    if (!open) return;
    const index = apartment.colliders.indexOf(colliderBox);
    if (index !== -1) apartment.colliders.splice(index, 1);
  };
  applySilverCasePreviewPose(descriptor.checkpoint, {
    ...runtime,
    setFrontDoorColliderOpen: setDoorColliderOpen,
    setBathroomDoorColliderOpen: setDoorColliderOpen,
    settleSeconds: 2,
  });

  if (cast.all.length !== 5 || new Set(cast.all).size !== 5) {
    throw new Error(`Silver Case geometry Adapter expected five distinct cast actors in ${descriptor.id}`);
  }
  const visibleWorld = car.root.visible ? 'car' : apartment.root.visible ? 'apartment' : 'none';
  if (visibleWorld !== pose.world || (car.root.visible && apartment.root.visible)) {
    throw new Error(`Silver Case geometry Adapter staged wrong world for ${descriptor.id}`);
  }
  const actorIds = ['ape', 'deke', 'chester', 'winston', 'pruitt'];
  const dead = actorIds.filter((id) => cast[id].alive === false).toSorted();
  if (dead.join(',') !== [...pose.dead].sort().join(',')) {
    throw new Error(`Silver Case geometry Adapter staged wrong deaths for ${descriptor.id}: ${dead}`);
  }
  if (cast.pruitt.group.visible !== pose.pruittVisible) {
    throw new Error(`Silver Case geometry Adapter staged wrong Pruitt visibility for ${descriptor.id}`);
  }

  const colliders = visibleWorld === 'car' ? [] : apartment.colliders;
  return result(descriptor, [{ label: `silvercase-${descriptor.checkpoint}`, root: scene }], colliders, {
    checkpoint: descriptor.checkpoint,
    visibleWorld,
    producerCounts: { apartmentWorlds: 1, carWorlds: 1, cast: cast.all.length },
    pose: {
      dead,
      pruittVisible: cast.pruitt.group.visible,
      ape: { ...objectPose(cast.ape.group), weaponDrawn: cast.ape.weaponDrawn },
      frontDoorYaw: apartment.doors.frontDoor.group.rotation.y,
      bathroomDoorYaw: apartment.doors.bathroomDoor.group.rotation.y,
      caseOccluded: apartment.props.caseOcclusion.visible,
    },
  });
}

async function buildSilverCaseCar(descriptor, THREE) {
  return buildSilverCaseState(descriptor, THREE);
}

async function buildSilverCaseApartment(descriptor, THREE) {
  return buildSilverCaseState(descriptor, THREE);
}

async function buildSquatchfather(descriptor, THREE) {
  const [{ buildSquatchfatherRuntimeGeometry }, { MirrorReflection }] = await Promise.all([
    import('../src/squatchfather/runtime-geometry.js'),
    import('../src/squatchfather/effects/MirrorReflection.js'),
  ]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.05, 200);
  scene.add(camera);
  const runtime = withSeededGeometryRandom(
    descriptor.id,
    () => buildSquatchfatherRuntimeGeometry(scene, camera, { renderer: null }),
  );
  /* STAGE THE LENS WHERE FRAME ONE PUTS IT, not where `new PerspectiveCamera`
   * leaves it.
   *
   * `buildSquatchfatherRuntimeGeometry` hands the camera to ProspectController,
   * which records the boot pose but never writes it to the camera -- in the
   * game, `CameraDirector.update()` does that on the first frame, and this
   * Adapter never runs a frame. So the camera sat at the world origin, and the
   * origin is INSIDE the restaurant's front door: the `frontDoor` collider is
   * x -0.70..0.70, y -0.50..4.00, z -0.12..0.02, measured off this build.
   * tools/verify-framing.mjs reported it as CAMERA_INSIDE_SOLID and was right
   * about the arithmetic and wrong about the scene -- it was measuring the
   * harness's default, not a shot anybody authored.
   *
   * This is `CameraDirector.update()` with the shake at zero: eye at
   * (-12.00, 1.76, -2.60) -- POS.playerStart with ProspectController's
   * EYE_STAND on top -- looking along PLAYER_START_YAW at pitch -0.03, which
   * is Tony on the pavement facing the restaurant door. Nothing in the build
   * moved; only the stand-in camera did. Measured after: the lens sits at
   * (-12.000, 1.760, -2.600) looking (0.999, -0.030, 0.020), and 0 of the 36
   * colliders contain that point -- the nearest, the kerbside block
   * `aabb-m18-m0p5-m4p25-m13p2-4-m2p15`, stands 1.20 m off. */
  camera.rotation.order = 'YXZ';
  camera.position.copy(runtime.prospect.eye);
  camera.rotation.y = runtime.prospect.yaw;
  camera.rotation.x = runtime.prospect.pitch;
  /* Object3D.raycast reads matrixWorld and never recomputes it, and nothing
   * updates it headlessly without a renderer (docs/ENGINE-TRAPS.md). */
  camera.updateMatrixWorld(true);

  const mirror = new MirrorReflection(scene, runtime.sceneState.props.mirror);
  const controllers = {
    prospect: runtime.prospect.fig.group,
    sal: runtime.sal.group,
    mcclawsky: runtime.mcclawsky.group,
  };
  for (const [id, root] of Object.entries(controllers)) {
    if (root.parent !== scene) throw new Error(`Squatchfather geometry Adapter omitted ${id}`);
  }
  const figureIds = Object.keys(runtime.sceneState.figures).toSorted();
  if (figureIds.length === 0 || figureIds.some((id) => !runtime.sceneState.figures[id]?.group)) {
    throw new Error('Squatchfather geometry Adapter did not publish its complete scene figure roster');
  }
  if (runtime.impacts.pool.length !== 8
    || runtime.bloodImpacts.wounds.pool.length !== 8
    || runtime.bloodImpacts.spatter.pool.length !== 8
    || runtime.deathBloodPools.meshes.length !== 2
    || scene.getObjectById(mirror.overlay.id) !== mirror.overlay) {
    throw new Error('Squatchfather geometry Adapter omitted effect-pool or mirror geometry');
  }

  return result(descriptor, [{ label: 'squatchfather-runtime', root: scene }], runtime.sceneState.colliders, {
    producerCounts: {
      controllers: Object.keys(controllers).length,
      sceneFigures: figureIds.length,
      impactPool: runtime.impacts.pool.length,
      bloodWoundPool: runtime.bloodImpacts.wounds.pool.length,
      bloodSpatterPool: runtime.bloodImpacts.spatter.pool.length,
      deathBloodPool: runtime.deathBloodPools.meshes.length,
      mirrorOverlays: 1,
    },
    figureIds,
    poses: Object.fromEntries(Object.entries(controllers).map(([id, root]) => [id, objectPose(root)])),
  });
}

function annotateCartelPalaceGeometry(root, colliders) {
  // Rotated/sloped roof bounding boxes cover occupied interior air even when
  // their triangles do not; physical roof collision remains in the collider layer.
  for (const name of ['clay-tile-roof', 'guardhouse-tile-roof']) {
    annotateNamedSceneObjects(root, name, { overlap: false });
  }
  for (const name of [
    'palace-surrounding-land', 'dirt-service-road', 'tire-rut',
    'courtyard-fountain', 'courtyard-paving', 'courtyard-processional-tile',
    'reflecting-pool', 'pool-coping', 'estate-tile-floor',
  ]) {
    annotateNamedSceneObjects(root, name, {
      assemblyId: `cartel-palace:structural:${name}`,
      structural: true,
    });
  }
  annotateNamedSceneObjects(root, 'estate-interior-ceilings', { structural: true });
  for (const [index, cypress] of namedSceneObjects(root, 'cypress').entries()) {
    setGeometryGateMetadata(cypress, { assemblyId: `cartel-palace:cypress:${index}` });
  }
  for (const name of [
    'mark-office-refinement',
    'guest-suite-refinement',
    'security-room-refinement',
    'portrait-gallery-refinement',
    'final-dining-refinement',
  ]) {
    annotateNamedSceneObjects(root, name, { assemblyId: `cartel-palace:${name}` });
  }

  /* Rugs and the security floor field are finish layers. Furniture feet are
   * deliberately planted through their shallow boxes, so they are not useful
   * interpenetration participants even though they still render normally.
   *
   * The 2026-08-20 scene pass laid two more of them and applied a third kind.
   * `entry-detail.runner` is the foyer runner with its two brass border
   * strips, and it is walked on by everything the pass put in that hall --
   * the watch chair's post, the cleaning cart's wheels, the wet-floor sign,
   * the planter, the bin, and the seated guard's own shin. `service-case-
   * label` is the paper stuck to the front of each liquor crate in the
   * service corridor: an applied label is the same thing as a rug, a finish
   * on a surface rather than an object in the room. Neither was listed here,
   * because the Adapter threw before the gate could see either of them (see
   * the entrance-portal note below), so twenty-six findings against a floor
   * and some labels were sitting on top of the palace's real ones. */
  for (const name of [
    'office-detail.rug', 'guest-suite-detail.rug', 'security-detail.floor-field', 'final-dining-rug',
    'entry-detail.runner', 'entry-detail.runner-border', 'service-case-label',
  ]) {
    annotateNamedSceneObjects(root, name, { overlap: false });
  }

  /* One loaded shelving run down the service corridor's east wall, authored
   * as one group: three bays of steel plates carried on posts that stand
   * INSIDE the plate footprint, with the house's supply crates on them. The
   * plate-through-post key is how the unit is built, not two objects that
   * collided, so the run owns itself. */
  annotateNamedSceneObjects(root, 'service-corridor-detail.shelving', {
    assemblyId: 'cartel-palace:service-shelving',
  });

  for (const [index, lantern] of namedSceneObjects(root, 'courtyard-wall-lantern').entries()) {
    setGeometryGateMetadata(lantern, {
      assemblyId: `cartel-palace:courtyard-wall-lantern:${index}`,
    });
  }

  // The bed shell, linen and refinement pieces form one authored bed assembly
  // (headboard/footboard/blanket included), while the facade cornice is fitted
  // directly into the two front wall sections.
  for (const name of ['guest-suite-bed', 'guest-suite-linen']) {
    annotateNamedSceneObjects(root, name, { assemblyId: 'cartel-palace:guest-suite-refinement' });
  }
  for (const [index, palm] of namedSceneObjects(root, 'date-palm').entries()) {
    setGeometryGateMetadata(palm, {
      assemblyId: `cartel-palace:date-palm:${index}`,
      fixedSupportAnchor: true,
    });
  }
  for (const name of [
    'estate-facade-cornice',
    'estate-facade-bay',
    'estate-front-west',
    'estate-front-east',
  ]) {
    annotateNamedSceneObjects(root, name, { assemblyId: 'cartel-palace:estate-facade' });
  }
  /**
   * THE FRONT DOOR AND THE ARCH IT HANGS IN ARE ONE INSTALLATION.
   *
   * This used to list three names -- 'carved-arch-crown', 'carved-arch-pillar'
   * and 'estate-service-door' -- which were the two jambs, the half-torus
   * crown and the leaf of the old entrance. That entrance is gone: the
   * 2026-08-20 playtest note in src/cartel-palace/world.js ("front door clips
   * through the decorative ring/arch", "build out the top of the ring so the
   * entrance is architecturally complete instead of a floating trim piece")
   * was answered by rebuilding it as a portal with a real section -- header,
   * step, threshold, jambs, imposts, a segmental ring, keystone, tympanum,
   * monogram and the leaf -- under one authored group, `estate-entrance-
   * portal`. The three old names ceased to exist, `namedSceneObjects` throws
   * on a name it cannot find, and that throw took the whole Cartel Palace
   * Adapter down with it: the smoke build, both checkpoint policy tests and
   * `verify-geometry --scene cartel-palace:approach` were all failing on this
   * one stale list rather than on anything wrong with the palace.
   *
   * Annotating the GROUP instead of its parts is the fix and also the
   * anti-rot shape. assemblyId is inherited down the graph (see
   * `inheritedMetadataValue` in ./geometry-collect.mjs), so every piece of
   * the portal -- including the ones the next art pass adds, and whatever
   * the pieces end up called -- is owned by the installation it was authored
   * into, and the leaf can sit in its reveal without the gate reading a
   * fitted door as a door clipping an arch. The id string is unchanged, so
   * the `estate-service-door` collider below still joins the same assembly.
   */
  annotateNamedSceneObjects(root, 'estate-entrance-portal', {
    assemblyId: 'cartel-palace:estate-service-portal',
  });

  // Gate leaves, hinge details, piers and the flanking wall are one moving
  // installation. The open-state sweep still compares that assembly against
  // the guardhouse and every other independent compound object.
  for (const name of ['palace-perimeter', 'service-gate']) {
    annotateNamedSceneObjects(root, name, { assemblyId: 'cartel-palace:service-gate-installation' });
  }

  // Portraits are wall-mounted assemblies. Keep the office and gallery sets
  // owned by their exact fitted wall treatments, while retaining independent
  // owners for the other portraits so unrelated overlaps still fail.
  for (const portrait of namedSceneObjects(root, 'mark-family-portrait')) {
    const metadata = { checkWallEmbed: false };
    if (portrait.position.x < -17.5 && portrait.position.z > -15) {
      metadata.assemblyId = 'cartel-palace:mark-office-refinement';
    } else if (Math.abs(Math.abs(portrait.position.x) - 9.8) < 0.001) {
      metadata.assemblyId = 'cartel-palace:portrait-gallery-refinement';
    }
    setGeometryGateMetadata(portrait, metadata);
  }

  // normalizeSceneColliders gives linked solids a collider owner. Declare the
  // same authored owner on these colliders so that normalization cannot split
  // a fitted visual assembly back into transient per-solid owners.
  const perimeterColliderNames = new Set([
    'west-compound-wall', 'east-compound-wall',
    'rear-compound-wall-west', 'rear-compound-wall-east',
    'front-compound-wall-west', 'front-compound-wall-east',
    'service-gate',
  ]);
  for (const collider of colliders) {
    let assemblyId = null;
    if (collider.name === 'guest-suite-bed') assemblyId = 'cartel-palace:guest-suite-refinement';
    else if (collider.name === 'estate-service-door') {
      assemblyId = 'cartel-palace:estate-service-portal';
    } else if (collider.name === 'estate-front-west' || collider.name === 'estate-front-east') {
      assemblyId = 'cartel-palace:estate-facade';
    } else if (perimeterColliderNames.has(collider.name)) {
      assemblyId = 'cartel-palace:service-gate-installation';
    }
    if (!assemblyId) continue;
    collider.userData ??= {};
    collider.userData.geometryGate = { ...(collider.userData.geometryGate ?? {}), assemblyId };
  }
}

/**
 * WHO THE PALACE'S COMBAT CAST IS, checked by composition rather than by count.
 *
 * This used to demand `cast.all.length === 10`, which was eight guard posts
 * plus Mark and Sauce on the day it was written. The 2026-08-20 owner playtest
 * pass added a ninth post -- `entry-watch`, the guard seated at the computer
 * facing the front door (see PALACE_GUARD_POSTS in src/cartel-palace/cast.js)
 * -- and eleven bodies threw against a hard ten, taking the whole Adapter,
 * both checkpoint policy tests and `verify-geometry` down with it. The palace
 * had gained a man, which is the direction this gate should never punish.
 *
 * What it is really for is that EVERY BODY IN THE FIGHT IS A DISTINCT,
 * IDENTIFIED ASSEMBLY -- no anonymous root, no two people sharing an id, and
 * no member of `all` that is not one of the people the scene actually built.
 * So the shape is asserted instead of the size: `all` is the guard roster plus
 * the two named targets, exactly, and each of them is annotated once. Adding a
 * tenth post needs no edit here; losing Mark, duplicating an id or smuggling
 * an unlisted body into `all` still fails.
 */
function annotatePalaceCast(cast) {
  /* Since 2026-08-25 the roster is the guards, the two named targets, AND the
   * wave Mark calls when his plates come off -- four men who exist from the
   * first frame, parked inactive and invisible behind the dining room's two
   * openings. They are in `all` because everything that makes a Combatant
   * work (the perception runtimes, the impact registrations, the checkpoint
   * snapshot, the separation pass) is built once from `all` at construction,
   * so a man spawned later would be a man none of that knows about. */
  const roster = [...(cast?.guards ?? []), cast?.mark, cast?.sauce, ...(cast?.wave ?? [])];
  if (!Array.isArray(cast?.guards) || cast.guards.length === 0 || !cast?.mark || !cast?.sauce) {
    throw new Error('Cartel Palace Adapter expected a guard roster plus Mark and Sauce');
  }
  if (!Array.isArray(cast?.all)
    || cast.all.length !== roster.length
    || !roster.every((member) => cast.all.includes(member))) {
    throw new Error(`Cartel Palace Adapter expected ${roster.length} cast members `
      + `(${cast.guards.length} guards, Mark, Sauce and ${cast?.wave?.length ?? 0} reprisal); `
      + `found ${cast?.all?.length ?? 'none'}`);
  }
  const ids = new Set();
  for (const member of cast.all) {
    if (!member?.id || !member.root?.traverse || ids.has(member.id)) {
      throw new Error(`Cartel Palace cast has an invalid or duplicate geometry identity: ${member?.id}`);
    }
    ids.add(member.id);
    setGeometryGateMetadata(member.root, { assemblyId: `cartel-palace-cast:${member.id}` });
    /* A FOREARM IS CARRIED BY AN ARM, NOT BY THE FLOOR.
     *
     * The gate splits an assembly into CONNECTED components before working
     * out what holds each one up, and a bent elbow separates the forearm's
     * boxes from the upper arm's. On the entry watch — the one guard in this
     * scene who is SEATED, with his arms up at a keyboard — that leaves the
     * forearm a component of its own with nothing beneath it at all, reported
     * as an "elbow support envelope" floating an unbounded distance. It is a
     * check with no concept of skeletons, not a man with a detached arm.
     *
     * `fixedSupportAnchor` is the gate's own word for "held up by something I
     * do not model", and it applies PER COMPONENT — so this silences the arm
     * and leaves the check that matters intact: the component with the feet
     * in it is still tested, and a guard hovering over his own floor still
     * fails.
     *
     * Done HERE rather than in `src/bing/cast.js`, which builds every person
     * in the game. Marking it in the shared rig worked and then drifted the
     * recorded suppression counts of a scene that has nothing to do with this
     * one — a cross-scene ripple for a cosmetic finding is a bad trade. */
    member.root.traverse((node) => {
      if (node.isGroup && node.name === 'forearm') {
        setGeometryGateMetadata(node, { fixedSupportAnchor: true });
      }
    });
  }
}

async function buildCartelPalace(descriptor, THREE) {
  const [{ buildCartelPalace: build }, { buildPalaceCast }, { stagePalaceCheckpointGeometry }] = await Promise.all([
    import('../src/cartel-palace/world.js'),
    import('../src/cartel-palace/cast.js'),
    import('../src/cartel-palace/preview.js'),
  ]);
  const scene = new THREE.Scene();
  const palace = build(scene);
  const castRoot = new THREE.Group();
  castRoot.name = 'cartel-palace.cast';
  scene.add(castRoot);
  const cast = buildPalaceCast(castRoot);
  const stage = stagePalaceCheckpointGeometry(descriptor.checkpoint, { palace, cast });
  annotateCartelPalaceGeometry(palace.root, palace.colliders);
  annotatePalaceCast(cast);
  return result(descriptor, [{ label: 'cartel-palace', root: scene }], palace.colliders, {
    checkpoint: descriptor.checkpoint,
    producers: ['buildCartelPalace', 'buildPalaceCast', 'stagePalaceCheckpointGeometry'],
    castCount: cast.all.length,
    guardCount: cast.guards.length,
    ...stage,
  });
}

async function buildMansionSiege(descriptor, THREE) {
  const base = await buildMansionBase(descriptor, THREE);
  const [
    { MansionDamageState },
    { buildSiegeNight },
    { buildSiegeDressing },
    { buildSiegeGlass },
    { createAttackerPool },
    { buildSiegeEnsemble },
    { SiegeMission, B, CHECKPOINT_FIELDS },
    { ENCOUNTERS },
  ] = await Promise.all([
    import('../src/mansion/siege/state.js'),
    import('../src/mansion/siege/night.js'),
    import('../src/mansion/siege/dressing.js'),
    import('../src/mansion/siege/glass.js'),
    import('../src/mansion/siege/attackers.js'),
    import('../src/mansion/siege/ensemble.js'),
    import('../src/mansion/siege/mission.js'),
    import('../src/mansion/siege/waves.js'),
  ]);
  const damage = new MansionDamageState({ colliders: base.colliders, state: 'clean' });
  const night = buildSiegeNight({ damage });
  const dressing = buildSiegeDressing({ damage, grounds: base.grounds, interior: base.interior });
  const glass = buildSiegeGlass({ damage, grounds: base.grounds, interior: base.interior });
  base.scene.add(night.root, dressing.root, glass.root);

  const armoryMount = await mountMansionGeometryArmory(base, descriptor, THREE);
  const attackers = createAttackerPool({ scene: base.scene, damage });
  const ensemble = buildSiegeEnsemble({
    scene: base.scene,
    damage,
    groundAt: (x, z, y) => (
      base.interior.floorAt(x, z, y)
      ?? base.grounds.props?.siegeBreachGroundAt?.(x, z)
      ?? 0
    ),
  });
  if (!attackers?.root?.traverse || !ensemble?.root?.traverse || !(ensemble.members instanceof Map)) {
    throw new Error(`Mansion Siege geometry Adapter failed to mount actors for ${descriptor.id}`);
  }

  const placedEncounters = new Set();
  const placeEncounter = (id) => {
    if (placedEncounters.has(id)) return;
    const encounter = ENCOUNTERS[id];
    if (!encounter?.members?.length) {
      throw new Error(`Mansion Siege geometry Adapter cannot place encounter ${id}`);
    }
    placedEncounters.add(id);
    for (const order of encounter.members) attackers.spawn(order, { silent: true });
  };

  let mission = null;
  if (descriptor.checkpoint) {
    mission = new SiegeMission({
      damage,
      onBeat: (beat) => {
        ensemble.stage(beat);
        if (beat === B.WAKE) placeEncounter('corridor');
        if (beat === B.ARM) placeEncounter('foyer');
      },
      onSpawn: (order) => attackers.spawn(order, { silent: true }),
    });
    for (const field of CHECKPOINT_FIELDS) {
      mission.provide(field, { capture: () => null, restore: noop });
    }
    mission.start(B.WAKE);
    if (descriptor.checkpoint !== 'wake') {
      if (!mission.wokeUp() || !mission.enteredArmory() || !mission.weaponTaken('carbine')) {
        throw new Error(`Mansion Siege geometry Adapter could not reach armed in ${descriptor.id}`);
      }
    }
    if (['briefed', 'wave_one'].includes(descriptor.checkpoint)) {
      if (!mission.enteredOffice() || !mission.briefingEnded()) {
        throw new Error(`Mansion Siege geometry Adapter could not reach briefed in ${descriptor.id}`);
      }
    }
    if (descriptor.checkpoint === 'wave_one') {
      if (!mission.sayHello()) {
        throw new Error(`Mansion Siege geometry Adapter could not start wave one in ${descriptor.id}`);
      }
      for (let guard = 0; guard < 400 && mission.beat === B.WAVE_ONE; guard += 1) {
        for (const attackerId of [...mission.waves.one.standing]) mission.noteDown(attackerId);
        mission.update(0.5);
      }
      if (mission.beat !== B.LULL) {
        throw new Error(`Mansion Siege geometry Adapter could not clear wave one in ${descriptor.id}`);
      }
      attackers.despawnAll();
    } else if (!['wake', 'armed', 'briefed'].includes(descriptor.checkpoint)) {
      throw new Error(`Mansion Siege geometry Adapter does not know checkpoint ${descriptor.checkpoint}`);
    }
  } else {
    const beatByDamageState = {
      clean: B.WAKE,
      alert: B.WAKE,
      under_attack: B.WAKE,
      damaged: B.AFTERMATH,
      post_battle: B.TO_SASOLE,
      repaired: B.COMPLETE,
    };
    const beat = beatByDamageState[descriptor.damageState];
    if (!beat) {
      throw new Error(`Mansion Siege geometry Adapter does not know damage state ${descriptor.damageState}`);
    }
    ensemble.stage(beat);
    placeEncounter('corridor');
  }

  for (const [id, member] of ensemble.members) {
    const actorRoot = member?.figure?.root;
    if (!id || !actorRoot?.traverse) {
      throw new Error(`Mansion Siege geometry Adapter has an invalid ensemble member ${id}`);
    }
    actorRoot.name = `mansion-siege-ensemble-${id}`;
    setGeometryGateMetadata(actorRoot, { assemblyId: `mansion-siege-ensemble:${id}` });
  }
  for (const entry of attackers.all()) {
    if (!entry?.id || !entry.root?.traverse) {
      throw new Error(`Mansion Siege geometry Adapter has an invalid attacker in ${descriptor.id}`);
    }
    entry.root.name = `mansion-siege-attacker-${entry.id}`;
    setGeometryGateMetadata(entry.root, { assemblyId: `mansion-siege-attacker:${entry.id}` });
  }
  if (ensemble.members.size === 0 || attackers.all().length === 0) {
    throw new Error(`Mansion Siege geometry Adapter produced empty actor geometry in ${descriptor.id}`);
  }

  damage.apply(descriptor.damageState);
  // A preview checkpoint is a settled authored state, not the first frame of
  // the walk from the preceding beat. Runtime stage() deliberately leaves
  // same-floor actors walking toward their next post; the headless Adapter
  // has no render loop, so finish that walk before measuring geometry.
  const settledPosts = {};
  for (const [id, member] of ensemble.members) {
    if (!member?.root?.position || !member?.goal || !member?.lookAt) {
      throw new Error(`Mansion Siege geometry Adapter cannot settle ensemble member ${id}`);
    }
    if (!member.staged || !member.post || member.root.visible === false) continue;
    member.root.position.copy(member.goal);
    member.root.rotation.y = Math.atan2(
      member.lookAt.x - member.goal.x,
      member.lookAt.y - member.goal.z,
    );
    settledPosts[id] = {
      x: member.goal.x,
      y: member.goal.y,
      z: member.goal.z,
    };
  }

  base.scene.updateMatrixWorld(true);
  return result(descriptor, [{ label: 'mansion-siege', root: base.scene }], base.colliders, {
    damageState: descriptor.damageState,
    checkpoint: descriptor.checkpoint ?? null,
    liveOverlay: damage.liveNames(),
    armory: armoryMount.evidence,
    ensemble: {
      memberCount: ensemble.members.size,
      beat: ensemble.beat,
      settledPosts,
    },
    attackers: {
      builtCount: attackers.all().length,
      activeCount: attackers.all().filter((entry) => entry.active).length,
      ids: attackers.all().map((entry) => entry.id).toSorted(),
    },
    missionBeat: mission?.beat ?? null,
  });
}

/**
 * THE SPECIAL MEETING, the kerb: the block outside the flat, and the car.
 *
 * Straight through src/specialmeeting/runtime-geometry.js, which the scene's
 * author wrote for this gate and nothing else -- construction and authored
 * pose, no WebGL, no audio, no campaign boot. The whole Scene is handed over
 * as one root rather than the module's own two, the same way the Silver Case
 * Adapter does, so the night rig and anything else the builder parents to the
 * Scene is audited too rather than only the two groups it names.
 */
/**
 * INITIATION NIGHT, the cabin ceremony.
 *
 * This scene carried a frozen waiver whose stated reason was that it "has no
 * extractable headless builder". That was true of the old Initiation, whose
 * geometry was interleaved with top-level WebGL boot code. It stopped being
 * true the day the ceremony was written: `buildInitiationCabinSite()` takes a
 * seed and three flags and hands back a root, its colliders and its lights,
 * with no page and no renderer anywhere near it. The waiver outlived its own
 * reason by the length of a rewrite, which is exactly the way a doc-shaped
 * claim about state goes stale.
 *
 * Two states, because the site is two places that are 36 m of unlit trail
 * apart and the scene is never looking at both: the clearing where the line
 * stands, and the cabin at the end of the walk. Both keep the woods, because
 * everything here is float-checked against the ground and a build with no
 * floor under it reports every car and every wall as hovering.
 */
async function buildInitiation(descriptor, THREE) {
  const { buildInitiationCabinSite } = await import('../src/initiation/cabin/index.js');
  /* THE SHOT LIST, published so the beat framing gate has something to check.
   * `src/initiation/framing.js` holds the arithmetic of every camera mode in
   * this scene and `main.js`'s CAMERA_SHOTS calls straight through to it, so
   * what the gate reads here is the same camera the player looks through
   * rather than a description of it that can go stale. See
   * docs/FRAMING-GATE.md: act five of this scene played off screen for its
   * whole life because nothing outside the running page could read a shot. */
  const { initiationFramingBeats } = await import('../src/initiation/framing.js');
  const cabin = descriptor.state === 'cabin';
  const built = withSeededGeometryRandom(descriptor.id, () => buildInitiationCabinSite({
    woods: true,
    clearing: !cabin,
    cabin,
    audio: null,
  }));
  /* THE CAST, which this adapter mounted for nobody until now.
   *
   * It built the site and stopped, so both gates read the two Initiation
   * states as a clean pass with an empty cast -- fifteen men in a clearing
   * that no check had ever looked at, in the scene whose fifth act shipped
   * broken because nothing outside the page could reach it. `cast.js` is the
   * same builder `src/initiation/main.js` uses, so what is measured here is
   * the Circle the player walks into and not a description of it. */
  const { buildInitiationCircle } = await import('../src/initiation/cast.js');
  const circle = withSeededGeometryRandom(`${descriptor.id}:cast`, () => buildInitiationCircle());
  for (const member of circle.members) {
    /* One assembly per body, the same way the Enola names its crew. Without
     * it every arm inside its own shoulder is an interpenetration and fifteen
     * blocky men produce seven hundred of them -- the gate auditing a rig
     * against itself rather than the man against the room. */
    setGeometryGateMetadata(member.sq.group, { assemblyId: `initiation-circle:${member.key}` });
    built.root.add(member.sq.group);
  }
  built.root.updateMatrixWorld(true);
  if (!built.colliders.length) {
    throw new Error(`Initiation Adapter mounted no colliders for ${descriptor.id}`);
  }
  return result(descriptor, [{ label: `initiation-${descriptor.state}`, root: built.root }],
    built.colliders, {
      state: descriptor.state,
      lights: built.lights.length,
      framingBeats: initiationFramingBeats(descriptor.state),
    });
}

/**
 * The Special Meeting's four bodies, stamped so both gates can see them.
 *
 * The staging gate needs nothing here -- `Npc` already carries the shared actor
 * marker (docs/STAGING-GATE.md), which is the whole reason mounting the cast is
 * enough to make these three states checkable at all. The geometry gate needs
 * two things, and both of them are the same two the mansion's cast needed:
 *
 * A MAN IN A CAR IS PART OF THE CAR. The gate reports overlaps BETWEEN
 * assemblies, and a rig folded into a seat is inside one by construction:
 * measured on the built kerb, Seff's thighs are 0.124 m into the driver's
 * cushion, Numbskull's shoulder 0.110 m into the rear glass, and Kittenboss
 * 0.090 m into the boot tail. None of those is a defect anybody can fix by
 * moving somebody -- they are what a two-metre Sasquatch in a 1970s Lincoln
 * looks like -- and none of them is a fact about the SCENE. So a rider joins
 * the car's own assembly, exactly as `mountMansionGeometryCast` puts a man in
 * a theatre recliner into that recliner's, and the check that still matters --
 * the car against the street -- is untouched.
 *
 * AND HE IS NOT HELD UP BY THE FLOOR. Same reason: his weight is on the seat
 * this build does not model as support. Everybody on their FEET keeps the
 * support check, because that is the check that caught the cast standing 32 m
 * under the clearing floor in the first place.
 */
function annotateSpecialMeetingCast(cast, descriptor, { carAssemblyId = null } = {}) {
  const bodies = cast.all.filter((npc) => npc.group.visible);
  if (bodies.length !== cast.all.length) {
    throw new Error(
      `Special Meeting Adapter left ${cast.all.length - bodies.length} of the cast unplaced in ${descriptor.id}`,
    );
  }
  for (const npc of bodies) {
    if (!npc.group?.traverse) throw new Error(`Special Meeting cast member has no body in ${descriptor.id}`);
    const riding = npc.seated === true;
    if (riding && !carAssemblyId) {
      throw new Error(`Special Meeting Adapter has a rider and no car assembly in ${descriptor.id}`);
    }
    setGeometryAssembly(npc.group, riding ? carAssemblyId : `specialmeeting-cast:${npc.characterId}`);
    npc.group.traverse((object) => {
      /* A FOREARM IS CARRIED BY AN ARM, NOT BY THE FLOOR. The gate splits an
       * assembly into connected components before working out what holds each
       * one up, and a bent elbow separates the forearm's boxes from the upper
       * arm's, leaving a component with nothing under it at all -- reported as
       * an "elbow support envelope" floating an unbounded distance. Same
       * finding, same one-line answer as `annotatePalaceCast`, whose comment
       * has the long version and the reason it is done in the Adapter rather
       * than in the shared rig. */
      if (object.isGroup && object.name === 'forearm') {
        setGeometryGateMetadata(object, { fixedSupportAnchor: true });
      }
    });
  }
  return bodies.length;
}

async function buildSpecialMeetingKerb(descriptor, THREE) {
  const [
    { SPECIAL_MEETING_GEOMETRY_STATES, buildSpecialMeetingRuntimeGeometry },
    { SEDAN_STAGING, SEDAN_STOP, groundAt },
    { buildSpecialMeetingCast },
  ] = await Promise.all([
    import('../src/specialmeeting/runtime-geometry.js'),
    import('../src/specialmeeting/layout.js'),
    import('../src/specialmeeting/cast.js'),
  ]);
  const blockState = descriptor.blockState;
  if (!SPECIAL_MEETING_GEOMETRY_STATES.includes(blockState)) {
    throw new Error(
      `Special Meeting kerb Adapter has no authored block state "${blockState}" for ${descriptor.id}`,
    );
  }

  const scene = new THREE.Scene();
  /* One seeded boundary around the geometry AND the cast: `Npc` takes a draw
   * per body for its idle phase, so a cast built outside the boundary would
   * pose four rigs differently on every run and report it as scene drift. */
  const { runtime, cast } = withSeededGeometryRandom(descriptor.id, () => {
    const built = buildSpecialMeetingRuntimeGeometry(scene, { renderer: null, state: blockState });
    const people = buildSpecialMeetingCast(scene, {
      sedan: built.sedan,
      colliders: [...built.colliders],
      groundAt,
    });
    /* THE ARRANGEMENT EACH STATE ACTUALLY HAS.
     *
     * `waiting` is the ten seconds before anything happens: the car is a
     * hundred metres away up the cross street with all four of them in it, one
     * of them in the boot, which is exactly what `main.js` does at boot.
     *
     * `arrived` is SM-110, the state the player spends the whole hub in: Seff
     * at the wheel leaning across, Lag out of the front and stepped clear of
     * it, Numbskull holding that door open, and Kittenboss still in the boot
     * because nobody has mentioned her yet.
     *
     * EXPECTED, AND NOT A DEFECT: `npm run verify:staging` reports every rider
     * as ACTOR_INSIDE_SOLID, and the ones whose eyes are under the roofline as
     * FACING_INTO_SOLID at zero metres. The solid is the car. Its world
     * collider is one box from the road to 2.28 m with the cabin inside it --
     * as it has to be, because it is the wall the player walks round -- and a
     * man in the driver's seat has his hips 1.04 m up, inside it by
     * construction. The only way to silence those four findings is to take the
     * car's collider out of the audited set, which would stop the geometry
     * gate seeing the one moving wall in the scene. Nobody standing on the
     * pavement reports either finding, which is the half that means
     * something. */
    people.boardForArrival();
    if (blockState === 'arrived') {
      people.disembarkForPickup();
      people.holdTheFrontDoor();
    }
    return { runtime: built, cast: people };
  });
  const { block, sedan } = runtime;
  /* Read off the car rather than restated here: a rider joins whatever
   * assembly the sedan declares, so renaming the car cannot silently split a
   * man from the seat he is sitting in. */
  const castCount = annotateSpecialMeetingCast(cast, descriptor, {
    carAssemblyId: sedan.group.userData?.geometryGate?.assemblyId ?? null,
  });
  for (const [label, root] of [['block', block.group], ['sedan', sedan.group]]) {
    if (root?.parent !== scene) {
      throw new Error(`Special Meeting kerb Adapter did not mount the ${label} in ${descriptor.id}`);
    }
  }
  if (runtime.colliders.length === 0) {
    throw new Error(`Special Meeting kerb Adapter produced no colliders for ${descriptor.id}`);
  }

  /* The car is the whole difference between the two states, so prove it moved
   * rather than trusting the state name. Checked tight rather than loosely:
   * `placeAt` writes x and z straight onto the vehicle and `syncMesh` copies
   * them straight onto the group origin, so the only slack that belongs here
   * is float noise. A centimetre. If this ever needs widening, the reason is
   * that the car stopped being placed by its origin and that is worth
   * noticing rather than absorbing. */
  const parked = blockState === 'arrived' ? SEDAN_STOP : SEDAN_STAGING;
  const away = Math.hypot(sedan.group.position.x - parked.x, sedan.group.position.z - parked.z);
  if (!(away < 0.01)) {
    throw new Error(
      `Special Meeting ${blockState} Adapter left the car ${away.toFixed(3)} m from its authored spot`,
    );
  }

  return result(descriptor, [{ label: `specialmeeting-${descriptor.state}`, root: scene }], runtime.colliders, {
    blockState,
    producerCounts: {
      blocks: 1, sedans: 1, cast: castCount, colliders: runtime.colliders.length,
    },
    seating: cast.seatedAs(),
    sedan: { ...objectPose(sedan.group), trunkOpen: blockState === 'arrived' },
    anchorIds: Object.keys(block.anchors ?? {}).toSorted(),
  });
}

/**
 * THE SPECIAL MEETING, the spur: the night forest road, driven to the end.
 *
 * The forest subtree is deliberately headless-safe (its own header says so --
 * deterministic, no audio, no DOM beyond canvas textures, no campaign), so it
 * is built the way the page builds it and then DRIVEN, rather than teleported.
 *
 * Driven, because the spur is not a place you can place a car at: the terrain
 * streams in around wherever the car is, the clearing is 992 metres away, and
 * the sprung suspension in ForestDrive settles the body onto the ground over
 * several frames instead of snapping. Setting `drive.distance` and taking one
 * step leaves the Lincoln twenty-eight metres under the clearing floor, which
 * would be audited as a scene full of floating trees over a buried car. The
 * whole drive at a fixed 30 Hz step is about sixteen seconds of wall clock in
 * the worker -- well inside GEOMETRY_WORKER_TIMEOUT_MS -- and it is the only
 * arrangement that is genuinely the one the player is looking at.
 *
 * The two scripted stops on the way (the chain, and the arrival itself) halt
 * the drive until something releases them. In the played scene that something
 * is a line of dialogue finishing; here the chain is released immediately,
 * because the geometry does not care how long Lag took to unhook it, and the
 * arrival is the state being built and so is left standing.
 */
/**
 * The block's door names to the forest's, and a boot anchor for a car with no
 * boot.
 *
 * `src/specialmeeting/forest/sedan-adapter.js` owns this mapping in the other
 * direction, for the campaign, where the car at the spur IS the block's Lincoln
 * and the cast reads its own anchors off it. This harness drives the forest's
 * fallback car -- which the adapter's header calls the right one for a headless
 * build and the wrong one for the campaign -- so the four bodies it stands
 * round that car need the same anchors under the forest's spelling.
 */
const SPUR_DOOR_NAMES = Object.freeze({
  driver: 'driver',
  front_passenger: 'frontPassenger',
  rear_left: 'rearLeft',
  rear_right: 'rearRight',
});

/** How far behind the bumper somebody stands to open the boot, in metres. */
const SPUR_BOOT_STANDOFF_M = 0.75;

async function buildSpecialMeetingSpur(descriptor, THREE) {
  const [{ createNightForestRoad }, { buildSpecialMeetingCast }] = await Promise.all([
    import('../src/specialmeeting/forest/index.js'),
    import('../src/specialmeeting/cast.js'),
  ]);
  const scene = new THREE.Scene();
  const colliders = [];
  const reached = [];

  let cast = null;

  /* One seeded boundary around the build AND the drive AND the cast: the
   * terrain streams new chunks the whole way down the road, so the trees that
   * exist at the spur are decided by draws taken during the drive rather than
   * at construction, and `Npc` takes a draw per body for its idle phase. */
  const forest = withSeededGeometryRandom(descriptor.id, () => {
    const built = createNightForestRoad({
      scene,
      renderer: null,
      colliders,
      shadows: false,
      onNode: (id) => reached.push(id),
    });
    built.start();
    const STEP = 1 / 30;
    // 8000 steps is 266 authored seconds against a 105-second drive: a ceiling
    // that can only be reached by a drive that has stopped making progress.
    for (let step = 0; step < 8000 && !built.drive.arrived; step += 1) {
      built.update(STEP);
      if (built.drive.waitingAt && built.drive.waitingAt !== 'arrival') built.resume();
    }
    built.killEngine();
    built.killLights();
    built.update(STEP);

    /* THE ARRANGEMENT THIS STATE ACTUALLY HAS: SM-400 onwards. The engine is
     * off, the three of them have got out at their own doors, and Kittenboss
     * has climbed out of the boot under her own power and is standing behind
     * the car. That is the whole of Act Four and it is the only part of this
     * scene the player watches from outside a vehicle.
     *
     * Placed on the CLEARING FLOOR rather than at y = 0: measured on this
     * build, the floor here is 32.6 m above datum. */
    const carGroup = built.car.group;
    const standIn = {
      group: carGroup,
      facingYaw: () => carGroup.rotation.y - Math.PI / 2,
      doorWorld(id) {
        if (id === 'trunk') {
          return carGroup.localToWorld(
            new THREE.Vector3(-(built.car.length / 2 + SPUR_BOOT_STANDOFF_M), 0, 0),
          );
        }
        return built.car.exitWorld(SPUR_DOOR_NAMES[id] ?? id, new THREE.Vector3());
      },
      release() {},
    };
    cast = buildSpecialMeetingCast(scene, {
      sedan: standIn,
      colliders,
      groundAt: (x, z) => built.heightAt(x, z),
    });
    cast.getOut();
    cast.kittenbossOut();
    return built;
  });
  const castCount = annotateSpecialMeetingCast(cast, descriptor);

  if (!forest.drive.arrived) {
    throw new Error(
      `Special Meeting spur Adapter never reached the clearing (stopped at ${forest.drive.distance.toFixed(0)} m`
      + ` of ${forest.road.length().toFixed(0)} m, waiting on ${forest.drive.waitingAt ?? 'nothing'})`,
    );
  }
  const authoredNodes = forest.road.events.map((event) => event.id);
  if (reached.join(',') !== authoredNodes.join(',')) {
    throw new Error(
      `Special Meeting spur Adapter drove past ${reached.length} of ${authoredNodes.length} authored road nodes`,
    );
  }
  if (forest.group.parent !== scene || colliders.length === 0) {
    throw new Error(`Special Meeting spur Adapter mounted no world for ${descriptor.id}`);
  }

  /* The car has to be ON the clearing floor, not on the road it came in on and
   * not under the ground the terrain streamed in around it. `heightAt` is the
   * same field the trees and the trailhead are placed against.
   *
   * Measured at 0.017 m on the authored drive, so 1.2 m is deliberate slack
   * rather than a fudged threshold: this is here to catch the failure mode
   * where the car is put at the spur without being driven there and ends up
   * twenty-eight metres under the floor, not to police the suspension. Do not
   * tighten it to the measured value -- the tolerance also has to survive the
   * clearing being re-cut on a slope. */
  const car = forest.car.group.position;
  const floor = forest.heightAt(car.x, car.z);
  if (!Number.isFinite(floor) || Math.abs(car.y - floor) > 1.2) {
    throw new Error(
      `Special Meeting spur Adapter parked the car ${(car.y - floor).toFixed(2)} m off the clearing floor`,
    );
  }

  const stats = forest.stats();
  return result(descriptor, [{ label: 'specialmeeting-spur', root: scene }], colliders, {
    producerCounts: {
      forests: 1,
      sedans: 1,
      cast: castCount,
      trees: stats.trees,
      terrainChunks: stats.chunks,
      colliders: colliders.length,
    },
    roadNodes: reached,
    roadLength: stats.roadLength,
    stage: stats.stage,
    car: objectPose(forest.car.group),
    trailhead: {
      x: forest.trailhead.x,
      y: forest.trailhead.y,
      z: forest.trailhead.z,
    },
  });
}

const BUILDERS = Object.freeze({
  apartment: buildApartment,
  cabin: buildCabin,
  'luxury-apartment': buildLuxuryApartment,
  bing: (descriptor, THREE) => buildBing(descriptor, THREE, false),
  'bing-party': (descriptor, THREE) => buildBing(descriptor, THREE, true),
  mansion: buildMansion,
  'silent-squatch': buildSilentSquatch,
  golf: buildGolf,
  silver: buildSilver,
  nowake: buildNoWake,
  enolasquatch: buildEnola,
  heist: buildHeist,
  motel: buildMotel,
  graveyard: buildGraveyardState,
  beefrun: buildBeefRun,
  'silvercase-car': buildSilverCaseCar,
  'silvercase-apartment': buildSilverCaseApartment,
  'specialmeeting-kerb': buildSpecialMeetingKerb,
  'specialmeeting-spur': buildSpecialMeetingSpur,
  squatchfather: buildSquatchfather,
  'cartel-palace': buildCartelPalace,
  'mansion-siege': buildMansionSiege,
  initiation: buildInitiation,
});

let geometryBuildTail = Promise.resolve();

/**
 * Serialize headless builds that temporarily install process-global browser or
 * random shims. Direct test callers commonly build several descriptors with
 * Promise.all; without one FIFO, those boundaries can restore each other's
 * globals and make a later descriptor depend on scheduling order.
 */
export function withExclusiveGeometryBuild(build) {
  if (typeof build !== 'function') throw new TypeError('Geometry build must be a function');
  const scheduled = geometryBuildTail.then(build);
  geometryBuildTail = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

/** Build exactly one registered state in the current worker process. */
export function buildGeometrySceneState(id) {
  return withExclusiveGeometryBuild(async () => {
    const descriptor = geometrySceneState(id);
    if (!descriptor) throw new Error(`Unknown geometry scene state: ${id}`);
    const THREE = await import('three');
    const collaborators = installHeadlessGlobals(THREE);
    const build = BUILDERS[descriptor.adapter];
    if (!build) throw new Error(`No geometry Adapter for ${descriptor.id} (${descriptor.adapter})`);
    const built = await build(descriptor, THREE, collaborators);
    for (const { root } of built.roots) root.updateMatrixWorld?.(true);
    return { ...built, THREE };
  });
}
