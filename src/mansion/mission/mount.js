import { makeCase } from '../../silvercase/props/case.js';
import { createSilentSquatchMission } from './SilentSquatchMission.js';
import { createMissionHud } from './hud.js';
import { S } from './SilentSquatchStateMachine.js';
import { LAB_DOOR_CODE } from '../script.js';

/**
 * PROJECT SILENT SQUATCH — the browser wiring.
 *
 * Everything in this file is a wire between the mission (which knows nothing
 * about meshes) and Lou's mansion (which knows nothing about the mission).
 * It owns exactly four things:
 *
 *   1. THE CASE IN HIS HANDS. The same chrome briefcase The Silver Case ends
 *      with — `src/silvercase/props/case.js`, the actual module, per the
 *      spec's own instruction to reuse it. One copy carried at the bottom of
 *      frame, one copy in the world; only ever one of them visible.
 *   2. The interactions the player presses: the desk, the bust, the transfer
 *      table, the keypad and the switch under the red cover.
 *   3. The keypad the player actually types 6969 into.
 *   4. The trigger pull that has to find Aubbie.
 *
 * `mountSilentSquatch` returns null if the environment build has not published
 * a laboratory yet, and the house stays exactly the walkable, mission-less
 * tour it was — which is what keeps `npm run verify:mansion` honest while the
 * two halves of this mission are built in parallel.
 */

const ZONE_RADIUS = 3.2;

/** Where the upstairs cast stand, if nobody has told us. These are the house's
 * own room anchors, so beat 1 populates the rooms that exist today. */
function defaultZones(anchors) {
  if (!anchors) return {};
  const at = (v, r = ZONE_RADIUS) => (v ? { x: v.x, z: v.z, r } : null);
  const zones = {
    rippin: at(anchors.loungeCenter),
    eric: at(anchors.diningTable),
    shubes: at(anchors.galleryCenter),
    snow: at(anchors.foyerCenter),
    office: at(anchors.officeDesk, 4),
    cellar: at(anchors.armoryCenter, 5),
  };
  for (const key of Object.keys(zones)) if (!zones[key]) delete zones[key];
  return zones;
}

export function mountSilentSquatch({
  THREE,
  scene,
  camera,
  interaction,
  player,
  audio = null,
  story = null,
  lab,
  anchors = null,
  targets = {},
  enabled = () => true,
  autoStart = true,
} = {}) {
  if (!lab || !THREE || !scene || !camera) return null;

  const hud = createMissionHud();

  /* ---------------- the case ---------------- */
  const carried = makeCase({ x: 0, y: 0, z: 0 });
  carried.group.name = 'silentSquatchCarriedCase';
  carried.group.scale.setScalar(0.72);
  carried.group.position.set(-0.32, -0.36, -0.64);
  carried.group.rotation.set(0.12, 0.5, 0.28);
  carried.group.visible = false;
  camera.add(carried.group);

  const world = makeCase({ x: 0, y: 0, z: 0 });
  world.group.name = 'silentSquatchWorldCase';
  world.group.visible = false;
  scene.add(world.group);

  const worldPos = (object, fallback) => {
    if (object?.getWorldPosition) return object.getWorldPosition(new THREE.Vector3());
    if (object?.isVector3) return object.clone();
    return fallback ? fallback.clone() : new THREE.Vector3();
  };

  function putCaseOn(object, fallback) {
    const at = worldPos(object, fallback);
    world.group.position.copy(at);
    world.group.visible = true;
    carried.group.visible = false;
  }

  function onCase(what) {
    switch (what) {
      case 'carry':
        carried.group.visible = true;
        world.group.visible = false;
        world.close({ instant: true });
        break;
      case 'desk':
        putCaseOn(targets.desk, anchors?.officeDesk);
        break;
      case 'table':
        putCaseOn(targets.transferTable, lab.anchors?.transferTable);
        break;
      case 'open': world.open(); break;
      case 'close': world.close(); break;
      case 'slide':
        /* Lou pushes it back across the desk toward him. */
        world.group.position.z += 0.35;
        break;
      case 'gone':
        world.group.visible = false;
        carried.group.visible = false;
        break;
      default: break;
    }
  }

  /* ---------------- the mission ---------------- */
  const mission = createSilentSquatchMission({
    lab,
    story,
    hud: {
      setObjective: (text) => hud.setObjective(text),
      setInstruction: (text) => hud.setInstruction(text, {
        urgent: /AIM|SILENT NIGHT/i.test(text || ''),
      }),
      setCallout: (text) => hud.setCallout(text),
    },
    zones: { ...defaultZones(anchors), ...(lab.anchors ? labZones(lab) : {}) },
    onLine: (line) => hud.showLine(line),
    onLineEnd: () => hud.hideLine(),
    onCase,
    playCue: (cue) => {
      /* A dry line, from somebody standing in the room. Cue names are data
       * here, never a literal at a call site: none of this mission's cues have
       * been generated yet (see tests/silent-squatch-voice.test.mjs), so this
       * is silence plus a subtitle until they are, which is the game's own
       * silence-over-synthesis convention. */
      if (audio?.hasSample?.(cue)) audio.play(cue);
    },
  });

  function labZones(theLab) {
    const a = theLab.anchors ?? {};
    const out = {};
    for (const id of ['bust', 'corridor', 'xxx', 'observation', 'stairs', 'cellarTop', 'cellar']) {
      const v = a[id];
      if (v && Number.isFinite(v.x) && Number.isFinite(v.z)) {
        out[id] = { x: v.x, z: v.z, r: v.r ?? ZONE_RADIUS };
      }
    }
    return out;
  }

  /* ---------------- what the player presses ---------------- */
  const at = (name) => mission.fsm.name === name || mission.fsm.pending === name;
  const register = (mesh, config) => {
    if (!mesh || !interaction?.register) return;
    interaction.register(mesh, { enabled: () => enabled(), ...config });
  };

  register(targets.desk ?? null, {
    label: () => (at(S.LOU_OFFICE) ? 'Set the <b>case</b> on the desk' : 'Lou’s desk'),
    onUse: () => mission.placeCaseOnDesk() || mission.takeCaseBack(),
  });
  register(targets.bust ?? null, {
    label: 'Reach <b>under</b> the bust',
    onUse: () => mission.pressBustSwitch(),
  });
  register(targets.transferTable ?? null, {
    label: () => (mission.caseState === 'carried'
      ? 'Set the <b>case</b> on the transfer table'
      : 'Transfer table'),
    onUse: () => mission.deliverCase(),
  });
  register(targets.keypad ?? null, {
    label: 'Use the <b>keypad</b>',
    onUse: () => openKeypad(),
  });
  register(targets.silentNight ?? null, {
    label: '<b>SILENT NIGHT PROTOCOL</b>',
    hold: 0.9,
    onUse: () => mission.pullSilentNight(),
  });

  /* ---------------- the keypad ---------------- */
  let digits = '';
  function openKeypad() {
    if (!at(S.LOCK_THE_LAB)) return false;
    digits = '';
    hud.openKeypad();
    return true;
  }
  function closeKeypad() {
    digits = '';
    hud.closeKeypad();
  }
  /**
   * Keys, while the keypad is up. Returns true if the key was consumed, so
   * the scene knows not to also walk the player around with it.
   */
  function keydown(event) {
    if (!hud.keypadOpen) return false;
    if (event.key === 'Escape') { closeKeypad(); return true; }
    if (event.key === 'Backspace') {
      digits = digits.slice(0, -1);
      hud.setKeypadDigits(digits);
      return true;
    }
    if (/^[0-9]$/.test(event.key)) {
      if (digits.length < 8) digits += event.key;
      hud.setKeypadDigits(digits);
      return true;
    }
    if (event.key === 'Enter') {
      const ok = mission.enterCode(digits);
      if (ok) { closeKeypad(); return true; }
      hud.setKeypadDigits(digits, { bad: true });
      digits = '';
      return true;
    }
    return false;
  }

  /* ---------------- the shot ---------------- */
  const ray = new THREE.Raycaster();
  const centre = new THREE.Vector2(0, 0);
  /**
   * Did that trigger pull find him?
   *
   * The mission does not decide this — the crosshair does. The lab is asked
   * for something to aim at, in order of preference: a mesh, then a position.
   * If it publishes neither, the shot is accepted rather than leaving the
   * player in a locked room with an order he cannot carry out, and the debug
   * report says the aim was never resolved.
   */
  let aimResolved = 'unresolved';
  function aubbieHit() {
    const body = lab.scientists?.[0] ?? null;
    const mesh = lab.aubbieTarget ?? body?.object ?? body?.group ?? body?.mesh ?? null;
    if (mesh) {
      aimResolved = 'mesh';
      ray.setFromCamera(centre, camera);
      return ray.intersectObject(mesh, true).length > 0;
    }
    const point = body?.position ?? lab.anchors?.aubbie ?? null;
    if (point && Number.isFinite(point.x)) {
      aimResolved = 'position';
      const to = new THREE.Vector3(point.x, point.y ?? camera.position.y, point.z)
        .sub(camera.position).normalize();
      const forward = camera.getWorldDirection(new THREE.Vector3());
      return forward.dot(to) > 0.985; // about five degrees
    }
    aimResolved = 'unresolved';
    return true;
  }

  /** A left click. Returns true if the mission took it as the execution. */
  function fire() {
    if (!at(S.EXECUTION)) return false;
    return mission.shootAubbie(aubbieHit());
  }

  if (autoStart) mission.start();

  return {
    mission,
    hud,
    keydown,
    fire,
    openKeypad,
    closeKeypad,
    update(dt) {
      mission.update(dt, { position: player?.position ?? camera.position });
      carried.update(dt);
      world.update(dt);
    },
    /** The headless surface, hung off window.mansion by the composition root. */
    debug: {
      get beat() { return mission.fsm.beat; },
      get state() { return mission.fsm.name; },
      get objective() { return mission.objective; },
      get instruction() { return mission.instruction; },
      get aimResolved() { return aimResolved; },
      code: LAB_DOOR_CODE,
      report: () => mission.report(),
      hud: () => hud.text(),
      arrive: (zone) => mission.arrive(zone),
      placeCase: () => mission.placeCaseOnDesk(),
      takeCase: () => mission.takeCaseBack(),
      bustSwitch: () => mission.pressBustSwitch(),
      deliver: () => mission.deliverCase(),
      enterCode: (code) => mission.enterCode(code),
      shoot: (hit = true) => mission.shootAubbie(hit),
      silentNight: () => mission.pullSilentNight(),
      leave: () => mission.leave(),
    },
  };
}
