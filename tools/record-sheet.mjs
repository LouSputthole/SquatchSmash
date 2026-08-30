#!/usr/bin/env node
/**
 * RECORD-THIS — the exact generation run, in one file, with nothing missing.
 *
 *   npm run record:sheet
 *
 * `VOICE-LINES-NEEDED.md` is the booth document: it groups lines by character
 * so a performer can sit down and read. This is the operator's document. It is
 * the same work, flat, one row per file, carrying everything you need to hand
 * a generator without opening another file: the exact output filename, the
 * voice id and its settings, the exact words, and -- for a re-record -- what
 * the take currently on disk says, so you can hear the difference before you
 * overwrite it.
 *
 * It also carries the prompt-based effect cues, which the booth sheet leaves
 * out because nobody performs them, but which are still un-generated audio.
 *
 * Output:
 *   docs/audio/RECORD-THIS.csv   -- one row per file to generate
 *   docs/audio/RECORD-THIS.md    -- the same, readable, grouped by voice
 *
 * Do not hand-edit either. Fix the authored line and regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFutureInitiationCue } from './audio-scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const INDEX = path.join(ROOT, 'assets/sfx/index.json');
const QUEUE = path.join(ROOT, 'assets/sfx/rerecord.json');
const OUT_DIR = path.join(ROOT, 'docs/audio');

/** Scene attribution, the same mapping the other audio documents use. */
const SCENES = [
  ['PROJECT SILENT SQUATCH', (n) => n.startsWith('vo.silentsquatch.')],
  ['MANSION UNDER SIEGE', (n) => n.startsWith('vo.siege.')],
  ['The HotDog Incident', (n) => n.startsWith('vo.bing2.')],
  ['SQUATCHOLA GAY', (n) => n.startsWith('vo.enolasquatch.')],
  ['THE TAKE', (n) => n.startsWith('heist.')],
  ['Bada Bing', (n) => n.startsWith('vo.bing.') || n.startsWith('vo.bj.') || n.startsWith('vo.slots.')
    || n.startsWith('bing.')],
  ['Silver Pines', (n) => n.startsWith('vo.golf.')],
  ['The Silver Room', (n) => n.startsWith('vo.silver.')],
  ['The Silver Case', (n) => n.startsWith('vo.silvercase.')],
  ['NO WAKE', (n) => n.startsWith('vo.nowake.')],
  ['The Beef Run', (n) => n.startsWith('vo.beefrun.')],
  ['Jerky Motel', (n) => n.startsWith('vo.motel.')],
  ['Squatch Graveyard', (n) => n.startsWith('vo.graveyard.')],
  ['Squatchfather', (n) => n.startsWith('vo.sf.')],
  ['Cartel Palace', (n) => n.startsWith('vo.palace.') || n.includes('.palace.')],
  ['Initiation', (n) => n.startsWith('vo.initiation.')],
  ['Radio', (n) => n.startsWith('radio.')],
  ['Mansion', (n) => n.startsWith('vo.mansion.')],
  ['Bada Bing', (n) => n.startsWith('bing.')],
  ['SQUATCHOLA GAY', (n) => n.includes('.enola') || n.startsWith('enolasquatch.') || n.startsWith('plane.')],
  /* THE CATCH-ALL WAS HIDING THE ONE THAT MATTERED. Two hundred and seven
   * Special Meeting lines -- the whole scene, and the largest block of silence
   * in the game -- were filed under 'Apartment and shared', so the scene table
   * above reported the apartment as the biggest job and the Special Meeting as
   * nothing at all. Same for the siege's A-Team, the HotDog stabbing and
   * Silent Night. A default that quietly absorbs a third of the game is the
   * same fault as a gate that goes quiet: see docs/ENGINE-TRAPS.md 10. */
  ['The Special Meeting', (n) => n.startsWith('vo.specialmeeting.')],
  ['MANSION UNDER SIEGE', (n) => n.startsWith('vo.ateam.')],
  ['PROJECT SILENT SQUATCH', (n) => n.startsWith('vo.silentnight.') || n.startsWith('vo.silentsquatch.')],
  ['The HotDog Incident', (n) => n.startsWith('hotdog.')],
];
const sceneOf = (name) => SCENES.find(([, owns]) => owns(name))?.[0] || 'Apartment and shared';
const fileOf = (cue) => (cue.file ? `${cue.file}.mp3` : `${cue.name}.mp3`);

const csvCell = (value) => {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const index = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : { files: [] };
  const queue = fs.existsSync(QUEUE) ? JSON.parse(fs.readFileSync(QUEUE, 'utf8')) : { lines: [] };
  const recorded = new Set(index.files ?? []);
  const retiredText = new Map((queue.lines ?? []).map((entry) => [entry.cue, entry.retiredText]));
  const voices = manifest.voices ?? {};

  const rows = [];
  for (const cue of manifest.sfx) {
    /* The Initiation party catalog is authored but unreachable in the playable
     * scene, and the whole production pipeline excludes it. Excluded here too:
     * generating audio nobody can ever hear is spend for nothing. */
    if (isFutureInitiationCue(cue.name)) continue;

    const file = fileOf(cue);
    const spoken = typeof cue.say === 'string' && cue.say.trim();
    const isRerecord = cue.needsRerecord === true;
    if (recorded.has(file) && !isRerecord) continue;
    if (!spoken && typeof cue.prompt !== 'string') continue;

    const profile = spoken ? (voices[cue.voice] ?? {}) : {};
    rows.push({
      kind: spoken ? 'voice' : 'effect',
      action: isRerecord ? 'RE-RECORD' : 'new',
      ready: !spoken || /^[A-Za-z0-9]{12,}$/.test(voices[cue.voice]?.id ?? '') ? 'yes' : 'NO - voice not cast',
      file,
      character: spoken ? cue.voice : '',
      voiceId: profile.id ?? '',
      model: profile.model ?? '',
      stability: profile.stability ?? '',
      similarity: profile.similarity ?? '',
      style: profile.style ?? '',
      seconds: cue.duration ?? '',
      scene: sceneOf(cue.name),
      cue: cue.name,
      text: spoken ? cue.say.trim() : cue.prompt,
      direction: cue.direction || cue.note || profile._note || '',
      castingNote: profile._note || '',
      retired: isRerecord ? (retiredText.get(cue.name) ?? '') : '',
    });
  }

  rows.sort((a, b) => a.kind.localeCompare(b.kind)
    || String(a.character).localeCompare(String(b.character))
    || a.file.localeCompare(b.file));

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const header = ['Kind', 'Action', 'Ready', 'Filename', 'Character', 'Voice id', 'Model', 'Stability',
    'Similarity', 'Style', 'Seconds', 'Scene', 'Cue id', 'TEXT TO SAY (or effect prompt)',
    'Direction', 'Retired take says'];
  const csv = [header.map(csvCell).join(',')];
  for (const r of rows) {
    csv.push([r.kind, r.action, r.ready, r.file, r.character, r.voiceId, r.model, r.stability, r.similarity,
      r.style, r.seconds, r.scene, r.cue, r.text, r.direction, r.retired].map(csvCell).join(','));
  }
  fs.writeFileSync(path.join(OUT_DIR, 'RECORD-THIS.csv'), `${csv.join('\n')}\n`);

  const voiceRows = rows.filter((r) => r.kind === 'voice');
  const effectRows = rows.filter((r) => r.kind === 'effect');
  const redo = voiceRows.filter((r) => r.action === 'RE-RECORD');

  const md = [];
  md.push('# RECORD THIS');
  md.push('');
  md.push(`**${rows.length} files to generate: ${voiceRows.length} spoken lines and `
    + `${effectRows.length} effects.** ${redo.length} of the spoken lines are RE-RECORDS — `
    + 'a take already exists on disk and says the wrong words.');
  md.push('');
  md.push('Generated by `npm run record:sheet`. Do not hand-edit — fix the authored line and regenerate.');
  md.push('');
  md.push('`docs/audio/RECORD-THIS.csv` is the same list, one row per file, with the voice id and');
  md.push('settings on every row. That is the one to feed a generator.');
  md.push('');
  md.push('## Deliver it exactly like this');
  md.push('');
  md.push('Every file goes in `assets/sfx/` **under the exact filename shown**. Then:');
  md.push('');
  md.push('```');
  md.push('npm run sfx:listen      # rebuild assets/sfx/index.json and audition');
  md.push('npm run voice:needed    # what is left');
  md.push('npm run record:sheet    # regenerate this file');
  md.push('npm test && npm run check');
  md.push('```');
  md.push('');
  md.push('A re-record overwrites the file that is already there. Once its replacement is indexed,');
  md.push("delete that line's entry from `assets/sfx/rerecord.json` and run `npm run vo:rerecord`,");
  md.push('or `npm run check` will keep reporting the take as stale.');
  md.push('');
  const uncast = [...new Set(voiceRows.filter((r) => !/^[A-Za-z0-9]{12,}$/.test(r.voiceId))
    .map((r) => r.character))].sort();
  if (uncast.length) {
    const blocked = voiceRows.filter((r) => uncast.includes(r.character)).length;
    md.push(`## Blocked: ${uncast.length} voice${uncast.length === 1 ? ' is' : 's are'} not cast yet`);
    md.push('');
    md.push(`**${blocked} of the ${voiceRows.length} lines cannot be generated yet.** These `
      + 'profiles have no voice id in the manifest — they read `<owner to cast>`:');
    md.push('');
    for (const name of uncast) {
      const mine = voiceRows.filter((r) => r.character === name);
      /* The profile's casting note, not one cue's line direction -- this list
       * is read by whoever has to go and cast the part. */
      const note = mine.find((r) => r.castingNote)?.castingNote;
      md.push(`- **${name}** — ${mine.length} line(s)${note ? `\n  ${note}` : ''}`);
    }
    md.push('');
    md.push('Cast them by putting a voice id into the `voices` block of');
    md.push('`assets/sfx/manifest.json`, then rerun `npm run record:sheet`. Everything else in');
    md.push('this file is ready to generate today.');
    md.push('');
  }
  /* WHICH SCENE IS MUTE, AND BY HOW MUCH.
   *
   * The sections below group by CHARACTER, which is the right shape for a
   * recording session -- one voice, one id, one sitting. It is the wrong shape
   * for deciding what to record FIRST, and the two questions have different
   * answers: a playtest is blocked by whichever scene the player reaches with
   * nothing coming out of it, and on the day this was written that was the
   * Special Meeting with a hundred and ninety-two silent lines while the
   * Initiation, a longer scene, was complete. */
  const byScene = new Map();
  for (const r of rows) {
    const at = byScene.get(r.scene) ?? { voice: 0, effect: 0, seconds: 0 };
    at[r.kind === 'effect' ? 'effect' : 'voice'] += 1;
    /* Spoken rows carry no duration -- only five of five hundred and ninety
     * three have one, because the length is whatever the take turns out to be.
     * Estimated off the words at a steady 2.5 a second, which is what these
     * lines read at, so the column is a session estimate rather than a sum of
     * five effects pretending to cover the whole scene. */
    at.seconds += r.kind === 'effect'
      ? (Number(r.seconds) || 0)
      : (String(r.text ?? '').trim().split(/\s+/).filter(Boolean).length / 2.5);
    byScene.set(r.scene, at);
  }
  const scenes = [...byScene].sort((a, b) => (b[1].voice + b[1].effect) - (a[1].voice + a[1].effect));
  if (scenes.length) {
    md.push('## What each scene is waiting on');
    md.push('');
    md.push('Record top-down and the game comes up scene by scene.');
    md.push('');
    md.push('| Scene | Lines | Effects | Total | Est. minutes |');
    md.push('|---|---:|---:|---:|---:|');
    for (const [scene, at] of scenes) {
      md.push(`| ${scene || '(unscoped)'} | ${at.voice} | ${at.effect} | ${at.voice + at.effect} `
        + `| ${(at.seconds / 60).toFixed(1)} |`);
    }
    md.push('');
  }

  md.push('## Do NOT record the legacy queue');
  md.push('');
  md.push('`VOICE-LINES-TODO.md` lists 83 sound effects and 13 ambience/music briefs under a legacy');
  md.push('review queue. They are not in this file on purpose. The effects are synthesised live in');
  md.push('WebAudio and have no sample-lookup path, and the ambience and music briefs have no code');
  md.push('hook at all — generating them today produces files nothing can play. Promoting them is a');
  md.push('playback-code project, not a recording run.');
  md.push('');

  if (voiceRows.length) {
    md.push('## Spoken lines');
    md.push('');
    const byVoice = new Map();
    for (const r of voiceRows) {
      if (!byVoice.has(r.character)) byVoice.set(r.character, []);
      byVoice.get(r.character).push(r);
    }
    md.push('| Character | Voice id | Lines | Re-records |');
    md.push('|---|---|---:|---:|');
    for (const [name, list] of [...byVoice].sort((a, b) => b[1].length - a[1].length)) {
      md.push(`| ${name} | \`${list[0].voiceId || '(unset)'}\` | ${list.length} | `
        + `${list.filter((r) => r.action === 'RE-RECORD').length} |`);
    }
    md.push('');
    for (const [name, list] of [...byVoice].sort((a, b) => b[1].length - a[1].length)) {
      const p = list[0];
      md.push(`### ${name.toUpperCase()} — ${list.length} line(s)`);
      md.push('');
      md.push(`Voice id \`${p.voiceId || '(unset)'}\` · model \`${p.model || '(default)'}\` · `
        + `stability ${p.stability} · similarity ${p.similarity} · style ${p.style}`);
      if (p.direction) md.push(`\n*${p.direction}*`);
      md.push('');
      for (const r of list) {
        md.push(`- \`${r.file}\`${r.action === 'RE-RECORD' ? ' **[RE-RECORD]**' : ''}`);
        md.push(`  > ${r.text}`);
        if (r.retired) md.push(`  *(the take on disk currently says: "${r.retired}")*`);
      }
      md.push('');
    }
  }

  if (effectRows.length) {
    md.push('## Effects');
    md.push('');
    md.push('Not performed — these are sound-generation prompts. `seconds` is the target length.');
    md.push('');
    for (const r of effectRows) {
      md.push(`- \`${r.file}\`${r.seconds ? ` — ${r.seconds}s` : ''} · *${r.scene}*`);
      md.push(`  > ${r.text}`);
    }
    md.push('');
  }

  fs.writeFileSync(path.join(OUT_DIR, 'RECORD-THIS.md'), `${md.join('\n')}\n`);
  process.stdout.write(`docs/audio/RECORD-THIS.{md,csv} — ${rows.length} file(s) to generate: `
    + `${voiceRows.length} spoken (${redo.length} re-records), ${effectRows.length} effects.\n`);
}

main();
