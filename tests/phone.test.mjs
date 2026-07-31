import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document ??= {
  createElement: () => ({
    getContext: () => ({}),
  }),
};

const { Phone, callScript } = await import('../src/core/phone.js');

test('the campaign can own scheduled calls and observe a physical-phone answer', () => {
  const answered = [];
  const phone = new Phone({
    time: { day: 1, hour: 9.5 },
    calls: [],
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
