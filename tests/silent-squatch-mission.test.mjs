/**
 * PROJECT SILENT SQUATCH — the mission's own checks.
 *
 * The laboratory is built by the environment pass; this drives the mission
 * against `src/mansion/mission/contract-lab.js`, which is the published API
 * written out as working code. So these prove the MISSION: that its beats
 * happen in the spec's order, that the player performs every one of the
 * actions the spec says makes him responsible, that the keypad — not the
 * mission — decides whether the door locks, that Aubbie dies on the player's
 * side of the glass, that the gassing runs through the spec's seven stages in
 * order, that the monitor reaches LIFE SIGNS: 0, and that what lands in the
 * campaign afterwards is what actually happened.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createContractLab } from '../src/mansion/mission/contract-lab.js';
import { createSilentSquatchMission } from '../src/mansion/mission/SilentSquatchMission.js';
import { BEAT_OF, S } from '../src/mansion/mission/SilentSquatchStateMachine.js';
import {
  INSTRUCTIONS, OBJECTIVES, SCIENTIST_INDEX, SEQUENCES, gainForVoice,
} from '../src/mansion/script.js';
import { createSilentSquatchStory } from '../src/core/silent-squatch-story.js';
import {
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  SILENT_SQUATCH_RESPECT,
  createCampaign,
} from '../src/core/campaign.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }

  getItem(key) { return this.values.get(key) ?? null; }

  setItem(key, value) { this.values.set(key, String(value)); }

  removeItem(key) { this.values.delete(key); }
}

const DT = 1 / 30;

/** A rig: a lab, a mission, and a hand on the clock. */
function rig({ story = null, zones = null } = {}) {
  const lab = createContractLab();
  const lines = [];
  const cases = [];
  const mission = createSilentSquatchMission({
    lab,
    story,
    zones,
    onLine: (line) => lines.push(line),
    onCase: (what) => cases.push(what),
  });
  const step = (seconds) => {
    for (let t = 0; t < seconds; t += DT) {
      lab.update(DT);
      mission.update(DT);
    }
  };
  /** Run until `pred()` or give up after `limit` simulated seconds. */
  const until = (pred, limit = 400) => {
    let t = 0;
    while (t < limit) {
      if (pred()) return true;
      lab.update(DT);
      mission.update(DT);
      t += DT;
    }
    return pred();
  };
  const atState = (name, limit) => until(() => mission.fsm.name === name, limit);
  const atInstruction = (text, limit) => until(() => mission.instruction === text, limit);
  return {
    lab, mission, lines, cases, step, until, atState, atInstruction,
  };
}

/**
 * Play the whole night, doing every action by hand, exactly once.
 *
 * `hooks` is `{ beat: fn }` — a chance for a test to look at the world at the
 * moment the mission is waiting on the player, which is the only moment any of
 * these beats can be inspected honestly.
 */
function playThrough(r, hooks = {}) {
  const { mission, atInstruction, atState } = r;
  const at = (name) => { if (typeof hooks[name] === 'function') hooks[name](); };
  mission.start();
  at('start');

  mission.arrive('office');
  assert.ok(atInstruction(INSTRUCTIONS.PLACE_CASE), 'never asked for the case on the desk');
  at('office');
  assert.equal(mission.placeCaseOnDesk(), true);

  assert.ok(atInstruction(INSTRUCTIONS.TAKE_CASE), 'Lou never slid it back');
  at('caseOpen');
  assert.equal(mission.takeCaseBack(), true);

  assert.ok(atInstruction(INSTRUCTIONS.BUST_SWITCH), 'never found the bust');
  at('bust');
  assert.equal(mission.pressBustSwitch(), true);

  assert.ok(atInstruction(INSTRUCTIONS.DELIVER_CASE, 200), 'never reached the transfer table');
  at('delivery');
  assert.equal(mission.deliverCase(), true);

  assert.ok(atInstruction(INSTRUCTIONS.KEYPAD, 400), 'never got the order to lock the lab');
  at('keypad');
  assert.equal(mission.enterCode('1234'), false, 'a wrong code must not lock the lab');
  assert.equal(mission.enterCode('6969'), true);

  assert.ok(atInstruction(INSTRUCTIONS.ELIMINATE_AUBBIE, 100), 'never told to handle it');
  at('execution');
  assert.equal(mission.shootAubbie(true), true);

  assert.ok(atInstruction(INSTRUCTIONS.SILENT_NIGHT, 200), 'never offered the switch');
  at('silentNight');
  assert.equal(mission.pullSilentNight(), true);

  assert.ok(atState(S.EXIT, 300), 'the gassing never finished');
  assert.ok(atInstruction(INSTRUCTIONS.RETURN_UPSTAIRS, 30), 'never sent back upstairs');
  at('exit');
  assert.equal(mission.leave(), true);
  assert.ok(atState(S.COMPLETE, 30), 'the wall never closed behind him');
}

test('the whole night plays, and the player performs every action himself', () => {
  const r = rig();
  playThrough(r);
  const report = r.mission.report();

  assert.equal(report.complete, true);
  assert.equal(report.beat, BEAT_OF.COMPLETE);

  /* The eleven beats of the spec, reached in order and none skipped. */
  const beats = report.history.map((name) => BEAT_OF[name]);
  assert.deepEqual(
    [...new Set(beats)], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    'the spec\'s eleven beats must all be reached, in order',
  );
  for (let i = 1; i < beats.length; i++) {
    assert.ok(beats[i] >= beats[i - 1], `beat went backwards at ${report.history[i]}`);
  }
});

test('the objectives are the spec\'s, in the spec\'s order', () => {
  const r = rig();
  playThrough(r);
  assert.deepEqual(r.mission.report().objectives, [
    OBJECTIVES.DELIVER_PACKAGE,
    OBJECTIVES.TAKE_TO_BOOSKI,
    OBJECTIVES.LOCK_THE_LAB,
    OBJECTIVES.ELIMINATE_AUBBIE,
    OBJECTIVES.ACTIVATE_SILENT_NIGHT,
    OBJECTIVES.RETURN_UPSTAIRS,
    '',
  ]);
});

test('the case is carried in, put on the desk by hand, picked back up, and delivered', () => {
  const r = rig();
  const { mission } = r;
  mission.start();
  assert.equal(mission.report().case.state, 'carried');

  /* It cannot be put down anywhere but on Lou's desk, and not before he has
   * asked for it. */
  assert.equal(mission.placeCaseOnDesk(), false, 'the case went down before the office');
  mission.arrive('office');
  r.atInstruction(INSTRUCTIONS.PLACE_CASE);
  assert.equal(mission.placeCaseOnDesk(), true);
  assert.equal(mission.report().case.state, 'desk');
  assert.equal(mission.placeCaseOnDesk(), false, 'it cannot be put down twice');

  r.atInstruction(INSTRUCTIONS.TAKE_CASE);
  assert.equal(mission.takeCaseBack(), true);
  assert.equal(mission.report().case.state, 'carried');

  assert.equal(mission.pressBustSwitch(), true);
  r.atInstruction(INSTRUCTIONS.DELIVER_CASE, 200);
  assert.equal(mission.deliverCase(), true);
  assert.equal(mission.report().case.delivered, true);

  /* And it goes through the wall into the lab, out of his hands for good. */
  assert.ok(r.until(() => mission.report().case.throughDrawer, 60));
  assert.equal(r.lab.transferDrawer.sent, 1);
  assert.equal(mission.report().case.state, 'gone');
  assert.deepEqual(
    r.cases.filter((c) => c !== 'open' && c !== 'close' && c !== 'slide'),
    ['carry', 'desk', 'carry', 'table', 'gone'],
  );
});

test('the keypad rejects a wrong code, and the keypad is what locks the door', () => {
  const r = rig();
  const { mission, lab } = r;
  mission.start();
  mission.arrive('office');
  r.atInstruction(INSTRUCTIONS.PLACE_CASE);
  mission.placeCaseOnDesk();
  r.atInstruction(INSTRUCTIONS.TAKE_CASE);
  mission.takeCaseBack();
  mission.pressBustSwitch();
  r.atInstruction(INSTRUCTIONS.DELIVER_CASE, 200);
  mission.deliverCase();
  r.atInstruction(INSTRUCTIONS.KEYPAD, 400);

  assert.equal(lab.doorLocked, false);
  assert.equal(mission.enterCode('6968'), false);
  assert.equal(mission.enterCode(''), false);
  assert.equal(mission.enterCode('69690'), false);
  assert.equal(lab.doorLocked, false, 'three wrong codes must leave the door open');
  assert.equal(lab.muffled, false, 'nothing is muffled while the door is open');
  assert.equal(mission.report().keypad.rejected, 3);

  assert.equal(mission.enterCode('6969'), true);
  assert.equal(lab.doorLocked, true);
  assert.equal(lab.muffled, true, 'the glass goes muffled the moment it locks');
  assert.deepEqual(mission.report().keypad.attempts, ['6968', '', '69690', '6969']);
});

test('Aubbie dies in the observation area, outside the glass, in front of them', () => {
  const r = rig();
  const { mission, lab } = r;
  playThrough(r, {
    keypad: null,
    execution: null,
  });
  const aubbie = lab.scientists[SCIENTIST_INDEX.AUBBIE];
  const report = mission.report();
  assert.equal(report.aubbie.killed, true);
  assert.equal(report.aubbie.side, 'observation');
  assert.equal(aubbie.side, 'observation', 'he must be through the glass door when he dies');
  assert.ok(aubbie.log.indexOf('stepOut') < aubbie.log.indexOf('collapse'));
  /* The other five are still behind the glass watching it happen. */
  for (const index of [1, 2, 3, 4, 5]) assert.equal(lab.scientists[index].side, 'lab');
});

test('he cannot be shot while he is still inside the lab', () => {
  const lab = createContractLab();
  const mission = createSilentSquatchMission({ lab });
  mission.start();
  /* Force the machine to the execution beat without ever opening the door,
   * which is the only thing that puts him on this side of the glass. */
  mission.fsm.go(S.EXECUTION);
  mission.update(DT);
  assert.equal(mission.aubbieOutside, false);
  assert.equal(mission.shootAubbie(true), false, 'he was killed through the glass');
  assert.equal(mission.report().aubbie.killed, false);
});

test('a shot that finds a console is not a shot that finds Aubbie', () => {
  const r = rig();
  const { mission } = r;
  playThrough(r, {
    execution: () => {
      assert.equal(mission.shootAubbie(false), false);
      assert.equal(mission.report().aubbie.killed, false);
      assert.equal(mission.report().aubbie.missedShots, 1);
    },
  });
  assert.equal(mission.report().aubbie.missedShots, 1);
});

test('the gassing runs the spec\'s seven stages, in the spec\'s order', () => {
  const r = rig();
  playThrough(r);
  assert.deepEqual(r.mission.report().gasStages, [
    'confusion',
    'panic',
    'covering',
    'choking',
    'slamming',
    'crawling',
    'collapsing',
  ]);
});

test('they go down one at a time, the last one leaves a handprint, and LIFE SIGNS reaches 0', () => {
  const r = rig();
  playThrough(r);
  const { lab, mission } = r;
  const report = mission.report();

  assert.equal(report.collapsed.length, 5, 'five people were in there when it locked');
  assert.equal(new Set(report.collapsed).size, 5, 'nobody collapsed twice');
  assert.equal(report.handprints, 1);
  assert.equal(lab.handprints, 1);
  /* The last one to the glass is the one who leaves it. */
  const last = lab.scientists[report.collapsed[report.collapsed.length - 1]];
  assert.ok(last.log.includes('handprint'));
  assert.ok(last.log.indexOf('handprint') < last.log.indexOf('collapse'));

  assert.equal(lab.lifeSigns, 0, 'the monitor must read LIFE SIGNS: 0');
  assert.equal(report.lifeSignsAtAftermath, 0);
  assert.equal(report.lifeSignsTimedOut, false);

  /* And the core is still running with everybody in there dead. */
  assert.equal(lab.core.finished, true);
  assert.equal(lab.monitors.purple, true);
});

test('the old one tries the handle first and then stops, while the others panic', () => {
  const r = rig();
  playThrough(r);
  const { lab, mission } = r;
  const bezmenov = lab.scientists[SCIENTIST_INDEX.BEZMENOV];
  assert.equal(mission.report().bezmenovTriedHandleFirst, true);
  /* The handle, and then nothing. The other four are hitting the glass while
   * he is standing still looking through it. */
  assert.deepEqual(bezmenov.log.slice(0, 2), ['tryHandle', 'stare']);
  assert.equal(
    lab.scientists[SCIENTIST_INDEX.SOKOLOV].log[0], 'panic',
    'the others go straight at the door',
  );
  assert.equal(mission.report().chairBent, true, 'the chair bends, the glass does not break');
});

test('every line behind the glass goes through the glass audio, and nothing else does', () => {
  const r = rig();
  playThrough(r);
  const { lab, mission } = r;
  const report = mission.report();

  assert.ok(report.glassRouted > 40, `${report.glassRouted} muffled lines is too few`);
  assert.equal(lab.glassAudio.log.length, report.glassRouted);
  /* Every one of them came out of a body behind the glass rather than out of
   * the observation room's own speakers. The two exceptions are the lab's own
   * annunciator, which is a ceiling speaker on the far side of the glass and
   * has no body to come out of. */
  for (const entry of lab.glassAudio.log) {
    if (entry.cue.includes('.computer.')) {
      assert.equal(entry.from, undefined, 'the annunciator is not a person');
      continue;
    }
    assert.ok(entry.from >= 0 && entry.from <= 5, `${entry.cue} came from nobody`);
  }
  /* And after the door locks, every one of them is genuinely muffled. */
  const afterLock = lab.glassAudio.log.filter((entry) => entry.muffled);
  assert.ok(afterLock.length > 20);
  assert.ok(afterLock.some((entry) => entry.cue.includes('reaction.')));
  assert.ok(afterLock.some((entry) => entry.cue.includes('gas.')));
  /* Booski, DeathMegatron, Lou and the Prospect are never routed through it. */
  const dry = new Set(report.cues.filter((c) => !lab.glassAudio.log.some((g) => g.cue === c)));
  assert.ok([...dry].some((c) => c.includes('booski.')));
  assert.equal([...dry].some((c) => c.includes('.orlova.')), false);
});

/**
 * Owner playtest, 2026-08-06: *"Aubbie's mouth stops moving once he leaves the
 * lab."*
 *
 * A scientist's jaw is moved from inside `lab.scientists[i].say()` — the
 * laboratory plays the cue and hands the playing node to his mouth. The
 * mission was only calling that on MUFFLED lines, so from `door.open` onwards
 * every line of Aubbie's went round his body through a bare `playCue`, and he
 * pleaded for his life with his mouth shut. This is the routing half; the jaw
 * itself is measured in the real lab by `npm run verify:mansion`.
 */
test('every line of Aubbie\'s comes out of Aubbie, including the ones after he walks out', () => {
  const r = rig();
  playThrough(r);
  const { lab, mission } = r;
  const aubbie = lab.scientists[SCIENTIST_INDEX.AUBBIE];

  /* Eighteen on a clean run: ten over the build, one at the completion, three
   * coming out through the door, "What is this?", and the three of the
   * pleading. The nag lines are extra and only fire if the player dawdles. */
  const his = mission.report().cues.filter((cue) => cue.includes('.aubbie.'));
  assert.ok(his.length >= 18, `${his.length} Aubbie cues is too few to be his part`);
  const missed = his.filter((cue) => !aubbie.lines.includes(cue));
  assert.deepEqual(missed, [], 'these lines never reached his body, so his mouth never moved');

  /* The half that used to be broken: the lines he says on the player's side of
   * the glass. They are dry AND they come out of him. */
  assert.equal(aubbie.side, 'observation', 'he never came out through the door');
  /* Seven: the three he says coming out of the door, "What is this?", and the
   * three of the pleading. Every one of them was silent-mouthed before. */
  assert.ok(aubbie.dry.length >= 7, `${aubbie.dry.length} dry lines is not his whole execution`);
  assert.ok(aubbie.dry.every((take) => take.dry === true));
  assert.ok(
    aubbie.dry.some((take) => take.cue.includes('execution.')),
    'the execution is the beat he is out here for',
  );
  /* And not one of them went through twelve centimetres of glass he is
   * standing on the wrong side of. */
  assert.equal(
    lab.glassAudio.log.some((entry) => entry.cue.includes('execution.aubbie.')), false,
  );
});

/**
 * Owner playtest, 2026-08-06: *"Aubbie volume +20%."*
 *
 * At the PROFILE (`VOICE_GAIN` in script.js), so it reaches both of his routes
 * and the lines nobody has recorded yet. Asserted as a number rather than as
 * "louder than before", because "before" is not available to a check.
 */
test('Aubbie is played at his profile\'s gain, and nobody else is moved', () => {
  const r = rig();
  playThrough(r);
  const { lab } = r;

  assert.equal(gainForVoice('aubbie'), 1.2, 'the owner asked for +20%');
  assert.equal(gainForVoice('booski'), 1);
  assert.equal(gainForVoice('nobody-by-this-name'), 1);

  const aubbie = lab.scientists[SCIENTIST_INDEX.AUBBIE];
  const levels = new Set(aubbie.takes.map((take) => take.volume));
  assert.deepEqual([...levels], [1.08], 'every line of his leaves at 0.9 x 1.2');

  /* The other five are on the same route and are NOT boosted, which is what
   * makes this a per-voice gain rather than a louder laboratory. */
  for (const index of [
    SCIENTIST_INDEX.VETROV, SCIENTIST_INDEX.SOKOLOV,
    SCIENTIST_INDEX.BEZMENOV, SCIENTIST_INDEX.ORLOVA, SCIENTIST_INDEX.MARCHUK,
  ]) {
    const takes = lab.scientists[index].takes;
    assert.ok(takes.length > 0, `scientist ${index} never spoke`);
    assert.deepEqual([...new Set(takes.map((t) => t.volume))], [0.9]);
  }
});

/**
 * Owner playtest, 2026-08-06: *"Blood effect when Aubbie is shot."*
 *
 * `shot` and `collapse` are two calls on purpose: the first is a round
 * arriving and the second is a body going down, and the gassing uses the
 * second one five more times without a drop of blood anywhere. This proves the
 * mission asks for both, in that order, and only for the man who was shot.
 */
test('the man who is shot is bled, and the five who are gassed are not', () => {
  const r = rig();
  playThrough(r);
  const { lab, mission } = r;
  const aubbie = lab.scientists[SCIENTIST_INDEX.AUBBIE];

  assert.ok(aubbie.log.includes('shot'), 'nothing told the scene he had been hit');
  assert.ok(
    aubbie.log.indexOf('shot') < aubbie.log.indexOf('collapse'),
    'he bled after he had already fallen over',
  );
  assert.equal(mission.report().aubbie.bled, true);

  for (const index of [
    SCIENTIST_INDEX.VETROV, SCIENTIST_INDEX.SOKOLOV,
    SCIENTIST_INDEX.BEZMENOV, SCIENTIST_INDEX.ORLOVA, SCIENTIST_INDEX.MARCHUK,
  ]) {
    assert.equal(
      lab.scientists[index].log.includes('shot'), false,
      `scientist ${index} was gassed, not shot`,
    );
  }
});

test('the HUD never speaks over the man in the room', () => {
  /* The owner's rule: Booski says "Lock the lab" and the objective appears
   * AFTER he has finished. This walks the two beats where an instruction and
   * a line are closest together and proves the screen waits. */
  const r = rig();
  const { mission } = r;
  playThrough(r, {
    keypad: null,
  });
  const report = mission.report();
  /* Every instruction that was ever raised is one of the authored ones — the
   * mission never invents HUD copy at a call site. */
  for (const text of report.instructions) {
    assert.ok(Object.values(INSTRUCTIONS).includes(text), `unauthored instruction: ${text}`);
  }
});

test('"Lock the lab" finishes before the objective, and the code is said before the buttons', () => {
  const r = rig();
  const { mission } = r;
  mission.start();
  mission.arrive('office');
  r.atInstruction(INSTRUCTIONS.PLACE_CASE);
  mission.placeCaseOnDesk();
  r.atInstruction(INSTRUCTIONS.TAKE_CASE);
  mission.takeCaseBack();
  mission.pressBustSwitch();
  r.atInstruction(INSTRUCTIONS.DELIVER_CASE, 200);
  mission.deliverCase();

  /* The frame Booski starts the order on. */
  assert.ok(r.until(() => mission.fsm.name === S.LOCK_ORDER, 300));
  assert.equal(mission.objective, OBJECTIVES.TAKE_TO_BOOSKI, 'the objective jumped the line');
  const lockLine = SEQUENCES.lockOrder[0];
  assert.equal(r.lines.at(-1)?.text, lockLine.text);

  /* It arrives only once he has stopped talking. */
  assert.ok(r.until(() => mission.objective === OBJECTIVES.LOCK_THE_LAB, 20));
  assert.equal(mission.instruction, '', 'the keypad prompt arrived with the objective');

  /* And the code is spoken by a character before the screen mentions keys. */
  assert.ok(r.until(() => mission.instruction === INSTRUCTIONS.KEYPAD, 20));
  assert.equal(r.lines.at(-1)?.text, SEQUENCES.keypadCode[0].text);
});

test('nothing can be done out of turn', () => {
  const lab = createContractLab();
  const mission = createSilentSquatchMission({ lab });
  mission.start();
  assert.equal(mission.pressBustSwitch(), false);
  assert.equal(mission.deliverCase(), false);
  assert.equal(mission.enterCode('6969'), false);
  assert.equal(mission.shootAubbie(true), false);
  assert.equal(mission.pullSilentNight(), false);
  assert.equal(mission.leave(), false);
  assert.equal(lab.doorLocked, false);
  assert.equal(lab.gas.running, false);
  assert.equal(lab.hiddenWall.isOpen, false);
  assert.equal(mission.report().complete, false);
});

test('the mission walks on the player\'s own feet when the scene gives it zones', () => {
  const r = rig({
    zones: {
      rippin: { x: 4, z: 0, r: 2 },
      office: { x: 0, z: 20, r: 2 },
    },
  });
  const { mission } = r;
  mission.start();
  r.step(1);
  assert.equal(mission.fsm.name, S.ARRIVAL);

  mission.update(DT, { position: { x: 4, z: 0.5 } });
  assert.ok(mission.barked.has('rippin'), 'walking past Rippin did not get his line');
  assert.equal(mission.fsm.name, S.ARRIVAL, 'a bark is not a beat');

  mission.update(DT, { position: { x: 0, z: 19 } });
  r.step(0.2);
  assert.equal(mission.fsm.name, S.LOU_OFFICE);
});

/* ------------------------------------------------------------------ */
/* The campaign                                                        */
/* ------------------------------------------------------------------ */

test('the mission writes the night into the campaign honestly', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.enter(SCENE_IDS.MANSION, { spawn: 'gate' });
  const story = createSilentSquatchStory({ campaign });

  const entry = story.begin();
  assert.equal(entry.ok, true);
  assert.equal(entry.resumed, false);
  assert.equal(entry.unrouted, false);
  assert.equal(campaign.hasItem(ITEM_IDS.SILVER_CASE), true, 'he arrives carrying it');
  assert.equal(campaign.state.missions[MISSION_IDS.SILENT_SQUATCH].status, 'in_progress');

  const r = rig({ story });
  playThrough(r);

  const saved = createCampaign({ storage }).state;
  const night = saved.missions[MISSION_IDS.SILENT_SQUATCH];
  assert.equal(night.status, 'complete');
  assert.equal(night.checkpoint, 'clear');
  assert.equal(night.casePlaced, true);
  assert.equal(night.caseDelivered, true);
  assert.equal(night.labLocked, true);
  assert.equal(night.aubbieEliminated, true);
  assert.equal(night.silentNightActivated, true);
  assert.equal(night.scientistsLost, 6, 'Aubbie plus the five in the room');

  /* The five rewards the spec asks for, and a case that never comes home. */
  assert.equal(night.basementUnlocked, true);
  assert.equal(night.notesRecovered, true);
  assert.equal(night.conspiracyBoard, true);
  assert.equal(night.trophyAwarded, true);
  assert.equal(saved.story.familyRespect, SILENT_SQUATCH_RESPECT);
  assert.equal(saved.inventory.carried.includes(ITEM_IDS.SQUATCHANIUM_MINIATURE), true);
  assert.equal(saved.inventory.carried.includes(ITEM_IDS.SILVER_CASE), false);
  assert.equal(saved.inventory.concealed.includes(ITEM_IDS.SILVER_CASE), false);
});

test('a night that is already over is not replayed, and nothing is awarded twice', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.enter(SCENE_IDS.MANSION, { spawn: 'gate' });
  const story = createSilentSquatchStory({ campaign });
  story.begin();
  const r = rig({ story });
  playThrough(r);

  const respect = campaign.state.story.familyRespect;
  assert.deepEqual(story.begin(), { ok: false, reason: 'already_complete' });
  assert.equal(story.complete(r.mission.report()), false);
  assert.equal(story.checkpoint('locked'), false);
  assert.equal(campaign.state.story.familyRespect, respect);
});

test('a reload mid-night comes back to the beat he was on', () => {
  const storage = new MemoryStorage();
  let campaign = createCampaign({ storage });
  campaign.enter(SCENE_IDS.MANSION, { spawn: 'gate' });
  let story = createSilentSquatchStory({ campaign });
  story.begin();

  const r = rig({ story });
  const { mission } = r;
  mission.start();
  mission.arrive('office');
  r.atInstruction(INSTRUCTIONS.PLACE_CASE);
  mission.placeCaseOnDesk();
  r.atInstruction(INSTRUCTIONS.TAKE_CASE);
  mission.takeCaseBack();
  mission.pressBustSwitch();
  r.step(2);

  campaign = createCampaign({ storage });
  story = createSilentSquatchStory({ campaign });
  const resumed = story.begin();
  assert.equal(resumed.ok, true);
  assert.equal(resumed.resumed, true);
  const night = campaign.state.missions[MISSION_IDS.SILENT_SQUATCH];
  assert.equal(night.checkpoint, 'basement');
  assert.equal(night.casePlaced, true);
  assert.equal(night.caseDelivered, false);
  assert.equal(night.status, 'in_progress');
});
