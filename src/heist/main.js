import * as THREE from 'three';
import { AudioEngine } from '../core/audio.js';
import { CombatActor } from '../core/combat/actors.js';
import { FACTIONS, FactionMatrix } from '../core/combat/factions.js';
import { AabbCombatSpace } from '../core/combat/spatial.js';
import { SuppressionModel } from '../core/combat/suppression.js';
import { BloodImpactSystem, BloodSpurtSystem, DeathBloodPool } from '../world/blood.js';
import {
  CHARACTER_IDS, MISSION_IDS, SCENE_IDS, TIME_EVENT_IDS,
  createCampaign, navigateCampaign,
} from '../core/campaign.js';
import { createBankHeistStory } from '../core/bank-heist-story.js';
import { InteractionSystem } from '../core/interaction.js';
import {
  SPEECH_GAIN, speak, speechDuration,
} from '../core/dialogue.js';
import { Player } from '../core/player.js';
import { shakeScale } from '../core/settings.js';
import { createFirstPersonInput } from '../core/first-person-input.js';
import { attachPixelRatio } from '../core/pixel-ratio.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
import { createPauseMenu } from '../core/pause-menu.js';
import { createCampaignSceneRecovery } from '../core/campaign-scene-skip.js';
/* The shared weapon sound bank: five cue slots per gun for all six guns in
 * the game, each with a real recording standing in until the wanted cue
 * lands. THE TAKE was playing its own carbine recording for both of its
 * weapons — see `fireWeapon`. */
import { WEAPON_IDS, playWeaponCue, weaponCueNames } from '../core/weapons/index.js';
import {
  installPreviewNotice, isPreviewMode, previewCheckpointForLocation,
  previewDifficultyForLocation,
} from '../core/preview-mode.js';
import { FixedStepRunner } from '../core/vehicles/fixed-step.js';
import { GroundVehicle } from '../core/vehicles/ground-vehicle.js';
import { createHeistControlPolicy } from './controls.js';
import {
  buildHeistCrew, crewHeadingForPhase, HEIST_CREW_IDS, setCrewMasked, updateCrew,
} from './cast.js';
import {
  applyHeistCheckpointSetpieceGeometry,
  HEIST_SQUAD_FORMATIONS,
  heistSquadAnchorIds,
  poseHeistCrewGeometry,
} from './preview.js';
import { BankGuardThreat } from './bank-threat.js';
import { CheckpointDirector } from './checkpoints.js';
import {
  BLOCK_CLEAR_OFFICERS, HEIST_ESCAPE_VEHICLE_CONFIG, HEIST_PHASE_PLAYER_BOUNDS, HEIST_STATES,
  PERFORMANCE_BUDGET, PHASE_FOR_STATE, PREVIEW_START_STATE,
} from './config.js';
import { DialogueArbiter, heistSpeechMix } from './dialogue.js';
import { HeistHud } from './hud.js';
import { bankBoltGoal, intersectsDrivingObstacle } from './geometry.js';
import { STAGING_POINT, buildHeistLevel } from './level.js';
import { HeistCombatAdapter } from './combat.js';
import { createLobbyHostages, HostageDirector } from './hostages.js';
import { HEIST_ITEM_CATALOG, HEIST_SLOT_ORDER, HeistLoadout } from './loadout.js';
import { createHeistBags, LootLedger } from './loot.js';
import { HeistMissionMachine } from './mission.js';
import { AuthoredNavigationGraph, SquadDirector } from './navigation.js';
import { HeistObjectiveLedger } from './objective.js';
import { debriefStep, objectiveForState, swapEvidencePlan } from './orders.js';
import { makePoliceFigure } from './people.js';
import { PoliceDirector } from './police.js';
import { SafehousePreparation } from './safehouse.js';
import { HEIST_CAMERA_MARKS, publishHeistFramingBeats } from './shots.js';
import { makeHeistViewModel } from './weapons.js';
import {
  CREW_FRIENDLY_FIRE_LINES, HOSTAGE_BARKS, PROSPECT_VERB_LINES,
  SNOW_CASUALTY_LADDER, dialogueLine,
  pendingHeistCues, recordedHeistCues,
} from './script.js';

/** Only manifest-backed cues are preloaded; the pending bank is subtitle-only. */
const HEIST_VOICE_CUES = Object.freeze(recordedHeistCues());
const HEIST_PENDING_CUES = Object.freeze(pendingHeistCues());

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
attachPixelRatio(renderer);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101419);
scene.fog = new THREE.FogExp2(0x11161b, 0.018);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 260);
scene.add(new THREE.HemisphereLight(0x9fa9b1, 0x29251f, 1.35));
const keyLight = new THREE.DirectionalLight(0xffe7bd, 2.4);
keyLight.position.set(8, 18, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1536, 1536);
scene.add(keyLight);
const emergency = new THREE.PointLight(0xc6353d, 0, 24, 2);
scene.add(emergency);
/* The camera has to be IN the scene graph, or nothing parented to it is drawn.
 * That is why the first-person hands and the muzzle flash were invisible: three
 * renders the scene's children, and the camera was not one of them. */
scene.add(camera);

const hud = new HeistHud();
const audio = new AudioEngine();
const campaign = createCampaign();
campaign.enter(SCENE_IDS.BANK_HEIST);
const story = createBankHeistStory({ campaign });
const level = buildHeistLevel(scene);

/* Static, named geometry evidence for the browser verifier. A screenshot of a
 * room can be perfectly sharp while missing the object it claims to prove;
 * these measurements make the frame answer to the built cargo van and the two
 * transfer work zones rather than to a filename. */
const HEIST_EVIDENCE_GEOMETRY = (() => {
  const safehouse = level.phases.safehouse;
  const garage = level.phases.garage;
  const driving = level.phases.driving;
  safehouse.group.updateMatrixWorld(true);
  garage.group.updateMatrixWorld(true);
  driving.group.updateMatrixWorld(true);

  const van = safehouse.group.getObjectByName('primary-van');
  const rearDoors = safehouse.interactables.van;
  const loadingBay = safehouse.group.getObjectByName('safehouse-loading-bay');
  const vanBounds = new THREE.Box3().setFromObject(van);
  const vanSize = vanBounds.getSize(new THREE.Vector3());
  const vanCenter = vanBounds.getCenter(new THREE.Vector3());
  const doorCenter = new THREE.Box3().setFromObject(rearDoors).getCenter(new THREE.Vector3());
  const namesPresent = (root, names) => names.filter((name) => root.getObjectByName(name)).length;

  return Object.freeze({
    safehouseCargoVan: Object.freeze({
      kind: van?.userData.kind ?? null,
      size: vanSize.toArray(),
      center: vanCenter.toArray(),
      minZ: vanBounds.min.z,
      maxZ: vanBounds.max.z,
      rearDoorCenter: doorCenter.toArray(),
      loadingBayZ: loadingBay?.position.z ?? null,
      rearParts: namesPresent(van, [
        'primary-van-cargo-box', 'primary-van-cab',
        'primary-van-rear-door-left', 'primary-van-rear-door-right',
      ]),
      loadingBayParts: namesPresent(loadingBay, [
        'loading-bay-header', 'loading-bay-jamb-left', 'loading-bay-jamb-right',
      ]),
    }),
    garageTransfer: Object.freeze({
      transferZone: !!garage.group.getObjectByName('garage-transfer-zone'),
      sedan: !!garage.group.getObjectByName('escape-sedan'),
      toolCart: !!garage.group.getObjectByName('garage-tool-cart'),
      taskLight: !!garage.group.getObjectByName('garage-sedan-task-light'),
    }),
    vehicleSwapWorkbench: Object.freeze({
      workbench: !!driving.group.getObjectByName('swap-workbench'),
      sortingTarp: !!driving.group.getObjectByName('swap-sorting-tarp'),
      cleanCarBay: !!driving.group.getObjectByName('swap-clean-car-bay'),
      taskLights: ['swap-task-light-workbench', 'swap-task-light-car']
        .filter((name) => driving.group.getObjectByName(name)).length,
    }),
  });
})();
const player = new Player(camera, level.world);
player.mode = 'walk';
player.position.set(0, 1.66, 4);
const interaction = new InteractionSystem(camera, hud);
const factionMatrix = new FactionMatrix();
const playerActor = new CombatActor({
  id: CHARACTER_IDS.PROSPECT,
  faction: FACTIONS.CREW,
  maxHealth: 100,
  /* ZERO until the carrier is off the stand. It was 35 from construction, so
   * the vest's only mechanical effect was already in force before the player
   * had touched it — see `syncPlayerArmor`. */
  armor: 0,
});
/**
 * The shared-combat seam. See `./combat.js`: shot truth, hostile perception,
 * visible aim, catalog ammunition and blood presentation are the shared
 * Modules'; this file keeps only mission consequences and presentation.
 */
const combat = new HeistCombatAdapter({ matrix: factionMatrix });
/** Every combat root answers hits through the resolver, wherever it sits. */
const combatActorOf = (object, { root }) => root.userData.combatActor;

/**
 * The node a wound has to hang on: the one a POSE moves.
 *
 * The second half of the owner's *"when you shoot the civilians the decals
 * float in the air. I thought we had implemented the fix for this game
 * wide?"* — the fix is in `src/world/blood.js`, which attaches a wound to a
 * caller-chosen anchor and moves it with that anchor forever after. Nothing
 * in this game supplied one. Without `anchorOf`, `CombatImpactResolver`
 * falls back to the registered ROOT, and `HeistFigure` deliberately never
 * touches its root: the root is where the level put the body, and every pose
 * — kneeling, prone, restrained, fallen — is written onto the `tilt` group
 * inside it.
 *
 * So a customer took a round standing up, wore the wound at chest height,
 * and then lay down out from under it. The blood stayed at 1.3 m in the air
 * where a man used to be. Anchored to `tilt`, it goes down with him.
 */
const bodyAnchorOf = (object, { root }) => root.userData.figure?.tilt ?? root;

/** Every person in this scene is registered the same way. See `bodyAnchorOf`. */
const HEIST_BODY_DESCRIPTOR = Object.freeze({
  actor: combatActorOf,
  anchorOf: bodyAnchorOf,
});
const loadout = new HeistLoadout();
const viewModel = makeHeistViewModel(camera);
/** Kept as the name the rest of the file reads: whatever is in Tony's hands. */
let weapon = loadout.weapons.carbine;
const suppression = new SuppressionModel();
const loot = new LootLedger(createHeistBags());
/**
 * How many officers each contact can ever produce, and where they come in.
 *
 * Owner, on the street: *"no direction on what to do — implement the
 * escape-to-garage objective plus WAVES OF COPS ... so the street withdrawal
 * is an actual fight"*. It was not a fight: the whole withdrawal spawned
 * five officers once, four more at the second contact, and if you put two
 * down the street was empty and stayed empty while you walked the length of
 * it. Nine men, once, is an encounter; the beat is written as a running
 * gunfight down a street with a dead van in it.
 *
 * The budgets are the TOTAL each block can ever field, spent a wave at a
 * time by `updatePoliceWaves`. The number alive at once is bounded
 * separately by `PERFORMANCE_BUDGET`, and downed officers are recycled into
 * later waves rather than each wave building new figures — so a fourteen-man
 * contact costs the frame what a six-man one does.
 */
const police = new PoliceDirector({
  bank_avenue: { budget: 14, gates: ['north', 'east', 'cruisers'] },
  market_street: { budget: 12, gates: ['alley', 'scaffold', 'loading'] },
  mercer_garage: { budget: 10, gates: ['ramp', 'stairs'] },
});
const hostages = new HostageDirector(createLobbyHostages());
const objective = new HeistObjectiveLedger({
  totalBags: 8, civiliansPresent: hostages.hostages.length,
});
/** Eight ties. Enough to hold the room, not enough to hold all of it. */
const ZIP_TIE_STOCK = 8;
let zipTies = ZIP_TIE_STOCK;
const vehicle = new GroundVehicle(HEIST_ESCAPE_VEHICLE_CONFIG);
const escapeStart = { x: -480, z: 22, heading: 0 };
vehicle.x = escapeStart.x;
vehicle.z = escapeStart.z;
vehicle.heading = escapeStart.heading;
const fixedStep = new FixedStepRunner({ hz: 120, maxSteps: 8 });
const checkpoints = new CheckpointDirector();
const crew = buildHeistCrew(level.phases.safehouse.group);
const preparation = new SafehousePreparation();
const guardThreat = new BankGuardThreat({ windowSeconds: 2.75 });
const lobbyGuardActor = new CombatActor({
  id: 'bank_lobby_guard', faction: FACTIONS.POLICE, maxHealth: 38, armor: 0,
});
level.phases.bank.interactables.guard.userData.combatActor = lobbyGuardActor;
combat.register(level.phases.bank.interactables.guard, HEIST_BODY_DESCRIPTOR);
const rearGuardActor = new CombatActor({
  id: 'bank_rear_guard', faction: FACTIONS.POLICE, maxHealth: 38, armor: 0,
});
level.phases.bank.interactables.rearGuard.userData.combatActor = rearGuardActor;
combat.register(level.phases.bank.interactables.rearGuard, HEIST_BODY_DESCRIPTOR);

/**
 * Everybody in the lobby is now a thing a bullet can find.
 *
 * The owner's note was *"if I shoot people nothing happens"*, and it was
 * literally true: only the two police box-meshes carried a `combatActor`, so
 * every round into a civilian, a crew member, the manager or the rear guard
 * passed straight through geometry with no actor on it. `FactionMatrix`
 * already had the policy — a player's careless round may hit a civilian, a
 * crew round may never hit crew — and nothing was asking it.
 */
const hostageActors = new Map();
for (const [index, figureRoot] of level.phases.bank.civilians.entries()) {
  const hostageId = figureRoot.userData.hostageId;
  const actor = new CombatActor({
    id: hostageId, faction: FACTIONS.CIVILIAN, maxHealth: 34, armor: 0,
  });
  figureRoot.userData.combatActor = actor;
  figureRoot.userData.civilianIndex = index;
  hostageActors.set(hostageId, actor);
  /* A hostage may only be reached by a round whose honest trace reaches them:
   * the resolver answers to `resolvePlayerShot`'s first visible hit, so a wall
   * between the muzzle and this figure is a wall, for every caller. */
  combat.register(figureRoot, HEIST_BODY_DESCRIPTOR);
}
const managerActor = new CombatActor({
  id: 'bank_manager', faction: FACTIONS.CIVILIAN, maxHealth: 40, armor: 0,
});
level.phases.bank.interactables.manager.userData.combatActor = managerActor;
combat.register(level.phases.bank.interactables.manager, HEIST_BODY_DESCRIPTOR);

/** Return a scene-owned actor to the state a fresh bank build gives it. */
function resetLobbyCombatActor(actor) {
  actor.restore({
    id: actor.id,
    health: actor.maxHealth,
    armor: 0,
    injury: 'none',
    incapacitated: false,
    suppression: 0,
    role: null,
    anchor: null,
    carrying: null,
  });
}

const CREW_ROLE_LABEL = Object.freeze({
  leader: 'LEAD', driver: 'WHEELS', technical: 'SYSTEMS', heavy: 'BAGS', control: 'LOBBY',
});
const CREW_INTRO_LINE = Object.freeze({
  [CHARACTER_IDS.SNOW]: 'crew_snow',
  [CHARACTER_IDS.RIPPINFLOW]: 'crew_rippin',
  [CHARACTER_IDS.SHUBENATOR]: 'crew_shubes',
  [CHARACTER_IDS.DEATHMEGATRON]: 'crew_death',
  [CHARACTER_IDS.NUMBSKULL]: 'crew_numb',
});
const crewStrip = document.getElementById('crew-strip');
for (const actor of crew.values()) {
  const item = document.createElement('div');
  item.className = 'crew';
  const name = document.createElement('b');
  name.textContent = actor.identity.subtitleName;
  const role = document.createElement('small');
  role.textContent = CREW_ROLE_LABEL[actor.role] ?? actor.role.toUpperCase();
  item.append(name, role);
  crewStrip.append(item);
}
const SQUAD_FORMATIONS = HEIST_SQUAD_FORMATIONS;
const squadAnchorIds = heistSquadAnchorIds();
const squadGraph = new AuthoredNavigationGraph(Object.entries(SQUAD_FORMATIONS).flatMap(([zone, positions]) => (
  positions.map((position, index) => ({
    id: `${zone}_${index}`,
    zone,
    neighbors: squadAnchorIds.filter((id) => id !== `${zone}_${index}`),
    recovery: index === positions.length - 1,
  }))
)));
for (const [index, actor] of [...crew.values()].entries()) {
  actor.anchor = `safehouse_${index}`;
  squadGraph.occupy(actor.anchor, actor.id);
}
const squad = new SquadDirector({ graph: squadGraph, actors: crew });

const machine = new HeistMissionMachine({
  onTransition: ({ to }) => {
    dialogue.setState(to);
    hud.setPhase(PHASE_FOR_STATE[to] ?? 'MISSION');
    /* THE OBJECTIVE IS READ OFF THE STATE, ON EVERY TRANSITION.
     *
     * It used to be written by whichever `E` press happened to cause the
     * transition, which meant a mission entered at a checkpoint — a preview
     * link, a save resume, a failure restore — never set one at all and the
     * HUD kept `heist.html`'s static "Meet the crew." for the whole job. See
     * `./orders.js` for the full account. Restores go through here too:
     * `HeistMissionMachine.restore` calls `onTransition`. */
    refreshObjective(to);
    window.__heistDebug.state = to;
  },
});

/**
 * Put the standing order on the HUD.
 *
 * Called on every mission transition and after any interaction that changes a
 * sub-step inside a state (a bag picked up, an officer down, the vest on).
 * Cheap enough to call freely: it is a table lookup and a `textContent` write.
 *
 * @param {string} [state] defaults to wherever the machine is now
 */
/**
 * A sentence that is allowed to sit on top of the standing order for a moment.
 *
 * Exactly one thing needs this — the failure notice, which has to be readable
 * for the second between the guard firing and the checkpoint restore taking
 * the screen back. Everything else is a state and belongs in `orders.js`.
 */
let objectiveOverrideUntil = 0;
function announceObjective(text, seconds = 2.5) {
  objectiveOverrideUntil = performance.now() / 1000 + seconds;
  hud.setObjective(text);
}

function refreshObjective(state = machine.state) {
  if (performance.now() / 1000 < objectiveOverrideUntil) return;
  /* THE SWAP IS THE ONE BEAT THAT IS A LIST.
   *
   * Seven named actions, three of them locked behind another one, and the old
   * order line named three of the seven and counted all of them — which is how
   * a player ends up at 6/7 in a dark yard with nothing on screen telling him
   * what the seventh is. `swapEvidencePlan` puts all seven in the shared
   * objective panel with the count on the first row. Everywhere else the order
   * is a sentence, because everywhere else it is one thing. */
  if (state === 'VEHICLE_SWAP') {
    hud.setObjectivePlan(swapEvidencePlan(swapProgress));
    return;
  }
  hud.setObjective(objectiveForState(state, {
    armorReady: preparation.armorReady,
    loadoutReady: preparation.loadoutReady,
    maskWorn: loadout.maskWorn,
    lobbyControlled,
    rearGuardSecured,
    managerEscortProgress,
    carryingBag,
    bankBagsStaged,
    officersDown,
    officersNeeded: officersNeeded(),
    droppedBagDecision,
    weaponsDown,
    swapProgress,
    zipTies,
    /* The score, for the orders that read it back. Kept live rather than
     * snapshotted at the count, because a checkpoint entered straight into
     * the debrief has a ledger and no count event to have run. */
    bagsRecovered: objective.bagsRecovered,
    totalBags: objective.totalBags,
    civilianCasualties: objective.civilianCasualties,
    /* The lobby sweep. See `noteCustomerDown`. */
    noWitnesses,
    witnessesLeft: noWitnesses ? witnessesRemaining() : 0,
  }));
}

const sceneInventory = new SceneInventoryBar({
  slots: 5,
  visible: false,
  catalog: HEIST_ITEM_CATALOG,
});

let dialogueEndAt = 0;
let activeDialogueSource = null;
/* Every line that actually started, in order. The subtitle only shows the
 * current one, and on a slow machine several lines can come and go between two
 * checks — so "did this beat speak" has to be asked of a history, not a div. */
const spokenLines = [];
/* Mission-command lines are not disposable barks. If a checkpoint rebuilds
 * the arbiter while one is waiting behind another command, the backlog feeds
 * it back onto the bus instead of silently losing Lou for the rest of the job. */
const missionCommandBacklog = [];
/** Shut every mouth in the scene. Called wherever the take itself is cut. */
function hushCrew() {
  for (const actor of crew.values()) actor.figure.hush();
  for (const figure of Object.values(level.phases.bank.figures)) figure.hush();
  for (const root of level.phases.bank.civilians) root.userData.figure?.hush();
}

/**
 * Which hostage is about to speak.
 *
 * `sayPooled` is handed a POOL and a response key; it has no idea which of
 * the twenty-two people in the room the line belongs to. The two places that
 * do know — a verb applied to somebody, and somebody pleading under the
 * crosshair — set this immediately before pushing, and `onStart` consumes it.
 * One frame's worth of state, cleared on use, because a stale one would move
 * the wrong mouth.
 */
let pendingBarkSpeaker = null;

/**
 * The figure that is actually saying a line, whoever it belongs to.
 *
 * THE VAULT MOUTHS. Owner: *"mouths don't animate"* in the vault, and this
 * was why — the line below used to be `crew.get(line.speakerId)` and nothing
 * else. `crew` holds five people. Every OTHER speaker in this bank — the
 * manager who stalls at the vault door for the whole beat, the two guards,
 * and all twenty-two customers — is an `npcLine` with a speakerId that is not
 * a campaign character id, so `crew.get()` returned undefined and their
 * mouths were never told a line had started.
 *
 * Every one of them is a `HeistFigure` with a working `Mouth` on it already
 * (`people.js` builds one for everybody, deliberately, because everybody in
 * this bank can talk). Nothing needed building; the lookup needed widening.
 */
function figureForLine(line) {
  const actor = line.speakerId ? crew.get(line.speakerId) : null;
  if (actor?.figure) return actor.figure;
  const bank = level.phases.bank;
  if (line.subtitleName === 'Bank Manager') return bank.figures.manager;
  if (line.subtitleName === 'Security Guard') {
    return rearGuardSecured ? bank.figures.guard : bank.figures.rearGuard;
  }
  if (line.subtitleName === 'Bank Customer' || line.subtitleName === 'Teller') {
    const id = pendingBarkSpeaker;
    pendingBarkSpeaker = null;
    const root = id
      ? bank.civilians.find((figure) => figure.userData.hostageId === id)
      : null;
    return root?.userData.figure ?? null;
  }
  // Lou is on a radio and Tony is behind the camera. Neither has a face here.
  return null;
}

const dialogue = new DialogueArbiter({
  onStart(line) {
    spokenLines.push(line.id);
    if (spokenLines.length > 200) spokenLines.shift();
    const commandIndex = missionCommandBacklog.indexOf(line.id);
    if (commandIndex >= 0) missionCommandBacklog.splice(commandIndex, 1);
    try { activeDialogueSource?.stop?.(); } catch { /* already ended */ }
    /* Whatever the last speaker was still saying, he has stopped -- the source
     * above was just cut, and a mouth left running would carry on without it. */
    hushCrew();
    const duration = speechDuration(audio, line.cue, line.fallbackDuration);
    hud.say(line, duration);
    /* The person who is saying it says it — crew, manager, guard or the
     * customer on the floor. See `figureForLine`; it used to be `crew.get()`
     * alone, which is why nothing in the vault or the lobby moved a mouth. */
    const figure = figureForLine(line);
    /* Through `speak()`, which is the shared dialogue path in
     * src/core/dialogue.js: one voice bus with one trim, music and ambience
     * ducked under the line, the analyser tapped for the mouth, and a
     * positional mix so a robber shouting across the lobby is further away
     * than one at your shoulder.
     *
     * This used to be `audio.play(line.cue, { volume: 0.85, analyse: true })`.
     * Two things were wrong with it. The 0.85 was THE TAKE's own guess at how
     * loud dialogue is, and every other scene had a different one. And there
     * was no mix at all, so every line in the bank arrived at full level from
     * nowhere in particular — the manager face-down behind the counter as
     * present as Snow next to you.
     *
     * `bus: 'voice'` inside `speak()` is what carries the `heist.` prefix,
     * which the engine cannot classify by name: `heist.snow.commit` is a line
     * and `heist.cash.lift` is a sound effect (ENGINE-TRAPS.md entry 4). */
    const spoken = speak(audio, line.cue, {
      speaker: figure?.group ?? figure?.root ?? null,
      /* In the room, or in the car. `heistSpeechMix` carries the measurement:
       * the crew stand in the swap yard for the whole escape, so a panned line
       * during the drive arrives from up to 898 m away at 1.8/d of its level
       * and is never heard. */
      mix: heistSpeechMix({ driving, figure }),
      gain: SPEECH_GAIN.normal,
    });
    activeDialogueSource = spoken.source;
    /* `Mouth` reads the RMS off the take's own analyser, so this is the sound
     * driving the face rather than a timer next to it (ENGINE-TRAPS entry 8).
     * The `fallback` envelope is reached only where there is no recording. */
    figure?.say(
      duration,
      activeDialogueSource ? { audio, source: activeDialogueSource } : null,
    );
    dialogueEndAt = performance.now() / 1000 + duration;
  },
});
dialogue.setState(machine.state);

let started = false;
let lobbyControlled = false;
let rearGuardSecured = false;
let managerEscortProgress = 0;
let guardFailures = 0;
let bankBagsStaged = 0;
let carryingBag = null;
/* The mesh riding in the player's hand. Held alongside the id because the
 * street copy of cash_8 is the 'dropped-bag' prop, so the id-derived name
 * lookup cannot find it — and a per-frame recursive search over a whole phase
 * group is money spent on nothing. */
let carriedBagMesh = null;
let droppedBagDecision = null;
let officersDown = 0;
let driving = false;
let roadblockHit = false;
let routeIndex = 0;
let offroadHitCooldown = 0;
let driveCollisionCooldown = 0;
let driveInvalidFor = 0;
let driveStuckFor = 0;
let inventorySignature = '';
let policeHeat = 0;
let controlWarned = false;
let lobbyHeldAnnounced = false;
/* Cooldowns on the ambient warnings: twenty-two people breaking at once is one
 * situation, not twenty-two lines. */
let lootSyncAt = 0;
let runnerBarkAt = 0;
let alarmBarkAt = 0;
let controlBarkAt = 0;
let waveBarkAt = 0;
let friendlyFireBarkAt = 0;
let policeFigures = [];
let handbrake = 0;
let pursuitCount = 1;
let copsLost = false;
let pursuitWarned = false;
/* How hard the pursuit is leaning on a car that has stopped running. */
let pursuitPressure = 0;
let ramCooldown = 0;
let ramBarkAt = 0;
let pressureBarkAt = 0;
let weaponsDown = false;
const crewIntroduced = new Set();
const SCREEN_CENTER = new THREE.Vector2(0, 0);

/**
 * The crew are shootable-at and structurally unshootable.
 *
 * `FactionMatrix` refuses crew-on-crew damage, so a round into Snow does
 * nothing to Snow — but it now registers as friendly fire against the player's
 * own discipline score and he gets told about it, which is the difference
 * between a rule and a wall.
 */
for (const actor of crew.values()) {
  actor.combatActor = new CombatActor({
    id: `crew_${actor.id}`, faction: FACTIONS.CREW, maxHealth: 100, armor: 40, core: true,
  });
  actor.group.userData.combatActor = actor.combatActor;
  combat.register(actor.group, HEIST_BODY_DESCRIPTOR);
}

/**
 * The bar, the hands, and the trigger, kept in agreement.
 *
 * Two owner notes live here: *"I cant switch inventory items"* and *"I also
 * cant see whats in my hand"*. The bar was mounted and then written to once
 * with a fixed list, with no selection, no key bound to a slot, and no
 * view-model — so it was a picture of a loadout. `HeistLoadout` owns the model,
 * `1`–`5` and the wheel move the selection, and `makeHeistViewModel` draws
 * whatever the selection is at the bottom of the frame.
 */
function syncHeistInventory(force = false) {
  const changed = loadout.setSlots({
    armed: preparation.loadoutReady,
    mask: preparation.loadoutReady,
    bag: carryingBag ? 'cash_bag' : (preparation.loadoutReady ? 'duffel' : null),
    /* SLOT FIVE, WHICH COULD NOT BE SELECTED.
     *
     * The owner's note was *"inventory slot 5 cannot be selected"* and the
     * cause was a contradiction between two lines. The keys only existed
     * while `driving || state === 'SECONDARY_CAR_LOAD'` — and `selectSlot`
     * refuses every press while `driving`. So slot five was empty for the
     * whole mission except one state, and in the one state it was filled the
     * player could not press it.
     *
     * Shubenator hands the garage car's keys out at the briefing, which is
     * where they would be handed out, so they are in Tony's pocket from the
     * moment he takes his kit off the bench. Five slots, five things. */
    keys: preparation.loadoutReady,
  });
  const signature = `${loadout.items.join('|')}#${loadout.selected}`;
  if (!force && !changed && signature === inventorySignature) return;
  inventorySignature = signature;
  sceneInventory.set(loadout.items, loadout.selected);
  weapon = loadout.activeWeapon ?? loadout.weapons.carbine;
  /* NOT WHILE DRIVING.
   *
   * Owner: *"third-person camera shows the player's gun floating behind the
   * car"*. The view model is parented to the CAMERA — which is correct and is
   * what puts it at the bottom of a first-person frame — and the escape drive
   * swings that same camera eleven metres behind the car. So the carbine went
   * with it: a rifle and a pair of gloved hands hanging in the air over the
   * road, in shot, for the whole chase. Nothing is in Tony's hands while they
   * are on a steering wheel. */
  viewModel.show(driving ? null : loadout.selectedItem);
  refreshAmmoReadout();
}

function refreshAmmoReadout() {
  const active = loadout.activeWeapon;
  if (!active) {
    const item = loadout.selectedItem;
    hud.setAmmo('—', loadout.tiesInHand ? `${zipTies} TIES` : '', item
      ? (HEIST_ITEM_CATALOG[item]?.name ?? item).toUpperCase() : 'EMPTY HANDS');
    return;
  }
  /* Reserve is the catalog's loose-round count now, straight off `Firearm`. */
  hud.setAmmo(active.magazine,
    `/ ${active.reserveRounds}`,
    active.definition.name ?? 'CONTROLLED');
}

/**
 * Taking your kit off the bench moves the briefing along.
 *
 * The gear used to be gated behind reaching `LOADOUT`, which you reach by
 * pressing E on the briefing table twice — so a player who walked to the vest
 * first found a prop with no prompt on it. The mission follows the player
 * instead: pick anything up and the crew have finished talking about the plan.
 */
function readyBriefing() {
  if (machine.state === 'CREW_INTRO') {
    advanceTo('BRIEFING');
    sayInTurn('snow_plan', 'snow_rules', 'rippin_route');
  }
  if (machine.state === 'BRIEFING') {
    advanceTo('LOADOUT');
    sayInTurn('shubes_case', 'death_bags', 'numb_alarm');
  }
}

/**
 * The vest, made real.
 *
 * `playerActor` was built with 35 points of armour permanently, whether or not
 * the player had picked a carrier up — so the one mechanical consequence of
 * the vest was already applied before he touched it, which is the other half
 * of "picking up the vest appears to do nothing". Armour is the carrier now,
 * and the HUD band shows it.
 */
function syncPlayerArmor() {
  playerActor.armor = preparation.armorReady ? 35 : 0;
  hud.setArmor(playerActor.armor / 35);
}

/** `1`–`5`, the wheel, and `Tab`-free: a slot the player can actually pick. */
function selectSlot(index) {
  if (!started || driving) return false;
  if (!loadout.select(index)) return false;
  audio.play('heist.weapon.check', { volume: 0.4, rate: 1.15 });
  syncHeistInventory(true);
  return true;
}

function cycleSlot(direction) {
  if (!started || driving) return false;
  if (!loadout.cycle(direction)) return false;
  audio.play('heist.weapon.check', { volume: 0.35, rate: 1.2 });
  syncHeistInventory(true);
  return true;
}
let drivingRecovery = false;
const swapProgress = {
  trunk: false, bags: false, aid: false, masks: false,
  jackets: false, weapons: false, wiped: false,
};
let latestCheckpoint = null;
let recoveryCheckpoint = null;
let activePhase = null;
let missionCompleted = false;
let simulationPaused = false;
const activeEffects = [];
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pursuitTarget = new THREE.Vector3();
const muzzle = new THREE.PointLight(0xffc35c, 0, 4, 2);
camera.add(muzzle);
const impactPool = Array.from({ length: Math.min(32, PERFORMANCE_BUDGET.maxImpactParticles) }, () => {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 5, 4),
    new THREE.MeshBasicMaterial({ color: 0xd7c29b }),
  );
  mesh.visible = false;
  mesh.userData.life = 0;
  scene.add(mesh);
  return mesh;
});
const casingPool = Array.from({ length: Math.min(24, PERFORMANCE_BUDGET.maxCasings) }, () => {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.07, 5),
    new THREE.MeshBasicMaterial({ color: 0xc7a455 }),
  );
  mesh.visible = false;
  mesh.userData.life = 0;
  scene.add(mesh);
  return mesh;
});

/* Blood is the SHARED systems from `src/world/blood.js` now — the same
 * attached wounds, arterial spurts and spreading death pools every other
 * scene leaves — instead of the scene-local sphere pools that used to stand
 * in for them (the last blood Locality the reusable-systems doc had on its
 * books for THE TAKE). All three are bounded at construction; the death pools
 * keep answering to the scene's decal budget. Every phase floor a body can
 * fall on in this mission is at y 0, so the pools' explicit floor stays 0. */
const bloodImpacts = new BloodImpactSystem(scene);
const bloodSpurts = new BloodSpurtSystem(scene, { capacity: 48 });
const deathPools = new DeathBloodPool(scene, {
  capacity: Math.min(24, PERFORMANCE_BUDGET.maxDecals),
});
combat.attachBlood({
  impacts: bloodImpacts, spurts: bloodSpurts, pools: deathPools, floorYFor: () => 0,
});

window.__heistDebug = {
  /* The scene graph itself, for tooling that has to walk it.
   * `tools/scene-audit.mjs` finds a scene by looking for `isScene` on a global
   * or on a global's `scene`/`root`; THE TAKE was the one mission it could not
   * audit at all — it reported "no THREE.Scene reachable" and moved on, which
   * is worse than a page of findings because it looks like a clean bill. */
  scene,
  state: machine.state,
  phase: null,
  preview: isPreviewMode(),
  difficulty: previewDifficultyForLocation(),
  crewIds: HEIST_CREW_IDS,
  crewHuman: [...crew.values()].every((actor) => actor.identity.species === 'human'),
  policeActive: 0,
  policeSpawned: 0,
  fixedSteps: 0,
  poolUsage: { police: 0, effects: 0 },
  checkpoint: null,
  consoleErrors: [],
  start: () => begin(),
  use: (name) => debugUse(name),
  neutralizePolice: () => debugNeutralizePolice(),
  probePoliceRecycle: (id) => debugProbePoliceRecycle(id),
  driveToNextNode: () => debugDriveToNextNode(),
  forceDriveRecovery: () => debugForceDriveRecovery(),
  poseForEvidence: (name) => debugPoseForEvidence(name),
  poseForCrew: (id) => debugPoseForCrew(id),
  probeCollision: () => debugProbeCollision(),
  fail: (reason = 'verifier_failure') => failMission(reason),
  snapshot: () => debugSnapshot(),
  selectSlot: (index) => selectSlot(index),
  cycleSlot: (direction = 1) => cycleSlot(direction),
  aimAt: (id) => debugAimAt(id),
  approachInteraction: (name) => debugApproachInteraction(name),
  hostageVerb: (id, verb) => debugHostageVerb(id, verb),
  shootHostage: (id) => debugShootHostage(id),
  /**
   * What the renderer actually did last frame.
   *
   * A scene this size can go quietly from "detailed" to "unplayable" without
   * anything failing, so the numbers are exposed and the verifier asserts on
   * them. Draw calls and triangles are the two that move.
   */
  renderInfo: () => ({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
    shadows: keyLight.castShadow,
  }),
  /**
   * What is actually under the crosshair, and how far away.
   *
   * "The prompt did not appear" has too many possible causes to guess at —
   * out of range, a soft target losing to a solid one, an occluder with no
   * descriptor stopping the walk, a proxy the camera is inside. This reports
   * the raw hit list so the answer is readable instead of inferred.
   */
  probeCrosshair: (far = 8) => {
    const probe = new THREE.Raycaster();
    probe.far = far;
    probe.setFromCamera(SCREEN_CENTER, camera);
    const phase = level.phases[activePhase];
    return {
      eye: player.position.toArray().map((v) => Number(v.toFixed(2))),
      yaw: Number(player.yaw.toFixed(3)),
      hits: probe.intersectObject(phase.group, true).slice(0, 6).map((hit) => ({
        name: hit.object.name || hit.object.parent?.name || '(unnamed)',
        distance: Number(hit.distance.toFixed(2)),
      })),
      current: interaction.current?.name ?? null,
      interactionFar: interaction.raycaster.far,
      paused: interaction.paused,
    };
  },
  /** What the key handlers actually recorded, for input-binding checks. */
  inputState: () => ({
    keys: [...player.keys], driving, selected: loadout.selected,
    selectedItem: loadout.selectedItem, paused: simulationPaused,
    adapter: input?.snapshot?.() ?? null,
  }),
  /**
   * Step the driving simulation for a fixed number of simulated seconds.
   *
   * The scene renders at about one frame a second under the software
   * rasteriser these gates run on, so "hold the throttle for three wall-clock
   * seconds and expect sixty miles an hour" measures the rasteriser rather
   * than the car. This advances the same `updateDriving` the frame loop calls,
   * at a fixed step, so the physics can be asserted honestly. The key state it
   * reads is whatever real input put there.
   */
  simulateDriving: (seconds = 3, step = 1 / 60) => {
    if (!driving) return { ok: false, reason: 'not_driving' };
    const frames = Math.max(1, Math.round(seconds / step));
    for (let i = 0; i < frames; i++) updateDriving(step);
    return {
      ok: true,
      speed: vehicle.speed,
      mph: Math.abs(vehicle.speed) * 2.237,
      x: vehicle.x,
      z: vehicle.z,
      routeIndex,
      collisionDamage: vehicle.collisionDamage,
    };
  },
  /** Point the car at a heading and place it, for the barrier probes. */
  placeCar: (x, z, heading, options = {}) => {
    if (!driving) return { ok: false, reason: 'not_driving' };
    vehicle.x = x;
    vehicle.z = z;
    vehicle.heading = heading;
    vehicle.speed = 0;
    vehicle.lateralSlip = 0;
    /* "Put the car here and start clean" has to include the recovery flag. It
     * did not, so a recovery that fired during the previous probe stayed armed
     * across this call and ate the next 650 ms of driving — which is most of a
     * scripted route run. The pending `setTimeout` clearing it again is
     * harmless. */
    drivingRecovery = false;
    driveInvalidFor = 0;
    driveStuckFor = 0;
    if (options.resetRoute) { routeIndex = 0; roadblockHit = false; }
    if (options.resetDamage) {
      vehicle.collisionDamage = 0;
      vehicle.engineHealth = 100;
      vehicle.tireGrip = 1;
    }
    return { ok: true, routeIndex, collisionDamage: vehicle.collisionDamage };
  },
  routePlan: () => level.phases.driving.route.map((node) => ({
    id: node.id, x: node.x, z: node.z, heading: node.heading, turn: node.turn, label: node.label,
  })),
};

/**
 * Stand in front of a named lobby civilian and put the crosshair on them.
 *
 * Deliberately moves the player as well as turning him: aiming across a room
 * with twenty-two people in it is not a deterministic way to select one of
 * them, and a verifier that thinks it is aiming at hostage_1 while the ray is
 * stopped by hostage_9 proves nothing.
 */
function debugAimAtPolice(entry) {
  if (!entry || entry.root.userData.phaseId !== activePhase) {
    return { ok: false, reason: 'missing' };
  }
  const root = entry.root;
  const world = root.getWorldPosition(new THREE.Vector3());
  for (const radius of [3.2, 4.8, 6.4]) {
    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * Math.PI * 2;
      player.position.set(
        world.x + Math.cos(angle) * radius,
        1.66,
        world.z + Math.sin(angle) * radius,
      );
      player.velocity.set(0, 0, 0);
      const dx = world.x - player.position.x;
      const dz = world.z - player.position.z;
      const horizontal = Math.max(0.001, Math.hypot(dx, dz));
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.atan2(1.15 - player.position.y, horizontal);
      player.update(1 / 60);
      camera.updateMatrixWorld(true);
      raycaster.setFromCamera(SCREEN_CENTER, camera);
      const hit = raycaster.intersectObject(level.phases[activePhase].group, true)[0];
      if (hit && actorFor(hit.object) === root) {
        return { ok: true, id: entry.actor.id, distance: horizontal, rootUuid: root.uuid };
      }
    }
  }
  return { ok: false, reason: 'no_clear_shot', id: entry.actor.id };
}

function debugAimAt(actorId) {
  const policeEntry = policeFigures.find((entry) => entry.actor.id === actorId);
  if (policeEntry) return debugAimAtPolice(policeEntry);
  const root = actorId === managerActor.id
    ? level.phases.bank.interactables.manager
    : actorId === rearGuardActor.id
      ? level.phases.bank.interactables.rearGuard
      : level.phases.bank.civilians
        .find((figure) => figure.userData.hostageId === actorId);
  if (!root || activePhase !== 'bank') return { ok: false, reason: 'missing' };
  const world = root.getWorldPosition(new THREE.Vector3());
  /* Stand somewhere the crosshair can only be on THIS person. A queue in a
   * bank is people 1.6 m apart, so a naive "back off along the room's axis"
   * puts the camera inside their neighbour and the ray never gets past them.
   * Sample the circle and take the stand-off with the most daylight. */
  const others = [
    ...level.phases.bank.civilians.filter((figure) => figure !== root),
    ...[...crew.values()].map((actor) => actor.group),
    ...[
      level.phases.bank.interactables.manager,
      level.phases.bank.interactables.rearGuard,
    ].filter((figure) => figure !== root),
  ].map((figure) => figure.getWorldPosition(new THREE.Vector3()));
  let best = null;
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const spot = new THREE.Vector3(
      world.x + Math.cos(angle) * 2.2, 1.66, world.z + Math.sin(angle) * 2.2,
    );
    if (Math.abs(spot.x) > 10 || spot.z > 10 || spot.z < -8) continue;
    let clearance = Infinity;
    for (const other of others) {
      // Distance from the other person to the segment camera -> target.
      const ax = world.x - spot.x;
      const az = world.z - spot.z;
      const t = Math.max(0, Math.min(1,
        ((other.x - spot.x) * ax + (other.z - spot.z) * az) / (ax * ax + az * az)));
      clearance = Math.min(clearance,
        Math.hypot(other.x - (spot.x + ax * t), other.z - (spot.z + az * t)));
    }
    if (!best || clearance > best.clearance) best = { spot, clearance };
  }
  if (!best) return { ok: false, reason: 'no_stand_off' };
  player.position.copy(best.spot);
  player.velocity.set(0, 0, 0);
  const dx = world.x - player.position.x;
  const dz = world.z - player.position.z;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = 0;
  player.update(1 / 60);
  return { ok: true, distance: Math.hypot(dx, dz), clearance: best.clearance };
}

/**
 * Find a real, unobstructed first-person interaction ray to a named target.
 *
 * Browser verification still presses the production E key. This helper only
 * removes camera-placement luck from crowded rooms by sampling legal nearby
 * viewpoints and asking the live InteractionSystem which object it sees.
 */
function debugApproachInteraction(name) {
  const target = interaction.targets.find((mesh) => mesh.name === name);
  if (!target) {
    return { ok: false, reason: 'missing_target', names: interaction.targets.map((mesh) => mesh.name) };
  }
  const descriptor = target.userData.interact;
  if (descriptor.enabled && !descriptor.enabled()) return { ok: false, reason: 'disabled' };

  target.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(target);
  const center = bounds.getCenter(new THREE.Vector3());
  const height = Math.max(0.1, bounds.max.y - bounds.min.y);
  const aimHeights = [
    center.y,
    bounds.min.y + height * 0.68,
    bounds.min.y + height * 0.42,
  ];

  /* Only sample from somewhere the player could actually stand. Without this
   * the ring happily reports a target reachable from inside the geometry that
   * occludes it -- see PHASE_PLAYER_BOUNDS. */
  const legal = PHASE_PLAYER_BOUNDS[activePhase];
  const standable = (x, z) => !legal
    || (x >= legal[0] && x <= legal[1] && z >= legal[2] && z <= legal[3]);
  let sampled = 0;

  for (const radius of [1.35, 1.7, 2.05, 2.35]) {
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2;
      const px = center.x + Math.cos(angle) * radius;
      const pz = center.z + Math.sin(angle) * radius;
      if (!standable(px, pz)) continue;
      sampled += 1;
      player.position.set(px, 1.66, pz);
      player.velocity.set(0, 0, 0);
      player.pitch = 0;
      player.update(1 / 60);

      for (const aimY of aimHeights) {
        const dx = center.x - camera.position.x;
        const dz = center.z - camera.position.z;
        const horizontal = Math.max(0.001, Math.hypot(dx, dz));
        player.yaw = Math.atan2(-dx, -dz);
        player.pitch = Math.atan2(aimY - camera.position.y, horizontal);
        player.update(1 / 60);
        camera.updateMatrixWorld(true);
        interaction.update(1 / 60);
        if (interaction.current === target) {
          return {
            ok: true,
            name,
            distance: camera.position.distanceTo(center),
            current: interaction.current.name,
          };
        }
      }
    }
  }
  return {
    ok: false,
    reason: sampled ? 'no_clear_interaction_ray' : 'no_standable_viewpoint',
    name,
    sampled,
    current: interaction.current?.name ?? null,
  };
}

function debugHostageVerb(hostageId, verb) {
  const root = level.phases.bank.civilians
    .find((figure) => figure.userData.hostageId === hostageId);
  if (!root) return { ok: false, reason: 'missing' };
  return applyHostageVerb(root, verb);
}

/**
 * Mission tooling fires REAL rounds now. The old probe handed 999 damage
 * straight to the actor, which meant a verifier — or anything else that
 * reached this hook — could kill a hostage through a wall. It walks the same
 * honest path as the trigger: stand where the crosshair can only be on this
 * person (`debugAimAt`), trace the ray, and let the shared resolver decide.
 * If geometry is in the way, the answer is `blocked`, not a corpse.
 */
function debugShootHostage(hostageId) {
  const aim = debugAimAt(hostageId);
  if (!aim.ok) return aim;
  const root = level.phases.bank.civilians
    .find((figure) => figure.userData.hostageId === hostageId);
  if (!root) return { ok: false, reason: 'missing' };
  /* From the player's real eye toward the figure's actual centre — a hostage
   * already kneeling or prone is still a legal target, but the ray must still
   * get there through the same geometry every other round obeys. */
  camera.updateMatrixWorld(true);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const target = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  const impact = combat.resolvePlayerShot({
    origin,
    direction: target.sub(origin).normalize(),
    weapon: 'carbine',
    damage: 999,
    penetration: 0.38,
  });
  /* Whatever the round honestly reached owns the consequences — even a probe
   * cannot hurt one person while the ledger pretends it hurt another. */
  const struck = impact.located?.root ?? null;
  if (impact.located?.applied) {
    applyPlayerImpactConsequences(impact.located);
    presentBlood(impact.located);
  }
  if (!struck || struck.userData.hostageId !== hostageId) {
    return { ok: false, reason: 'blocked', hit: impact.hit?.object?.name ?? null };
  }
  return { ok: impact.located.applied === true };
}

function debugProbeCollision() {
  const collider = level.world.colliders[0];
  if (!collider) return { available: false };
  const original = player.position.clone();
  player.position.set(
    (collider.min.x + collider.max.x) / 2,
    1.66,
    (collider.min.z + collider.max.z) / 2,
  );
  player._resolve('x');
  const cx = Math.max(collider.min.x, Math.min(collider.max.x, player.position.x));
  const cz = Math.max(collider.min.z, Math.min(collider.max.z, player.position.z));
  const distance = Math.hypot(player.position.x - cx, player.position.z - cz);
  player.position.copy(original);
  player.velocity.set(0, 0, 0);
  return { available: true, resolved: distance >= 0.299 };
}

let lastEvidenceFrame = null;
let lastPoliceRecycleProbe = null;

/**
 * Deterministic camera marks used only by browser evidence capture.
 *
 * The table itself lives in `./shots.js` now, because the framing gate reads
 * the same marks out of it headlessly (`npm run verify:framing`) and two
 * copies of a camera position drift the moment one of them is nudged -- at
 * which point the screenshot tool and the gate are describing different shots
 * of a scene that only has one camera. `focus` and the NDC test below stay
 * here: they are the browser half, and they ask a different question (does the
 * node project inside the picture) from the gate's (is the aim within a metre
 * of it).
 */
function debugPoseForEvidence(name) {
  const pose = HEIST_CAMERA_MARKS[name];
  if (!pose || activePhase !== pose.phase) return false;
  player.position.fromArray(pose.position);
  player.velocity.set(0, 0, 0);
  player.yaw = pose.yaw;
  player.pitch = pose.pitch ?? 0;
  player.update(1 / 60);
  camera.updateMatrixWorld(true);
  const phase = level.phases[pose.phase];
  phase.group.updateMatrixWorld(true);
  lastEvidenceFrame = {
    name,
    focus: (pose.focus ?? []).map((objectName) => {
      const object = phase.group.getObjectByName(objectName);
      if (!object) return { name: objectName, present: false, inFrame: false };
      const ndc = new THREE.Box3().setFromObject(object)
        .getCenter(new THREE.Vector3())
        .project(camera);
      return {
        name: objectName,
        present: true,
        inFrame: ndc.z >= -1 && ndc.z <= 1 && Math.abs(ndc.x) <= 0.92 && Math.abs(ndc.y) <= 0.92,
        ndc: [ndc.x, ndc.y, ndc.z].map((value) => Number(value.toFixed(3))),
      };
    }),
  };
  return true;
}

function debugPoseForCrew(id) {
  if (activePhase !== 'safehouse') return false;
  const actor = crew.get(id);
  if (!actor) return false;
  const outward = actor.group.position.clone();
  outward.y = 0;
  if (outward.lengthSq() < 0.01) outward.set(0, 0, -1);
  outward.normalize();
  player.position.set(
    actor.group.position.x + outward.x * 1.65,
    1.66,
    actor.group.position.z + outward.z * 1.65,
  );
  const dx = actor.group.position.x - player.position.x;
  const dz = actor.group.position.z - player.position.z;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = 0;
  player.update(1 / 60);
  return true;
}

function debugUse(name) {
  const target = interaction.targets.find((mesh) => mesh.name === name);
  if (!target) return { ok: false, reason: 'missing_target', names: interaction.targets.map((mesh) => mesh.name) };
  const descriptor = target.userData.interact;
  if (descriptor.enabled && !descriptor.enabled()) return { ok: false, reason: 'disabled' };
  descriptor.onUse?.(target);
  return { ok: true, state: machine.state };
}

function debugNeutralizePolice() {
  let removed = 0;
  for (const root of activePoliceMeshes()) {
    const entry = policeEntryFor(root);
    if (!entry) continue;
    entry.actor.incapacitated = true;
    entry.actor.health = 0;
    entry.figure.fallen();
    root.userData.down = true;
    police.remove(root.userData.block);
    removed++;
  }
  officersDown += removed;
  objective.officersDown += removed;
  window.__heistDebug.policeActive = 0;
  refreshInteractions();
  return removed;
}

/** Exercise the real bounded officer-recycle path without spending a wave. */
function debugProbePoliceRecycle(actorId) {
  if (!['street', 'garage'].includes(activePhase)) {
    return { ok: false, reason: 'wrong_phase', phase: activePhase };
  }
  const entry = policeFigures.find((candidate) => candidate.actor.id === actorId
    && candidate.root.userData.phaseId === activePhase);
  if (!entry) return { ok: false, reason: 'missing_actor', actorId };

  const root = entry.root;
  const originalRootUuid = root.uuid;
  const originalPosition = root.position.toArray();
  const block = root.userData.block;
  const phaseId = root.userData.phaseId;
  const directorBefore = police.capture();
  const checkpointBefore = latestCheckpoint;
  const activeBefore = activePoliceMeshes().length;

  entry.actor.restore({
    ...entry.actor.snapshot(), health: 0, armor: 0, incapacitated: true, injury: 'severe',
  });
  entry.figure.setState('down', { blend: false, roll: -0.6 });
  root.userData.down = true;
  root.position.set(player.position.x + 24, 0, player.position.z);

  const recycledRoot = addPoliceFigure({
    id: `${actorId}_recycled`, block, phaseId, position: originalPosition, recycle: true,
  });
  const recycledEntry = policeEntryFor(recycledRoot);
  const directorAfter = police.capture();
  lastPoliceRecycleProbe = {
    ok: !!recycledEntry,
    sameRoot: recycledRoot === root && recycledRoot?.uuid === originalRootUuid,
    rootUuid: recycledRoot?.uuid ?? null,
    actorId: recycledEntry?.actor.id ?? null,
    health: recycledEntry?.actor.health ?? null,
    maxHealth: recycledEntry?.actor.maxHealth ?? null,
    incapacitated: recycledEntry?.actor.incapacitated ?? null,
    pose: recycledEntry?.figure.pose ?? null,
    active: recycledRoot ? activePoliceMeshes().includes(recycledRoot) : false,
    directorUnchanged: JSON.stringify(directorAfter) === JSON.stringify(directorBefore),
    checkpointUnchanged: latestCheckpoint === checkpointBefore,
    activeCountUnchanged: activePoliceMeshes().length === activeBefore,
  };
  return structuredClone(lastPoliceRecycleProbe);
}

function debugDriveToNextNode() {
  if (!driving) return { ok: false, reason: 'not_driving' };
  /* `updateDriving` returns at its first line during a route recovery, so a
   * call made inside that 650 ms window moves the car and advances nothing —
   * silently, while still reporting ok. Six of those in a row is how a wrecked
   * engine turned into a thirty-second timeout with no clue attached. Say so
   * instead: a caller that sees `recovering` knows what it is looking at. */
  if (drivingRecovery) return { ok: false, reason: 'recovering', routeIndex };
  const target = level.phases.driving.route[routeIndex];
  if (!target) return { ok: false, reason: 'route_complete' };
  vehicle.x = target.x + (target.id === 'roadblock' ? 4.5 : 0);
  vehicle.z = target.z;
  vehicle.speed = 5;
  updateDriving(1 / 30);
  return { ok: true, node: target.id, state: machine.state };
}

function debugForceDriveRecovery() {
  if (!driving) return { ok: false, reason: 'not_driving' };
  vehicle.x = 999;
  vehicle.z = 999;
  driveInvalidFor = 5;
  updateDriving(1 / 30);
  return { ok: drivingRecovery, x: vehicle.x, z: vehicle.z };
}

function debugSnapshot() {
  const hotbar = document.getElementById('hotbar');
  const heistPlaybacks = audio.playbacks.filter((entry) => HEIST_VOICE_CUES.includes(entry.name));
  return {
    state: machine.state,
    failure: machine.failure ? { ...machine.failure } : null,
    phase: activePhase,
    evidenceFrame: lastEvidenceFrame ? structuredClone(lastEvidenceFrame) : null,
    checkpoint: latestCheckpoint,
    health: playerActor.health,
    bags: loot.summary(),
    carryingBag,
    bankBagsStaged,
    /* The circle by the doors, and what is actually standing on it. The count
     * and the meshes are reported separately on purpose: `bankBagsStaged` was
     * a number that had never been attached to anything a player can see. */
    staging: (() => {
      const group = level.phases.bank.staging;
      if (!group) return null;
      let duffles = 0;
      for (let i = 1; i <= 8; i++) {
        if (group.getObjectByName(`staged-cash-${i}`)?.visible) duffles++;
      }
      let vaultBagsLeft = 0;
      for (let i = 1; i <= 8; i++) {
        if (level.phases.bank.group.getObjectByName(`cash-${i}`)?.visible) vaultBagsLeft++;
      }
      return {
        staged: group.userData.staged ?? 0,
        duffles,
        vaultBagsLeft,
        at: [group.position.x, group.position.z],
      };
    })(),
    noWitnesses,
    witnessesLeft: witnessesRemaining(),
    officersDown,
    officersNeeded: officersNeeded(),
    policeMovement: policeFigures
      .filter((entry) => entry.root.visible && !entry.actor.incapacitated
        && entry.root.userData.phaseId === activePhase)
      .map((entry) => ({
        id: entry.actor.id,
        mode: entry.movement?.mode ?? 'hold',
        speed: Number((entry.movement?.speed ?? 0).toFixed(3)),
        standoff: Number((entry.movement?.standoff ?? 0).toFixed(2)),
        slot: entry.movement?.slot ?? null,
        position: [
          Number(entry.root.position.x.toFixed(2)),
          Number(entry.root.position.z.toFixed(2)),
        ],
        range: Number(Math.hypot(
          entry.root.position.x - player.position.x,
          entry.root.position.z - player.position.z,
        ).toFixed(2)),
      })),
    policeActive: activePoliceMeshes().length,
    policeTotal: policeFigures.length,
    policeActors: policeFigures.map((entry) => ({
      ...entry.actor.snapshot(),
      maxHealth: entry.actor.maxHealth,
      pose: entry.figure.pose,
      rootUuid: entry.root.uuid,
      visible: entry.root.visible,
      down: entry.root.userData.down === true,
      phaseId: entry.root.userData.phaseId,
    })),
    policeRecycleProbe: lastPoliceRecycleProbe
      ? structuredClone(lastPoliceRecycleProbe) : null,
    routeIndex,
    vehicle: {
      ...vehicle.snapshot(),
      maxForwardSpeed: HEIST_ESCAPE_VEHICLE_CONFIG.maxForwardSpeed,
      pursuitVisible: level.phases.driving.pursuit.visible,
      pursuitDistance: level.phases.driving.pursuit.position.distanceTo(level.phases.driving.car.position),
      pursuitInFrame: (() => {
        if (activePhase !== 'driving' || !level.phases.driving.pursuit.visible) return false;
        const ndc = level.phases.driving.pursuit.getWorldPosition(new THREE.Vector3()).project(camera);
        return ndc.z >= -1 && ndc.z <= 1 && Math.abs(ndc.x) <= 0.96 && Math.abs(ndc.y) <= 0.96;
      })(),
    },
    swap: { ...swapProgress },
    squadAnchors: { ...window.__heistDebug.squadAnchors },
    audioZone,
    missionCompleted,
    simulationPaused,
    inventory: {
      slots: hotbar?.children.length ?? 0,
      declared: hotbar?.dataset.slotCount ?? null,
      visible: !!hotbar && !hotbar.classList.contains('hidden'),
      items: [...sceneInventory.items],
      selected: loadout.selected,
      selectedItem: loadout.selectedItem,
      selectedIsWeapon: loadout.selectedIsWeapon,
      maskWorn: loadout.maskWorn,
      zipTies,
      handsShowing: viewModel.current,
      handsVisible: viewModel.current
        ? viewModel.holders.get(viewModel.current).visible === true : false,
      magazine: loadout.activeWeapon?.magazine ?? null,
      weaponCooldown: loadout.activeWeapon?.cooldown ?? null,
      weaponName: loadout.activeWeapon?.definition.name ?? null,
    },
    hostages: hostages.summary(),
    hostageStates: hostages.hostages.map((person) => person.state),
    hostagePoses: level.phases.bank.civilians.map((figure) => figure.userData.visualState ?? 'stand'),
    objective: {
      ...objective.capture(),
      grade: objective.grade(),
      disciplinedFire: objective.disciplinedFire,
      followedSnow: objective.followedSnow,
      civiliansSafe: objective.civiliansSafe,
      scorecard: objective.scorecard(),
    },
    scale: {
      crew: [...crew.values()].map((actor) => ({ id: actor.id, height: actor.height })),
      civilians: level.phases.bank.civilians
        .map((figure) => figure.userData.figure?.height ?? 0),
      police: policeFigures.map((entry) => entry.figure.height),
      guard: level.phases.bank.figures.guard.height,
      manager: level.phases.bank.figures.manager.height,
    },
    voice: {
      spoken: [...spokenLines],
      queued: [...scriptedSpeech],
      busQueued: dialogue.capture().queue.map((line) => line.id),
      busCurrent: dialogue.current?.id ?? null,
      commandBacklog: [...missionCommandBacklog],
      authored: HEIST_VOICE_CUES.length,
      pending: HEIST_PENDING_CUES.length,
      decoded: HEIST_VOICE_CUES.filter((cue) => audio.hasSample(cue)).length,
      longest: Math.max(0, ...HEIST_VOICE_CUES.map((cue) => audio.sampleDuration(cue) ?? 0)),
      currentDialogue: dialogue.current
        ? {
          id: dialogue.current.id,
          cue: dialogue.current.cue,
          text: dialogue.current.text,
          direction: dialogue.current.direction ?? '',
        }
        : null,
      lastPlayback: heistPlaybacks.at(-1)
        ? {
          name: heistPlaybacks.at(-1).name,
          duration: heistPlaybacks.at(-1).decodedDuration,
          naturalEnd: heistPlaybacks.at(-1).naturalEnd,
        }
        : null,
      subtitleRemaining: Math.max(0, dialogueEndAt - performance.now() / 1000),
    },
    geometry: {
      colliders: level.world.colliders.length,
      floorZones: level.world.floorZones.length,
      bankCivilians: level.phases.bank.civilians.length,
      routeNodes: level.phases.driving.route.length,
      routeBarriers: level.phases.driving.barriers.length,
      drivingObstacles: level.phases.driving.obstacles.length,
      evidence: HEIST_EVIDENCE_GEOMETRY,
    },
    civilianStates: hostages.hostages.map((person) => person.state),
    civilianVisualStates: level.phases.bank.civilians.map((civilian) => civilian.userData.visualState ?? 'stand'),
    guardThreat: guardThreat.snapshot(),
    guardFailures,
    managerEscortProgress,
    managerPosition: level.phases.bank.interactables.manager.position.toArray(),
    lobbyActors: {
      manager: { ...managerActor.snapshot(), maxHealth: managerActor.maxHealth },
      rearGuard: { ...rearGuardActor.snapshot(), maxHealth: rearGuardActor.maxHealth },
      hostages: Object.fromEntries(
        [...hostageActors].map(([id, actor]) => [id, {
          ...actor.snapshot(), maxHealth: actor.maxHealth,
        }]),
      ),
    },
    managerPose: level.phases.bank.interactables.manager.userData.visualState
      ?? level.phases.bank.figures.manager.pose
      ?? 'stand',
    interactionTargets: interaction.targets.map((target) => ({
      name: target.name,
      label: typeof target.userData.interact?.label === 'string' ? target.userData.interact.label : null,
    })),
    currentInteraction: interaction.current ? {
      name: interaction.current.name,
      label: typeof interaction.current.userData.interact?.label === 'string'
        ? interaction.current.userData.interact.label : null,
    } : null,
    presentation: {
      crew: [...crew.values()].map((actor) => {
        const target = activePhase === 'safehouse' ? { x: 0, z: 0.2 } : { x: 0, z: -7 };
        const dx = target.x - actor.group.position.x;
        const dz = target.z - actor.group.position.z;
        const length = Math.max(0.001, Math.hypot(dx, dz));
        const { head, body, profile } = actor.figure.parts;
        const physicalWeapon = body.getObjectByName('crew-carbine') ? 'carbine'
          : body.getObjectByName('crew-sidearm') ? 'sidearm' : null;
        const mask = head.getObjectByName('heist-mask');
        return {
          id: actor.id,
          name: actor.identity.subtitleName,
          role: actor.role,
          facingDot: (Math.sin(actor.group.rotation.y) * dx + Math.cos(actor.group.rotation.y) * dz) / length,
          introduced: crewIntroduced.has(actor.id),
          physical: {
            height: profile.height,
            outfit: profile.outfit,
            gender: profile.gender,
            bodyShape: profile.bodyShape,
            photoFace: head.getObjectByName('person.face.photo-skull') != null,
            proceduralFace: head.getObjectByName('person.face.skull') != null,
            hair: head.getObjectByName('person.hair.crown') != null,
            beard: head.getObjectByName('person.face.beard') != null,
            glasses: head.getObjectByName('person.glasses.bridge') != null,
            plateCarrier: body.getObjectByName('crew-plate-carrier') != null,
            weapon: physicalWeapon,
            weaponSling: body.getObjectByName('crew-weapon-sling') != null,
            maskPresent: mask != null,
            maskVisible: mask?.visible === true,
          },
        };
      }),
      numbskullFace: crew.get(CHARACTER_IDS.NUMBSKULL)?.group.userData.proceduralFace?.treatment
        === 'round_glasses',
      numbskullGlasses: crew.get(CHARACTER_IDS.NUMBSKULL)?.figure.parts.head
        .getObjectByName('person.glasses.bridge')?.visible === true,
      armorVisible: level.phases.safehouse.group.getObjectByName('armor-vest-body')?.visible === true,
      carbineVisible: level.phases.safehouse.group.getObjectByName('loadout-carbine-receiver')?.visible === true,
      lockers: (() => {
        let count = 0;
        level.phases.safehouse.group.traverse((object) => { if (object.userData.kind === 'prep-locker') count++; });
        return count;
      })(),
    },
    campaignMission: campaign.state.missions[MISSION_IDS.BANK_HEIST],
    campaignState: campaign.state,
  };
}

function say(id) {
  const line = dialogueLine(id);
  if (line) dialogue.push(line);
}

function sayCommand(id) {
  const line = dialogueLine(id);
  if (!line || spokenLines.includes(id)) return;
  if (!missionCommandBacklog.includes(id)) missionCommandBacklog.push(id);
  updateMissionCommands();
}

function updateMissionCommands() {
  const id = missionCommandBacklog[0];
  if (!id) return;
  const liveIds = [dialogue.current?.id, ...dialogue.capture().queue.map((line) => line.id)];
  if (liveIds.includes(id)) return;
  const line = dialogueLine(id);
  if (line) dialogue.pushCommand(line);
}

/**
 * A scripted run of lines, delivered one at a time.
 *
 * `DialogueArbiter` keeps a queue of four and throws the rest away — which is
 * correct for barks fighting over a moment, and completely wrong for the
 * debrief, where fourteen authored lines were pushed in one frame and ten of
 * them were dropped on the floor. That is a large part of why the ending "isn't
 * clear what it is": most of it was never said. Sequenced lines wait their turn
 * instead, fed in from the frame loop as the previous one finishes.
 */
const scriptedSpeech = [];
function sayInTurn(...ids) {
  for (const id of ids) if (id && dialogueLine(id)) scriptedSpeech.push(id);
}
function updateScriptedSpeech() {
  if (dialogue.current || !scriptedSpeech.length) return;
  const next = scriptedSpeech.shift();
  const line = dialogueLine(next);
  // A sequenced line whose beat has passed is dropped rather than forced.
  if (line && (!line.states || line.states.includes(machine.state))) dialogue.push(line);
}

/* ------------------------------------------------------------------ */
/* The lobby                                                           */
/* ------------------------------------------------------------------ */

const barkCursor = new Map();
/** The last thing anybody said out of a pool, whichever pool it came from. */
let lastPooledLine = null;

/**
 * Walk a pooled list so twenty-two people do not say one sentence.
 *
 * The cursor per key was already here and was already right; what it could
 * not do was stop two DIFFERENT pools handing out the same line back to back.
 * `refuses` and `already_robbed` deliberately share sentences, and each kept
 * its own cursor, so refusing twice in a row got the identical line twice in
 * a row from two counters that were both behaving. If the pool has anywhere
 * else to go, it goes there.
 */
function sayPooled(pool, key) {
  const lines = pool[key];
  if (!lines?.length) return null;
  let index = (barkCursor.get(key) ?? 0) % lines.length;
  if (lines.length > 1 && lines[index] === lastPooledLine) {
    index = (index + 1) % lines.length;
  }
  barkCursor.set(key, index + 1);
  lastPooledLine = lines[index];
  say(lines[index]);
  return lines[index];
}

/* ------------------------------------------------------------------ *
 * THE CASUALTY LADDER, AND THE JOB IT TURNS INTO
 *
 * Owner: *"SNow repeats the line that is a customer that is the one thing we
 * dont do. Lets get some more variations of this for the first few you kill
 * and if you kill 4+ he says okay we are commited now. Do them all. And one
 * of the objectives turns to make sure there are no witnesses and you have to
 * whack all the customers."*
 *
 * Every civilian death called `say('snow_casualty')` — one line, no cooldown,
 * no count, for the first body and the eleventh alike. `SNOW_CASUALTY_LADDER`
 * in `script.js` is what he says instead, indexed by how many are down.
 *
 * FOUR IS THE HINGE. At four, the mission stops being a robbery with an
 * accident in it: `noWitnesses` latches, the order changes to clearing the
 * room, and the doors will not let the crew out until it is clear. It is a
 * latch and not a comparison on purpose — a player who reaches four has made
 * a decision the scene does not then take back for him.
 * ------------------------------------------------------------------ */

/** How many bodies it takes before there is no version of this that is a robbery. */
const COMMITTED_CASUALTIES = 4;

let noWitnesses = false;
let sweepBarkAt = 0;

/**
 * Lobby customers who are still in the room and still able to describe it.
 *
 * Not `state !== 'down'`: somebody who bolted and reached the doors is no
 * longer standing in this lobby, and counting him would make the sweep
 * impossible to finish and lock the crew inside the bank. The manager is not
 * a customer and is not in this count. See `Hostage.present`.
 */
function witnessesRemaining() {
  return hostages.witnesses;
}

function noteCustomerDown() {
  const count = objective.civilianCasualties;
  if (count >= COMMITTED_CASUALTIES && !noWitnesses) {
    /* The beat. Once, at the fourth, and it interrupts whatever is talking. */
    noWitnesses = true;
    sayPooled(SNOW_CASUALTY_LADDER, 'committed');
    announceObjective('No witnesses. Clear the lobby.');
    refreshObjective();
    refreshInteractions();
    return;
  }
  if (!noWitnesses) {
    sayPooled(SNOW_CASUALTY_LADDER, count <= 1 ? 'first' : (count === 2 ? 'second' : 'third'));
    refreshObjective();
    return;
  }
  /* Past the hinge he stops objecting and starts counting. Rate-limited, or
   * a magazine into a crowd becomes Snow narrating each round. */
  const left = witnessesRemaining();
  if (left === 0) {
    sayPooled(SNOW_CASUALTY_LADDER, 'clear');
    refreshObjective();
    refreshInteractions();
    return;
  }
  const now = performance.now() / 1000;
  if (now > sweepBarkAt) {
    sweepBarkAt = now + 7;
    sayPooled(SNOW_CASUALTY_LADDER, 'sweep');
  }
  refreshObjective();
}

function hostageFor(object) {
  let node = object;
  while (node) {
    if (node.userData?.hostageId) return node;
    node = node.parent;
  }
  return null;
}

/** The CombatActor that owns a hit mesh, wherever it sits in the hierarchy. */
function actorFor(object) {
  let node = object;
  while (node) {
    if (node.userData?.combatActor) return node;
    node = node.parent;
  }
  return null;
}

/**
 * @param {object} person a `HostageDirector` record
 * @param {object} [options]
 * @param {boolean} [options.blend] false to snap the pose. A checkpoint
 *   rebuild puts twenty-two people into their saved poses at once and should
 *   not play twenty-two takedowns at the player.
 */
/**
 * Whoever is standing closest to a body and can still speak.
 *
 * @param {string} id the hostage who was hit
 * @returns {string|null} a hostage id, or null if the room is empty of anyone
 *   who could witness it
 */
function nearestLivingHostageTo(id) {
  const roots = level.phases.bank.civilians;
  const source = roots.find((figure) => figure.userData.hostageId === id);
  if (!source) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const root of roots) {
    const other = root.userData.hostageId;
    if (other === id) continue;
    if (hostages.get(other)?.down) continue;
    const distance = root.position.distanceToSquared(source.position);
    if (distance < bestDistance) { bestDistance = distance; best = other; }
  }
  return best;
}

function syncHostageFigure(person, options) {
  const root = level.phases.bank.civilians
    .find((figure) => figure.userData.hostageId === person.id);
  if (!root) return;
  root.userData.setState(person.state, options);
}

const OBJECTIVE_STATES = new Set([
  'LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT',
  'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER',
]);

function lobbyLive() {
  return activePhase === 'bank' && OBJECTIVE_STATES.has(machine.state);
}

/**
 * One of the four verbs, applied to one person.
 *
 * `reassure`, `demand`, `order` and `restrain` are the owner's list. Each one
 * is a line out of Tony and a line back, because a hostage who only changes
 * pose is a switch rather than a person.
 */
function applyHostageVerb(root, verb) {
  const person = hostages.get(root.userData.hostageId);
  if (!person) return { ok: false, reason: 'missing' };
  if (!lobbyLive()) return { ok: false, reason: 'lobby_closed' };
  if (person.down) return { ok: false, reason: 'down' };

  if (verb === 'reassure') {
    const result = person.reassure();
    sayPooled(PROSPECT_VERB_LINES, 'reassure');
    pendingBarkSpeaker = person.id;
    sayPooled(HOSTAGE_BARKS, result.response);
    syncHostageFigure(person);
    return { ok: result.ok, response: result.response, state: person.state };
  }
  if (verb === 'demand') {
    const result = hostages.demand(person.id);
    sayPooled(PROSPECT_VERB_LINES, 'demand');
    pendingBarkSpeaker = person.id;
    sayPooled(HOSTAGE_BARKS, result.response);
    if (result.ok) {
      /* Personal cash rides in the ledger as its own compromised bag. The
       * campaign settlement already subtracts compromised cash and already
       * refuses the professional outcome while any exists — this is the crew's
       * own rule with a number on it, not a new system. */
      const id = `personal_${person.id}`;
      if (!loot.get(id)) loot.add({ id, value: result.amount, weight: 1, anchor: 'lobby' });
      loot.carry(id, CHARACTER_IDS.PROSPECT);
      loot.load(id, 'escape_sedan');
      loot.compromise(id);
      audio.play('heist.cash.lift', { volume: 0.5, rate: 1.3 });
      if (hostages.robbedCount === 1) say('snow_no_souvenirs');
    }
    syncHostageFigure(person);
    return { ok: result.ok, amount: result.amount, response: result.response };
  }
  if (verb === 'order') {
    const result = person.order();
    sayPooled(PROSPECT_VERB_LINES, 'order');
    syncHostageFigure(person);
    return { ok: result.ok, state: person.state };
  }
  if (verb === 'restrain') {
    if (zipTies <= 0) return { ok: false, reason: 'no_ties' };
    const result = hostages.restrain(person.id);
    if (!result.ok) return { ok: false, reason: result.reason };
    zipTies--;
    sayPooled(PROSPECT_VERB_LINES, 'restrain');
    pendingBarkSpeaker = person.id;
    sayPooled(HOSTAGE_BARKS, 'tied');
    audio.play('heist.swap.fabric', { volume: 0.6, rate: 1.35 });
    syncHostageFigure(person);
    refreshAmmoReadout();
    refreshInteractions();
    return { ok: true, state: person.state, ties: zipTies };
  }
  return { ok: false, reason: 'unknown_verb' };
}

/** The person currently under the crosshair, at gun range rather than arm's. */
const aimRaycaster = new THREE.Raycaster();
aimRaycaster.far = 22;
let aimedHostageId = null;

function updateHostageAim(dt) {
  const watched = new Set();
  if (!lobbyLive() || !loadout.selectedIsWeapon || simulationPaused) {
    aimedHostageId = null;
  } else {
    aimRaycaster.setFromCamera(SCREEN_CENTER, camera);
    /* Only the civilian figures can answer to an aim, so only they are worth
     * intersecting — the full bank group is hundreds of meshes of furniture. */
    const hit = aimRaycaster.intersectObjects(level.phases.bank.civilians, true)[0];
    const root = hit ? hostageFor(hit.object) : null;
    const person = root ? hostages.get(root.userData.hostageId) : null;
    aimedHostageId = person && person.interactive ? person.id : null;
    if (person) {
      watched.add(person.id);
      const event = person.aim(dt, {
        distance: hit.distance, aimedDownSights: loadout.activeWeapon?.aimed === true,
      });
      if (event === 'plead') {
        pendingBarkSpeaker = person.id;
        sayPooled(HOSTAGE_BARKS, person.role === 'teller' ? 'plead_teller' : 'plead');
        syncHostageFigure(person);
      } else if (person.state === 'pleading' && root.userData.visualState !== 'pleading') {
        syncHostageFigure(person);
      }
    }
  }

  /* The room only starts making its own decisions once the robbery is actually
   * happening. Somebody bolting for the door while the crew is still in the
   * doorway is not tension, it is a bug with a bark on it. */
  const covered = hostages.control > 0.55;
  const events = lobbyLive() ? hostages.update(dt, { watched, covered }) : [];
  const now = performance.now() / 1000;
  for (const { id, event } of events) {
    const person = hostages.get(id);
    syncHostageFigure(person);
    if (event === 'alarm') {
      policeHeat = Math.min(100, policeHeat + 14);
      audio.play('heist.crowd.react', { volume: 0.4 });
      if (now > alarmBarkAt) {
        alarmBarkAt = now + 12;
        say('numb_alarm_reached');
        pendingBarkSpeaker = id;
        sayPooled(HOSTAGE_BARKS, 'caught');
      }
    } else if (event === 'bolting') {
      policeHeat = Math.min(100, policeHeat + 8);
      if (now > runnerBarkAt) { runnerBarkAt = now + 12; say('death_runner'); }
    }
  }

  const summary = hostages.summary();
  objective.syncHostages(summary);
  hud.setLobby(activePhase === 'bank' ? {
    controlled: summary.controlled,
    total: hostages.hostages.length,
    ties: zipTies,
    casualties: objective.civilianCasualties,
  } : null);

  /* Snow notices when the room comes apart, and notices once — not every frame
   * the number crosses the line. */
  const control = hostages.control;
  if (control < 0.34 && !controlWarned && now > controlBarkAt
    && hostages.hostages.some((p) => p.noticedAim)) {
    controlWarned = true;
    controlBarkAt = now + 20;
    say('snow_control_slipping');
  } else if (control > 0.6) {
    controlWarned = false;
    if (!lobbyHeldAnnounced && summary.restrained >= 4) {
      lobbyHeldAnnounced = true;
      say('numb_lobby_held');
    }
  }
}

/**
 * The mission's answer to one Located player hit.
 *
 * Damage truth already happened inside `combat.resolvePlayerShot` — the
 * shared resolver applied (or refused) the hit against the actor the honest
 * ray actually reached. This function owns only what stays scene-authored:
 * discipline scoring, barks, hostage bookkeeping and police heat.
 *
 * @param {object} located a `CombatImpactResolver` Located hit
 * @returns {object} the applied result, or `{ applied: false }`
 */
function applyPlayerImpactConsequences(located) {
  const actor = located.actor;
  const result = located.result ?? null;
  if (!located.applied) {
    // Refused: the matrix protects crew from crew. Still worth saying out loud.
    if (actor?.faction === FACTIONS.CREW) {
      objective.noteFriendlyFire();
      /* SNOW SAYING "MUZZLE OFF ME" ON A LOOP.
       *
       * Owner, on the street: *"Snow repeats 'Muzzle off me'"*. `FactionMatrix`
       * refuses crew-on-crew damage, so every single round that finds a crew
       * member lands here — and this said the same sentence for each one. Hold
       * the trigger on Snow with a twenty-round magazine and he said it twenty
       * times. It is still counted every time, because the discipline score is
       * about rounds and not about how often he complains; he is just told
       * about it once, out of three lines, and then not again for a while. */
      const now = performance.now() / 1000;
      if (now > friendlyFireBarkAt) {
        friendlyFireBarkAt = now + 9;
        sayPooled(CREW_FRIENDLY_FIRE_LINES, 'muzzle');
      }
    }
    return { applied: false };
  }
  if (actor.faction === FACTIONS.CIVILIAN) {
    const person = hostages.get(actor.id);
    objective.noteCivilianHit({ fatal: result.fatal === true });
    if (result.fatal && person) {
      hostages.fell(person.id);
      syncHostageFigure(person);
      for (const other of hostages.hostages) syncHostageFigure(other);
      noteCustomerDown();
      /* The witness is not the person who was shot — it is whoever is nearest
       * and still alive, and it is their mouth that has to move. */
      pendingBarkSpeaker = nearestLivingHostageTo(person.id);
      sayPooled(HOSTAGE_BARKS, 'witness');
      policeHeat = Math.min(100, policeHeat + 18);
    } else if (result.fatal) {
      objective.civilianCasualties++;
      located.root?.userData.figure?.fallen?.();
      noteCustomerDown();
    }
    return result;
  }
  return result;
}

function emitFromPool(pool, position, life, velocity) {
  const mesh = pool.find((item) => !item.visible);
  if (!mesh) return false;
  mesh.visible = true;
  mesh.position.copy(position);
  mesh.userData.life = life;
  mesh.userData.velocity = velocity;
  window.__heistDebug.poolUsage.effects = impactPool.filter((item) => item.visible).length
    + casingPool.filter((item) => item.visible).length;
  return true;
}

function emitImpact(position) {
  emitFromPool(impactPool, position, 0.32, new THREE.Vector3(0, 0.35, 0));
  audio.play('heist.bullet.impact', { position, volume: 0.62, ref: 1.1, maxDist: 22 });
}

/**
 * A round that found a person.
 *
 * Owner: *"better blood ... effects"*. Every hit in this scene — marble,
 * wood, a police cruiser, a bank customer — threw the same three sandy dust
 * motes, so shooting somebody looked exactly like missing them. That is worse
 * than a missing effect: it is the one moment the mission is scored on
 * (`HeistObjectiveLedger.civilianRoundsFired`) and it had no feedback at all.
 *
 * The gore itself is the SHARED systems' now — `combat.presentImpact` puts an
 * attached wound and spatter at the exact ray point, throws an arterial burst
 * off it, and on a fatal hit only starts a spreading `DeathBloodPool` under
 * the body, all bounded by their own pools. The scene keeps its room tone:
 * the wet-marble body sound and the low impact thud are authored here.
 *
 * @param {object} located an APPLIED Located hit from `resolvePlayerShot`
 */
function presentBlood(located) {
  if (!combat.presentImpact(located)) return;
  const position = located.point;
  const fatal = located.fatal === true;
  audio.play('heist.body.marble', {
    position, volume: fatal ? 0.66 : 0.4, rate: fatal ? 0.92 : 1.18, ref: 1.2, maxDist: 24,
  });
  audio.play('heist.bullet.impact', {
    position, volume: 0.34, rate: 0.78, ref: 1.1, maxDist: 20,
  });
}

function emitCasing() {
  const position = camera.getWorldPosition(new THREE.Vector3());
  const right = new THREE.Vector3(1, 0.35, 0).applyQuaternion(camera.quaternion).multiplyScalar(0.8);
  emitFromPool(casingPool, position, 1.2, right);
}

function updateEffectPools(dt) {
  const update = (mesh, gravity = 4.5) => {
    if (!mesh.visible) return;
    mesh.userData.life -= dt;
    if (mesh.userData.life <= 0) {
      mesh.visible = false;
      if (mesh.userData.fade) mesh.material.opacity = 0.42;
      return;
    }
    mesh.position.addScaledVector(mesh.userData.velocity, dt);
    mesh.userData.velocity.y -= gravity * dt;
    // The mist thins and swells rather than falling out of the air.
    if (mesh.userData.fade) {
      mesh.material.opacity = Math.max(0, mesh.userData.life / 0.34) * 0.42;
      mesh.scale.setScalar(1 + (0.34 - mesh.userData.life) * 2.4);
    }
  };
  for (const mesh of impactPool) update(mesh);
  for (const mesh of casingPool) update(mesh);
  // Shared blood advances on the same simulated clock as everything else.
  bloodImpacts.update(dt);
  bloodSpurts.update(dt);
  deathPools.update(dt);
}

let audioZone = null;
let audioZoneCue = null;
function setAudioZone(id) {
  if (audioZone === id) return;
  if (audioZoneCue) {
    audio.stopLoop(audioZoneCue, 0.8);
    if (audioZone === 'bank') audio.stopLoop('heist.bank.alarm', 0.35);
    if (['street', 'garage', 'driving'].includes(audioZone)) audio.stopLoop('heist.police.sirens', 0.6);
  }
  audioZone = id;
  audioZoneCue = id === 'safehouse' ? 'heist.ambience.safehouse.prep' : `heist.ambience.${id}`;
  audio.startLoop(audioZoneCue, { volume: id === 'safehouse' ? 0.12 : 0.2, ambience: true, fade: 0.8 });
  if (['street', 'garage', 'driving'].includes(id)) {
    audio.startLoop('heist.police.sirens', { volume: 0.16, ambience: true, fade: 0.5 });
  }
}

/**
 * Show the duffles that have reached the circle by the doors.
 *
 * The vault's own bags go away as they are carried out, so eight bags in a
 * vault becomes eight bags at a door rather than sixteen bags in a bank.
 */
function stageBankBags(count) {
  const staged = Math.max(0, Math.min(8, Math.round(count) || 0));
  level.phases.bank.staging?.userData.setStaged?.(staged);
  for (let i = 1; i <= 8; i++) {
    const mesh = level.phases.bank.group.getObjectByName(`cash-${i}`);
    if (mesh) mesh.visible = i > staged;
  }
}

function phaseIdForState(state) {
  const phase = PHASE_FOR_STATE[state];
  return ['safehouse', 'van', 'bank', 'street', 'garage', 'driving'].includes(phase)
    ? phase : 'safehouse';
}

function placeCrew(phaseId) {
  const anchors = poseHeistCrewGeometry({
    level,
    crew,
    phase: phaseId,
    assignAnchor: (actor) => {
      if (!squad.assign(actor.id, phaseId)) {
        throw new Error(`No authored Heist ${phaseId} anchor for ${actor.id}`);
      }
      return actor.anchor;
    },
  });
  window.__heistDebug.squadAnchors = anchors;
}

function activatePhase(id, preservePlayer = false) {
  if (activePhase === id) return level.phases[id];
  const phase = level.activate(id);
  activePhase = id;
  /* The escape city is about fourteen hundred pieces of geometry. Rendering all
   * of it a second time into a shadow map buys a sun shadow nobody sees at
   * sixty miles an hour under streetlights, and it is the single most expensive
   * thing in the scene. The interiors keep their shadows. */
  keyLight.castShadow = id !== 'driving';
  scene.fog.density = id === 'driving' ? 0.0045 : (id === 'bank' ? 0.012 : 0.018);
  renderer.toneMappingExposure = id === 'driving' ? 1.32
    : (id === 'safehouse' ? 1.02 : (id === 'bank' ? 1.06 : 0.94));
  placeCrew(id);
  /* And the shot list for the phase we have just walked into, so the played
   * mission carries the same beats the framing gate reads off the headless
   * build. `src/heist/shots.js` has the why; it is published after the crew
   * because a mark that names a subject plants its look point at that
   * subject's range, and it replaces rather than adds, so walking back into a
   * phase does not leave two copies of every shot on the group. */
  publishHeistFramingBeats(id, phase.group, { spawn: phase.spawn ?? null });
  if (!preservePlayer) {
    player.position.copy(phase.spawn);
    player.velocity.set(0, 0, 0);
    player.yaw = 0;
    player.pitch = id === 'safehouse' ? -0.12 : 0;
  }
  window.__heistDebug.phase = id;
  interaction.setOccluders([phase.group]);
  /* Ballistic truth is the same geometry the player sees: every trace the
   * shared modules run — player rounds, hostile sight, hostile rounds —
   * intersects this phase group and nothing else. */
  combat.setOccluders([phase.group]);
  window.__heistDebug.policeActive = activePoliceMeshes().length;
  setAudioZone(id);
  hud.setLobby(id === 'bank' ? {
    controlled: hostages.summary().controlled,
    total: hostages.hostages.length,
    ties: zipTies,
    casualties: objective.civilianCasualties,
  } : null);
  refreshInteractions();
  return phase;
}

function clearInteractions() {
  for (const target of [...interaction.targets]) interaction.unregister(target);
}

/**
 * Register an interaction.
 *
 * This used to forward only `label`, `key`, `hold`, `enabled` and `onUse` — so
 * `onTap` and `soft` were accepted at every call site and silently thrown
 * away. That is why a tap on a hold target did nothing at all, and why a
 * convenience volume could win the ray from the thing it was standing in for.
 * Everything `InteractionSystem` understands is passed through now.
 */
function use(mesh, label, onUse, options = {}) {
  if (!mesh) return;
  interaction.register(mesh, {
    label,
    key: options.key ?? 'E',
    hold: options.hold,
    holdLabel: options.holdLabel,
    soft: options.soft,
    enabled: options.enabled,
    onTap: options.onTap,
    onLook: options.onLook,
    onHoldProgress: options.onHoldProgress,
    onUse,
  });
}

function syncSafehousePresentation() {
  level.phases.safehouse.interactables.armor.userData.setEquipped?.(preparation.armorReady);
  level.phases.safehouse.interactables.loadout.userData.setEquipped?.(preparation.loadoutReady);
  /* The armour value and its HUD band follow the carrier wherever the
   * preparation state came from — a pickup, a checkpoint resume, a preview
   * entry, or the debrief putting the guns back down. */
  syncPlayerArmor();
  /* And the table shows whichever half of the night the mission is in.
   *
   * The same class of bug as `orders.js`: the count on the table was written
   * by the handler that ran when you pressed the table, so a `?checkpoint=`
   * preview dropped straight into the debrief stood a room full of people
   * around a plan for a bank they had already robbed. It is a function of the
   * mission state here instead, so entering at any checkpoint dresses the
   * table correctly on frame one — and going BACK past the count (a restored
   * checkpoint, a failed run) puts the plan back. */
  level.phases.safehouse.interactables.briefing.userData.setDebrief?.(
    Math.min(objective.totalBags, objective.bagsRecovered),
    stateIndex(machine.state) >= stateIndex('MONEY_COUNT'),
  );
}

function registerCrewIntroductions() {
  for (const actor of crew.values()) {
    const role = CREW_ROLE_LABEL[actor.role] ?? actor.role.toUpperCase();
    use(actor.group, `${actor.identity.subtitleName} — ${role}`, () => {
      if (crewIntroduced.has(actor.id)) return;
      crewIntroduced.add(actor.id);
      say(CREW_INTRO_LINE[actor.id]);
    }, { enabled: () => !crewIntroduced.has(actor.id) });
  }
}

function stateIndex(name) { return HEIST_STATES.indexOf(name); }

/**
 * Walk the mission machine forward to a named state.
 *
 * The guard on the first line is load-bearing and was missing: asked to
 * "advance" to a state the mission is already past — which any re-entered
 * trigger does, and which every node of the escape route did after a
 * checkpoint restore — the loop marched the machine one state at a time to the
 * end of `HEIST_STATES` and left the scene sitting in SCENE_COMPLETE in the
 * middle of a car chase. Going backwards is not an advance; it is a no-op.
 */
function advanceTo(target) {
  if (stateIndex(target) <= stateIndex(machine.state)) return machine.state === target;
  while (machine.state !== target && machine.state !== 'FAILED') {
    const next = HEIST_STATES[stateIndex(machine.state) + 1];
    if (!next || !machine.advance(next)) return false;
  }
  refreshInteractions();
  return true;
}

function recordCheckpoint(id, resumeState, facts = {}) {
  if (!story.checkpoint(id, facts)) return false;
  latestCheckpoint = id;
  recoveryCheckpoint = id;
  checkpoints.capture(id, { state: resumeState, phase: phaseIdForState(resumeState) });
  window.__heistDebug.checkpoint = id;
  return true;
}

function startVanRide() {
  advanceTo('VAN_APPROACH');
  activatePhase('van');
  player.mode = 'walk';
  player.moveScale = 0;
  refreshObjective();
  sayInTurn('rippin_two_lights', 'snow_time', 'snow_mask_call');
}

/** The one beat the owner could not perform at all. */
function pullMaskOn() {
  if (loadout.maskWorn || machine.state !== 'VAN_APPROACH') return false;
  loadout.wearMask(true);
  advanceTo('MASKS_ON');
  setCrewMasked(crew, true);
  audio.play('heist.swap.fabric', { volume: 0.7 });
  sayInTurn('prospect_mask_on', 'shubes_loop', 'death_breathe', 'numb_van_count');
  refreshObjective();
  syncHeistInventory(true);
  refreshInteractions();
  return true;
}

function resetLobbyGuardThreat() {
  guardThreat.reset();
  lobbyGuardActor.restore({
    id: lobbyGuardActor.id,
    health: lobbyGuardActor.maxHealth,
    armor: 0,
    injury: 'none',
    incapacitated: false,
    suppression: 0,
    role: 'lobby_guard',
    anchor: 'bank_entry',
    carrying: null,
  });
  level.phases.bank.interactables.guard.userData.resetThreatPose?.();
  hud.setThreat(false);
}

function neutralizeLobbyGuard(source = 'player_shot') {
  const result = guardThreat.resolve({ source });
  if (!result.ok) return result;
  level.phases.bank.interactables.guard.userData.setNeutralized?.();
  hud.setThreat(false);
  audio.play('heist.guard.weapon.drop');
  audio.play('heist.body.marble', { delay: 0.12, volume: 0.75 });
  advanceTo('LOBBY_CONTROL');
  dialogue.reset();
  dialogue.setState(machine.state);
  say('prospect_counterstrike');
  say('snow_scoreboard');
  refreshObjective();
  refreshInteractions();
  return result;
}

function enterBank() {
  advanceTo('BANK_ENTRY');
  activatePhase('bank');
  resetLobbyGuardThreat();
  guardThreat.start();
  checkpoints.capture('bank_entry_retry', { state: 'BANK_ENTRY', phase: 'bank' });
  recoveryCheckpoint = 'bank_entry_retry';
  audio.play('heist.bank.entry');
  audio.play('heist.guard.draw', { delay: 0.12 });
  refreshObjective();
  hud.setThreat(true, guardThreat.snapshot().remaining, guardThreat.windowSeconds);
  say('guard_warning');
  say('snow_guard');
}

function beginStreet() {
  advanceTo('BANK_DOOR_CONTACT');
  activatePhase('street');
  spawnPolice('bank_avenue', 5);
  refreshObjective();
  say('snow_contact');
  say('death_suppress');
  recordCheckpoint('street_withdrawal', 'STREET_BLOCK_ONE', {
    primaryVanLost: true, policeHeat: 55,
  });
}

/**
 * Vault money only.
 *
 * Cash taken off a customer rides in the same ledger — that is how the
 * campaign's compromised-cash settlement sees it — so counting bags naively
 * reported "9 / 8 vault bags recovered" on the debrief board. The objective's
 * money line is the eight bags off the trolleys and nothing else.
 */
function vaultSummary() {
  const bags = loot.capture().filter((bag) => bag.id.startsWith('cash_'));
  return {
    recoveredBags: bags.filter((bag) => bag.recovered && !bag.seized).length,
    abandonedBags: bags.filter((bag) => bag.abandoned).length,
    grossRecovered: bags.filter((bag) => bag.recovered && !bag.seized)
      .reduce((sum, bag) => sum + bag.value, 0),
  };
}

function enterGarage() {
  if (!droppedBagDecision) {
    droppedBagDecision = 'abandoned';
    loot.abandon('cash_8');
    if (machine.state === 'STREET_BLOCK_TWO') advanceTo('DROPPED_BAG_DECISION');
    say('snow_leave_it');
  }
  if (carryingBag) {
    loot.drop(carryingBag, { anchor: 'garage_entry', position: { x: 0, y: 0.3, z: 10 } });
    carryingBag = null;
    carriedBagMesh = null;
    hud.setBag(0, 0);
  }
  advanceTo('GARAGE_ENTRY');
  activatePhase('garage');
  officersDown = 0;
  spawnPolice('mercer_garage', 4);
  recordCheckpoint('mercer_garage', 'GARAGE_HOLD', {
    bagsRecovered: loot.summary().recoveredBags,
    droppedBagRecovered: droppedBagDecision === 'recovered',
    crewInjuries: { [CHARACTER_IDS.RIPPINFLOW]: 'moderate' },
  });
  refreshObjective();
}

function beginDriving() {
  advanceTo('PLAYER_TAKES_WHEEL');
  activatePhase('driving');
  driving = true;
  routeIndex = 0;
  copsLost = false;
  pursuitWarned = false;
  pursuitPressure = 0;
  ramCooldown = 0;
  ramBarkAt = 0;
  pressureBarkAt = 0;
  chaseInitialised = false;
  vehicle.x = escapeStart.x;
  vehicle.z = escapeStart.z;
  vehicle.heading = escapeStart.heading;
  vehicle.speed = 0;
  for (const [index, cruiser] of level.phases.driving.pursuers.entries()) {
    cruiser.visible = index === 0;
    cruiser.position.set(escapeStart.x, 0, escapeStart.z - 16 - index * 9);
  }
  interaction.setPaused(true);
  player.mode = 'frozen';
  // The hands leave the frame before the camera does -- see syncHeistInventory.
  syncHeistInventory(true);
  hud.setDriving(true, 0, level.phases.driving.route[0].label);
  refreshObjective();
  audio.startLoop('heist.vehicle.engine.load', { volume: 0.14, ambience: true, fade: 0.2 });
  audio.startLoop('heist.vehicle.tires.road', { volume: 0.08, ambience: true, fade: 0.25 });
  say('rippin_drive');
  input?.refresh('driving-start');
}

function reachSwap() {
  driving = false;
  vehicle.setInput();
  audio.stopLoop('heist.vehicle.engine.load', 0.35);
  audio.stopLoop('heist.vehicle.tires.road', 0.35);
  for (const cruiser of level.phases.driving.pursuers) cruiser.visible = false;
  advanceTo('VEHICLE_SWAP');
  player.mode = 'walk';
  player.position.set(20, 1.66, -650);
  player.yaw = 0;
  player.pitch = 0;
  camera.fov = 72;
  camera.updateProjectionMatrix();
  camera.rotation.z = 0;
  interaction.setPaused(false);
  syncHeistInventory(true);
  hud.setDriving(false);
  refreshObjective();
  say('shubes_swap');
  refreshInteractions();
  input?.refresh('driving-complete');
}

function returnSafehouse() {
  recordCheckpoint('vehicle_swap', 'SAFEHOUSE_RETURN', {
    playerDroveEscape: true,
    vehicleDamage: vehicle.collisionDamage,
  });
  advanceTo('SAFEHOUSE_RETURN');
  activatePhase('safehouse');
  setCrewMasked(crew, false);
  crew.get(CHARACTER_IDS.RIPPINFLOW).injury = 'moderate';
  refreshObjective();
  say('snow_return');
}

/**
 * The end card, which now reads the two things the job was scored on.
 *
 * The owner's objective, verbatim: *"We should try to minimize civilian
 * casualties and get all the money."* Those are the top two rows, in that
 * order, before a single dollar of settlement — and the verdict under them is
 * `HeistObjectiveLedger.grade()`, the same word written into the save.
 */
function showMissionCard() {
  const summary = loot.summary();
  const mission = campaign.state.missions[MISSION_IDS.BANK_HEIST];
  const card = document.getElementById('mission-card');
  const grade = mission.outcome ?? objective.grade();
  const scorecard = objective.scorecard()
    .map((row) => `<tr class="${row.good ? 'good' : 'bad'}">`
      + `<td>${row.label}</td><td>${row.value}</td></tr>`)
    .join('');
  card.innerHTML = `
    <h1>THE TAKE</h1>
    <p class="verdict ${grade}">${String(grade).replaceAll('_', ' ').toUpperCase()}</p>
    <h3>THE JOB</h3>
    <table class="scorecard">${scorecard}</table>
    <h3>THE SETTLEMENT</h3>
    <table>
      <tr><td>Expected take</td><td>$1,470,000</td></tr>
      <tr><td>Gross recovered</td><td>$${summary.grossRecovered.toLocaleString()}</td></tr>
      <tr><td>Compromised cash</td><td>$${summary.compromisedCash.toLocaleString()}</td></tr>
      <tr><td>Operational loss</td><td>$${mission.operationalLoss.toLocaleString()}</td></tr>
      <tr><td>Family share</td><td>$${mission.familyShare.toLocaleString()}</td></tr>
      <tr><td>Crew share</td><td>$${mission.crewShare.toLocaleString()}</td></tr>
      <tr><td>Prospect share</td><td>$${mission.prospectShare.toLocaleString()}</td></tr>
    </table>
    <button id="return-home">RETURN TO APARTMENT</button>`;
  card.classList.remove('hidden');
  document.getElementById('debrief-board')?.classList.add('hidden');
  document.getElementById('return-home').addEventListener('click', returnToApartment);
}

function returnToApartment() {
  /* THE TAKE decodes its complete voice/effects bank. Close that scene's audio
   * graph before asking the Apartment to create and decode another one; leaving
   * both contexts for browser GC can starve Chromium's decoder pool and strand
   * the next scene behind its Start card. Mission state is already durable. */
  try {
    /* Start teardown immediately, but never make campaign navigation wait for
     * Chromium to settle every decoded source. Some WebAudio implementations
     * leave close() pending until page unload, which would strand this button. */
    if (audio.ctx && audio.ctx.state !== 'closed') audio.ctx.close().catch(() => {});
    /* AudioBuffer references survive a closed context until the old page is
     * collected. Release the complete heist bank explicitly so the Apartment's
     * decoder does not compete with unreachable mission PCM during navigation. */
    audio.buffers.clear();
    audio.playbacks.length = 0;
    audio._voBanks?.clear?.();
  } catch {
    /* Navigation is still the safe fallback if a browser rejects close(). */
  }
  navigateCampaign(campaign, SCENE_IDS.APARTMENT, { spawn: 'front_door' });
}

function completeMission() {
  const summary = loot.summary();
  objective.syncLoot(summary);
  objective.syncHostages(hostages.summary());
  /* Honest numbers. `disciplinedFire` and `followedSnow` used to be hard-coded
   * `true` here, which meant the save recorded a professional job no matter
   * what the player had done in that lobby. They are now derived from what
   * actually happened, and `civiliansHarmed` is a real count. */
  const report = objective.report();
  const completed = story.complete({
    bagsStaged: bankBagsStaged,
    bagsRecovered: summary.recoveredBags,
    grossTake: summary.grossRecovered,
    compromisedCash: summary.compromisedCash,
    crewInjuries: { [CHARACTER_IDS.RIPPINFLOW]: 'moderate' },
    optionalVaultBagTaken: droppedBagDecision === 'recovered',
    ...report,
  });
  if (!completed) return;
  advanceTo('SCENE_COMPLETE');
  missionCompleted = true;
  showMissionCard();
}

function refreshInteractions() {
  clearInteractions();
  if (!started || driving) return;
  const state = machine.state;
  const p = level.phases;

  if (activePhase === 'safehouse' && stateIndex(state) < stateIndex('BOARD_VAN')) {
    syncSafehousePresentation();
    registerCrewIntroductions();
    /* The prompt names the four things on the plan, in the order they are
     * laid out on it. "Review the route with Snow" told the player nothing
     * about what he was about to look at. */
    use(p.safehouse.interactables.briefing, () => {
      if (machine.state === 'CREW_INTRO') return 'The plan: bank, Mercer, the garage, the swap';
      if (machine.state === 'BRIEFING') return 'Hear the rest: the case, the bags, the alarm';
      return 'The plan: 1 bank · 2 Mercer Street · 3 garage · 4 swap yard';
    }, () => {
      audio.play('heist.map.paper', { volume: 0.65 });
      readyBriefing();
    }, { enabled: () => stateIndex(machine.state) <= stateIndex('LOADOUT') });
    /* PICK IT UP AND YOU ARE WEARING IT.
     *
     * Owner: *"picking up vest/carbine appears to do nothing"* and *"make it
     * simple: walking E-pickup equips/stows, no separate equip concept"*.
     * Three things were wrong and all three are gone:
     *
     *   1. Both props were gated on `machine.state === 'LOADOUT'`, a state you
     *      only reach by pressing E on the briefing table TWICE. Walk to the
     *      vest first — which is what a player does — and there was no prompt
     *      on it at all. Nothing to press, nothing happened, exactly as
     *      reported. Taking gear now ADVANCES the briefing rather than being
     *      gated by it: the mission follows the player.
     *   2. Once taken, `enabled` went false and the prompt vanished, so there
     *      was no confirmation and no way to put anything back.
     *   3. Nothing visible changed. The carbine now goes straight into the
     *      hands (`selectSlot` to the carbine slot, so the view model draws
     *      it), the vest turns the player's armour on and the HUD armour band
     *      with it, and both props leave the bench.
     *
     * No hold on either. A hold is for a thing you can do wrongly; picking up
     * your own kit off a table in your own safehouse is not one of those.
     */
    use(p.safehouse.interactables.armor,
      () => (preparation.armorReady ? 'Vest on · E to take it off' : 'Take the plate carrier'), () => {
        if (preparation.armorReady) {
          preparation.armorReady = false;
          p.safehouse.interactables.armor.userData.setEquipped?.(false);
          audio.play('heist.weapon.down', { volume: 0.5 });
        } else {
          preparation.equipArmor();
          p.safehouse.interactables.armor.userData.setEquipped?.(true);
          audio.play('heist.gear.armor.pickup');
          readyBriefing();
        }
        syncPlayerArmor();
        syncHeistInventory(true);
        refreshInteractions();
      });
    use(p.safehouse.interactables.loadout,
      () => (preparation.loadoutReady ? 'Carbine in hand · E to put it back' : 'Take the carbine and the sidearm'), () => {
        if (preparation.loadoutReady) {
          preparation.loadoutReady = false;
          p.safehouse.interactables.loadout.userData.setEquipped?.(false);
          audio.play('heist.weapon.down', { volume: 0.5 });
        } else {
          preparation.readyWeapons();
          p.safehouse.interactables.loadout.userData.setEquipped?.(true);
          audio.play('heist.gear.carbine.pickup');
          readyBriefing();
        }
        syncHeistInventory(true);
        // Straight into the hands. Picking a gun up and not holding it is the
        // whole of "appears to do nothing".
        if (preparation.loadoutReady) selectSlot(HEIST_SLOT_ORDER.indexOf('carbine'));
        refreshInteractions();
      });
    use(p.safehouse.interactables.van, 'Board the primary van', () => {
      if (!preparation.ready || machine.state !== 'LOADOUT') return;
      advanceTo('BOARD_VAN');
      say('prospect_ready');
      sayCommand('lou_radio_open');
      audio.play('heist.van.door');
      /* And the doors he just went through shut behind him. They stand open
       * in the bay while the crew loads — see `buildSafehouse` — and this is
       * the sound that has always played over them doing nothing. */
      p.safehouse.group.getObjectByName('primary-van')
        ?.userData.setRearDoorsOpen?.(false);
      startVanRide();
      recordCheckpoint('safehouse_ready', 'VAN_APPROACH');
    }, { enabled: () => preparation.ready && machine.state === 'LOADOUT' });
    return;
  }

  if (activePhase === 'van' && ['VAN_APPROACH', 'MASKS_ON'].includes(state)) {
    /* The mask, reachable from the seat.
     *
     * Owner: *"In the van Im just standing here I cant pull the mask on and
     * its just standing in the van."* Exactly right, and it was not a design
     * problem: the only mask target was the rear door at z -3.13, the player
     * spawns at z +1.9 with `moveScale` 0, and `InteractionSystem` stops at
     * 2.7 m. Five metres, no way to walk. It now lives on a soft volume that
     * fills the box, and the balaclava is also slot three — press `3` then `E`
     * and it goes on, from anywhere, facing anywhere. */
    use(p.van.interactables.cabin, () => (loadout.maskWorn
      ? 'Open the van doors'
      : 'Pull the balaclava down'), () => {
      if (machine.state === 'VAN_APPROACH') { pullMaskOn(); return; }
      if (machine.state !== 'MASKS_ON') return;
      audio.play('heist.van.door');
      advanceTo('CREW_EXIT');
      enterBank();
    }, { soft: true });
    /* The rear door itself is five metres from the seat, which is why the beat
     * was unplayable; it stays as a target for anybody who walks to it in a
     * later revision, but the cabin volume above is what actually carries it. */
    use(p.van.interactables.van,
      state === 'VAN_APPROACH' ? 'Pull the balaclava down' : 'Open the van doors', () => {
        if (machine.state === 'VAN_APPROACH') {
          pullMaskOn();
        } else {
          audio.play('heist.van.door');
          advanceTo('CREW_EXIT'); enterBank();
        }
      });
    /* The tie count goes in the ammo readout, where a count belongs — it used
     * to be written over the OBJECTIVE, which then stayed on screen as the
     * standing order for the whole bank. That is the same class of bug
     * `./orders.js` exists to fix, in miniature. */
    use(p.van.interactables.kit, () => `Check the case: ${zipTies} ties, spare magazines`, () => {
      audio.play('heist.weapon.check', { volume: 0.5 });
      refreshAmmoReadout();
    }, { soft: true });
    return;
  }

  if (activePhase === 'bank') {
    use(p.bank.interactables.guard, 'Security guard is drawing — LEFT CLICK to fire', () => {}, {
      enabled: () => machine.state === 'BANK_ENTRY' && guardThreat.state === 'drawing',
    });
    /* Every person in the lobby is their own target: tap to put them down, hold
     * to zip-tie them, `F` to talk them down and `G` to take what they have.
     * Registered before the room-wide order below, and the crowd volume is
     * soft, so the individual always wins the ray. */
    for (const figureRoot of p.bank.civilians) {
      const person = hostages.get(figureRoot.userData.hostageId);
      if (!person || !person.interactive) continue;
      /* THE PROMPT SAYS WHAT THE KEYS DO.
       *
       * Owner, verbatim: *"prompts must clearly say E — to the ground, hold
       * E — tie up"*. What was there — "Order them to the floor · HOLD E
       * ZIP-TIE (GET THEM DOWN FIRST) · F REASSURE · G TAKE WHAT THEY HAVE" —
       * put the verb before the key on the first item and the key before the
       * verb on the other three, so the one thing a tap does was the only
       * thing whose key was not stated. Every entry is `KEY — verb` now, in
       * the order a player uses them, and the tie line says why it is
       * refusing when it refuses. */
      use(figureRoot, () => {
        const live = hostages.get(figureRoot.userData.hostageId);
        if (!live) return '';
        const down = live.state === 'prone' || live.state === 'kneeling';
        const tied = live.state === 'restrained';
        const parts = [down ? 'E — keep them down' : 'E — to the ground'];
        if (tied) parts.push('tied off');
        else if (zipTies <= 0) parts.push('HOLD E — no ties left');
        else if (!down) parts.push('HOLD E — tie up (get them down first)');
        else parts.push('HOLD E — tie up');
        parts.push('F — talk them down', 'G — take what they have');
        return parts.join(' · ');
      }, () => applyHostageVerb(figureRoot, 'restrain'), {
        hold: 1.05,
        onTap: () => applyHostageVerb(figureRoot, 'order'),
        enabled: () => {
          const live = hostages.get(figureRoot.userData.hostageId);
          return lobbyLive() && !!live?.interactive;
        },
      });
    }
    use(p.bank.interactables.crowd, 'E — put the whole room on the floor', () => {
      if (machine.state !== 'LOBBY_CONTROL' || lobbyControlled) return;
      for (const person of hostages.hostages) {
        person.order();
        person.order();
        syncHostageFigure(person);
      }
      lobbyControlled = true;
      audio.play('heist.crowd.react');
      sayCommand('lou_radio_lobby');
      sayInTurn('numb_lobby_order', 'death_floor',
        'civilian_please', 'snow_lobby_open');
      refreshObjective();
      refreshInteractions();
    }, { soft: true, enabled: () => machine.state === 'LOBBY_CONTROL' && !lobbyControlled });
    use(p.bank.interactables.rearGuard, rearGuardSecured ? 'Rear guard secured' : 'E — order the rear guard down', () => {
      if (machine.state !== 'LOBBY_CONTROL' || !lobbyControlled) return;
      rearGuardSecured = true;
      p.bank.interactables.rearGuard.userData.setNeutralized?.();
      audio.play('heist.guard.weapon.drop');
      advanceTo('GUARDS_SECURED');
      say('numb_manager');
      refreshObjective();
    }, { enabled: () => machine.state === 'LOBBY_CONTROL' && lobbyControlled && !rearGuardSecured });
    use(p.bank.interactables.manager, 'Move the manager to the vault', () => {
      if (machine.state !== 'GUARDS_SECURED' || !rearGuardSecured) return;
      advanceTo('MANAGER_ESCORT');
      managerEscortProgress = 0;
      say('manager_delay');
      say('shubes_answer');
      recordCheckpoint('bank_secured', 'MANAGER_ESCORT', {
        guardsDisarmed: 2, civiliansHarmed: objective.civilianCasualties,
      });
      refreshObjective();
      refreshInteractions();
    });
    use(p.bank.interactables.vault,
      state === 'MANAGER_ESCORT' ? 'Open the access panel' : 'Complete the vault bypass', () => {
        if (machine.state === 'MANAGER_ESCORT') {
          advanceTo('VAULT_BYPASS');
          say('shubes_vault');
          audio.play('heist.vault.panel');
          refreshInteractions();
        } else if (machine.state === 'VAULT_BYPASS') {
          advanceTo('CASH_LOADING');
          // Animated here and only here: the bypass is the one time anybody
          // watches this door move. Restores and preview stagers snap.
          p.bank.interactables.vault.userData.setOpen?.(true, { animate: true });
          recordCheckpoint('vault_open', 'CASH_LOADING', {
            alarmTriggered: true, bagsStaged: 0,
          });
          refreshObjective();
          sayCommand('lou_radio_vault');
          sayInTurn('snow_clock', 'snow_insured');
          audio.play('heist.vault.open');
        }
      }, {
        hold: state === 'VAULT_BYPASS' ? 1.8 : undefined,
        enabled: () => machine.state === 'VAULT_BYPASS'
          || (machine.state === 'MANAGER_ESCORT' && managerEscortProgress >= 1),
      });

    for (let i = 1; i <= 8; i++) {
      const bagId = `cash_${i}`;
      const bagMesh = p.bank.group.getObjectByName(`cash-${i}`);
      use(bagMesh, carryingBag ? 'Hands full' : `Take cash bag ${i}`, () => {
        if (machine.state !== 'CASH_LOADING' || carryingBag || !loot.carry(bagId, CHARACTER_IDS.PROSPECT)) return;
        carryingBag = bagId;
        carriedBagMesh = bagMesh;
        bagMesh.userData.carried = true;
        audio.play('heist.cash.lift');
        hud.setBag(loot.get(bagId).value, 1);
      }, { enabled: () => machine.state === 'CASH_LOADING' && !carryingBag && !loot.get(bagId).recovered });
    }
    /* THE STAGING POINT IS A PLACE ON THE FLOOR.
     *
     * Owner: *"The staging point should be clearly marked near the bank door.
     * like a yellow circle maybe. lkets make sure the money bags appear there
     * as duffle bags as you stage them."* Both halves were missing. The
     * prompt used to live on `bank-exit` — the pane of glass in the doorway,
     * 1.9 m up — so the order said "drop it on the staging point" and the
     * only thing that could take a bag was a window; and staging one moved a
     * number on the HUD and put nothing whatever in the room.
     *
     * `level.js` paints the circle. This puts a duffle on it per bag.
     */
    use(p.bank.interactables.staging,
      carryingBag ? 'Drop the cash bag on the staging point' : 'Cash staging point', () => {
        if (machine.state !== 'CASH_LOADING' || !carryingBag) return;
        const bagId = carryingBag;
        loot.drop(bagId, { anchor: 'bank_exit', position: { ...STAGING_POINT, y: 0.3 } });
        carryingBag = null;
        bankBagsStaged++;
        audio.play('heist.cash.drop');
        if (carriedBagMesh) { carriedBagMesh.userData.carried = false; carriedBagMesh.visible = false; }
        carriedBagMesh = null;
        hud.setBag(0, 0);
        stageBankBags(bankBagsStaged);
        if (bankBagsStaged >= 2) {
          /* Two by hand and the crew bring the rest — which is what the order
           * has always said, and what the heap on the circle now shows. */
          for (let i = 1; i <= 8; i++) {
            const id = `cash_${i}`;
            const bag = loot.get(id);
            if (!bag.carrier && !bag.position) loot.carry(id, i % 2 ? CHARACTER_IDS.DEATHMEGATRON : CHARACTER_IDS.NUMBSKULL);
            if (loot.get(id).carrier) loot.drop(id, { anchor: 'bank_exit', position: { ...STAGING_POINT, y: 0.3 } });
          }
          bankBagsStaged = 8;
          stageBankBags(8);
          audio.startLoop('heist.bank.alarm', { volume: 0.34, ambience: true, fade: 0.15 });
          advanceTo('ALARM_DISCOVERED');
          advanceTo('EXIT_ORDER');
          sayCommand('lou_radio_street');
          sayInTurn('numb_signal', 'rippin_street', 'snow_exit');
          refreshObjective();
        }
        refreshInteractions();
      }, { soft: true, enabled: () => machine.state === 'CASH_LOADING' && Boolean(carryingBag) });
    /* THE DOORS DO NOT OPEN ON A ROOM WITH WITNESSES IN IT.
     *
     * Once the sweep has latched (see `noteCustomerDown`) the crew cannot
     * leave a lobby that can describe them. It is the consequence that makes
     * the changed objective an objective rather than a caption. */
    use(p.bank.interactables.exit, () => {
      if (noWitnesses && witnessesRemaining() > 0) {
        return `${witnessesRemaining()} of them can still describe us — the room first`;
      }
      return bankBagsStaged >= 8
        ? 'Withdraw from the bank'
        : 'The doors — the cash goes on the circle first';
    }, () => {
      if (machine.state !== 'EXIT_ORDER') return;
      if (noWitnesses && witnessesRemaining() > 0) {
        announceObjective(`No witnesses. ${witnessesRemaining()} still standing in the lobby.`);
        sayPooled(SNOW_CASUALTY_LADDER, 'sweep');
        return;
      }
      beginStreet();
    });
    return;
  }

  if (activePhase === 'street') {
    use(p.street.interactables.bankDoor, 'Move off the bank steps', () => {
      if (machine.state === 'BANK_DOOR_CONTACT') advanceTo('STREET_BLOCK_ONE');
      refreshObjective();
    });
    use(p.street.interactables.van, () => (blockCleared()
      ? 'Reach Rippin at the van'
      : `Police fire blocks the van — ${officersDown}/${officersNeeded()} down`), () => {
      if (machine.state !== 'STREET_BLOCK_ONE' || !blockCleared()) return;
      advanceTo('FALLBACK_ROUTE');
      crew.get(CHARACTER_IDS.RIPPINFLOW).injury = 'moderate';
      advanceTo('STREET_BLOCK_TWO');
      officersDown = 0;
      sayInTurn('rippin_van', 'rippin_hit', 'snow_fallback');
      spawnPolice('market_street', 4);
      refreshObjective();
    });
    use(p.street.interactables.droppedBag, 'Recover the dropped bag', () => {
      if (machine.state !== 'STREET_BLOCK_TWO' || droppedBagDecision) return;
      droppedBagDecision = 'recovered';
      loot.carry('cash_8', CHARACTER_IDS.PROSPECT);
      carryingBag = 'cash_8';
      carriedBagMesh = p.street.interactables.droppedBag;
      hud.setBag(loot.get('cash_8').value, 1);
      say('numb_bag');
      advanceTo('DROPPED_BAG_DECISION');
      refreshInteractions();
    });
    use(p.street.interactables.garage, 'Enter Mercer garage', () => {
      if (!['STREET_BLOCK_TWO', 'DROPPED_BAG_DECISION'].includes(machine.state)
        || !blockCleared()) return;
      enterGarage();
    }, { enabled: () => blockCleared() });
    return;
  }

  if (activePhase === 'garage') {
    use(p.garage.interactables.hold, () => (blockCleared()
      ? 'Signal the loading move'
      : `Hold the garage entrance — ${officersDown}/${officersNeeded()} down`), () => {
      if (machine.state === 'GARAGE_ENTRY') advanceTo('GARAGE_HOLD');
      if (machine.state === 'GARAGE_HOLD' && blockCleared()) {
        say('shubes_garage');
        refreshObjective();
      }
    });
    use(p.garage.interactables.load, 'Load crew and cash into the sedan', () => {
      if (machine.state !== 'GARAGE_HOLD' || !blockCleared()) return;
      advanceTo('SECONDARY_CAR_LOAD');
      for (const record of loot.capture()) {
        if (record.abandoned || record.seized) continue;
        if (!record.carrier) loot.carry(record.id, CHARACTER_IDS.DEATHMEGATRON);
        loot.load(record.id, 'escape_sedan');
      }
      say('death_load');
      refreshObjective();
    });
    use(p.garage.interactables.drive, 'Take the driver seat', () => {
      if (machine.state === 'SECONDARY_CAR_LOAD') beginDriving();
    });
    return;
  }

  if (activePhase === 'driving' && state === 'VEHICLE_SWAP') {
    const allDone = Object.values(swapProgress).every(Boolean);
    use(p.driving.interactables.trunk, swapProgress.trunk ? 'Clean trunk open' : 'Open the clean car trunk', () => {
      swapProgress.trunk = true;
      audio.play('heist.swap.trunk');
      refreshObjective();
      refreshInteractions();
    }, { enabled: () => !swapProgress.trunk });
    use(p.driving.interactables.bags, swapProgress.bags ? 'Cash transferred' : 'Transfer the recovered bags', () => {
      if (!swapProgress.trunk) return;
      for (const bag of loot.capture()) {
        if (bag.vehicle !== 'escape_sedan') continue;
        loot.unload(bag.id, 'industrial_swap');
        loot.carry(bag.id, CHARACTER_IDS.DEATHMEGATRON);
        loot.load(bag.id, 'clean_swap_car');
      }
      swapProgress.bags = true;
      say('death_swap_bags');
      refreshInteractions();
    }, { hold: 1.4, enabled: () => swapProgress.trunk && !swapProgress.bags });
    use(p.driving.interactables.aid, swapProgress.aid ? 'Rippin stabilized' : 'Help Rippin bind the wound', () => {
      swapProgress.aid = true;
      crew.get(CHARACTER_IDS.RIPPINFLOW).injury = 'stabilized';
      say('rippin_swap_aid');
      refreshInteractions();
    }, { hold: 1.3, enabled: () => !swapProgress.aid });
    use(p.driving.interactables.masks, swapProgress.masks ? 'Masks bagged' : 'Remove and bag the masks', () => {
      swapProgress.masks = true;
      setCrewMasked(crew, false);
      audio.play('heist.swap.fabric');
      refreshInteractions();
    }, { enabled: () => !swapProgress.masks });
    use(p.driving.interactables.jackets, swapProgress.jackets ? 'Outer layers changed' : 'Change the outer jackets', () => {
      swapProgress.jackets = true;
      audio.play('heist.swap.fabric');
      refreshInteractions();
    }, { enabled: () => swapProgress.masks && !swapProgress.jackets });
    use(p.driving.interactables.weapons, swapProgress.weapons ? 'Weapons sealed' : 'Clear and bag the weapons', () => {
      swapProgress.weapons = true;
      for (const gun of Object.values(loadout.weapons)) gun.beginReload();
      audio.play('heist.swap.weapons');
      refreshInteractions();
    }, { hold: 1.1, enabled: () => !swapProgress.weapons });
    use(p.driving.interactables.wipe, swapProgress.wiped ? 'Evidence surfaces wiped' : 'Wipe the secondary car and gear', () => {
      swapProgress.wiped = true;
      audio.play('heist.swap.wipe');
      refreshInteractions();
    }, { hold: 1.5, enabled: () => swapProgress.bags && !swapProgress.wiped });
    use(p.driving.interactables.depart, allDone ? 'Leave in the clean car' : 'Finish the evidence swap first', returnSafehouse, {
      enabled: () => Object.values(swapProgress).every(Boolean),
    });
    return;
  }

  /**
   * The debrief, which the owner could not read at all.
   *
   * *"Also everyone is just waiting for me at the end. Not sure what the
   * debrief shit is either."* It was three hold-prompts on unrelated props
   * with no readout, so nothing told the player what had just been decided.
   * It is now four numbered steps with a visible board, in order, and every
   * step states its own result on the HUD before the next one unlocks.
   */
  if (activePhase === 'safehouse' && stateIndex(state) >= stateIndex('SAFEHOUSE_RETURN')) {
    /* STEP ONE IS ON THE MAN, NOT ON THE VEST STAND.
     *
     * Owner: *"Rippin's leg just re-arms armor"*. It was registered on
     * `interactables.armor` — the plate carrier on its mannequin, six metres
     * from Rippinflow, and the one prop in this room whose every other verb is
     * about body armour. See `SAFEHOUSE_DEBRIEF_STEPS` in `./orders.js` for the
     * whole account; the table is the only place the four steps and their props
     * are written down now, and nothing in it names the armour stand.
     *
     * The handler touches the injury and the objective. It does not touch
     * `preparation`, `syncPlayerArmor`, or `armor.userData.setEquipped` — the
     * vest is still on the player until he puts the guns down at 3/4, which is
     * the step that is actually about gear. */
    const rippin = crew.get(CHARACTER_IDS.RIPPINFLOW);
    const debriefProps = {
      rippin: rippin.group,
      briefing: p.safehouse.interactables.briefing,
      loadout: p.safehouse.interactables.loadout,
      van: p.safehouse.interactables.van,
    };
    const firstAid = debriefStep('first_aid');
    use(debriefProps[firstAid.target],
      () => (rippin.injury === 'stabilized' ? firstAid.doneLabel : firstAid.label), () => {
        if (machine.state !== 'SAFEHOUSE_RETURN') return;
        advanceTo('FIRST_AID');
        say('rippin_aid');
        /* The dressing, out loud. `heist.swap.fabric` is the bag-the-masks cue
         * and it is a strip of cloth being pulled tight, which is the same
         * sound and the only one in this scene's bank that is. */
        audio.play('heist.swap.fabric', { volume: 0.7 });
        rippin.injury = 'stabilized';
        refreshObjective();
        refreshInteractions();
      }, { hold: firstAid.hold, enabled: () => machine.state === 'SAFEHOUSE_RETURN' });
    /* The label reads the table, before and after. Before the count it is the
     * instruction; after it, the table is a readout the player can walk back
     * to and be told the number again — which is the whole point of putting
     * the bags on it. */
    const count = debriefStep('count');
    use(debriefProps[count.target], () => (machine.state === count.state
      ? count.label
      : `The take: ${objective.bagsRecovered} of ${objective.totalBags} bags home`), () => {
      if (machine.state !== count.state) return;
      advanceTo('MONEY_COUNT');
      objective.syncLoot(loot.summary());
      objective.syncHostages(hostages.summary());
      showDebriefBoard();
      advanceTo('DEBRIEF');
      /* Lou frames it, because that is his job and because it is the only
       * place the two objective numbers get said out loud to the player. The
       * lines are chosen from what actually happened, not from a script, and
       * they are sequenced rather than pushed, so all of them are heard. */
      const clean = ['professional', 'barely_clean'].includes(objective.grade());
      sayInTurn(
        'snow_debrief_open',
        'numb_debrief_ledger',
        'death_debrief_count',
        'lou_debrief_open',
        'snow_debrief_people',
        objective.civilianCasualties === 0
          ? 'lou_debrief_people_clean' : 'lou_debrief_people_dirty',
        'snow_debrief_money',
        objective.bagsRecovered >= objective.totalBags
          ? 'lou_debrief_money_full' : 'lou_debrief_money_short',
        objective.personalCashTaken > 0 ? 'lou_debrief_souvenirs' : null,
        clean ? 'lou_debrief_verdict_good' : 'lou_debrief_verdict_bad',
        clean ? 'snow_debrief_clean' : 'snow_debrief_ugly',
        'shubes_signature_cleanup',
        'shubes_defend',
        'death_ammo',
        'numb_home',
        'snow_good',
        'prospect_debrief',
      );
      refreshObjective();
      refreshInteractions();
    }, { hold: count.hold, enabled: () => machine.state === count.state });
    const weaponsStep = debriefStep('weapons_down');
    use(debriefProps[weaponsStep.target], weaponsStep.label, () => {
      if (machine.state !== weaponsStep.state || weaponsDown) return;
      weaponsDown = true;
      audio.play('heist.weapon.down');
      preparation.reset();
      syncSafehousePresentation();
      syncHeistInventory(true);
      refreshObjective();
      refreshInteractions();
    }, { enabled: () => machine.state === weaponsStep.state && !weaponsDown });
    const louStep = debriefStep('lou_call');
    use(debriefProps[louStep.target], louStep.label, () => {
      if (machine.state !== louStep.state || !weaponsDown) return;
      advanceTo('LOU_CALL_SAFEHOUSE');
      scriptedSpeech.length = 0;
      sayInTurn('lou_call', 'lou_prospect_verdict', 'prospect_home');
      setTimeout(completeMission, 3200);
    }, { enabled: () => machine.state === louStep.state && weaponsDown });
  }
}

/**
 * The physical readout on the briefing table.
 *
 * The end card is a card; this is the thing in the room, so the player can see
 * the verdict where the crew is standing rather than only after the scene has
 * taken control away from him.
 */
function showDebriefBoard() {
  objective.syncLoot(loot.summary());
  objective.syncHostages(hostages.summary());
  /* The count, on the table the crew is standing round, not only in a panel
   * in the corner of the screen. The plan comes off and the bags that made it
   * home go on — see `briefing.userData.setDebrief`. */
  level.phases.safehouse.interactables.briefing.userData.setDebrief?.(
    Math.min(8, objective.bagsRecovered), true,
  );
  const board = document.getElementById('debrief-board');
  if (!board) return;
  const rows = objective.scorecard()
    .map((row) => `<tr class="${row.good ? 'good' : 'bad'}">`
      + `<td>${row.label}</td><td>${row.value}</td></tr>`)
    .join('');
  board.innerHTML = `<h2>THE TAKE — DEBRIEF</h2><table>${rows}</table>`
    + `<p class="verdict ${objective.grade()}">${objective.grade().replaceAll('_', ' ').toUpperCase()}</p>`;
  board.classList.remove('hidden');
}

/**
 * The floor under a point, which in the garage is not always the floor.
 *
 * `spawnPolice` places every officer at y 0. That is right everywhere except
 * the one place they are supposed to come IN from: the garage ramp slopes
 * from the street down to the floor across z 9 to 17, so a man staged on its
 * footprint at floor height arrives buried to the chest in concrete. Which is
 * exactly what the owner watched happen.
 *
 * The constants mirror the slab in `buildGaragePhase`: tilt -0.22 about a
 * pivot at y 0.72, z 13, half-thickness 0.15.
 */
const GARAGE_RAMP = Object.freeze({
  halfWidth: 3.5, minZ: 9, maxZ: 17, pivotZ: 13, pivotY: 0.866, slope: 0.2182,
});

function groundYAt(x, z) {
  if (activePhase !== 'garage') return 0;
  if (Math.abs(x) > GARAGE_RAMP.halfWidth) return 0;
  if (z < GARAGE_RAMP.minZ || z > GARAGE_RAMP.maxZ) return 0;
  return Math.max(0, GARAGE_RAMP.pivotY + (z - GARAGE_RAMP.pivotZ) * GARAGE_RAMP.slope);
}

function spawnPolice(block, count, { wave = false } = {}) {
  const gates = police.request(block, { count, visibleGates: [] });
  const baseZ = activePhase === 'street' ? 20 - policeFigures.length * 6 : 5;
  const entries = WAVE_ENTRY[block] ?? [];
  for (let i = 0; i < gates.length; i++) {
    /* A wave comes in through an authored entry point — up the street behind
     * the player, out of an alley, up the garage ramp — rather than at the
     * arithmetic position the opening contact staged itself at. Reinforcements
     * appearing out of open road in front of you is what makes them read as
     * spawned rather than as arriving. */
    const entry = wave ? entries[(waveIndex * 2 + i) % Math.max(1, entries.length)] : null;
    const contact = (BLOCK_CONTACT[block] ?? [])[i % Math.max(1, (BLOCK_CONTACT[block] ?? []).length)];
    addPoliceFigure({
      id: `${block}_${policeFigures.length}_${waveIndex}`,
      block,
      phaseId: activePhase,
      position: (() => {
        const [px, pz] = entry
          ? [entry[0] + (Math.random() - 0.5) * 1.6, entry[1] + (Math.random() - 0.5) * 2.4]
          : (contact
            ? [contact[0], contact[1]]
            : [(i % 2 ? -1 : 1) * (4 + i), baseZ - i * 5]);
        return [px, groundYAt(px, pz), pz];
      })(),
      recycle: wave,
    });
  }
  window.__heistDebug.policeActive = activePoliceMeshes().length;
  window.__heistDebug.policeSpawned += gates.length;
  window.__heistDebug.poolUsage.police = policeFigures.length;
  return gates.length;
}

/* ------------------------------------------------------------------ */
/* Waves                                                               */
/* ------------------------------------------------------------------ */

/**
 * What the block the player is standing in costs, and whether it is paid.
 *
 * `officersDown >= 2` was hardcoded at five separate gates and in three
 * objective strings, so the first two officers to arrive opened the way past
 * the other twelve. `BLOCK_CLEAR_OFFICERS` in `config.js` is the one number,
 * per block, and it is what the order counts down.
 */
function officersNeeded() {
  return BLOCK_CLEAR_OFFICERS[activePoliceBlock()] ?? 2;
}

function blockCleared() {
  return officersDown >= officersNeeded();
}

/** Which block is feeding the contact the player is standing in. */
function activePoliceBlock() {
  if (activePhase === 'garage') return 'mercer_garage';
  if (activePhase !== 'street') return null;
  return ['STREET_BLOCK_TWO', 'DROPPED_BAG_DECISION', 'FALLBACK_ROUTE']
    .includes(machine.state) ? 'market_street' : 'bank_avenue';
}

/**
 * Where a wave comes in from, per block. IN FRONT, along the way out.
 *
 * Owner: *"the cops have spawned behind me instead of infront of me. I want
 * to fight my way through some waves of cops ... We fight are way down the
 * street to the van."*
 *
 * This table used to insist that a wave came in from behind and beside and
 * never in front, and it meant it: every `bank_avenue` entry was between z 24 and z 32, and the player
 * comes out of the bank at z 31 and works DOWN the street to the dead van at
 * z 14. So the reinforcements for the first contact arrived on the bank steps
 * he had just left, behind his shoulder, between him and nothing.
 *
 * That reasoning was not wrong in general — men appearing out of open road in
 * front of you read as spawned. It was wrong HERE, because it was written for
 * a defence and this is an advance. The player is going somewhere, and the
 * police are what is between him and it: they come up the street toward him,
 * at the far end of the block he has to cross, with the parked cars between.
 * Far enough out that they are seen arriving rather than seen appearing.
 */
const WAVE_ENTRY = Object.freeze({
  // Block one: he leaves the bank at z 31 and fights down to the van at 14.
  bank_avenue: [[-6.4, 4], [6.4, 2], [-5.2, -1], [5.6, -3], [0, -6]],
  // Block two: he leaves the van at z 14 and falls back to the garage at −35.
  market_street: [[-6.6, -18], [6.6, -21], [-5.4, -25], [5.8, -27], [0, -30]],
  /* The garage is a defence, and its entry is the ramp he is told to hold.
   * These stand ON the ramp on purpose, which is only possible now that
   * `groundYAt` puts them on its surface instead of at floor height -- the
   * old `(0, 14)` sat a man chest-deep in concrete. Coming down the slope is
   * the believable entrance the owner asked for, and it keeps every arrival
   * five to eight metres from where he holds rather than on top of him. */
  mercer_garage: [[-2.4, 12.6], [2.4, 12.6], [-1.1, 14.4], [1.1, 13.8], [0, 11.2]],
});

/**
 * Where the OPENING contact of a block is standing when it starts.
 *
 * `spawnPolice` used to stage the first five at
 * `[(i % 2 ? -1 : 1) * (4 + i), 0, baseZ - i * 5]`, an arithmetic ladder down
 * the middle of the road that put nobody near cover and depended on how many
 * bodies the pool had already built. These are on the street's own fire
 * positions, so the contact opens with men behind cars.
 */
const BLOCK_CONTACT = Object.freeze({
  bank_avenue: [[5.5, 19.9], [-5.5, 21.1], [1.9, 15.6], [5.5, 14.1], [-1.9, 8.6]],
  market_street: [[-5.5, -1.1], [5.5, -8.1], [1.9, -12.4], [-5.5, -15.1], [-1.9, -19.4]],
  /* Three of these -- (-2.4, 12.2), (2.4, 12.2) and (0, 11.4) -- used to sit
   * inside the ramp footprint, which is why the opening contact was a row of
   * men standing waist-deep in the slope doing nothing. They hold the pillar
   * line and the lane mouths instead, which is cover they can actually use. */
  mercer_garage: [[-8, 11.2], [8, 11.2], [-5.6, 6.2], [5.6, 6.2], [0, 8.4]],
});

let waveClock = 4.5;
let waveIndex = 0;

/**
 * Keep the contact fed until the block is spent.
 *
 * The rule is deliberately about PRESSURE rather than about a timer: a wave
 * arrives when the street has thinned out, so a player who is winning gets
 * the next one and a player who is pinned does not get piled on. `budget` is
 * what ends it — every block runs dry, and when it does the street goes quiet
 * for good and the objective says to move.
 */
function updatePoliceWaves(dt) {
  const block = activePoliceBlock();
  if (!block || machine.state === 'FAILED' || missionCompleted) return;
  const cap = activePhase === 'garage'
    ? Math.min(5, PERFORMANCE_BUDGET.maxActivePoliceGarage)
    : Math.min(6, PERFORMANCE_BUDGET.maxActivePoliceStreet);
  const live = activePoliceMeshes().length;
  if (live >= cap) { waveClock = Math.max(waveClock, 2.5); return; }
  // Thinner street, faster reinforcement — but never instantly.
  waveClock -= dt * (live <= 1 ? 1.9 : 1);
  if (waveClock > 0) return;
  waveClock = 6.5 + Math.random() * 3;
  const wanted = Math.min(cap - live, live <= 1 ? 3 : 2);
  const spawned = spawnPolice(block, wanted, { wave: true });
  if (!spawned) return;
  waveIndex++;
  audio.play('heist.police.sirens', { volume: 0.3, rate: 1.04 });
  /* One call per wave, cooled down hard, so a running fight does not become
   * Snow narrating every officer who steps out of an alley. */
  const now = performance.now() / 1000;
  if (now > waveBarkAt) {
    waveBarkAt = now + 11;
    say(activePhase === 'garage' ? 'shubes_defend' : 'snow_contact');
  }
}

/**
 * An officer who is already down, ready to be somebody else.
 *
 * A fourteen-man contact that builds fourteen `makePerson` figures is
 * fourteen rigs in a scene that already has twenty-two civilians and six
 * crew in it. A wave takes a body that has stopped being looked at, puts it
 * back on its feet somewhere the player is not, and gives it a fresh actor.
 */
function recycleDownedOfficer(phaseId) {
  return policeFigures.find((entry) => entry.actor.incapacitated
    && entry.root.userData.phaseId === phaseId
    && entry.root.position.distanceToSquared(player.position) > 400) ?? null;
}

function activePoliceMeshes() {
  return policeFigures
    .filter((entry) => entry.root.visible
      && !entry.actor.incapacitated
      && entry.root.userData.phaseId === activePhase)
    .map((entry) => entry.root);
}

/**
 * An officer.
 *
 * These used to be one 0.72 × 1.78 × 0.52 box each, which is why "shooting
 * people" produced a box blinking out of existence. They are `makePerson`
 * figures now, braced two-handed behind cover, and when one goes down he goes
 * down where he was standing and stays there.
 */
function addPoliceFigure({
  id, block, phaseId, position, actorSnapshot = null, visible = true, recycle = false,
}) {
  const actor = new CombatActor({ id, faction: FACTIONS.POLICE, maxHealth: 80, armor: 12 });
  if (actorSnapshot) actor.restore(actorSnapshot);
  /* A later wave puts a body that has stopped being looked at back on its
   * feet rather than building another rig. See `recycleDownedOfficer`. */
  const spare = recycle ? recycleDownedOfficer(phaseId) : null;
  if (spare) {
    /* The dead man's shared combat pipeline goes with him: the fresh actor on
     * this body gets fresh perception, aim and a fresh magazine. */
    combat.dropHostile(spare.actor.id);
    spare.actor = actor;
    spare.root.userData.combatActor = actor;
    spare.root.userData.block = block;
    spare.root.userData.down = false;
    spare.root.visible = visible;
    spare.root.position.set(position[0], 0, position[2]);
    spare.root.rotation.y = Math.PI;
    spare.figure.aiming?.();
    /* A recycled body is a NEW officer. He does not inherit the bound the
     * dead man was halfway through, or the fire position he had claimed —
     * which would keep that slot reserved for a corpse for the rest of the
     * block. See `updatePoliceMovement`. */
    spare.movement = null;
    window.__heistDebug.policeActive = activePoliceMeshes().length;
    return spare.root;
  }
  const index = policeFigures.length;
  const figure = makePoliceFigure({
    name: `police-${id}`, x: position[0], z: position[2], yaw: Math.PI, index,
  });
  const root = figure.root;
  root.visible = visible;
  root.userData.combatActor = actor;
  root.userData.block = block;
  root.userData.phaseId = phaseId;
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.85, 0.7),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
  );
  proxy.position.y = 0.95;
  // See `HeistCombatAdapter.trace`: aim volume, never a contact surface.
  proxy.userData.aimProxy = true;
  root.add(proxy);
  if (actor.incapacitated) figure.fallen();
  level.phases[phaseId].group.add(root);
  /* One shared-resolver registration per BODY — recycled officers swap the
   * actor on the same root, and the descriptor reads it live. The unregister
   * handle travels with the entry so a checkpoint teardown can release it. */
  const unregister = combat.register(root, HEIST_BODY_DESCRIPTOR);
  policeFigures.push({ root, figure, actor, unregister });
  return root;
}

function policeEntryFor(root) {
  return policeFigures.find((entry) => entry.root === root) ?? null;
}

function fireWeapon() {
  if (!started || driving || missionCompleted || simulationPaused) return;
  const active = loadout.activeWeapon;
  if (!active) {
    // Empty hands, a bag, the mask or the ties: nothing to pull.
    audio.play('heist.weapon.check', { volume: 0.35, rate: 0.85 });
    return;
  }
  const sidearm = loadout.selectedItem === 'sidearm';
  /* THE SHARED WEAPON SOUND, NOT A LOCAL ONE.
   *
   * Owner: *"better blood + gun sound effects — reuse the shared
   * weapons/impact kit"*, and *"can we use the guns we already made from the
   * other scenes here?"* THE TAKE was playing ONE recording for both guns —
   * `heist.weapon.carbine.indoor` at rate 1.28 for the sidearm, which is a
   * carbine played fast rather than a pistol. `src/core/weapons/audio.js`
   * already owns five cue slots per weapon for all six guns in the game, with
   * a real recording standing in for every one until the wanted cue lands; the
   * heist's own carbine recordings are what stands in for the carbine. So the
   * pistol is now a pistol, the dry click is the right dry click, and the day
   * the `weapon.*` cues are recorded this picks them up with no code change.
   */
  const shot = active.fire();
  if (!shot.fired) {
    if (shot.reason === 'empty') {
      playWeaponCue(audio, sidearm ? WEAPON_IDS.PISTOL9 : WEAPON_IDS.CARBINE, 'empty');
    }
    return;
  }
  refreshAmmoReadout();
  playWeaponCue(audio, sidearm ? WEAPON_IDS.PISTOL9 : WEAPON_IDS.CARBINE, 'fire', {
    /* A carbine inside a marble lobby is not a carbine on a street. The
     * indoor recording is the carbine's stand-in either way; the tail is what
     * changes, so the room is in the mix rather than in the cue name. */
    volume: sidearm ? 0.78 : 0.92,
    rate: activePhase === 'bank' ? 1 : 0.97,
  });
  emitCasing();
  viewModel.fire();
  muzzle.intensity = sidearm ? 6 : 8;
  camera.rotation.z += (Math.random() - 0.5) * (sidearm ? 0.012 : 0.008);
  if (activePhase === 'bank') hostages.startleAll(sidearm ? 0.5 : 0.65);
  /* SHOT TRUTH IS THE SHARED SEAM'S. One honest ray into the active phase,
   * first visible hit wins, and only a registered hierarchy can bleed —
   * `combat.resolvePlayerShot` owns the trace and the Located damage, this
   * function owns what the mission does about it. */
  raycaster.setFromCamera(SCREEN_CENTER, camera);
  const impact = combat.resolvePlayerShot({
    origin: raycaster.ray.origin,
    direction: raycaster.ray.direction,
    weapon: active.weaponId,
    damage: shot.damage,
    penetration: shot.penetration,
  });
  const located = impact.located;
  const reachedActor = Boolean(located && located.reason !== 'unregistered' && located.actor);
  objective.noteShot({ hitActor: reachedActor });
  /* Before any of the early returns below: a round that misses still counts. */
  notePoliceSuppression(raycaster.ray.origin, raycaster.ray.direction,
    impact.hit ? impact.hit.point : null);
  if (!impact.hit) return;
  // A round into a wall throws dust; a round into a person does not.
  if (!reachedActor) { emitImpact(impact.hit.point); return; }
  const actor = located.actor;
  const result = applyPlayerImpactConsequences(located);
  if (!result?.applied) { emitImpact(impact.hit.point); return; }
  presentBlood(located);
  if (actor === managerActor && result.fatal) {
    /* The manager is a civilian, not an immortal objective prop. Killing him
     * is allowed to land and read as a real casualty, but the vault sequence
     * cannot continue without him. Restore the last safe lobby checkpoint
     * immediately instead of leaving a corpse as the required interaction. */
    announceObjective('The manager is down. Restoring the last safe lobby checkpoint.');
    failMission('manager_incapacitated');
    return;
  }
  if (actor === lobbyGuardActor && result.fatal) {
    neutralizeLobbyGuard('player_shot');
    return;
  }
  if (actor === rearGuardActor && result.fatal) {
    rearGuardSecured = true;
    level.phases.bank.interactables.rearGuard.userData.setNeutralized?.();
    audio.play('heist.guard.weapon.drop');
    if (machine.state === 'LOBBY_CONTROL' && lobbyControlled) {
      advanceTo('GUARDS_SECURED');
      say('numb_manager');
      refreshObjective();
    }
    refreshInteractions();
    return;
  }
  if (actor.faction === FACTIONS.POLICE && result.fatal) {
    const downedRoot = located.root;
    const entry = policeEntryFor(downedRoot);
    if (entry) entry.figure.setState('down', { roll: Math.random() > 0.5 ? 0.6 : -0.6 });
    officersDown++;
    objective.noteOfficerDown();
    police.remove(downedRoot.userData.block);
    window.__heistDebug.policeActive = activePoliceMeshes().length - 1;
    downedRoot.userData.down = true;
    refreshInteractions();
  }
}

/* ------------------------------------------------------------------ *
 * FIRE AND MOVEMENT
 *
 * Owner: *"Im not sure the combat system is implemented in the street fight
 * at all. Everyones just standing ther enad the cops have spawned behind me
 * instead of infront of me. I want to fight my way through some waves of
 * cops. Use the systems weve implemented for the mansion siege. Waves combat
 * etc. We fight are way down the street to the van."*
 *
 * Half of it WAS implemented: `combat.updateHostile` runs the shared
 * perception, aim, ammunition and fire-control pipeline for every officer,
 * and `updatePoliceWaves` has fed the block a wave at a time since it was
 * written. What was missing is the only part the player can see. Nothing in
 * this scene ever moved an officer. He was spawned at a coordinate, he called
 * `figure.aiming()`, and he stood on that coordinate shooting until he was
 * killed — for the whole block, at whatever range he happened to arrive at.
 *
 * So this is the mansion siege's own movement layer, on the siege's own
 * shared module: `AabbCombatSpace` from `src/core/combat/spatial.js` owns the
 * step and the separation, exactly as `SIEGE_COMBAT_SPACE` does in
 * `src/mansion/siege/attackers.js`, so an officer slides along a parked car
 * instead of walking through it and two of them cannot stand in the same
 * metre.
 *
 * The behaviour is BOUND AND HOLD, which is what men with rifles actually do
 * and what makes a street fight read as one:
 *
 *   hold   two to five seconds, stationary, shooting through the shared
 *          pipeline from behind whatever he is behind.
 *   bound  a run of up to two seconds to the next authored fire position
 *          closer to the player, at a third of his accuracy — because a man
 *          crossing open ground is not the man to be afraid of, the two
 *          holding on either side of him are.
 *
 * Every officer has his own STANDOFF, and he stops closing at it. Without one
 * they converge on the player and the fight becomes a scrum at contact range;
 * with a spread of them, the block occupies a depth of street and the player
 * has to work through it rather than round it.
 *
 * The fire positions themselves are authored in `level.js` beside the cars
 * they belong to (`phase.firePositions`), so the fight runs along the cover
 * the street has rather than down the middle of the road.
 * ------------------------------------------------------------------ */

/**
 * The same body the siege moves: a 0.36 m capsule that cannot share a metre.
 *
 * Shared by everybody in this scene who walks under their own power — the
 * police bounding down Mercer, and the customers who break for the bank doors.
 */
const HEIST_BODY_SPACE = new AabbCombatSpace({
  radius: 0.36,
  height: 1.82,
  separation: 0.94,
  verticalSeparation: 1.2,
  floorClearance: 0.08,
  headClearance: 0.04,
});

const POLICE_MOVEMENT = Object.freeze({
  /** Metres per second across open ground between two fire positions. */
  boundSpeed: 3.15,
  /** Seconds in cover between bounds. */
  hold: Object.freeze([2.3, 5.4]),
  /** A bound is a bound. Past this he takes cover wherever he got to. */
  boundSeconds: 2.1,
  /** How near a slot counts as reached. */
  arrive: 0.6,
  /** Nobody closes past this, and nobody bothers moving from beyond that. */
  standoff: Object.freeze([6.5, 14.5]),
  /** A bound has to be worth making, and has to be reachable. */
  gain: 3.0,
  reach: 16,
});

/**
 * THE GARAGE FIGHTS AT A DIFFERENT RANGE, and used not to fight at all.
 *
 * Owner, playtest 2026-08-26, on the garage: *"they're kind of just standing
 * there, and they're all kind of just standing there too."*
 *
 * The numbers above were written for the street, where a block runs seventy
 * metres and men bound between parked cars. The garage is a 24 x 30 room, the
 * player holds at z 6.4, and its eleven fire positions sit between 5.00 and
 * 9.43 m from him. So `toPlayer < standoff - 1.5` threw out every slot for
 * anybody whose rolled standoff came up past about 11 -- and `own - toPlayer
 * < gain` threw out the rest, because in a room that small no bound can buy
 * three metres of closure. `chooseFirePosition` returned null every time and
 * every officer sat in `hold` forever. Combat was running, the movement code
 * was running; there was simply nothing either would ever pick.
 *
 * These are the same rules measured against the room they are used in.
 */
const GARAGE_MOVEMENT = Object.freeze({
  /* The top of the band matters as much as the bottom, and for a reason that
   * is easy to miss. Reinforcements arrive at the head of the ramp about 7.4 m
   * from where the player holds. Any slot further out than that is FURTHER
   * from the man than he already is, so it scores a negative gain and is
   * rejected -- which means a standoff above roughly 6.5 leaves him nothing to
   * pick in either direction and he stands still. The band has to sit under
   * the range the room actually delivers him at. */
  standoff: Object.freeze([3.6, 6.4]),
  gain: 1.2,
  reach: 13,
});

/** The movement rules for the block being fought right now. */
function movementRules() {
  return activePhase === 'garage'
    ? { ...POLICE_MOVEMENT, ...GARAGE_MOVEMENT }
    : POLICE_MOVEMENT;
}

const _policeStep = new THREE.Vector3();
const _policeGoal = new THREE.Vector3();

/** Every officer on his feet in the phase the player is standing in. */
function livePoliceEntries() {
  return policeFigures.filter((entry) => entry.root.visible
    && !entry.actor.incapacitated
    && entry.root.userData.phaseId === activePhase);
}

function policeMovementState(entry, index) {
  if (entry.movement) return entry.movement;
  const spread = ((index * 37) % 100) / 100;
  entry.movement = {
    mode: 'hold',
    /* Staggered, so a wave does not bound as one body. */
    clock: POLICE_MOVEMENT.hold[0] * 0.4 + spread * 2.4,
    goal: null,
    slot: null,
    standoff: movementRules().standoff[0]
      + spread * (movementRules().standoff[1] - movementRules().standoff[0]),
    speed: 0,
  };
  return entry.movement;
}

function randomHold() {
  const [low, high] = POLICE_MOVEMENT.hold;
  return low + Math.random() * (high - low);
}

/**
 * The next place forward worth being.
 *
 * A slot has to be unclaimed, meaningfully nearer the player than where he is
 * standing, not nearer than his standoff, and inside one bound of him. Ties go
 * to the slot that lands him closest to his own standoff, with a small
 * preference for not running the length of the street to reach it.
 */
function chooseFirePosition(entry, taken) {
  const slots = level.phases[activePhase]?.firePositions ?? [];
  if (!slots.length) return null;
  const here = entry.root.position;
  const own = Math.hypot(here.x - player.position.x, here.z - player.position.z);
  const standoff = entry.movement.standoff;
  const rules = movementRules();
  let best = null;
  let bestScore = Infinity;
  for (const slot of slots) {
    if (taken.has(slot.id)) continue;
    const toPlayer = Math.hypot(slot.x - player.position.x, slot.z - player.position.z);
    if (toPlayer < standoff - 1.5) continue;
    if (own - toPlayer < rules.gain) continue;
    const travel = Math.hypot(slot.x - here.x, slot.z - here.z);
    if (travel > rules.reach || travel < 0.6) continue;
    const score = Math.abs(toPlayer - standoff) + travel * 0.25;
    if (score < bestScore) { bestScore = score; best = slot; }
  }
  return best;
}

/**
 * One frame of the whole block's movement.
 *
 * Runs BEFORE `updatePoliceCombat`, so the shared aim pipeline steers off the
 * position a man has actually reached this frame rather than the one he left.
 */
function updatePoliceMovement(dt) {
  if (!['street', 'garage'].includes(activePhase) || machine.state === 'FAILED') return;
  const live = livePoliceEntries();
  if (!live.length) return;
  const colliders = level.world.colliders;
  const taken = new Set();
  for (const entry of live) if (entry.movement?.slot) taken.add(entry.movement.slot);

  for (const [index, entry] of live.entries()) {
    const state = policeMovementState(entry, index);
    const position = entry.root.position;
    state.clock -= dt;
    if (state.mode === 'hold') {
      state.speed = 0;
      if (state.clock > 0) continue;
      const slot = chooseFirePosition(entry, taken);
      if (!slot) { state.clock = randomHold(); continue; }
      taken.add(slot.id);
      state.slot = slot.id;
      state.goal = { x: slot.x, z: slot.z };
      state.mode = 'bound';
      state.clock = POLICE_MOVEMENT.boundSeconds;
      continue;
    }

    // --- bounding ---
    _policeGoal.set(state.goal.x, position.y, state.goal.z);
    _policeStep.copy(_policeGoal).sub(position);
    _policeStep.y = 0;
    const remaining = _policeStep.length();
    if (remaining <= POLICE_MOVEMENT.arrive || state.clock <= 0) {
      state.mode = 'hold';
      state.clock = randomHold();
      state.speed = 0;
      continue;
    }
    _policeStep.multiplyScalar(
      Math.min(1, (POLICE_MOVEMENT.boundSpeed * dt) / remaining),
    );
    const before = position.x;
    const beforeZ = position.z;
    HEIST_BODY_SPACE.move(position, _policeStep, { boxes: colliders, bounds: null });
    HEIST_BODY_SPACE.separate(entry, live, {
      boxes: colliders,
      bounds: null,
      positionOf: (peer) => peer.root?.position ?? null,
      idOf: (peer) => peer.actor?.id ?? '',
      eligible: (peer) => peer.root?.visible === true && !peer.actor?.incapacitated,
    });
    const moved = Math.hypot(position.x - before, position.z - beforeZ);
    state.speed = dt > 0 ? moved / dt : 0;
    /* Wedged against a car with two seconds of bound left is not a bound. Take
     * the ground he got to and start shooting from it. */
    if (moved < POLICE_MOVEMENT.boundSpeed * dt * 0.15) {
      state.mode = 'hold';
      state.clock = randomHold();
      state.speed = 0;
    }
  }

  /* The legs. The upper body stays on the weapon (`figure.aiming()` and the
   * shared `CombatWeaponAim`); this is only ever what is underneath it. */
  for (const entry of live) entry.figure.gait?.(dt, entry.movement?.speed ?? 0);
}

/**
 * The street's authored difficulty. WHO fights (waves) and HOW HARD each
 * round presses stay Locality; all the truth underneath — sight, alignment,
 * ammunition, blockers, hits, near misses — is the shared pipeline in
 * `combat.updateHostile`. Damage stays the old street's average round; the
 * per-officer cadence is tuned so five or six live officers put roughly the
 * same fire on the player the old single global fire clock did — except that
 * every one of those rounds now leaves a real muzzle, obeys real cover, and
 * lands somewhere true.
 */
const POLICE_COMBAT = Object.freeze({
  damage: 11,
  range: 48,
  cadence: Object.freeze([2.6, 4.6]),
  accuracyMoving: 0.18,
  accuracyStill: 0.34,
});
const policeAimPoint = new THREE.Vector3();

/**
 * Walk every police rig's pose blend, dead ones included.
 *
 * Owner, playtest 2026-08-26: *"when they die, they don't fall down. So they
 * just kind of keep standing up."*
 *
 * The death pose was never missing. `setState('down')` captures the standing
 * pose, applies `fallen()`, captures the endpoint, and then REWINDS the rig
 * and hands the walk-across to `_updatePoseBlend` -- which only ever runs
 * from `HeistFigure.update()`. Nothing in this scene called that on a police
 * figure: the only per-frame figure ticks were `updateLobbyFigures`, which
 * returns immediately unless the phase is `bank`, and `updateCrew`. So a
 * killed officer ended the frame flagged `fallen` in the data with his rig
 * still in the exact `aiming()` pose it was rewound to. Dead in the model,
 * standing on the screen.
 *
 * It survived tooling because both debug hooks bypass the blend --
 * `debugNeutralizePolice` calls `figure.fallen()` directly and
 * `debugProbePoliceRecycle` passes `{ blend: false }` -- so both snap
 * straight to the pose and both looked correct.
 *
 * The siege has had this right for a while: its update loop keeps ticking a
 * figure inside the `incapacitated` branch before it continues. Same shape
 * here, and the fear term goes to zero for the fallen, because a dead man
 * does not breathe.
 */
function updatePoliceFigures(dt) {
  for (const entry of policeFigures) {
    if (!entry?.figure || entry.root?.userData.phaseId !== activePhase) continue;
    entry.figure.update(dt, { fear: entry.actor?.incapacitated ? 0 : 0.35 });
  }
}

const _suppressFrom = new THREE.Vector3();
const _suppressTo = new THREE.Vector3();
const _suppressLeg = new THREE.Vector3();

/**
 * A round that goes past a man is a round he reacts to.
 *
 * Police accuracy is scaled by each officer's own SuppressionModel, and this
 * is the only thing that raises it: the perpendicular distance from every live
 * officer to the player's shot, measured along the segment the round actually
 * travelled rather than the infinite ray, so a bullet that stops in a wall
 * does not suppress the man standing behind it.
 *
 * SuppressionModel.noteNearMiss treats anything past four metres as nothing,
 * so the radius is its own, not a number invented here.
 */
function notePoliceSuppression(origin, direction, hitPoint) {
  if (!['street', 'garage'].includes(activePhase)) return;
  _suppressFrom.copy(origin);
  if (hitPoint) _suppressTo.copy(hitPoint);
  else _suppressTo.copy(origin).addScaledVector(direction, POLICE_COMBAT.range);
  _suppressLeg.copy(_suppressTo).sub(_suppressFrom);
  const legLength = _suppressLeg.length();
  if (legLength < 0.001) return;

  for (const entry of policeFigures) {
    if (!entry.root?.visible || entry.actor?.incapacitated) continue;
    if (entry.root.userData.phaseId !== activePhase) continue;
    /* Chest height, so a round over his head reads differently to one past
     * his ribs. */
    const chest = entry.root.position;
    const toManX = chest.x - _suppressFrom.x;
    const toManY = 1.2 + chest.y - _suppressFrom.y;
    const toManZ = chest.z - _suppressFrom.z;
    const along = (toManX * _suppressLeg.x + toManY * _suppressLeg.y
      + toManZ * _suppressLeg.z) / legLength;
    /* Behind the muzzle, or past where the round stopped: not his problem. */
    if (along < 0 || along > legLength) continue;
    const t = along / legLength;
    const missX = toManX - _suppressLeg.x * t;
    const missY = toManY - _suppressLeg.y * t;
    const missZ = toManZ - _suppressLeg.z * t;
    const miss = Math.hypot(missX, missY, missZ);
    if (miss > 4) continue;
    if (!entry.suppression) entry.suppression = new SuppressionModel();
    entry.suppression.noteNearMiss(miss, 1);
  }
}

function updatePoliceCombat(dt) {
  if (!['street', 'garage'].includes(activePhase) || machine.state === 'FAILED') return;
  policeAimPoint.set(player.position.x, 1.2, player.position.z);
  const moving = player.velocity.lengthSq() > 2.5;
  /* THE SUPPRESSION TERM WAS POINTING THE WRONG WAY.
   *
   * Owner, playtest 2026-08-26: *"they also don't really appear to be shooting
   * back."*
   *
   * `suppression` is the PLAYER's meter. It is fed by `noteNearMiss` when a
   * police round passes close to him, it drives `hud.setSuppression`, and it
   * shakes his camera. Multiplying police accuracy by `1 - suppression * 0.2`
   * therefore meant: the more they shot at you, the worse they got at it. A
   * player standing in the open under fire was the safest player on the
   * street, and the effect compounded -- every near miss bought him up to 45%
   * off the next one.
   *
   * Their own pressure is what belongs here, so each officer now carries a
   * SuppressionModel of his own, raised by the player's near misses on HIM.
   * Same authored curve, applied to the man it is actually about. */
  const baseAccuracy = moving ? POLICE_COMBAT.accuracyMoving : POLICE_COMBAT.accuracyStill;
  for (const entry of policeFigures) {
    if (!entry.root.visible || entry.actor.incapacitated
      || entry.root.userData.phaseId !== activePhase) continue;
    /* A man crossing open ground is not the one to be afraid of; the two
     * holding on either side of him are. See `updatePoliceMovement`. */
    const bounding = entry.movement?.mode === 'bound';
    /* His own suppression, not the player's. Decays on the same clock. */
    if (!entry.suppression) entry.suppression = new SuppressionModel();
    entry.suppression.update(dt);
    const accuracy = baseAccuracy
      * (1 - Math.min(0.45, entry.suppression.value * 0.2));
    const update = combat.updateHostile(entry, dt, {
      targetPoint: policeAimPoint,
      targetActor: playerActor,
      accuracy: bounding ? accuracy * 0.35 : accuracy,
      damage: POLICE_COMBAT.damage,
      range: POLICE_COMBAT.range,
      cadence: POLICE_COMBAT.cadence,
    });
    const shot = update.shot;
    if (!shot?.fired) continue;
    audio.play('heist.police.gunshot', {
      position: shot.origin, volume: 0.72, ref: 1.6, maxDist: 55,
    });
    /* The round lands where the shared truth says it landed — on the blocker
     * that owns it or at the declared miss point — not at a random offset
     * conjured around the player. */
    emitImpact(shot.end);
    if (shot.whiz) audio.play('heist.bullet.whiz', { volume: 0.42 });
    if (shot.nearMiss) {
      suppression.noteNearMiss(0.16, Math.max(0.2, shot.distance / POLICE_COMBAT.range));
    }
    if (!shot.applied) continue;
    hud.setHealth((playerActor.health / playerActor.maxHealth) * 100);
    audio.play('heist.player.hit', { volume: 0.75 });
    if (shot.fatal) failMission('prospect_incapacitated');
  }
}

function updateBankSequence(dt) {
  if (activePhase !== 'bank' || machine.state === 'FAILED') return;
  /* Four tonnes of steel swinging on a hinge, on the simulated clock like
   * everything else. `tickDoor` is a no-op once the door has arrived. */
  level.phases.bank.interactables.vault.userData.tickDoor?.(dt);
  if (guardThreat.state === 'drawing') {
    const outcome = guardThreat.update(dt);
    const snapshot = guardThreat.snapshot();
    level.phases.bank.interactables.guard.userData.setThreatProgress?.(snapshot.progress);
    hud.setThreat(true, snapshot.remaining, guardThreat.windowSeconds);
    if (outcome.event === 'fired') {
      guardFailures++;
      hud.setThreat(false);
      audio.play('heist.weapon.carbine.indoor');
      hostages.startleAll(0.9);
      for (const person of hostages.hostages) syncHostageFigure(person);
      announceObjective('The guard fired on the lobby. Restoring the last safe checkpoint.');
      failMission('guard_shot_civilian');
      return;
    }
  }
  if (machine.state === 'MANAGER_ESCORT' && managerEscortProgress < 1) {
    const previous = managerEscortProgress;
    managerEscortProgress = Math.min(1, managerEscortProgress + dt / 2.6);
    const manager = level.phases.bank.interactables.manager;
    manager.userData.setEscortProgress?.(managerEscortProgress);
    const escort = crew.get(CHARACTER_IDS.NUMBSKULL);
    if (escort) {
      escort.group.position.set(manager.position.x + 0.9, 0, manager.position.z + 0.55);
      escort.heading = crewHeadingForPhase('bank', escort.group.position);
      escort.group.rotation.y = escort.heading;
    }
    if (previous < 1 && managerEscortProgress >= 1) {
      refreshObjective();
      refreshInteractions();
    }
  }
}

function dropCarriedBag() {
  if (!carryingBag || driving) return;
  const id = carryingBag;
  loot.drop(id, {
    anchor: `${activePhase}_drop`,
    position: { x: player.position.x, y: 0.3, z: player.position.z },
  });
  const mesh = carriedBagMesh ?? resolveCarriedBagMesh();
  if (mesh) { mesh.position.set(player.position.x, 0.3, player.position.z); mesh.visible = true; }
  carryingBag = null;
  carriedBagMesh = null;
  hud.setBag(0, 0);
}

/**
 * The bank bags are named for their loot ids ('cash-8'), but the street copy
 * of cash_8 is the 'dropped-bag' prop — and a checkpoint restore brings back
 * the carried id without the mesh, since a snapshot cannot hold an object
 * reference. Both cases land here.
 */
function resolveCarriedBagMesh() {
  const group = level.phases[activePhase]?.group;
  if (!group || !carryingBag) return null;
  return group.getObjectByName(carryingBag.replace('_', '-'))
    ?? group.getObjectByName('dropped-bag')
    ?? null;
}

function failMission(reason) {
  if (!machine.fail(reason)) return;
  const fade = document.getElementById('fade');
  const restoreId = recoveryCheckpoint ?? latestCheckpoint;
  fade.querySelector('span').textContent = restoreId
    ? 'RESTORING LAST SAFE POSITION' : 'RESTARTING THE BRIEFING';
  fade.style.opacity = '1';
  setTimeout(() => {
    if (!restoreId) {
      machine.restore('CREW_INTRO');
      activatePhase('safehouse');
      preparation.reset();
      syncSafehousePresentation();
      player.mode = 'walk';
      player.moveScale = 1;
      refreshObjective();
      fade.style.opacity = '0';
      refreshInteractions();
      return;
    }
    const snapshot = checkpoints.snapshot(restoreId);
    checkpoints.restore(restoreId);
    machine.restore(snapshot.meta.state);
    activatePhase(snapshot.meta.phase);
    interaction.setPaused(driving);
    hud.setDriving(driving, Math.abs(vehicle.speed) * 2.237);
    player.mode = driving ? 'frozen' : 'walk';
    fade.style.opacity = '0';
    if (restoreId === 'bank_entry_retry') {
      refreshObjective();
      hud.setThreat(true, guardThreat.snapshot().remaining, guardThreat.windowSeconds);
      audio.play('heist.guard.draw');
      say('snow_guard');
    }
    refreshInteractions();
  }, 800);
}

checkpoints.register('player', {
  capture: () => ({
    position: player.position.toArray(), yaw: player.yaw, pitch: player.pitch,
    actor: playerActor.snapshot(),
  }),
  reset: () => { input?.clear('checkpoint-reset'); player.velocity.set(0, 0, 0); },
  restore: (s) => {
    player.position.fromArray(s.position);
    player.yaw = s.yaw;
    player.pitch = s.pitch;
    playerActor.restore(s.actor);
    hud.setHealth((playerActor.health / playerActor.maxHealth) * 100);
  },
});
checkpoints.register('weapon', {
  capture: () => loadout.weapons.carbine.snapshot(),
  reset: () => loadout.reset(),
  restore: (snapshot) => {
    loadout.weapons.carbine.restore(snapshot);
    refreshAmmoReadout();
  },
});
checkpoints.register('loot', { capture: () => loot.capture(), reset: () => loot.reset(), restore: (s) => loot.restore(s) });
checkpoints.register('police', {
  capture: () => ({
    director: police.capture(),
    meshes: policeFigures.map((entry) => ({
      id: entry.actor.id,
      block: entry.root.userData.block,
      phaseId: entry.root.userData.phaseId,
      position: entry.root.position.toArray(),
      visible: entry.root.visible,
      actor: entry.actor.snapshot(),
      /* The shared pipeline is durable state too: an officer restored with
       * three rounds left has three rounds left, not a fresh magazine. */
      combat: combat.hostileSnapshot(entry.actor.id),
    })),
  }),
  reset: () => {
    for (const entry of policeFigures) {
      entry.figure.dispose();
      entry.unregister?.();
    }
    policeFigures = [];
    combat.resetHostiles();
    police.reset();
  },
  restore: (snapshot) => {
    police.restore(snapshot.director);
    for (const record of snapshot.meshes) {
      const root = addPoliceFigure({ ...record, actorSnapshot: record.actor });
      const entry = policeEntryFor(root);
      if (entry && record.combat) combat.restoreHostile(entry, record.combat);
    }
    window.__heistDebug.policeActive = activePoliceMeshes().length;
    window.__heistDebug.poolUsage.police = policeFigures.length;
  },
});
checkpoints.register('loadout', {
  capture: () => ({ loadout: loadout.snapshot(), zipTies }),
  reset: () => { loadout.reset(); zipTies = ZIP_TIE_STOCK; },
  restore: (snapshot) => {
    loadout.restore(snapshot.loadout ?? snapshot);
    zipTies = Number.isFinite(snapshot.zipTies) ? snapshot.zipTies : ZIP_TIE_STOCK;
    syncHeistInventory(true);
  },
});
checkpoints.register('hostages', {
  capture: () => hostages.capture(),
  reset: () => {
    hostages.reset();
    // A rebuild is not a takedown: snap, do not play twenty-two of them.
    for (const person of hostages.hostages) syncHostageFigure(person, { blend: false });
    controlWarned = false;
    lobbyHeldAnnounced = false;
  },
  restore: (snapshot) => {
    hostages.restore(snapshot);
    for (const person of hostages.hostages) syncHostageFigure(person, { blend: false });
  },
});
checkpoints.register('objective', {
  capture: () => ({ ledger: objective.capture(), policeHeat }),
  reset: () => { objective.reset(); policeHeat = 0; },
  restore: (snapshot) => {
    objective.restore(snapshot.ledger ?? snapshot);
    policeHeat = snapshot.policeHeat ?? 0;
  },
});
checkpoints.register('vehicle', { capture: () => vehicle.snapshot(), reset: () => fixedStep.reset(), restore: (s) => vehicle.restore(s) });
checkpoints.register('dialogue', { capture: () => dialogue.capture(), reset: () => dialogue.reset(), restore: (s) => dialogue.restore(s) });
checkpoints.register('effects', { capture: () => activeEffects, reset: () => { activeEffects.length = 0; }, restore: (s) => activeEffects.push(...s) });
checkpoints.register('mission-local', {
  capture: () => ({
    preparation: preparation.capture(), bankBagsStaged, carryingBag, droppedBagDecision,
    noWitnesses,
    lobbyControlled, rearGuardSecured, managerEscortProgress,
    guardThreat: guardThreat.capture(), lobbyGuardActor: lobbyGuardActor.snapshot(),
    lobbyCombatActors: {
      rearGuard: rearGuardActor.snapshot(),
      manager: managerActor.snapshot(),
      hostages: Object.fromEntries(
        [...hostageActors].map(([id, actor]) => [id, actor.snapshot()]),
      ),
    },
    officersDown, driving, roadblockHit, routeIndex, offroadHitCooldown,
    driveCollisionCooldown, swapProgress: { ...swapProgress },
    driveInvalidFor, driveStuckFor, drivingRecovery,
    suppression: suppression.value,
  }),
  reset: () => {
    preparation.reset();
    lobbyControlled = false;
    rearGuardSecured = false;
    managerEscortProgress = 0;
    noWitnesses = false;
    sweepBarkAt = 0;
    bankBagsStaged = 0;
    stageBankBags(0);
    carryingBag = null;
    carriedBagMesh = null;
    droppedBagDecision = null;
    officersDown = 0;
    driving = false;
    roadblockHit = false;
    routeIndex = 0;
    offroadHitCooldown = 0;
    driveCollisionCooldown = 0;
    driveInvalidFor = 0;
    driveStuckFor = 0;
    drivingRecovery = false;
    Object.keys(swapProgress).forEach((key) => { swapProgress[key] = false; });
    suppression.value = 0;
    resetLobbyCombatActor(rearGuardActor);
    resetLobbyCombatActor(managerActor);
    for (const actor of hostageActors.values()) resetLobbyCombatActor(actor);
    resetLobbyGuardThreat();
    level.phases.bank.interactables.rearGuard.userData.resetThreatPose?.();
    level.phases.bank.figures.manager.setState('stand', { blend: false });
    level.phases.bank.interactables.manager.userData.setEscortProgress?.(0);
    syncSafehousePresentation();
  },
  restore: (snapshot) => {
    preparation.restore(snapshot.preparation ?? snapshot);
    lobbyControlled = snapshot.lobbyControlled === true;
    rearGuardSecured = snapshot.rearGuardSecured === true;
    managerEscortProgress = snapshot.managerEscortProgress ?? 0;
    noWitnesses = snapshot.noWitnesses === true;
    bankBagsStaged = snapshot.bankBagsStaged ?? 0;
    /* The heap on the circle is a function of the count, so a restore that
     * puts the count back puts the duffles back with it. */
    stageBankBags(bankBagsStaged);
    carryingBag = snapshot.carryingBag ?? null;
    carriedBagMesh = null;
    droppedBagDecision = snapshot.droppedBagDecision ?? null;
    officersDown = snapshot.officersDown ?? 0;
    driving = snapshot.driving === true;
    roadblockHit = snapshot.roadblockHit === true;
    routeIndex = snapshot.routeIndex ?? 0;
    offroadHitCooldown = snapshot.offroadHitCooldown ?? 0;
    driveCollisionCooldown = snapshot.driveCollisionCooldown ?? 0;
    driveInvalidFor = snapshot.driveInvalidFor ?? 0;
    driveStuckFor = snapshot.driveStuckFor ?? 0;
    drivingRecovery = snapshot.drivingRecovery === true;
    Object.assign(swapProgress, snapshot.swapProgress ?? {});
    suppression.value = snapshot.suppression ?? 0;
    guardThreat.restore(snapshot.guardThreat);
    if (snapshot.lobbyGuardActor) lobbyGuardActor.restore(snapshot.lobbyGuardActor);
    const actorSnapshots = snapshot.lobbyCombatActors ?? {};
    if (actorSnapshots.rearGuard) rearGuardActor.restore(actorSnapshots.rearGuard);
    if (actorSnapshots.manager) managerActor.restore(actorSnapshots.manager);
    for (const [id, actor] of hostageActors) {
      if (actorSnapshots.hostages?.[id]) actor.restore(actorSnapshots.hostages[id]);
    }
    level.phases.bank.interactables.guard.userData.resetThreatPose?.();
    if (guardThreat.state === 'neutralized') {
      level.phases.bank.interactables.guard.userData.setNeutralized?.({ blend: false });
    }
    else if (guardThreat.state === 'drawing') {
      level.phases.bank.interactables.guard.userData.setThreatProgress?.(guardThreat.snapshot().progress);
    }
    level.phases.bank.interactables.rearGuard.userData.resetThreatPose?.();
    if (rearGuardSecured) {
      level.phases.bank.interactables.rearGuard.userData.setNeutralized?.({ blend: false });
    }
    level.phases.bank.figures.manager.setState('stand', { blend: false });
    level.phases.bank.interactables.manager.userData.setEscortProgress?.(managerEscortProgress);
    syncSafehousePresentation();
  },
});
checkpoints.register('crew', {
  capture: () => ({
    graph: squadGraph.capture(),
    actors: [...crew.values()].map((actor) => ({
      id: actor.id,
      anchor: actor.anchor,
      injury: actor.injury,
      carrying: actor.carrying,
      masked: actor.masked,
      position: actor.group.position.toArray(),
      rotationY: actor.group.rotation.y,
    })),
  }),
  reset: () => squadGraph.reset(),
  restore: (snapshot) => {
    squadGraph.restore(snapshot.graph);
    for (const record of snapshot.actors ?? []) {
      const actor = crew.get(record.id);
      if (!actor) continue;
      actor.anchor = record.anchor;
      actor.injury = record.injury;
      actor.carrying = record.carrying;
      actor.group.position.fromArray(record.position);
      actor.group.rotation.y = record.rotationY;
      actor.masked = record.masked === true;
      const mask = actor.group.getObjectByName('heist-mask');
      if (mask) mask.visible = actor.masked;
    }
  },
});

function seedLootForCheckpoint(checkpoint, mission) {
  const atOrAfterStreet = ['street_withdrawal', 'mercer_garage', 'vehicle_swap'].includes(checkpoint);
  if (!atOrAfterStreet) return;
  bankBagsStaged = 8;
  stageBankBags(8);
  const atGarage = ['mercer_garage', 'vehicle_swap'].includes(checkpoint);
  const recoveredIds = Array.from({ length: mission.droppedBagRecovered ? 8 : 7 }, (_, index) => `cash_${index + 1}`);
  for (const id of recoveredIds) {
    loot.carry(id, CHARACTER_IDS.DEATHMEGATRON);
    if (checkpoint === 'vehicle_swap') loot.load(id, 'clean_swap_car');
    else if (atGarage) continue;
    else loot.drop(id, { anchor: 'bank_exit', position: { x: 0, y: 0.3, z: 8.5 } });
  }
  if (checkpoint === 'street_withdrawal') {
    loot.carry('cash_8', CHARACTER_IDS.NUMBSKULL);
    loot.drop('cash_8', { anchor: 'bank_exit', position: { x: 1.2, y: 0.3, z: 8.5 } });
  } else if (!mission.droppedBagRecovered) {
    loot.abandon('cash_8');
    droppedBagDecision = 'abandoned';
  } else {
    droppedBagDecision = 'recovered';
  }
}

function resumePersistedCheckpoint(checkpoint) {
  const mission = campaign.state.missions[MISSION_IDS.BANK_HEIST];
  preparation.restore({ armorReady: true, loadoutReady: true });
  syncSafehousePresentation();
  seedLootForCheckpoint(checkpoint, mission);
  /* No `objective` column here any more. It was a second, hand-maintained copy
   * of the standing order that had already drifted from the one the walked
   * path sets — `./orders.js` is the only place that sentence is written now,
   * and `refreshObjective()` at the bottom of this function reads it off the
   * state the resume just restored. */
  const setup = {
    safehouse_ready: { state: 'VAN_APPROACH', phase: 'van' },
    bank_secured: { state: 'MANAGER_ESCORT', phase: 'bank', masked: true },
    vault_open: { state: 'CASH_LOADING', phase: 'bank', masked: true },
    street_withdrawal: {
      state: 'STREET_BLOCK_ONE', phase: 'street',
      masked: true, policeBlock: 'bank_avenue', policeCount: 5,
    },
    mercer_garage: {
      state: 'GARAGE_HOLD', phase: 'garage',
      masked: true, policeBlock: 'mercer_garage', policeCount: 4, injury: 'moderate',
    },
    vehicle_swap: {
      state: 'SAFEHOUSE_RETURN', phase: 'safehouse',
      injury: 'moderate', swapDone: true,
    },
  }[checkpoint];
  if (!setup) return false;
  machine.restore(setup.state);
  activatePhase(setup.phase);
  setCrewMasked(crew, setup.masked === true);
  loadout.wearMask(setup.masked === true);
  /* Resuming past the vault means the vault is open; a shut door with the cash
   * already staged behind it is the sort of thing a resume used to leave. */
  if (['vault_open', 'street_withdrawal', 'mercer_garage', 'vehicle_swap'].includes(checkpoint)) {
    level.phases.bank.interactables.vault.userData.setOpen?.(true);
  }
  if (['bank_secured', 'vault_open'].includes(checkpoint)) {
    for (const person of hostages.hostages) {
      person.order();
      person.order();
      syncHostageFigure(person, { blend: false });
    }
    lobbyControlled = true;
    rearGuardSecured = true;
    level.phases.bank.interactables.rearGuard.userData.setNeutralized?.({ blend: false });
    level.phases.bank.interactables.guard.userData.setNeutralized?.({ blend: false });
    guardThreat.restore({ state: 'neutralized', elapsed: 0 });
  }
  if (setup.injury) crew.get(CHARACTER_IDS.RIPPINFLOW).injury = setup.injury;
  if (setup.swapDone) Object.keys(swapProgress).forEach((key) => { swapProgress[key] = true; });
  if (setup.policeBlock) spawnPolice(setup.policeBlock, setup.policeCount);
  player.mode = 'walk';
  player.moveScale = setup.phase === 'van' ? 0 : 1;
  /* Last, not first: the order for a state like STREET_BLOCK_ONE counts the
   * officers still up, and the wave above is what put them there. */
  refreshObjective(setup.state);
  latestCheckpoint = checkpoint;
  checkpoints.capture(checkpoint, { state: setup.state, phase: setup.phase });
  window.__heistDebug.checkpoint = checkpoint;
  objective.syncLoot(vaultSummary());
  objective.syncHostages(hostages.summary());
  return true;
}

function primePreview(checkpoint) {
  const order = ['safehouse_ready', 'bank_secured', 'vault_open', 'street_withdrawal', 'mercer_garage', 'vehicle_swap'];
  const count = {
    safehouse: 0, bank_lobby: 1, vault_open: 3, street_withdrawal: 4,
    mercer_garage: 5, vehicle_escape: 5, safehouse_debrief: 6,
  }[checkpoint] ?? 0;
  for (let i = 0; i < count; i++) {
    const id = order[i];
    const facts = {
      bank_secured: { guardsDisarmed: 2 },
      vault_open: { bagsStaged: 8 },
      street_withdrawal: { primaryVanLost: true, policeHeat: 55 },
      mercer_garage: { bagsRecovered: 7, crewInjuries: { rippinflow: 'moderate' } },
      vehicle_swap: { playerDroveEscape: true, vehicleDamage: 35 },
    }[id] ?? {};
    story.checkpoint(id, facts);
    latestCheckpoint = id;
  }
  if (count >= 3) {
    for (const record of loot.capture()) {
      loot.carry(record.id, CHARACTER_IDS.DEATHMEGATRON);
      if (count >= 5) loot.load(record.id, 'escape_sedan');
      else loot.drop(record.id, { anchor: 'bank_exit', position: { x: 0, y: 0.3, z: 8 } });
    }
    bankBagsStaged = 8;
    stageBankBags(8);
  }
  if (count >= 5) crew.get(CHARACTER_IDS.RIPPINFLOW).injury = 'moderate';
  if (count >= 1) {
    preparation.restore({ armorReady: true, loadoutReady: true });
    syncSafehousePresentation();
    loadout.wearMask(true);
    syncHeistInventory(true);
  }
  applyHeistCheckpointSetpieceGeometry(checkpoint, { level, crew });
  const startState = PREVIEW_START_STATE[checkpoint] ?? 'SAFEHOUSE_ARRIVAL';
  machine.restore(startState);
  if (checkpoint === 'vehicle_escape') beginDriving();
  else if (checkpoint === 'safehouse_debrief') {
    machine.restore('SAFEHOUSE_RETURN');
    activatePhase('safehouse');
    refreshObjective();
  } else activatePhase(phaseIdForState(startState));
  if (latestCheckpoint) checkpoints.capture(latestCheckpoint, { state: startState, phase: phaseIdForState(startState) });
  // The scorecard has to be true before the first frame, not after it: a
  // preview that opens on the debrief is read the instant it opens.
  objective.syncLoot(vaultSummary());
  objective.syncHostages(hostages.summary());
  /* THE OWNER'S BUG, IN ONE LINE.
   *
   * This function never set an objective at all, so every preview link past
   * the safehouse — which is how the owner plays this mission — ran the whole
   * bank, vault, street and garage under `heist.html`'s static "Meet the
   * crew." `machine.restore` above already refreshes it; this catches the
   * context the lines below the restore establish (police up, bags staged). */
  refreshObjective();
}

async function begin() {
  if (started) return;
  started = true;
  document.getElementById('start-card').classList.add('hidden');
  hud.show();
  sceneInventory.show();
  syncHeistInventory();
  await audio.init();
  /* Both banks: the scene's own 112 lines and 46 effects on the `heist.`
   * prefix, plus every cue the shared weapon system plays or stands in with.
   * Without the second list the stand-ins are names with no buffer behind
   * them and the guns go quiet. */
  await audio.loadManifest({
    names: [...HEIST_VOICE_CUES, ...weaponCueNames()], prefixes: ['heist.'],
  });
  const opening = story.begin();
  if (!opening.ok) {
    if (opening.reason === 'already_complete') {
      await returnToApartment();
      return;
    }
    started = false;
    document.getElementById('start-card').classList.remove('hidden');
    document.querySelector('#start-card .lede').textContent = `THE TAKE is unavailable: ${opening.reason.replaceAll('_', ' ')}.`;
    return;
  }
  if (!isPreviewMode()) input.requestPointerLock();
  const checkpoint = isPreviewMode() ? previewCheckpointForLocation() : null;
  if (checkpoint && checkpoint !== 'safehouse') {
    primePreview(checkpoint);
  } else if (opening.resumed && opening.checkpoint) {
    resumePersistedCheckpoint(opening.checkpoint);
  } else {
    activatePhase('safehouse');
    /* A real fresh start, not a resume or a preview link: the crew's actual
     * morning, before any of it goes wrong. Owner: a needle-drop for the
     * safehouse prep, same "record on in the corner" mechanism as Lou's
     * office. Once only, on the way in -- `returnSafehouse()` and the
     * preview/resume paths above deliberately do not call this again. */
    audio.startMusicLoop('heist.morning.radio', 'assets/music/codename-sasquatch.mp3', {
      volume: 0.14, ambience: true, fade: 1.6,
    });
    refreshObjective();
    setTimeout(() => {
      advanceTo('CREW_INTRO');
      say('snow_arrival');
      refreshInteractions();
    }, 700);
  }
  refreshInteractions();
}

document.getElementById('start').addEventListener('click', begin);
function setSimulationPaused(value, { force = false } = {}) {
  if (isPreviewMode() && !force) return;
  simulationPaused = value === true;
  if (simulationPaused) {
    input?.clear('simulation-pause');
    vehicle.setInput();
  }
  interaction.setPaused(simulationPaused || driving);
  input?.refresh('simulation-pause');
}

let input = null;
const pauseMenu = createPauseMenu({
  title: 'The Take',
  assist: true,
  canPause: () => started && !missionCompleted,
  getObjective: () => hud.objective?.textContent?.trim()
    || 'Follow Snow’s current order and keep the crew moving.',
  instructions: [
    'W A S D — move. E — interact. Mouse — aim. Click — fire.',
    '1–5 or [ / ] — select gear. R — reload. Q — drop a carried bag.',
    'F — reassure a hostage. G — issue the hard order.',
    'During the escape, W/S — throttle, A/D — steer, Space — brake.',
    'Tab — pause or resume.',
  ],
  onPause: () => {
    setSimulationPaused(true, { force: true });
    input?.suspend();
    audio.ctx?.suspend?.();
  },
  onResume: () => {
    setSimulationPaused(false, { force: true });
    audio.ctx?.resume?.();
    clock.getDelta();
    input?.resume({ requestPointerLock: !driving && !isPreviewMode() });
  },
  recovery: createCampaignSceneRecovery({
    campaign,
    sceneId: SCENE_IDS.BANK_HEIST,
    location,
    restartCheckpoint: () => failMission('player_requested_restart'),
    canRestartCheckpoint: () => Boolean(recoveryCheckpoint ?? latestCheckpoint),
  }),
});

const heistControls = createHeistControlPolicy({
  state: () => ({
    started,
    paused: simulationPaused,
    driving,
    completed: missionCompleted,
  }),
  player,
  interaction,
  isPreview: isPreviewMode,
  selectSlot,
  cycleSlot,
  hostageVerb: hostageVerbUnderCrosshair,
  reload: () => {
    if (!loadout.activeWeapon?.beginReload()) return false;
    playWeaponCue(audio,
      loadout.selectedItem === 'sidearm' ? WEAPON_IDS.PISTOL9 : WEAPON_IDS.CARBINE,
      'reload.out');
    return true;
  },
  dropBag: dropCarriedBag,
  failPreview: () => failMission('preview_failure_test'),
  fireWeapon,
  setAimed: (aimed) => {
    for (const gun of Object.values(loadout.weapons)) gun.setAimed(aimed);
  },
  pause: () => pauseMenu.pause(),
  resumeSimulation: () => setSimulationPaused(false),
  pauseMenuOpen: () => pauseMenu.isPaused(),
});
input = createFirstPersonInput({
  player,
  canvas,
  interaction,
  ...heistControls,
});

document.addEventListener('visibilitychange', () => {
  if (started && document.hidden) pauseMenu.pause();
});
addEventListener('wheel', (event) => {
  if (!started || driving) return;
  cycleSlot(event.deltaY > 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('contextmenu', (event) => event.preventDefault());

/**
 * `F` and `G` on whoever the crosshair is on.
 *
 * The two conversational verbs need gun range, not the 2.7 m the interaction
 * system uses — you talk a room down from where you are covering it, and the
 * person you are pointing at is by definition the person you are talking to.
 */
function hostageVerbUnderCrosshair(verb) {
  if (!lobbyLive() || simulationPaused) return { ok: false, reason: 'lobby_closed' };
  aimRaycaster.setFromCamera(SCREEN_CENTER, camera);
  const hit = aimRaycaster.intersectObject(level.phases.bank.group, true)[0];
  const root = hit ? hostageFor(hit.object) : null;
  if (!root) return { ok: false, reason: 'nobody_there' };
  return applyHostageVerb(root, verb);
}

function recoverDrivingRoute(reason) {
  if (!driving || drivingRecovery) return false;
  drivingRecovery = true;
  const drivePhase = level.phases.driving;
  const stable = drivePhase.route.find((node) => node.id === vehicle.lastStableNode)
    ?? escapeStart;
  vehicle.x = stable.x;
  vehicle.z = stable.z;
  vehicle.speed = 0;
  vehicle.lateralSlip = 0;
  vehicle.engineHealth = Math.max(40, vehicle.engineHealth);
  vehicle.tireGrip = Math.max(0.65, vehicle.tireGrip);
  vehicle.setInput();
  driveInvalidFor = 0;
  driveStuckFor = 0;
  input?.clear('drive-recovery');
  drivePhase.car.position.set(vehicle.x, 0, vehicle.z);
  const fade = document.getElementById('fade');
  fade.querySelector('span').textContent = reason === 'route'
    ? 'RECOVERING THE ESCAPE ROUTE' : 'RESTARTING FROM THE LAST SAFE TURN';
  fade.style.opacity = '1';
  setTimeout(() => {
    fade.style.opacity = '0';
    drivingRecovery = false;
  }, 650);
  return true;
}

/**
 * The chase.
 *
 * Two owner notes: *"we need a ton of detail around the road and better chase
 * physics on the car"*, and *"if you make it to the end you lose the cops too"*.
 * The detail is `./city.js`. The feel is here, and it was thin for reasons that
 * had nothing to do with `GroundVehicle`: the vehicle model already computes
 * `bodyRoll` and `suspension` and nothing read them, the camera was pinned to a
 * fixed offset with a hard `set()` every frame, there was no handbrake, and the
 * single pursuit car was `lerp`ed to a point 5.8 m off the bumper — a tow rope
 * rather than a pursuit.
 *
 * Now: weight transfer on the body, a sprung chase camera that lags and looks
 * into the corner, speed FOV, a handbrake that actually breaks traction, and
 * three cruisers that chase on their own headings, close when you are slow and
 * lose ground when you commit to a turn.
 */
const chaseCamera = new THREE.Vector3();
const chaseLook = new THREE.Vector3();
let chaseInitialised = false;
/** Damped steering lead for the chase camera. Persists across frames. */
let slipLead = 0;

function updatePursuit(dt, forwardX, forwardZ) {
  const drivePhase = level.phases.driving;
  const speedRatio = Math.min(1, Math.abs(vehicle.speed) / HEIST_ESCAPE_VEHICLE_CONFIG.maxForwardSpeed);
  /* Pressure builds while the car is slow and bleeds off once it is moving.
   * Deliberately slow to build and quick to shed: a driver who lifts for a
   * corner is not being punished, a driver who has parked is. */
  if (copsLost) pursuitPressure = 0;
  else if (speedRatio < 0.22) pursuitPressure = Math.min(1, pursuitPressure + dt * 0.42);
  else pursuitPressure = Math.max(0, pursuitPressure - dt * 0.85);
  ramCooldown = Math.max(0, ramCooldown - dt);
  /* Said once as the gap starts closing, so being shunted a second later is
   * something the car warned you about rather than something that happened. */
  const nowSeconds = performance.now() / 1000;
  if (!copsLost && pursuitPressure > 0.5 && nowSeconds > pressureBarkAt) {
    pressureBarkAt = nowSeconds + 11;
    say('snow_pursuit_stopped');
  }
  // A second and third car join as the job gets louder, and they all quit at
  // the swap — which is the owner's "if you make it to the end you lose them".
  pursuitCount = copsLost ? 0 : Math.min(3, 1 + (routeIndex >= 2 ? 1 : 0) + (routeIndex >= 3 ? 1 : 0));
  for (const [index, cruiser] of drivePhase.pursuers.entries()) {
    const active = index < pursuitCount;
    cruiser.visible = active;
    if (!active) continue;
    /* Each car holds its own gap and its own side of the lane, and the gap
     * grows with your speed rather than being a constant: outrunning them is
     * something the throttle can actually do.
     *
     * THE OTHER HALF OF THAT, WHICH WAS MISSING. Owner: *"cops stop when the
     * player stops"*, and they did — the gap is `speedRatio` times a
     * distance, so a stationary car got a stationary escort parked seven and
     * a half metres back with its lights on, indefinitely. `pursuitPressure`
     * is what a police driver does about a stopped suspect vehicle: it builds
     * while you are slow and it eats the gap, so standing still brings them
     * onto the bumper and then through it. Outrunning them still works.
     * Waiting them out does not. */
    const gap = (7.5 + index * 6.5 + speedRatio * (9 + index * 4))
      * (1 - pursuitPressure * (index === 0 ? 0.94 : 0.6));
    const lateral = (index % 2 ? 1 : -1) * (2.4 + index * 0.5) * (1 - pursuitPressure * 0.7);
    pursuitTarget.set(
      vehicle.x - forwardX * gap + forwardZ * lateral,
      0,
      vehicle.z - forwardZ * gap - forwardX * lateral,
    );
    const lag = 1 - Math.exp(-dt * (2.6 - index * 0.4));
    const before = cruiser.position.clone();
    cruiser.position.lerp(pursuitTarget, lag);
    const moved = cruiser.position.clone().sub(before);
    if (moved.lengthSq() > 1e-6) {
      cruiser.rotation.y = Math.atan2(moved.x, moved.z) - Math.PI / 2;
    }
    const flash = Math.sin(performance.now() * 0.012 + index * 2.1) > 0;
    if (cruiser.userData.beacons) {
      cruiser.userData.beacons.red.intensity = flash ? 4.6 : 0.5;
      cruiser.userData.beacons.blue.intensity = flash ? 0.5 : 4.6;
    }
  }
  const lead = drivePhase.pursuers[0];
  const distance = lead.position.distanceTo(drivePhase.car.position);

  /* THE RAM.
   *
   * Once the pressure has closed the gap, the lead car is not tailing any
   * more — it is trying to stop the vehicle, which is what a pursuit does to
   * something that has given up running. It shoves the car, kicks the camera,
   * costs a little paint, and breaks the deadlock: being shunted makes you
   * move, moving sheds the pressure, and the chase restarts.
   *
   * IT IS NOT ALLOWED TO END THE DRIVE, and the first version was. It dealt
   * 0.22–0.38 severity, which is 7.5–13 points of damage a hit and about 8 off
   * `engineHealth`, on a 1.35-second cooldown, forever, at a car nobody is
   * driving. `updateDriving` calls `recoverDrivingRoute` the moment
   * `engineHealth` hits zero — fade to black, teleport to the last stable turn
   * — so a parked car got a recovery every twenty-odd seconds, on a loop.
   *
   * It also PUT A STATIONARY CAR IN MOTION at up to 7.6 m/s, which is what
   * made it expensive: a shoved car leaves the road, and off-road costs
   * another 0.16 every 0.8 s. `tools/verify-heist.mjs` proved it the hard way.
   * Its five barrier probes park the car at a junction pointing the wrong way
   * and simulate 3.2 s with no throttle — before the ram existed the car did
   * not move and took nothing; with it, each probe cost two rams and three
   * curb strikes, and the engine was through zero by the fifth. The recovery
   * that fired then was still armed when the authored drive started, and
   * `updateDriving` returns early during a recovery, so all six
   * `driveToNextNode` calls no-opped, the route never advanced, and the run
   * timed out waiting for the swap.
   *
   * So: a shunt, not a wrecking ball. `applyCollision` spends 22.1 engine
   * points per unit of severity, and the ram may only spend what keeps the
   * engine above 30 — the roadblock and the walls are what wreck this car,
   * because those are authored and this is ambient. */
  if (!copsLost && distance < 4.6 && pursuitPressure > 0.45 && ramCooldown <= 0) {
    ramCooldown = 1.35;
    const shove = 2.4 + pursuitPressure * 2.6;
    vehicle.speed += Math.sign(vehicle.speed || 1) * shove;
    const headroom = Math.max(0, vehicle.engineHealth - 30) / 22.1;
    const severity = Math.min(0.05 + pursuitPressure * 0.05, headroom);
    if (severity > 0.002) vehicle.applyCollision({ severity, windshield: false });
    audio.play('heist.vehicle.impact', { volume: 0.85, rate: 0.94 });
    suppression.noteNearMiss(0.4, 1);
    camera.rotation.z += (Math.random() - 0.5) * 0.09 * shakeScale();
    pursuitPressure = Math.max(0, pursuitPressure - 0.45);
    const now = performance.now() / 1000;
    if (now > ramBarkAt) { ramBarkAt = now + 7; say('rippin_pursuit_ram'); }
  }

  if (!copsLost && distance < 9 && !pursuitWarned) {
    pursuitWarned = true;
    say('rippin_pursuit_close');
  } else if (distance > 16) pursuitWarned = false;
  audio.setLoopVolume('heist.police.sirens',
    copsLost ? 0 : Math.max(0.05, 0.34 - distance * 0.012), 0.5);
}

function loseThePolice() {
  if (copsLost) return;
  copsLost = true;
  for (const cruiser of level.phases.driving.pursuers) cruiser.visible = false;
  audio.stopLoop('heist.police.sirens', 1.2);
  // Only while there is still a drive HUD to write to: this also fires as the
  // car arrives at the swap, and re-showing the speedometer over a scene the
  // player is now walking around in is exactly the sort of leftover the owner
  // was reading as "not sure what this is".
  if (driving) hud.setDriving(true, Math.abs(vehicle.speed) * 2.237, 'NOTHING BEHIND US');
  sayInTurn('snow_lost_them');
}

/* ------------------------------------------------------------------ */
/* The engine                                                          */
/* ------------------------------------------------------------------ */

/**
 * Four ratios, so the car has revs instead of a volume knob.
 *
 * Owner: *"engine sounds are bad"*. They were one recording at one pitch
 * whose GAIN rose with speed — an engine getting closer to you, not an engine
 * doing anything. The Beef Run had already answered this in the hardest
 * possible form, with two piston engines built as a live oscillator graph
 * *"whose pitch is an RPM readout"*; a road car does not need that much, it
 * needs the same idea applied to the sample it already has.
 *
 * So: a gearbox. Speed picks a gear, the gear maps speed to revs, revs pick
 * the playback rate. The rate falls off a cliff and climbs again at every
 * change, which is the shift — the single most recognisable thing an engine
 * does and the thing a gain curve can never produce.
 */
const DRIVE_GEARS = Object.freeze([
  { top: 6.5, ratio: 3.4 },
  { top: 12.5, ratio: 1.95 },
  { top: 19, ratio: 1.32 },
  { top: Infinity, ratio: 0.98 },
]);
let engineRevs = 0.2;
let engineGear = 0;

function updateDriveAudio(dt, speedRatio, throttle) {
  const speed = Math.abs(vehicle.speed);
  const gear = DRIVE_GEARS.findIndex((entry) => speed < entry.top);
  engineGear = gear < 0 ? DRIVE_GEARS.length - 1 : gear;
  const ratio = DRIVE_GEARS[engineGear].ratio;
  const floor = engineGear === 0 ? 0 : DRIVE_GEARS[engineGear - 1].top;
  const span = Math.max(1, DRIVE_GEARS[engineGear].top === Infinity
    ? 12 : DRIVE_GEARS[engineGear].top - floor);
  /* Revs inside the gear, plus a lift for a driver standing on it against the
   * car's own inertia — a stalled-out engine under full throttle is loud. */
  const inGear = Math.min(1.15, (speed - floor) / span);
  const target = 0.18 + inGear * 0.82 + (throttle > 0 ? 0.12 : 0) - (throttle < 0 ? 0.06 : 0);
  engineRevs += (target - engineRevs) * Math.min(1, dt * 7);

  audio.setLoopRate('heist.vehicle.engine.load',
    0.62 + engineRevs * 0.95 * (0.72 + ratio * 0.12), 0.08);
  audio.setLoopVolume('heist.vehicle.engine.load',
    0.13 + engineRevs * 0.3 + (throttle > 0 ? 0.05 : 0), 0.12);
  /* Off the throttle the exhaust note closes down. On it, it opens. This is
   * the difference between coasting and driving, and it costs one filter. */
  audio.setLoopCutoff('heist.vehicle.engine.load',
    throttle > 0 ? 6200 : 2400, 0.22);

  // Tyres: speed for the roar, slip angle for the scrub, handbrake for squeal.
  audio.setLoopVolume('heist.vehicle.tires.road',
    0.04 + speedRatio * 0.24 + Math.abs(vehicle.lateralSlip) * 0.16 + handbrake * 0.12, 0.14);
  audio.setLoopRate('heist.vehicle.tires.road',
    0.9 + speedRatio * 0.5 + Math.abs(vehicle.lateralSlip) * 0.35, 0.1);
}

function updateDriving(dt) {
  if (drivingRecovery) return;
  const throttle = (player.keys.has('KeyW') ? 1 : 0) - (player.keys.has('KeyS') ? 1 : 0);
  const steer = (player.keys.has('KeyA') ? 1 : 0) - (player.keys.has('KeyD') ? 1 : 0);
  const braking = player.keys.has('Space');
  /* The handbrake is the brake key held past a moment: it kills the rear grip
   * for as long as it is down and gives it back afterwards, which is what makes
   * a ninety-degree city junction takeable at speed instead of a full stop. */
  handbrake = braking ? Math.min(1, handbrake + dt * 3.4) : Math.max(0, handbrake - dt * 2.2);
  vehicle.tireGrip = Math.max(0.28, Math.min(1, vehicle.tireGrip));
  const restingGrip = vehicle.tireGrip;
  if (handbrake > 0.35) vehicle.tireGrip = restingGrip * (1 - handbrake * 0.55);
  vehicle.setInput({ throttle, steer, brake: braking ? 1 : 0 });
  const previousX = vehicle.x;
  const previousZ = vehicle.z;
  fixedStep.advance(dt, (step) => vehicle.step(step));
  vehicle.tireGrip = restingGrip;
  driveCollisionCooldown = Math.max(0, driveCollisionCooldown - dt);
  if (intersectsDrivingObstacle(vehicle.x, vehicle.z, level.phases.driving.obstacles)) {
    vehicle.x = previousX;
    vehicle.z = previousZ;
    vehicle.speed *= -0.18;
    if (driveCollisionCooldown <= 0) {
      driveCollisionCooldown = 0.55;
      vehicle.applyCollision({ severity: 0.34, windshield: Math.abs(vehicle.speed) > 6 });
      audio.play('heist.vehicle.impact');
      suppression.noteNearMiss(0.25, 1);
    }
  }
  window.__heistDebug.fixedSteps = fixedStep.lastSteps;
  const drivePhase = level.phases.driving;
  const car = drivePhase.car;
  car.position.set(vehicle.x, vehicle.suspension * 0.6, vehicle.z);
  // Procedural cars are modelled long on local X; physics heading is +Z. Body
  // roll is about that long axis, so it goes on X once the yaw is applied.
  /* THE WONKY.
   *
   * Owner, playtest 2026-08-26: *"the car is a little wonky. It could use a
   * little refinement."*
   *
   * Euler order. Three.js defaults to XYZ, which applies the roll about the
   * WORLD x axis and only then yaws -- so on the north and south legs, which
   * is most of this route, `bodyRoll` stopped being roll and became pitch,
   * dropping the nose about 28 cm into a hard turn and flipping sign with
   * heading. `YZX` is Ry*Rz*Rx: yaw about world +Y first, then pitch about the
   * car's own +Z, then roll about its own +X, which is what these three terms
   * were always meant to be.
   *
   * src/specialmeeting/forest/driver.js hit this and left a comment saying so
   * -- "getting an Euler order wrong here rolls the car when it should pitch
   * and the mistake looks like a suspension bug". It looked like one here too. */
  car.rotation.order = 'YZX';
  car.rotation.set(
    vehicle.bodyRoll * 0.9,
    vehicle.heading - Math.PI / 2,
    -vehicle.suspension * 1.6 - Math.min(0.06, Math.max(-0.06, vehicle.speed * 0.0009 * throttle)),
  );
  const forwardX = Math.sin(vehicle.heading);
  const forwardZ = Math.cos(vehicle.heading);
  updatePursuit(dt, forwardX, forwardZ);

  /* Sprung chase camera: it trails the car rather than being welded 13.5 m
   * behind it, drops back and lifts with speed, and leads the look point into
   * whatever the front wheels are doing. */
  const speedRatio = Math.min(1, Math.abs(vehicle.speed) / HEIST_ESCAPE_VEHICLE_CONFIG.maxForwardSpeed);
  const back = 11.5 + speedRatio * 4.5;
  /* THE WHIPLASH, half of it.
   *
   * `steerAngle` is a live control input with no smoothing of its own, and it
   * was multiplied straight into the look point at 5.5 -- so every flick of
   * the wheel threw the aim point sideways on the same frame. Damped here, and
   * the coefficient comes down, because the other half of the effect grows
   * with speed and the car is about to get a lot faster. */
  slipLead += (vehicle.steerAngle * 3.4 - slipLead) * Math.min(1, dt * 7);
  chaseCamera.set(
    vehicle.x - forwardX * back - forwardZ * (1.2 + slipLead),
    4.1 + speedRatio * 0.9,
    vehicle.z - forwardZ * back + forwardX * (1.2 + slipLead),
  );
  if (!chaseInitialised) { camera.position.copy(chaseCamera); chaseInitialised = true; }
  camera.position.lerp(chaseCamera, 1 - Math.exp(-dt * 6.5));
  chaseLook.set(
    vehicle.x + forwardX * (7 + speedRatio * 6) - forwardZ * slipLead * 1.6,
    1.05,
    vehicle.z + forwardZ * (7 + speedRatio * 6) + forwardX * slipLead * 1.6,
  );
  camera.lookAt(chaseLook);
  /* THE WHIPLASH, the other half. `bodyRoll` is a 5 rad/s state read raw, so
   * the horizon snapped over with the body. Keep enough of it that the car
   * still feels heavy in a turn, and stop mounting the player's head to the
   * differential. The FOV pump honours the Reduce Camera Shake setting now
   * too -- it was the one speed effect that ignored it. */
  camera.rotation.z += (vehicle.bodyRoll * 0.16 + suppression.value * 0.01) * shakeScale();
  const targetFov = 72 + speedRatio * 14 * shakeScale() + handbrake * 3;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3.2);
  camera.updateProjectionMatrix();

  hud.setDriving(true, Math.abs(vehicle.speed) * 2.237);
  updateDriveAudio(dt, speedRatio, throttle);

  if (machine.state === 'PLAYER_TAKES_WHEEL'
    && Math.hypot(vehicle.x - escapeStart.x, vehicle.z - escapeStart.z) > 24) {
    advanceTo('GARAGE_ESCAPE');
  }

  const target = drivePhase.route[routeIndex];
  if (target && Math.hypot(vehicle.x - target.x, vehicle.z - target.z) <= target.radius) {
    vehicle.markStableNode(target.id);
    routeIndex++;
    /* Each call announces the NEXT instruction, because a direction shouted at
     * the junction you are already in the middle of is not a direction. */
    if (target.id === 'garage_left') {
      advanceTo('CITY_PURSUIT');
      say('rippin_market_left');
    } else if (target.id === 'warehouse_left') {
      say('rippin_tower_right');
    } else if (target.id === 'tower_right') {
      advanceTo('ROADBLOCK');
      say('snow_roadblock');
    } else if (target.id === 'roadblock') {
      advanceTo('INDUSTRIAL_ROUTE');
      say('rippin_canal');
    } else if (target.id === 'canal_turn') {
      say('rippin_swap_ahead');
    } else if (target.id === 'industrial_swap') {
      /* Order matters: `snow_lost_them` is a VEHICLE_SWAP line, and
       * `DialogueArbiter` refuses a line whose state has not arrived yet. */
      reachSwap();
      loseThePolice();
      return;
    }
    const next = drivePhase.route[routeIndex];
    if (next) hud.setDriving(true, Math.abs(vehicle.speed) * 2.237, next.label);
  }

  const block = drivePhase.route.find((node) => node.id === 'roadblock');
  const nearRoadblock = Math.abs(vehicle.z - block.z) < 7 && Math.abs(vehicle.x - block.x) < 12;
  if (!roadblockHit && nearRoadblock && Math.abs(vehicle.x - block.x) > 2.7) {
    roadblockHit = true;
    vehicle.applyCollision({
      severity: 0.72, windshield: true, tire: Math.abs(vehicle.x - block.x) > 6,
    });
    suppression.noteNearMiss(0.4, 1);
    audio.play('heist.vehicle.impact');
  }

  offroadHitCooldown = Math.max(0, offroadHitCooldown - dt);
  const onRoad = drivePhase.roads.some((road) => (
    Math.abs(vehicle.x - road.x) <= road.w / 2 + 1.5
    && Math.abs(vehicle.z - road.z) <= road.d / 2 + 1.5
  ));
  driveInvalidFor = onRoad ? 0 : driveInvalidFor + dt;
  driveStuckFor = Math.abs(throttle) > 0.5 && Math.abs(vehicle.speed) < 0.12
    ? driveStuckFor + dt : 0;
  if (!onRoad && offroadHitCooldown <= 0) {
    offroadHitCooldown = 0.8;
    vehicle.applyCollision({ severity: 0.16, tire: true });
    audio.play('heist.vehicle.curbstone', { volume: 0.55 });
  }
  if (driveInvalidFor > 4.5 || driveStuckFor > 4 || vehicle.engineHealth <= 0) {
    recoverDrivingRoute(driveInvalidFor > 4.5 ? 'route' : 'vehicle');
  }
}

/**
 * The legal standing box for each phase, as [minX, maxX, minZ, maxZ].
 *
 * Lifted out of `constrainPlayerToPhase` because `debugApproachInteraction`
 * needs the same numbers. It used to sample a ring around a target with no
 * check that the sampled viewpoint was anywhere a player could actually be,
 * which is how it certified the bank exit as reachable from four centimetres
 * inside a marble slab.
 */
/* Moved to `./config.js` so the reachability tests can sample the ring a
 * player can really stand in without a second, drifting copy of the clamp.
 * `tests/heist-swap-evidence.test.mjs` and `tests/heist-final-car-and-leg.mjs`
 * both read it from there. */
const PHASE_PLAYER_BOUNDS = HEIST_PHASE_PLAYER_BOUNDS;

function constrainPlayerToPhase() {
  const bounds = PHASE_PLAYER_BOUNDS[activePhase];
  if (!bounds) return;
  player.position.x = Math.max(bounds[0], Math.min(bounds[1], player.position.x));
  player.position.z = Math.max(bounds[2], Math.min(bounds[3], player.position.z));
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const now = performance.now() / 1000;
  loadout.update(dt);
  suppression.update(dt);
  combat.update(dt);
  updateEffectPools(dt);
  hud.setSuppression(suppression.value);
  muzzle.intensity = Math.max(0, muzzle.intensity - dt * 70);
  if (dialogue.current && now >= dialogueEndAt) dialogue.finish();
  dialogue.update(now);
  updateMissionCommands();
  updateScriptedSpeech();
  syncHeistInventory();
  /* The standing order, recomputed from the mission state every frame.
   *
   * `HeistHud.setObjective` no-ops when the sentence has not changed, so this
   * is a table lookup and a string compare — and it makes a stale objective
   * structurally impossible rather than a thing every new interaction handler
   * has to remember to update. That was the defect: thirty handlers each
   * owning a copy, and the checkpoint entries owning none. */
  if (started) refreshObjective();
  /* The money half of the objective, kept honest continuously rather than only
   * at the debrief, so the HUD and any snapshot agree with the ledger. Twice a
   * second is plenty: `LootLedger.capture()` deep-clones every bag, and this
   * number changes when somebody picks a bag up, not between frames. */
  if (now >= lootSyncAt) {
    lootSyncAt = now + 0.5;
    objective.syncLoot(vaultSummary());
  }
  viewModel.update(dt, { speed: driving ? 0 : player.velocity.length() });
  if (started && !simulationPaused) {
    if (driving) updateDriving(dt);
    else {
      player.moveScale = activePhase === 'van' ? 0 : (carryingBag ? 0.72 : 1);
      player.update(dt);
      constrainPlayerToPhase();
      interaction.update(dt);
      updateBankSequence(dt);
      updateHostageAim(dt);
      updateLobbyFigures(dt);
      updatePoliceWaves(dt);
      /* Movement first: the shared aim pipeline has to steer off where a man
       * has got to this frame, not where he left. */
      updatePoliceMovement(dt);
      updatePoliceCombat(dt);
      updatePoliceFigures(dt);
      if (camera.fov !== 72) { camera.fov = 72; camera.updateProjectionMatrix(); }
    }
    updateCrew(crew, dt);
    if (carryingBag) {
      if (!carriedBagMesh) carriedBagMesh = resolveCarriedBagMesh();
      if (carriedBagMesh) carriedBagMesh.position.set(player.position.x + 0.45, player.position.y - 1.1, player.position.z + 0.2);
    }
  }
  /* Where the player's ears are. Without this the WebAudio listener sits at
   * the world origin facing -Z for the whole scene and every positioned cue is
   * panned as heard from there -- see the long note in
   * src/cartel-palace/main.js, where the owner caught it. */
  audio.updateListener(camera);
  renderer.render(scene, camera);
}

/**
 * A customer who bolted actually runs, and reaching the doors is getting out.
 *
 * Owner: *"The customer animations are funky."* The plainest case of it was
 * this one. `HeistFigure.update` drives a complete stride cycle for the
 * `bolting` pose — arms, thighs, shins, re-grounded every frame — and its own
 * comment says the root "remains owned by the scene/navigation layer". THIS
 * SCENE HAS NO NAVIGATION LAYER FOR CUSTOMERS. So a panicking customer broke
 * for the door and then sprinted on the spot, in place, arms pumping, for the
 * rest of the robbery, three metres from the player.
 *
 * He runs for the doors now, on the shared combat space so he goes round the
 * teller counter and the columns rather than through them, and a man who
 * reaches them is out of the building: hidden, uninteractive, unshootable
 * (`hiddenOrIgnored` and the resolver's own `root.visible === false` check
 * both drop him), and — the part that matters mechanically — out of the
 * witness count. A lobby with one escapee in it could otherwise never be
 * cleared, and under the no-witnesses sweep the crew would never get out of
 * the bank.
 */
const BOLT_SPEED = 3.6;
const BANK_DOOR_Z = 10.2;
const _boltStep = new THREE.Vector3();


function updateBoltingCustomers(dt) {
  if (activePhase !== 'bank') return;
  const colliders = level.world.colliders;
  const runners = level.phases.bank.civilians.filter((root) => {
    const person = hostages.get(root.userData.hostageId);
    return root.visible && person && person.state === 'bolting' && !person.escaped;
  });
  for (const root of runners) {
    const person = hostages.get(root.userData.hostageId);
    /* Aim at the half of the doorway he is nearest, so two runners do not
     * converge on the same square metre of glass. */
    const goal = bankBoltGoal(root.position);
    _boltStep.set(goal.x - root.position.x, 0, goal.z - root.position.z);
    const remaining = _boltStep.length();
    if (remaining > 0.05) {
      root.rotation.y = Math.atan2(_boltStep.x, _boltStep.z);
      _boltStep.multiplyScalar(Math.min(1, (BOLT_SPEED * dt) / remaining));
      HEIST_BODY_SPACE.move(root.position, _boltStep, { boxes: colliders, bounds: null });
      HEIST_BODY_SPACE.separate(root, runners, {
        boxes: colliders,
        bounds: null,
        positionOf: (peer) => peer.position,
        idOf: (peer) => peer.userData.hostageId ?? peer.name,
        eligible: (peer) => peer.visible === true,
      });
    }
    if (root.position.z < BANK_DOOR_Z - 0.7) continue;
    // Out. The room is one witness lighter and the street knows about it.
    if (!hostages.escaped_(person.id)) continue;
    root.visible = false;
    policeHeat = Math.min(100, policeHeat + 12);
    audio.play('heist.crowd.react', { volume: 0.5, rate: 1.1 });
    const now = performance.now() / 1000;
    if (now > runnerBarkAt) { runnerBarkAt = now + 12; say('death_runner'); }
    refreshObjective();
    refreshInteractions();
  }
}

/** Breathing, shaking, and the manager and the guards, once per frame. */
function updateLobbyFigures(dt) {
  if (activePhase !== 'bank') return;
  updateBoltingCustomers(dt);
  for (const figureRoot of level.phases.bank.civilians) {
    const person = hostages.get(figureRoot.userData.hostageId);
    const figure = figureRoot.userData.figure;
    if (!figure || !person) continue;
    figure.update(dt, { fear: person.down ? 0 : Math.min(1, person.panic + person.aimPressure * 0.4) });
  }
  const { guard, rearGuard, manager } = level.phases.bank.figures;
  guard.update(dt, { fear: 0 });
  rearGuard.update(dt, { fear: rearGuardSecured ? 0 : 0.2 });
  manager.update(dt, { fear: 0.35 });
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
installPreviewNotice();
animate();
