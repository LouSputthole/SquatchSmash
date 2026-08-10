/**
 * One source of truth for the focused 2026-08-09 Mansion walkthrough.
 *
 * This is deliberately a verification manifest, not a second scene. Camera
 * poses resolve from window.mansion anchors and every target resolves from
 * the production scene graph or one of its published props.
 */

export const MANSION_WALKTHROUGH_COVERAGE = Object.freeze([
  {
    section: 1,
    area: 'Front driveway / exterior arrival',
    checks: [
      'every authored driveway fixture has one powered light with consistent throw',
      'front flowers are grounded, human-scaled, and clear of lamp hardware',
      'the motor court and shortened approach beds leave useful fountain clearance',
      'all three patrols remain clear of solids through a three-minute simulation',
      'the front-door guard is wholly outside the facade glazing',
    ],
    views: ['driveway-arrival', 'fountain-clearance', 'front-door-guard'],
  },
  {
    section: 2,
    area: 'Global NPC voice-line policy',
    checks: [
      'Rippin, Eric, and Sauce publish real-body speech positions; Kate is explicitly catalogued unavailable',
      'each present proximity speaker is audible nearby and rejected by distance and floor separation',
      'a real nearby bark commits the shared cooldown and remains positional',
      'an actual Mansion wall produces an occluded speech result',
    ],
    views: [],
  },
  {
    section: 3,
    area: 'Pool room',
    checks: [
      'all lounge display trophies are complete connected objects seated on shelves',
      'pool-room artwork is visible clear of its bar and architecture',
      'both reclining performers expose real thigh, shin, and foot meshes with no significant lounger penetration',
      'the swimmer treads, bobs, and drifts inside the pool bounds',
      'the dress interaction is entered through real E, focuses the fastening, accepts direct E, and exits cleanly',
    ],
    views: ['pool-room-cases', 'pool-room-art', 'pool-recliner', 'pool-swimmer', 'pool-dress-focus'],
  },
  {
    section: 4,
    area: 'Bar area',
    checks: ['the picture behind the bar is fully above the back-bar carcass'],
    views: ['pool-room-art'],
  },
  {
    section: 5,
    area: 'Kitchen',
    checks: [
      'the refrigerator faces the room at mansion scale with two doors and handles',
      'the microwave has a window, handle, panel, display, and button grid',
      'the working sink still turns on and off',
      'the exterior stair meets a supported flush landing at the kitchen doorway',
    ],
    views: ['kitchen-appliances', 'kitchen-service-landing'],
  },
  {
    section: 6,
    area: 'Outdoor garden / Squatch trophy area',
    checks: [
      'the rose-garden arch is the entrance and has no redundant wall cap',
      'its full player corridor is clear of solids and flowers',
      'the accepted putting green and smaller garden remain present',
    ],
    views: ['garden-arch', 'garden-accepted-area'],
  },
  {
    section: 7,
    area: 'Garden room',
    checks: ['every full planter Box3 has measurable air from all ten actual named fountain kerb/body meshes'],
    views: ['winter-garden-fountain'],
  },
  {
    section: 8,
    area: 'Trophy room',
    checks: [
      'the widened three-arch entrance retains supporting piers and clear collision',
      'the Great Includer handles are upright, closed, and connected to the cup',
      'no unrelated statue or floor lamp crowds the monument',
      'all hall-case trophies are complete and shelf-seated',
    ],
    views: ['trophy-room-entry', 'great-includer', 'trophy-room-cases'],
  },
  {
    section: 9,
    area: 'Family / fireplace room',
    checks: ['the fireplace has animated emissive flames and room glow', 'the fireplace wall has a curated family-art group'],
    views: ['family-fireplace'],
  },
  {
    section: 10,
    area: 'Modern bedroom',
    checks: [
      'the TV-side table and dressing bench have useful separation',
      'the removed booski-death-room-deathmegatron-accent object is absent, while the one accepted Booski accent portrait clears the wardrobe',
      'the Booski / DeathMegatron placard is outside above the doorway',
    ],
    views: ['modern-bedroom', 'modern-bedroom-placard'],
  },
  {
    section: 11,
    area: 'Upstairs bathroom (frozen)',
    checks: ['both accepted upstairs bathrooms and their working fixture contracts remain present'],
    views: ['upstairs-bathroom-regression'],
  },
  {
    section: 12,
    area: 'Classic bedroom',
    checks: [
      'the weight set is in the back window corner',
      'the TV is diagonally angled',
      'the chair and pedestal clear the wardrobe and bed',
    ],
    views: ['classic-bedroom'],
  },
  {
    section: 13,
    area: 'Gothic room',
    checks: [
      'the chair, wardrobe, bed, and packing cluster have deliberate clearance',
      'the Old Chapel placard is outside above the doorway',
    ],
    views: ['gothic-bedroom', 'gothic-bedroom-placard'],
  },
  {
    section: 14,
    area: 'Lake room',
    checks: [
      'the bed art, paddles, life ring, and recognizable white cross sit within 5mm of actual gallery-north-solid wall geometry',
      'the chair, little table, and writing cluster have useful clearance, with no plant anywhere in the Lake-room rect',
      'the outside placard reads LAKE ROOM',
    ],
    views: ['lake-bedroom', 'lake-wall-front', 'lake-wall-side', 'lake-bedroom-placard'],
  },
  {
    section: 15,
    area: 'Conference room (frozen)',
    checks: ['the accepted conference room and its table/head anchors remain present and enterable'],
    views: ['conference-room-regression'],
  },
  {
    section: 16,
    area: "Uncle Lou's suite",
    checks: ['exactly one deliberately lowered bar light remains', 'no decorative beam crosses either table'],
    views: ['lou-suite-bar'],
  },
  {
    section: 17,
    area: 'Upstairs balcony',
    checks: ['the railing chain is physically continuous from both stair tops around the balcony'],
    views: ['upstairs-balcony-arrival'],
  },
  {
    section: 18,
    area: 'Cellar',
    checks: [
      'the pegboard and every mounted tool contact the actual named basement-wall-panel-north assembly without penetration or floating',
      'racked wine bottles publish body, shoulder, neck, cork, and label geometry',
      'the vault picture has measurable air from actual cellar-rooms-solid structure and the white doorway architrave',
    ],
    views: ['cellar-wall-object', 'cellar-armory-wine-bottles', 'cellar-wine-bottles', 'vault-art-front', 'vault-art-side'],
  },
  {
    section: 19,
    area: 'Prospect room',
    checks: [
      'the room wall object has an explicit readable identity or is absent',
      'the boots are character-scaled',
      'the bust clears the red pier from all three authored inspection views',
    ],
    views: ['prospect-room', 'prospect-boots', 'prospect-bust-corridor-east', 'prospect-bust-corridor-north', 'prospect-bust-doorway'],
  },
  {
    section: 20,
    area: 'Character voice content',
    checks: [
      'Sauce and Eric publish authored Mansion ambient/proximity cues',
      'Kate is explicitly unavailable because no Mansion identity is catalogued, never substituted',
      'all present speakers use the same non-global proximity policy',
    ],
    views: ['sauce-post', 'eric-post'],
  },
  {
    section: 21,
    area: 'Final Mansion validation',
    checks: [
      'the production page is HTTP 200 with real rendered frames and a healthy WebGL2 context',
      'there are no page errors, console errors, failed requests, or HTTP 404s',
      'the seven repeated blockers each have a hard geometry check and original-resolution view',
      'all named changed routes remain walkable under the real Player and collider systems',
    ],
    views: [
      'vault-art-side',
      'prospect-bust-doorway',
      'great-includer',
      'trophy-room-cases',
      'lake-wall-side',
      'front-door-guard',
      'winter-garden-fountain',
    ],
  },
]);

/**
 * `from` resolves from a production anchor plus a camera offset. `target`
 * resolves from a production object name, a published object path, a cast ID,
 * or a literal look point. Coordinates only describe the camera; they never
 * construct replacement geometry.
 */
export const MANSION_WALKTHROUGH_VIEWS = Object.freeze([
  { id: 'driveway-arrival', section: 1, from: { anchor: 'spawn', offset: [0, 0, 7] }, target: { path: ['grounds', 'props', 'fountain'] } },
  { id: 'fountain-clearance', section: 1, from: { anchor: 'fountainFront', offset: [-11, 0, -4] }, target: { path: ['grounds', 'props', 'fountain'] } },
  { id: 'front-door-guard', section: 1, from: { anchor: 'frontDoorOutside', offset: [-5, 0, -5] }, target: { npc: 'gateMan' } },

  { id: 'pool-room-cases', section: 3, from: { anchor: 'loungeCenter', offset: [-1.4, 0, 1.4] }, target: { name: 'lounge-display-trophy' } },
  { id: 'pool-room-art', section: 3, from: { anchor: 'loungeCenter', offset: [-1.8, 0, -2.2] }, target: { path: ['interior', 'props', 'lounge', 'bayShield'] } },
  { id: 'pool-recliner', section: 3, from: { anchor: 'poolPatio', offset: [6.2, 0, -3.0] }, target: { npc: 'poolPerformer1' } },
  { id: 'pool-swimmer', section: 3, from: { anchor: 'poolPatio', offset: [4.0, 0, 0] }, target: { npc: 'poolPerformer2' } },
  { id: 'pool-dress-focus', section: 3, runtime: 'dress-focus', from: { anchor: 'poolPatio', offset: [6.2, 0, -3.0] }, target: { path: ['cast', 'poolPerformerRig'], call: [1], member: 'strap' } },

  { id: 'kitchen-appliances', section: 5, from: { anchor: 'kitchenIsland', offset: [0, 0, 3.8] }, target: { path: ['interior', 'props', 'kitchen', 'microwave'] } },
  { id: 'kitchen-service-landing', section: 5, from: { serviceRoadLandingApproach: true }, target: { name: 'service-landing-platform' } },

  { id: 'garden-arch', section: 6, from: { anchor: 'roseGardenGate', offset: [4.5, 0, 0] }, target: { name: 'rose-garden-entry-arch' } },
  { id: 'garden-accepted-area', section: 6, from: { anchor: 'outdoorKitchen', offset: [-4.5, 0, -1.0] }, target: { name: 'putting-green' } },
  { id: 'winter-garden-fountain', section: 7, from: { anchor: 'winterGardenCenter', offset: [3.8, 0, -4.2] }, target: { name: 'winter-fountain-bowl' } },

  { id: 'trophy-room-entry', section: 8, from: { anchor: 'livingRoomCenter', offset: [-0.8, 0, -4.0] }, target: { anchor: 'trophyHallCenter' } },
  { id: 'great-includer', section: 8, from: { anchor: 'trophyHallCenter', offset: [3.6, 0, 0] }, target: { path: ['interior', 'props', 'trophyHall', 'trophy'] } },
  { id: 'trophy-room-cases', section: 8, from: { anchor: 'trophyHallCenter', offset: [1.0, 0, 4.0] }, target: { name: 'trophy-hall-display-trophy' } },
  { id: 'family-fireplace', section: 9, from: { anchor: 'livingRoomCenter', offset: [4.2, 0, 1.0] }, target: { name: 'fireplace-firebox-back' } },

  { id: 'modern-bedroom', section: 10, from: { anchor: 'bedEastRear', offset: [-1.8, 0, 2.2] }, target: { name: 'modern-dressing-cluster' } },
  { id: 'modern-bedroom-placard', section: 10, from: { anchor: 'galleryEast', offset: [0, 0, 12.5] }, target: { name: 'booski-death-room-exterior-placard' } },
  { id: 'upstairs-bathroom-regression', section: 11, from: { anchor: 'bathEast', offset: [0, 0, -2.5] }, target: { anchor: 'bathEast' } },
  { id: 'classic-bedroom', section: 12, from: { anchor: 'bedEastFront', offset: [-1.5, 0, -2.0] }, target: { name: 'oldtime-washstand-cluster' } },
  { id: 'gothic-bedroom', section: 13, from: { anchor: 'bedWestFront', offset: [1.6, 0, -2.0] }, target: { name: 'gothic-packing-cluster' } },
  { id: 'gothic-bedroom-placard', section: 13, from: { anchor: 'galleryWest', offset: [0, 0, -3.5] }, target: { name: 'old-chapel-room-placard' } },
  { id: 'lake-bedroom', section: 14, from: { anchor: 'bedWestRear', offset: [2.0, 0, 2.5] }, target: { name: 'lake-writing-cluster' } },
  { id: 'lake-wall-front', section: 14, from: { anchor: 'bedWestRear', offset: [0, 0, 4.0] }, target: { name: 'lake-white-cross' } },
  { id: 'lake-wall-side', section: 14, from: { anchor: 'bedWestRear', offset: [4.5, 0, 0.7] }, target: { name: 'lake-life-ring' } },
  { id: 'lake-bedroom-placard', section: 14, from: { anchor: 'galleryWest', offset: [0, 0, 12.5] }, target: { name: 'lake-room-placard' } },
  { id: 'conference-room-regression', section: 15, from: { anchor: 'conferenceHead', offset: [0, 0, -3.5] }, target: { anchor: 'conferenceTable' } },
  { id: 'lou-suite-bar', section: 16, from: { anchor: 'masterSuiteBar', offset: [-4.2, 0, 0] }, target: { name: 'suite-bar-wall-light' } },
  { id: 'upstairs-balcony-arrival', section: 17, from: { anchor: 'horseshoeWestTop', offset: [0.5, 0, -0.5] }, target: { name: 'gallery-edge-west-rail' } },

  { id: 'cellar-wall-object', section: 18, from: { anchor: 'armoryCenter', offset: [0, 0, 3.6] }, target: { path: ['interior', 'props', 'basement', 'toolBench', 'pegboard'] } },
  { id: 'cellar-armory-wine-bottles', section: 18, from: { anchor: 'armoryCenter', offset: [-1.4, 0, 4.0] }, target: { path: ['interior', 'props', 'basement', 'wineBottles'], index: 0 } },
  { id: 'cellar-wine-bottles', section: 18, from: { anchor: 'wineCellar', offset: [-1.6, 0, 0] }, target: { path: ['lab', 'innocent', 'wine', 'bottles'], index: 0 } },
  { id: 'vault-art-front', section: 18, from: { anchor: 'cellarHallCenter', offset: [7.5, 0, 0] }, target: { path: ['interior', 'props', 'vault', 'mark'] } },
  { id: 'vault-art-side', section: 18, from: { anchor: 'vaultCenter', offset: [-2.0, 0, -4.0] }, target: { path: ['interior', 'props', 'vault', 'mark'] } },

  { id: 'prospect-room', section: 19, from: { anchor: 'guestRoomCenter', offset: [2.2, 0, 2.0] }, target: { name: 'prospect-work-jacket' } },
  { id: 'prospect-boots', section: 19, from: { anchor: 'guestRoomCenter', offset: [1.4, 0, 0.5] }, target: { name: 'prospect-work-boots' } },
  { id: 'prospect-bust-corridor-east', section: 19, inspectionView: 'corridor-east', target: { path: ['lab', 'hiddenWall', 'bust'] } },
  { id: 'prospect-bust-corridor-north', section: 19, inspectionView: 'corridor-north', target: { path: ['lab', 'hiddenWall', 'bust'] } },
  { id: 'prospect-bust-doorway', section: 19, inspectionView: 'doorway', target: { path: ['lab', 'hiddenWall', 'bust'] } },

  { id: 'sauce-post', section: 20, fromNpc: 'sauce', offset: [2.0, 0, 1.4], target: { npc: 'sauce' } },
  { id: 'eric-post', section: 20, fromNpc: 'eric', offset: [2.0, 0, 1.4], target: { npc: 'eric' } },
]);

export function assertWalkthroughSpec() {
  const sections = MANSION_WALKTHROUGH_COVERAGE.map(({ section }) => section);
  const wanted = Array.from({ length: 21 }, (_, index) => index + 1);
  if (JSON.stringify(sections) !== JSON.stringify(wanted)) {
    throw new Error(`Mansion walkthrough coverage is not exactly sections 1-21: ${sections.join(', ')}`);
  }
  const viewIds = new Set(MANSION_WALKTHROUGH_VIEWS.map(({ id }) => id));
  if (viewIds.size !== MANSION_WALKTHROUGH_VIEWS.length) {
    throw new Error('Mansion walkthrough view ids are not unique');
  }
  const missing = MANSION_WALKTHROUGH_COVERAGE.flatMap(({ section, views }) => (
    views.filter((id) => !viewIds.has(id)).map((id) => `section ${section}: ${id}`)
  ));
  if (missing.length) throw new Error(`Mansion walkthrough views are missing: ${missing.join(', ')}`);
  return true;
}
