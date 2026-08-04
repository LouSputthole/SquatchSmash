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

import { isBingPreloadCue } from '../src/bing/audio.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import { PRESSURE, SWINGS_BEFORE_THE_TABLE } from '../src/bing/license-to-grill.js';
import { createLicenseToGrill } from '../src/bing/license-to-grill-runtime.js';

/** The store room's real coordinates, from src/bing/club.js. */
const CHAIR = { x: 9.6, z: -12.3 };
const DOOR = { x: 6.75, z: -9.5 };
const TABLE = { x: 9.9, y: 0.815, z: -10.15 };

function harness() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const played = [];
  const said = [];
  const started = [];

  const audio = {
    play: (name) => played.push(name),
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
    toast: () => {},
    setHand(item) { this.hand = item; },
  };
  const dialogue = {
    active: false,
    log: started,
    start(tree, at) {
      started.push(at);
      this.active = true;
      /* Play the node's `enter` the way the real Dialogue does — that is where
       * the interrogation's methods are registered. */
      tree?.[at]?.enter?.();
    },
    finish() { this.active = false; },
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
    },
  };
  const inventory = { added: [], add(id) { this.added.push(id); return true; } };
  const club = {
    colliders: [],
    anchors: {
      grillTable: new THREE.Vector3(TABLE.x, TABLE.y, TABLE.z),
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
    inventory, club, played, said, started, registered, standAt, swingThrough, padFor,
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

test('Gratin shouts through the door before it is ever opened', () => {
  /* Owner's note: *"I also didn't hear gratin yell when I went near the
   * door."* The line has existed since the quest landed and nothing played
   * it. */
  const h = harness();
  h.standAt(0, 0);
  h.quest.update(0.05);
  assert.equal(h.started.length, 0);
  h.standAt(DOOR.x, DOOR.z + 2.0);
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
  const take = h.quest.script[CHARACTER_IDS.JAMES_BLOND].handOverCord.options[0];
  take.next();
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
  h.quest.script[CHARACTER_IDS.JAMES_BLOND].handOverCord.options[0].next();
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

test('the whip lands when he is standing over the man, and not when he is not', () => {
  /* Owner's note: *"I want to be able to whip him on command."* No prompt, no
   * timing bar: the button swings, and where he is standing decides. */
  const h = walkIn(harness());
  h.quest.script[CHARACTER_IDS.JAMES_BLOND].handOverCord.options[0].next();

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
  h.quest.script[CHARACTER_IDS.JAMES_BLOND].handOverCord.options[0].next();
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
  assert.equal(h.quest.state.pressure, before + PRESSURE.smash);
  assert.equal(h.quest.held, null);
  const wreck = h.quest.table.get('watch').wreck;
  assert.ok(wreck, 'the watch simply vanished');
  assert.ok(wreck.children.length > 3, 'the wreckage is one lump');
  assert.equal(h.quest.table.get('watch').group.visible, false);
  // And the pad refuses to hand it back.
  assert.equal(h.padFor('what is left').userData.interact.enabled(), false);
});

test('the cord never takes the left button outside the store room', () => {
  /* He keeps it for the rest of the evening, and out on the floor left click
   * is the club's second interact key: a slot machine has to stay clickable. */
  const h = walkIn(harness());
  h.quest.script[CHARACTER_IDS.JAMES_BLOND].handOverCord.options[0].next();
  h.standAt(-8, 2);                       // the dance floor
  assert.equal(h.quest.press(), false);
  h.standAt(6.9, 1.0);                    // the hallway
  assert.equal(h.quest.press(), false);
  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
  assert.equal(h.quest.press(), true);
});

test('the cord is the fallback for the left button, and the thing in his hands wins', () => {
  const h = walkIn(harness());
  h.standAt(CHAIR.x, CHAIR.z + 1.1, CHAIR);
  // Before Gratin hands it over, the left button belongs to the club.
  assert.equal(h.quest.press(), false);
  h.quest.script[CHARACTER_IDS.JAMES_BLOND].handOverCord.options[0].next();
  assert.equal(h.quest.press(), true, 'the cord does not swing');
  for (let i = 0; i < 20; i++) h.quest.update(0.05);
  h.padFor('pistol').userData.interact.onUse();
  h.dialogue.finish();
  h.quest.press();
  assert.equal(h.started.at(-1), 'smashPistol', 'the cord swung with his pistol in hand');
});

test('the room is put back the way it was found, and the cord is kept', () => {
  const h = harness();
  const gratin = h.family.byId[CHARACTER_IDS.GRATIN];
  const home = gratin.group.position.clone();
  walkIn(h);
  assert.notDeepEqual(gratin.group.position.toArray(), home.toArray(),
    'Gratin never came off the floor');
  h.quest.script[CHARACTER_IDS.JAMES_BLOND].handOverCord.options[0].next();
  h.padFor('wristwatch').userData.interact.onUse();
  h.quest.close();
  assert.deepEqual(gratin.group.position.toArray(), home.toArray(), 'Gratin never went back to his booth');
  assert.equal(h.quest.held, null, 'he walked out holding a dead spy’s watch');
  assert.equal(h.quest.table.get('watch').group.visible, true);
  assert.deepEqual(h.registered, [], 'the store room is still interactive after it is over');
  assert.deepEqual(h.inventory.added, ['cord'], 'Gratin took his cord back');
});
