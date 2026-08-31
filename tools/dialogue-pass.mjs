#!/usr/bin/env node
/**
 * DIALOGUE-PASS — every spoken line, in the order it is spoken, by beat.
 *
 *   npm run dialogue:pass
 *
 * `tools/dialogue-sheet.mjs` answers "what does everybody say". This answers
 * the writing-room question the owner actually asked: *"All the dialogue in
 * the order it's spoken and by the characters"*, laid against the 31-beat
 * spine so a stale line is visible as stale.
 *
 * ORDER. The per-scene `vo:<scene>` generators walk their script's beats in
 * authored order and append rows as they go, so a cue's index inside the
 * manifest IS its spoken order within its scene. That is the ordering signal
 * used here; it costs nothing and it cannot drift from the script, because
 * the script is what wrote it. Scenes whose lines are reached by a dialogue
 * tree rather than a straight run (the golf trees, the motel's hashed ids)
 * are ordered the same way and marked so in the ORDERING column -- authored
 * order is still the useful reading order for a writing pass.
 *
 * Output:
 *   docs/dialogue/DIALOGUE-PASS.csv   -- one row per spoken cue
 *   docs/dialogue/DIALOGUE-PASS.json  -- same rows, for the workbook builder
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const OUT_DIR = path.join(ROOT, 'docs/dialogue');

/* THE SPINE, as the beats a writer thinks in. `campaign-spine.js` is the
 * authority on routing; this is the reading order for the script, so THE TAKE
 * carries its 11.5 the way the story bible writes it. */
const BEATS = [
  ['0', 'Squatch Smash Intro', 'CH1 PROSPECT'],
  ['1', 'First Apartment', 'CH1 PROSPECT'],
  ['2', 'Bada Bing I', 'CH1 PROSPECT'],
  ['3', 'The Squatchfather', 'CH1 PROSPECT'],
  ['4', 'Cabin I: Lay Low', 'CH1 PROSPECT'],
  ['5', 'Booski / Sasole Call', 'CH1 PROSPECT'],
  ['6', 'Beef Run', 'CH1 PROSPECT'],
  ['7', 'Cabin II: the dungeon', 'CH1 PROSPECT'],
  ['8', 'Bada Bing II: Billy Hotdog', 'CH2 FAMILY BUSINESS'],
  ['9', 'Graveyard', 'CH2 FAMILY BUSINESS'],
  ['10', 'Jerky Motel', 'CH2 FAMILY BUSINESS'],
  ['11', 'Return to Old Apartment', 'CH2 FAMILY BUSINESS'],
  ['11.5', 'THE TAKE', 'CH2 FAMILY BUSINESS'],
  ['12', 'Lou’s ‘New Space’ Call', 'CH3 MOVING UP'],
  ['13', 'Silver Pines', 'CH3 MOVING UP'],
  ['14', 'Luxury Apartment', 'CH3 MOVING UP'],
  ['15', 'Front & Center', 'CH3 MOVING UP'],
  ['16', 'Margo Stayover', 'CH3 MOVING UP'],
  ['17', 'Luxury Apartment Morning', 'CH3 MOVING UP'],
  ['18', 'NO WAKE', 'CH3 MOVING UP'],
  ['19', 'Luxury Apartment Return', 'CH3 MOVING UP'],
  ['20', 'Silver Case Setup', 'CH4 INNER CIRCLE'],
  ['21', 'Silver Case → Mansion', 'CH4 INNER CIRCLE'],
  ['22', 'Mansion / Silent Squatch', 'CH4 INNER CIRCLE'],
  ['23', 'Mansion Siege', 'CH5 WAR'],
  ['24', 'SQUATCHOLA GAY', 'CH5 WAR'],
  ['25', 'Repaired Mansion', 'CH5 WAR'],
  ['26', 'Cartel Palace', 'CH5 WAR'],
  ['27', 'Special Meeting Call', 'CH6 THIS THING OF OURS'],
  ['28', 'Pickup / Ride', 'CH6 THIS THING OF OURS'],
  ['29', 'Initiation Cabin', 'CH6 THIS THING OF OURS'],
  ['R', '97.8 THE SQUATCH (radio)', 'ALL SCENES'],
];
const BEAT_INDEX = new Map(BEATS.map(([n, title, chapter], i) => [n, { n, title, chapter, i }]));

/* Cue prefix -> beat. First match wins, so put the long prefixes first. A cue
 * that matches nothing lands in UNASSIGNED and the run prints it: the map is
 * meant to stay complete, not to silently swallow a new scene. */
const ROUTES = [
  ['radio.', 'R'],
  ['vo.radio.', 'R'],
  ['vo.news.', 'R'],

  ['vo.smash.', '0'],
  ['vo.pc.', '0'],

  ['vo.call.lou.bada_bing', '1'],
  ['vo.call.lou.new_space', '12'],
  ['vo.call.margo.', '4'],
  ['vo.call.booski.special_meeting', '27'],
  /* Booski rings twice from the cabin. The Captain call is beat 5; the "Billy
   * is getting out, come back to the Bing" summons is the END of beat 7, on
   * Day 4 after the blackout. Same caller, eleven hours and one dungeon apart. */
  ['vo.call.booski.cabin_billy', '7'],
  ['vo.call.booski.', '5'],
  ['vo.call.gratin.', '7'],
  ['vo.call.ape.', '20'],
  ['vo.call.hr.', '1'],
  ['vo.call.unknown.', '1'],
  ['vo.call.lou.', '18'],

  ['vo.bing2.', '8'],
  ['hotdog.', '8'],
  ['vo.bing.', '2'],
  ['vo.bj.', '2'],
  ['vo.slots.', '2'],

  ['vo.sf.', '3'],
  ['vo.cabin.dungeon.', '7'],
  ['vo.cabin.', '4'],
  ['vo.beefrun.', '6'],
  ['vo.graveyard.', '9'],
  ['vo.motel.', '10'],
  ['heist.', '11.5'],
  ['vo.golf.', '13'],
  ['vo.silver.', '15'],
  ['vo.margo.', '16'],
  ['vo.nowake.', '18'],
  /* SUB-ROUTES BEFORE THEIR PARENTS. Three beats keep their lines inside a
   * neighbouring scene's namespace, because the scene that owns the file is
   * not the beat that plays them:
   *   - `silentsquatch.return.*` is Lou's debrief at the REPAIRED mansion
   *     (beat 25), including the wrong-city reveal. Routed to 22 it made
   *     beat 25 read as having no dialogue at all.
   *   - `silvercase.car/arrival.*` is the ride TO the mansion (beat 21).
   *   - `specialmeeting.tony.idle_before.*` is him alone in the luxury flat
   *     waiting for the phone (beat 27), not the ride (beat 28). */
  ['vo.silentsquatch.return.', '25'],
  ['vo.silvercase.car.', '21'],
  ['vo.silvercase.arrival.', '21'],
  ['vo.specialmeeting.tony.idle_before', '27'],

  ['vo.silvercase.', '20'],
  ['vo.silentsquatch.', '22'],
  ['vo.siege.', '23'],
  ['vo.ateam.', '23'],
  ['vo.enolasquatch.', '24'],
  ['vo.mansion.', '25'],
  ['vo.palace.', '26'],
  ['vo.specialmeeting.', '28'],
  ['vo.initiation.', '29'],
  ['vo.cs.', '11.5'],
];

/* Everything else in the starter flat: the barks he says to himself while
 * eating, smoking, showering and waiting for a phone that is not ringing. */
const APARTMENT_BARKS = new Set([
  'door', 'mail', 'machine', 'idle', 'beer', 'cig', 'fridge', 'whiskey', 'poop',
  'pee', 'fart', 'bong', 'shrooms', 'zyn', 'eat', 'shower', 'glue', 'tap',
  'sleep', 'wake', 'getup', 'liedown', 'dress', 'notice', 'photo', 'spooky',
  'gun', 'hunghigh', 'hungfixed', 'silentnight', 'tv', 'darts', 'poker',
  'heave', 'hr', 'milk', 'fired', 'slice', 'ammo', 'computer', 'toilet',
]);

const beatOf = (name) => {
  for (const [prefix, beat] of ROUTES) if (name.startsWith(prefix)) return beat;
  const second = name.split('.')[1];
  if (name.startsWith('vo.') && APARTMENT_BARKS.has(second)) return '1';
  return null;
};

/* Ordering confidence. A straight run of authored beats reads in order; a
 * tree or a hashed-id bank is authored order but not a single conversation. */
const TREE_SCENES = [
  ['vo.golf.', 'TREE — dialogue tree, authored order'],
  ['vo.motel.', 'BANK — hashed cue ids, authored order'],
  ['vo.bing.', 'MIXED — floor barks plus authored beats'],
  ['radio.', 'ROTATION — scheduled, not a conversation'],
];
const orderingOf = (name) => {
  for (const [prefix, note] of TREE_SCENES) if (name.startsWith(prefix)) return note;
  return 'RUN — authored order';
};

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const voices = manifest.voices || {};

/* WHO IS SPEAKING.
 *
 * The manifest's `_note` on each voice is the booth description, and most of
 * them open with the character's name before the first dash, colon or full
 * stop -- "Booski. CS gambling show", "James Blond -- owner-cast". Taking that
 * head gives a real name for 70-odd of the 84 voices. The rest describe the
 * part instead of naming it ("The man who lives here"), so they are named
 * here by hand. A voice with no note at all falls back to its own slug, which
 * is never pretty but is never wrong either. */
const NAMED = {
  player: 'Tony (the Prospect)',
  waiter: 'Silver Room staff',
  hogmama: 'Hog Mama',
  doorman: 'Bing doorman',
  dealer: 'Blackjack dealer',
  'heist-customer': 'Bank customer (THE TAKE)',
  'npc-reserve-1': 'Disposable NPC (shared)',
  'silver-waiter': 'Silver Room date waiter',
  'mansion-gate': 'Mansion gate man',
  'mansion-guard': 'Mansion guard',
  manager: 'Front & Center manager',
  bandleader: 'Midnight Pines bandleader',
  'mark-wife': 'Mark’s wife',
  announcer: '97.8 station announcer',
};
const characterOf = (voice) => {
  if (!voice) return '(unvoiced)';
  if (NAMED[voice]) return NAMED[voice];
  const note = voices[voice]?._note;
  if (!note) return voice;
  const head = String(note).split(/\s[—–-]{1,2}\s|[.,;:(]/)[0].trim();
  if (!head || head.length > 34) return voice;
  return head;
};

const rows = [];
const unassigned = new Map();
manifest.sfx.forEach((cue, index) => {
  if (!cue.say) return;
  const beat = beatOf(cue.name);
  if (!beat) {
    const key = cue.name.split('.').slice(0, 2).join('.');
    unassigned.set(key, (unassigned.get(key) || 0) + 1);
    return;
  }
  rows.push({
    beat,
    beatTitle: BEAT_INDEX.get(beat).title,
    chapter: BEAT_INDEX.get(beat).chapter,
    manifestIndex: index,
    cue: cue.name,
    voice: cue.voice || '',
    character: characterOf(cue.voice),
    line: cue.say,
    words: String(cue.say).trim().split(/\s+/).length,
    ordering: orderingOf(cue.name),
    file: cue.file ? `${cue.file}.mp3` : `${cue.name}.mp3`,
  });
});

rows.sort((a, b) => (
  BEAT_INDEX.get(a.beat).i - BEAT_INDEX.get(b.beat).i
  || a.manifestIndex - b.manifestIndex
));
let seq = 0;
let currentBeat = null;
for (const row of rows) {
  if (row.beat !== currentBeat) { currentBeat = row.beat; seq = 0; }
  seq += 1;
  row.order = seq;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const HEAD = ['Beat', 'Chapter', 'Scene', 'Order', 'Character', 'Voice', 'Line', 'Words', 'Ordering', 'Cue', 'File'];
const csv = [HEAD.join(',')];
for (const r of rows) {
  csv.push([r.beat, r.chapter, r.beatTitle, r.order, r.character, r.voice,
    r.line, r.words, r.ordering, r.cue, r.file].map(csvCell).join(','));
}
fs.writeFileSync(path.join(OUT_DIR, 'DIALOGUE-PASS.csv'), `${csv.join('\n')}\n`);
fs.writeFileSync(path.join(OUT_DIR, 'DIALOGUE-PASS.json'), `${JSON.stringify(rows, null, 2)}\n`);

const perBeat = new Map();
for (const r of rows) perBeat.set(r.beat, (perBeat.get(r.beat) || 0) + 1);
console.log(`[dialogue-pass] ${rows.length} spoken lines across ${perBeat.size} beats.`);
for (const [n, title] of BEATS.map(([n, t]) => [n, t])) {
  const count = perBeat.get(n) || 0;
  console.log(`  ${String(n).padStart(4)}  ${String(count).padStart(5)}  ${title}${count ? '' : '   <-- NO LINES'}`);
}
if (unassigned.size) {
  console.log('\n[dialogue-pass] UNASSIGNED prefixes (add them to ROUTES):');
  for (const [key, count] of [...unassigned].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${key}`);
  }
  process.exitCode = 1;
}
