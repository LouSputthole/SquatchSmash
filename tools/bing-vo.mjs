#!/usr/bin/env node
/** Build manifest entries for every dynamically-decorated Bing dialogue cue. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBingVoiceCues, bingVoiceForScope, buildScripts, plainWords } from '../src/bing/script.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

function makeContext({ gotPackage = false, drunk = 0, spins = 0, secondVisit = false } = {}) {
  return {
    mission: { note() {}, louDone() {}, parcelOut() {} },
    flags: { gotPackage, jackpot: false, heardAboutCar: true, sawCar: true },
    money: () => 100, drunkLevel: () => drunk, spins: () => spins, hands: () => 2,
    asked: new Set(), order() {}, request() {}, sitAtTable() {}, showParcel() {}, showEnvelope() {},
    secondVisit: () => secondVisit,
  };
}
function valueOf(value) { return typeof value === 'function' ? value() : value; }

const found = new Map();
for (const variant of [{}, { gotPackage: true }, { drunk: 0.7 }, { spins: 2 }, { secondVisit: true }]) {
  const scripts = applyBingVoiceCues(buildScripts(makeContext(variant)));
  for (const [scope, tree] of Object.entries(scripts)) {
    for (const node of Object.values(tree)) {
      if (!node?.line) continue;
      const line = plainWords(valueOf(node.line));
      const cue = valueOf(node.cue);
      if (cue?.startsWith('vo.bing.full.') && line) found.set(cue, { name: cue, voice: bingVoiceForScope(scope), say: line });
      for (const option of valueOf(node.options) || []) {
        const text = plainWords(valueOf(option?.text));
        const optionCue = valueOf(option?.cue);
        if (optionCue?.startsWith('vo.bing.full.') && text) found.set(optionCue, { name: optionCue, voice: 'player', say: text });
      }
    }
  }
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
/* Keep the generated Bing bank in its authored manifest section. Appending it
 * after every refresh used to move 112 entries past the footsteps/effects
 * bank, producing thousands of unrelated diff lines for a one-cue change. */
const withoutBing = manifest.sfx.filter((cue) => !cue.name.startsWith('vo.bing.full.'));
const effectsStart = withoutBing.findIndex((cue) => cue.name === 'footstep.concrete');
const insertAt = effectsStart < 0 ? withoutBing.length : effectsStart;
withoutBing.splice(insertAt, 0, ...[...found.values()].sort((a, b) => a.name.localeCompare(b.name)));
manifest.sfx = withoutBing;
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
const byVoice = {};
for (const cue of found.values()) byVoice[cue.voice] = (byVoice[cue.voice] ?? 0) + 1;
console.log(`${found.size} complete Bing dialogue cue(s) written.`);
for (const [voice, count] of Object.entries(byVoice).sort()) console.log(`  ${voice.padEnd(10)} ${count}`);
