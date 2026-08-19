import { makeCase } from '../../silvercase/props/case.js';
import { createSilentSquatchMission } from './SilentSquatchMission.js';
import { createMissionHud } from './hud.js';
import { S } from './SilentSquatchStateMachine.js';
import { LAB_DOOR_CODE, SCIENTIST_INDEX } from '../script.js';

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
const ZONE_VERTICAL_TOLERANCE = 1.2;
const ARRIVAL_SPEAKERS = new Set(['rippin', 'eric', 'shubes', 'snow']);
const HOUSE_SPEAKER_IDS = Object.freeze({
  GATE: 'gateMan',
  BOOTH: 'booth',
  BARTENDER: 'bartender',
  SNOW: 'snow',
  GRATIN: 'gratin',
  LOU: 'lou',
  BOOSKI: 'booski',
  DEATHMEGATRON: 'deathmegatron',
  IRISH: 'irish',
  RIPPIN: 'rippin',
  ERIC: 'eric',
  SHUBES: 'shubes',
  SASOLE: 'sasole',
  NUMBSKULL: 'numbskull',
  HOGMAMA: 'hogmama',
});

/** Where the upstairs cast stand, if nobody has told us. These are the house's
 * own room anchors, so beat 1 populates the rooms that exist today. */
function defaultZones(anchors) {
  if (!anchors) return {};
  const at = (v, r = ZONE_RADIUS, verticalTolerance = ZONE_VERTICAL_TOLERANCE) => (v ? {
    x: v.x,
    ...(Number.isFinite(v.y) ? { y: v.y, verticalTolerance } : {}),
    z: v.z,
    r,
  } : null);
  const zones = {
    rippin: at(anchors.loungeCenter),
    eric: at(anchors.diningTable),
    shubes: at(anchors.galleryCenter),
    snow: at(anchors.foyerCenter),
    office: at(anchors.officeDesk, 4),
    /* THE SAME SPOT, UNDER A SECOND NAME. Beat 11 sends him back to Lou and
     * `arrive()` fires each id exactly once, so walking into the office at the
     * end of the night on the `office` id would be swallowed by the visit he
     * made at the start of it. Two ids, one room, one anchor. */
    officeReturn: at(anchors.officeDesk, 4),
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
  speechGate = null,
  story = null,
  lab,
  anchors = null,
  targets = {},
  enabled = () => true,
  autoStart = true,
  missionHud = null,
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
  /**
   * Booski calling Snow down to the basement (owner playtest: he has clean-up
   * lines about the laboratory and was never in it).
   *
   * A man with a cart is `../cast.js`'s, and this file has never heard of him.
   * The composition root supplies the verb, exactly as it does for the pistol
   * and for the hand-off; a house with no cast simply plays the exchange with
   * nobody arriving, which is what it did before.
   */
  onSnowSummoned = () => {},
} = {}) {
  if (!lab || !THREE || !scene || !camera) return null;

  const hud = missionHud ?? createMissionHud();

  /* ---------------- the case ---------------- */
  const carried = makeCase({ x: 0, y: 0, z: 0 });
  carried.group.name = 'silentSquatchCarriedCase';
  carried.group.userData.geometryGate = {
    assemblyId: 'silent-squatch-carried-case-viewmodel',
    overlap: false,
    checkSupport: false,
  };
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

  /* ---------------- what is inside it ----------------
   *
   * Owner playtest, 2026-08-06: *"Lou opens the case toward himself, with the
   * purple-and-gold glow effect."* The case had no contents at all —
   * `src/silvercase/props/case.js` says so in its own header ("No interior
   * objects are ever built") — so opening it produced a lid and two small
   * interior lights on an empty chrome tray, twice, in the two beats the whole
   * mission is about.
   *
   * IT IS NOT A NEW EFFECT. The Squatchanium container is already built by
   * `scenes/SilentSquatch.js` — the purple energy band under its shielding,
   * the pulsing gold core deeper in, and the vapour curling off the casing,
   * all of them already animated by that module's own update loop — and its
   * own comment says "Sits in the case until it is lifted out." It never did.
   * It was built hidden on the transfer table and only ever appeared when the
   * drawer sent it through the wall, so the thing the case is carrying was
   * invisible for the entire journey it is carried on.
   *
   * So the case shows what is in it: the container, seated in the tray, from
   * the moment a lid comes up until it closes again. Purple and gold, out of
   * the module that owns them. */
  const contents = lab.container ?? null;
  function showContents(on) {
    if (!contents?.group) return;
    if (!on) {
      contents.group.visible = false;
      return;
    }
    const at = world.group.position;
    /* In the tray, on the case's own hinge line, so the lid comes up behind
     * it and the glow reads against the chrome rather than past it. */
    contents.placeAt(at.x, at.y + 0.02, at.z);
    contents.group.visible = true;
  }

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

  /** Where the case is when it leaves him: chest height, an arm in front. */
  function handsPosition() {
    const eye = player?.position ?? camera.position;
    const forward = camera.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    return new THREE.Vector3(eye.x, eye.y - 0.45, eye.z).addScaledVector(forward, 0.5);
  }

  /* ---------------- setting it down ----------------
   *
   * Owner playtest, 2026-08-06: *"Case hand-off: prompt floats at a random
   * spot near Booski. Walk up to Booski, hit E, case auto-places on the
   * table."*
   *
   * TWO HALVES, and only one of them is this block. The prompt moved onto
   * Booski's own body (`src/mansion/cast.js` — he is the man you talk to, and
   * a floating E over a patch of basement is not a hand-off). This half is
   * what happens after the press: the case LEAVES HIS HANDS AND ARRIVES ON
   * THE TABLE, travelling, rather than teleporting out of shot and existing
   * on a surface a metre and a half away on the next frame.
   *
   * It is a placement, not a physics throw: 0.55 s from where the man is
   * standing to the anchor the scene publishes, on a shallow arc with the lid
   * levelling out, so the eye follows the object and knows where it went. The
   * destination is exactly `targets.tableSpot` — the anchor — so "did the case
   * end up on the table" stays a coordinate comparison for the verifier
   * rather than a question about an animation.
   */
  const PLACE_SECONDS = 0.55;
  /** null, or a placement in flight. `to` is the anchor, and it always wins. */
  let placing = null;

  function putCaseOn(object, fallback, { animate = false, from = null } = {}) {
    const at = worldPos(object, fallback);
    world.group.visible = true;
    caseOwned = false;
    refreshCarried();
    if (!animate) {
      placing = null;
      world.group.position.copy(at);
      return at;
    }
    /* From his hands. `from` is the player, and the case starts at chest
     * height in front of him rather than at his feet -- `player.position` is
     * the eye, so this is the object he was holding, not the ground he was
     * standing on. */
    const start = from?.isVector3 ? from.clone() : worldPos(from, at);
    world.group.position.copy(start);
    placing = { from: start, to: at.clone(), t: 0 };
    return at;
  }

  /* ---------------- turning it round ----------------
   *
   * Owner playtest: *"Lou opens the case toward himself."*
   *
   * The script has always had the stage direction — `officeOpen` opens with
   * `{ stage: 'lou.rotate' }`, and its comment says "Lou turns it to face
   * himself, the locks let go, and the gold and the purple come up out of it
   * and across the walls, his cigar smoke, and his hands". Nothing performed
   * it: the mission hands an unknown stage to `onStage`, and this file never
   * passed one in, so the case sat exactly as the player had put it down and
   * opened away from the man it belongs to.
   *
   * The prop's front is its LATCH side (+z, see src/silvercase/props/case.js),
   * and the lid hinges at the back and tips away from it — so whoever the
   * latches face is the one person who can see into it. Turning them to face
   * Lou therefore does both halves of the note at once.
   *
   * WHERE LOU IS, WITHOUT ASKING WHO LOU IS: he is the man on the far side of
   * his own desk, which is the side the player is not standing on. Measured
   * off the player at the moment the beat fires rather than wired to a body
   * this file has never heard of — the same reason `onSidearm` exists.
   */
  const TURN_SECONDS = 0.9;
  let turning = null;

  function turnCaseAwayFromPlayer() {
    const eye = player?.position ?? camera.position;
    /* WHERE IT IS GOING, not where it is. `lou.rotate` is the first entry in
     * `officeOpen` and the 0.55 s hand-off is still in the air when it fires,
     * so reading the live position turns the case to face away from the man
     * WHILE IT IS STILL IN HIS HANDS -- half a metre in front of his own eye,
     * where the answer is a rounding error away from meaningless. */
    const to = placing?.to ?? world.group.position;
    const dx = to.x - eye.x;
    const dz = to.z - eye.z;
    if (Math.hypot(dx, dz) < 0.05) return null;
    /* A Group's local +z points along `atan2(dx, dz)`; away from the player is
     * exactly the vector from him to the case. */
    const want = Math.atan2(dx, dz);
    const from = world.group.rotation.y;
    /* The short way round, so a 10-degree correction never spins it 350. */
    let delta = (want - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    turning = { from, delta, t: 0 };
    return +want.toFixed(3);
  }

  function updateTurning(dt) {
    if (!turning) return;
    turning.t = Math.min(1, turning.t + dt / TURN_SECONDS);
    const k = turning.t;
    world.group.rotation.y = turning.from + turning.delta * (k * k * (3 - 2 * k));
    if (k >= 1) turning = null;
  }

  /** One frame of the hand-off. Lands ON the anchor, always. */
  function updatePlacing(dt) {
    if (!placing) return;
    placing.t = Math.min(1, placing.t + dt / PLACE_SECONDS);
    const k = placing.t;
    /* Smoothstep across, and a low arc up and over so it reads as being set
     * down rather than dragged along the floor. */
    const e = k * k * (3 - 2 * k);
    world.group.position.lerpVectors(placing.from, placing.to, e);
    world.group.position.y += Math.sin(Math.PI * k) * 0.22;
    /* WHAT IS IN IT TRAVELS WITH IT. `deliveryOpen`'s very first entry is
     * `case.open`, which fires on the frame the hand-off starts — so the
     * container was being seated at the case's mid-flight position and left
     * hanging in the air over the observation-room floor while the case went
     * on to the table without it. */
    if (contents?.group?.visible) {
      contents.placeAt(
        world.group.position.x, world.group.position.y + 0.02, world.group.position.z,
      );
    }
    if (k >= 1) {
      world.group.position.copy(placing.to);
      placing = null;
      if (contents?.group?.visible) {
        contents.placeAt(
          world.group.position.x, world.group.position.y + 0.02, world.group.position.z,
        );
      }
    }
  }

  function onCase(what) {
    switch (what) {
      case 'carry':
        caseOwned = true;
        placing = null;
        refreshCarried();
        world.group.visible = false;
        world.close({ instant: true });
        showContents(false);
        /* "Whatever's in here has been humming since the car." — the
         * Prospect's own first line of the mission, and until the 2026-08-06
         * SFX pass it was not true: `lab.case.hum()` existed, was fully
         * authored as `silent.case.hum`, and nothing anywhere called it. It
         * runs while the case is in his hands and stops the moment it is not. */
        lab.case.hum?.(true);
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
        lab.case.hum?.(false);
        putCaseOn(targets.deskSpot ?? targets.desk, anchors?.officeDesk, {
          animate: true, from: handsPosition(),
        });
        break;
      case 'table':
        lab.case.hum?.(false);
        putCaseOn(targets.tableSpot ?? targets.transferTable, lab.anchors?.transferTable, {
          animate: true, from: handsPosition(),
        });
        break;
      case 'open':
        world.open();
        showContents(true);
        break;
      case 'close':
        world.close();
        showContents(false);
        break;
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
        placing = null;
        lab.case.hum?.(false);
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
        placing = null;
        lab.case.hum?.(false);
        world.group.visible = false;
        caseOwned = false;
        refreshCarried();
        break;
      default: break;
    }
  }

  /* ---------------- the mission ---------------- */
  const missionZones = { ...defaultZones(anchors), ...(lab.anchors ? labZones(lab) : {}) };
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
    zones: missionZones,
    canEnterZone: (id, position, zone) => {
      if (!speechGate || !ARRIVAL_SPEAKERS.has(id)) return true;
      return speechGate.canSpeak(id, {
        listenerPosition: position,
        range: zone.r ?? ZONE_RADIUS,
        verticalTolerance: zone.verticalTolerance ?? ZONE_VERTICAL_TOLERANCE,
      });
    },
    canIdleBark: (id) => {
      if (!speechGate) return true;
      const zone = missionZones[id] ?? {};
      return speechGate.canSpeak(id, {
        range: zone.r ?? ZONE_RADIUS,
        verticalTolerance: zone.verticalTolerance ?? ZONE_VERTICAL_TOLERANCE,
      });
    },
    onNpcBark: (id) => {
      if (ARRIVAL_SPEAKERS.has(id)) speechGate?.commit(id);
    },
    onLine: (line) => hud.showLine(line),
    onLineEnd: () => hud.hideLine(),
    onCase,
    onSidearm,
    /**
     * The stage directions the SET performs, as opposed to the ones the
     * laboratory performs (those are handled inside the mission).
     *
     * This hook existed and was never passed in, so the two directions below
     * were written into the script, played on every run, logged by the
     * dialogue controller — and did nothing at all. `lou.rotate` is the owner's
     * "opens toward himself"; `case.lift` is Booski taking the container out
     * of the case in front of the transfer drawer.
     */
    onStage: (stage) => {
      switch (stage) {
        case 'lou.rotate':
          turnCaseAwayFromPlayer();
          break;
        /* Booski has told him to bring the cart, and he brings it. The mission
         * has never heard of Snow; the composition root hands the verb down,
         * the same seam `onSidearm` and `onDeliverCase` use. */
        case 'snow.arrives':
          onSnowSummoned();
          break;
        case 'case.lift':
          /* Out of the tray and up, so the drawer has something to carry. The
           * laboratory owns the container and its own cue. */
          lab.container?.lift?.();
          if (lab.container?.placeAt) {
            const at = world.group.position;
            lab.container.placeAt(at.x, at.y + 0.16, at.z);
          }
          break;
        default:
          break;
      }
    },
    playCue: (cue, voice, gain = 1, line = null) => {
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
      const speakerId = HOUSE_SPEAKER_IDS[line?.speaker] ?? null;
      const position = speakerId ? speechGate?.position?.(speakerId) ?? null : null;
      const source = audio.play(cue, {
        volume: gain,
        ...(position ? { position, ref: 1.2, maxDist: 14 } : {}),
      });
      /* The take as well as its length, so `DialogueController.hush()` can
       * stop a line that is cut off (see there). */
      return { duration: audio.sampleDuration?.(cue) ?? 0, source };
    },
  });

  function labZones(theLab) {
    const a = theLab.anchors ?? {};
    const out = {};
    for (const id of ['bust', 'corridor', 'xxx', 'observation', 'stairs', 'cellarTop', 'cellar']) {
      const v = a[id];
      if (v && Number.isFinite(v.x) && Number.isFinite(v.z)) {
        const verticalTolerance = Number.isFinite(v.verticalTolerance)
          ? v.verticalTolerance
          : (id === 'stairs' ? 1.4 : 1.1);
        out[id] = {
          x: v.x,
          ...(Number.isFinite(v.y) ? { y: v.y, verticalTolerance } : {}),
          z: v.z,
          r: v.r ?? ZONE_RADIUS,
        };
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
   * for the body mesh. A real ray intersection record is preserved all the
   * way to the blood adapter; a cone or boolean cannot place a wound.
   */
  let aimResolved = 'unresolved';
  function aubbieHit() {
    const body = lab.scientists?.[0] ?? null;
    const mesh = lab.aubbieTarget ?? body?.object ?? body?.group ?? body?.mesh ?? null;
    if (mesh) {
      aimResolved = 'mesh';
      ray.setFromCamera(centre, camera);
      const hit = ray.intersectObject(mesh, true)[0] ?? null;
      if (!hit) return null;
      return {
        point: hit.point.clone(),
        normal: hit.face?.normal?.clone?.().transformDirection(hit.object.matrixWorld) ?? null,
        object: hit.object,
        from: camera.getWorldPosition(new THREE.Vector3()),
      };
    }
    aimResolved = 'unresolved';
    return null;
  }

  /** Preview/checkpoint staging still uses the exact hit contract, but cannot
   * depend on where a human happened to leave the camera. Organic shots never
   * call this adapter: `fire()` remains the real ray above. */
  function previewAubbieHit() {
    const aubbie = lab.scientists?.[SCIENTIST_INDEX.AUBBIE];
    const object = aubbie?.fig?.chest ?? aubbie?.object ?? lab.aubbieTarget;
    if (!object?.isObject3D) return null;
    object.updateMatrixWorld(true);
    const point = object.getWorldPosition(new THREE.Vector3());
    const from = camera.getWorldPosition(new THREE.Vector3());
    const normal = from.clone().sub(point);
    if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
    else normal.normalize();
    return { point, normal, object, from };
  }

  /** A left click. Returns true if the mission took it as the execution. */
  function fire() {
    if (!at(S.EXECUTION)) return false;
    return mission.shootAubbie(aubbieHit());
  }

  /* Player.position is the camera/eye. Lab and room anchors are floor datums.
   * Keep one allocation-free adapter at the composition boundary so the
   * mission can compare like with like; otherwise its correctly 3D trigger
   * cylinders miss the player by the standing eye height (1.66 m). */
  const missionFootPosition = { x: 0, y: 0, z: 0 };
  function playerFeet() {
    const position = player?.position ?? camera.position;
    missionFootPosition.x = position.x;
    missionFootPosition.z = position.z;
    missionFootPosition.y = Number.isFinite(player?.eyeHeight)
      ? position.y - player.eyeHeight
      : position.y;
    return missionFootPosition;
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
    /**
     * Hand the case over, from wherever the player is standing.
     *
     * Published because the man he hands it TO is built by `../cast.js`, which
     * is mounted after this and owns Booski's body. This file has never heard
     * of Booski and does not need to: the cast registers the press on him and
     * calls this, exactly the way `onSidearm` lets the mission arm a player it
     * knows nothing about. Returns false when it is not that beat, and the
     * caller says why.
     */
    deliverCase: () => mission.deliverCase(),
    /** Is the case still in his hands as far as the MISSION is concerned. */
    get caseState() { return mission.caseState; },
    update(dt) {
      mission.update(dt, { position: playerFeet() });
      carried.update(dt);
      updatePlacing(dt);
      updateTurning(dt);
      /* The hum travels with the man carrying it rather than staying where the
       * case last sat. One panner move, no restart — see `AudioEngine.moveLoop`. */
      if (caseOwned && audio?.moveLoop) audio.moveLoop('silent.case.hum', handsPosition());
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
      get zones() {
        return Object.fromEntries(Object.entries(missionZones)
          .map(([id, zone]) => [id, { ...zone }]));
      },
      resolveAubbieHit: () => aubbieHit(),
      previewAubbieHit: () => previewAubbieHit(),
      code: LAB_DOOR_CODE,
      report: () => mission.report(),
      hud: () => hud.text(),
      arrive: (zone) => mission.arrive(zone),
      placeCase: () => mission.placeCaseOnDesk(),
      takeCase: () => mission.takeCaseBack(),
      bustSwitch: () => mission.pressBustSwitch(),
      deliver: () => mission.deliverCase(),
      enterCode: (code) => mission.enterCode(code),
      shoot: (hit = null) => mission.shootAubbie(hit),
      shootPreview: () => mission.shootAubbie(previewAubbieHit()),
      silentNight: () => mission.pullSilentNight(),
      leave: () => mission.leave(),
      /** Beat 11's second leg: he walked back into the office. */
      reportToLou: () => mission.reportToLou(),
      /** Where the case actually is, in world space, and whether it is still
       * travelling. The owner's note was about WHERE it lands; this is the
       * number a check compares against `lab.targets.tableSpot`. */
      caseAt: () => ({
        x: +world.group.position.x.toFixed(3),
        y: +world.group.position.y.toFixed(3),
        z: +world.group.position.z.toFixed(3),
        visible: world.group.visible,
        placing: Boolean(placing),
        /** Which way its latches point, and whether it is still turning.
         * The owner's "opens toward himself" is this number against where the
         * player is standing. */
        yaw: +world.group.rotation.y.toFixed(3),
        turning: Boolean(turning),
        /** Is the purple-and-gold showing, and where. */
        contents: contents?.group
          ? {
            visible: contents.group.visible,
            x: +contents.group.position.x.toFixed(3),
            y: +contents.group.position.y.toFixed(3),
            z: +contents.group.position.z.toFixed(3),
          }
          : null,
      }),
    },
  };
}
