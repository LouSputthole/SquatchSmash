import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('NO WAKE announces durable beats and restores the missing walking layer', async () => {
  const [main, sceneAudio] = await Promise.all([
    read('src/nowake/main.js'),
    read('src/nowake/audio.js'),
  ]);
  assert.match(main, /createCampaignAudioFeedback\(audio\)/);
  assert.match(main, /player\.onFootstep = \(surface, intensity\) => audio\.footstep\(surface, intensity\)/);
  for (const checkpoint of ['dock', 'underway', 'open_water', 'execution', 'weighted']) {
    assert.match(main, new RegExp(`checkpointNoWake\\('${checkpoint}'`));
  }
  assert.match(main, /campaignAudioFeedback\.complete\('no-wake', completed\)/);
  assert.match(sceneAudio, /'ui\.select'/);
  assert.match(sceneAudio, /'woo\.streak'/);
});

test('Silver Case mixes its physical car, floors, weapon drop, and campaign beats', async () => {
  const [main, sceneAudio] = await Promise.all([
    read('src/silvercase/main.js'),
    read('src/silvercase/audio.js'),
  ]);
  assert.match(main, /surface: 'tile'/);
  assert.match(main, /player\.onFootstep = \(surface, intensity\) => audio\.footstep\(surface, intensity\)/);
  assert.match(main, /name: 'car\.engine\.idle'/);
  assert.match(main, /audio\.play\('car\.engine\.rev'/);
  assert.match(main, /audio\.play\('car\.door\.close\.heavy'/);
  assert.match(main, /audio\.play\('gun\.drop\.wood'/);
  assert.match(main, /campaignAudioFeedback\.checkpoint\(checkpoint, accepted\)/);
  assert.match(main, /campaignAudioFeedback\.complete\('silver-case', silverCaseCampaignComplete\)/);
  for (const cue of [
    'ui.select', 'woo.streak', 'car.engine.idle', 'car.engine.rev',
    'car.door.close.heavy', 'gun.drop.wood', 'footstep.tile',
    'footstep.wood.a', 'footstep.wood.b',
  ]) assert.match(sceneAudio, new RegExp(`'${cue.replaceAll('.', '\\.')}'`));
});

test('Cartel Palace gives saves, evidence, power, extraction, and completion distinct feedback', async () => {
  const main = await read('src/cartel-palace/main.js');
  assert.match(main, /campaignAudioFeedback\.checkpoint\(id, accepted\)/);
  assert.match(main, /campaignAudioFeedback\.complete\('cartel-palace', completed\)/);
  assert.match(main, /audio\.play\('chat\.ping'/);
  assert.match(main, /audio\.play\('switch\.click'/);
  assert.match(main, /audio\.play\('light\.dip'/);
  assert.match(main, /if \(!palace\.doors\.openExtraction\(\)\) return;[\s\S]*audio\.play\('door\.creak'/);
});

test('every newly selected recorded cue exists on disk', async () => {
  const cues = [
    'ui.select', 'woo.streak', 'chat.ping', 'car.engine.idle', 'car.engine.rev',
    'car.door.close.heavy', 'gun.drop.wood', 'switch.click', 'light.dip',
    'door.creak', 'door.bathroom.close', 'footstep.tile', 'footstep.wood.a',
    'footstep.wood.b', 'ambience.diners', 'dining.glass.clink',
  ];
  await Promise.all(cues.map((cue) => access(
    new URL(`../assets/sfx/${cue}.mp3`, import.meta.url),
  )));
  assert.equal(cues.length, 16);
});
