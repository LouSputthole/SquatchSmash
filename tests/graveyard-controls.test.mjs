import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createPrimaryGraveControl } from '../src/graveyard/controls.js';

test('the primary control automatically disrespects an unresolved traitor and otherwise interacts', () => {
  const events = [];
  let traitor = 'brawny';
  let peeing = false;
  const control = createPrimaryGraveControl({
    interaction: {
      press: () => events.push('interact:press'),
      release: () => events.push('interact:release'),
    },
    currentTraitor: () => traitor,
    startDisrespect: (id) => {
      peeing = true;
      events.push(`disrespect:start:${id}`);
      return true;
    },
    stopDisrespect: () => {
      peeing = false;
      events.push('disrespect:stop');
    },
    isDisrespecting: () => peeing,
  });

  assert.equal(control.press(), 'disrespect');
  assert.equal(control.release(), 'disrespect');
  assert.deepEqual(events, ['disrespect:start:brawny', 'disrespect:stop']);

  traitor = null;
  assert.equal(control.press(), 'interact');
  assert.equal(control.release(), 'interact');
  assert.deepEqual(events, [
    'disrespect:start:brawny',
    'disrespect:stop',
    'interact:press',
    'interact:release',
  ]);
});

test('the graveyard presents E as its only interaction key', () => {
  const html = fs.readFileSync(new URL('../graveyard.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /<kbd>P<\/kbd>/);
  assert.match(html, /<div id="pee-hint"[^>]*><kbd>E<\/kbd><span>hold to disrespect traitor<\/span><\/div>/);
  assert.match(html, /<kbd>E<\/kbd>[^<]*(?:<[^>]+>[^<]*<\/[^>]+>[^<]*)*all interactions/i);
});
