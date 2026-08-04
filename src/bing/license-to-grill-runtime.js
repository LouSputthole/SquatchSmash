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
  SCENE_TREES,
  buildLicenseToGrillScript,
  createInterrogation,
} from './license-to-grill.js';

/**
 * Where everybody stands once the door shuts. Store-room world coordinates.
 *
 * The two Family marks used to carry a literal yaw and both of them were
 * wrong — Gratin faced the south-west wall and Numbskull faced past the
 * chair — so the room read as three people who had never met. They now carry
 * the point they are LOOKING at instead, and the yaw comes off the same
 * `atan2(dx, dz)` the cast's own faceToward uses. Gratin is angled at the
 * front of the chair so he is open to whoever comes through the door;
 * Numbskull looks straight at the man he is guarding.
 */
const MARKS = Object.freeze({
  blond: { x: 9.6, z: -12.3, yaw: 0.22 },
  gratin: { x: 8.9, z: -11.35, faceAt: { x: 9.6, z: -11.95 } },
  numbskull: { x: 10.9, z: -11.6, faceAt: { x: 9.6, z: -12.3 } },
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
       * store room with a single bulb over it.
       *
       * `tuxedo`, NOT `neckline: 'v'`. The V cut a skin-coloured triangle into
       * his chest and hung two pale bars either side of it, which is an open
       * knit collar, not black tie — the owner's "strange looking Vneck
       * thing". The tuxedo option builds the opposite: a white bib with studs,
       * a cummerbund closing it at the waist, and satin lapels laid over the
       * top. `shirtAccent` is the shirt's own white. */
      shirt: 0x14161f,
      shirtAccent: 0xf0efe8,
      tuxedo: true,
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
    /**
     * How far through the evening the CONVERSATION is, as opposed to how far
     * through it the interrogation is.
     *
     * This exists because the owner could not find where the scene starts
     * again once it stops. There was nothing to walk up to: Blond had no
     * interaction on him at all, and `resume()` was only ever called from
     * `open()` and from the cord's own callback — so a conversation that
     * lapsed (walk more than 6.5m from the chair and Dialogue ends it) was
     * gone for the rest of the visit, with a live objective still on screen.
     *
     * 'intro' | 'floor' | 'named'. Written at the two moments that actually
     * move the scene on, so walking back up to the chair always lands
     * somewhere sensible rather than somewhere remembered.
     */
    stage: 'intro',
    /** Set by a scene tree that wants to hand the player back to the chair. */
    handOff: null,
    /** Interaction targets this quest owns, so `close` can take them away. */
    targets: [],
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
      /* The cord is the end of the scripted opening. Everything after it hangs
       * off `floor`, so this is the moment the scene becomes re-enterable. */
      runtime.stage = 'floor';
      resume('afterSwing');
    },
  });

  const script = buildLicenseToGrillScript({
    swing: () => { bar.start(); },
    apply: (kind) => runtime.grill.apply(kind),
    ask: (id) => runtime.grill.ask(id),
    carAvailable: () => !!runtime.grill?.carAvailable(),
    broken: () => !!runtime.grill?.broken,
    handled: () => runtime.grill?.state?.handled?.size ?? 0,
    /* Deferred on purpose. A tree's `next` runs INSIDE Dialogue.choose/update,
     * and starting a second conversation from in there would have the caller
     * overwrite the new thread's timer and pending node the moment it returns.
     * So the hand-off is recorded and performed by this quest's own update, on
     * the first frame after the current line has finished and closed itself. */
    handOff: (node) => { runtime.handOff = node || 'floor'; },
    threatenCar: () => {
      const broke = runtime.grill.threatenCar();
      if (broke) runtime.stage = 'named';
      return broke;
    },
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

  /**
   * Where walking back up to the chair puts you.
   *
   * Derived from the scene's own progress rather than from Dialogue's
   * bookmarks: a bookmark records wherever the thread happened to lapse,
   * including halfway through a line Gratin is saying about a bottle, and the
   * cord's option ends its thread with reason 'done' — which leaves whatever
   * stale bookmark preceded it in place. Three answers, all of them a node a
   * conversation can honestly begin at.
   */
  function reentry() {
    if (runtime.stage === 'named') return 'afterTheName';
    if (runtime.stage === 'floor') return 'floor';
    return 'open';
  }

  /** Walk a Family member off the floor and into the room, remembering where. */
  function bringIn(id, mark) {
    const npc = family?.byId?.[id];
    if (!npc) return;
    runtime.parked.set(id, {
      x: npc.group.position.x,
      z: npc.group.position.z,
      yaw: npc.group.rotation.y,
      /* Both facings, because they are two different things. `rotation.y` is
       * where he is pointing this frame; `targetYaw` is where Npc.update is
       * easing him towards, and it survives being teleported. Restore only
       * the first and a member put back on the floor snaps to his stool and
       * then slowly turns to face a store room two rooms away. */
      targetYaw: npc.targetYaw,
      job: npc.job,
    });
    npc.job = 'stand';
    npc._syncJob?.(true);
    npc.group.position.set(mark.x, npc.group.position.y, mark.z);
    npc.group.rotation.y = mark.faceAt
      ? Math.atan2(mark.faceAt.x - mark.x, mark.faceAt.z - mark.z)
      : mark.yaw;
    /* Nail the visible facing too. `targetYaw` is what Npc.update eases
     * towards, and a member who came in from the floor still carries the one
     * he was using out there. */
    npc.targetYaw = npc.group.rotation.y;
  }

  function putBack(id) {
    const npc = family?.byId?.[id];
    const was = runtime.parked.get(id);
    if (!npc || !was) return;
    npc.job = was.job;
    npc._syncJob?.(true);
    npc.group.position.set(was.x, npc.group.position.y, was.z);
    npc.group.rotation.y = was.yaw;
    npc.targetYaw = was.targetYaw;
    runtime.parked.delete(id);
  }

  /** True while the door should offer the quest rather than the store room. */
  function available() {
    /* First visit only. The second visit is the HotDog party and its own
     * emergency; a man tied to a chair in the next room is not a thing to
     * discover halfway through carrying a body. */
    return !isSecondVisit && runtime.phase === 'closed' && !runtime.persisted;
  }

  /**
   * Put a crosshair on the man in the chair.
   *
   * This is the answer to "where do I start the torture sequence?". The scene
   * used to be a conversation and nothing else: nothing in the room could be
   * looked at, so once the conversation stopped — and it stops the moment you
   * step 6.5m away from the chair, which is most of this room — there was no
   * surface left to press [E] on. Blond now carries the same walk-up
   * interaction every other person in this building carries, and its label
   * says which part of the evening it is about to resume.
   */
  function mountBlond() {
    if (!interaction || !runtime.blond) return;
    runtime.targets.push(interaction.register(runtime.blond.group, {
      label: () => {
        if (runtime.stage === 'named') return 'Settle up with <b>James Blond</b>';
        if (runtime.stage === 'floor') return 'Work on <b>James Blond</b>';
        return 'Talk to <b>James Blond</b>';
      },
      /* Not while the cord is in the air: [E] belongs to the timing bar then,
       * and a prompt offering a conversation over the top of it is a lie. */
      enabled: () => runtime.phase === 'open' && !bar.active,
      onUse: () => resume(reentry()),
    }));
  }

  function unmountTargets() {
    if (!interaction) return;
    for (const target of runtime.targets) interaction.unregister?.(target);
    runtime.targets.length = 0;
  }

  function open() {
    if (!available()) return false;
    runtime.phase = 'open';
    runtime.stage = 'intro';
    runtime.handOff = null;
    runtime.grill = createInterrogation();
    runtime.blond = makeBlond(scene, club?.colliders);
    bringIn(CHARACTER_IDS.GRATIN, MARKS.gratin);
    bringIn(CHARACTER_IDS.NUMBSKULL, MARKS.numbskull);
    mountBlond();

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
    hud?.say(`<em>${QUEST.title}.</em> Gratin shuts the door behind you. `
      + '<em>[E] on Blond to work on him. [E] on Gratin if you want telling what for.</em>', 7000);
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
    runtime.handOff = null;
    hud?.setTiming(null);
    audio?.stopLoop?.('music.storeroom', 1.2);
    bar.stop();
    unmountTargets();
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

    /**
     * Is this Family member currently standing in the store room for us?
     *
     * The club registers ONE walk-up interaction per member, on the floor, at
     * scene build — and the quest borrows the men themselves rather than
     * building copies, so that one registration follows them through the door.
     * Which is exactly the owner's note: in the store room they were still
     * saying their floor lines. This is what the club asks before choosing
     * which script the man in front of you is in.
     */
    inRoom(characterId) {
      return runtime.phase === 'open' && runtime.parked.has(characterId);
    },

    /**
     * Start this member's store-room conversation. Returns false when he is
     * not in here, and the club falls back to his ordinary floor thread.
     */
    talkTo(characterId, npc = null) {
      if (!this.inRoom(characterId)) return false;
      const sceneTree = script[SCENE_TREES[characterId]];
      if (!sceneTree) return false;
      const speaker = npc ?? family?.byId?.[characterId] ?? null;
      /* Resumable, like every other walk-up in the club: step out of range
       * mid-answer and the next press picks it back up. Blond's own thread is
       * deliberately NOT resumable — see `reentry`. */
      dialogue?.start(sceneTree, 'open', speaker, { resume: true });
      return true;
    },

    /** The crosshair label for a member who is in here, or null for the floor. */
    npcLabel(characterId) {
      if (!this.inRoom(characterId)) return null;
      if (characterId === CHARACTER_IDS.GRATIN) return 'Ask <b>Au Gratin</b> what he wants';
      if (characterId === CHARACTER_IDS.NUMBSKULL) return 'Ask <b>Numbskull</b> about the box';
      return null;
    },

    /** Everything the club has to do to this per frame. */
    update(dt) {
      if (runtime.phase !== 'open') return;
      if (bar.active || bar.flash) {
        bar.update(dt);
        hud?.setTiming(bar.view);
      }
      /* A scene tree asked to give the player back to the chair. Wait for its
       * own last line to finish and close itself, then start Blond cleanly —
       * doing it from inside the tree would have Dialogue overwrite the new
       * thread the instant the handler returned. */
      if (runtime.handOff && !dialogue?.active) {
        const node = runtime.handOff;
        runtime.handOff = null;
        /* Being handed back past the scripted opening counts as having done
         * it — otherwise walking up to the chair afterwards would replay the
         * introduction over the top of a conversation already in progress. */
        if (runtime.stage === 'intro') runtime.stage = 'floor';
        resume(node);
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
