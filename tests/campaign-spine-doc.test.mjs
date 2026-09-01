import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CAMPAIGN_SPINE } from '../src/core/campaign-spine.js';
import { renderCampaignSpineDocument } from '../tools/campaign-spine-doc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'docs', 'CAMPAIGN-ROUTE-GENERATED.md');

test('the generated campaign route is a complete rendering of CAMPAIGN_SPINE', () => {
  const rendered = renderCampaignSpineDocument();
  assert.match(rendered, /Generated from `src\/core\/campaign-spine\.js`/);
  for (const beat of CAMPAIGN_SPINE) {
    assert.ok(rendered.includes(`| ${beat.n} | \`${beat.id}\``),
      `beat ${beat.id} is missing from the generated route`);
  }
  assert.equal((rendered.match(/^\| \d+(?:\.\d+)? \|/gm) ?? []).length, CAMPAIGN_SPINE.length,
    'the generated route has a stale or duplicate beat row');
});

test('the checked-in campaign route has no hand-maintained drift', () => {
  const checkedIn = fs.readFileSync(OUTPUT, 'utf8').replaceAll('\r\n', '\n');
  assert.equal(checkedIn, renderCampaignSpineDocument(),
    'run `npm run campaign:route-doc` after changing CAMPAIGN_SPINE');
});
