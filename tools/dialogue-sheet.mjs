#!/usr/bin/env node
/**
 * DIALOGUE-SHEET — every spoken line in the game, in one sheet you can sort.
 *
 *   npm run dialogue:sheet
 *
 * `VOICE-LINES-NEEDED.md` answers "what is left to record". This answers a
 * different question: "what does everybody in this game actually SAY, and is
 * any of it worth saying?" It is the writing-room document, not the booth
 * document, so it carries every line whether or not it has a take on disk.
 *
 * Output:
 *   docs/dialogue/DIALOGUE-MASTER.csv   -- one row per spoken cue
 *   docs/dialogue/DIALOGUE-MASTER.json  -- same rows, for tooling
 *
 * Columns are deliberately wider than the manifest: the punch-up columns are
 * empty here and get filled from DIALOGUE-PUNCHUP.md, which is hand-written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const INDEX = path.join(ROOT, 'assets/sfx/index.json');
const OUT_DIR = path.join(ROOT, 'docs/dialogue');
const PUNCHUP_DIR = path.join(OUT_DIR, 'punchups');

/** Scene attribution, matching the ordering used by the audio handoff docs. */
const SCENES = [
  ['PROJECT SILENT SQUATCH', (n) => n.startsWith('vo.silentsquatch.')],
  ['MANSION UNDER SIEGE', (n) => n.startsWith('vo.siege.')],
  ['The HotDog Incident', (n) => n.startsWith('vo.bing2.')],
  ['The Enola Squatch', (n) => n.startsWith('vo.enolasquatch.')],
  ['THE TAKE', (n) => n.startsWith('heist.')],
  ['Bada Bing', (n) => n.startsWith('vo.bing.') || n.startsWith('vo.bj.') || n.startsWith('vo.slots.')],
  ['Silver Pines', (n) => n.startsWith('vo.golf.')],
  ['The Silver Room', (n) => n.startsWith('vo.silver.')],
  ['The Silver Case', (n) => n.startsWith('vo.silvercase.')],
  ['NO WAKE', (n) => n.startsWith('vo.nowake.')],
  ['The Beef Run', (n) => n.startsWith('vo.beefrun.')],
  ['Jerky Motel', (n) => n.startsWith('vo.motel.')],
  ['Squatch Graveyard', (n) => n.startsWith('vo.graveyard.')],
  ['Squatchfather', (n) => n.startsWith('vo.sf.')],
  ['Initiation', (n) => n.startsWith('vo.initiation.')],
  ['Radio', (n) => n.startsWith('radio.')],
  ['Mansion', (n) => n.startsWith('vo.mansion.')],
  ['Apartment', (n) => n.startsWith('vo.door.') || n.startsWith('vo.call.')
    || n.startsWith('vo.machine.') || n.startsWith('vo.news.') || n.startsWith('vo.idle')],
];

const sceneOf = (name) => SCENES.find(([, owns]) => owns(name))?.[0] || 'Apartment and shared';
const fileOf = (cue) => cue.file ? `${cue.file}.mp3` : `${cue.name}.mp3`;

/**
 * A rough "is this line pulling its weight" signal so the writing pass has
 * somewhere to start. It flags nothing as bad on its own -- it just surfaces
 * the lines that read as functional rather than written: pure HUD-speak, or
 * a line so short it cannot carry a voice.
 */
const FILLER = /^(ok(ay)?|yeah|yes|no|right|sure|got it|copy|roger|uh huh|mm+|hey|alright|come on|let'?s go|here we go|nice|good|thanks|wow)[.!?]?$/i;
const HUD_SPEAK = /\b(press|hold|click|use the|aim at|walk to|head to|go to|objective|checkpoint|tap)\b/i;

function heat(say) {
  const words = say.trim().split(/\s+/).length;
  const flags = [];
  if (FILLER.test(say.trim())) flags.push('filler');
  if (HUD_SPEAK.test(say)) flags.push('hud-speak');
  if (words <= 3) flags.push('short');
  if (words >= 45) flags.push('long');
  if (!/[a-z]/.test(say.replace(/[^A-Za-z]/g, ''))) flags.push('all-caps');
  return flags.join(' ');
}

/**
 * The punch-up files are hand-written and are the point of this whole sheet.
 * Each is one scene: a diagnosis, then per-cue rewrites in four house tones.
 * They are keyed by cue id so a line can be re-pointed without re-writing it.
 */
function loadPunchups() {
  if (!fs.existsSync(PUNCHUP_DIR)) return { byCue: new Map(), scenes: [] };
  const scenes = fs.readdirSync(PUNCHUP_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(PUNCHUP_DIR, f), 'utf8')));
  const byCue = new Map();
  for (const scene of scenes) {
    for (const line of scene.lines ?? []) byCue.set(line.cue, { ...line, sceneFile: scene.scene });
  }
  return { byCue, scenes };
}

const csvCell = (value) => {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const index = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : { files: [] };
  const recorded = new Set(index.files ?? []);

  const { byCue, scenes } = loadPunchups();

  const rows = manifest.sfx
    .filter((cue) => typeof cue.say === 'string' && cue.say.trim())
    .map((cue, i) => {
      const p = byCue.get(cue.name) ?? {};
      return {
      row: i + 1,
      scene: sceneOf(cue.name),
      character: cue.voice || '(unvoiced)',
      cue: cue.name,
      file: fileOf(cue),
      recorded: recorded.has(fileOf(cue)) ? 'yes' : 'no',
      direction: cue.direction || cue.note || '',
      current: cue.say.trim(),
      words: cue.say.trim().split(/\s+/).length,
      flags: heat(cue.say.trim()),
      punchUp: p.house ?? '',
      tarantino: p.tarantino ?? '',
      mcdonagh: p.mcdonagh ?? '',
      houser: p.houser ?? '',
      coen: p.coen ?? '',
      pick: p.status ?? '',
      notes: p.why ?? '',
      };
    });

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const header = ['Row', 'Scene', 'Character', 'Cue id', 'Filename', 'Recorded', 'Direction',
    'Current line', 'Words', 'Flags', 'Punch-up (house)', 'Tarantino', 'McDonagh', 'Houser',
    'Coen', 'Pick', 'Notes'];
  const csv = [header.map(csvCell).join(',')];
  for (const r of rows) {
    csv.push([r.row, r.scene, r.character, r.cue, r.file, r.recorded, r.direction, r.current,
      r.words, r.flags, r.punchUp, r.tarantino, r.mcdonagh, r.houser, r.coen, r.pick, r.notes]
      .map(csvCell).join(','));
  }
  fs.writeFileSync(path.join(OUT_DIR, 'DIALOGUE-MASTER.csv'), `${csv.join('\n')}\n`);
  fs.writeFileSync(path.join(OUT_DIR, 'DIALOGUE-MASTER.json'), `${JSON.stringify(rows, null, 2)}\n`);
  fs.writeFileSync(path.join(OUT_DIR, 'DIALOGUE-PUNCHUP.json'), `${JSON.stringify(scenes, null, 2)}\n`);

  const orphans = [...byCue.keys()].filter((cue) => !rows.some((r) => r.cue === cue));
  if (orphans.length) {
    process.stderr.write(`WARNING: ${orphans.length} punch-up entries point at cue ids that are not in the manifest:\n`);
    for (const cue of orphans) process.stderr.write(`  ${cue}\n`);
  }

  const byScene = new Map();
  for (const r of rows) byScene.set(r.scene, (byScene.get(r.scene) || 0) + 1);
  const flagged = rows.filter((r) => r.flags).length;
  const punched = rows.filter((r) => r.punchUp).length;
  process.stdout.write(`${rows.length} spoken lines across ${byScene.size} scenes; ${flagged} carry a flag; ${punched} have punch-up variants written.\n`);
  for (const [scene, n] of [...byScene].sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${String(n).padStart(4)}  ${scene}\n`);
  }
}

main();
