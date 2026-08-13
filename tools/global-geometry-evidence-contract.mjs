import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GLOBAL_GEOMETRY_EVIDENCE_SCHEMA = 'squatch-global-geometry-evidence/v1';

const CONTRACT_SOURCE_FILE = fileURLToPath(import.meta.url);
const TOOL_SOURCE_FILE = fileURLToPath(new URL('./capture-global-geometry-evidence.mjs', import.meta.url));
const SCREENSHOT_CONTRACT_SOURCE_FILE = fileURLToPath(
  new URL('./screenshot-artifact-contract.mjs', import.meta.url),
);
const DIRECTORY_TRANSACTION_SOURCE_FILE = fileURLToPath(
  new URL('./evidence-directory-transaction.mjs', import.meta.url),
);
const BOOTSTRAP_RUNNER_SOURCE_FILE = fileURLToPath(
  new URL('./run-global-geometry-evidence.mjs', import.meta.url),
);
const WORKSPACE_ROOT = path.resolve(
  process.env.GLOBAL_GEOMETRY_EVIDENCE_SOURCE_ROOT
    || fileURLToPath(new URL('../', import.meta.url)),
);
const MOTEL_RUNTIME_SURFACE_FILE = path.join(WORKSPACE_ROOT, 'src', 'motel', 'main.js');
const REQUIRED_SOURCE_FILES = Object.freeze([
  'silver.html', 'cartel-palace.html', 'mansion.html', 'nowake.html',
  'motel.html', 'beefrun.html', 'enolasquatch.html', 'bing.html',
  'src/silver/main.js', 'src/cartel-palace/main.js', 'src/mansion/main.js',
  'src/nowake/main.js', 'src/motel/main.js', 'src/beefrun/main.js',
  'src/enolasquatch/main.js', 'src/bing/router.js', 'src/bing/main.js',
  'src/silver/room.js', 'src/cartel-palace/world.js',
  'src/mansion/scenes/MansionInterior.js', 'src/nowake/world.js',
  'src/motel/level.js', 'src/beefrun/airstrip.js',
  'src/enolasquatch/scenes/EnolaSquatch.js', 'src/bing/club.js',
].sort());

const exactOwnership = (ownerIds, edgePairs) => {
  const dependentIds = edgePairs.map(([dependent]) => dependent);
  const distribution = Object.fromEntries(ownerIds.map((owner) => [owner, 0]));
  for (const [, owner] of edgePairs) distribution[owner] += 1;
  return Object.freeze({
    ownerIds: Object.freeze([...ownerIds]),
    dependentIds: Object.freeze([...dependentIds]),
    edges: Object.freeze(edgePairs.map(([dependent, owner]) => Object.freeze({ dependent, owner }))),
    distribution: Object.freeze(distribution),
  });
};

const SILVER_SHELF_RACK_ZS = Object.freeze([-13, -11, -8]);
const SILVER_SHELF_UPRIGHT_IDS = Object.freeze(SILVER_SHELF_RACK_ZS.flatMap((z) => (
  Array.from({ length: 4 }, (_, upright) => `silver-dry-store-shelving@${z}.upright${upright}`)
)));
const MANSION_COUCH_IDS = Object.freeze([
  'mansion-living-couch@-15.1,47.8',
  'mansion-living-couch@-12.5,45.3',
  'mansion-living-couch@-9.9,47.8',
]);
const MANSION_COUCH_FOOT_IDS = Object.freeze(MANSION_COUCH_IDS.flatMap((couch) => (
  Array.from({ length: 4 }, (_, foot) => `${couch}.foot${foot}`)
)));

const ENTRY_MODULE_BY_PAGE = Object.freeze({
  'silver.html': 'src/silver/main.js',
  'cartel-palace.html': 'src/cartel-palace/main.js',
  'mansion.html': 'src/mansion/main.js',
  'nowake.html': 'src/nowake/main.js',
  'motel.html': 'src/motel/main.js',
  'beefrun.html': 'src/beefrun/main.js',
  'enolasquatch.html': 'src/enolasquatch/main.js',
  'bing.html': 'src/bing/router.js',
});

const VISUAL_OWNER_IDS_BY_SHOT = Object.freeze({
  'silver-produce-crates': Object.freeze([
    'produce-crate@17.9,4.6', 'produce-crate@19.1,4.6',
  ]),
  'silver-east-banquettes': Object.freeze(
    [-3, 2.2, 7.4, 12.6, 17.8].map((z) => `silver-east-banquette@${z}`),
  ),
  'silver-dry-store-shelves': Object.freeze(
    SILVER_SHELF_RACK_ZS.map((z) => `silver-dry-store-shelving@${z}`),
  ),
  'cartel-dining-table': Object.freeze([
    'dining-table-runner-and-candles',
    ...Array.from({ length: 8 }, (_, setting) => `dining-place-setting.${setting}`),
  ]),
  'cartel-office-chair': Object.freeze(['office-detail.desk-chair']),
  'mansion-living-couches': MANSION_COUCH_IDS,
  'no-wake-neighbor-cleats': Object.freeze(
    ['port', 'starboard'].flatMap((side) => [1, 2].map((cleat) => (
      `detailed neighboring marina boat 1.neighbor cleat ${side} ${cleat}`
    ))),
  ),
  'motel-dining-chairs': Object.freeze([
    'motel-room12-dining-chair.0', 'motel-room12-dining-chair.1',
  ]),
  'motel-pool-loungers': Object.freeze(['west-lounge', 'east-lounge']),
  'motel-shipment-crates': Object.freeze(
    Array.from({ length: 5 }, (_, crate) => `motel-shipment-crate.${crate}`),
  ),
  'beefrun-shelter-furniture': Object.freeze(['shelter-bench', 'shelter-table']),
  'enola-cockpit-seats': Object.freeze(['pilot', 'copilot', 'navigator']),
  'bing-lou-chair': Object.freeze(['lou-chair']),
});

const shot = ({ metricRules, composition, ownership = null, entryModule = null, ...definition }) => {
  const ownerIds = VISUAL_OWNER_IDS_BY_SHOT[definition.id];
  if (!ownerIds || ownerIds.length !== composition.minOwners) {
    throw new Error(`${definition.id} visual-owner policy does not match minOwners`);
  }
  return Object.freeze({
    ...definition,
    entryModule: entryModule ?? ENTRY_MODULE_BY_PAGE[definition.page.split('?')[0]],
    metricRules: Object.freeze(Object.fromEntries(
      Object.entries(metricRules).map(([key, rule]) => [key, Object.freeze({ ...rule })]),
    )),
    composition: Object.freeze({
      ...composition,
      ownerIds,
      minPixelLargestComponentRatio: composition.minPixelLargestComponentRatio ?? 0.4,
      requiredVisibleGroups: Object.freeze({ ...composition.requiredVisibleGroups }),
    }),
    ownership,
  });
};

export const GLOBAL_GEOMETRY_EVIDENCE_SHOTS = Object.freeze([
  shot({
    id: 'silver-produce-crates', scene: 'silver', page: 'silver.html?preview=1',
    file: '01-silver-produce-crates.png',
    ownership: exactOwnership(
      [
        'prep-floor.east:[20,24]x[-2,8]@0',
        'prep-floor.west-south:[15,20]x[-2,-0.6]@0',
        'prep-floor.west-north:[15,20]x[2.6,8]@0',
      ],
      [
        ['produce-crate@17.9,4.6', 'prep-floor.west-north:[15,20]x[2.6,8]@0'],
        ['produce-crate@19.1,4.6', 'prep-floor.west-north:[15,20]x[2.6,8]@0'],
        ['produce-crate@21.4,4.6', 'prep-floor.east:[20,24]x[-2,8]@0'],
        ['produce-crate@22.6,4.6', 'prep-floor.east:[20,24]x[-2,8]@0'],
        ['produce-crate@17.9,6.8', 'prep-floor.west-north:[15,20]x[2.6,8]@0'],
        ['produce-crate@19.1,6.8', 'prep-floor.west-north:[15,20]x[2.6,8]@0'],
      ],
    ),
    metricRules: {
      'crates.count': { eq: 6 },
      'crates.supported': { eq: 6 },
      'crates.floorSupportLinks': { eq: 6 },
      'crates.lowerCrateSupportLinks': { eq: 0 },
      'crates.selfSupportLinks': { eq: 0 },
      'crates.maxAbsSupportGapM': { gte: 0, lte: 0.0001 },
      'crates.minSupportOverlapM2': { gte: 0.0001 },
    },
    composition: {
      minFocusObjects: 2, minWidth: 0.34, minHeight: 0.18,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 2, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 1, minVisibleSupportParts: 1,
      requiredVisibleGroups: { body: 1, support: 1 },
    },
  }),
  shot({
    id: 'silver-east-banquettes', scene: 'silver', page: 'silver.html?preview=1',
    file: '02-silver-east-banquettes.png',
    ownership: exactOwnership(
      [
        'dining-floor:[-30,10]x[-8,26]@0',
        ...[-3, 2.2, 7.4, 12.6, 17.8].map((z) => `silver-east-banquette@${z}.plinth`),
        ...[-3, 2.2, 7.4, 12.6, 17.8].map((z) => `silver-east-banquette@${z}.base`),
      ],
      [-3, 2.2, 7.4, 12.6, 17.8].flatMap((z) => [
        [
          `silver-east-banquette@${z}.plinth`,
          'dining-floor:[-30,10]x[-8,26]@0',
        ],
        [
          `silver-east-banquette@${z}.base`,
          `silver-east-banquette@${z}.plinth`,
        ],
        [
          `silver-east-banquette@${z}.back`,
          `silver-east-banquette@${z}.base`,
        ],
      ]),
    ),
    metricRules: {
      'banquettes.bases': { eq: 5 },
      'banquettes.plinths': { eq: 5 },
      'banquettes.groundedPlinths': { eq: 5 },
      'banquettes.joinedBases': { eq: 5 },
      'banquettes.maxAbsFloorGapM': { gte: 0, lte: 0.0001 },
      'banquettes.maxAbsSeatGapM': { gte: 0, lte: 0.0001 },
      'banquettes.minSeatOverlapM2': { gte: 0.001 },
    },
    composition: {
      minFocusObjects: 3, minWidth: 0.3, minHeight: 0.28,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 5, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 1, minVisibleSupportParts: 1,
      requiredVisibleGroups: { body: 1, support: 1 },
    },
  }),
  shot({
    id: 'silver-dry-store-shelves', scene: 'silver', page: 'silver.html?preview=1',
    file: '03-silver-dry-store-shelves.png',
    ownership: exactOwnership(
      ['dry-store-floor:[15,21]x[-14,-6]@-2.9', ...SILVER_SHELF_UPRIGHT_IDS],
      [
        ...SILVER_SHELF_UPRIGHT_IDS.map((upright) => [
          upright, 'dry-store-floor:[15,21]x[-14,-6]@-2.9',
        ]),
        ...SILVER_SHELF_RACK_ZS.flatMap((z) => Array.from(
          { length: 5 },
          (_, board) => Array.from({ length: 4 }, (_, upright) => [
            `silver-dry-store-shelving@${z}.board${board}.upright${upright}.board-upright-joint`,
            `silver-dry-store-shelving@${z}.upright${upright}`,
          ]),
        ).flat()),
      ],
    ),
    metricRules: {
      'shelves.racks': { eq: 3 },
      'shelves.boards': { eq: 15 },
      'shelves.uprights': { eq: 12 },
      'shelves.groundedUprights': { eq: 12 },
      'shelves.boardUprightJoins': { eq: 60 },
      'shelves.maxAbsFloorGapM': { gte: 0, lte: 0.0001 },
      'shelves.minJointVolumeM3': { gte: 0.0000001 },
    },
    composition: {
      minFocusObjects: 9, minWidth: 0.3, minHeight: 0.42,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 3, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 2, minVisibleSupportParts: 2,
      requiredVisibleGroups: { body: 2, support: 2 },
    },
  }),
  shot({
    id: 'cartel-dining-table', scene: 'cartel-palace', page: 'cartel-palace.html?preview=1',
    file: '04-cartel-dining-table.png',
    ownership: exactOwnership(
      [
        'mark-dining-table.top',
        'dining-table-runner',
        ...Array.from({ length: 8 }, (_, setting) => `dining-place-setting.${setting}.plate`),
      ],
      [
        ['dining-table-runner', 'mark-dining-table.top'],
        ...Array.from({ length: 7 }, (_, candle) => [
          `dining-candle.${candle}`, 'dining-table-runner',
        ]),
        ...Array.from({ length: 8 }, (_, setting) => [
          [`dining-place-setting.${setting}.plate`, 'mark-dining-table.top'],
          [`dining-place-setting.${setting}.glass`, 'mark-dining-table.top'],
          [`dining-place-setting.${setting}.napkin`, 'mark-dining-table.top'],
          [
            `dining-place-setting.${setting}.rim`,
            `dining-place-setting.${setting}.plate`,
          ],
        ]).flat(),
      ],
    ),
    metricRules: {
      'table.tops': { eq: 1 },
      'table.runners': { eq: 1 },
      'table.candles': { eq: 7 },
      'table.plates': { eq: 8 },
      'table.glasses': { eq: 8 },
      'table.napkins': { eq: 8 },
      'table.rims': { eq: 8 },
      'table.supportedPieces': { eq: 40 },
      'table.maxAbsSupportGapM': { gte: 0, lte: 0.0001 },
    },
    composition: {
      minFocusObjects: 41, minWidth: 0.48, minHeight: 0.22,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 9, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 4, minVisibleSupportParts: 1,
      requiredVisibleGroups: { body: 1, support: 1, settings: 3 },
    },
  }),
  shot({
    id: 'cartel-office-chair', scene: 'cartel-palace', page: 'cartel-palace.html?preview=1',
    file: '05-cartel-office-chair.png',
    ownership: exactOwnership(
      ['office-detail.rug'],
      Array.from({ length: 4 }, (_, index) => [
        `office-detail.desk-chair.leg${index}`, 'office-detail.rug',
      ]),
    ),
    metricRules: {
      'chair.roots': { eq: 1 },
      'chair.visibleParts': { eq: 7 },
      'chair.namedLegs': { eq: 4 },
      'chair.connectedParts': { eq: 7 },
      'chair.rugTouchingParts': { eq: 4 },
      'chair.maxRugContactGapM': { gte: 0, lte: 0.002 },
    },
    composition: {
      minFocusObjects: 7, minWidth: 0.3, minHeight: 0.42,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 1, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 2, minVisibleSupportParts: 2,
      requiredVisibleGroups: { body: 2, support: 2 },
    },
  }),
  shot({
    id: 'mansion-living-couches', scene: 'mansion', page: 'mansion.html?preview=1',
    file: '06-mansion-living-couches.png',
    ownership: exactOwnership(
      [
        'living-floor:[-16,-9.15]x[36,57.85]@1.22',
        ...MANSION_COUCH_FOOT_IDS,
        ...MANSION_COUCH_IDS.map((couch) => `${couch}.base`),
      ],
      MANSION_COUCH_IDS.flatMap((couch) => [
        ...Array.from({ length: 4 }, (_, foot) => [
          `${couch}.foot${foot}`,
          'living-floor:[-16,-9.15]x[36,57.85]@1.22',
        ]),
        ...Array.from({ length: 4 }, (_, foot) => [
          `${couch}.base-foot${foot}.joint`, `${couch}.foot${foot}`,
        ]),
        ...['back', 'arm-left', 'arm-right', 'cushion-left', 'cushion-right'].map((part) => [
          `${couch}.${part}.couch-body-part`, `${couch}.base`,
        ]),
      ]),
    ),
    metricRules: {
      'couches.bases': { eq: 3 },
      'couches.feet': { eq: 12 },
      'couches.groundedFeet': { eq: 12 },
      'couches.joinedFeet': { eq: 12 },
      'couches.maxAbsFloorGapM': { gte: 0, lte: 0.0001 },
      'couches.maxAbsBaseGapM': { gte: 0, lte: 0.0001 },
    },
    composition: {
      minFocusObjects: 5, minWidth: 0.36, minHeight: 0.34,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 3, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 2, minVisibleSupportParts: 2,
      requiredVisibleGroups: { body: 2, support: 2 },
    },
  }),
  shot({
    id: 'no-wake-neighbor-cleats', scene: 'no-wake', page: 'nowake.html?preview=1',
    entryModule: 'src/nowake/main.js',
    file: '07-no-wake-neighbor-cleats.png',
    ownership: exactOwnership(
      [1, 2].map((boat) => `detailed neighboring marina boat ${boat}.neighbor deck sole`),
      [1, 2].flatMap((boat) => ['port', 'starboard'].flatMap((side) => [1, 2].map((cleat) => [
        `detailed neighboring marina boat ${boat}.neighbor cleat ${side} ${cleat}`,
        `detailed neighboring marina boat ${boat}.neighbor deck sole`,
      ]))),
    ),
    metricRules: {
      'cleats.count': { eq: 8 },
      'cleats.decks': { eq: 2 },
      'cleats.supported': { eq: 8 },
      'cleats.maxAbsDeckGapM': { gte: 0, lte: 0.0001 },
      'cleats.minDeckOverlapM2': { gte: 0.0001 },
    },
    composition: {
      minFocusObjects: 5, minWidth: 0.48, minHeight: 0.16,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 4, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 1, minVisibleSupportParts: 1,
      requiredVisibleGroups: { body: 1, support: 2 },
    },
  }),
  shot({
    id: 'motel-dining-chairs', scene: 'motel', page: 'motel.html?preview=1',
    file: '08-motel-dining-chairs.png',
    ownership: exactOwnership(
      ['room12-carpet:[-5,5]x[-15.5,-4.5]@0.02'],
      [0, 1].flatMap((chair) => Array.from({ length: 4 }, (_, foot) => [
        `motel-room12-dining-chair.${chair}.foot${foot}`,
        'room12-carpet:[-5,5]x[-15.5,-4.5]@0.02',
      ])),
    ),
    metricRules: {
      'chairs.count': { eq: 2 },
      'chairs.feet': { eq: 8 },
      'chairs.owner0Feet': { eq: 4 },
      'chairs.owner1Feet': { eq: 4 },
      'chairs.groundedFeet': { eq: 8 },
      'chairs.joinedFeet': { eq: 8 },
      'chairs.maxAbsFloorGapM': { gte: 0, lte: 0.0001 },
      'chairs.maxAbsSeatGapM': { gte: 0, lte: 0.0001 },
    },
    composition: {
      minFocusObjects: 12, minWidth: 0.42, minHeight: 0.34,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 2, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 1, minVisibleSupportParts: 2,
      requiredVisibleGroups: { body: 2, support: 2 },
    },
  }),
  shot({
    id: 'motel-pool-loungers', scene: 'motel', page: 'motel.html?preview=1',
    file: '09-motel-pool-loungers.png',
    ownership: exactOwnership(
      [
        'pool-deck.0-west:[11.5,14]x[4.5,22]',
        'pool-deck.1-east:[30,32.5]x[4.5,22]',
        'pool-deck.2-south:[14,30]x[4.5,6]',
        'pool-deck.3-north:[14,30]x[20,22]',
      ],
      [
        ...Array.from({ length: 4 }, (_, foot) => [
          `west-lounge.foot${foot}`, 'pool-deck.0-west:[11.5,14]x[4.5,22]',
        ]),
        ...Array.from({ length: 4 }, (_, foot) => [
          `east-lounge.foot${foot}`, 'pool-deck.1-east:[30,32.5]x[4.5,22]',
        ]),
      ],
    ),
    metricRules: {
      'loungers.count': { eq: 2 },
      'loungers.feet': { eq: 8 },
      'loungers.owner0Feet': { eq: 4 },
      'loungers.owner1Feet': { eq: 4 },
      'loungers.groundedFeet': { eq: 8 },
      'loungers.joinedFeet': { eq: 8 },
      'loungers.joinedBacks': { eq: 2 },
      'loungers.maxAbsDeckGapM': { gte: 0, lte: 0.0001 },
      'loungers.maxAbsSeatGapM': { gte: 0, lte: 0.0001 },
    },
    composition: {
      minFocusObjects: 6, minWidth: 0.3, minHeight: 0.42,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 2, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 2, minVisibleSupportParts: 2,
      requiredVisibleGroups: { body: 2, support: 2 },
    },
  }),
  shot({
    id: 'motel-shipment-crates', scene: 'motel', page: 'motel.html?preview=1',
    file: '10-motel-shipment-crates.png',
    ownership: exactOwnership(
      [
        'room11-floor:[-17,-7]x[-15.5,-4.5]@0.02',
        ...Array.from({ length: 5 }, (_, index) => `motel-shipment-crate.${index}`),
      ],
      [
        ['motel-shipment-crate.0', 'room11-floor:[-17,-7]x[-15.5,-4.5]@0.02'],
        ['motel-shipment-crate.1', 'room11-floor:[-17,-7]x[-15.5,-4.5]@0.02'],
        ['motel-shipment-crate.2', 'motel-shipment-crate.0'],
        ['motel-shipment-crate.3', 'motel-shipment-crate.1'],
        ['motel-shipment-crate.4', 'motel-shipment-crate.2'],
      ],
    ),
    metricRules: {
      'crates.count': { eq: 5 },
      'crates.supported': { eq: 5 },
      'crates.floorSupportLinks': { eq: 2 },
      'crates.lowerCrateSupportLinks': { eq: 3 },
      'crates.selfSupportLinks': { eq: 0 },
      'crates.maxAbsSupportGapM': { gte: 0, lte: 0.0001 },
      'crates.minSupportOverlapM2': { gte: 0.0001 },
    },
    composition: {
      minFocusObjects: 5, minWidth: 0.36, minHeight: 0.34,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 5, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 1, minVisibleSupportParts: 1,
      requiredVisibleGroups: { body: 2, support: 1 },
    },
  }),
  shot({
    id: 'beefrun-shelter-furniture', scene: 'beefrun', page: 'beefrun.html?preview=1',
    file: '11-beefrun-shelter-furniture.png',
    ownership: exactOwnership(
      [
        'airstrip.groundAt:terrainHeight',
        ...Array.from({ length: 2 }, (_, leg) => `shelter-bench.leg${leg}`),
        ...Array.from({ length: 4 }, (_, leg) => `shelter-table.leg${leg}`),
      ],
      [
        ...Array.from({ length: 2 }, (_, leg) => [
          `shelter-bench.leg${leg}`, 'airstrip.groundAt:terrainHeight',
        ]),
        ...Array.from({ length: 4 }, (_, leg) => [
          `shelter-table.leg${leg}`, 'airstrip.groundAt:terrainHeight',
        ]),
        ...Array.from({ length: 2 }, (_, leg) => [
          `shelter-bench.surface-leg${leg}.surface-leg-joint`, `shelter-bench.leg${leg}`,
        ]),
        ...Array.from({ length: 4 }, (_, leg) => [
          `shelter-table.surface-leg${leg}.surface-leg-joint`, `shelter-table.leg${leg}`,
        ]),
      ],
    ),
    metricRules: {
      'shelter.benchSeats': { eq: 1 },
      'shelter.benchLegs': { eq: 2 },
      'shelter.tableTops': { eq: 1 },
      'shelter.tableLegs': { eq: 4 },
      'shelter.groundedLegs': { eq: 6 },
      'shelter.joinedLegs': { eq: 6 },
      'shelter.containedLegs': { eq: 6 },
      'shelter.maxAbsTerrainDeltaM': { gte: 0, lte: 0.001 },
      'shelter.maxAbsTopGapM': { gte: 0, lte: 0.001 },
    },
    composition: {
      minFocusObjects: 8, minWidth: 0.42, minHeight: 0.3,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 2, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 1, minVisibleSupportParts: 2,
      requiredVisibleGroups: { body: 2, support: 2 },
    },
  }),
  shot({
    id: 'enola-cockpit-seats', scene: 'enola', page: 'enolasquatch.html?preview=1',
    file: '12-enola-cockpit-seats.png',
    ownership: exactOwnership(
      ['enola-aircraft.cabin-floor', 'enola-aircraft.cabin-walkway'],
      ['pilot', 'copilot', 'navigator'].flatMap((role) => (
        Array.from({ length: 4 }, (_, leg) => [
          `${role}.cockpit-seat-leg.${leg}`, 'enola-aircraft.cabin-floor',
        ])
      )),
    ),
    metricRules: {
      'seats.count': { eq: 3 },
      'seats.pans': { eq: 3 },
      'seats.legs': { eq: 12 },
      'seats.pilotLegs': { eq: 4 },
      'seats.copilotLegs': { eq: 4 },
      'seats.navigatorLegs': { eq: 4 },
      'seats.groundedLegs': { eq: 12 },
      'seats.joinedLegs': { eq: 12 },
      'seats.containedLegs': { eq: 12 },
      'seats.walkwayPenetrations': { eq: 0 },
      'seats.maxAbsFloorGapM': { gte: 0, lte: 0.0001 },
      'seats.maxAbsPanGapM': { gte: 0, lte: 0.0001 },
    },
    composition: {
      minFocusObjects: 12, minWidth: 0.38, minHeight: 0.38,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 3, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 2, minVisibleSupportParts: 2,
      requiredVisibleGroups: { body: 2, support: 2 },
    },
  }),
  shot({
    id: 'bing-lou-chair', scene: 'bing', page: 'bing.html?preview=1',
    file: '13-bing-lou-chair.png',
    ownership: exactOwnership(
      [
        'bing-office-carpet:[7.9,13.9]x[-9.5,-4.5]@0.004',
        ...Array.from({ length: 5 }, (_, foot) => `lou-chair.foot${foot}`),
        ...Array.from({ length: 5 }, (_, arm) => `lou-chair.arm${arm}`),
        'lou-chair.hub', 'lou-chair.column', 'lou-chair.seat',
      ],
      [
        ...Array.from({ length: 5 }, (_, foot) => [
          `lou-chair.foot${foot}`,
          'bing-office-carpet:[7.9,13.9]x[-9.5,-4.5]@0.004',
        ]),
        ...Array.from({ length: 5 }, (_, arm) => [
          `lou-chair.arm${arm}`, `lou-chair.foot${arm}`,
        ]),
        ...Array.from({ length: 5 }, (_, arm) => [
          `lou-chair.hub-arm${arm}.joint`, `lou-chair.arm${arm}`,
        ]),
        ['lou-chair.column', 'lou-chair.hub'],
        ['lou-chair.seat', 'lou-chair.column'],
        ['lou-chair.back', 'lou-chair.seat'],
      ],
    ),
    metricRules: {
      'chair.roots': { eq: 1 },
      'chair.arms': { eq: 5 },
      'chair.feet': { eq: 5 },
      'chair.visibleLoadPathParts': { eq: 14 },
      'chair.loadPathJoins': { eq: 8 },
      'chair.armFootBijections': { eq: 5 },
      'chair.distinctFootTargets': { eq: 5 },
      'chair.groundedFeet': { eq: 5 },
      'chair.carpetContainedFeet': { eq: 5 },
      'chair.seatContainedBaseParts': { eq: 11 },
      'chair.colliders': { eq: 128 },
      'chair.maxAbsCarpetGapM': { gte: 0, lte: 0.0001 },
      'chair.maxRadiusErrorM': { gte: 0, lte: 0.0001 },
      'chair.maxAngularGapErrorRad': { gte: 0, lte: 0.0001 },
    },
    composition: {
      minFocusObjects: 14, minWidth: 0.34, minHeight: 0.46,
      minTargetHits: 10, minTargetRatio: 0.4,
      minOwners: 1, minOwnerPartCoverage: 0.5, minOwnerSilhouetteRatio: 0.4,
      minVisibleBodyParts: 2, minVisibleSupportParts: 2,
      requiredVisibleGroups: { body: 2, support: 2 },
    },
  }),
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableEvidenceJson(value) {
  return JSON.stringify(stableValue(value));
}

export function hashStableEvidence(value) {
  return createHash('sha256').update(stableEvidenceJson(value)).digest('hex');
}

function sourceFileIdentity(file, relativeFile) {
  const bytes = fs.readFileSync(file);
  return { file: relativeFile, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export function currentGlobalGeometryEvidenceSourceIdentities() {
  const contract = sourceFileIdentity(
    CONTRACT_SOURCE_FILE, 'tools/global-geometry-evidence-contract.mjs',
  );
  const tool = sourceFileIdentity(
    TOOL_SOURCE_FILE, 'tools/capture-global-geometry-evidence.mjs',
  );
  const screenshotContract = sourceFileIdentity(
    SCREENSHOT_CONTRACT_SOURCE_FILE, 'tools/screenshot-artifact-contract.mjs',
  );
  const directoryTransaction = sourceFileIdentity(
    DIRECTORY_TRANSACTION_SOURCE_FILE, 'tools/evidence-directory-transaction.mjs',
  );
  const bootstrapRunner = sourceFileIdentity(
    BOOTSTRAP_RUNNER_SOURCE_FILE, 'tools/run-global-geometry-evidence.mjs',
  );
  const runtimeSurface = sourceFileIdentity(
    MOTEL_RUNTIME_SURFACE_FILE, 'src/motel/main.js',
  );
  const requiredSources = REQUIRED_SOURCE_FILES.map((relativeFile) => sourceFileIdentity(
    fileURLToPath(new URL(`../${relativeFile}`, import.meta.url)), relativeFile,
  ));
  return {
    contract, tool, screenshotContract, directoryTransaction, bootstrapRunner,
    runtimeSurface,
    requiredSources,
    sourceSnapshotSha256: hashStableEvidence({
      contract, tool, screenshotContract, directoryTransaction, bootstrapRunner,
      runtimeSurface, requiredSources,
    }),
  };
}

export function assertGlobalGeometryEvidenceSourcesUnchanged(snapshot) {
  const current = currentGlobalGeometryEvidenceSourceIdentities();
  if (stableEvidenceJson(snapshot) !== stableEvidenceJson(current)) {
    throw new Error('Global geometry evidence tool, contract, or runtime-surface bytes changed during execution.');
  }
  return current;
}

export function servedEvidenceFingerprint(entries) {
  const normalized = [...(Array.isArray(entries) ? entries : [])]
    .map(({ url, status, resourceType, bytes, sha256 }) => ({
      url, status, resourceType, bytes, sha256,
    }))
    .sort((left, right) => stableEvidenceJson(left).localeCompare(stableEvidenceJson(right)));
  return hashStableEvidence(normalized);
}

export function canonicalGlobalGeometryServedManifest(shots) {
  const manifest = new Map();
  for (const shotCapture of shots ?? []) {
    for (const entry of shotCapture?.served?.entries ?? []) {
      const key = `${entry.resourceType}\0${entry.url}`;
      const identity = {
        url: entry.url,
        resourceType: entry.resourceType,
        status: entry.status,
        bytes: entry.bytes,
        sha256: entry.sha256,
      };
      const existing = manifest.get(key);
      if (existing && stableEvidenceJson(existing.identity) !== stableEvidenceJson(identity)) {
        throw new Error(`Served URL byte drift across report: ${entry.resourceType} ${entry.url}`);
      }
      if (existing) existing.observations += 1;
      else manifest.set(key, { identity, observations: 1 });
    }
  }
  return [...manifest.values()].map(({ identity, observations }) => ({
    ...identity, observations,
  })).sort((left, right) => stableEvidenceJson(left).localeCompare(stableEvidenceJson(right)));
}

export function snapshotGlobalGeometryServedSourceBytes(root = WORKSPACE_ROOT) {
  const sourceRoot = path.resolve(root);
  const realRoot = fs.realpathSync(sourceRoot);
  const relativeFiles = REQUIRED_SOURCE_FILES.filter((file) => file.endsWith('.html'));
  const visit = (relativeDirectory) => {
    const absoluteDirectory = path.join(sourceRoot, ...relativeDirectory.split('/'));
    if (!fs.existsSync(absoluteDirectory)) return;
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const relative = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) visit(relative);
      else if (entry.isFile()) relativeFiles.push(relative);
    }
  };
  // The immutable universe must cover everything that can affect a rendered
  // frame, not only JavaScript. Textures, fonts, JSON manifests, and media can
  // all arrive asynchronously after the modules themselves are stable.
  for (const directory of ['src', 'game', 'vendor', 'lib', 'assets']) visit(directory);
  const immutableSourceBytes = new Map();
  const identities = [...new Set(relativeFiles)].sort().map((relativeFile) => {
    const absoluteFile = path.resolve(sourceRoot, ...relativeFile.split('/'));
    if (!absoluteFile.startsWith(`${sourceRoot}${path.sep}`)) {
      throw new Error(`Global geometry served source escaped workspace: ${relativeFile}`);
    }
    const realFile = fs.realpathSync(absoluteFile);
    if (realFile === realRoot || !realFile.startsWith(`${realRoot}${path.sep}`)) {
      throw new Error(`Global geometry served source symlink escaped workspace: ${relativeFile}`);
    }
    const bytes = fs.readFileSync(absoluteFile);
    immutableSourceBytes.set(relativeFile, bytes);
    return {
      file: relativeFile,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });
  return Object.freeze({ identities: Object.freeze(identities), immutableSourceBytes });
}

export function snapshotGlobalGeometryServedDiskUniverse(root = WORKSPACE_ROOT) {
  return snapshotGlobalGeometryServedSourceBytes(root).identities;
}

export function globalGeometryServedDiskManifest(servedManifest, universe) {
  const sources = Array.isArray(universe) ? universe : snapshotGlobalGeometryServedDiskUniverse();
  const byFile = new Map(sources.map((identity) => [identity.file, identity]));
  return (servedManifest ?? []).map((served) => {
    if (![
      'document', 'script', 'stylesheet', 'image', 'font', 'media', 'fetch', 'xhr', 'other',
    ].includes(served?.resourceType)) {
      throw new Error(`Unsupported served provenance resource ${served?.resourceType}`);
    }
    const url = new URL(served.url);
    const relativeFile = decodeURIComponent(url.pathname).replace(/^\/+/, '').replaceAll('\\', '/');
    if (!relativeFile || relativeFile.split('/').includes('..')) {
      throw new Error(`Unsafe served provenance path ${url.pathname}`);
    }
    const disk = byFile.get(relativeFile);
    if (!disk) throw new Error(`Served source is outside the snapshotted disk universe: ${relativeFile}`);
    if (disk.bytes !== served.bytes || disk.sha256 !== served.sha256) {
      throw new Error(`Served bytes do not match disk source: ${relativeFile}`);
    }
    return {
      url: served.url,
      resourceType: served.resourceType,
      file: relativeFile,
      bytes: disk.bytes,
      sha256: disk.sha256,
    };
  }).sort((left, right) => stableEvidenceJson(left).localeCompare(stableEvidenceJson(right)));
}

function argumentMap(args) {
  const result = new Map();
  const allowed = new Set(['base-url', 'label', 'out']);
  for (let index = 0; index < args.length; index += 1) {
    const token = String(args[index]);
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const equals = token.indexOf('=');
    const key = token.slice(2, equals === -1 ? undefined : equals);
    if (!allowed.has(key)) throw new Error(`Unexpected argument: --${key}`);
    if (result.has(key)) throw new Error(`duplicate --${key} argument`);
    let value = equals === -1 ? args[++index] : token.slice(equals + 1);
    if (value === undefined || String(value).startsWith('--') || String(value).length === 0) {
      throw new Error(`--${key} requires a value`);
    }
    result.set(key, String(value));
  }
  return result;
}

export function parseGlobalGeometryEvidenceRun(args = [], env = {}) {
  const parsed = argumentMap(args);
  if (!parsed.has('base-url')) {
    throw new Error('--base-url is required; use the explicitly granted local evidence port.');
  }
  if (!parsed.has('label')) {
    throw new Error('--label is required; every capture must use a fresh label.');
  }

  let base;
  try {
    base = new URL(parsed.get('base-url'));
  } catch {
    throw new Error('--base-url must be an absolute loopback HTTP URL.');
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (!['http:', 'https:'].includes(base.protocol) || !loopbackHosts.has(base.hostname)) {
    throw new Error('--base-url must use a loopback host.');
  }
  if (!base.port) throw new Error('--base-url must include the explicit port grant.');
  if (base.username || base.password || base.search || base.hash || !['', '/'].includes(base.pathname)) {
    throw new Error('--base-url must contain only loopback origin and explicit port.');
  }

  const label = parsed.get('label');
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(label)) {
    throw new Error('--label must be a safe fresh directory name (letters, digits, _ and - only).');
  }
  const out = parsed.get('out') || env.GLOBAL_GEOMETRY_EVIDENCE_OUT
    || 'docs/validation/global-geometry';
  if (!String(out).trim()) throw new Error('--out must not be empty.');
  return {
    baseUrl: base.href.replace(/\/$/, ''),
    label,
    out: String(out),
  };
}

function exactKeys(actual, expected) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
  return JSON.stringify(Object.keys(actual).sort()) === JSON.stringify([...expected].sort());
}

function metricPasses(value, rule) {
  if (!Number.isFinite(value)) return false;
  const tolerance = Number.isFinite(rule.tolerance) ? rule.tolerance : 1e-9;
  if (Number.isFinite(rule.eq) && Math.abs(value - rule.eq) > tolerance) return false;
  if (Number.isFinite(rule.gte) && value < rule.gte - tolerance) return false;
  if (Number.isFinite(rule.lte) && value > rule.lte + tolerance) return false;
  return true;
}

function result(checks) {
  const errors = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return { ok: errors.length === 0, checks, errors };
}

function validOwnerVisibility(owner, policy) {
  const silhouette = owner?.silhouette;
  const visibleParts = (owner?.visibleBodyParts ?? 0) + (owner?.visibleSupportParts ?? 0);
  const totalParts = (owner?.bodyParts ?? 0) + (owner?.supportParts ?? 0);
  const computedCoverage = totalParts > 0 ? visibleParts / totalParts : Number.NaN;
  const computedSilhouette = silhouette?.sampleCount > 0
    ? silhouette.targetHits / silhouette.sampleCount : Number.NaN;
  return typeof owner?.id === 'string' && owner.id.length > 0
    && owner.connected === true
    && owner.distinctSupport === true
    && Number.isInteger(owner.bodyParts) && owner.bodyParts >= policy.minVisibleBodyParts
    && Number.isInteger(owner.supportParts) && owner.supportParts >= policy.minVisibleSupportParts
    && Number.isInteger(owner.visibleBodyParts)
    && owner.visibleBodyParts >= policy.minVisibleBodyParts
    && owner.visibleBodyParts <= owner.bodyParts
    && Number.isInteger(owner.visibleSupportParts)
    && owner.visibleSupportParts >= policy.minVisibleSupportParts
    && owner.visibleSupportParts <= owner.supportParts
    && Number.isFinite(owner.partCoverage)
    && Math.abs(owner.partCoverage - computedCoverage) <= 0.001
    && owner.partCoverage >= policy.minOwnerPartCoverage
    && silhouette?.sampleCount === 25
    && Number.isInteger(silhouette.targetHits)
    && silhouette.targetHits >= 0 && silhouette.targetHits <= 25
    && Number.isFinite(silhouette.hitRatio)
    && Math.abs(silhouette.hitRatio - computedSilhouette) <= 0.001
    && silhouette.hitRatio >= policy.minOwnerSilhouetteRatio;
}

function validDedicatedCameraBinding(binding) {
  const matrix = binding?.matrixWorld;
  const position = binding?.worldPosition;
  const childPolicy = binding?.cameraChildren;
  return binding?.dedicated === true
    && typeof binding.liveCameraUuid === 'string' && binding.liveCameraUuid.length > 0
    && typeof binding.evidenceCameraUuid === 'string' && binding.evidenceCameraUuid.length > 0
    && binding.liveCameraUuid !== binding.evidenceCameraUuid
    && Array.isArray(matrix) && matrix.length === 16 && matrix.every(Number.isFinite)
    && validHash(binding.renderStateSha256)
    && Number.isInteger(binding.renderStateRenderableCount)
    && binding.renderStateRenderableCount > 0
    && binding.simulationPaused === true
    && binding.pauseApi === 'window.__scenePause'
    && validVector3(position)
    && Math.abs(position[0] - matrix[12]) <= 1e-6
    && Math.abs(position[1] - matrix[13]) <= 1e-6
    && Math.abs(position[2] - matrix[14]) <= 1e-6
    && exactKeys(childPolicy, ['hiddenViewmodels', 'preservedCameraLights', 'hiddenUnknown'])
    && Array.isArray(childPolicy.hiddenViewmodels)
    && Array.isArray(childPolicy.preservedCameraLights)
    && childPolicy.hiddenViewmodels.every((id) => typeof id === 'string' && id.length > 0)
    && childPolicy.preservedCameraLights.every((id) => typeof id === 'string' && id.length > 0)
    && childPolicy.hiddenUnknown === 0;
}

function ownershipCanonical(value) {
  return [...value].sort((left, right) => stableEvidenceJson(left).localeCompare(stableEvidenceJson(right)));
}

function validExactOwnership(actual, policy) {
  if (!policy) return actual === null;
  if (!exactKeys(actual, [
    'ownerIds', 'dependentIds', 'edges', 'distribution', 'unowned', 'multiplyOwned',
  ])) return false;
  if (!Array.isArray(actual.ownerIds) || !Array.isArray(actual.dependentIds)
      || !Array.isArray(actual.edges)) return false;
  const actualPairs = actual.edges.map((edge) => ({
    dependent: edge?.dependent, owner: edge?.owner,
  }));
  const edgeMeasurementsValid = actual.edges.every((edge) => (
    exactKeys(edge, ['dependent', 'owner', 'gapM', 'overlapM2'])
    && typeof edge.dependent === 'string' && typeof edge.owner === 'string'
    && Number.isFinite(edge.gapM) && Math.abs(edge.gapM) <= 0.003
    && Number.isFinite(edge.overlapM2) && edge.overlapM2 > 0
  ));
  return edgeMeasurementsValid
    && new Set(actual.ownerIds).size === actual.ownerIds.length
    && new Set(actual.dependentIds).size === actual.dependentIds.length
    && stableEvidenceJson(ownershipCanonical(actual.ownerIds))
      === stableEvidenceJson(ownershipCanonical(policy.ownerIds))
    && stableEvidenceJson(ownershipCanonical(actual.dependentIds))
      === stableEvidenceJson(ownershipCanonical(policy.dependentIds))
    && stableEvidenceJson(ownershipCanonical(actualPairs))
      === stableEvidenceJson(ownershipCanonical(policy.edges))
    && stableEvidenceJson(actual.distribution) === stableEvidenceJson(policy.distribution)
    && actual.unowned === 0 && actual.multiplyOwned === 0;
}

export function evaluateGlobalGeometryCaptureState(spec, state) {
  const rules = spec?.metricRules ?? {};
  const policy = spec?.composition ?? {};
  const ledger = state?.ledger;
  const composition = state?.composition;
  const ndc = composition?.ndc;
  const visibility = composition?.visibility;
  const width = Number.isFinite(ndc?.maxX) && Number.isFinite(ndc?.minX)
    ? ndc.maxX - ndc.minX : Number.NaN;
  const height = Number.isFinite(ndc?.maxY) && Number.isFinite(ndc?.minY)
    ? ndc.maxY - ndc.minY : Number.NaN;
  const visibleGroups = visibility?.visibleGroups;
  const owners = composition?.owners;
  const targetRatio = Number.isFinite(visibility?.hitRatio)
    && Number.isInteger(visibility?.targetHits)
    && Number.isInteger(visibility?.sampleCount)
    ? visibility.targetHits / visibility.sampleCount : Number.NaN;

  const checks = {
    exactLedger: exactKeys(ledger, Object.keys(rules)),
    metrics: exactKeys(ledger, Object.keys(rules))
      && Object.entries(rules).every(([key, rule]) => metricPasses(ledger[key], rule)),
    fullyInside: composition?.fullyInside === true
      && [ndc?.minX, ndc?.maxX, ndc?.minY, ndc?.maxY].every(Number.isFinite)
      && ndc.minX >= -0.95 && ndc.maxX <= 0.95
      && ndc.minY >= -0.95 && ndc.maxY <= 0.95,
    readableSize: Number.isFinite(width) && width >= policy.minWidth
      && Number.isFinite(height) && height >= policy.minHeight,
    focusObjects: Number.isInteger(composition?.focusObjectCount)
      && composition.focusObjectCount >= policy.minFocusObjects,
    visibilitySample: visibility?.sampleCount === 25
      && Number.isInteger(visibility?.targetHits)
      && visibility.targetHits >= policy.minTargetHits
      && Number.isFinite(visibility.hitRatio)
      && Math.abs(visibility.hitRatio - targetRatio) <= 0.001
      && visibility.hitRatio >= policy.minTargetRatio,
    visibleGroups: exactKeys(visibleGroups, Object.keys(policy.requiredVisibleGroups ?? {}))
      && Object.entries(policy.requiredVisibleGroups ?? {}).every(
        ([key, minimum]) => Number.isInteger(visibleGroups[key]) && visibleGroups[key] >= minimum,
      ),
    ownedSilhouettes: Array.isArray(owners)
      && owners.length === policy.minOwners
      && new Set(owners.map(({ id }) => id)).size === owners.length
      && stableEvidenceJson(ownershipCanonical(owners.map(({ id }) => id)))
        === stableEvidenceJson(ownershipCanonical(policy.ownerIds ?? []))
      && owners.every((owner) => validOwnerVisibility(owner, policy)),
    exactOwnership: validExactOwnership(state?.ownership ?? null, spec?.ownership ?? null),
    cameraClearance: validCameraLegality(
      spec, state?.cameraClearance, composition?.focusObjectCount,
      state?.cameraBinding?.worldPosition,
    ),
    dedicatedCamera: validDedicatedCameraBinding(state?.cameraBinding),
  };
  return result(checks);
}

function cleanRuntime(runtime) {
  return ['pageErrors', 'consoleErrors', 'httpErrors', 'requestFailures']
    .every((key) => Array.isArray(runtime?.[key]) && runtime[key].length === 0);
}

function validHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function normalizedGrantedBaseUrl(value) {
  try {
    const url = new URL(value);
    const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
    if (!['http:', 'https:'].includes(url.protocol) || !loopbackHosts.has(url.hostname)
        || !url.port || url.username || url.password || url.search || url.hash
        || !['', '/'].includes(url.pathname)) return null;
    return url.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function repeatedServedBytesStable(entries) {
  const seen = new Map();
  for (const entry of entries) {
    const key = `${entry.resourceType}\0${entry.url}`;
    const identity = stableEvidenceJson({
      status: entry.status, bytes: entry.bytes, sha256: entry.sha256,
    });
    if (seen.has(key) && seen.get(key) !== identity) return false;
    seen.set(key, identity);
  }
  return true;
}

function reportWideServedBytesStable(shots) {
  const seen = new Map();
  for (const shotCapture of shots ?? []) {
    for (const entry of shotCapture?.served?.entries ?? []) {
      const key = `${entry.resourceType}\0${entry.url}`;
      const identity = stableEvidenceJson({
        status: entry.status, bytes: entry.bytes, sha256: entry.sha256,
      });
      if (seen.has(key) && seen.get(key) !== identity) return false;
      seen.set(key, identity);
    }
  }
  return true;
}

function validServedProof(spec, served, expectedBaseUrl) {
  if (!Array.isArray(served?.entries) || served.entries.length < 2
      || !validHash(served?.fingerprint)) return false;
  const normalizedBase = normalizedGrantedBaseUrl(expectedBaseUrl);
  if (!normalizedBase) return false;
  let launch;
  try {
    launch = new URL(served.launchDocument);
  } catch {
    return false;
  }
  const expected = new URL(spec.page, `${launch.origin}/`);
  if (launch.origin !== new URL(normalizedBase).origin
      || launch.origin !== expected.origin
      || launch.pathname !== expected.pathname || launch.search !== expected.search) return false;
  const entriesValid = served.entries.every((entry) => {
    try {
      const url = new URL(entry.url);
      return url.origin === launch.origin
        && entry.status === 200
        && [
          'document', 'script', 'stylesheet', 'image', 'font', 'media', 'fetch', 'xhr',
          'manifest', 'other',
        ].includes(entry.resourceType)
        && Number.isInteger(entry.bytes) && entry.bytes > 0
        && validHash(entry.sha256);
    } catch {
      return false;
    }
  });
  const documentEntry = served.entries.some((entry) => (
    entry.resourceType === 'document' && entry.url === served.launchDocument
  ));
  const sourceDirectories = { enola: 'enolasquatch' };
  const expectedMain = new URL(
    spec.entryModule || `src/${sourceDirectories[spec.scene] || spec.scene}/main.js`,
    `${launch.origin}/`,
  ).href;
  const scriptEntry = served.entries.some((entry) => (
    entry.resourceType === 'script' && entry.url === expectedMain
  ));
  return entriesValid && documentEntry && scriptEntry && repeatedServedBytesStable(served.entries)
    && served.fingerprint === servedEvidenceFingerprint(served.entries);
}

function validVector3(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function syntheticValidOwnership(policy) {
  if (!policy) return null;
  return {
    ownerIds: [...policy.ownerIds],
    dependentIds: [...policy.dependentIds],
    edges: policy.edges.map(({ dependent, owner }) => ({
      dependent, owner, gapM: 0, overlapM2: 0.01,
    })),
    distribution: { ...policy.distribution },
    unowned: 0,
    multiplyOwned: 0,
  };
}

function expectedCameraLegality(scene) {
  if (scene === 'motel') return {
    source: 'motel.level.aabb.all-enabled-solid-policy',
    coverage: 'all-enabled-motel-level-aabbs+focused-visible-meshes',
  };
  if (scene === 'no-wake') return {
    source: 'nowake.world+active-boat-local',
    coverage: 'world+active-boat-colliders+focused-visible-meshes;neighbor-boats-are-visual-only',
  };
  if (scene === 'enola') return {
    source: 'player.world.box3',
    coverage: 'static-world-colliders+focused-visible-meshes;aircraft-interior-has-no-solid-model',
  };
  return {
    source: 'player.world.box3',
    coverage: 'world-colliders+focused-visible-meshes',
  };
}

function validCameraLegality(spec, legality, focusObjectCount, expectedPosition) {
  const expected = expectedCameraLegality(spec.scene);
  const motelCoverage = legality?.colliderCoverage;
  const motelCoverageValid = spec.scene !== 'motel' || (
    exactKeys(motelCoverage, ['enabled', 'bed', 'table', 'bounds', 'other'])
    && Object.values(motelCoverage).every(Number.isInteger)
    && Object.values(motelCoverage).every((count) => count >= 0)
    && motelCoverage.enabled === legality.blockerCount
    && motelCoverage.enabled === motelCoverage.bed + motelCoverage.table
      + motelCoverage.bounds + motelCoverage.other
    && motelCoverage.bed >= 1 && motelCoverage.table >= 1
    && motelCoverage.bounds >= 4 && motelCoverage.other >= 1
  );
  return legality?.source === expected.source
    && legality.coverage === expected.coverage
    && Number.isInteger(legality.blockerCount)
    && legality.blockerCount >= (spec.scene === 'motel' ? 1 : 0)
    && motelCoverageValid
    && legality.focusMeshCount === focusObjectCount
    && validVector3(legality.testedPosition)
    && stableEvidenceJson(legality.testedPosition) === stableEvidenceJson(expectedPosition)
    && Number.isFinite(legality.minClearanceM) && legality.minClearanceM >= 0
    && legality.colliderClear === true && legality.insideSolidClear === true
    && Array.isArray(legality.colliderBlockers) && legality.colliderBlockers.length === 0
    && Array.isArray(legality.solidBlockers) && legality.solidBlockers.length === 0;
}

function validCameraProof(spec, camera, beforeState) {
  const beforeComposition = beforeState?.composition;
  const distance = validVector3(camera?.position) && validVector3(camera?.target)
    ? Math.hypot(...camera.position.map((value, index) => value - camera.target[index]))
    : Number.NaN;
  const proof = evaluateGlobalGeometryCaptureState(spec, {
    ledger: Object.fromEntries(Object.entries(spec.metricRules).map(([key, rule]) => [
      key,
      Number.isFinite(rule.eq) ? rule.eq
        : Number.isFinite(rule.gte) ? rule.gte
          : Number.isFinite(rule.lte) ? rule.lte : 0,
    ])),
    ownership: syntheticValidOwnership(spec.ownership),
    cameraBinding: camera?.binding,
    cameraClearance: camera?.legality,
    composition: camera?.proof,
  });
  return camera?.scene === spec.scene
    && Number.isInteger(camera?.candidate) && camera.candidate >= 0
    && camera?.fov === 50
    && Number.isFinite(camera?.aspect) && Math.abs(camera.aspect - 1280 / 720) <= 1e-6
    && Number.isFinite(camera?.near) && camera.near > 0 && camera.near <= 0.05
    && Number.isFinite(camera?.far) && camera.far >= 1000
    && validVector3(camera.position) && validVector3(camera.target)
    && Number.isFinite(camera.distanceM) && camera.distanceM >= 0.5
    && Math.abs(camera.distanceM - distance) <= 0.001
    && validCameraLegality(
      spec, camera?.legality, beforeComposition?.focusObjectCount,
      camera?.binding?.worldPosition,
    )
    && validDedicatedCameraBinding(camera?.binding)
    && stableEvidenceJson(camera.binding) === stableEvidenceJson(beforeState?.cameraBinding)
    && stableEvidenceJson(camera.legality) === stableEvidenceJson(beforeState?.cameraClearance)
    && proof.ok
    && stableEvidenceJson(camera.proof) === stableEvidenceJson(beforeComposition);
}

function validDecodedPng(identity, width, height, minimumBytes) {
  const decoded = identity?.decoded;
  return identity?.width === width && identity?.height === height
    && Number.isInteger(identity?.bytes) && identity.bytes >= minimumBytes
    && validHash(identity?.sha256)
    && decoded?.bitDepth === 8 && [2, 6].includes(decoded?.colorType)
    && decoded?.interlace === 0
    && decoded?.rgbaBytes === width * height * 4
    && validHash(decoded?.rgbaSha256);
}

function validOwnerPixelProof(spec, screenshot, beforeState) {
  const proof = screenshot?.pixelProof;
  const ownerMask = screenshot?.ownerMask;
  const owners = proof?.owners;
  const expectedOwnerIds = beforeState?.composition?.owners?.map(({ id }) => id) ?? [];
  if (!validDecodedPng(ownerMask, 1280, 720, 1000)
      || ownerMask.file !== `owner-masks/${spec.id}.png`
      || proof?.imagePngBytes !== screenshot?.bytes
      || proof?.imagePngSha256 !== screenshot?.sha256
      || proof?.maskPngBytes !== ownerMask?.bytes
      || proof?.maskPngSha256 !== ownerMask?.sha256
      || proof?.imageRgbaSha256 !== screenshot?.decoded?.rgbaSha256
      || proof?.maskRgbaSha256 !== ownerMask?.decoded?.rgbaSha256
      || !Array.isArray(owners) || owners.length !== spec.composition.minOwners
      || stableEvidenceJson(owners.map(({ id }) => id)) !== stableEvidenceJson(expectedOwnerIds)
      || new Set(owners.map(({ color }) => color)).size !== owners.length
      || !Number.isInteger(proof.classifiedPixels) || proof.classifiedPixels < 1
      || !Number.isInteger(proof.unclassifiedColoredPixels)
      || proof.unclassifiedColoredPixels < 0
      || proof.unclassifiedColoredPixels > Math.max(512, Math.ceil(proof.classifiedPixels * 0.1))
      || owners.reduce((sum, owner) => sum + owner.visiblePixels, 0) !== proof.classifiedPixels
      || !validDedicatedCameraBinding(proof.maskBinding)
      || !validDedicatedCameraBinding(proof.restoredBinding)
      || stableEvidenceJson(proof.maskBinding) !== stableEvidenceJson(beforeState?.cameraBinding)
      || stableEvidenceJson(proof.restoredBinding) !== stableEvidenceJson(beforeState?.cameraBinding)) {
    return false;
  }
  const pixelCount = 1280 * 720;
  if (!owners.every((owner) => (
    typeof owner.id === 'string' && /^#[a-f0-9]{6}$/.test(owner.color)
    && Number.isInteger(owner.visiblePixels) && owner.visiblePixels >= 64
    && Number.isFinite(owner.coverageRatio)
    && Math.abs(owner.coverageRatio - owner.visiblePixels / pixelCount) <= 1e-8
    && owner.coverageRatio >= 0.00005
    && Number.isInteger(owner.componentCount) && owner.componentCount >= 1
    && Number.isInteger(owner.largestComponentPixels)
    && owner.largestComponentPixels >= 1
    && owner.largestComponentPixels <= owner.visiblePixels
    && Number.isFinite(owner.largestComponentRatio)
    && Math.abs(owner.largestComponentRatio
      - owner.largestComponentPixels / owner.visiblePixels) <= 1e-8
    && owner.largestComponentRatio >= spec.composition.minPixelLargestComponentRatio
    && Number.isInteger(owner.ringPixels) && owner.ringPixels >= 8
    && Number.isFinite(owner.contrast) && owner.contrast >= 0.02 && owner.contrast <= 1
  ))) return false;
  const proofCore = {
    imagePngBytes: proof.imagePngBytes,
    imagePngSha256: proof.imagePngSha256,
    maskPngBytes: proof.maskPngBytes,
    maskPngSha256: proof.maskPngSha256,
    imageRgbaSha256: proof.imageRgbaSha256,
    maskRgbaSha256: proof.maskRgbaSha256,
    classifiedPixels: proof.classifiedPixels,
    unclassifiedColoredPixels: proof.unclassifiedColoredPixels,
    owners: proof.owners,
  };
  return proof.proofSha256 === hashStableEvidence(proofCore);
}

export function evaluateGlobalGeometryShot(spec, capture, expectedBaseUrl = capture?.baseUrl) {
  const before = evaluateGlobalGeometryCaptureState(spec, capture?.before);
  const after = evaluateGlobalGeometryCaptureState(spec, capture?.after);
  const screenshot = capture?.screenshot;
  const checks = {
    identity: capture?.id === spec?.id && capture?.scene === spec?.scene
      && capture?.page === spec?.page && capture?.file === spec?.file
      && capture?.baseUrl === normalizedGrantedBaseUrl(expectedBaseUrl),
    before: before.ok,
    after: after.ok,
    stableWindow: before.ok && after.ok
      && stableEvidenceJson(capture.before) === stableEvidenceJson(capture.after),
    freshScreenshot: capture?.fresh?.screenshotAbsentBefore === true
      && capture?.fresh?.ownerMaskAbsentBefore === true,
    cleanRuntime: cleanRuntime(capture?.runtime),
    camera: validCameraProof(spec, capture?.camera, capture?.before),
    pngCamera: validDedicatedCameraBinding(capture?.pngBinding)
      && stableEvidenceJson(capture.pngBinding)
        === stableEvidenceJson(capture?.before?.cameraBinding),
    png: screenshot?.file === spec?.file
      && validDecodedPng(screenshot, 1280, 720, 10000),
    ownerPixels: validOwnerPixelProof(spec, screenshot, capture?.before),
    servedSource: validServedProof(spec, capture?.served, expectedBaseUrl),
  };
  return { ...result(checks), state: { before, after } };
}

function sourceIdentity(identity, expectedFile) {
  return identity?.file === expectedFile
    && Number.isInteger(identity?.bytes) && identity.bytes > 0
    && validHash(identity?.sha256);
}

export function evaluateGlobalGeometryEvidenceRun(report) {
  const baseUrl = normalizedGrantedBaseUrl(report?.baseUrl);
  const expectedIds = GLOBAL_GEOMETRY_EVIDENCE_SHOTS.map(({ id }) => id);
  const actualIds = Array.isArray(report?.shots) ? report.shots.map(({ id }) => id) : [];
  const shotResults = GLOBAL_GEOMETRY_EVIDENCE_SHOTS.map((spec, index) => (
    evaluateGlobalGeometryShot(spec, report?.shots?.[index], baseUrl)
  ));
  const currentSources = currentGlobalGeometryEvidenceSourceIdentities();
  let servedManifest = null;
  let servedDiskManifest = null;
  try {
    servedManifest = canonicalGlobalGeometryServedManifest(report?.shots);
    servedDiskManifest = globalGeometryServedDiskManifest(servedManifest);
  } catch {
    servedManifest = null;
    servedDiskManifest = null;
  }
  const checks = {
    schema: report?.schema === GLOBAL_GEOMETRY_EVIDENCE_SCHEMA,
    baseUrl: baseUrl !== null && report?.baseUrl === baseUrl,
    label: typeof report?.label === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(report.label),
    viewport: report?.viewport?.width === 1280 && report?.viewport?.height === 720
      && report?.viewport?.deviceScaleFactor === 1,
    freshRunDirectory: report?.fresh?.runDirectoryExistedBefore === false,
    exactShots: JSON.stringify(actualIds) === JSON.stringify(expectedIds),
    shotsPass: shotResults.length === GLOBAL_GEOMETRY_EVIDENCE_SHOTS.length
      && shotResults.every(({ ok }) => ok),
    reportWideServedBytes: reportWideServedBytesStable(report?.shots),
    canonicalServedManifest: Array.isArray(servedManifest)
      && stableEvidenceJson(report?.servedManifest) === stableEvidenceJson(servedManifest),
    servedDiskManifestStart: Array.isArray(servedDiskManifest)
      && stableEvidenceJson(report?.provenance?.servedDiskManifestStart)
        === stableEvidenceJson(servedDiskManifest),
    servedDiskManifestEnd: Array.isArray(servedDiskManifest)
      && stableEvidenceJson(report?.provenance?.servedDiskManifestEnd)
        === stableEvidenceJson(servedDiskManifest),
    servedDiskManifestStable: stableEvidenceJson(report?.provenance?.servedDiskManifestStart)
      === stableEvidenceJson(report?.provenance?.servedDiskManifestEnd),
    contractIdentity: sourceIdentity(report?.provenance?.contract,
      'tools/global-geometry-evidence-contract.mjs')
      && stableEvidenceJson(report.provenance.contract) === stableEvidenceJson(currentSources.contract),
    toolIdentity: sourceIdentity(report?.provenance?.tool,
      'tools/capture-global-geometry-evidence.mjs')
      && stableEvidenceJson(report.provenance.tool) === stableEvidenceJson(currentSources.tool),
    screenshotContractIdentity: sourceIdentity(report?.provenance?.screenshotContract,
      'tools/screenshot-artifact-contract.mjs')
      && stableEvidenceJson(report.provenance.screenshotContract)
        === stableEvidenceJson(currentSources.screenshotContract),
    directoryTransactionIdentity: sourceIdentity(report?.provenance?.directoryTransaction,
      'tools/evidence-directory-transaction.mjs')
      && stableEvidenceJson(report.provenance.directoryTransaction)
        === stableEvidenceJson(currentSources.directoryTransaction),
    bootstrapRunnerIdentity: sourceIdentity(report?.provenance?.bootstrapRunner,
      'tools/run-global-geometry-evidence.mjs')
      && stableEvidenceJson(report.provenance.bootstrapRunner)
        === stableEvidenceJson(currentSources.bootstrapRunner),
    immutableBootstrap: report?.provenance?.immutableBootstrap?.mode === 'content-addressed-worker'
      && report.provenance.immutableBootstrap.verified === true
      && report.provenance.immutableBootstrap.expectedSourceSha256
        === currentSources.sourceSnapshotSha256
      && report.provenance.immutableBootstrap.executedSourceSha256
        === currentSources.sourceSnapshotSha256,
    runtimeSurfaceIdentity: sourceIdentity(report?.provenance?.runtimeSurface,
      'src/motel/main.js')
      && stableEvidenceJson(report.provenance.runtimeSurface)
        === stableEvidenceJson(currentSources.runtimeSurface),
    requiredSourceIdentities: Array.isArray(report?.provenance?.requiredSources)
      && report.provenance.requiredSources.length === REQUIRED_SOURCE_FILES.length
      && stableEvidenceJson(report.provenance.requiredSources)
        === stableEvidenceJson(currentSources.requiredSources),
    sourceManifestStart: stableEvidenceJson(report?.provenance?.sourceManifestStart)
      === stableEvidenceJson(currentSources),
    sourceManifestEnd: stableEvidenceJson(report?.provenance?.sourceManifestEnd)
      === stableEvidenceJson(currentSources),
    sourceManifestStable: stableEvidenceJson(report?.provenance?.sourceManifestStart)
      === stableEvidenceJson(report?.provenance?.sourceManifestEnd),
    sourceSnapshotIdentity: report?.provenance?.sourceSnapshotSha256
      === currentSources.sourceSnapshotSha256,
    manifestIdentity: report?.provenance?.shotManifestSha256
      === hashStableEvidence(GLOBAL_GEOMETRY_EVIDENCE_SHOTS),
  };
  return { ...result(checks), shotResults };
}
