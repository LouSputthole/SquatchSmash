import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { Mail } from '../src/arcade/mail.js';
import { Chat } from '../src/core/chat.js';
import { MEETING_NOTICE } from '../src/core/stations.js';

const PREMATURE_FINALE = /initiation|ceremony|big night for the prospect|make it past|you have earned it/i;
const MANIFEST = JSON.parse(fs.readFileSync(
  new URL('../assets/sfx/manifest.json', import.meta.url),
  'utf8',
));

test('Day One chat, mail, and radio frame Wednesday as routine club business', () => {
  const time = { day: 1, hour: 23 };
  const chat = new Chat(time);
  chat.update();

  const chatText = chat.messages.map(({ who, text }) => `${who}: ${text}`).join('\n');
  assert.doesNotMatch(chatText, PREMATURE_FINALE);
  assert.match(chatText, /regular business/i);

  const mail = new Mail();
  const mailText = mail.messages
    .map(({ from, subject, body }) => `${from}\n${subject}\n${body.join('\n')}`)
    .join('\n');
  assert.doesNotMatch(mailText, PREMATURE_FINALE);
  assert.match(mailText, /weekly meeting/i);
  assert.doesNotMatch(mailText, /Lou Sasole|Brushrunner|take you flying/i,
    'Day One must not pre-introduce Sasole before the Beef Run airstrip');

  const laterMail = new Mail({ sasoleKnown: true });
  const sasole = laterMail.messages.find(({ from }) => from === 'Lou Sasole');
  assert.ok(sasole, 'Sasole follow-up should join the inbox after the Beef Run');
  assert.match(sasole.body.join('\n'), /Brushrunner back|good first outing/i);
  assert.doesNotMatch(sasole.body.join('\n'), /take you flying sometime|Good luck/i);

  const noticeText = MEETING_NOTICE.map(({ line }) => line).join('\n');
  assert.doesNotMatch(noticeText, PREMATURE_FINALE);
  assert.match(noticeText, /weekly meeting.*routine business/i);

  const audibleApartmentText = MANIFEST.sfx
    .filter(({ name }) => /^vo\.(?:mail\.|idle\.)/.test(name))
    .map(({ say }) => say ?? '')
    .join('\n');
  assert.doesNotMatch(audibleApartmentText, PREMATURE_FINALE,
    'an old recording bank must not say the spoiler after the on-screen copy is fixed');
});

test('the apartment departure owns its voice line in exactly one place', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const calls = [...main.matchAll(/audio\.say\('door\.leave'/g)];
  assert.equal(calls.length, 1,
    'tryLeave must delegate to leaveForMission without double-speaking door.leave');
});
