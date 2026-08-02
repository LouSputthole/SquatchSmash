import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'));
const handoff = fs.readFileSync(new URL('../VOICE-LINES-TODO.md', import.meta.url), 'utf8');

test('every pending voice recast is visible in the recording handoff against its current cast id', () => {
  const recasts = manifest.sfx.filter((cue) => cue.say && cue._recast);

  for (const cue of recasts) {
    assert.equal(cue._recast, manifest.voices[cue.voice]?.id, `${cue.name} targets the current cast`);
    const file = cue.file || `${cue.name}.mp3`;
    assert.ok(handoff.includes(`RECAST  ${file}`), `${cue.name} is missing from VOICE-LINES-TODO.md`);
    assert.ok(handoff.includes(`\`${cue._recast}\``), `${cue.name}'s target voice id is missing from the handoff`);
  }
});
