import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

test('exact-cue scenes stop the prior solo speaker before an unavailable pickup returns', () => {
  for (const relative of ['src/bing/main.js', 'src/silver/main.js']) {
    const body = between(source(relative), 'function voiceCue(', '/** A node');
    assert.ok(body.indexOf('audio._vo?.stop?.()') >= 0, relative);
    assert.ok(body.indexOf('audio._vo?.stop?.()') < body.indexOf('if (!audio.ready)'), relative);
    assert.ok(body.indexOf('audio._vo?.stop?.()') < body.indexOf('if (!bank?.length)'), relative);
  }
  for (const relative of ['src/motel/audio.js', 'src/initiation/audio.js']) {
    const body = between(source(relative), 'export function voice(', 'export function stopVoice(');
    assert.ok(body.indexOf('stopVoice();') >= 0, relative);
    assert.ok(body.indexOf('stopVoice();') < body.indexOf('if (!ctx'), relative);
  }
});

test('Silver dialogue holds each subtitle for its delivered recording duration', () => {
  const silver = source('src/silver/main.js');
  assert.match(silver, /const cueSeconds = .*audio\.buffers/);
  const construction = between(silver, 'const dialogue = new Dialogue', '/* ------------------------------------------------------------------ */');
  assert.match(construction, /cueSeconds,/);
});

test('Silver waits for the bandleader before Margo answers the third number', () => {
  const silver = source('src/silver/main.js');
  assert.match(silver, /const bandleaderHold = n\.say \? Math\.max\(5, cueSeconds\(n\.cue\) \+ 0\.4\) : 0/);
  assert.match(silver, /setTimeout\(answerBandleader, bandleaderHold \* 1000\)/);
});

test('voiced Bing ambience waits for cutscenes, blackjack and an occupied voice floor', () => {
  const bing = source('src/bing/main.js');
  const ambient = between(bing, 'function ambientChatter(', '/* ------------------------------------------------------------------ */');
  assert.match(ambient, /game\.beat/);
  assert.match(ambient, /game\.seatedIn === 'table'/);
  assert.match(ambient, /audio\.busy\(\)/);
});

test('Bing drink refusal waits for Tony and cannot enter the successful pour branch', () => {
  const script = source('src/bing/script.js');
  assert.match(script, /ctx\.order\('beer'\) \? 'pour' : 'capacity'/);
  assert.match(script, /ctx\.order\('whiskey'\) \? 'pour' : 'capacity'/);
  assert.match(script, /capacity: \{[\s\S]*cue: BARTENDER_CAPACITY_LINE\.cue/);
  const bing = source('src/bing/main.js');
  const serve = between(bing, 'function serveDrink(', 'function drinkTick(');
  assert.match(serve, /if \(kind !== 'soft' && inventory\.full\) return false/);
  assert.doesNotMatch(serve, /voiceCue\(/);
});

test('Booski shot handoff waits for the bartender delivery line to finish', () => {
  const bing = source('src/bing/main.js');
  const shot = between(bing, 'function startShotBeat(', 'function sendAssociate(');
  assert.match(shot, /bartenderVoiceUntil = t \+ Math\.max\(3\.6, cueSeconds\(bartenderCue\) \+ 0\.4\)/);
  assert.match(shot, /d < 0\.6 && bartenderFinished/);
});
