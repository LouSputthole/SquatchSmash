import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document ??= {
  createElement: () => ({
    getContext: () => ({}),
  }),
};

const { Phone } = await import('../src/core/phone.js');

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
