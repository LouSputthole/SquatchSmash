/**
 * LICENSE TO GRILL — mounting it in the club.
 *
 * `license-to-grill.js` is the writing and the rules; this is the part that
 * knows about figures, doors, a timing bar and a campaign save. Kept apart so
 * the scene's argument can be reasoned about without a browser, and so this
 * file can be read as "what the club has to do" rather than as more script.
 *
 * The one rule that shapes all of it: **there is one Gratin.** He is on the
 * floor at his booth for the whole visit, so the quest does not build a second
 * one in the store room — it walks the man himself through the door and puts
 * him back when it is over. Same for Numbskull. Blond is the only new figure,
 * because he is the only new person.
 */
import * as THREE from 'three';
import { CHARACTER_IDS } from '../core/campaign.js';
import { TimingBar } from '../core/timingbar.js';
import { SIGNATURE_TRACKS, playSignatureTrack } from '../core/signature-music.js';
import { Npc } from './cast.js';
import {
  ENDINGS,
  QUEST,
  buildLicenseToGrillScript,
  createInterrogation,
} from './license-to-grill.js';

/** Where everybody stands once the door shuts. Store-room world coordinates. */
const MARKS = Object.freeze({
  blond: { x: 9.6, z: -12.3, yaw: 0.22 },
  gratin: { x: 8.9, z: -11.35, yaw: -2.5 },
  numbskull: { x: 10.9, z: -11.6, yaw: 3.5 },
  player: { x: 9.55, z: -11.0, yaw: Math.PI },
});

/** What he had on him. Cash is the only part with a number attached. */
const BLOND_CASH = 340;

/**
 * His figure: the remains of a tuxedo, barefoot, and hair that has survived
 * the evening better than he has. Built through the club's own person builder
 * so he is lit, shaded and animated like everybody else in the building.
 */
function makeBlond(scene, colliders) {
  const blond = new Npc(scene, {
    name: 'Blond',
    tier: 'hero',
    job: 'sit',
    x: MARKS.blond.x,
    z: MARKS.blond.z,
    yaw: MARKS.blond.yaw,
    colliders,
    model: {
      height: 1.83,
      build: 1.0,
      dress: 'suit',
      /* Midnight, not black — a dinner jacket, and it reads as one even in a
       * store room with a single bulb over it. */
      shirt: 0x14161f,
      shirtAccent: 0xf0efe8,
      neckline: 'v',
      luxury: true,
      hair: 'short',
      hairColour: 0xd8c088,
      skin: 0xf0cba6,
      barefoot: true,
      bowtie: true,
    },
  });
  blond.characterId = CHARACTER_IDS.JAMES_BLOND;
  blond.group.userData.npc.characterId = CHARACTER_IDS.JAMES_BLOND;
  return blond;
}

/**
 * @param {object} deps everything the club already owns
 * @returns {object} the quest handle main.js mounts and ticks
 */
export function createLicenseToGrill({
  scene,
  club,
  audio,
  hud,
  dialogue,
  player,
  interaction,
  campaign,
  family,
  shubenator,
  isSecondVisit = false,
  addMoney = () => {},
  onPersist = () => {},
} = {}) {
  const runtime = {
    /** 'closed' while it is somebody else's store room. */
    phase: 'closed',
    grill: null,
    blond: null,
    /* Where the Family were standing before this started, so the floor is put
     * back exactly as it was rather than approximately. */
    parked: new Map(),
    persisted: null,
  };

  /* The cord. Six swings is a beating; two is a gesture, which is what this
   * is — the point of the bar is that the player commits to it and Blond is
   * unimpressed anyway. */
  const bar = new TimingBar({
    hits: 2,
    window: [0.70, 0.88],
    speed: 0.85,
    ramp: 1.1,
    onHit: () => audio?.play('bing.line.snort', { volume: 0.35 }),
    onMiss: () => audio?.play('door.knob', { volume: 0.3 }),
    onDone: () => {
      runtime.grill?.apply('strike');
      hud?.setTiming(null);
      resume('afterSwing');
    },
  });

  const script = buildLicenseToGrillScript({
    swing: () => { bar.start(); },
    apply: (kind) => runtime.grill.apply(kind),
    ask: (id) => runtime.grill.ask(id),
    carAvailable: () => !!runtime.grill?.carAvailable(),
    threatenCar: () => runtime.grill.threatenCar(),
    shubesDue: () => !!runtime.grill?.shubesDue(),
    markShubes: () => {
      runtime.grill.markShubes();
      /* The interruption is one of the Shubenator's three authored moments,
       * so it goes through `scripted` rather than `offer`: it is exempt from
       * the cooldown because it is the joke, and it arms the gate so no
       * ambient hello can tread on it out on the floor afterwards. */
      shubenator?.scripted('firstMeeting');
    },
    answerCounter: (id, respect) => runtime.grill.answerCounter(id, respect),
    finish: (ending) => complete(ending),
  });

  const tree = script[CHARACTER_IDS.JAMES_BLOND];

  function resume(node) {
    if (runtime.phase !== 'open') return;
    dialogue?.start(tree, node, runtime.blond);
  }

  /** Walk a Family member off the floor and into the room, remembering where. */
  function bringIn(id, mark) {
    const npc = family?.byId?.[id];
    if (!npc) return;
    runtime.parked.set(id, {
      x: npc.group.position.x,
      z: npc.group.position.z,
      yaw: npc.group.rotation.y,
      job: npc.job,
    });
    npc.job = 'stand';
    npc._syncJob?.(true);
    npc.group.position.set(mark.x, npc.group.position.y, mark.z);
    npc.group.rotation.y = mark.yaw;
  }

  function putBack(id) {
    const npc = family?.byId?.[id];
    const was = runtime.parked.get(id);
    if (!npc || !was) return;
    npc.job = was.job;
    npc._syncJob?.(true);
    npc.group.position.set(was.x, npc.group.position.y, was.z);
    npc.group.rotation.y = was.yaw;
    runtime.parked.delete(id);
  }

  /** True while the door should offer the quest rather than the store room. */
  function available() {
    /* First visit only. The second visit is the HotDog party and its own
     * emergency; a man tied to a chair in the next room is not a thing to
     * discover halfway through carrying a body. */
    return !isSecondVisit && runtime.phase === 'closed' && !runtime.persisted;
  }

  function open() {
    if (!available()) return false;
    runtime.phase = 'open';
    runtime.grill = createInterrogation();
    runtime.blond = makeBlond(scene, club?.colliders);
    bringIn(CHARACTER_IDS.GRATIN, MARKS.gratin);
    bringIn(CHARACTER_IDS.NUMBSKULL, MARKS.numbskull);

    if (player) {
      player.position.set(MARKS.player.x, player.position.y, MARKS.player.z);
      player.yaw = MARKS.player.yaw;
    }
    /* The radio on the shelf, and it is the only thing in the room behaving
     * as though this is a normal Tuesday. Low, positional, and it does not
     * stop for any of it. */
    playSignatureTrack(audio, SIGNATURE_TRACKS.storeRoomJazz, {
      position: club?.anchors?.storeRadio,
      ref: 1.2,
      maxDist: 11,
      fade: 1.4,
    });
    hud?.say(`<em>${QUEST.title}.</em> Gratin shuts the door behind you.`, 4200);
    resume('open');
    return true;
  }

  function complete(ending) {
    if (runtime.phase !== 'open') return null;
    const cash = ending === ENDINGS.SHOT ? BLOND_CASH : 0;
    runtime.persisted = runtime.grill.finish(ending, { cash });
    if (cash) {
      addMoney(cash);
      hud?.toast(`Took $${cash} off him`, 'good');
    }
    if (runtime.persisted.card) {
      hud?.toast('“Licensed to Grill” — a novelty card', 'good');
    }
    onPersist(runtime.persisted, campaign);
    close();
    return runtime.persisted;
  }

  function close() {
    runtime.phase = 'done';
    hud?.setTiming(null);
    audio?.stopLoop?.('music.storeroom', 1.2);
    bar.stop();
    putBack(CHARACTER_IDS.GRATIN);
    putBack(CHARACTER_IDS.NUMBSKULL);
    if (runtime.blond) {
      /* He stays in the chair whatever the ending — tied, one hand free, or
       * not needing the chair any more. The room keeps him; the floor does
       * not get a barefoot man in a dinner jacket walking through it. */
      runtime.blond.job = 'sit';
      runtime.blond._syncJob?.(true);
    }
  }

  return {
    get phase() { return runtime.phase; },
    get state() { return runtime.grill?.state ?? null; },
    get persisted() { return runtime.persisted; },
    get blond() { return runtime.blond; },
    script,
    bar,
    available,
    open,
    close,
    /** The door's label, whichever thing it currently is. */
    doorLabel(fallback) {
      return available() ? `<b>${QUEST.door}</b>` : fallback;
    },
    /** Everything the club has to do to this per frame. */
    update(dt) {
      if (runtime.phase !== 'open') return;
      if (bar.active || bar.flash) {
        bar.update(dt);
        hud?.setTiming(bar.view);
      }
      runtime.blond?.update(dt, player?.position ?? new THREE.Vector3());
    },
    /** Left click / [E] while the cord is up. */
    press() {
      if (runtime.phase === 'open' && bar.active) { bar.press(); return true; }
      return false;
    },
  };
}
