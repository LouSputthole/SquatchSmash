/**
 * LICENSE TO GRILL — the store room as a room.
 *
 * `license-to-grill.test.mjs` holds the argument and the writing. This holds
 * the thing the 2026-08-04 playtest was actually about: whether the scene is a
 * place you walk into and do things in, or a menu with a man in it.
 *
 * Everything here is driven headlessly through the real runtime with fake
 * club furniture, because all four of the owner's structural notes — walk in
 * rather than teleport, hear Gratin through the door, carry the cord, pick his
 * things up off a table and break them — are runtime behaviour and none of it
 * is visible from the script alone.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { ensureDomShim } from '../tools/three-shim.mjs';

import { isBingPreloadCue } from '../src/bing/audio.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import { auditDeathTransition } from '../src/core/death-transition.js';
import {
  ENDINGS,
  FATAL_HITS,
  PRESSURE,
  SWINGS_BEFORE_THE_TABLE,
} from '../src/bing/license-to-grill.js';
import { createLicenseToGrill } from '../src/bing/license-to-grill-runtime.js';
import { grillToolPose } from '../src/bing/grill-tool-motion.js';

ensureDomShim();

test('cart tools have distinct contact poses and settle back without a jump', () => {
  const tools = ['tenderizer', 'ice', 'tongs', 'sauce'];
  assert.equal(new Set(tools.map((id) => JSON.stringify(grillToolPose(id, 0.56)))).size, 4);
  for (const id of tools) {
    assert.deepEqual(grillToolPose(id, 1), grillToolPose(id, 0));
    for (const time of [-1, 0, 0.28, 0.56, 0.8, 1]) {
      const pose = grillToolPose(id, time);
      assert.ok([...pose.position, ...pose.rotation].every(Number.isFinite));
    }
  }
});

/** The store room's real coordinates, from src/bing/club.js. */
const CHAIR = { x: 9.6, z: -12.3 };
const DOOR = { x: 6.75, z: -9.5 };
const TABLE = { x: 9.9, y: 0.815, z: -10.15 };

function harness({ inventoryRejects = false, initialPersisted = null } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const played = [];
  const said = [];
  const started = [];
  const toasts = [];

  const audio = {
    play: (name, options) => {
      if (options?.position) assert.ok(['x', 'y', 'z'].every((axis) => Number.isFinite(options.position[axis])), `${name} must have finite spatial audio coordinates`);
      played.push(name);
    },
    hasSample: () => false,
    stopLoop: () => {},
    startLoop: () => {},
    startMusicLoop: () => {},
    replaceMusicLoop: () => {},
  };
  const hud = {
    hand: null,
    lines: said,
    say: (text) => said.push(text),
    toast: (text) => toasts.push(text),
    setHand(item) { this.hand = item; },
  };
  const dialogue = {
    active: false,
    ended: null,
    log: started,
    start(tree, at) {
      started.push(at);
      this.active = true;
      /* Play the node's `enter` the way the real Dialogue does — that is where
       * the interrogation's methods are registered. */
      tree?.[at]?.enter?.();
    },
    finish() { this.active = false; },
    end(reason = 'done') { this.active = false; this.ended = reason; },
  };
  const player = { position: new THREE.Vector3(0, 0, 0), yaw: 0 };
  const registered = [];
  const interaction = {
    register(mesh, desc) { mesh.userData.interact = desc; registered.push(mesh); return mesh; },
    unregister(mesh) { registered.splice(registered.indexOf(mesh), 1); },
  };
  const member = (x, z) => ({
    group: { position: new THREE.Vector3(x, 0, z), rotation: { y: 0 } },
    targetYaw: 0,
    job: 'sit',
    _syncJob() {},
    update() {},
    say() {},
  });
  const family = {
    byId: {
      [CHARACTER_IDS.GRATIN]: member(-4, 3),
      [CHARACTER_IDS.NUMBSKULL]: member(-3, 4),
      [CHARACTER_IDS.SHUBENATOR]: member(-5, 6),
    },
  };
  const inventory = {
    added: [],
    attempted: [],
    add(id) {
      this.attempted.push(id);
      if (inventoryRejects) return false;
      this.added.push(id);
      return true;
    },
  };
  const club = {
    colliders: [],
    anchors: {
      grillTable: new THREE.Vector3(TABLE.x, TABLE.y, TABLE.z),
      grillCart: new THREE.Vector3(8.2, 0.82, -12.85),
      storeRadio: new THREE.Vector3(13.05, 1.32, -12.8),
    },
    storeroom: { table: { rotation: { y: 0.05 } } },
  };

  const quest = createLicenseToGrill({
    scene,
    camera,
    club,
    audio,
    hud,
    dialogue,
    player,
    interaction,
    campaign: {},
    family,
    shubenator: { scripted() {} },
    inventory,
    initialPersisted,
    items: { cord: { icon: '🪢', name: 'The cord' } },
    onPersist: () => {},
  });

  /** Look at a point from `back` metres away, the way a player would. */
  const standAt = (x, z, lookAt = null) => {
    player.position.set(x, 0, z);
    if (lookAt) {
      /* The club's player forward is (-sin yaw, -cos yaw); see Player.update. */
      player.yaw = Math.atan2(-(lookAt.x - x), -(lookAt.z - z));
    }
  };
  /** Run one swing to completion. */
  const swingThrough = () => {
    quest.press();
    for (let i = 0; i < 20 && quest.phase === 'open'; i++) quest.update(0.05);
  };
  /** Find the registered pad whose label mentions this thing. */
  const padFor = (word) => registered.find((mesh) => {
    const label = mesh.userData.interact?.label;
    return typeof label === 'function' && label().toLowerCase().includes(word);
  });

  return {
    quest, scene, camera, audio, hud, dialogue, player, interaction, family,
    inventory, club, played, said, started, toasts, registered, standAt, swingThrough, padFor,
  };
}

/** Open the room, walk in, and get through the introduction. */
function walkIn(h) {
  h.quest.open();
  h.standAt(CHAIR.x, CHAIR.z + 1.3, CHAIR);
  h.quest.update(0.05);
  h.dialogue.finish();
  return h;
}

/** Drive Gratin's automatic handoff at the real dialogue node. */
function receiveCord(h) {
  const node = h.quest.script[CHARACTER_IDS.JAMES_BLOND].handOverCord;
  assert.equal(node.options, undefined, 'the cord handoff regressed to a numbered choice');
  node.enter();
  assert.equal(node.next, 'cordInHand');
  return h;
}

test('the back room names the next physical action and relinquishes the card outside', () => {
  const h = walkIn(harness());
  receiveCord(h);
  h.dialogue.finish();
  assert.match(h.quest.guidance.hint, /prep table/);
  assert.ok(h.quest.guidance.target.object.userData.interact);
  const watch = h.quest.table.get('watch');
  watch.pad.userData.interact.onUse();
  assert.match(h.quest.guidance.hint, /Click.*break.*Q.*back/);
  assert.equal(h.quest.guidance.target, null, 'a held object must not still be marked on the table');
  h.quest.stepBack();
  h.dialogue.finish();
  h.standAt(0, 0);
  assert.equal(h.quest.guidance, null);
});

test('every sound the store room reaches for is one the club has decoded', () => {
  /* The scene plays eight cues that have been ASKED for and not yet recorded,
   * and a stand-in beside each one until they land. Both halves have to be in
   * the Bing's preload set or the club never decodes them: `play()` falls
   * through to the synthesiser for a cue with no buffer, and a whip landing on
   * a synthesised noise is the owner's *"good whip sound effect"* not being
   * there at all. The stand-ins additionally have to be INDEXED — a fallback
   * with no file on disk is not a fallback. */
  const runtime = fs.readFileSync(
    new URL('../src/bing/license-to-grill-runtime.js', import.meta.url), 'utf8',
  );
  const indexed = new Set(JSON.parse(fs.readFileSync(
    new URL('../assets/sfx/index.json', import.meta.url), 'utf8',
  )).files || []);
  const manifest = new Map(JSON.parse(fs.readFileSync(
    new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8',
  )).sfx.map((cue) => [cue.name, cue]));

  const wanted = [...runtime.matchAll(/'(bing\.grill\.[a-z.]+)'/g)].map((m) => m[1]);
  assert.ok(wanted.length >= 8, 'the pending cue table has shrunk');
  for (const name of new Set(wanted)) {
    assert.equal(isBingPreloadCue(name), true,
      `${name} is not in the Bing's preload set, so it can never arrive`);
  }

  const fallbacks = [...runtime.matchAll(/audio\?\.play\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(fallbacks.length >= 8, 'the stand-ins have gone missing');
  for (const name of new Set(fallbacks)) {
    const cue = manifest.get(name);
    assert.ok(cue, `${name} is not in the sfx manifest`);
    assert.equal(indexed.has(cue.file || `${name}.mp3`), true,
      `${name} has no recording on disk, so it is not a stand-in`);
    assert.equal(isBingPreloadCue(name), true,
      `${name} is never decoded by the club, so it plays as a synth noise`);
  }
});

test('opening the door does not teleport anybody', () => {
  /* Owner's note: *"let me open the door to the james blond scene without
   * teleporting into it. Let me just walk into it."* `open()` used to set
   * player.position and player.yaw onto a mark beside the chair. */
  const h = harness();
  h.standAt(DOOR.x, DOOR.z + 0.4);
  const before = h.player.position.clone();
  const yaw = h.player.yaw;
  assert.equal(h.quest.open(), true);
  assert.deepEqual(h.player.position.toArray(), before.toArray());
  assert.equal(h.player.yaw, yaw);
});

test('a completed saved result keeps the required objective closed on reload', () => {
  const saved = {
    completed: true,
    informant: 'Vincent Mallard',
    meet: 'Every Thursday behind the laundromat',
    ending: ENDINGS.LEFT,
  };
  const h = harness({ initialPersisted: saved });
  assert.equal(h.quest.phase, 'done');
  assert.deepEqual(h.quest.persisted, saved);
  assert.equal(h.quest.available(), false);
  assert.equal(h.quest.open(), false, 'reload reopened the completed objective');
  h.standAt(DOOR.x, DOOR.z + 0.4);
  h.quest.update(0.05);
  assert.deepEqual(h.started, [], 'completed reload replayed Gratin through the door');

  const malformed = harness({ initialPersisted: 'not a payload' });
  assert.equal(malformed.quest.phase, 'closed', 'malformed persistence blocked a fresh quest');
  assert.equal(malformed.quest.open(), true);
});

test('the conversation waits until he has actually walked up to the chair', () => {
  const h = harness();
  h.standAt(DOOR.x, DOOR.z + 0.4);
  h.quest.open();
  h.quest.update(0.05);
  assert.equal(h.started.includes('open'), false, 'Blond introduced himself from two rooms away');
  h.standAt(CHAIR.x, CHAIR.z + 1.4, CHAIR);
  h.quest.update(0.05);
  assert.equal(h.started.at(-1), 'open', 'walking up to him starts nothing');
  // And exactly once, however much walking about follows.
  h.dialogue.finish();
  h.quest.update(0.05);
  assert.equal(h.started.filter((id) => id === 'open').length, 1);
});

test('Blond is visibly cuffed ankle-to-ankle while seated in the chair', () => {
  const h = walkIn(harness());
  const rig = h.quest.restraints;
  assert.ok(rig, 'Blond has no ankle restraint rig');
  assert.equal(rig.cuffs.length, 2, 'both ankles need steel cuffs');
  assert.ok(rig.links.length >= 5, 'the cuffs are not joined by a readable chain');
  assert.ok(rig.cuffs.every((cuff) => /ankle-cuff/.test(cuff.name)));
  assert.ok(rig.links.every((link) => /ankle-chain-link/.test(link.name)));

  h.scene.updateMatrixWorld(true);
  const first = rig.links[0].getWorldPosition(new THREE.Vector3());
  const last = rig.links.at(-1).getWorldPosition(new THREE.Vector3());
  const ends = rig.cuffs.map((cuff) => cuff.getWorldPosition(new THREE.Vector3()));
  const direct = first.distanceTo(ends[0]) + last.distanceTo(ends[1]);
  const crossed = first.distanceTo(ends[1]) + last.distanceTo(ends[0]);
  assert.ok(Math.min(direct, crossed) < 0.18, 'the chain stops short of the ankle cuffs');
});

test('Gratin shouts through the door the moment the hallway has him', () => {
  /* Owner's note, round one: *"I also didn't hear gratin yell when I went
   * near the door."* The first fix answered it with a 2.4 m circle at the
   * store-room door -- sized to miss the walk to Lou's own door, which is
   * the only required reason to be back here, so it missed everybody.
   * Owner's note, round two: the line should play IN THE HALLWAY so the
   * player knows the quest exists. The hallway is the trigger now; the
   * dance floor still is not -- the wall is what keeps his voice out of a
   * face-to-face with the man on his stool. */
  const h = harness();
  h.standAt(0, 0);                        // the dance floor
  h.quest.update(0.05);
  assert.equal(h.started.length, 0, 'Gratin shouted across the dance floor');

  h.standAt(6.7, 2);                      // one step into the corridor
  h.quest.update(0.05);
  assert.deepEqual(h.started, ['knocking']);
  // Once. Walking up and down the hallway does not make him repeat himself.
  h.dialogue.finish();
  h.standAt(0, 0);
  h.quest.update(0.05);
  h.standAt(DOOR.x, DOOR.z + 1.0);
  h.quest.update(0.05);
  assert.deepEqual(h.started, ['knocking']);
});

test('the cord goes into the inventory and into his hands', () => {
  /* Owner's note: *"Gratin should hand me the cord and let it come to my
   * inventory like an item, make sure its detailed like a whip."* */
  const h = walkIn(harness());
  receiveCord(h);
  assert.deepEqual(h.inventory.added, ['cord']);
  assert.equal(h.quest.hasCord, true);
  const cord = h.quest.cord;
  assert.ok(cord, 'no cord was built');
  assert.equal(cord.root.parent, h.camera, 'the cord is not in his hands');
  assert.ok(cord.links.length >= 10, 'a whip is not one stick');
  /* Every link is a child of the one above it, which is what lets the lash
   * travel down it instead of the whole thing turning as one piece. */
  for (let i = 1; i < cord.links.length; i++) {
    assert.equal(cord.links[i].parent, cord.links[i - 1], `link ${i} is not on the whip`);
  }
  // And it tapers, the way a whip does.
  const radius = (link) => link.children[0].geometry.parameters.radiusTop;
  assert.ok(radius(cord.links.at(-1)) < radius(cord.links[0]) * 0.6, 'the whip does not taper');
});

test('the button is only offered once Gratin has finished handing it over', () => {
  /* The tone doctrine: a character speaks first, the HUD clarifies afterwards,
   * never both at once. */
  const h = walkIn(harness());
  receiveCord(h);
  h.dialogue.active = true;
  const before = h.said.length;
  h.quest.update(0.05);
  assert.equal(h.said.length, before, 'the HUD talked over Gratin');
  h.dialogue.finish();
  /* The queue releases one line at a time with the last one's duration as a
   * cooldown, so the title card comes out first and the button follows it
   * rather than landing on top of it. */
  for (let i = 0; i < 200 && !/\[Click\]/.test(h.said.at(-1) ?? ''); i++) h.quest.update(0.1);
  assert.match(h.said.at(-1), /\[Click\]/);
  assert.ok(h.said.some((line) => /License to Grill/.test(line)), 'the title card was dropped');
});

test('a full inventory cannot make the automatic cord handoff fail', () => {
  const h = walkIn(harness({ inventoryRejects: true }));
  receiveCord(h);
  assert.deepEqual(h.inventory.attempted, ['cord']);
  assert.deepEqual(h.inventory.added, [], 'the harness did not reject the inventory slot');
  assert.equal(h.quest.hasCord, true, 'inventory rejection discarded the quest weapon');
  assert.equal(h.quest.cord.root.parent, h.camera, 'the rejected cord never reached his hands');
  assert.ok(h.toasts.some((line) => /inventory full/i.test(line)), 'the fallback was silent');

  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
  h.swingThrough();
  assert.equal(h.quest.state.hits, 1, 'the fallback cord could not be used');
});

test('the whip lands when he is standing over the man, and not when he is not', () => {
  /* Owner's note: *"I want to be able to whip him on command."* No prompt, no
   * timing bar: the button swings, and where he is standing decides. */
  const h = walkIn(harness());
  receiveCord(h);

  // Across the room: the cord cracks on the floor and buys almost nothing.
  h.standAt(7.0, -10.2, CHAIR);
  h.swingThrough();
  assert.equal(h.quest.state.pressure, PRESSURE.chair);
  assert.equal(h.started.at(-1), 'swingWide');

  // Over the chair: it lands.
  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
  h.dialogue.finish();
  h.swingThrough();
  assert.equal(h.quest.state.pressure, PRESSURE.chair + PRESSURE.strike);
  assert.equal(h.started.at(-1), 'afterSwing');

  // In range but facing the wall: also a miss.
  h.dialogue.finish();
  h.standAt(CHAIR.x, CHAIR.z + 1.1, { x: CHAIR.x, z: CHAIR.z + 9 });
  h.swingThrough();
  assert.equal(h.started.at(-1), 'swingWide');
});

test('the third landed swing is where Gratin points at the table', () => {
  const h = walkIn(harness());
  receiveCord(h);
  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
  const nodes = [];
  for (let i = 0; i < SWINGS_BEFORE_THE_TABLE; i++) {
    h.dialogue.finish();
    h.swingThrough();
    nodes.push(h.started.at(-1));
  }
  assert.deepEqual(nodes, ['afterSwing', 'swingTwo', 'swingThree']);
  assert.equal(h.quest.script[CHARACTER_IDS.JAMES_BLOND].swingThree.next, 'tableNudge');
  // A fourth still gets an answer, because a player who ignores him deserves one.
  h.dialogue.finish();
  h.swingThrough();
  assert.equal(h.started.at(-1), 'swingAgain');
});

test('his effects are on the table as five things you can pick up', () => {
  /* Owner's note, the structural one: *"Gratin suggests you check out his
   * belongings on the table behind you, then each one you pick up triggers the
   * voice dialogue and then you have the option to smash it."* */
  const h = walkIn(harness());
  for (const word of ['wristwatch', 'camera', 'pistol', 'jacket', 'keys']) {
    const pad = h.padFor(word);
    assert.ok(pad, `${word} is not on the table`);
    assert.ok(Math.hypot(pad.position.x - TABLE.x, pad.position.z - TABLE.z) < 0.9,
      `${word} is not on the table by the door`);
  }
  // And the table is BEHIND somebody working on the chair, not beside it.
  assert.ok(TABLE.z > CHAIR.z + 1.6, 'the table is not behind the player');
});

test('picking one up fires its own exchange and costs him what the menu used to', () => {
  const h = walkIn(harness());
  const watch = h.padFor('wristwatch');
  h.standAt(TABLE.x, TABLE.z - 0.9, TABLE);
  watch.userData.interact.onUse();
  assert.equal(h.quest.held, 'watch');
  assert.equal(h.started.at(-1), 'propWatch');
  assert.equal(h.quest.state.pressure, PRESSURE.watch, 'the economy moved with the interface');
  assert.match(h.hud.hand.name, /watch/i);
  // Nothing else on the table can be picked up while his hands are full.
  assert.equal(h.padFor('camera').userData.interact.enabled(), false);
});

test('putting it back changes nothing, which is what makes breaking it a decision', () => {
  const h = walkIn(harness());
  h.padFor('wristwatch').userData.interact.onUse();
  const after = h.quest.state.pressure;
  assert.equal(h.quest.stepBack(), true);
  assert.equal(h.quest.held, null);
  assert.equal(h.quest.state.pressure, after);
  assert.equal(h.quest.table.get('watch').wreck, null);
  assert.equal(h.padFor('camera').userData.interact.enabled(), true);
});

test('breaking it fires the reaction, leaves wreckage, and cannot be done twice', () => {
  const h = walkIn(harness());
  h.padFor('wristwatch').userData.interact.onUse();
  h.dialogue.finish();
  const before = h.quest.state.pressure;
  assert.equal(h.quest.press(), true);
  assert.equal(h.started.at(-1), 'smashWatch');
  assert.equal(h.quest.state.pressure, 100, 'breaking his property did not secure the information');
  assert.equal(h.quest.state.broken, true);
  assert.equal(h.quest.held, null);
  const wreck = h.quest.table.get('watch').wreck;
  assert.ok(wreck, 'the watch simply vanished');
  assert.ok(wreck.children.length > 3, 'the wreckage is one lump');
  assert.equal(h.quest.table.get('watch').group.visible, false);
  // And the pad refuses to hand it back.
  assert.equal(h.padFor('what is left').userData.interact.enabled(), false);

  /* If the reaction lapses, Blond must resume at the information itself — not
   * reopen the interrogation floor, and not skip Vincent Mallard as though the
   * name had already played. */
  h.dialogue.finish();
  const blond = h.registered.find((mesh) => /hear .*blond/i.test(mesh.userData.interact?.label?.() ?? ''));
  assert.ok(blond, 'successful break did not leave a durable information interaction');
  blond.userData.interact.onUse();
  assert.equal(h.started.at(-1), 'breaks');

  /* Only the final written-down beat marks the name as delivered. */
  h.dialogue.start(h.quest.script[CHARACTER_IDS.JAMES_BLOND], 'writtenDown');
  h.dialogue.finish();
  assert.match(blond.userData.interact.label(), /settle up/i);
  blond.userData.interact.onUse();
  assert.equal(h.started.at(-1), 'afterTheName');
});

test('the cord never takes the left button outside the store room', () => {
  /* He keeps it for the rest of the evening, and out on the floor left click
   * is the club's second interact key: a slot machine has to stay clickable. */
  const h = walkIn(harness());
  receiveCord(h);
  h.standAt(-8, 2);                       // the dance floor
  assert.equal(h.quest.press(), false);
  h.standAt(6.9, 1.0);                    // the hallway
  assert.equal(h.quest.press(), false);
  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
  assert.equal(h.quest.press(), true);
});

test('left mouse stays the attack button in the store room and never falls through to E', () => {
  const h = walkIn(harness());
  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
  /* Empty hands still consume the click. Returning false here makes main.js
   * call InteractionSystem.press(), which turns left mouse into the same
   * pickup/talk button as E at exactly the moment the player expects attack. */
  assert.equal(h.quest.press(), true);
  assert.equal(h.quest.state.pressure, 0, 'an empty-handed attack invented a hit');
  receiveCord(h);
  assert.equal(h.quest.press(), true, 'the cord does not swing');
  for (let i = 0; i < 20; i++) h.quest.update(0.05);
  h.padFor('pistol').userData.interact.onUse();
  h.dialogue.finish();
  h.quest.press();
  assert.equal(h.started.at(-1), 'smashPistol', 'the cord swung with his pistol in hand');
});

/* ---------------- the cart, in his hands ---------------- */

test('every torture-cart tool is a physical E pickup in the room', () => {
  const h = walkIn(harness());
  for (const word of ['meat tenderiser', 'ice bucket', 'tongs', 'no label']) {
    const target = h.padFor(word);
    assert.ok(target, `${word} only exists in a dialogue menu`);
    assert.equal(target.userData.interact.enabled(), true, `${word} cannot be picked up`);
  }
});

test('every reusable cart-tool part has a stable semantic inspection name', () => {
  const h = walkIn(harness());
  for (const [id, state] of h.quest.cart) {
    const anonymous = [];
    state.group.traverse((part) => {
      if (!part.name) anonymous.push(part.type);
      if (part !== state.group) {
        assert.match(part.name, new RegExp(`^grill\\.tool\\.${id}\\.`),
          `${id} contains a non-semantic child name: ${part.name}`);
      }
    });
    assert.deepEqual(anonymous, [], `${id} contains anonymous Object3D parts`);
  }
});

test('E lifts the tenderiser off the cart and Q puts that same tool back', () => {
  const h = walkIn(harness());
  const target = h.padFor('meat tenderiser');
  const worldTool = h.quest.cart.get('tenderizer').group;
  target.userData.interact.onUse();
  assert.equal(h.quest.tool, 'tenderizer');
  assert.equal(worldTool.visible, false, 'the tenderiser remained on the cart while held');
  assert.ok(h.camera.getObjectByName('grill.tool.tenderizer'), 'the tenderiser never reached his hands');
  assert.equal(h.quest.state.pressure, 0, 'picking a tool up counted as hitting Blond');

  assert.equal(h.quest.stepBack(), true);
  assert.equal(h.quest.tool, null);
  assert.equal(worldTool.visible, true, 'Q did not return the tenderiser to the cart');
});

test('left click visibly swings a cart tool and applies the hit only at impact', () => {
  const h = walkIn(harness());
  h.padFor('meat tenderiser').userData.interact.onUse();
  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
  const held = h.camera.getObjectByName('grill.tool.tenderizer');
  const rest = held.rotation.toArray().slice(0, 3);

  assert.equal(h.quest.press(), true);
  assert.equal(h.quest.state.pressure, 0, 'click applied damage before the tool arrived');
  h.quest.update(0.12);
  assert.notDeepEqual(held.rotation.toArray().slice(0, 3), rest, 'the held tenderiser never swung');
  assert.equal(h.quest.state.pressure, 0, 'damage landed during the wind-up');

  for (let i = 0; i < 20; i++) h.quest.update(0.05);
  assert.equal(h.quest.state.pressure, PRESSURE.tenderizer);
  assert.equal(h.quest.state.hits, 1);
  assert.equal(h.started.at(-1), 'useTenderizer');
});

test('every landed cart-tool hit leaves pooled impact blood on Blond', () => {
  const h = walkIn(harness());
  h.padFor('meat tenderiser').userData.interact.onUse();
  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
  h.quest.press();
  for (let i = 0; i < 20; i++) h.quest.update(0.05);

  const blood = h.quest.blood;
  assert.ok(blood, 'the room did not mount the shared blood systems');
  assert.ok(blood.impacts.marksOn(h.quest.blond) >= 2, 'the landed blow left no wound and spatter');
  assert.equal(blood.pools.visibleCount, 0, 'a non-fatal hit created a death pool');
});

test('putting a tool down or closing during wind-up cancels the pending impact', () => {
  for (const cancel of ['put-back', 'close']) {
    const h = walkIn(harness());
    h.padFor('meat tenderiser').userData.interact.onUse();
    h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
    h.quest.press();
    h.quest.update(0.08);
    if (cancel === 'put-back') h.quest.stepBack();
    else h.quest.close();
    h.quest.update(1);
    assert.equal(h.quest.state.hits, 0, `${cancel} left a ghost hit queued`);
    assert.equal(h.quest.blood.impacts.marksOn(h.quest.blond), 0, `${cancel} left ghost blood`);
  }
});

test('the seventh landed blow kills Blond, pools blood, and persists no information', () => {
  const h = walkIn(harness());
  h.padFor('meat tenderiser').userData.interact.onUse();
  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);

  for (let hit = 1; hit <= FATAL_HITS; hit++) {
    h.dialogue.finish();
    h.quest.press();
    for (let frame = 0; frame < 20; frame++) h.quest.update(0.05);
    assert.equal(h.quest.state.hits, hit, `landed blow ${hit} was not counted once`);
  }

  assert.equal(h.quest.phase, 'done');
  assert.equal(h.quest.state.dead, true);
  assert.equal(h.quest.persisted.ending, ENDINGS.BEATEN);
  assert.equal(h.quest.persisted.informant, null);
  assert.equal(h.quest.persisted.meet, null);
  assert.ok(h.toasts.some((line) => /information dies with him/i.test(line)),
    'fatal outcome never explained the lost information');
  assert.equal(h.dialogue.ended, 'fatal', 'fatal impact left stale dialogue options active');
  assert.equal(h.quest.blood.pools.visibleCount, 1, 'fatal blow left no floor pool');
  assert.equal(h.quest.blond.group.userData.dead, true, 'Blond still presents as alive');
  const death = h.quest.blond.group.userData.deathTransitionReceipt;
  assert.equal(death?.mode, 'seated');
  assert.deepEqual(auditDeathTransition(death), []);
  assert.ok(Math.abs(h.quest.blond.group.rotation.z) > 0.1,
    'fatal close never moved the connected figure into its slump');
  assert.ok(Math.abs(h.quest.blond.parts.body.rotation.z) < 1e-9,
    'fatal close still tears the torso branch away from the legs');
  for (const part of [
    h.quest.blond.parts.body,
    h.quest.blond.parts.hips,
    h.quest.blond.parts.torsoWrap,
    h.quest.blond.parts.legL,
    h.quest.blond.parts.legR,
  ]) {
    let node = part;
    while (node && node !== h.quest.blond.group) node = node.parent;
    assert.equal(node, h.quest.blond.group, `${part.name} left the connected corpse hierarchy`);
  }

  /* The complete body now rotates around its hips. The ankle restraints still
   * ride the shin branches, and the chain must remain measured between them. */
  h.scene.updateMatrixWorld(true);
  const rig = h.quest.restraints;
  const first = rig.links[0].getWorldPosition(new THREE.Vector3());
  const last = rig.links.at(-1).getWorldPosition(new THREE.Vector3());
  const ends = rig.cuffs.map((cuff) => cuff.getWorldPosition(new THREE.Vector3()));
  const direct = first.distanceTo(ends[0]) + last.distanceTo(ends[1]);
  const crossed = first.distanceTo(ends[1]) + last.distanceTo(ends[0]);
  assert.ok(Math.min(direct, crossed) < 0.18, 'fatal slump detached the chain from his cuffs');

  const pool = h.quest.blood.pools.meshes.find((mesh) => mesh.visible);
  const initialOpacity = pool.material.opacity;
  h.quest.update(0.8);
  assert.ok(pool.material.opacity > initialOpacity, 'death pool stopped growing after phase done');
  const hits = h.quest.state.hits;
  assert.equal(h.quest.press(), true, 'dead-room click fell through to E');
  assert.equal(h.quest.state.hits, hits);
});

/** Press E on one of the cart's physical interaction targets. */
function takeCartTool(h, word) {
  const target = h.padFor(word);
  assert.ok(target, `${word} is not on the physical cart`);
  target.userData.interact.onUse();
  return target;
}

test('a cart tool comes to his hands instead of applying itself on pickup', () => {
  /* Owner's playtest note: he picked the meat tenderiser off the cart and
   * nothing showed up in his hands, and it could not be used on Blond. Before
   * this fix, choosing it from the menu fired `apply('tenderizer')` on the
   * spot -- so the regression test for that bug is that an E pickup costs
   * him NOTHING until it actually lands on Blond. */
  const h = walkIn(harness());
  const before = h.quest.state.pressure;
  takeCartTool(h, 'tenderiser');
  assert.equal(h.quest.tool, 'tenderizer');
  assert.equal(h.quest.state.pressure, before, 'the menu line must not be the hit');
  const model = h.camera.getObjectByName('grill.tool.tenderizer');
  assert.ok(model, 'nothing showed up in his hands');
  assert.match(h.hud.hand.name, /tenderiser/i);
});

test('a cart tool lands only when he is standing over the man, same as the cord', () => {
  const h = walkIn(harness());
  takeCartTool(h, 'tenderiser');

  // Across the room: nothing happens, and nothing is spent.
  h.standAt(7.0, -10.2, CHAIR);
  assert.equal(h.quest.press(), true, 'the press was not taken by the room');
  for (let i = 0; i < 20; i++) h.quest.update(0.05);
  assert.notEqual(h.started.at(-1), 'useTenderizer');
  assert.equal(h.quest.state.pressure, 0);

  // Over the chair: the exchange that was always written for it plays.
  h.dialogue.finish();
  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
  assert.equal(h.quest.press(), true);
  assert.notEqual(h.started.at(-1), 'useTenderizer', 'the hit landed before impact');
  for (let i = 0; i < 20; i++) h.quest.update(0.05);
  assert.equal(h.started.at(-1), 'useTenderizer');
  assert.equal(h.quest.state.pressure, PRESSURE.tenderizer);
});

test('only one thing lives in his hands at a time', () => {
  const h = walkIn(harness());
  receiveCord(h);
  takeCartTool(h, 'ice bucket');
  assert.equal(h.quest.tool, 'ice');
  // The cord is put away while a tool is in his hands.
  assert.equal(h.quest.cord.root.visible, false);
  // And the table refuses him — the same rule that already applies to a
  // second belonging.
  h.standAt(TABLE.x, TABLE.z - 0.9, TABLE);
  assert.equal(h.padFor('wristwatch').userData.interact.enabled(), false);

  // [Q] frees his hands, and the cord comes back.
  assert.equal(h.quest.stepBack(), true);
  assert.equal(h.quest.tool, null);
  assert.equal(h.camera.getObjectByName('grill.tool.ice'), undefined);
  h.quest.update(0.05);
  assert.equal(h.quest.cord.root.visible, true);
});

test('Q returns one cart tool before E can take another', () => {
  const h = walkIn(harness());
  takeCartTool(h, 'tongs');
  assert.equal(h.quest.tool, 'tongs');
  const sauce = h.padFor('no label');
  assert.equal(sauce.userData.interact.enabled(), false, 'E offered a second tool with full hands');
  assert.equal(h.quest.stepBack(), true);
  takeCartTool(h, 'no label');
  assert.equal(h.quest.tool, 'sauce', 'the second tool did not come off the cart');
  assert.equal(h.camera.getObjectByName('grill.tool.tongs'), undefined, 'the tongs are still modelled in his hand');
  assert.ok(h.camera.getObjectByName('grill.tool.sauce'), 'the bottle never arrived');
});

test('his own things come first — a tool cannot be taken while one of them is in his hands', () => {
  /* Reachable only through Gratin or Numbskull's own threads, which hand the
   * floor back without going through `mountBlond`'s `!held` gate — so this is
   * `giveTool` refusing on its own rather than trusting every caller. */
  const h = walkIn(harness());
  h.padFor('wristwatch').userData.interact.onUse();
  assert.equal(h.quest.held, 'watch');
  takeCartTool(h, 'tongs');
  assert.equal(h.quest.tool, null, 'a tool was taken with a belonging already in hand');
  assert.equal(h.quest.held, 'watch', 'the watch was dropped for the tongs');
});

test('Shubes walks in for his one interruption, and leaves when it is over', () => {
  /* Owner's note: "Shubes has a line in this scene but never appears." The
   * whole thread (`shubesEnters` through `shubesFrozen`) was always written
   * and always played as dialogue — this is the physical half of the fix. */
  const h = walkIn(harness());
  const tree = h.quest.script[CHARACTER_IDS.JAMES_BLOND];
  const shubes = h.family.byId[CHARACTER_IDS.SHUBENATOR];
  const home = shubes.group.position.clone();
  assert.equal(shubes.job, 'sit', 'he starts on the floor, not standing at a door');

  /* Drive pressure past the interruption threshold with a method that is
   * exempt from the once-only rule, so this does not depend on the dialogue
   * engine's own auto-advance (the test stub does not implement it). */
  for (let i = 0; i < 14; i++) tree.gratinTechnique.enter();
  assert.ok(h.quest.state.pressure >= 40, 'never crossed the interruption threshold');
  assert.deepEqual(shubes.group.position.toArray(), home.toArray(), 'he walked in before anything asked him to');

  const routed = tree.gratinAdmits.next();
  assert.equal(routed, 'shubesEnters', 'the room did not route the scene to him');
  assert.notDeepEqual(shubes.group.position.toArray(), home.toArray(), 'Shubes never left the floor');
  assert.equal(shubes.job, 'stand');

  // The floor gets the room back once his bit is over.
  h.dialogue.start(tree, 'floor', null);
  assert.deepEqual(shubes.group.position.toArray(), home.toArray(), 'he never went back to the floor');
  assert.equal(shubes.job, 'sit');
});

test('Gratin and Numbskull hold the back room until it is over, then take their floor spots', () => {
  /* Owner, 2026-08-19 playtest: they are NOT on the Bing floor before the
   * store-room scene — the man who caught a spy at seven o'clock is in the
   * back room with him. Their authored floor spots (where the harness seated
   * them: Gratin -4,3 and Numbskull -3,4) are what `close()` restores, so
   * they take their usual places only once the room is dealt with. */
  const h = harness();
  const gratin = h.family.byId[CHARACTER_IDS.GRATIN];
  const numbskull = h.family.byId[CHARACTER_IDS.NUMBSKULL];
  for (const npc of [gratin, numbskull]) {
    const { x, z } = npc.group.position;
    assert.ok(x >= 5.6 && x <= 13.6 && z >= -15 && z <= -9.6,
      'he is out on the floor before the store room has been dealt with');
    assert.equal(npc.job, 'stand', 'he is sitting at his booth inside the store room');
  }

  walkIn(h);
  receiveCord(h);
  h.padFor('wristwatch').userData.interact.onUse();
  h.quest.close();
  assert.deepEqual(gratin.group.position.toArray(), [-4, 0, 3], 'Gratin never took his booth');
  assert.equal(gratin.job, 'sit', 'Gratin stands in the middle of the floor forever');
  assert.deepEqual(numbskull.group.position.toArray(), [-3, 0, 4], 'Numbskull never took his spot');
  assert.equal(h.quest.held, null, 'he walked out holding a dead spy’s watch');
  assert.equal(h.quest.table.get('watch').group.visible, true);
  assert.deepEqual(h.registered, [], 'the store room is still interactive after it is over');
  assert.deepEqual(h.inventory.added, ['cord'], 'Gratin took his cord back');
});

test('a completed reload never pre-stages the back room: the floor keeps both men', () => {
  const h = harness({
    initialPersisted: {
      completed: true, informant: 'Vincent Mallard', meet: 'x', ending: ENDINGS.SHOT,
    },
  });
  assert.deepEqual(h.family.byId[CHARACTER_IDS.GRATIN].group.position.toArray(), [-4, 0, 3]);
  assert.deepEqual(h.family.byId[CHARACTER_IDS.NUMBSKULL].group.position.toArray(), [-3, 0, 4]);
});

test('the only ending is the execution, staged beat by beat on the simulated clock', () => {
  /* Owner, 2026-08-19 playtest: the spare-him and walk-away options are
   * gone; Numbskull draws and does it. Beat order pinned here: draw, one
   * shot with a face mark, the slump, the resume at `endShot`, the call for
   * Snow, and completion only after the last line has closed itself. */
  const h = walkIn(harness());
  const tree = h.quest.script[CHARACTER_IDS.JAMES_BLOND];

  // The choice tree offers ONLY finishing him.
  const options = (typeof tree.endings.options === 'function'
    ? tree.endings.options() : tree.endings.options);
  assert.equal(options.length, 1, 'a spare-him or walk-away option came back');
  assert.match(options[0].text, /finish the job/i);
  assert.equal(Object.hasOwn(tree, 'endLeft'), false, 'the leave-him ending is still authored');
  assert.equal(Object.hasOwn(tree, 'endUntied'), false, 'the mercy ending is still authored');
  assert.equal(tree.endShot.next, 'endSnowShout', 'the aftermath never calls for Snow');
  assert.equal(tree.endSnowAnswer.who, 'Snow', 'Snow’s reluctant line is not his');
  assert.match(tree.endSnowShout.line, /we’re gonna need you back here/i);
  assert.match(tree.endSnowAnswer.line, /ridiculous/i);

  // Secure the information first, the honest way.
  h.padFor('wristwatch').userData.interact.onUse();
  h.dialogue.finish();
  h.quest.press();
  h.dialogue.finish();

  // Choosing the only option starts the staged beat.
  assert.equal(options[0].next(), null, 'the option must close the thread for the beat');
  assert.equal(h.quest.execution.phase, 'draw');

  // Draw: no shot yet, no mark on him yet.
  h.quest.update(0.3);
  const marksBefore = h.quest.blood.impacts.marksOn(h.quest.blond);
  assert.equal(h.quest.executed, false, 'the shot landed during the draw');

  // Through the shot beat: one mark on the FACE, attached to the head.
  for (let i = 0; i < 24; i++) h.quest.update(0.1);
  assert.equal(h.quest.executed, true, 'the shot never fired');
  assert.equal(h.quest.blood.impacts.marksOn(h.quest.blond), marksBefore + 1,
    'the shot left no mark on him');
  const faceMark = h.quest.blood.impacts.marksFor(h.quest.blond)
    .find((mark) => mark.parent === h.quest.blond.parts.head);
  assert.ok(faceMark, 'the execution mark is not on his face');
  assert.ok(h.quest.blond.parts.head.rotation.x > 0.5, 'his head never went down');
  assert.equal(h.quest.blond.group.userData.dead, true);
  assert.equal(h.quest.blood.pools.visibleCount, 1, 'the drain got nothing');
  assert.equal(h.started.at(-1), 'endShot', 'the room never resumed at the aftermath');

  /* The shout for Snow: the harness roster has no Snow, and `bringIn`
   * shrugging that off (rather than crashing the aftermath) is part of the
   * contract — his line still plays from the tree either way. */
  h.dialogue.start(tree, 'endSnowShout', null);
  assert.equal(h.quest.phase, 'open', 'the scene banked before the aftermath finished');

  // Completion waits for the last line to close itself, then banks the card.
  h.dialogue.start(tree, 'endSnowDone', null);
  h.quest.update(0.05);
  assert.equal(h.quest.phase, 'open', 'completion tore down the room mid-line');
  h.dialogue.finish();
  h.quest.update(0.05);
  assert.equal(h.quest.phase, 'done');
  assert.equal(h.quest.persisted.ending, ENDINGS.SHOT);
  assert.equal(h.quest.persisted.card, true);
  assert.equal(h.quest.persisted.informant, 'Vincent Mallard');
  // The pistol does not leave the room on Numbskull's arm.
  assert.equal(h.quest.execution.gun, null, 'Numbskull walked the floor armed');
  // And the corpse still owns the left mouse button.
  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
  assert.equal(h.quest.press(), true, 'left mouse interacts through the corpse');
});
