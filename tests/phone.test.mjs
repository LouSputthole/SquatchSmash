import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document ??= {
  createElement: () => ({
    getContext: () => ({}),
  }),
};

const { Phone, callScript } = await import('../src/core/phone.js');
const {
  phoneThreadsForCampaign,
  phoneReadEventForThread,
} = await import('../src/core/phone-content.js');
const {
  EVENT_IDS,
  MISSION_IDS,
  TIME_EVENT_IDS,
  createCampaign,
} = await import('../src/core/campaign.js');

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

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
