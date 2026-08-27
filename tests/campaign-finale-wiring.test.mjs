import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Apartment owns the credits, career recap, and durable freeplay handoff', async () => {
  const [html, main, css, view] = await Promise.all([
    read('index.html'),
    read('src/main.js'),
    read('src/style.css'),
    read('src/core/campaign-finale-view.js'),
  ]);

  for (const id of [
    'campaign-finale',
    'campaign-finale-title',
    'campaign-finale-stats',
    'campaign-finale-credits',
    'campaign-freeplay-btn',
    'view-career-recap-btn',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(main, /shouldPresentCampaignFinale\(campaignAtLoad\)/);
  assert.match(main, /enterCampaignFreeplay\(campaign\)/);
  assert.match(main, /campaignFinaleView\.show\(campaignFinaleRecapAtLoad\)/);
  assert.match(main, /Campaign complete\. The apartment is yours/);
  assert.match(view, /continueButton\.focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /@keyframes finaleCreditsRoll/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('Initiation reports completion and hands the ending directly to the shared credits', async () => {
  const source = await read('src/initiation/main.js');
  assert.match(source, /TIME_EVENT_IDS\.COMPLETE_INITIATION/);
  assert.match(source, /createCampaignCreditsView/);
  assert.match(source, /campaignCreditsView\.roll\(\)/);
  assert.doesNotMatch(source, /navigateCampaign\(campaign, SCENE_IDS\.APARTMENT/);
});
