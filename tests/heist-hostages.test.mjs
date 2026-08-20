import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTROLLED_STATES, Hostage, HostageDirector, createLobbyHostages,
} from '../src/heist/hostages.js';
import {
  BARK_POOL_FLOOR, HOSTAGE_BARKS, PROSPECT_VERB_LINES, dialogueLine,
} from '../src/heist/script.js';

function calm() { return new Hostage({ id: 'h1', nerve: 0.2, valuables: 200 }); }
function nervy() { return new Hostage({ id: 'h2', nerve: 0.9, valuables: 200 }); }

test('a muzzle is noticed once, and turns a bystander into somebody begging', () => {
  const person = calm();
  assert.equal(person.state, 'ambient');
  assert.equal(person.aim(0.05, { distance: 5 }), null, 'reacts before anybody could see it');
  let event = null;
  for (let i = 0; i < 40 && !event; i++) event = person.aim(0.05, { distance: 5 });
  assert.equal(event, 'plead');
  assert.equal(person.state, 'pleading');
  // And only once: the bark does not retrigger every frame the gun is up.
  assert.equal(person.aim(0.05, { distance: 5 }), null);
});

test('aiming down the sights frightens somebody faster than hip-firing at them', () => {
  const hip = calm();
  const aimed = calm();
  for (let i = 0; i < 5; i++) {
    hip.aim(0.05, { distance: 5 });
    aimed.aim(0.05, { distance: 5, aimedDownSights: true });
  }
  assert.ok(aimed.aimPressure > hip.aimPressure);
});

test('reassurance calms a person and survives being said to somebody already tied', () => {
  const person = calm();
  person.panic = 0.8;
  const result = person.reassure();
  assert.equal(result.ok, true);
  assert.ok(person.panic < 0.5);
  assert.ok(person.compliance > 0);
  assert.equal(person.reassured, true);
  const hard = nervy();
  assert.equal(hard.reassure().response, 'reassured_hard');
});

test('a calm stranger refuses to be robbed; a frightened one does not', () => {
  const person = calm();
  const refused = person.demand();
  assert.equal(refused.ok, false);
  assert.equal(refused.response, 'refuses');
  assert.equal(person.robbed, false);

  person.compliance = 0.9;
  const handed = person.demand();
  assert.equal(handed.ok, true);
  assert.equal(handed.amount, 200);
  assert.equal(person.robbed, true);
  // And they only have it once.
  assert.equal(person.demand().response, 'already_robbed');
});

test('robbing somebody undoes the work of reassuring them', () => {
  const person = calm();
  person.reassure();
  person.compliance = 0.9;
  person.demand();
  assert.equal(person.reassured, false);
});

test('order puts them on their knees, then flat; ties only work once they are down', () => {
  const person = calm();
  assert.equal(person.restrain().reason, 'not_down');
  assert.equal(person.order().state, 'kneeling');
  assert.equal(person.order().state, 'prone');
  assert.equal(person.restrain().ok, true);
  assert.equal(person.state, 'restrained');
  assert.equal(person.restrain().reason, 'already');
  assert.ok(CONTROLLED_STATES.includes(person.state));
});

test('a restrained person stops being a person the mission has to watch', () => {
  const person = nervy();
  person.order();
  person.order();
  person.restrain();
  for (let i = 0; i < 400; i++) {
    person.release(0.05);
    assert.equal(person.update(0.05, { control: 0 }), null);
  }
  assert.equal(person.state, 'restrained');
});

test('somebody left alone and not tied eventually goes for the door or the alarm', () => {
  // Somebody who keeps being frightened runs. Gunfire in the room is what
  // keeps topping their panic up, so the test does what the mission does.
  const runner = new Hostage({ id: 'r', nerve: 0.8 });
  runner.state = 'pleading';
  let event = null;
  for (let i = 0; i < 400 && !event; i++) {
    if (i % 20 === 0) runner.startle(0.5);
    runner.release(0.05);
    event = runner.update(0.05, { control: 0 });
  }
  assert.equal(event, 'bolting');

  const cool = new Hostage({ id: 'c', nerve: 0.8 });
  cool.state = 'kneeling';
  let coolEvent = null;
  for (let i = 0; i < 400 && !coolEvent; i++) {
    cool.release(0.05);
    coolEvent = cool.update(0.05, { control: 0 });
  }
  assert.equal(coolEvent, 'alarm');
});

test('holding the room keeps everybody in it where they were put', () => {
  const person = new Hostage({ id: 'p', nerve: 0.8 });
  person.order();
  person.order();
  assert.equal(person.state, 'prone');
  for (let i = 0; i < 400; i++) {
    person.release(0.05);
    assert.equal(person.update(0.05, { control: 1, covered: true }), null);
  }
  assert.equal(person.state, 'prone');
});

test('the director totals the two numbers the mission is scored on', () => {
  const director = new HostageDirector(createLobbyHostages());
  assert.equal(director.hostages.length, 22);
  assert.equal(director.control, 0);
  for (const person of director.hostages.slice(0, 11)) { person.order(); person.order(); }
  assert.ok(Math.abs(director.control - 0.5) < 1e-9);
  for (const person of director.hostages.slice(0, 4)) director.restrain(person.id);
  assert.equal(director.summary().restrained, 4);

  director.hostages[20].compliance = 1;
  const robbed = director.demand(director.hostages[20].id);
  assert.equal(robbed.ok, true);
  assert.equal(director.summary().robbed, 1);
  assert.equal(director.summary().personalCashTaken, robbed.amount);

  assert.equal(director.fell(director.hostages[21].id), true);
  assert.equal(director.summary().casualties, 1);
  assert.equal(director.hostages[21].state, 'down');
});

test('gunfire spikes the whole room, and a tied person is past caring', () => {
  const director = new HostageDirector(createLobbyHostages());
  director.hostages[0].order();
  director.hostages[0].order();
  director.restrain(director.hostages[0].id);
  const before = director.hostages[0].panic;
  director.startleAll(0.8);
  assert.equal(director.hostages[0].panic, before);
  assert.ok(director.hostages[1].panic > 0);
});

test('a hostage snapshot round-trips through a checkpoint', () => {
  const director = new HostageDirector(createLobbyHostages());
  director.hostages[3].order();
  director.restrain(director.hostages[3].id);
  director.fell(director.hostages[4].id);
  const snapshot = JSON.parse(JSON.stringify(director.capture()));
  const restored = new HostageDirector(createLobbyHostages());
  restored.restore(snapshot);
  assert.equal(restored.hostages[3].state, 'restrained');
  assert.equal(restored.hostages[4].down, true);
  assert.equal(restored.casualties, 1);
  restored.reset();
  assert.equal(restored.casualties, 0);
  assert.equal(restored.hostages[3].state, 'ambient');
});

test('every hostage response and player verb has an authored line behind it', () => {
  const responses = new Set(['plead', 'plead_teller', 'reassured', 'reassured_hard',
    'reassured_tied', 'hands_over', 'refuses', 'already_robbed', 'tied', 'caught', 'witness']);
  for (const key of responses) {
    assert.ok(HOSTAGE_BARKS[key]?.length, `no bark pool for ${key}`);
    for (const id of HOSTAGE_BARKS[key]) {
      assert.ok(dialogueLine(id), `${id} is not an authored line`);
    }
  }
  for (const [verb, pool] of Object.entries(PROSPECT_VERB_LINES)) {
    assert.ok(pool.length, `no line for ${verb}`);
    for (const id of pool) assert.ok(dialogueLine(id), `${id} is not an authored line`);
  }
});

test('no pool is small enough to be heard as a repeat', () => {
  /* Owner, twice: "takedown VO is two lines repeating" and "customer VO
   * repeats too much". Both were pool SIZE, not rotation — `order` and
   * `restrain` held one line each, so putting a room of twenty-two down and
   * tying eight of them was two sentences forty times. */
  const pools = { ...HOSTAGE_BARKS, ...PROSPECT_VERB_LINES };
  for (const [key, floor] of Object.entries(BARK_POOL_FLOOR)) {
    const pool = pools[key];
    assert.ok(pool, `BARK_POOL_FLOOR names a pool that does not exist: ${key}`);
    assert.ok(pool.length >= floor,
      `${key} is down to ${pool.length} line(s); the floor is ${floor}`);
    assert.equal(new Set(pool).size, pool.length, `${key} lists the same line twice`);
  }
});

test('the two verbs the player presses most often are the two with the most lines', () => {
  // Tap-E and hold-E, on twenty-two people. If anything is going to be heard
  // as a repeat it is these.
  assert.ok(PROSPECT_VERB_LINES.order.length >= 4);
  assert.ok(PROSPECT_VERB_LINES.restrain.length >= 4);
});

test('a customer who reaches the doors is out of the room, not a hostage in it', () => {
  /* Owner: *"The customer animations are funky."* The plainest case: the
   * `bolting` pose runs a complete stride cycle and `HeistFigure`'s own
   * comment says the root "remains owned by the scene/navigation layer" — and
   * the bank has no navigation layer for customers, so a man who broke for
   * the door sprinted ON THE SPOT for the rest of the robbery.
   *
   * He runs now, and reaching the doors means something. This is the model
   * half: what a person who got out is, and is not.
   */
  const director = new HostageDirector(createLobbyHostages());
  const person = director.hostages[0];
  person.state = 'bolting';
  const witnessesBefore = director.witnesses;

  assert.equal(person.escaped, false);
  assert.equal(person.present, true);
  assert.equal(person.interactive, true);
  assert.equal(person.controlled, false, 'a man running for the door is not controlled');

  assert.equal(director.escaped_(person.id), true);
  assert.equal(person.escaped, true);
  assert.equal(person.present, false, 'somebody who left is still in the room');
  assert.equal(person.interactive, false, 'you can still order about a man who has gone');
  assert.equal(person.controlled, true, 'a man who has left the building is still a problem in it');
  assert.equal(director.escaped, 1);
  assert.equal(director.witnesses, witnessesBefore - 1,
    'the witness count did not drop when somebody left');
  assert.equal(director.escaped_(person.id), false, 'he escaped twice');

  /* THE MECHANICAL POINT. Once four customers are down the crew cannot leave
   * a lobby that can describe them (see `noteCustomerDown` in main.js). If an
   * escapee still counted as a witness, one runner would lock the crew in the
   * bank for good. */
  for (const other of director.hostages) {
    if (other !== person) director.fell(other.id);
  }
  assert.equal(director.witnesses, 0,
    'a lobby with one escapee in it can never be cleared');

  // Nobody who has gone keeps making decisions in a room he is not in.
  person.unwatched = 60;
  person.driftFor = 60;
  person.compliance = 0;
  assert.equal(person.update(1, { control: 0, covered: false }), null);

  // And a checkpoint carries it, or a restore resurrects him into the lobby.
  const restored = new HostageDirector(createLobbyHostages());
  restored.restore(director.capture());
  assert.equal(restored.get(person.id).escaped, true);
  assert.equal(restored.escaped, 1);
  assert.equal(restored.witnesses, 0);
});

test('a customer cannot escape after he has been shot', () => {
  const director = new HostageDirector(createLobbyHostages());
  const person = director.hostages[3];
  director.fell(person.id);
  assert.equal(director.escaped_(person.id), false, 'a body walked out of the bank');
  assert.equal(person.escaped, false);
  assert.equal(director.escaped, 0);
});
