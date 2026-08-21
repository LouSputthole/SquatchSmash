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
    /* THE RULE IS THE ORDER, NOT THE SPELLING. The previous speaker has to be
     * cut off BEFORE the function gives up on an unavailable cue, or a pickup
     * that turns out to have no recording leaves the last line still running
     * underneath whatever comes next -- which is the fault this whole file is
     * about. Silver now asks `hasSpeech()` where it used to read the buffer
     * bank by hand; the guard moved, the order it has to keep did not. */
    const bail = ['if (!bank?.length)', 'if (!hasSpeech(audio, name))']
      .map((form) => body.indexOf(form)).find((at) => at >= 0);
    assert.ok(bail !== undefined, `${relative} has no unavailable-cue guard at all`);
    assert.ok(body.indexOf('audio._vo?.stop?.()') < bail, relative);
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
  assert.match(silver, /performance_\.defer\(bandleaderHold, answerBandleader\)/);
  assert.doesNotMatch(silver, /setTimeout\(answerBandleader/,
    'the callback must advance on pause-aware performance time');
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

test('Booski gets the full yell before the bartender takes the voice floor, then the handoff waits for him', () => {
  const family = source('src/bing/family.js');
  const yell = between(family, "yell: {", '};\n  };\n\n  const booskiShot');
  assert.doesNotMatch(yell, /enter:\s*\(\)\s*=>\s*startShot\(\)/);
  assert.match(yell, /next:\s*\(\)\s*=>\s*\{\s*startShot\(\);\s*return null;/);

  /* The beat itself moved to src/bing/booski-shot.js on 2026-08-19 so the
   * closed party could run THE existing shot rather than a second one. Same
   * assertions, at the file that now owns them. */
  const beat = source('src/bing/booski-shot.js');
  assert.match(beat, /const SHOT_PASS_SECONDS = 1\.25/);
  assert.match(beat, /props\.delivery\.root\.position\.lerpVectors\(SHOT_TRAY_HOME, SHOT_TRAY_PASS, pass\)/);
  assert.match(beat, /if \(beatTime < bartenderVoiceUntil\) return/);
  const bing = source('src/bing/main.js');
  assert.match(bing, /createBooskiShotBeat\(\{/, 'the ordinary night mounts the shared beat');
  assert.match(source('src/bing/hotdog-main.js'), /createBooskiShotBeat\(\{/,
    'and so does the closed party');
});
