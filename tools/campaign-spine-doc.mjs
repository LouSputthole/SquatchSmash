#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAMPAIGN_SPINE, CHAPTERS } from '../src/core/campaign-spine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'docs', 'CAMPAIGN-ROUTE-GENERATED.md');

const cell = (value) => String(value ?? '—')
  .replaceAll('|', '\\|')
  .replaceAll(/\s+/g, ' ')
  .trim();

export function renderCampaignSpineDocument() {
  const lines = [
    '# Campaign route — generated contract',
    '',
    '> Generated from `src/core/campaign-spine.js`. Do not hand-edit this file.',
    '> `docs/CAMPAIGN-STORY-BIBLE.md` remains the creative authority; this is the',
    '> deterministic implementation-facing route derived from the live spine.',
    '',
    `Beats: **${CAMPAIGN_SPINE.length}** · Chapters: **${CHAPTERS.length}** · Pending: **${CAMPAIGN_SPINE.filter((beat) => beat.status !== 'wired').length}**`,
    '',
  ];

  for (const chapter of CHAPTERS) {
    const beats = CAMPAIGN_SPINE.filter((beat) => beat.chapter === chapter.id);
    lines.push(`## ${chapter.title}`, '');
    lines.push('| # | Beat id | Title | Scene | Spawn | Residence | Status | Exit contract |');
    lines.push('|---:|---|---|---|---|---|---|---|');
    for (const beat of beats) {
      lines.push(`| ${beat.n} | \`${beat.id}\` | ${cell(beat.title)} | \`${beat.scene}\` | ${beat.spawn === null ? 'continue' : `\`${cell(beat.spawn)}\``} | \`${beat.residence}\` | ${beat.status} | ${cell(beat.exit)} |`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

export function writeCampaignSpineDocument({ check = false } = {}) {
  const expected = renderCampaignSpineDocument();
  if (check) {
    const actual = fs.existsSync(OUTPUT)
      ? fs.readFileSync(OUTPUT, 'utf8').replaceAll('\r\n', '\n')
      : null;
    if (actual !== expected) {
      throw new Error('docs/CAMPAIGN-ROUTE-GENERATED.md is stale; run `npm run campaign:route-doc`');
    }
    return OUTPUT;
  }
  fs.writeFileSync(OUTPUT, expected);
  return OUTPUT;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  try {
    const output = writeCampaignSpineDocument({ check });
    console.log(`${check ? 'Verified' : 'Wrote'} ${path.relative(ROOT, output).replaceAll('\\', '/')}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
