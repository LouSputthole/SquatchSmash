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
  /* Told when the MISSION gives him the case or takes it away, so the scene's
   * inventory can hold a slot for it. Not told about stowing -- that is the
   * player's half and the inventory is the thing doing it. */
  onCaseOwned = () => {},
  /**
   * Booski putting a pistol in his hand at the delivery (owner playtest).
   *
   * A weapon is the house's business, not the mission's — `main.js` owns the
   * WeaponSystem, the armory and the inventory bar, and this file has never
   * heard of any of them. So the mission says "a man handed him a sidearm"
   * and the composition root decides what that means, which is the same
   * split `onCase` already uses.
   */
  onSidearm = () => {},
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

  /**
   * THE CASE IN THE WORLD IS THE LAB'S CASE.
   *
   * Owner playtest: there was a second case already sitting on the transfer
   * table before he had delivered anything. There was, and there were THREE
   * briefcases in this mission, not two:
   *
   *   1. `carried`, at the bottom of frame — this file's.
   *   2. a `world` copy this file built and moved between the desk, the
   *      table and under the desk.
   *   3. `lab.case`, which `SilentSquatch.js` builds AND PLACES ON THE
   *      TRANSFER TABLE AT BUILD TIME, visible from the moment the player
   *      first sees the observation area.
   *
   * Number 3 is the one with the gold-and-purple internal lights, the hum,
   * the `brighten()` the brief asks for and the handle `verify:mansion`
   * measures. Number 2 had none of that and was the one the mission actually
   * moved — so the case the player carried in was a dead prop, the case that
   * glows was scenery, and both of them were on the table at once.
   *
   * One object now. `lab.case` starts hidden (see SilentSquatch.js) and this
   * file drives it, which also means Booski opening it on the table is the
   * beat with the sound and the glow on it rather than a lid turning.
   */
  const world = {
    group: lab.case.group,
    open: () => lab.case.open(),
    close: (opts) => lab.case.close(opts),
  };

  const worldPos = (object, fallback) => {
    if (object?.getWorldPosition) return object.getWorldPosition(new THREE.Vector3());
    if (object?.isVector3) return object.clone();
    if (Number.isFinite(object?.x)) return new THREE.Vector3(object.x, object.y ?? 0, object.z);
    if (fallback?.clone) return fallback.clone();
    if (Number.isFinite(fallback?.x)) return new THREE.Vector3(fallback.x, fallback.y ?? 0, fallback.z);
    return new THREE.Vector3();
  };

  /* TWO SEPARATE FACTS, and the carried model is visible only when both hold.
   *
   *   caseOwned  -- the MISSION says he has it (`onCase('carry')`)
   *   caseInHand -- the PLAYER has its inventory slot selected
   *
   * Before the house had an inventory there was only the first, so the case
   * rode in your hands from the gate to the office whether you wanted it or
   * not. Collapsing them back into one boolean is how you get either a case
   * that jumps into your hands the instant a beat fires, or a mission that
   * cannot take the case off you because the player put it away. */
  let caseOwned = false;
  let caseInHand = true;
  let caseOwnedLast = null;
  const refreshCarried = () => {
    carried.group.visible = caseOwned && caseInHand;
    /* Told once per change, not once per call: the inventory adds and removes
     * a slot off the back of this, and re-adding a slot he already has would
     * move his selection out from under his thumb. */
    if (caseOwned !== caseOwnedLast) {
      caseOwnedLast = caseOwned;
      onCaseOwned(caseOwned);
    }
  };

  function putCaseOn(object, fallback) {
    const at = worldPos(object, fallback);
    world.group.position.copy(at);
    world.group.visible = true;
    caseOwned = false;
    refreshCarried();
  }

  function onCase(what) {
    switch (what) {
      case 'carry':
        caseOwned = true;
        refreshCarried();
        world.group.visible = false;
        world.close({ instant: true });
        break;
      /* WHERE IT LANDS IS NOT WHERE IT IS CLICKED.
       *
       * `targets.desk` is the desk GROUP, whose origin is on the floor at
       * UY — so "put the case on the desk" put it through the pedestal and
       * onto the boards, 830 mm below the writing surface and 1.4 m from
       * where the anchor said. `targets.transferTable` is the wall DRAWER's
       * aim box, so the delivered case appeared floating in the wall beside
       * the drawer rather than on the table Booski opens it on.
       *
       * Both are correct as things to POINT AT and wrong as places to put
       * something down. The scene publishes a surface point for each
       * (`deskSpot`, `tableSpot`); the click target stays the fallback so a
       * scene that has not grown one yet still works. */
      case 'desk':
        putCaseOn(targets.deskSpot ?? targets.desk, anchors?.officeDesk);
        break;
      case 'table':
        putCaseOn(targets.tableSpot ?? targets.transferTable, lab.anchors?.transferTable);
        break;
      case 'open': world.open(); break;
      case 'close': world.close(); break;
      case 'slide':
        /* Lou pushes it back across the desk toward him. */
        world.group.position.z += 0.35;
        break;
      /* Owner's note: "Case goes under the desk when I deliver it." Lou does
       * not leave a case that came out of that basement sitting on his desk
       * for the rest of the night -- it goes down by his feet, out of the
       * room's sightline, and stays a solid object the player can still find.
       * Dropped to the floor and pushed under, rather than hidden: `gone`
       * already exists for things that stop existing. */
      case 'stash': {
        const desk = worldPos(targets.deskSpot ?? targets.desk, anchors?.officeDesk);
        world.group.position.set(desk.x, Math.max(0.14, desk.y - 0.78), desk.z + 0.22);
        world.group.rotation.y = 0.22;
        world.close({ instant: true });
        world.group.visible = true;
        caseOwned = false;
        refreshCarried();
        break;
      }
      case 'gone':
        world.group.visible = false;
        caseOwned = false;
        refreshCarried();
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
    onSidearm,
    playCue: (cue, voice, gain = 1) => {
      /* A dry line, from somebody standing in the room. Cue names are data
       * here, never a literal at a call site.
       *
       * THIS COMMENT USED TO SAY the mission's cues "have not been generated
       * yet", so this was "silence plus a subtitle until they are". That
       * stopped being true at some point and nobody updated it — 175 of the
       * 191 are recorded — and the stale note is a good part of why the scene
       * was played in silence for so long without anybody chasing it.
       *
       * Returns the take's length so the line holds for the recording rather
       * than for an authored guess. See `DialogueController._advance`.
       *
       * `gain` is the speaker's PROFILE gain, handed down by the mission from
       * `VOICE_GAIN` in ../script.js — the owner's "Aubbie volume +20%" note.
       * Applied here rather than baked into a take so it reaches his
       * unrecorded lines too. */
      if (!audio?.hasSample?.(cue)) return 0;
      audio.play(cue, { volume: gain });
      return audio.sampleDuration?.(cue) ?? 0;
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
    /* `isObject3D`, not truthiness. A target published as a coordinate --
     * `{x, y, z}` for placing something on rather than a thing to aim at --
     * passes a truthy check and then dies inside the interaction system
     * setting `userData.interact` on undefined, taking the whole mount with
     * it. An absent target is meant to be skipped, and so is a wrong one. */
    if (!mesh?.isObject3D || !interaction?.register) return;
    interaction.register(mesh, { enabled: () => enabled(), ...config });
  };

  register(targets.desk ?? null, {
    label: () => (at(S.LOU_OFFICE) ? 'Set the <b>case</b> on the desk' : 'Lou’s desk'),
    onUse: () => mission.placeCaseOnDesk() || mission.takeCaseBack(),
  });
  /* The bust switch belongs to the house, not to the mission.
   *
   * `interaction.register` writes `userData.interact`, so registering the same
   * mesh twice does not add a handler -- it REPLACES one. The environment
   * already wires this switch to open the wall, and the mission overwriting it
   * meant the secret door stopped working entirely outside the one beat the
   * mission gates it on: the switch prompted, the player pressed it, and two
   * tonnes of masonry sat still. The whole basement was behind that.
   *
   * So the mission's handler runs first and, whether or not this is its beat,
   * the house still opens its own door afterwards. The mission advances when
   * it is meant to and the door works when it is not. */
  const houseWall = lab?.hiddenWall ?? null;
  register(targets.bust ?? null, {
    label: 'Reach <b>under</b> the bust',
    onUse: () => {
      mission.pressBustSwitch();
      if (houseWall && !houseWall.isOpen) houseWall.open();
    },
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
      /* PLUS 1.4, because `body.position` is a figure's ORIGIN, which is the
       * floor between his feet. Aiming the cone there asked the player to put
       * the crosshair on a pair of shoes to carry out an execution. This
       * branch is now the fallback of a fallback — the lab publishes
       * `aubbieTarget` — but a fallback that is wrong is worse than no
       * fallback, because it is the one that runs when everything else has
       * already failed. */
      const to = new THREE.Vector3(point.x, (point.y ?? camera.position.y) + 1.4, point.z)
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
    /**
     * The player's half of "is the case in his hands".
     *
     * Called by the inventory when the case's slot is selected or left. It
     * cannot make him hold a case the mission has taken off him -- that is
     * `caseOwned`, and it stays the mission's alone.
     */
    setCaseInHand(on) {
      caseInHand = Boolean(on);
      refreshCarried();
    },
    /** True while the mission says he is carrying it, stowed or not. */
    get carryingCase() { return caseOwned; },
    /** Put it under Lou's desk. Owner's note; also reachable from the script. */
    stashCase() { onCase('stash'); },
    update(dt) {
      mission.update(dt, { position: player?.position ?? camera.position });
      carried.update(dt);
      /* The world copy is NOT ticked here any more: it is `lab.case`, and
       * `SilentSquatch.js` already calls `caseObj.update(dt)` in its own
       * update. Ticking it twice would run its lid tween at double speed —
       * and the adapter above has no `update` to call, which is how this was
       * found: `world.update is not a function`, thrown out of the render
       * loop on the first frame. */
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
