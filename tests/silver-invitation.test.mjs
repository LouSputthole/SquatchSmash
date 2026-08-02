import assert from 'node:assert/strict';
import test from 'node:test';

import { Mission } from '../src/silver/mission.js';
import { buildScripts } from '../src/silver/script.js';

function scriptsFor(mission) {
  return buildScripts({
    mission,
    flags: mission.flags,
    woo: { score: 90 },
    fire() {}, tip() {}, money: () => 1000, drunkLevel: () => 0,
    knows: () => false, remember() {}, order() {}, serveTable() {},
    startTableCutscene() {}, startSway() {}, playRequest() {},
    holdTheRoom() {}, releaseTheRoom() {}, judgeInvitation() {},
  });
}

const wooReport = {
  snapshot: () => ({ score: 90, band: 'good', streak: false, tips: [] }),
};

test('the final menu plainly separates seeing Margo again from taking her home', () => {
  const mission = new Mission();
  const options = scriptsFor(mission).invitation.open.options();
  const seeAgain = options.find((option) => option.tone === 'See her again');
  const takeHome = options.find((option) => option.tone === 'Take her home');

  assert.ok(seeAgain);
  assert.ok(takeHome);
  seeAgain.effect();
  assert.equal(mission.flags.invitation, 'see-again');
  takeHome.effect();
  assert.equal(mission.flags.invitation, 'home');
});

test('every dessert answer closes the meal and unlocks the final question', () => {
  for (const tone of ['Yes', 'Ask her', 'No']) {
    const mission = new Mission();
    const option = scriptsFor(mission).waiter.dessert.options.find((item) => item.tone === tone);
    assert.ok(option, tone);
    option.effect?.();
    assert.ok(mission.flags.dessert, tone);
  }
});

test('the legacy invitation shortcut cannot bypass dessert', () => {
  const mission = new Mission();
  mission.state = 'performance';
  mission.inState = 120;
  mission.flags.showStarted = true;
  mission.roundsDone = new Set(['entrance', 'drinks', 'family', 'personal']);

  assert.equal(mission.invitationReady, false);
  assert.equal(mission.offerInvitation(), false);
  assert.equal(mission.state, 'performance');

  mission.flags.dessert = 'figs';
  assert.equal(mission.invitationReady, true);
  assert.equal(mission.offerInvitation(), true);
  assert.equal(mission.state, 'invitation');
});

test('the champagne waiter identifies and points to its sender before Ape arrives', () => {
  const mission = new Mission();
  const beat = scriptsFor(mission).scenes.champagne.find((item) => item.who === 'the waiter');
  assert.match(beat.line, /pillar/i);
  assert.match(beat.line, /points/i);
});

test('the completion report only hands Margo to the apartment after an accepted home invite', () => {
  const mission = new Mission();
  mission.flags.outcome = 'strong';
  mission.flags.invitation = 'home';
  assert.equal(mission.persist(wooReport).tookMargoHome, true);

  mission.flags.invitation = 'see-again';
  assert.equal(mission.persist(wooReport).tookMargoHome, false);
  const answer = scriptsFor(mission).invitation.strong.line;
  assert.match(typeof answer === 'function' ? answer() : answer, /see you|call/i);
});
