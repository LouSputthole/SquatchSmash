import { TimingBar } from '../core/timingbar.js';
import { createDressHelpSequence } from '../world/dress-help.js';

const MAIN_HIP_Y = 0.87;
const LOFT_HIP_Y = 4.17;
const WALK_SPEED = 2.35;
const TALK_HOLD = 4.4;
const REPLY_HOLD = 3.35;

/**
 * A measured route from the private lift, through the main room, up all
 * eighteen stair rises and through the bedroom opening.  The y component is
 * the actor's hip height, not the floor height.  Keeping the vertical route
 * here makes it impossible for the story adapter to "walk" Margo between two
 * floors by changing only x/z and letting her appear at the other end.
 */
export const LUXURY_MARGO_ENTRY_PATH = Object.freeze([
  Object.freeze([7.85, MAIN_HIP_Y, -1.46]),
  Object.freeze([7.85, MAIN_HIP_Y, -0.18]),
  Object.freeze([3.20, MAIN_HIP_Y, 1.55]),
  Object.freeze([-5.95, MAIN_HIP_Y, 3.72]),
  Object.freeze([-8.72, MAIN_HIP_Y, 4.46]),
  Object.freeze([-8.72, 1.70, 3.12]),
  Object.freeze([-8.72, 2.52, 1.72]),
  Object.freeze([-8.72, 3.34, 0.34]),
  Object.freeze([-8.72, LOFT_HIP_Y, -0.82]),
  Object.freeze([-6.65, LOFT_HIP_Y, -1.62]),
  Object.freeze([0.72, LOFT_HIP_Y, -2.52]),
  Object.freeze([3.76, LOFT_HIP_Y, -3.02]),
  Object.freeze([5.58, LOFT_HIP_Y, -4.18]),
  Object.freeze([5.92, LOFT_HIP_Y, -5.42]),
]);

export const LUXURY_MARGO_EXIT_PATH = Object.freeze(
  [...LUXURY_MARGO_ENTRY_PATH].reverse().map((point) => Object.freeze([...point])),
);

export const LUXURY_MARGO_PLACEMENTS = Object.freeze({
  bedside: Object.freeze({ position: Object.freeze([5.92, LOFT_HIP_Y, -5.42]), yaw: 2.86 }),
  dress: Object.freeze({ position: Object.freeze([5.72, 3.80, -5.18]), yaw: -1.72 }),
  bed: Object.freeze({ position: Object.freeze([7.28, 4.24, -6.16]) }),
  wakeSit: Object.freeze({ position: Object.freeze([6.72, 4.02, -5.92]), yaw: -2.58 }),
});

export const LUXURY_MARGO_CHECKPOINT_IDS = Object.freeze({
  ENTRANCE: 'entrance',
  STAIRS: 'stairs',
  UPSTAIRS_DRESS: 'upstairs-dress',
  SLEEP: 'sleep',
  MORNING_DEPARTURE: 'morning-departure',
});

const MARGO_CHECKPOINTS = new Set(Object.values(LUXURY_MARGO_CHECKPOINT_IDS));
const SNORE_FIRST_DELAY = 0.65;
const SNORE_INTERVAL = 3.8;
const SNORE_VOLUME = 0.14;

function segmentLength(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function pathMetrics(path) {
  const segments = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const length = segmentLength(path[i], path[i + 1]);
    segments.push({ from: total, to: total + length, length });
    total += length;
  }
  return Object.freeze({ segments: Object.freeze(segments), total });
}

const ENTRY_METRICS = pathMetrics(LUXURY_MARGO_ENTRY_PATH);
const EXIT_METRICS = pathMetrics(LUXURY_MARGO_EXIT_PATH);
const ENTRANCE_CHECKPOINT_DISTANCE = ENTRY_METRICS.segments[0].to;
const STAIR_CHECKPOINT_DISTANCE = ENTRY_METRICS.segments[5].to;
const DEPARTURE_CHECKPOINT_PROGRESS = 0.92;

/** Sample a route by metres travelled rather than by waypoint count. */
export function sampleLuxuryMargoPath(path, distance) {
  const metrics = path === LUXURY_MARGO_EXIT_PATH ? EXIT_METRICS : ENTRY_METRICS;
  const d = Math.max(0, Math.min(metrics.total, Number(distance) || 0));
  let index = metrics.segments.findIndex(({ to }) => d <= to);
  if (index < 0) index = metrics.segments.length - 1;
  const segment = metrics.segments[index];
  const a = path[index];
  const b = path[index + 1];
  const t = segment.length > 0 ? (d - segment.from) / segment.length : 1;
  return Object.freeze({
    x: a[0] + (b[0] - a[0]) * t,
    y: a[1] + (b[1] - a[1]) * t,
    z: a[2] + (b[2] - a[2]) * t,
    yaw: Math.atan2(b[0] - a[0], b[2] - a[2]),
    distance: d,
    total: metrics.total,
    progress: metrics.total > 0 ? d / metrics.total : 1,
    segment: index,
  });
}

/** Every recorded cue a definition can ask the luxury runtime to play. */
export function luxuryMargoCueNames(...definitions) {
  const names = [];
  for (const definition of definitions.filter(Boolean)) {
    definition.lines?.forEach((_line, index) => {
      names.push(`vo.${definition.vo}.${index + 1}`);
      if (definition.replies?.[index]) names.push(`vo.${definition.vo}.tony.${index + 1}`);
    });
  }
  return names;
}

function placeActor(actor, pose, placement) {
  actor.setPose(pose);
  actor.group.position.set(...placement.position);
  if (Number.isFinite(placement.yaw)) actor.group.rotation.y = placement.yaw;
}

function setWalkPose(actor, sample, phase) {
  actor.group.position.set(sample.x, sample.y + Math.abs(Math.cos(phase)) * 0.014, sample.z);
  actor.group.rotation.set(0, sample.yaw, 0);
  actor.legs.rotation.x = 0;
  actor.thighs.forEach((thigh, index) => {
    const p = phase + (index ? Math.PI : 0);
    thigh.rotation.x = -Math.sin(p) * 0.38;
    actor.knees[index].rotation.x = -0.04 - Math.max(0, Math.sin(p + 0.9)) * 0.56;
  });
  actor.arms.forEach((arm, index) => {
    arm.rotation.x = Math.sin(phase + (index ? Math.PI : 0)) * 0.26;
  });
  actor.upper.rotation.x = 0.04;
}

/**
 * Physical beats 16 and 17 for the two-storey apartment.
 *
 * The story adapter owns durable campaign markers.  This runtime owns only
 * presentation: a visible actor, the measured lift/stair/bed route, dialogue,
 * the shared seven-pull dress interaction, and the hand-off back to the
 * adapter after the visible action has actually completed.
 */
export function createLuxuryMargoScene({
  actor,
  audio,
  hud,
  interaction,
  onComeHomeDone = () => {},
  onWakeDone = () => {},
  onObjectiveChange = () => {},
  openElevator = () => {},
  closeElevator = () => {},
} = {}) {
  if (!actor?.group || typeof actor.setPose !== 'function') {
    throw new TypeError('createLuxuryMargoScene requires the shared Margo actor rig');
  }
  if (!audio?.play || !audio?.startLoop || !audio?.stopLoop) {
    throw new TypeError('createLuxuryMargoScene requires scene audio');
  }

  let scene = null;
  let objective = null;
  let checkpointState = null;
  let snoring = false;
  let snoreIn = 0;
  let snoreSource = null;
  let snorePlays = 0;

  const setObjective = (next) => {
    objective = next;
    onObjectiveChange(next);
  };

  const stopSnoring = () => {
    snoring = false;
    snoreIn = 0;
    if (snoreSource?.stop) {
      try { snoreSource.stop(); } catch { /* the one-shot already ended */ }
    }
    snoreSource = null;
  };

  const startSnoring = () => {
    if (snoring) return;
    snoring = true;
    snoreIn = SNORE_FIRST_DELAY;
  };

  const updateSnoring = (dt) => {
    if (!snoring) return;
    snoreIn -= dt;
    if (snoreIn > 0) return;
    /* The delivered cue is one 1.8-second breath, not an ambience bed. A
     * fixed quiet interval leaves real air between breaths, remains
     * deterministic for browser evidence, and lets the player hear where
     * she is while wandering the two-floor apartment. */
    snoreSource = audio.play('margo.snore', {
      volume: SNORE_VOLUME,
      position: actor.group.position,
      ref: 1.2,
      maxDist: 13,
    });
    snorePlays += 1;
    snoreIn += SNORE_INTERVAL;
  };

  const dress = createDressHelpSequence({
    timingBar: TimingBar,
    audio: {
      position: () => actor.group.position,
      play: (name, options) => audio.play(name, options),
      startLoop: (key, options) => audio.startLoop(key, options),
      stopLoop: (key, fade) => audio.stopLoop(key, fade),
    },
    rig: {
      begin() {
        placeActor(actor, 'kneeling', LUXURY_MARGO_PLACEMENTS.dress);
        actor.setDressHelpProgress(0);
        interaction.setPaused(true);
        hud?.hidePrompt?.();
        hud?.setPosture?.('time each pull · E');
        setObjective('Help Margo with the dress · time each pull');
      },
      onHit({ index, total }) {
        if (index !== total) hud?.toast?.(`${index}/${total}`, index >= total - 1 ? 'good' : '');
      },
      finish() {
        hud?.setTiming?.(null);
        hud?.setPosture?.(null);
      },
    },
    onProgress({ progress }) {
      actor.setDressHelpProgress(progress);
    },
    onComplete: () => finishDress(true),
    onAbandon: () => finishDress(false),
  });

  const clearFocus = () => {
    interaction.setExclusiveTarget?.(null);
    interaction.setPaused(false);
    hud?.setTiming?.(null);
    hud?.setPosture?.(null);
  };

  const completeComeHome = () => {
    actor.setDressGlue(1);
    placeActor(actor, 'lying', LUXURY_MARGO_PLACEMENTS.bed);
    actor.group.visible = true;
    clearFocus();
    scene = null;
    setObjective(null);
    hud?.say?.('<em>Night.</em> She is out inside a minute.', 3600);
    startSnoring();
    onComeHomeDone();
  };

  const beginExit = () => {
    placeActor(actor, 'standing', LUXURY_MARGO_PLACEMENTS.bedside);
    scene.phase = 'walk';
    scene.path = LUXURY_MARGO_EXIT_PATH;
    scene.distance = 0;
    scene.walkTime = 0;
    scene.elevatorOpened = false;
    clearFocus();
    setObjective('See Margo out');
  };

  function finishDress(earned) {
    if (!scene?.awaitingHelp && !dress.active) return false;
    scene.awaitingHelp = false;
    actor.setDressHelpProgress(1);
    hud?.toast?.(earned ? 'PVA. Everywhere. Again.' : 'She has got it', earned ? 'bad' : '');
    if (scene.kind === 'comeHome') completeComeHome();
    else beginExit();
    return true;
  }

  const offerHelp = () => {
    if (!scene) return;
    scene.phase = 'help';
    scene.awaitingHelp = true;
    placeActor(actor, 'standing', LUXURY_MARGO_PLACEMENTS.bedside);
    interaction.setPaused(false);
    interaction.setExclusiveTarget?.(actor.helpTarget);
    setObjective('Help Margo with her dress');
    if (scene.ask?.lines?.[0]) {
      const seconds = 5.2;
      hud?.say?.(`${scene.ask.from}: ${scene.ask.lines[0]}`, seconds * 1000);
      audio.play(`vo.${scene.ask.vo}.1`, { volume: 0.9, position: actor.group.position });
      actor.say(seconds);
    } else {
      hud?.say?.('Margo: Can you get this? The clasp is winning.', 4200);
      actor.say(4.2);
    }
  };

  const advanceTurn = () => {
    if (!scene) return;
    scene.turn += 1;
    const turn = scene.turns[scene.turn];
    if (!turn) {
      if (scene.phase === 'arrival-talk') {
        beginEntryWalk();
        return;
      }
      offerHelp();
      return;
    }
    scene.hold = turn.margo ? TALK_HOLD : REPLY_HOLD;
    hud?.say?.(`${turn.margo ? scene.definition.from : 'You'}: ${turn.text}`, scene.hold * 1000);
    audio.play(turn.cue, { volume: 0.9, position: turn.margo ? actor.group.position : undefined });
    if (turn.margo) actor.say(scene.hold);
  };

  const beginTalk = () => {
    if (!scene) return;
    scene.phase = 'talk';
    scene.definition = scene.bedroomDefinition;
    scene.turns = makeTurns(scene.definition);
    scene.turn = -1;
    scene.hold = 0;
    if (scene.kind === 'wake') placeActor(actor, 'sitting', LUXURY_MARGO_PLACEMENTS.wakeSit);
    else placeActor(actor, 'standing', LUXURY_MARGO_PLACEMENTS.bedside);
    setObjective('Talk with Margo');
    advanceTurn();
  };

  const makeTurns = (definition) => {
    const turns = [];
    definition.lines.forEach((line, index) => {
      turns.push({ margo: true, text: line, cue: `vo.${definition.vo}.${index + 1}` });
      const reply = definition.replies?.[index];
      if (reply) turns.push({ margo: false, text: reply, cue: `vo.${definition.vo}.tony.${index + 1}` });
    });
    return turns;
  };

  const beginEntryWalk = () => {
    if (!scene) return;
    scene.phase = 'walk';
    scene.definition = scene.bedroomDefinition;
    scene.path = LUXURY_MARGO_ENTRY_PATH;
    scene.distance = 0;
    scene.walkTime = 0;
    actor.setPose('standing');
    setWalkPose(actor, sampleLuxuryMargoPath(scene.path, 0), 0);
    setObjective('Follow Margo upstairs');
  };

  const beginArrivalTalk = () => {
    if (!scene?.arrivalDefinition?.lines?.length) {
      beginEntryWalk();
      return;
    }
    scene.phase = 'arrival-talk';
    scene.definition = scene.arrivalDefinition;
    scene.turns = makeTurns(scene.definition);
    scene.turn = -1;
    scene.hold = 0;
    actor.setPose('standing');
    setWalkPose(actor, sampleLuxuryMargoPath(LUXURY_MARGO_ENTRY_PATH, 0), 0);
    setObjective('Talk with Margo');
    advanceTurn();
  };

  const start = (kind, definition, ask = null, arrivalDefinition = null) => {
    if (scene || !definition?.lines?.length) return false;
    checkpointState = null;
    stopSnoring();
    dress.reset();
    actor.hush?.();
    actor.setDressGlue(0);
    actor.setDressHelpProgress(0);
    actor.group.visible = true;
    scene = {
      kind,
      definition,
      bedroomDefinition: definition,
      arrivalDefinition,
      ask,
      phase: null,
      turns: makeTurns(definition),
      turn: -1,
      hold: 0,
      awaitingHelp: false,
      path: kind === 'comeHome' ? LUXURY_MARGO_ENTRY_PATH : null,
      distance: 0,
      walkTime: 0,
      elevatorOpened: kind === 'comeHome',
    };
    if (kind === 'comeHome') {
      openElevator();
      beginArrivalTalk();
    } else {
      placeActor(actor, 'lying', LUXURY_MARGO_PLACEMENTS.bed);
      beginTalk();
    }
    return true;
  };

  const snapshot = () => {
    const position = actor.group.position;
    const pathProgress = checkpointState?.pathProgress
      ?? (scene?.path
        ? sampleLuxuryMargoPath(scene.path, scene.distance).progress
        : 0);
    return {
      checkpoint: checkpointState?.id ?? null,
      kind: scene?.kind ?? (snoring ? 'stayover' : null),
      phase: checkpointState?.phase ?? scene?.phase ?? (snoring ? 'sleep' : null),
      pose: actor.pose,
      visible: actor.group.visible,
      position: [position.x, position.y, position.z],
      yaw: actor.group.rotation.y,
      pathProgress,
      awaitingHelp: Boolean(scene?.awaitingHelp),
      dressActive: dress.active,
      snoring: {
        active: snoring,
        plays: snorePlays,
        nextIn: snoreIn,
      },
    };
  };

  const resetCheckpointPresentation = () => {
    scene = null;
    checkpointState = null;
    dress.reset();
    actor.hush?.();
    actor.setDressGlue(0);
    actor.setDressHelpProgress(0);
    clearFocus();
    stopSnoring();
    closeElevator();
    setObjective(null);
  };

  const stageCheckpoint = (id) => {
    if (!MARGO_CHECKPOINTS.has(id)) throw new RangeError(`Unknown luxury Margo checkpoint: ${id}`);
    resetCheckpointPresentation();
    actor.group.visible = true;

    if (id === LUXURY_MARGO_CHECKPOINT_IDS.ENTRANCE) {
      actor.setPose('standing');
      const sample = sampleLuxuryMargoPath(LUXURY_MARGO_ENTRY_PATH, ENTRANCE_CHECKPOINT_DISTANCE);
      setWalkPose(actor, sample, 0);
      openElevator();
      checkpointState = { id, phase: 'entrance', pathProgress: sample.progress };
    } else if (id === LUXURY_MARGO_CHECKPOINT_IDS.STAIRS) {
      actor.setPose('standing');
      const sample = sampleLuxuryMargoPath(LUXURY_MARGO_ENTRY_PATH, STAIR_CHECKPOINT_DISTANCE);
      setWalkPose(actor, sample, 1.1);
      checkpointState = { id, phase: 'stairs', pathProgress: sample.progress };
    } else if (id === LUXURY_MARGO_CHECKPOINT_IDS.UPSTAIRS_DRESS) {
      placeActor(actor, 'kneeling', LUXURY_MARGO_PLACEMENTS.dress);
      actor.setDressHelpProgress(4 / 7);
      checkpointState = { id, phase: 'dress-help', pathProgress: 1 };
    } else if (id === LUXURY_MARGO_CHECKPOINT_IDS.SLEEP) {
      actor.setDressGlue(1);
      placeActor(actor, 'lying', LUXURY_MARGO_PLACEMENTS.bed);
      checkpointState = { id, phase: 'sleep', pathProgress: 1 };
      startSnoring();
    } else {
      actor.setPose('standing');
      const distance = EXIT_METRICS.total * DEPARTURE_CHECKPOINT_PROGRESS;
      const sample = sampleLuxuryMargoPath(LUXURY_MARGO_EXIT_PATH, distance);
      setWalkPose(actor, sample, 2.2);
      openElevator();
      checkpointState = { id, phase: 'morning-departure', pathProgress: sample.progress };
    }

    actor.group.updateMatrixWorld?.(true);
    return snapshot();
  };

  const clearCheckpoint = () => {
    resetCheckpointPresentation();
    actor.group.visible = false;
    return snapshot();
  };

  const updateWalk = (dt) => {
    scene.walkTime += dt;
    scene.distance += WALK_SPEED * dt;
    const sample = sampleLuxuryMargoPath(scene.path, scene.distance);
    setWalkPose(actor, sample, scene.walkTime * 5.4);
    if (scene.kind === 'comeHome' && sample.progress > 0.10 && scene.elevatorOpened) {
      closeElevator();
      scene.elevatorOpened = false;
    }
    if (scene.kind === 'wake' && sample.progress > 0.90 && !scene.elevatorOpened) {
      openElevator();
      scene.elevatorOpened = true;
    }
    if (sample.progress < 1) return;
    if (scene.kind === 'comeHome') {
      beginTalk();
      return;
    }
    closeElevator();
    actor.group.visible = false;
    actor.hush?.();
    clearFocus();
    scene = null;
    setObjective(null);
    hud?.say?.('<em>Gone.</em> The flat is quiet again.', 4400);
    onWakeDone();
  };

  return {
    startComeHome: (definition, ask, arrivalDefinition) => start(
      'comeHome', definition, ask, arrivalDefinition,
    ),
    startWake: (definition, ask = null) => start('wake', definition, ask),
    interact() {
      if (!scene?.awaitingHelp || dress.active) return false;
      const started = dress.start();
      if (started) hud?.say?.('Time it and pull. <em>Seven clean catches.</em>', 4400);
      return started;
    },
    press() { return dress.press(); },
    abandon() {
      if (dress.active) return dress.abandon();
      return false;
    },
    update(dt) {
      const safeDt = Math.max(0, Math.min(Number(dt) || 0, 0.1));
      updateSnoring(safeDt);
      if (!scene) return;
      if (dress.active) {
        hud?.setTiming?.(dress.update(safeDt));
        return;
      }
      if (scene.phase === 'walk') {
        updateWalk(safeDt);
        return;
      }
      if (scene.phase === 'talk' || scene.phase === 'arrival-talk') {
        scene.hold -= safeDt;
        if (scene.hold <= 0) advanceTurn();
      }
    },
    stageForPhase(phase) {
      if (scene) return false;
      checkpointState = null;
      const stays = phase === 'stayover';
      actor.group.visible = stays;
      if (stays) {
        actor.setDressGlue(1);
        placeActor(actor, 'lying', LUXURY_MARGO_PLACEMENTS.bed);
        startSnoring();
      } else {
        actor.hush?.();
        stopSnoring();
      }
      return true;
    },
    get active() { return Boolean(scene); },
    get dressActive() { return dress.active; },
    get awaitingHelp() { return Boolean(scene?.awaitingHelp); },
    get objective() { return objective; },
    get debug() {
      return {
        scene,
        dress,
        actor,
        pathMetrics: { entry: ENTRY_METRICS, exit: EXIT_METRICS },
        snapshot,
        stageCheckpoint,
        clearCheckpoint,
      };
    },
  };
}
