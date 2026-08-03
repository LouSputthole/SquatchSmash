/**
 * LICENSE TO GRILL — the rules under the joke.
 *
 * The scene is a comedy, but it has an argument and the numbers carry it:
 * hitting James Blond is worth almost nothing because he does not care about
 * his body, and touching his belongings is worth a great deal because he cares
 * enormously about his things. The car is not a nudge, it is the end. If the
 * economy ever inverts, the scene stops teaching the player anything and turns
 * into an ordinary beating with better dialogue.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CHARACTER_IDS } from '../src/core/campaign.js';
import { CHARACTER_REGISTRY } from '../src/core/characters.js';
import {
  BELONGINGS,
  ENDINGS,
  INFORMANT_NAME,
  PRESSURE,
  QUEST,
  SHUBES_INTERRUPTION_AT,
  buildLicenseToGrillScript,
  createInterrogation,
} from '../src/bing/license-to-grill.js';

const valueOf = (v) => (typeof v === 'function' ? v() : v);

test('James Blond is a registered identity, not a scene-local walk-on', () => {
  /* He comes back later, immaculate, as though none of it happened — so he
   * needs one stable id the way everybody recurring does. */
  const blond = CHARACTER_REGISTRY[CHARACTER_IDS.JAMES_BLOND];
  assert.ok(blond, 'James Blond is not in the character registry');
  assert.equal(blond.canonicalName, 'James Blond');
  assert.equal(blond.subtitleName, 'Blond', 'he introduces himself surname first');
  assert.equal(blond.voiceProfile, 'blond');
  assert.equal(blond.species, 'human');
  assert.equal(blond.role, 'outsider', 'he is neither Family nor a bystander');
});

test('beating him is deliberately close to worthless', () => {
  const grill = createInterrogation();
  // Twenty swings of the cord, alternating, which is more patience than anyone
  // will actually spend.
  for (let i = 0; i < 10; i++) { grill.apply('chair'); grill.apply('strike'); }
  assert.ok(grill.pressure < 100, 'a player can beat him into breaking');
  assert.equal(grill.broken, false, 'physical force alone must never break him');
});

test('his things are worth several times his body', () => {
  const physical = Math.max(PRESSURE.chair, PRESSURE.strike);
  for (const item of ['watch', 'camera', 'pistol', 'jacket']) {
    assert.ok(PRESSURE[item] >= physical * 3,
      `${item} should be worth far more than a beating`);
  }
});

test('the one physical thing that works is the one that surprises him', () => {
  /* The unlabelled bottle. Everything else on that cart he has a line ready
   * for; this is the only one he has to think about. */
  const physical = ['chair', 'strike', 'tenderizer', 'ice', 'tongs'];
  for (const kind of physical) {
    assert.ok(PRESSURE.sauce > PRESSURE[kind], `sauce should beat ${kind}`);
  }
});

test('a trick only works the first time', () => {
  const grill = createInterrogation();
  const first = grill.apply('tongs');
  const second = grill.apply('tongs');
  assert.equal(first.gain, PRESSURE.tongs);
  assert.equal(second.gain, 0);
  assert.equal(second.repeat, true);
  // The cord is exempt: swinging it again is allowed to be pointless forever
  // rather than specially pointless.
  grill.apply('chair');
  assert.equal(grill.apply('chair').gain, PRESSURE.chair);
});

test('the car is not available until the player has been through his things', () => {
  const grill = createInterrogation();
  assert.equal(grill.carAvailable(), false, 'the discovery has to be earned');
  grill.apply('strike');
  assert.equal(grill.carAvailable(), false, 'hitting him teaches nothing about him');
  grill.apply('watch');
  assert.equal(grill.carAvailable(), true);
});

test('the car breaks him outright, with no threshold and no roll', () => {
  const grill = createInterrogation();
  grill.apply('watch');
  assert.equal(grill.threatenCar(), true);
  assert.equal(grill.broken, true);
  assert.equal(grill.persist().informant, INFORMANT_NAME);
  // And it cannot be done twice.
  assert.equal(grill.threatenCar(), false);
});

test('breaking is the only way to get the name', () => {
  const grill = createInterrogation();
  for (const kind of Object.keys(PRESSURE)) grill.apply(kind);
  assert.equal(grill.broken, false);
  assert.equal(grill.persist().informant, null, 'the name leaked without the car');
});

test('Shubes walks in once, at the worst moment, and never after he breaks', () => {
  const grill = createInterrogation();
  assert.equal(grill.shubesDue(), false, 'too early for mozzarella sticks');
  while (grill.pressure < SHUBES_INTERRUPTION_AT) grill.apply('chair');
  assert.equal(grill.shubesDue(), true);
  grill.markShubes();
  assert.equal(grill.shubesDue(), false, 'he must not keep coming back');

  const broken = createInterrogation();
  broken.apply('watch');
  broken.threatenCar();
  assert.equal(broken.shubesDue(), false, 'the interruption is dead once it is over');
});

test('the counterattack answers move Gratin, and silence is worth as much as the cold one', () => {
  const cold = createInterrogation();
  cold.answerCounter('cold', 2);
  const silent = createInterrogation();
  silent.answerCounter('silence', 2);
  const joke = createInterrogation();
  joke.answerCounter('joke', 1);
  assert.equal(cold.state.respect, silent.state.respect);
  assert.ok(cold.state.respect > joke.state.respect);
});

test('each ending records what it should and nothing it should not', () => {
  const left = createInterrogation();
  left.apply('watch'); left.threatenCar();
  const leftOut = left.finish(ENDINGS.LEFT);
  assert.equal(leftOut.ending, ENDINGS.LEFT);
  assert.equal(leftOut.compassion, false);
  assert.equal(leftOut.card, false, 'the card only comes off the body');

  const untied = createInterrogation();
  untied.apply('watch'); untied.threatenCar();
  const untiedOut = untied.finish(ENDINGS.UNTIED);
  assert.equal(untiedOut.compassion, true, 'untying a hand is the compassion flag');
  assert.ok(untiedOut.gratinRespect < 0, 'and it annoys Gratin');

  const shot = createInterrogation();
  shot.apply('watch'); shot.threatenCar();
  const shotOut = shot.finish(ENDINGS.SHOT, { cash: 340 });
  assert.equal(shotOut.card, true, 'Licensed to Grill comes off the body');
  assert.equal(shotOut.cash, 340);
});

test('the persisted payload is small and is all facts', () => {
  const grill = createInterrogation();
  grill.apply('sauce');
  grill.apply('jacket');
  grill.threatenCar();
  const out = grill.finish(ENDINGS.LEFT);
  assert.deepEqual(Object.keys(out).sort(), [
    'card', 'cash', 'compassion', 'completed', 'ending',
    'gratinRespect', 'informant', 'meet', 'methods', 'sawShubes',
  ]);
  assert.deepEqual(out.methods, ['jacket', 'sauce']);
  assert.equal(out.completed, true);
});

/* ---------------- the writing ---------------- */

const script = buildLicenseToGrillScript({});
const tree = script[CHARACTER_IDS.JAMES_BLOND];

test('every branch in the interrogation resolves to a real node', () => {
  const ids = new Set(Object.keys(tree));
  for (const [id, node] of Object.entries(tree)) {
    for (const option of valueOf(node.options) || []) {
      if (typeof option.next === 'string') {
        assert.ok(ids.has(option.next), `${id} offers a route to missing node ${option.next}`);
      }
    }
    if (typeof node.next === 'string') {
      assert.ok(ids.has(node.next), `${id} continues into missing node ${node.next}`);
    }
  }
});

test('he introduces himself surname first, and Gratin does not care', () => {
  assert.match(valueOf(tree.open.line), /^Blond\. James Blond\./);
  assert.match(valueOf(tree.resume.line), /résumé/);
});

test('the Shubenator interruption uses his authored signature take, not a new line', () => {
  assert.equal(valueOf(tree.shubesEnters.line), 'Hey guys, what’s going on?');
  assert.match(String(valueOf(tree.shubesEnters.cue)), /shubenator\.signature/);
  // And the whole bit is there, including the second entrance.
  assert.match(valueOf(tree.shubesReturns.line), /lock this/);
  assert.match(valueOf(tree.shubesFrozen.line), /frozen/);
});

test('the useless question is answered and then punished', () => {
  assert.match(valueOf(tree.qHair.line), /Sea salt, discipline/);
  assert.match(valueOf(tree.hairAgain.line), /Hit him again/);
});

test('nobody actually uses the tenderiser on him', () => {
  /* He gets the line, Gratin gets the better one, and it lands on the cart.
   * The scene is uncomfortable and ridiculous, not a torture simulator. */
  assert.match(valueOf(tree.useTenderizer.line), /international convention/);
  assert.match(valueOf(tree.tenderizerGratin.line), /own conventions/);
});

test('the door line and the objective read the way the quest is named', () => {
  assert.equal(QUEST.door, 'Help Au Gratin with a delicate matter');
  assert.equal(QUEST.objective, 'Make James Blond talk');
  assert.match(valueOf(script.licenseToGrillDoor.knocking.line), /second set of hands/);
});

test('the later callback exists and he leaves the moment the car is mentioned', () => {
  const callback = script.licenseToGrillCallback;
  assert.match(valueOf(callback.open.line), /interrogation technique/);
  const reply = (valueOf(callback.open.options) || []).find((o) => /silver car/.test(o.text));
  assert.ok(reply, 'the player cannot ask about the car');
  assert.equal(reply.next, 'walksAway');
});

test('every belonging has somewhere to go', () => {
  const ids = new Set(Object.keys(tree));
  for (const item of BELONGINGS) {
    assert.ok(ids.has(item.node), `${item.id} points at missing node ${item.node}`);
  }
});
