import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Initiation ends by fading directly into the shared full credit roll', async () => {
  const [html, main] = await Promise.all([
    read('initiation.html'),
    read('src/initiation/main.js'),
  ]);

  assert.doesNotMatch(html, /Exit to Campground|TO THE CAMPGROUND/i);
  assert.doesNotMatch(html, /id=["']goHomeBtn["']/);
  for (const id of ['credits', 'credits-track', 'credits-skip']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} is missing`);
  }
  assert.match(main, /createCampaignCreditsView/);
  assert.match(main, /prospectRecordCreditEntries\(campaign\.state\.statistics\)/);
  assert.match(main, /campaignCreditsView\.roll\(\{/);
  assert.match(main, /recordInitiationComplete\(\)[\s\S]{0,700}campaignCreditsView\.roll\(\{/,
    'completion must be saved before the credits take over');
});

test('the shared credits view owns a deterministic natural ending', async () => {
  const source = await read('src/core/campaign-credits-view.js');
  assert.match(source, /setTimeout/);
  assert.match(source, /CREDITS_FADE_S/);
  assert.match(source, /onDone\?\.\(\)/);
  assert.match(source, /duration \* 1000/,
    'the crawl must end even when the player never presses Skip');
});
