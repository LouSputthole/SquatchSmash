/**
 * THE WHIP IN LOU'S BASEMENT, AND THE RULE ABOUT WHO IT CAN REACH.
 *
 * Owner playtest, 2026-08-05, verbatim: *"I could only whip Xxx once and it
 * was when I clicked on gratin, gratin should give me the whip then I can just
 * click on XXX to do it. Need an ouch or a scream reaction then the voice line
 * and a blood and impact effect as well."*
 *
 * Every one of those clauses is a check below, driven through the interaction
 * handlers the game actually registers rather than through the module's own
 * conveniences — `press Gratin` and `press xXx` here are the same two objects
 * a mouse click resolves to in the browser.
 *
 * It is a headless test on purpose. `verify:mansion` proves the house renders
 * and is staffed, but it cannot press a whip six times and count the blood;
 * this can, in eleven milliseconds, and it is the thing that will fail if
 * somebody collapses the handover and the swing back into one verb.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { mountMansionCast } from '../src/mansion/cast.js';
import { SEQUENCES } from '../src/mansion/script.js';

/** Where the laboratory hangs him. Any numbers; the module derives from them. */
const XXX_AT = { x: -23.35, y: -6.6, z: 51.5 };

/**
 * The half of the laboratory handle this module reads.
 *
 * Deliberately NOT `mission/contract-lab.js`: that is the contract the MISSION
 * drives and it has no `xxx` on it at all. This is the cast's own much smaller
 * ask — where the man is hanging, a mesh to point at, and a mouth.
 */
function fakeLab() {
  const aim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.4));
  aim.position.set(XXX_AT.x, XXX_AT.y + 1.0, XXX_AT.z);
  aim.updateMatrixWorld(true);
  const said = [];
  return {
    aim,
    said,
    anchors: {
      stairFoot: { x: -18.05, y: -6.6, z: 55.1 },
      transferTable: { x: -36.2, y: -6.6, z: 52.5 },
      glassDoor: { x: -32.9, y: -6.6, z: 50.5 },
      crossOpening: { x: -27.4, y: -6.6, z: 52.9 },
    },
    xxx: {
      at: { ...XXX_AT },
      aim,
      rig: { ankleY: XXX_AT.y + 2.2 },
      say: (cue, opts) => { said.push({ cue, opts }); return true; },
      get alive() { return true; },
    },
  };
}

/** An InteractionSystem the way the real one behaves: one handler per object. */
function fakeInteraction() {
  const registrations = [];
  return {
    registrations,
    register(object, config) {
      /* The real one writes userData.interact, so a second registration
       * REPLACES the first. Modelled exactly, so a double-register shows up
       * here as a lost handler rather than as a passing test. */
      registrations.push(object);
      object.userData.interact = config;
    },
    unregister(object) { delete object.userData.interact; },
  };
}

function mount() {
  const scene = new THREE.Scene();
  const camera = new THREE.Object3D();
  const lab = fakeLab();
  const interaction = fakeInteraction();
  const lines = [];
  const hud = {
    instruction: '',
    showLine: (line) => lines.push(line),
    hideLine: () => {},
    setInstruction: (text) => { hud.instruction = text; },
    text: () => ({ instruction: hud.instruction }),
  };
  const cast = mountMansionCast(scene, { colliders: [] }, {
    interaction, camera, lab, hud, player: { position: new THREE.Vector3() },
  });
  /* What a mouse click resolves to, for each of the two men. */
  const gratinGroup = cast.people.gratin.group;
  return {
    scene,
    camera,
    lab,
    cast,
    lines,
    hud,
    interaction,
    pressGratin: () => gratinGroup.userData.interact.onUse(),
    pressXxx: () => lab.aim.userData.interact.onUse(),
    gratinLabel: () => {
      const l = gratinGroup.userData.interact.label;
      return typeof l === 'function' ? l() : l;
    },
    xxxLabel: () => {
      const l = lab.aim.userData.interact.label;
      return typeof l === 'function' ? l() : l;
    },
    /** Run the swing out to the end of its arc. */
    settle: (seconds = 1.2) => { for (let t = 0; t < seconds; t += 1 / 60) cast.update(1 / 60); },
    count: (name) => {
      let n = 0;
      scene.traverse((o) => { if (o.name === name) n++; });
      return n;
    },
  };
}

test('Gratin hands the cord over — clicking him is not a swing', () => {
  const r = mount();
  assert.equal(r.gratinLabel(), 'Take the <b>cord</b>');
  assert.equal(r.cast.debug.gratin.handed, false);
  assert.equal(r.cast.debug.gratin.hasCord, false);

  r.pressGratin();

  assert.equal(r.cast.debug.gratin.handed, true, 'Gratin did not hand it over');
  assert.equal(r.cast.debug.gratin.hasCord, true, 'the cord is not in the player’s hand');
  assert.equal(r.cast.debug.gratin.swings, 0, 'pressing Gratin swung it — that is the bug');
  assert.ok(
    r.cast.debug.spoken.includes(SEQUENCES.tortureHandover[0].cue),
    'he handed it over without saying anything',
  );
  assert.match(r.hud.instruction, /xXx/, 'the instruction does not name the man you swing at');
});

test('the cord cannot be swung before it has been handed over', () => {
  const r = mount();
  assert.equal(r.pressXxx(), false, 'xXx took a swing from a player with empty hands');
  r.settle();
  assert.equal(r.cast.debug.gratin.swings, 0);
  assert.equal(r.count('mansion.whipBlood'), 0);
});

test('THE BUG: once he has it, the whip works every single time', () => {
  const r = mount();
  r.pressGratin();

  for (let i = 1; i <= 6; i++) {
    assert.equal(r.pressXxx(), true, `swing ${i} was refused`);
    r.settle();
    assert.equal(r.cast.debug.gratin.swings, i, `swing ${i} did not land`);
    assert.equal(r.cast.debug.gratin.hasCord, true, `the cord left his hand after swing ${i}`);
  }
});

test('the house rule gates a second HANDOVER, not a second hit', () => {
  const r = mount();
  r.pressGratin();
  r.settle(5);
  r.pressXxx();
  r.settle(12);

  const before = r.cast.debug.spoken.length;
  r.pressGratin();
  r.settle(3);
  const saidAfter = r.cast.debug.spoken.slice(before);
  assert.ok(
    saidAfter.includes(SEQUENCES.tortureOneEach[0].cue),
    'asking for a second cord did not get the house rule',
  );
  /* And the one he already has still works. */
  assert.equal(r.pressXxx(), true);
  r.settle();
  assert.equal(r.cast.debug.gratin.swings, 2);
});

test('the reaction is involuntary and comes before he chooses to speak', () => {
  const r = mount();
  r.pressGratin();
  /* Swing while Gratin is still mid-sentence — the crack has to cut him off,
   * not wait politely behind him. That was a real fault: interjecting queued
   * the noise four seconds after the blood. */
  r.pressXxx();
  r.settle(12);

  const spoken = r.cast.debug.spoken;
  const ouch = spoken.indexOf(SEQUENCES.tortureSwing[1].cue);
  const line = spoken.indexOf(SEQUENCES.tortureSwing[2].cue);
  assert.ok(ouch >= 0, 'he took it in silence');
  assert.ok(line >= 0, 'he never said his line');
  assert.ok(ouch < line, 'he made his point before he made a noise');

  /* THE SPEC'S LINE IS ON THE FIRST HIT (owner playtest). It used to be a
   * proximity bark for walking down the corridor, which spent the two best
   * lines in the beat on having arrived. Word for word, both of them, off
   * ONE swing. */
  const texts = r.lines.map((l) => l.text);
  assert.ok(
    texts.includes('You can take the car… you can take the mission…'),
    'the first hit did not get the spec line',
  );
  assert.ok(texts.includes('But you don’t turn your back on family.'));
});

test('the second hit is the reply, not a competing thesis', () => {
  const r = mount();
  r.pressGratin();
  r.pressXxx();
  r.settle(14);
  r.pressXxx();
  r.settle(16);

  const texts = r.lines.map((l) => l.text);
  assert.ok(texts.includes('You hit like family.'));
  assert.ok(texts.includes('That’s not a compliment. That’s just what they do.'));
});

test('THE STOW: the cord can be put away, and a put-away cord does not swing', () => {
  const r = mount();
  r.pressGratin();
  assert.equal(r.cast.debug.gratin.hasCord, true);
  assert.equal(r.cast.debug.gratin.cordInHand, true, 'it did not arrive in his hand');

  /* The inventory left its slot. Owner playtest: this used to be impossible
   * — the cord was parented to the camera at the handover and stayed in shot
   * for the rest of the mission. */
  r.cast.setCordInHand(false);
  assert.equal(r.cast.debug.gratin.cordInHand, false);
  assert.equal(r.cast.debug.gratin.cordVisible, false, 'a stowed cord is still on screen');

  /* And it cannot be swung while it is away, WITHOUT being conjured back:
   * the slot is the player's, and a swing that un-stows it takes his
   * selection off him. */
  const before = r.cast.debug.gratin.swings;
  assert.equal(r.pressXxx(), false, 'he swung a cord that is in his pocket');
  r.settle();
  assert.equal(r.cast.debug.gratin.swings, before);
  assert.equal(r.cast.debug.gratin.cordInHand, false, 'the swing un-stowed it');

  /* Back in hand, and it works again. He still HAS it throughout — the house
   * rule is on the handover, not on the slot. */
  r.cast.setCordInHand(true);
  assert.equal(r.cast.debug.gratin.cordVisible, true);
  assert.equal(r.pressXxx(), true);
  r.settle();
  assert.equal(r.cast.debug.gratin.swings, before + 1);
});

test('every swing lands blood, and it collects on the floor under him', () => {
  const r = mount();
  r.pressGratin();

  r.pressXxx();
  /* Mid-flight: blood is in the air before it is anywhere else. */
  for (let t = 0; t < 0.75; t += 1 / 60) r.cast.update(1 / 60);
  assert.ok(r.count('mansion.whipBlood') > 0, 'nothing came off him');
  assert.equal(r.count('mansion.whipImpact'), 1, 'no impact effect');

  r.settle(3);
  assert.equal(r.count('mansion.whipBlood'), 0, 'droplets never landed or expired');
  const afterOne = r.cast.debug.gratin.bloodMarks;
  assert.ok(afterOne > 0, 'no blood reached the floor');

  r.pressXxx();
  r.settle(3);
  assert.ok(
    r.cast.debug.gratin.bloodMarks > afterOne,
    'a second hit left no more blood than the first',
  );
});

test('the blood comes off where the man actually is, not off a typed number', () => {
  const r = mount();
  /* Re-hang him a metre away. Nothing in the cast is told. */
  r.lab.aim.position.x += 1.0;
  r.lab.aim.updateMatrixWorld(true);

  r.pressGratin();
  r.pressXxx();
  for (let t = 0; t < 0.7; t += 1 / 60) r.cast.update(1 / 60);

  const drops = [];
  r.scene.traverse((o) => { if (o.name === 'mansion.whipBlood') drops.push(o); });
  assert.ok(drops.length > 0);
  const cx = drops.reduce((s, d) => s + d.position.x, 0) / drops.length;
  assert.ok(
    Math.abs(cx - r.lab.aim.position.x) < 1.0,
    `blood sprayed at ${cx.toFixed(2)}, but he is hanging at ${r.lab.aim.position.x}`,
  );
});

test('THE STANDING RULE: the cord can be pointed at exactly one man, and it is not Snow', () => {
  const r = mount();

  assert.equal(r.cast.debug.snowIsATarget, false);
  assert.deepEqual(r.cast.debug.whipTargets, ['lab.xxx.aim'],
    'something other than the man on the rope is reachable by the whip');

  /* Snow IS in this house and you can look at him — that is the point of him.
   * The rule is that nothing you can do to him is an ACTION: his registration
   * carries a label to read and no `onUse` to press. */
  const snow = r.cast.snow;
  assert.ok(snow, 'Snow is not in the house');
  const snowHandler = snow.group.userData.interact;
  assert.ok(snowHandler?.label, 'Snow cannot even be looked at');
  assert.equal(snowHandler.onUse, undefined,
    'Snow has become something the player can DO something to');

  /* And the swing is reachable from exactly one registered object.
   *
   * THE TALKERS ARE EXCLUDED BY LOOKING THEM UP, not by name and not by a
   * hand-kept list of three. Everybody `cast.js` posts with an `onUse` is
   * somebody you can SPEAK to; the whip is the one `onUse` in the house that
   * is not a conversation, and that is the claim. A literal list of talkers
   * has to be edited every time a man is posted — it was edited into
   * existence for Gratin, the door man and the bartender, and the moment the
   * gate booth got a guard it was three names short and this test failed for
   * a reason that had nothing to do with the whip.
   *
   * AND NOT `deepEqual` ON SCENE GRAPHS. That is the important half. When
   * this assertion failed, `assert.deepEqual` walked two THREE.Group objects
   * — parents, children, geometries, every Float32Array — comparing them
   * structurally, and took the machine to 15.4 GB of resident memory before
   * the kernel killed node. `npm test` reported 597 of 909 tests and a
   * SIGKILL, which looks exactly like the runner trap in
   * docs/ENGINE-TRAPS.md #6 and is not it. Compare NAMES: the assertion says
   * the same thing, and its failure costs a line of text. */
  const talkers = new Set(Object.values(r.cast.people).map((npc) => npc.group));
  const swingable = r.interaction.registrations
    .filter((o) => o.userData.interact?.onUse && !talkers.has(o));
  assert.deepEqual(
    swingable.map((o) => o.name || '(unnamed)'),
    [r.lab.aim.name || '(unnamed)'],
    'more than one object can start a swing',
  );
  assert.equal(swingable[0], r.lab.aim, 'the one swingable object is not xXx');
});

test('nobody is registered twice — a second registration would replace the first', () => {
  const r = mount();
  const seen = new Set();
  for (const object of r.interaction.registrations) {
    assert.ok(!seen.has(object), `${object.name || 'an object'} was registered twice`);
    seen.add(object);
  }
});

test('the Family is in the house, each with a wardrobe body and nothing typed in', () => {
  const r = mount();
  const ids = Object.keys(r.cast.people);
  for (const who of [
    'lou', 'booski', 'deathmegatron', 'irish', 'rippin', 'eric', 'shubes',
    'sasole', 'numbskull', 'hogmama',
  ]) {
    assert.ok(ids.includes(who), `${who} is not in the house`);
  }
  /* THE DEAD ARE NOT IN THE HOUSE.
   *
   * Willy sat in the boardroom until 2026-08-05, three hours early for a
   * meeting, saying he came at nine to get the good chair. NO WAKE is Day 3
   * and the mansion arc is after it, and NO WAKE is the mission where Lou has
   * him executed in the cabin of a boat -- so the player was meeting somebody
   * he had watched die. Billy HotDog is the same problem one scene earlier.
   *
   * This assertion is the reason it cannot come back by accident. */
  for (const ghost of ['willy', 'billy', 'billyhotdog', 'hotdog']) {
    assert.ok(!ids.includes(ghost), `${ghost} died before this scene and is standing in it`);
  }
  /* The two Lous are two men, on two floors, in two bodies. */
  const lou = r.cast.people.lou;
  const sasole = r.cast.people.sasole;
  assert.notEqual(lou.group.position.y, sasole.group.position.y);
  assert.notEqual(
    lou.group.userData.npc.height, sasole.group.userData.npc.height,
    'Big Uncle Lou and Captain Lou Sasole have merged into one body',
  );
});
