/**
 * LICENSE TO GRILL — the rules under the joke.
 *
 * The scene is a comedy, but it has an argument and the numbers carry it:
 * hitting James Blond does not extract information because he does not care
 * about his body; seven landed hits only kill the source. Destroying one of
 * his belongings is the successful route because he cares enormously about
 * his things. The car remains an alternate unconditional break.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CHARACTER_IDS } from '../src/core/campaign.js';
import { CHARACTER_REGISTRY } from '../src/core/characters.js';
import {
  BELONGINGS,
  CART_TOOLS,
  ENDINGS,
  FATAL_HITS,
  INFORMANT_NAME,
  PRESSURE,
  QUEST,
  SHUBES_INTERRUPTION_AT,
  SWINGS_BEFORE_THE_TABLE,
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

test('seven landed physical hits kill Blond and close off the information', () => {
  const grill = createInterrogation();
  assert.equal(FATAL_HITS, 7);
  for (let i = 1; i < FATAL_HITS; i++) {
    const hit = grill.apply(i % 2 ? 'strike' : 'tenderizer');
    assert.equal(hit.hits, i);
    assert.equal(hit.fatal, false);
    assert.equal(grill.dead, false);
  }
  const fatal = grill.apply('strike');
  assert.equal(fatal.hits, FATAL_HITS);
  assert.equal(fatal.fatal, true);
  assert.equal(grill.dead, true);
  assert.equal(grill.broken, false, 'killing him is not extracting the name');
  const out = grill.finish(ENDINGS.BEATEN);
  assert.equal(out.completed, true, 'the side objective is resolved even though it failed');
  assert.equal(out.informant, null);
  assert.equal(out.meet, null);
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

test('the tenderiser gets a line off him and a better one off Gratin', () => {
  /* Picking it off the cart puts it in Tony's hands (see `CART_TOOLS` and
   * `license-to-grill-room.test.mjs`'s cart tests) rather than firing this
   * automatically — these are what play when it actually lands on him. */
  assert.match(valueOf(tree.useTenderizer.line), /international convention/);
  assert.match(valueOf(tree.tenderizerGratin.line), /own conventions/);
});

test('tool dialogue reacts to a landed runtime impact without counting it twice', () => {
  for (const tool of CART_TOOLS) {
    assert.equal(tree[tool.node].enter, undefined,
      `${tool.id} mutates the interrogation again when its reaction line starts`);
  }
});

test('the door line and the objective read the way the quest is named', () => {
  assert.equal(QUEST.door, 'Help Au Gratin with a delicate matter');
  assert.equal(QUEST.objective, 'Help Au Gratin in the back room');
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

/* ---------------- the room, not the menu ---------------- */

test('breaking one of his things is worth less than picking it up', () => {
  /* The argument, and the reason smashing is optional rather than the point:
   * what moves him is a stranger HOLDING the thing and deciding. Once it is in
   * pieces the decision has been made and there is nothing left to threaten. */
  for (const id of ['watch', 'camera', 'pistol', 'jacket']) {
    assert.ok(PRESSURE.smash < PRESSURE[id], `smashing the ${id} must not beat taking it`);
  }
  // And still not worth less than swinging a fryer cord at him.
  assert.ok(PRESSURE.smash > PRESSURE.strike);
});

test('a thing can only be broken once, and only if it can be broken at all', () => {
  const grill = createInterrogation();
  grill.apply('watch');
  const first = grill.smash('watch');
  assert.equal(first.gain, PRESSURE.smash);
  assert.equal(grill.smash('watch').gain, 0, 'it is already in pieces');
  assert.equal(grill.smash('watch').repeat, true);
  assert.equal(grill.isSmashed('watch'), true);
  // The keys carry no smashNode: they are what you threaten with, not what
  // you break.
  assert.equal(grill.smash('keys').gain, 0);
  assert.equal(grill.isSmashed('keys'), false);
});

test('breaking one of Blond’s possessions gets the information without killing him', () => {
  const grill = createInterrogation();
  grill.apply('watch');
  const result = grill.smash('watch');
  assert.equal(result.broke, true);
  assert.equal(grill.broken, true);
  assert.equal(grill.dead, false);
  const out = grill.persist();
  assert.equal(out.completed, true);
  assert.equal(out.informant, INFORMANT_NAME);
  assert.ok(out.meet);
});

test('the first resolved route wins: property information cannot turn into a late killing', () => {
  const grill = createInterrogation();
  grill.apply('watch');
  assert.equal(grill.smash('watch').broke, true);
  for (let i = 0; i < FATAL_HITS + 2; i++) grill.apply('strike');
  assert.equal(grill.dead, false, 'body attacks remained live after the informant broke');
  assert.equal(grill.hits, 0, 'post-resolution clicks were counted as interrogation hits');
  assert.equal(grill.persist().informant, INFORMANT_NAME);
});

test('a smashed possession routes directly into Blond giving up the information', () => {
  const brokenTree = buildLicenseToGrillScript({ broken: () => true })[CHARACTER_IDS.JAMES_BLOND];
  const lastReaction = {
    watch: 'smashWatchGratin',
    camera: 'smashCamera',
    pistol: 'smashPistolNumbskull',
    jacket: 'smashJacket',
  };
  for (const [id, node] of Object.entries(lastReaction)) {
    assert.equal(valueOf(brokenTree[node].next), 'breaks',
      `${id} strands the successful property route after its reaction`);
  }
});

test('the runtime only marks the name known after Blond has actually delivered it', () => {
  let named = false;
  const hooked = buildLicenseToGrillScript({ markNamed: () => { named = true; } })[
    CHARACTER_IDS.JAMES_BLOND
  ];
  assert.equal(named, false);
  assert.equal(typeof hooked.writtenDown.enter, 'function',
    'there is no durable boundary after the spoken name');
  hooked.writtenDown.enter();
  assert.equal(named, true);
});

test('breaking things is recorded in methods rather than in a new saved field', () => {
  const grill = createInterrogation();
  grill.apply('watch');
  grill.apply('jacket');
  grill.smash('watch');
  grill.threatenCar();
  const out = grill.finish(ENDINGS.LEFT);
  assert.deepEqual(Object.keys(out).sort(), [
    'card', 'cash', 'compassion', 'completed', 'ending',
    'gratinRespect', 'informant', 'meet', 'methods', 'sawShubes',
  ], 'the campaign payload must keep its shape');
  assert.deepEqual(out.methods, ['jacket', 'smashed:watch', 'watch']);
});

test('only the swings that land are counted', () => {
  const grill = createInterrogation();
  assert.equal(grill.swings(), 0);
  for (let i = 0; i < SWINGS_BEFORE_THE_TABLE; i++) grill.apply('strike');
  assert.equal(grill.swings(), SWINGS_BEFORE_THE_TABLE);
  /* A cord that cracks on the floor is `chair`, and so is Gratin's own
   * demonstration. Neither is Tony hitting the man, and his "you have done
   * that three times now" has to mean three the room watched. */
  grill.apply('chair');
  grill.apply('watch');
  assert.equal(grill.swings(), SWINGS_BEFORE_THE_TABLE);
});

test('searching him is no longer a menu', () => {
  /* Owner's playtest, 2026-08-04: *"instead of searching him with all these
   * different dialogue options … Gratin suggests you check out his belongings
   * on the table behind you, then each one you pick up triggers the voice
   * dialogue and then you have the option to smash it."* The `things` node and
   * every route into it are gone; the room does that job now. */
  assert.equal(Object.hasOwn(tree, 'things'), false, 'the search submenu is still there');
  for (const node of Object.values(tree)) {
    for (const option of valueOf(node.options) || []) {
      assert.notEqual(option.next, 'things');
      assert.doesNotMatch(option.text, /go through his things/i);
    }
  }
  // And the cart no longer offers a worse version of the cord you are holding.
  const cart = (valueOf(tree.cart.options) || []).map((o) => o.tone);
  assert.equal(cart.includes('Cord'), false, 'the cart still offers the cord');
});

test('every smashable thing has its own reaction, and the keys deliberately do not', () => {
  const ids = new Set(Object.keys(tree));
  for (const item of BELONGINGS) {
    if (item.id === 'keys') {
      assert.equal(item.smashNode, null, 'you do not smash the keys, you drive off in the car');
      continue;
    }
    assert.ok(item.smashNode, `${item.id} cannot be broken`);
    assert.ok(ids.has(item.smashNode), `${item.id} points at missing node ${item.smashNode}`);
    assert.ok(valueOf(tree[item.smashNode].line).length > 12, `${item.id} has no reaction worth hearing`);
  }
});

test('the cord is handed over as a thing, and the three swings after it are authored', () => {
  let handed = false;
  const withHook = buildLicenseToGrillScript({ takeCord: () => { handed = true; } });
  const hooked = withHook[CHARACTER_IDS.JAMES_BLOND];
  assert.equal(valueOf(hooked.handOverCord.options), undefined,
    'the handoff must not depend on a transient numbered dialogue choice');
  hooked.handOverCord.enter();
  assert.equal(hooked.handOverCord.next, 'cordInHand', 'the automatic handoff must lead somewhere');
  assert.equal(handed, true, 'hearing the handoff never reaches the runtime inventory');
  /* One line per landed swing, in order, and the third is where he gives up on
   * the beating and points at the table. */
  assert.ok(tree.afterSwing && tree.swingTwo && tree.swingThree);
  assert.equal(tree.swingThree.next, 'tableNudge');
  assert.match(valueOf(tree.tableNudgeTable.line), /table behind you/i);
  assert.ok(tree.swingAgain, 'a fourth swing has nothing to say');
  assert.ok(tree.swingWide, 'a swing that misses has nothing to say');
});

test('nobody is holding a box any more', () => {
  /* Numbskull laid the man out on the table; his thread has to say so, and it
   * must not hand the player a submenu that no longer exists. */
  const numbskull = script.licenseToGrillNumbskull;
  assert.match(valueOf(numbskull.open.line), /on that table/i);
  for (const node of Object.values(numbskull)) {
    for (const option of valueOf(node.options) || []) {
      assert.notEqual(valueOf(option.next), 'things');
    }
  }
  assert.match(valueOf(script.licenseToGrillGratin.needTools.line), /on the table by the door/i);
});
