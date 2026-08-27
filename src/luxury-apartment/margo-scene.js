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

  const setObjective = (next) => {
    objective = next;
    onObjectiveChange(next);
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
    if (scene.kind === 'comeHome' && scene.ask?.lines?.[0]) {
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

  const start = (kind, definition, ask = null) => {
    if (scene || !definition?.lines?.length) return false;
    dress.reset();
    actor.hush?.();
    actor.setDressGlue(0);
    actor.setDressHelpProgress(0);
    actor.group.visible = true;
    scene = {
      kind,
      definition,
      ask,
      phase: kind === 'comeHome' ? 'walk' : 'talk',
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
      actor.setPose('standing');
      setWalkPose(actor, sampleLuxuryMargoPath(scene.path, 0), 0);
      setObjective('Follow Margo upstairs');
    } else {
      placeActor(actor, 'lying', LUXURY_MARGO_PLACEMENTS.bed);
      beginTalk();
    }
    return true;
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
    hud?.say?.('<em>Gone.</em> The flat is quiet and today is the day.', 4400);
    onWakeDone();
  };

  return {
    startComeHome: (definition, ask) => start('comeHome', definition, ask),
    startWake: (definition) => start('wake', definition),
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
      if (!scene) return;
      if (dress.active) {
        hud?.setTiming?.(dress.update(safeDt));
        return;
      }
      if (scene.phase === 'walk') {
        updateWalk(safeDt);
        return;
      }
      if (scene.phase === 'talk') {
        scene.hold -= safeDt;
        if (scene.hold <= 0) advanceTurn();
      }
    },
    stageForPhase(phase) {
      if (scene) return false;
      const stays = phase === 'stayover';
      actor.group.visible = stays;
      if (stays) placeActor(actor, 'lying', LUXURY_MARGO_PLACEMENTS.bed);
      else actor.hush?.();
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
      };
    },
  };
}
