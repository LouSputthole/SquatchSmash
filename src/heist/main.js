import * as THREE from 'three';
import { AudioEngine } from '../core/audio.js';
import { CombatActor } from '../core/combat/actors.js';
import { resolveBallisticHits } from '../core/combat/ballistics.js';
import { FACTIONS, FactionMatrix } from '../core/combat/factions.js';
import { SuppressionModel } from '../core/combat/suppression.js';
import {
  CHARACTER_IDS, MISSION_IDS, SCENE_IDS, TIME_EVENT_IDS,
  createCampaign, navigateCampaign,
} from '../core/campaign.js';
import { createBankHeistStory } from '../core/bank-heist-story.js';
import { InteractionSystem } from '../core/interaction.js';
import { Player } from '../core/player.js';
import { SceneInventoryBar } from '../core/scene-inventory.js';
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
import {
  buildHeistCrew, crewHeadingForPhase, HEIST_CREW_IDS, setCrewMasked, updateCrew,
} from './cast.js';
import { BankGuardThreat } from './bank-threat.js';
import { CheckpointDirector } from './checkpoints.js';
import {
  HEIST_ESCAPE_VEHICLE_CONFIG, HEIST_STATES, PERFORMANCE_BUDGET,
  PHASE_FOR_STATE, PREVIEW_START_STATE,
} from './config.js';
import { DialogueArbiter } from './dialogue.js';
import { HeistHud } from './hud.js';
import { intersectsDrivingObstacle } from './geometry.js';
import { buildHeistLevel } from './level.js';
import { createLobbyHostages, HostageDirector } from './hostages.js';
import { HEIST_ITEM_CATALOG, HEIST_SLOT_ORDER, HeistLoadout } from './loadout.js';
import { createHeistBags, LootLedger } from './loot.js';
import { HeistMissionMachine } from './mission.js';
import { AuthoredNavigationGraph, SquadDirector } from './navigation.js';
import { HeistObjectiveLedger } from './objective.js';
import { objectiveForState } from './orders.js';
import { makePoliceFigure } from './people.js';
import { PoliceDirector } from './police.js';
import { SafehousePreparation } from './safehouse.js';
import { makeHeistViewModel } from './weapons.js';
import {
  CREW_FRIENDLY_FIRE_LINES, HOSTAGE_BARKS, PROSPECT_VERB_LINES, dialogueLine,
  pendingHeistCues, recordedHeistCues,
} from './script.js';

/** Only manifest-backed cues are preloaded; the pending bank is subtitle-only. */
const HEIST_VOICE_CUES = Object.freeze(recordedHeistCues());
const HEIST_PENDING_CUES = Object.freeze(pendingHeistCues());

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
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
const rearGuardActor = new CombatActor({
  id: 'bank_rear_guard', faction: FACTIONS.POLICE, maxHealth: 38, armor: 0,
});
level.phases.bank.interactables.rearGuard.userData.combatActor = rearGuardActor;

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
}
const managerActor = new CombatActor({
  id: 'bank_manager', faction: FACTIONS.CIVILIAN, maxHealth: 40, armor: 0,
});
level.phases.bank.interactables.manager.userData.combatActor = managerActor;

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
const SQUAD_FORMATIONS = Object.freeze({
  safehouse: Object.freeze([[-3.4, -1.2], [-1.7, -2.4], [0, -2.6], [1.8, -2.3], [3.5, -1.1]]),
  // Benched down both sides with the aisle kept clear: the player rides facing
  // the doors and should be looking at them, not at Numbskull's chest.
  van: Object.freeze([[-1.15, 1.45], [1.15, 1.2], [-1.15, -0.2], [1.15, -0.55], [-1.15, -1.75]]),
  /* Off the centre line, in all three of these.
   *
   * `InteractionSystem` walks the hit list and stops at the first solid thing
   * with no descriptor on it — which a crew member standing in the middle of
   * the lobby is. Five people parked between the player and the room he is
   * supposed to be working killed the prompt on whoever was behind them. They
   * cover the room from its edges now, which is also where a crew covering a
   * room would stand. */
  bank: Object.freeze([[-8.6, 6.4], [8.6, 6.0], [-8.8, -0.6], [8.8, -1.2], [4.2, 9.4]]),
  street: Object.freeze([[-6.6, 25], [6.6, 22], [-7, 18], [7, 17], [-6.8, 28]]),
  garage: Object.freeze([[-6.5, 7], [6.5, 6], [-7, 0], [7, -1], [-6.5, -6]]),
  driving: Object.freeze([[16, -649], [18, -651], [20, -653], [22, -651], [24, -649]]),
});
const squadAnchorPositions = new Map();
const squadAnchorIds = Object.entries(SQUAD_FORMATIONS).flatMap(([zone, positions]) => (
  positions.map((position, index) => {
    const id = `${zone}_${index}`;
    squadAnchorPositions.set(id, position);
    return id;
  })
));
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
    try { activeDialogueSource?.stop?.(); } catch { /* already ended */ }
    /* Whatever the last speaker was still saying, he has stopped -- the source
     * above was just cut, and a mouth left running would carry on without it. */
    hushCrew();
    const duration = audio.sampleDuration(line.cue) ?? line.fallbackDuration;
    hud.say(line, duration);
    /* `analyse` explicitly, because THE TAKE's dialogue is on the `heist.`
     * prefix rather than `vo.` -- the same prefix its forty-six sound effects
     * use (ENGINE-TRAPS.md entry 4). The engine's automatic tap keys off `vo.`
     * and would never fire here. */
    activeDialogueSource = audio.hasSample(line.cue)
      ? audio.play(line.cue, { volume: 0.85, analyse: true })
      : null;
    /* The person who is saying it says it — crew, manager, guard or the
     * customer on the floor. See `figureForLine`; it used to be `crew.get()`
     * alone, which is why nothing in the vault or the lobby moved a mouth.
     *
     * `Mouth` reads the RMS off the take's own analyser, so this is the sound
     * driving the face rather than a timer next to it (ENGINE-TRAPS entry 8).
     * The `fallback` envelope is reached only where there is no recording. */
    figureForLine(line)?.say(
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
  hud.setAmmo(active.magazine,
    `/ ${active.reserveMagazines * active.definition.magazineSize}`,
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
let policeFireClock = 0.8;
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
const lineOfSightRaycaster = new THREE.Raycaster();
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

/* Blood, in three pools, all pre-built. See `emitBlood`.
 *
 * Deliberately not the same mesh as `impactPool`: a hit on a person and a hit
 * on marble threw identical sandy dust, which is why shooting a customer
 * looked the same as missing one. */
const BLOOD_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x5e0d10 });
const bloodPool = Array.from({ length: 28 }, () => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.032, 5, 4), BLOOD_MATERIAL);
  mesh.visible = false;
  mesh.userData.life = 0;
  scene.add(mesh);
  return mesh;
});
const bloodMistPool = Array.from({ length: 6 }, () => {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 7, 5),
    new THREE.MeshBasicMaterial({ color: 0x7d1418, transparent: true, opacity: 0.42 }),
  );
  mesh.visible = false;
  mesh.userData.life = 0;
  mesh.userData.fade = true;
  scene.add(mesh);
  return mesh;
});
/** Fatal hits leave a mark on the floor. Bounded by the scene's decal budget. */
let bloodDecalCursor = 0;
const bloodDecals = Array.from({ length: Math.min(24, PERFORMANCE_BUDGET.maxDecals) }, () => {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 10),
    new THREE.MeshBasicMaterial({ color: 0x4a0a0d, transparent: true, opacity: 0.78 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
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
function debugAimAt(hostageId) {
  const root = level.phases.bank.civilians
    .find((figure) => figure.userData.hostageId === hostageId);
  if (!root || activePhase !== 'bank') return { ok: false, reason: 'missing' };
  const world = root.getWorldPosition(new THREE.Vector3());
  /* Stand somewhere the crosshair can only be on THIS person. A queue in a
   * bank is people 1.6 m apart, so a naive "back off along the room's axis"
   * puts the camera inside their neighbour and the ray never gets past them.
   * Sample the circle and take the stand-off with the most daylight. */
  const others = [
    ...level.phases.bank.civilians.filter((figure) => figure !== root),
    ...[...crew.values()].map((actor) => actor.group),
    level.phases.bank.interactables.manager,
    level.phases.bank.interactables.rearGuard,
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

function debugHostageVerb(hostageId, verb) {
  const root = level.phases.bank.civilians
    .find((figure) => figure.userData.hostageId === hostageId);
  if (!root) return { ok: false, reason: 'missing' };
  return applyHostageVerb(root, verb);
}

function debugShootHostage(hostageId) {
  const root = level.phases.bank.civilians
    .find((figure) => figure.userData.hostageId === hostageId);
  if (!root) return { ok: false, reason: 'missing' };
  return { ok: registerActorHit(root, root.userData.combatActor, 999) !== null };
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

/** Deterministic camera marks used only by browser evidence capture. */
function debugPoseForEvidence(name) {
  const poses = {
    briefing: { phase: 'safehouse', position: [0, 1.66, 2.55], yaw: 0, pitch: -0.28 },
    armor: { phase: 'safehouse', position: [-5.5, 1.66, 4.45], yaw: 0, pitch: -0.18 },
    loadout: { phase: 'safehouse', position: [4.7, 1.66, 4.25], yaw: 0, pitch: -0.38 },
    bank_guard: { phase: 'bank', position: [0, 1.66, 8.5], yaw: 0.9273 },
    bank_lobby: { phase: 'bank', position: [-0.6, 1.66, 5.6], yaw: -0.88, pitch: -0.1 },
    bank_hostages: { phase: 'bank', position: [0.2, 1.66, 5.4], yaw: 0.05, pitch: -0.08 },
    bank_vault: { phase: 'bank', position: [0, 1.66, -6.0], yaw: 0, pitch: -0.05 },
    bank_exit: { phase: 'street', position: [-4, 1.66, 28], yaw: -2.5536 },
    downtown_firefight: { phase: 'street', position: [0, 1.66, 27], yaw: 0 },
    vehicle_swap: { phase: 'driving', position: [14, 1.66, -657], yaw: -2.158 },
  };
  const pose = poses[name];
  if (!pose || activePhase !== pose.phase) return false;
  player.position.fromArray(pose.position);
  player.velocity.set(0, 0, 0);
  player.yaw = pose.yaw;
  player.pitch = pose.pitch ?? 0;
  player.update(1 / 60);
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
    phase: activePhase,
    checkpoint: latestCheckpoint,
    health: playerActor.health,
    bags: loot.summary(),
    carryingBag,
    bankBagsStaged,
    officersDown,
    policeActive: activePoliceMeshes().length,
    policeTotal: policeFigures.length,
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
    },
    civilianStates: hostages.hostages.map((person) => person.state),
    civilianVisualStates: level.phases.bank.civilians.map((civilian) => civilian.userData.visualState ?? 'stand'),
    guardThreat: guardThreat.snapshot(),
    guardFailures,
    managerEscortProgress,
    managerPosition: level.phases.bank.interactables.manager.position.toArray(),
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
        return {
          id: actor.id,
          name: actor.identity.subtitleName,
          role: actor.role,
          facingDot: (Math.sin(actor.group.rotation.y) * dx + Math.cos(actor.group.rotation.y) * dz) / length,
          introduced: crewIntroduced.has(actor.id),
        };
      }),
      numbskullFace: crew.get(CHARACTER_IDS.NUMBSKULL)?.group.userData.proceduralFace?.treatment
        === 'round_glasses',
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
    const hit = aimRaycaster.intersectObject(level.phases.bank.group, true)[0];
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

  objective.syncHostages(hostages.summary());
  hud.setLobby(activePhase === 'bank' ? {
    controlled: hostages.summary().controlled,
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
    if (!lobbyHeldAnnounced && hostages.summary().restrained >= 4) {
      lobbyHeldAnnounced = true;
      say('numb_lobby_held');
    }
  }
}

/**
 * A round landed on somebody.
 *
 * @returns {object|null} the resolved hit, or null when nothing was there.
 */
function registerActorHit(ownerNode, actor, damage, penetration = 0.3) {
  if (!actor) return null;
  const resolved = resolveBallisticHits([{ distance: 1, actor }], {
    attacker: { faction: FACTIONS.CREW },
    damage,
    penetration,
    matrix: factionMatrix,
    playerShot: true,
  });
  const result = resolved[0]?.result;
  if (!result?.applied) {
    // Refused: the matrix protects crew from crew. Still worth saying out loud.
    if (actor.faction === FACTIONS.CREW) {
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
      say('snow_casualty');
      /* The witness is not the person who was shot — it is whoever is nearest
       * and still alive, and it is their mouth that has to move. */
      pendingBarkSpeaker = nearestLivingHostageTo(person.id);
      sayPooled(HOSTAGE_BARKS, 'witness');
      policeHeat = Math.min(100, policeHeat + 18);
    } else if (result.fatal) {
      objective.civilianCasualties++;
      ownerNode.userData.figure?.fallen?.();
      say('snow_casualty');
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
 * Three parts, all off the existing pools so nothing is allocated in the
 * frame that fires: spray along the round's line, a mist puff hanging where
 * it went in, and — on a fatal hit only — a pool that spreads on the floor
 * and stays. The floor pool is the reason a lobby the player has shot up
 * looks different from one he has not.
 *
 * @param {THREE.Vector3} position where the round landed
 * @param {THREE.Vector3} direction the round's travel, for the spray cone
 * @param {boolean} fatal
 */
function emitBlood(position, direction, fatal = false) {
  const spray = fatal ? 7 : 4;
  for (let i = 0; i < spray; i++) {
    const velocity = direction.clone().multiplyScalar(1.4 + Math.random() * 1.8);
    velocity.x += (Math.random() - 0.5) * 1.9;
    velocity.y += 0.6 + Math.random() * 1.5;
    velocity.z += (Math.random() - 0.5) * 1.9;
    emitFromPool(bloodPool, position, 0.42 + Math.random() * 0.3, velocity);
  }
  // The mist: slow, barely moving, and gone before the body lands.
  emitFromPool(bloodMistPool, position, 0.34, new THREE.Vector3(0, 0.22, 0));
  audio.play('heist.body.marble', {
    position, volume: fatal ? 0.66 : 0.4, rate: fatal ? 0.92 : 1.18, ref: 1.2, maxDist: 24,
  });
  audio.play('heist.bullet.impact', {
    position, volume: 0.34, rate: 0.78, ref: 1.1, maxDist: 20,
  });
  if (!fatal) return;
  /* The pool on the floor. It goes at the feet rather than at the wound, it
   * does not move, and it is not recycled until the decal budget wraps —
   * `PERFORMANCE_BUDGET.maxDecals` is what bounds it. */
  const decal = bloodDecals[bloodDecalCursor % bloodDecals.length];
  bloodDecalCursor++;
  decal.visible = true;
  decal.position.set(position.x, 0.012, position.z);
  decal.rotation.z = Math.random() * Math.PI;
  decal.scale.setScalar(0.75 + Math.random() * 0.6);
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
  // Blood is heavier than dust and it arcs rather than drifting.
  for (const mesh of bloodPool) update(mesh, 9.2);
  for (const mesh of bloodMistPool) update(mesh, 0);
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

function phaseIdForState(state) {
  const phase = PHASE_FOR_STATE[state];
  return ['safehouse', 'van', 'bank', 'street', 'garage', 'driving'].includes(phase)
    ? phase : 'safehouse';
}

function placeCrew(phaseId) {
  const phase = level.phases[phaseId] ?? level.phases.safehouse;
  for (const actor of crew.values()) {
    phase.group.add(actor.group);
    squad.assign(actor.id, phaseId);
    const [x, z] = squadAnchorPositions.get(actor.anchor);
    actor.group.position.set(x, 0, z);
    actor.heading = crewHeadingForPhase(phaseId, { x, z });
    actor.group.rotation.y = actor.heading;
  }
  window.__heistDebug.squadAnchors = Object.fromEntries(
    [...crew.values()].map((actor) => [actor.id, actor.anchor]),
  );
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
  if (!preservePlayer) {
    player.position.copy(phase.spawn);
    player.velocity.set(0, 0, 0);
    player.yaw = 0;
    player.pitch = id === 'safehouse' ? -0.12 : 0;
  }
  window.__heistDebug.phase = id;
  interaction.setOccluders([phase.group]);
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
      say('lou_radio_open');
      audio.play('heist.van.door');
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
      sayInTurn('numb_lobby_order', 'lou_radio_lobby', 'death_floor',
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
          p.bank.interactables.vault.userData.setOpen?.(true);
          recordCheckpoint('vault_open', 'CASH_LOADING', {
            alarmTriggered: true, bagsStaged: 0,
          });
          refreshObjective();
          sayInTurn('snow_clock', 'lou_radio_vault', 'snow_insured');
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
        bagMesh.userData.carried = true;
        audio.play('heist.cash.lift');
        hud.setBag(loot.get(bagId).value, 1);
      }, { enabled: () => machine.state === 'CASH_LOADING' && !carryingBag && !loot.get(bagId).recovered });
    }
    use(p.bank.interactables.exit,
      carryingBag ? 'Stage the carried cash bag' : (bankBagsStaged >= 8 ? 'Withdraw from the bank' : 'Cash staging point'), () => {
        if (machine.state === 'CASH_LOADING' && carryingBag) {
          const bagId = carryingBag;
          loot.drop(bagId, { anchor: 'bank_exit', position: { x: 0, y: 0.3, z: 8.8 } });
          carryingBag = null;
          bankBagsStaged++;
          audio.play('heist.cash.drop');
          p.bank.group.getObjectByName(bagId.replace('_', '-')).userData.carried = false;
          hud.setBag(0, 0);
          if (bankBagsStaged >= 2) {
            for (let i = 1; i <= 8; i++) {
              const id = `cash_${i}`;
              const bag = loot.get(id);
              if (!bag.carrier && !bag.position) loot.carry(id, i % 2 ? CHARACTER_IDS.DEATHMEGATRON : CHARACTER_IDS.NUMBSKULL);
              if (loot.get(id).carrier) loot.drop(id, { anchor: 'bank_exit', position: { x: (i - 4) * 0.4, y: 0.3, z: 8.5 } });
            }
            bankBagsStaged = 8;
            audio.startLoop('heist.bank.alarm', { volume: 0.34, ambience: true, fade: 0.15 });
            advanceTo('ALARM_DISCOVERED');
            advanceTo('EXIT_ORDER');
            sayInTurn('numb_signal', 'rippin_street', 'snow_exit', 'lou_radio_street');
            refreshObjective();
          }
          refreshInteractions();
        } else if (machine.state === 'EXIT_ORDER') beginStreet();
      });
    return;
  }

  if (activePhase === 'street') {
    use(p.street.interactables.bankDoor, 'Move off the bank steps', () => {
      if (machine.state === 'BANK_DOOR_CONTACT') advanceTo('STREET_BLOCK_ONE');
      refreshObjective();
    });
    use(p.street.interactables.van, officersDown >= 2 ? 'Reach Rippin at the van' : 'Police fire blocks the van', () => {
      if (machine.state !== 'STREET_BLOCK_ONE' || officersDown < 2) return;
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
      hud.setBag(loot.get('cash_8').value, 1);
      say('numb_bag');
      advanceTo('DROPPED_BAG_DECISION');
      refreshInteractions();
    });
    use(p.street.interactables.garage, 'Enter Mercer garage', () => {
      if (!['STREET_BLOCK_TWO', 'DROPPED_BAG_DECISION'].includes(machine.state) || officersDown < 2) return;
      enterGarage();
    }, { enabled: () => officersDown >= 2 });
    return;
  }

  if (activePhase === 'garage') {
    use(p.garage.interactables.hold, officersDown >= 2 ? 'Signal the loading move' : 'Hold the garage entrance', () => {
      if (machine.state === 'GARAGE_ENTRY') advanceTo('GARAGE_HOLD');
      if (machine.state === 'GARAGE_HOLD' && officersDown >= 2) {
        say('shubes_garage');
        refreshObjective();
      }
    });
    use(p.garage.interactables.load, 'Load crew and cash into the sedan', () => {
      if (machine.state !== 'GARAGE_HOLD' || officersDown < 2) return;
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
    use(p.safehouse.interactables.armor, '1/4 — Get Rippin’s leg wrapped', () => {
      if (machine.state !== 'SAFEHOUSE_RETURN') return;
      advanceTo('FIRST_AID');
      say('rippin_aid');
      crew.get(CHARACTER_IDS.RIPPINFLOW).injury = 'stabilized';
      refreshObjective();
      refreshInteractions();
    }, { hold: 1.5, enabled: () => machine.state === 'SAFEHOUSE_RETURN' });
    /* The label reads the table, before and after. Before the count it is the
     * instruction; after it, the table is a readout the player can walk back
     * to and be told the number again — which is the whole point of putting
     * the bags on it. */
    use(p.safehouse.interactables.briefing, () => (machine.state === 'FIRST_AID'
      ? '2/4 — Empty the bags and count the take'
      : `The take: ${objective.bagsRecovered} of ${objective.totalBags} bags home`), () => {
      if (machine.state !== 'FIRST_AID') return;
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
    }, { hold: 1.8, enabled: () => machine.state === 'FIRST_AID' });
    use(p.safehouse.interactables.loadout, '3/4 — Put the weapons down', () => {
      if (machine.state !== 'DEBRIEF' || weaponsDown) return;
      weaponsDown = true;
      audio.play('heist.weapon.down');
      preparation.reset();
      syncSafehousePresentation();
      syncHeistInventory(true);
      refreshObjective();
      refreshInteractions();
    }, { enabled: () => machine.state === 'DEBRIEF' && !weaponsDown });
    use(p.safehouse.interactables.van, '4/4 — Answer Lou’s call', () => {
      if (machine.state !== 'DEBRIEF' || !weaponsDown) return;
      advanceTo('LOU_CALL_SAFEHOUSE');
      scriptedSpeech.length = 0;
      sayInTurn('lou_call', 'lou_prospect_verdict', 'prospect_home');
      setTimeout(completeMission, 3200);
    }, { enabled: () => machine.state === 'DEBRIEF' && weaponsDown });
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
    addPoliceFigure({
      id: `${block}_${policeFigures.length}_${waveIndex}`,
      block,
      phaseId: activePhase,
      position: entry
        ? [entry[0] + (Math.random() - 0.5) * 1.6, 0, entry[1] + (Math.random() - 0.5) * 2.4]
        : [(i % 2 ? -1 : 1) * (4 + i), 0, baseZ - i * 5],
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

/** Which block is feeding the contact the player is standing in. */
function activePoliceBlock() {
  if (activePhase === 'garage') return 'mercer_garage';
  if (activePhase !== 'street') return null;
  return ['STREET_BLOCK_TWO', 'DROPPED_BAG_DECISION', 'FALLBACK_ROUTE']
    .includes(machine.state) ? 'market_street' : 'bank_avenue';
}

/** Where a wave comes in from, per block. Behind and beside, never in front. */
const WAVE_ENTRY = Object.freeze({
  bank_avenue: [[-6.4, 26], [6.4, 24], [-5.2, 30], [5.6, 29], [0, 32]],
  market_street: [[-6.6, -6], [6.6, -9], [-5.4, -14], [5.8, -16], [0, -19]],
  mercer_garage: [[-7.2, 11], [7.2, 10], [-6.4, 13.5], [6.4, 13], [0, 14]],
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
    spare.actor = actor;
    spare.root.userData.combatActor = actor;
    spare.root.userData.block = block;
    spare.root.userData.down = false;
    spare.root.visible = visible;
    spare.root.position.set(position[0], 0, position[2]);
    spare.root.rotation.y = Math.PI;
    spare.figure.braced?.();
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
  root.add(proxy);
  if (actor.incapacitated) figure.fallen();
  level.phases[phaseId].group.add(root);
  policeFigures.push({ root, figure, actor });
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
  raycaster.setFromCamera(SCREEN_CENTER, camera);
  const hits = raycaster.intersectObject(level.phases[activePhase].group, true);
  const hit = hits[0];
  const owner = hit ? actorFor(hit.object) : null;
  objective.noteShot({ hitActor: !!owner });
  if (!hit) return;
  // A round into a wall throws dust; a round into a person does not.
  if (!owner) { emitImpact(hit.point); return; }
  const actor = owner.userData.combatActor;
  const result = registerActorHit(owner, actor, shot.damage, shot.penetration);
  if (!result?.applied) { emitImpact(hit.point); return; }
  emitBlood(hit.point, camera.getWorldDirection(new THREE.Vector3()), result.fatal);
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
    const entry = policeEntryFor(owner);
    if (entry) entry.figure.fallen({ roll: Math.random() > 0.5 ? 0.6 : -0.6 });
    officersDown++;
    objective.noteOfficerDown();
    police.remove(owner.userData.block);
    window.__heistDebug.policeActive = activePoliceMeshes().length - 1;
    owner.userData.down = true;
    refreshInteractions();
  }
}

function updatePoliceCombat(dt) {
  if (!['street', 'garage'].includes(activePhase) || machine.state === 'FAILED') return;
  const live = activePoliceMeshes();
  if (!live.length) return;
  policeFireClock -= dt;
  if (policeFireClock > 0) return;
  policeFireClock = 0.55 + Math.random() * 0.75;
  const shooter = live[Math.floor(Math.random() * live.length)];
  const distance = shooter.position.distanceTo(player.position);
  if (distance > 48) return;
  const origin = shooter.getWorldPosition(new THREE.Vector3());
  origin.y = 1.35;
  const target = player.position.clone();
  target.y = 1.2;
  const direction = target.sub(origin).normalize();
  origin.addScaledVector(direction, 0.6);
  lineOfSightRaycaster.set(origin, direction);
  lineOfSightRaycaster.far = Math.max(0, distance - 0.8);
  if (lineOfSightRaycaster.intersectObject(level.phases[activePhase].group, true).length) return;
  audio.play('heist.police.gunshot', { position: origin, volume: 0.72, ref: 1.6, maxDist: 55 });
  audio.play('heist.bullet.whiz', { volume: 0.42 });
  suppression.noteNearMiss(0.16, Math.max(0.2, distance / 48));
  emitImpact(player.position.clone().add(new THREE.Vector3(
    (Math.random() - 0.5) * 1.4, -0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 1.4,
  )));
  const moving = player.velocity.lengthSq() > 2.5;
  const hitChance = (moving ? 0.18 : 0.34) * (1 - Math.min(0.45, suppression.value * 0.2));
  if (Math.random() > hitChance) return;
  const result = playerActor.applyHit({
    amount: 8 + Math.random() * 7,
    attacker: { faction: FACTIONS.POLICE },
    matrix: factionMatrix,
  });
  if (!result.applied) return;
  hud.setHealth((playerActor.health / playerActor.maxHealth) * 100);
  audio.play('heist.player.hit', { volume: 0.75 });
  if (result.fatal) failMission('prospect_incapacitated');
}

function updateBankSequence(dt) {
  if (activePhase !== 'bank' || machine.state === 'FAILED') return;
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
  const phase = level.phases[activePhase];
  const id = carryingBag;
  loot.drop(id, {
    anchor: `${activePhase}_drop`,
    position: { x: player.position.x, y: 0.3, z: player.position.z },
  });
  const mesh = phase.group.getObjectByName(id.replace('_', '-'));
  if (mesh) { mesh.position.set(player.position.x, 0.3, player.position.z); mesh.visible = true; }
  carryingBag = null;
  hud.setBag(0, 0);
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
  reset: () => { player.clearKeys(); player.velocity.set(0, 0, 0); },
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
    })),
  }),
  reset: () => {
    for (const entry of policeFigures) entry.figure.dispose();
    policeFigures = [];
    police.reset();
  },
  restore: (snapshot) => {
    police.restore(snapshot.director);
    for (const record of snapshot.meshes) addPoliceFigure({ ...record, actorSnapshot: record.actor });
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
    lobbyControlled, rearGuardSecured, managerEscortProgress,
    guardThreat: guardThreat.capture(), lobbyGuardActor: lobbyGuardActor.snapshot(),
    officersDown, driving, roadblockHit, routeIndex, offroadHitCooldown,
    driveCollisionCooldown, policeFireClock, swapProgress: { ...swapProgress },
    driveInvalidFor, driveStuckFor, drivingRecovery,
    suppression: suppression.value,
  }),
  reset: () => {
    preparation.reset();
    lobbyControlled = false;
    rearGuardSecured = false;
    managerEscortProgress = 0;
    bankBagsStaged = 0;
    carryingBag = null;
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
    policeFireClock = 0.8;
    Object.keys(swapProgress).forEach((key) => { swapProgress[key] = false; });
    suppression.value = 0;
    resetLobbyGuardThreat();
    level.phases.bank.interactables.rearGuard.userData.resetThreatPose?.();
    level.phases.bank.interactables.manager.userData.setEscortProgress?.(0);
    syncSafehousePresentation();
  },
  restore: (snapshot) => {
    preparation.restore(snapshot.preparation ?? snapshot);
    lobbyControlled = snapshot.lobbyControlled === true;
    rearGuardSecured = snapshot.rearGuardSecured === true;
    managerEscortProgress = snapshot.managerEscortProgress ?? 0;
    bankBagsStaged = snapshot.bankBagsStaged ?? 0;
    carryingBag = snapshot.carryingBag ?? null;
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
    policeFireClock = snapshot.policeFireClock ?? 0.8;
    Object.assign(swapProgress, snapshot.swapProgress ?? {});
    suppression.value = snapshot.suppression ?? 0;
    guardThreat.restore(snapshot.guardThreat);
    if (snapshot.lobbyGuardActor) lobbyGuardActor.restore(snapshot.lobbyGuardActor);
    level.phases.bank.interactables.guard.userData.resetThreatPose?.();
    if (guardThreat.state === 'neutralized') level.phases.bank.interactables.guard.userData.setNeutralized?.();
    else if (guardThreat.state === 'drawing') {
      level.phases.bank.interactables.guard.userData.setThreatProgress?.(guardThreat.snapshot().progress);
    }
    level.phases.bank.interactables.rearGuard.userData.resetThreatPose?.();
    if (rearGuardSecured) level.phases.bank.interactables.rearGuard.userData.setNeutralized?.();
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
    level.phases.bank.interactables.rearGuard.userData.setNeutralized?.();
    level.phases.bank.interactables.guard.userData.setNeutralized?.();
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
  }
  if (count >= 5) crew.get(CHARACTER_IDS.RIPPINFLOW).injury = 'moderate';
  if (count >= 1) {
    preparation.restore({ armorReady: true, loadoutReady: true });
    syncSafehousePresentation();
    loadout.wearMask(true);
    setCrewMasked(crew, true);
    syncHeistInventory(true);
  }
  if (checkpoint === 'bank_lobby' || count >= 3) {
    level.phases.bank.interactables.vault.userData.setOpen?.(count >= 3);
  }
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
  if (!isPreviewMode()) canvas.requestPointerLock?.();
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
function setSimulationPaused(value) {
  if (isPreviewMode()) return;
  simulationPaused = value === true;
  if (simulationPaused) {
    player.clearKeys();
    vehicle.setInput();
  }
  interaction.setPaused(simulationPaused || driving);
}

canvas.addEventListener('click', () => {
  if (!started) return;
  setSimulationPaused(false);
  if (!driving) canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  player.enabled = document.pointerLockElement === canvas && !driving;
  if (started && !driving) setSimulationPaused(document.pointerLockElement !== canvas);
});
addEventListener('blur', () => { if (started) setSimulationPaused(true); });
document.addEventListener('visibilitychange', () => {
  if (started && document.hidden) setSimulationPaused(true);
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === canvas && !driving) player.handleMouseMove(event.movementX, event.movementY);
});
const SLOT_KEYS = Object.freeze({
  Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4,
  Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4,
});

document.addEventListener('keydown', (event) => {
  if (event.repeat && ['KeyE', 'KeyR', 'KeyQ', 'KeyF', 'KeyG'].includes(event.code)) return;
  player.setKey(event.code, true);
  if (event.code in SLOT_KEYS) { selectSlot(SLOT_KEYS[event.code]); return; }
  if (event.code === 'BracketLeft') { cycleSlot(-1); return; }
  if (event.code === 'BracketRight') { cycleSlot(1); return; }
  if (event.code === 'KeyE') interaction.press();
  if (event.code === 'KeyF') hostageVerbUnderCrosshair('reassure');
  if (event.code === 'KeyG') hostageVerbUnderCrosshair('demand');
  if (event.code === 'KeyR' && loadout.activeWeapon?.beginReload()) {
    playWeaponCue(audio,
      loadout.selectedItem === 'sidearm' ? WEAPON_IDS.PISTOL9 : WEAPON_IDS.CARBINE, 'reload.out');
  }
  if (event.code === 'KeyQ') dropCarriedBag();
  if (event.code === 'F9' && isPreviewMode()) failMission('preview_failure_test');
});
document.addEventListener('keyup', (event) => {
  player.setKey(event.code, false);
  if (event.code === 'KeyE') interaction.release();
});
addEventListener('wheel', (event) => {
  if (!started || driving) return;
  cycleSlot(event.deltaY > 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('mousedown', (event) => {
  if (event.button === 0 && (document.pointerLockElement === canvas || isPreviewMode())) fireWeapon();
  if (event.button === 2) loadout.activeWeapon?.setAimed(true);
});
document.addEventListener('mouseup', (event) => {
  if (event.button === 2) for (const gun of Object.values(loadout.weapons)) gun.setAimed(false);
});
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
  player.clearKeys();
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
    camera.rotation.z += (Math.random() - 0.5) * 0.09;
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
  const slipLead = vehicle.steerAngle * 5.5;
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
  camera.rotation.z += vehicle.bodyRoll * 0.35 + suppression.value * 0.01;
  const targetFov = 72 + speedRatio * 14 + handbrake * 3;
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

function constrainPlayerToPhase() {
  const bounds = {
    safehouse: [-8.7, 8.7, -6.7, 6.7],
    van: [-1.45, 1.45, -2.65, 2.65],
    // The z floor reaches into the vault corridor, which is where the cash is.
    bank: [-10.6, 10.6, -12.9, 10.4],
    street: [-8.8, 8.8, -35.2, 35.2],
    garage: [-11.6, 11.6, -14.6, 14.6],
    driving: [14, 26, -659, -645],
  }[activePhase];
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
  updateEffectPools(dt);
  hud.setSuppression(suppression.value);
  muzzle.intensity = Math.max(0, muzzle.intensity - dt * 70);
  if (dialogue.current && now >= dialogueEndAt) dialogue.finish();
  dialogue.update(now);
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
      updatePoliceCombat(dt);
      if (camera.fov !== 72) { camera.fov = 72; camera.updateProjectionMatrix(); }
    }
    updateCrew(crew, dt);
    if (carryingBag) {
      const mesh = level.phases[activePhase].group.getObjectByName(carryingBag.replace('_', '-'));
      if (mesh) mesh.position.set(player.position.x + 0.45, player.position.y - 1.1, player.position.z + 0.2);
    }
  }
  renderer.render(scene, camera);
}

/** Breathing, shaking, and the manager and the guards, once per frame. */
function updateLobbyFigures(dt) {
  if (activePhase !== 'bank') return;
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
