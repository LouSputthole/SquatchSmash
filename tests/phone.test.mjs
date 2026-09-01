import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document ??= {
  createElement: () => ({
    getContext: () => ({}),
  }),
};

const {
  Phone,
  callScript,
  loadAsRecordedCaptions,
  OUTGOING_RING_SECONDS,
} = await import('../src/core/phone.js');
const {
  phoneThreadsForCampaign,
  phoneReadEventForThread,
} = await import('../src/core/phone-content.js');
const {
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} = await import('../src/core/campaign.js');

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('bundled phone captions come from inline metadata without a CSP-blocked fetch', async () => {
  const priorInline = globalThis.__SQUATCH_INLINE;
  const priorFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.__SQUATCH_INLINE = {
    'assets/sfx/rerecord.json': {
      lines: [{ cue: 'vo.test.retired', retiredText: 'What the delivered take actually says.' }],
    },
  };
  globalThis.fetch = async () => {
    fetches += 1;
    throw new Error('strict CSP blocked connect-src');
  };
  try {
    const captions = await loadAsRecordedCaptions();
    assert.equal(captions.get('vo.test.retired'), 'What the delivered take actually says.');
    assert.equal(fetches, 0);
  } finally {
    if (priorInline === undefined) delete globalThis.__SQUATCH_INLINE;
    else globalThis.__SQUATCH_INLINE = priorInline;
    globalThis.fetch = priorFetch;
  }
});

test('the phone turns durable campaign progress into readable Family texts and remembers a read thread', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  campaign.advanceTime(TIME_EVENT_IDS.LOU_FIRST_CALL, (state) => {
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'available';
  });

  const first = phoneThreadsForCampaign(campaign.state);
  const family = first.find((thread) => thread.id === 'family');
  assert.ok(family.unread);
  assert.match(family.messages.at(-1).text, /Bing/i);

  campaign.advanceTime(phoneReadEventForThread('family'));
  const restored = phoneThreadsForCampaign(createCampaign({ storage }).state);
  assert.equal(restored.find((thread) => thread.id === 'family').unread, false);
});

test('Lou uses the phone to stage the Bing, never the removed Day One email', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  const initialLou = phoneThreadsForCampaign(campaign.state).find((thread) => thread.id === 'lou');
  assert.ok(initialLou.messages.every((message) => !/email|read it properly/i.test(message.text)));
  assert.match(initialLou.messages.map((message) => message.text).join(' '), /phone|face to face/i);

  campaign.advanceTime(TIME_EVENT_IDS.LOU_FIRST_CALL, (state) => {
    state.events[EVENT_IDS.LOU_FIRST_CALL].status = 'answered';
  });
  const answeredLou = phoneThreadsForCampaign(campaign.state).find((thread) => thread.id === 'lou');
  assert.match(answeredLou.messages.at(-1).text, /Bing tonight/i);
});

test('Lou’s lay-low thread belongs only to the real Act One cabin', () => {
  const storage = new MemoryStorage();
  const campaign = createCampaign({ storage });
  assert.equal(phoneThreadsForCampaign(campaign.state).some(({ id }) => id === 'cabin'), false);

  campaign.update((state) => {
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.scene = { id: SCENE_IDS.COUNTRYSIDE_CABIN, spawn: 'arrival' };
  });
  const cabin = phoneThreadsForCampaign(campaign.state).find(({ id }) => id === 'cabin');
  assert.equal(cabin.who, 'UNCLE LOU · LAY LOW');
  assert.equal(cabin.readEventId, TIME_EVENT_IDS.PHONE_READ_CABIN);
  assert.equal(cabin.unread, true);
  assert.match(cabin.messages.map(({ text }) => text).join(' '), /cabin.*forestry gate/i);
  assert.match(cabin.messages.map(({ text }) => text).join(' '), /walk the property/i);
  assert.match(cabin.messages.map(({ text }) => text).join(' '), /driver.*north.*do not go home/i);
  assert.doesNotMatch(cabin.messages.map(({ text }) => text).join(' '), /clean the apartment|Ape will collect/i);

  campaign.advanceTime(phoneReadEventForThread('cabin'));
  const restored = phoneThreadsForCampaign(createCampaign({ storage }).state)
    .find(({ id }) => id === 'cabin');
  assert.equal(restored.unread, false);

  campaign.update((state) => {
    state.scene = { id: SCENE_IDS.APARTMENT, spawn: 'front_door' };
    state.missions[MISSION_IDS.BANK_HEIST].status = 'complete';
  });
  assert.equal(phoneThreadsForCampaign(campaign.state).some(({ id }) => id === 'cabin'), false,
    'finishing THE TAKE resurrected the retired post-heist cabin route');
});

test('legacy big-night state never speaks for the current Special Meeting pickup', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.JERKY_MOTEL].status = 'complete';
    state.events[EVENT_IDS.BOOSKI_BIG_NIGHT_CALL].status = 'answered';
    state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status = 'pending';
  });

  const beforeMeeting = phoneThreadsForCampaign(campaign.state)
    .find(({ id }) => id === 'family').messages.map(({ text }) => text).join(' ');
  assert.doesNotMatch(beforeMeeting, /big night|everybody is waiting|seven sharp/i);
  assert.match(beforeMeeting, /get some sleep.*keep your phone on/i);

  campaign.update((state) => {
    state.events[EVENT_IDS.BOOSKI_SPECIAL_MEETING_CALL].status = 'answered';
  });
  const afterMeeting = phoneThreadsForCampaign(campaign.state)
    .find(({ id }) => id === 'family').messages.map(({ text }) => text).join(' ');
  assert.match(afterMeeting, /special meeting/i);
  assert.match(afterMeeting, /Seff.*Lag.*Numbskull.*pick you up/i);
});

test('campaign texts wait for the matching Cabin calls instead of spoiling them from mission state', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'complete';
    state.events[EVENT_IDS.CABIN_BOOSKI_SASOLE_CALL].status = 'pending';
    state.events[EVENT_IDS.CABIN_BILLY_CALL].status = 'pending';
  });

  const texts = () => phoneThreadsForCampaign(campaign.state)
    .find(({ id }) => id === 'family').messages.map(({ text }) => text).join(' ');
  assert.doesNotMatch(texts(), /Sasole|plane|HotDog party/i);

  campaign.update((state) => {
    state.events[EVENT_IDS.CABIN_BOOSKI_SASOLE_CALL].status = 'answered';
  });
  assert.match(texts(), /Sasole|plane/i);
  assert.doesNotMatch(texts(), /HotDog party/i);

  campaign.update((state) => {
    state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status = 'complete';
    state.events[EVENT_IDS.CABIN_BILLY_CALL].status = 'pending';
  });
  assert.doesNotMatch(texts(), /HotDog party/i,
    'finishing the flight exposed the later Billy call');

  campaign.update((state) => {
    state.events[EVENT_IDS.CABIN_BILLY_CALL].status = 'answered';
  });
  assert.match(texts(), /HotDog party/i);
});

test('reading the selected phone thread marks it through the shared campaign callback', () => {
  const read = [];
  const phone = new Phone({
    calls: [],
    threads: [{ id: 'family', who: 'THE FAMILY', unread: true, messages: [{ them: true, text: 'Bing. Tonight.' }] }],
    onThreadRead: (thread) => read.push(thread.id),
  });

  phone.press(); // home -> messages
  phone.press(); // messages -> selected thread
  assert.deepEqual(read, ['family']);
  assert.equal(phone.threads[0].unread, false);
});

test('every idle apartment-phone screen tells Tony how to pocket it', () => {
  const phone = new Phone({ calls: [] });
  assert.match(phone.idleHint(), /\[Q\] pocket/i);
  phone.press(); // home -> messages
  assert.match(phone.idleHint(), /\[Q\] pocket/i);
  phone.press(); // messages -> thread
  assert.match(phone.idleHint(), /\[Q\] pocket/i);
  phone.press(); // thread -> recents
  assert.match(phone.idleHint(), /\[Q\] pocket/i);
});

test('the campaign can own scheduled calls and observe a physical-phone answer', () => {
  const answered = [];
  const callStates = [];
  const phone = new Phone({
    time: { day: 1, hour: 9.5 },
    calls: [],
    onCallState: (connected, definition) => callStates.push([connected, definition.from]),
  });
  phone.onAnswered = (definition) => answered.push(definition);

  phone.update(1);
  assert.equal(phone.call, null);

  const definition = {
    eventId: 'lou_first_call',
    from: 'Lou',
    vo: 'call.lou.bada_bing',
    lines: ['Kid. You awake?'],
  };
  assert.equal(phone.ring(definition), true);
  phone.answer();

  assert.deepEqual(answered, [definition]);
  assert.equal(phone.inCall, true);
  assert.deepEqual(callStates, [[true, 'Lou']]);

  phone.hangUp();
  assert.deepEqual(callStates, [[true, 'Lou'], [false, 'Lou']]);
});

test('an unskippable story call ignores double-E and manual hang-up until its script completes', () => {
  const callStates = [];
  const phone = new Phone({
    time: { day: 5, hour: 11.5 },
    calls: [],
    audio: { play: () => null, startLoop() {}, stopLoop() {} },
    onCallState: (connected) => callStates.push(connected),
  });

  phone.ring({
    from: 'Gratin',
    vo: 'call.gratin.required',
    lines: ['Listen to the whole thing.'],
    allowHangup: false,
  });
  phone.press();
  assert.equal(phone.inCall, true);
  phone.press();
  assert.equal(phone.inCall, true, 'the second E must not turn an answer into completion');
  assert.equal(phone.hangUp(), false);
  assert.equal(phone.inCall, true);
  assert.deepEqual(callStates, [true]);

  for (let index = 0; index < 100 && phone.inCall; index += 1) phone.update(0.25);
  assert.equal(phone.call, null);
  assert.deepEqual(callStates, [true, false]);
});

test('a call is both halves, and Tony’s take their cue from the caller’s bank', () => {
  const turns = callScript({
    vo: 'call.lou.bada_bing',
    lines: ['Kid. You awake?', 'Back office.', 'Tonight.'],
    // A hole in the middle: the second line is one he lets go past him.
    replies: ['I am now.', null, 'Tonight.'],
  });

  assert.deepEqual(turns, [
    { who: 'them', text: 'Kid. You awake?', cue: 'vo.call.lou.bada_bing.1' },
    { who: 'me', text: 'I am now.', cue: 'vo.call.lou.bada_bing.tony.1' },
    { who: 'them', text: 'Back office.', cue: 'vo.call.lou.bada_bing.2' },
    { who: 'them', text: 'Tonight.', cue: 'vo.call.lou.bada_bing.3' },
    { who: 'me', text: 'Tonight.', cue: 'vo.call.lou.bada_bing.tony.3' },
  ]);

  // A call nobody has written a reply for is still just the caller.
  assert.deepEqual(callScript({ vo: 'call.hr', lines: ['Hi!'] }), [
    { who: 'them', text: 'Hi!', cue: 'vo.call.hr.1' },
  ]);
});

test('an outgoing call rings in his ear, the other person picks up, then Tony speaks', () => {
  /* Owner, 2026-08-31: "there's no ringing when I call Margo. She should...
   * the phone to ring, and she should pick up and, like, say hello or
   * something." The dial now holds a ringback loop for OUTGOING_RING_SECONDS,
   * the pickup line answers first, and only then does the reversed exchange
   * begin. There is still no incoming ring or decline. */
  const played = [];
  const loops = [];
  const stopped = [];
  const answered = [];
  const states = [];
  const definition = {
    from: 'Margo',
    vo: 'call.margo.cabin_date',
    outgoing: true,
    allowHangup: false,
    pickup: '…Hello?',
    lines: ['Tony from the Bing. I was starting to think the number was decorative.'],
    replies: ['Margo. It’s Tony. From the Bing.'],
  };
  assert.deepEqual(callScript(definition), [
    { who: 'them', text: '…Hello?', cue: 'vo.call.margo.cabin_date.pickup' },
    { who: 'me', text: 'Margo. It’s Tony. From the Bing.', cue: 'vo.call.margo.cabin_date.tony.1' },
    { who: 'them', text: definition.lines[0], cue: 'vo.call.margo.cabin_date.1' },
  ]);

  const phone = new Phone({
    calls: [],
    audio: {
      play(name) { played.push(name); return null; },
      startLoop(name) { loops.push(name); },
      stopLoop(name) { stopped.push(name); },
    },
    onCallState: (connected) => states.push(connected),
  });
  phone.onAnswered = (call) => answered.push(call);

  assert.equal(phone.startOutgoing(definition), true);
  assert.equal(phone.ringing, false);
  assert.equal(phone.inCall, true);
  assert.equal(phone.outgoing, true);
  assert.equal(phone.call.state, 'calling', 'the dial must begin ringing in his ear');
  assert.equal(phone.call.connected, false, 'the screen must begin in its calling state');
  assert.deepEqual(loops, ['phone.ring'], 'the ringback stand-in must loop while dialing');
  assert.deepEqual(answered, [definition]);
  assert.deepEqual(states, [true]);
  assert.equal(phone.hangUp(), false, 'required outgoing dialogue became skippable mid-dial');

  phone.update(0.01);
  assert.deepEqual(played, [], 'nobody speaks while the phone is still ringing');
  phone.update(OUTGOING_RING_SECONDS);
  assert.equal(phone.call.state, 'talking');
  assert.ok(stopped.includes('phone.ring'), 'the ringback must stop at the pickup');
  phone.update(0.01);
  assert.deepEqual(played, ['vo.call.margo.cabin_date.pickup']);
  assert.equal(phone.call.connected, true, 'her pickup is the connection');
  phone.update(10);
  phone.update(10);
  assert.deepEqual(played.slice(0, 3), [
    'vo.call.margo.cabin_date.pickup',
    'vo.call.margo.cabin_date.tony.1',
    'vo.call.margo.cabin_date.1',
  ]);
});

test('both halves of a call are played, and an unrecorded one holds a beat', () => {
  const played = [];
  const phone = new Phone({
    time: { day: 1, hour: 9.5 },
    calls: [],
    // Nothing is recorded, which is where every line starts.
    audio: { play: (name) => { played.push(name); return null; }, startLoop() {}, stopLoop() {} },
  });

  phone.ring({
    from: 'Lou',
    vo: 'call.lou.bada_bing',
    lines: ['Kid. You awake?', 'Back office.'],
    replies: ['I am now.', 'The back office. Right.'],
  });
  phone.answer();

  // Four turns and then he is gone: nobody on this phone says goodbye.
  for (let i = 0; i < 200 && phone.inCall; i++) {
    assert.ok(phone.call.hold >= 0 || phone.call.line < 0, 'a turn must hold for a beat');
    phone.update(0.25);
  }

  assert.deepEqual(played, [
    'vo.call.lou.bada_bing.1',
    'vo.call.lou.bada_bing.tony.1',
    'vo.call.lou.bada_bing.2',
    'vo.call.lou.bada_bing.tony.2',
    'phone.hangup',
  ]);
  assert.equal(phone.call, null);
});

test('a queued re-record captions with the words its take actually says', () => {
  /* Owner, 2026-09-01: "Some of the phone lines at the cabin scene are
   * different from the lines spoken." The script keeps the words the NEXT
   * take will say; the screen captions the one that plays today, straight
   * from the re-record queue's retiredText. */
  const definition = {
    vo: 'call.margo.cabin_date',
    outgoing: true,
    pickup: '…Hello?',
    lines: ['New her-line one.', 'New her-line two.'],
    replies: ['New Tony line.', null],
  };
  const captions = new Map([
    ['vo.call.margo.cabin_date.1', 'Old her-line one, as recorded.'],
    ['vo.call.margo.cabin_date.tony.1', 'Old Tony line, as recorded.'],
  ]);

  const turns = callScript(definition, { outgoing: true, captions });
  assert.deepEqual(turns.map(({ text }) => text), [
    '…Hello?',
    'Old Tony line, as recorded.',
    'Old her-line one, as recorded.',
    'New her-line two.',
  ], 'queued cues read as recorded; unqueued cues read as scripted');
  assert.deepEqual(
    callScript(definition, { outgoing: true }).map(({ text }) => text),
    ['…Hello?', 'New Tony line.', 'New her-line one.', 'New her-line two.'],
    'with no queue the script is the caption',
  );

  const phone = new Phone({ time: { hour: 9 }, calls: [], threads: [] });
  phone.setAsRecordedCaptions(captions);
  assert.equal(phone.startOutgoing(definition), true);
  assert.equal(phone.call.turns[1].text, 'Old Tony line, as recorded.');
  phone.hangUp({ force: true });
  phone.setAsRecordedCaptions(new Map());
  assert.equal(phone.startOutgoing(definition), true);
  assert.equal(phone.call.turns[1].text, 'New Tony line.',
    'an emptied queue (the re-records landed) restores the script everywhere');
});

test('every queued cabin cue actually lands on a turn of its call', async () => {
  /* The caption map keys are take cues; a queue entry that no call turn ever
   * names is a caption that silently never applies. Hold the live queue
   * against the live cabin script so a renamed cue cannot strand its
   * retiredText. */
  const fs = await import('node:fs');
  const { CABIN_PHONE_CALLS } = await import('../src/cabin/script.js');
  const queue = JSON.parse(fs.readFileSync(new URL('../assets/sfx/rerecord.json', import.meta.url), 'utf8'));
  const turnCues = new Set(Object.values(CABIN_PHONE_CALLS)
    .flatMap((definition) => callScript(definition).map(({ cue }) => cue)));
  for (const entry of queue.lines ?? []) {
    if (!entry.cue.includes('.cabin_')) continue;
    assert.ok(turnCues.has(entry.cue),
      `queued ${entry.cue} must match a live cabin call turn`);
    assert.equal(typeof entry.retiredText, 'string');
    assert.ok(entry.retiredText.length > 0, `${entry.cue} carries the spoken words`);
  }
});
