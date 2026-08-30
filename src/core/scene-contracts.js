/**
 * Campaign Scene Contracts at commit 5f7982f1.
 *
 * This registry is intentionally behavioral. `adapter` names record the live
 * composition found by the forensic audit, while dispositions prevent a local
 * fork, a known failure, an intentional N/A, or an UNKNOWN from masquerading
 * as certified merely because a source import exists.
 */
import { SCENES, SCENE_IDS } from './campaign.js';
import { CONTRACT_DISPOSITION as D, deepFreeze } from './scene-contract.js';

const unique = (values) => [...new Set(values)];

const required = (description, extra = {}) => ({
  disposition: D.REQUIRED,
  description,
  ...extra,
});
const debt = (reason, description, extra = {}) => ({
  disposition: D.DEBT,
  reason,
  description,
  ...extra,
});
const knownFailure = (reason, description, extra = {}) => ({
  disposition: D.KNOWN_FAILURE,
  reason,
  description,
  ...extra,
});
const intentionalNa = (reason, description, extra = {}) => ({
  disposition: D.INTENTIONAL_NA,
  reason,
  description,
  ...extra,
});
const unknown = (reason, description, extra = {}) => ({
  disposition: D.UNKNOWN,
  reason,
  description,
  ...extra,
});

const BROWSER_INPUT_BEHAVIOR =
  'Use real browser input; pointer lock must activate, movement must change position, and held input must clear.';

const browserInput = (mode = 'first_person_free') => debt(
  'Keyboard, mouse, pointer-lock, blur, pause, and rebinding are still wired in the scene root.',
  BROWSER_INPUT_BEHAVIOR,
  { mode, actions: ['pointer_lock', 'move', 'clear_held_input'] },
);

const canonicalBrowserInput = (mode = 'first_person_free') => required(
  'Use real browser input through the canonical FirstPersonInputAdapter; pointer lock must activate, movement must change position, and held input must clear.',
  {
    adapter: 'core/first-person-input',
    mode,
    actions: ['pointer_lock', 'move', 'clear_held_input'],
  },
);

const canonicalBrowserInputDebt = (mode = 'first_person_free') => debt(
  'The canonical FirstPersonInputAdapter is adopted, but this entrypoint does not yet have a complete live browser receipt for pointer lock, movement, and held-input cleanup.',
  // Architecture adoption is separate evidence. Until the browser receipt
  // exists, this is the same player-facing obligation as the legacy debt; a
  // migration must not mutate known debt behind its stable semantic ID.
  BROWSER_INPUT_BEHAVIOR,
  {
    adapter: 'core/first-person-input',
    mode,
    actions: ['pointer_lock', 'move', 'clear_held_input'],
  },
);

const firstPersonCamera = (mode = 'first_person') => required(
  'Mouse input must change the permitted view and the active camera must remain the authored owner.',
  { mode, assertions: ['look_changes_view', 'owner_matches_phase'] },
);

const scriptedFirstPersonCamera = (mode) => required(
  'Real input and authored pose transitions must retain one camera identity and restore a playable view.',
  { mode, assertions: ['look_changes_view', 'owner_matches_phase', 'returns_to_playable_view'] },
);

const localCamera = (reason, mode) => debt(
  reason,
  'Real input and authored transitions must leave exactly one camera owner and restore the playable view.',
  { mode, assertions: ['look_changes_view', 'owner_matches_phase', 'returns_to_playable_view'] },
);

const sharedObjective = required(
  'The current instruction must be visible, non-empty, and change when mission state advances.',
  { adapter: 'core/objective-panel', minimum: 1 },
);
const localObjective = (adapter) => debt(
  'Objective authority or rendering is scene-owned instead of using the canonical ObjectivePanel Interface.',
  'The local objective must still be visible, non-empty, and derived from current mission state.',
  { adapter, minimum: 1 },
);

const sharedInteraction = required(
  'At least one expected look/use interaction must be discoverable and invokable with real input.',
  { adapter: 'core/interaction', minimum: 1 },
);
const localInteraction = (adapter) => debt(
  'The scene owns a parallel interaction Implementation.',
  'At least one expected local interaction must be discoverable and invokable with real input.',
  { adapter, minimum: 1 },
);

const sceneEntryCheckpoints = (ids) => required(
  'Every registered campaign spawn must boot into a live state with at least one legal progression action.',
  { mode: 'scene_entry', ids },
);
const runtimeCheckpoints = (ids) => required(
  'Every authored checkpoint must restore world, mission, input, objective, and at least one legal progression action.',
  { mode: 'runtime', ids },
);
const previewCheckpoints = (ids) => debt(
  'These are preview/staging entries; durable runtime-checkpoint equivalence has not been established for every id.',
  'Each preview checkpoint must boot the same visible and actionable phase it names.',
  { mode: 'preview', ids },
);

const baseSubjects = ({ npc = 'required' } = {}) => {
  const subjects = [
    required('A zero-frame boot is a failure.', { kind: 'meaningful_frame', minimum: 1 }),
    required('Every campaign scene must expose at least one playable player authority.', { kind: 'player', minimum: 1 }),
    required('A vacuous objective scan is not certification.', { kind: 'objective_item', minimum: 1 }),
    required('A vacuous interaction scan is not certification.', { kind: 'interactable', minimum: 1 }),
  ];
  if (npc === 'none') {
    /* A HUB WITH NOBODY IN IT IS NOT AN UNMEASURED HUB.
     *
     * The countryside cabin is deliberately empty -- it is where he goes to be
     * on his own between jobs -- so `authored_actor` has no minimum to meet
     * and never will while that is what the scene is for. Recording that as
     * INTENTIONAL_NA keeps it distinct from a scene whose cast simply has not
     * been counted yet, which is what UNKNOWN means here. */
    subjects.push(intentionalNa(
      'The scene is an intentionally solitary hub; there is no cast to stage.',
      'Publish a cast minimum the moment anybody is written into this scene.',
      { kind: 'authored_actor', minimum: null },
    ));
  } else if (npc === 'unknown') {
    subjects.push(unknown(
      'Apartment actor count varies by chapter, return source, and internal act; no per-variant minimum is measured yet.',
      'Publish an explicit per-apartment-variant actor minimum.',
      { kind: 'authored_actor', minimum: null },
    ));
  } else {
    subjects.push(required('The scene must publish at least one authored non-player actor.', {
      kind: 'authored_actor', minimum: 1,
    }));
  }
  return subjects;
};

function canonicalEntry(sceneId, root, options = {}) {
  const declared = SCENES[sceneId];
  return {
    id: options.id ?? `${sceneId}_canonical`,
    href: options.href ?? declared.href,
    router: options.router,
    root,
    kind: 'canonical',
    disposition: options.disposition ?? D.REQUIRED,
    reason: options.reason,
    expectedExits: options.expectedExits ?? unique(declared.next),
    observedExits: options.observedExits,
    activation: options.activation,
  };
}

function makeContract({ id, title, purpose, entrypoints, capabilities, goldenPath,
  minimumSubjects = baseSubjects(), debt: architectureDebt = [], knownFailures = [], evidence = [] }) {
  const declared = SCENES[id];
  if (!declared) throw new Error(`Scene Contract references unregistered campaign scene ${id}`);
  return {
    id,
    title,
    purpose,
    campaign: {
      href: declared.href,
      defaultSpawn: declared.defaultSpawn,
      entrySpawns: [...declared.spawns],
      declaredExits: [...declared.next],
    },
    entrypoints,
    capabilities,
    minimumSubjects,
    goldenPath,
    debt: architectureDebt,
    knownFailures,
    evidence,
  };
}

export const SCENE_CONTRACTS = deepFreeze([
  makeContract({
    id: SCENE_IDS.APARTMENT,
    title: 'Apartment',
    purpose: 'Campaign hub, chapter mornings and returns, Special Meeting Act One, finale, credits, and freeplay handoff.',
    entrypoints: [canonicalEntry(SCENE_IDS.APARTMENT, 'src/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt('first_person_with_seated_modes'),
      camera: localCamera('Cold open, bed, desk, seat, Margo, and finale code can take camera ownership.', 'authored_handoffs'),
      objective: localObjective('core/goals + core/apartment-story'),
      interaction: sharedInteraction,
      checkpoints: sceneEntryCheckpoints(['wake', 'front_door', 'motel_retry']),
    },
    minimumSubjects: baseSubjects({ npc: 'unknown' }),
    goldenPath: 'Wake, gain control, complete the current chapter affordance, leave through the correct campaign edge, and rebuild the next return state.',
    debt: [
      { id: 'apartment_composition_depth', summary: 'The composition root owns many unrelated gameplay and cinematic responsibilities.' },
      { id: 'duplicate_special_meeting_edge', summary: 'The campaign next list contains Special Meeting twice.' },
    ],
    evidence: ['src/main.js:224-234', 'src/main.js:1324-1618', 'src/core/campaign.js:1054-1078'],
  }),

  makeContract({
    id: SCENE_IDS.BADA_BING_ONE,
    title: 'Bada Bing — first visit',
    purpose: 'First club visit: optional games, Lou office package, briefing, and the Family driver handoff to Squatchfather.',
    entrypoints: [canonicalEntry(SCENE_IDS.BADA_BING_ONE, 'src/bing/main.js', {
      router: 'src/bing/router.js',
    })],
    capabilities: {
      input: canonicalBrowserInputDebt(),
      camera: firstPersonCamera(),
      objective: sharedObjective,
      interaction: sharedInteraction,
      checkpoints: sceneEntryCheckpoints(['driver_seat', 'club_entrance']),
    },
    goldenPath: 'Exit the car, enter the club, obtain Lou’s package, return to the car, and reach Apartment.',
    debt: [{ id: 'bing_dialogue_fork', summary: 'Bing owns a noncanonical dialogue/subtitle machine.' }],
    evidence: ['src/bing/router.js:1-5', 'src/bing/main.js:169-234', 'src/bing/main.js:2799-3034'],
  }),

  makeContract({
    id: SCENE_IDS.SQUATCHFATHER,
    title: 'Squatchfather',
    purpose: 'Restaurant and development meeting with authored seated camera, dialogue, and violence beats.',
    entrypoints: [canonicalEntry(SCENE_IDS.SQUATCHFATHER, 'src/squatchfather/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt('custom_first_person'),
      camera: localCamera('The scene owns CameraDirector and SeatedCamera rather than the shared player view.', 'scene_director'),
      objective: sharedObjective,
      interaction: localInteraction('squatchfather/interaction/InteractionSystem'),
      checkpoints: sceneEntryCheckpoints(['restaurant_exterior', 'development_entry']),
    },
    goldenPath: 'Traverse both locations, complete the meeting and authored interaction beats, survive/recover if needed, and return to Apartment.',
    debt: [{ id: 'parallel_gameplay_stack', summary: 'Player, interaction, dialogue, audio, and camera are local forks.' }],
    evidence: ['src/squatchfather/main.js:7-24', 'src/squatchfather/main.js:94-228'],
  }),

  makeContract({
    id: SCENE_IDS.AIRSTRIP_SMUGGLING,
    title: 'The Beef Run',
    purpose: 'Airstrip preflight, outbound smuggling flight, second load, and return landing.',
    entrypoints: [canonicalEntry(SCENE_IDS.AIRSTRIP_SMUGGLING, 'src/beefrun/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt('first_person_and_aircraft'),
      camera: localCamera('CameraManager arbitrates on-foot, cockpit, and external flight views.', 'flight_camera_manager'),
      objective: localObjective('beefrun/FlightHud'),
      interaction: sharedInteraction,
      checkpoints: runtimeCheckpoints(['takeoff', 'approach', 'departure', 'return']),
    },
    goldenPath: 'Complete preflight, take off, load and unload cargo, return, land, shut down, and reach Apartment.',
    debt: [{
      id: 'flight_input_adapter',
      summary: 'FlightInput and aircraft command policy remain scene-owned behind the canonical browser Adapter.',
    }],
    evidence: ['src/beefrun/main.js:12-49', 'src/beefrun/main.js:116-227', 'src/beefrun/mission.js:31-37'],
  }),

  makeContract({
    id: SCENE_IDS.BADA_BING_TWO,
    title: 'The HotDog Incident',
    purpose: 'Second club visit: party, performance, attack, cleanup, body handoff, and Graveyard transition.',
    entrypoints: [
      canonicalEntry(SCENE_IDS.BADA_BING_TWO, 'src/bing/hotdog-main.js', {
        id: 'bada_bing_two_hotdog',
        router: 'src/bing/router.js',
      }),
      {
        id: 'bada_bing_two_legacy_main',
        href: 'bing.html',
        router: 'src/bing/router.js',
        root: 'src/bing/main.js',
        kind: 'legacy',
        disposition: D.KNOWN_FAILURE,
        reason: 'A bare Bing URL with a durable second-visit scene loads the legacy branch, which exits to Motel instead of Graveyard.',
        activation: 'campaign.state.scene.id === bada_bing_two without ?visit=2',
        expectedExits: [SCENE_IDS.SQUATCH_GRAVEYARD],
        observedExits: [SCENE_IDS.JERKY_MOTEL],
      },
    ],
    capabilities: {
      input: canonicalBrowserInputDebt(),
      camera: firstPersonCamera(),
      objective: localObjective('bing/hotdog DOM objective list'),
      interaction: sharedInteraction,
      checkpoints: previewCheckpoints(['party', 'attack', 'cleanup', 'graveyard']),
    },
    goldenPath: 'Complete party and performance beats, survive the attack, finish every cleanup prerequisite, and hand the body to Graveyard.',
    knownFailures: [{ id: 'bing_two_dual_runtime', summary: 'Canonical and legacy runtime Adapters have divergent exits.' }],
    debt: [{ id: 'hotdog_objective_fork', summary: 'HotDog manually renders objectives while Bing 1 uses ObjectivePanel.' }],
    evidence: ['src/bing/router.js:1-5', 'src/bing/main.js:236-347', 'src/bing/main.js:2694-2702', 'src/bing/hotdog-main.js:1547-1676'],
  }),

  makeContract({
    id: SCENE_IDS.SQUATCH_GRAVEYARD,
    title: 'Squatch Graveyard',
    purpose: 'Carry, place, and bury HotDog, with optional memorial and tribute interactions.',
    entrypoints: [canonicalEntry(SCENE_IDS.SQUATCH_GRAVEYARD, 'src/graveyard/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt(),
      camera: firstPersonCamera(),
      objective: sharedObjective,
      interaction: sharedInteraction,
      checkpoints: previewCheckpoints(['arrival', 'carried', 'placed', 'buried']),
    },
    goldenPath: 'Open the trunk, carry and place the body, complete the burial hold, persist completion, and continue to Motel.',
    debt: [{ id: 'graveyard_dialogue_local', summary: 'Dialogue and subtitle orchestration remain local.' }],
    evidence: ['src/graveyard/main.js:90-103', 'src/graveyard/main.js:353-370', 'src/graveyard/mission.js:101-120'],
  }),

  makeContract({
    id: SCENE_IDS.JERKY_MOTEL,
    title: 'The Jerky Motel',
    purpose: 'Continuous arrival, deal, betrayal, fight, recovery, escape, and driving sequence.',
    entrypoints: [canonicalEntry(SCENE_IDS.JERKY_MOTEL, 'src/motel/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt('custom_first_person_and_vehicle'),
      camera: localCamera('The scene owns its player camera and arrival/drive camera modes.', 'motel_camera'),
      objective: localObjective('motel/OBJECTIVES'),
      interaction: localInteraction('motel point interaction'),
      checkpoints: unknown(
        'The root exposes restore behavior, but this pass did not establish a complete authored checkpoint id inventory.',
        'Measure and register every Motel checkpoint before strict certification.',
        { mode: 'runtime', ids: [] },
      ),
    },
    goldenPath: 'Reach room twelve, complete the deal steps, survive betrayal, recover the goods, escape, drive, and reach the correct Apartment spawn.',
    debt: [
      { id: 'motel_overloaded_root', summary: 'Player, objective, dialogue, combat, interaction, and phase truth are concentrated in one root.' },
      { id: 'motel_split_shot_truth', summary: 'WeaponSystem owns presentation while local segmentBlocked/Actor.damage owns hits.' },
    ],
    evidence: ['src/motel/main.js:63-68', 'src/motel/main.js:188-347', 'src/motel/main.js:4016-4028'],
  }),

  makeContract({
    id: SCENE_IDS.NO_WAKE,
    title: 'NO WAKE',
    purpose: 'Boat startup and travel, cabin execution, body weighting/disposal, and departure.',
    entrypoints: [canonicalEntry(SCENE_IDS.NO_WAKE, 'src/nowake/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt('first_person_and_boat'),
      camera: localCamera('NoWakeCameraDirector owns boat and authored sequence views.', 'boat_camera_director'),
      objective: localObjective('nowake DOM objective'),
      interaction: sharedInteraction,
      checkpoints: runtimeCheckpoints(['dock', 'underway', 'open_water', 'execution', 'weighted']),
    },
    goldenPath: 'Start and pilot the boat, execute and weight Willy, dispose of the body, leave, and return to Apartment.',
    knownFailures: [],
    debt: [{ id: 'nowake_order_sensitive_restore', summary: 'Checkpoint reconstruction depends on phase mutation before guarded actions.' }],
    evidence: ['src/nowake/main.js:1-24', 'src/nowake/main.js:1752-1815'],
  }),

  makeContract({
    id: SCENE_IDS.SILVER_ROOM,
    title: 'The Silver Room',
    purpose: 'Continuous service-route date, table rounds, performance, invitation, and return home.',
    entrypoints: [canonicalEntry(SCENE_IDS.SILVER_ROOM, 'src/silver/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt(),
      camera: localCamera('Two authored camera handoffs temporarily take the view.', 'first_person_with_two_handoffs'),
      objective: sharedObjective,
      interaction: sharedInteraction,
      checkpoints: runtimeCheckpoints(['arrived', 'host', 'seating', 'performance', 'invitation']),
    },
    goldenPath: 'Traverse the service route, keep the date live, reach the table and performance, accept the ending, and return to Apartment.',
    debt: [{ id: 'silver_cross_scene_dialogue', summary: 'Silver imports Bing dialogue as a generic capability.' }],
    evidence: ['src/silver/main.js:1-42', 'src/silver/mission.js:13-39'],
  }),

  makeContract({
    id: SCENE_IDS.SILVER_PINES,
    title: 'A Morning at Silver Pines',
    purpose: 'Three-hole golf round with walking, carts, conversations, swing, ball flight, and scoring.',
    entrypoints: [canonicalEntry(SCENE_IDS.SILVER_PINES, 'src/golf/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt('first_person_golf_and_cart'),
      camera: localCamera('Ball follow and cart seating temporarily alter the ordinary first-person view.', 'golf_camera'),
      objective: sharedObjective,
      interaction: sharedInteraction,
      checkpoints: previewCheckpoints(['hole1', 'hole2', 'hole3', 'grille']),
    },
    goldenPath: 'Complete all three tee-to-cup loops with real swing input, persist the scorecard, and return to Apartment.',
    debt: [{ id: 'golf_dialogue_local', summary: 'Dialogue and cue-floor logic remain golf-owned.' }],
    evidence: ['src/golf/main.js:16-69', 'src/golf/mission.js:82-99'],
  }),

  makeContract({
    id: SCENE_IDS.BANK_HEIST,
    title: 'THE TAKE',
    purpose: 'Safehouse preparation, bank/vault robbery, street and garage combat, vehicle escape, and debrief.',
    entrypoints: [canonicalEntry(SCENE_IDS.BANK_HEIST, 'src/heist/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt('first_person_combat_and_vehicle'),
      camera: localCamera('Walking, combat, van, and player-driven escape phases change camera policy.', 'heist_camera'),
      objective: localObjective('heist/HeistObjectiveLedger'),
      interaction: sharedInteraction,
      checkpoints: runtimeCheckpoints([
        'safehouse_ready', 'bank_secured', 'vault_open', 'street_withdrawal',
        'mercer_garage', 'vehicle_swap', 'safehouse_debrief',
      ]),
    },
    goldenPath: 'Brief and load out, control the bank, open the vault, fight through street and garage, drive the escape, swap vehicles, and debrief.',
    debt: [{ id: 'heist_local_directors', summary: 'HUD, objectives, dialogue, AI, hostages, and navigation use Heist-only Interfaces.' }],
    evidence: ['src/heist/main.js:1-65', 'src/heist/config.js:1-56'],
  }),

  /* The second home, and the only scene that carries five separate story
   * states: the night Lou hands over the keys, the stayover, the morning
   * after, coming home from the dock, and the night the special meeting
   * rings. See CAMPAIGN_SPINE for which beat owns which spawn. */
  makeContract({
    id: SCENE_IDS.LUXURY_APARTMENT,
    title: 'The Luxury Apartment',
    purpose: 'The upgraded home Lou gives the Prospect after Silver Pines: a two-level loft with the domestic utility of the starter flat, the trophies and art moved over, and the five authored story states of the back half of the campaign.',
    entrypoints: [canonicalEntry(SCENE_IDS.LUXURY_APARTMENT, 'src/luxury-apartment/main.js')],
    capabilities: {
      input: canonicalBrowserInput(),
      camera: firstPersonCamera(),
      objective: sharedObjective,
      interaction: sharedInteraction,
      checkpoints: sceneEntryCheckpoints(['arrival', 'main', 'loft', 'bed', 'arcade']),
    },
    minimumSubjects: baseSubjects(),
    goldenPath: 'Take the keys, get ready and leave for the date, bring Margo home, wake alone, answer the dock call, come back, and be standing here when Booski rings about the special meeting.',
    debt: [],
    evidence: ['src/luxury-apartment/main.js:1-40', 'src/luxury-apartment/runtime.js:41', 'src/core/campaign.js:1199-1213'],
  }),

  makeContract({
    id: SCENE_IDS.COUNTRYSIDE_CABIN,
    title: 'The Countryside Cabin',
    purpose: 'A rural hideout hub between jobs: talk with resident caretaker Lag, sleep the clock forward, walk the creek, overlook, shed and firepit, and leave for the Silver Case.',
    entrypoints: [canonicalEntry(SCENE_IDS.COUNTRYSIDE_CABIN, 'src/cabin/main.js')],
    capabilities: {
      input: canonicalBrowserInput(),
      camera: firstPersonCamera(),
      objective: sharedObjective,
      interaction: sharedInteraction,
      checkpoints: sceneEntryCheckpoints(['arrival', 'wake', 'porch']),
    },
    minimumSubjects: baseSubjects(),
    goldenPath: 'Arrive at dusk, rest to move the clock, walk any of the four authored excursions, and leave for the Silver Case.',
    debt: [],
    evidence: ['src/cabin/main.js:1-40', 'src/cabin/main.js:490-500', 'src/core/campaign.js:1186-1191'],
  }),

  makeContract({
    id: SCENE_IDS.SILVER_CASE,
    title: 'The Silver Case',
    purpose: 'Apartment control, authored shootings, prayer, bathroom ambush, case recovery, and Mansion handoff.',
    entrypoints: [canonicalEntry(SCENE_IDS.SILVER_CASE, 'src/silvercase/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt(),
      camera: localCamera('Car, soft-look, and authored apartment beats temporarily direct the view.', 'silver_case_camera'),
      objective: sharedObjective,
      interaction: sharedInteraction,
      checkpoints: runtimeCheckpoints(['squatch_prayer']),
    },
    goldenPath: 'Establish control, complete the shootings and bathroom ambush, recover the case, and continue to Mansion.',
    debt: [{ id: 'silver_case_legacy_shot_resolver', summary: 'Local ImpactKit/ShotResolver bypass canonical shot truth.' }],
    evidence: ['src/silvercase/main.js:1-31', 'src/silvercase/main.js:338-466', 'src/silvercase/state/SilverCaseStateMachine.js:22-59'],
  }),

  makeContract({
    id: SCENE_IDS.MANSION_SIEGE,
    title: 'Mansion Under Siege',
    purpose: 'Wake, armory and office briefing, defensive waves, aftermath, and Enola handoff.',
    entrypoints: [canonicalEntry(SCENE_IDS.MANSION_SIEGE, 'src/mansion/siege/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt('first_person_combat'),
      camera: firstPersonCamera('first_person_combat'),
      objective: localObjective('mansion/siege DOM objective'),
      interaction: sharedInteraction,
      checkpoints: runtimeCheckpoints(['wake', 'armed', 'briefed', 'wave_one']),
    },
    goldenPath: 'Wake, arm and brief, survive both waves with checkpoint recovery, resolve aftermath, and continue to Enola.',
    debt: [{ id: 'siege_objective_fork', summary: 'Siege manually renders objectives despite strong shared-system adoption.' }],
    evidence: ['src/mansion/siege/main.js:32-92', 'src/mansion/siege/mission.js:54-138'],
  }),

  makeContract({
    id: SCENE_IDS.ENOLA_SQUATCH,
    title: 'SQUATCHOLA GAY',
    purpose: 'On-foot preflight, heavy-aircraft mission, bomb run, detonation, emergency return, and landing.',
    entrypoints: [canonicalEntry(SCENE_IDS.ENOLA_SQUATCH, 'src/enolasquatch/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt('first_person_and_aircraft'),
      camera: localCamera('CameraManager owns on-foot, cockpit, external, bomb-run, and return views.', 'flight_camera_manager'),
      objective: localObjective('beefrun/FlightHud'),
      interaction: sharedInteraction,
      checkpoints: runtimeCheckpoints(['preflight', 'takeoff', 'flak', 'bombrun', 'detonation', 'return']),
    },
    goldenPath: 'Complete walkaround and takeoff, survive detection and defense, release the bomb, escape, return, land, and reach Mansion Return.',
    knownFailures: [{ id: 'enola_terrain_authority', summary: 'Detection and Weather sample Beef terrain rather than visible Enola terrain.' }],
    debt: [{ id: 'flight_environment_interface', summary: 'Reused flight Modules cannot inject the rendered terrain authority.' }],
    evidence: ['src/enolasquatch/main.js:55-64', 'src/enolasquatch/main.js:69-114'],
  }),

  makeContract({
    id: SCENE_IDS.MANSION_RETURN,
    title: 'Repaired Mansion Return',
    purpose: 'Return to the repaired estate, receive Lou’s Palace briefing, and continue to the finale mission.',
    entrypoints: [canonicalEntry(SCENE_IDS.MANSION_RETURN, 'src/mansion/main.js', {
      id: 'mansion_return_query_variant',
      disposition: D.DEBT,
      reason: 'The shared Mansion root selects return mode solely from the visit=return query rather than validating durable scene state.',
      activation: '?visit=return',
    })],
    capabilities: {
      input: canonicalBrowserInputDebt(),
      camera: firstPersonCamera(),
      objective: sharedObjective,
      interaction: sharedInteraction,
      checkpoints: intentionalNa(
        'Mansion Return is a short briefing scene with registered entry spawns but no authored runtime-checkpoint machine.',
        'Runtime checkpoint certification is intentionally N/A; entry-spawn boots remain part of the campaign contract.',
        { mode: 'runtime', ids: [] },
      ),
    },
    goldenPath: 'Boot the return variant, traverse to Lou’s office, persist the briefing facts, and continue to Cartel Palace.',
    debt: [{ id: 'mansion_query_mode', summary: 'URL query is unvalidated composition authority for the shared root.' }],
    evidence: ['src/mansion/campaign.js:14-20', 'src/mansion/main.js:117-132', 'src/mansion/main.js:2290-2299'],
  }),

  makeContract({
    id: SCENE_IDS.CARTEL_PALACE,
    title: 'Cartel Palace',
    purpose: 'Approach, infiltration, evidence, betrayal, dining-room resolution, and final-arc transition.',
    entrypoints: [canonicalEntry(SCENE_IDS.CARTEL_PALACE, 'src/cartel-palace/main.js', {
      expectedExits: [SCENE_IDS.APARTMENT],
    })],
    capabilities: {
      input: canonicalBrowserInputDebt('first_person_combat'),
      camera: firstPersonCamera('first_person_combat'),
      objective: sharedObjective,
      interaction: sharedInteraction,
      checkpoints: runtimeCheckpoints(['approach', 'perimeter', 'estate', 'betrayal', 'dining_room', 'clear']),
    },
    goldenPath: 'Infiltrate, collect evidence, resolve Mark and Sauce, clear the estate, return to Apartment for Special Meeting Act One, then reach the car scene.',
    debt: [{ id: 'palace_patrol_navigation', summary: 'Guard routes are local waypoint arrays without a navigation Interface.' }],
    evidence: ['src/cartel-palace/main.js:1759-1773', 'src/core/campaign.js:1235-1255'],
  }),

  makeContract({
    id: SCENE_IDS.SPECIAL_MEETING,
    title: 'The Special Meeting',
    purpose: 'Kerb pickup, long car ride, forest spur, trail, and exact-once Initiation handoff.',
    entrypoints: [canonicalEntry(SCENE_IDS.SPECIAL_MEETING, 'src/specialmeeting/main.js')],
    capabilities: {
      input: canonicalBrowserInput('first_person_and_scripted_ride'),
      camera: scriptedFirstPersonCamera('first_person_and_scripted_ride'),
      objective: sharedObjective,
      interaction: sharedInteraction,
      checkpoints: sceneEntryCheckpoints(['kerb', 'spur']),
    },
    goldenPath: 'Move and look at the kerb, enter the car, complete dialogue and road gates, exit at the spur, walk the trail, and hand off to Initiation.',
    debt: [{ id: 'special_meeting_no_scene_restart', summary: 'Recovery intentionally supplies skip and entry reload, not destructive scene restart.' }],
    evidence: ['src/specialmeeting/main.js:81-119', 'src/specialmeeting/main.js:449-476', 'src/specialmeeting/ride.js:39-47'],
  }),

  makeContract({
    id: SCENE_IDS.INITIATION,
    title: 'Initiation Night',
    purpose: 'Forest approach, prospect questioning and executions, cabin ceremony, oath, cut, burn, and campaign ending.',
    entrypoints: [canonicalEntry(SCENE_IDS.INITIATION, 'src/initiation/main.js')],
    capabilities: {
      input: canonicalBrowserInput('first_person_choices_and_cutscenes'),
      camera: localCamera('InitiationPlayerAdapter and phase code switch playable, look-only, and cutscene ownership.', 'phase_camera'),
      objective: sharedObjective,
      interaction: localInteraction('initiation phase/action input'),
      checkpoints: sceneEntryCheckpoints(['approach']),
    },
    goldenPath: 'Walk the approach, complete questions and execution branches, reach the cabin, perform ceremony input, persist completion, and return to Apartment.',
    debt: [
      { id: 'initiation_geometry_copy', summary: 'Line-up coordinates are copied between main.js and cabin/site.js.' },
      { id: 'initiation_no_shared_restart_skip', summary: 'Wrong-answer reload and in-page retry work, but the scene still has no shared Restart Scene or Skip Scene Adapter.' },
    ],
    evidence: ['src/initiation/main.js:168-184', 'src/initiation/main.js:1075-1162', 'src/initiation/main.js:1530-1556'],
  }),

  makeContract({
    id: SCENE_IDS.MANSION,
    title: 'Lou’s Mansion / Project Silent Squatch',
    purpose: 'Estate exploration, hidden-lab mission, quiet evening, and transition into the siege.',
    entrypoints: [canonicalEntry(SCENE_IDS.MANSION, 'src/mansion/main.js')],
    capabilities: {
      input: canonicalBrowserInputDebt('first_person_with_house_modes'),
      camera: localCamera('House, laboratory mission, pool, seating, and sleep handoffs share camera ownership.', 'mansion_camera'),
      objective: sharedObjective,
      interaction: sharedInteraction,
      checkpoints: previewCheckpoints(['arrival', 'office', 'basement', 'lab', 'core_complete', 'locked', 'aubbie_down', 'silent_night', 'clear', 'suite']),
    },
    goldenPath: 'Deliver the case, complete the hidden-lab mission, finish the quiet-evening gate, sleep in the guest suite, and reach Mansion Siege.',
    debt: [{ id: 'mansion_local_orchestration', summary: 'Dialogue, doors, camera ownership, cast animation, and mission staging remain Mansion-local.' }],
    evidence: ['src/mansion/main.js:27-95', 'src/mansion/main.js:117-132', 'src/mansion/main.js:2097-2128'],
  }),
]);

export const SCENE_CONTRACT_BY_ID = deepFreeze(Object.fromEntries(
  SCENE_CONTRACTS.map((contract) => [contract.id, contract]),
));

export function getSceneContract(sceneId) {
  return SCENE_CONTRACT_BY_ID[sceneId] ?? null;
}

export function listSceneEntrypoints() {
  return deepFreeze(SCENE_CONTRACTS.flatMap((contract) => contract.entrypoints.map((entrypoint) => ({
    sceneId: contract.id,
    title: contract.title,
    ...entrypoint,
  }))));
}
