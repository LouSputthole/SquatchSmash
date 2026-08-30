#!/usr/bin/env node
/**
 * Generate the SquatchSmash radio and music audit from the live campaign
 * spine, scene contracts, station data, audio manifests, and known runtime
 * ownership seams.
 *
 * The CSV and Markdown path is dependency-free:
 *   node tools/radio-audit.mjs
 *   node tools/radio-audit.mjs --check
 *
 * XLSX authoring is deliberately opt-in development tooling. Codex supplies
 * `@oai/artifact-tool`; pass its exact module URL rather than adding a package
 * or a build dependency to this no-build game:
 *   node tools/radio-audit.mjs --xlsx-output <file.xlsx> \
 *     --artifact-tool-url <file:///.../artifact_tool.mjs> \
 *     --preview-dir <directory> --qa-output <file.json>
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  applyRadioActivePlayCoverage,
  summarizeRadioActivePlayCoverage,
} from './radio-active-play-coverage.mjs';

const TOOL_FILE = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(TOOL_FILE), '..');
const MUSIC_EXTENSIONS = ['.mp3', '.ogg', '.m4a', '.wav'];
const FORMULA_ERRORS = ['#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#N/A'];

export const SHEETS = Object.freeze({
  'Scene Timeline': Object.freeze([
    'Chapter', 'Beat', 'Campaign day', 'Campaign time', 'Scene ID',
    'Scene filename', 'Location or venue', 'Radio or music source', 'Station',
    'Cue ID', 'Asset path', 'Trigger', 'Start condition', 'Stop condition',
    'Loop behavior', 'Expected duration', 'Volume', 'Ducking behavior',
    'Priority', 'Overlap risk', 'Current status', 'Notes', 'Proposed change',
    'Owner decision required', 'Implementation status',
  ]),
  'Station Catalog': Object.freeze([
    'Station ID', 'Display name', 'Intended identity', 'Genre or mood',
    'Track count', 'Total runtime', 'Sweepers or station IDs',
    'Venues where available', 'Campaign scenes where heard', 'Repeat risk',
    'Missing content', 'Volume or EQ notes', 'Recommended changes',
  ]),
  'Cue Inventory': Object.freeze([
    'Cue ID', 'File', 'Format', 'Duration', 'Source or license note',
    'Loop flag', 'Number of uses', 'Scenes using it', 'Orphan status',
    'Duplicate status', 'Filename-content mismatch', 'Loudness issue',
    'Playback issue', 'Recommended action',
  ]),
  'Problems and Decisions': Object.freeze([
    'Severity', 'Scene', 'Station or cue', 'Problem', 'Evidence',
    'Player impact', 'Proposed fix', 'Mechanical or creative',
    'Owner decision needed', 'Status',
  ]),
  'Revamp Plan': Object.freeze([
    'Order', 'Work item', 'Files', 'Dependency', 'Risk',
    'Acceptance check', 'Status', 'Commit',
  ]),
});

const LOCATION_BY_SCENE = Object.freeze({
  apartment: 'Starter apartment',
  bada_bing_one: 'Bada Bing / player car / back office',
  squatchfather: 'East-side restaurant',
  countryside_cabin: 'Country cabin, cellar, dungeon, and grounds',
  airstrip_smuggling: 'Whispering Pines airstrip, cockpit, and mountain route',
  bada_bing_two: 'Bada Bing party and cleanup',
  squatch_graveyard: 'Squatch graveyard',
  jerky_motel: 'Roadside motel and approach drive',
  bank_heist: 'Safehouse, bank, streets, garage, and escape car',
  silver_pines: 'Silver Pines course and lead golf cart',
  luxury_apartment: 'Luxury apartment',
  silver_room: 'Front & Center supper club',
  no_wake: 'South Harbor boat',
  silver_case: 'Pickup car and Silver Case apartment',
  mansion: 'Lou’s mansion and Silent Squatch cellar',
  mansion_siege: 'Lou’s mansion under siege',
  enola_squatch: 'Whispering Pines, bomber, target city, and return flight',
  mansion_return: 'Repaired Lou’s mansion',
  cartel_palace: 'Rival palace / estate',
  special_meeting: 'Apartment street, pickup car, forest spur, and trail',
  initiation: 'Initiation cabin and outdoor ceremony',
});

/*
 * These are current runtime windows, not promises about a future calendar
 * migration. Exact anchors cite the clock; variable windows say so rather
 * than inventing a minute. When the route moves, this table is intentionally
 * small and reviewable next to the route-and-anchor commit.
 */
const BASE_BEAT_CLOCK = Object.freeze({
  squatch_smash_intro: ['Day 1', 'Opening save; clock starts 06:00'],
  first_apartment: ['Day 1', 'Opening apartment window; variable'],
  bada_bing_one: ['Day 1', 'Late evening; departure anchored 23:41'],
  squatchfather: ['Day 1–2', 'Late night; completion anchored Day 2 03:00'],
  cabin_lay_low: ['Day 2', 'Morning; lay-low rest anchored 09:20'],
  booski_sasole_call: ['Day 2', 'After required cabin exploration; variable'],
  beef_run: ['Day 2', '09:10–20:30 anchored flight window'],
  cabin_two: ['Day 3–4', '08:10; nightfall 20:45; blackout Day 4 09:30'],
  bada_bing_two: ['Day 4', '23:00 anchored departure'],
  graveyard: ['Day 5', '00:15 anchored arrival'],
  jerky_motel: ['Day 5', '01:30–06:30 overnight cover window; incident resolves before Snow’s daylight drop'],
  return_to_old_apartment: ['Day 5', 'After Motel; noon wake/decompression'],
  bank_heist: ['Day 5', '12:45–18:50 anchored mission window'],
  new_space_call: ['Day 5', 'After THE TAKE; evening variable'],
  silver_pines: ['Day 6', '07:30–10:30 anchored round'],
  luxury_apartment_intro: ['Day 6', '11:45 arrival; afternoon get-ready'],
  front_and_center: ['Day 6', '19:30–23:20 anchored date'],
  margo_stayover: ['Day 6–7', '23:20 through overnight'],
  luxury_apartment_morning: ['Day 7', '07:10 anchored wake'],
  no_wake: ['Day 7', '12:45–16:40 anchored mission window'],
  luxury_apartment_return: ['Day 7', 'About 17:20 after 40-minute return'],
  silver_case_setup: ['Day 8', '16:00 pickup anchor; 90-minute mission'],
  silver_case_mansion: ['Day 8', 'After Silver Case recovery; variable'],
  silent_squatch: ['Day 8–9', 'Mansion evening then six-hour guest-room rest'],
  mansion_siege: ['Day 9', 'Pre-dawn; two-hour siege window'],
  enola_squatch: ['Day 9', '14:00–18:00 anchored mission window'],
  mansion_return: ['Day 12', '18:30 return; 45-minute debrief'],
  cartel_palace: ['Day 12', '20:30–23:00 anchored assault'],
  special_meeting_call: ['Day 13', '17:55 departure anchor after apartment call'],
  pickup_ride: ['Day 13', '17:55–19:00 runtime Special Meeting window'],
  initiation: ['Day 13', '19:00–20:50 runtime ceremony window'],
});

function clockExpressionMinutes(expression) {
  const compact = String(expression).replace(/\s+/g, ' ').trim();
  let match = compact.match(/^(\d+)\s*\*\s*60(?:\s*\+\s*(\d+))?$/);
  if (match) return Number(match[1]) * 60 + Number(match[2] ?? 0);
  match = compact.match(/^(\d+)\s*\+\s*(\d+)\s*\*\s*60$/);
  if (match) return Number(match[1]) + Number(match[2]) * 60;
  if (/^\d+$/.test(compact)) return Number(compact);
  return null;
}

function clockEvent(source, eventId) {
  const marker = `[TIME_EVENT_IDS.${eventId}]`;
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const block = source.slice(start, start + 420);
  const anchored = block.match(/atLeast:\s*Object\.freeze\(\{\s*day:\s*(\d+),\s*timeMinutes:\s*([^}\r\n]+)\s*}\)/);
  if (anchored) {
    const timeMinutes = clockExpressionMinutes(anchored[2]);
    if (Number.isFinite(timeMinutes)) return { day: Number(anchored[1]), timeMinutes, anchored: true };
  }
  const relative = block.match(/minutes:\s*(\d+)\s*}/);
  return relative ? { minutes: Number(relative[1]), anchored: false } : null;
}

function formatClock(minutes) {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function addClock(anchor, minutes) {
  const total = anchor.timeMinutes + minutes;
  return { day: anchor.day + Math.floor(total / 1440), timeMinutes: total % 1440, anchored: true };
}

function clockWindow(anchor, duration, label) {
  if (!anchor?.anchored) return null;
  const end = addClock(anchor, duration);
  return [`Day ${anchor.day}${end.day !== anchor.day ? `–${end.day}` : ''}`,
    `${formatClock(anchor.timeMinutes)}–${formatClock(end.timeMinutes)} ${label}`];
}

function buildBeatClock(campaignSource) {
  const result = Object.fromEntries(Object.entries(BASE_BEAT_CLOCK).map(([id, value]) => [id, [...value]]));
  const enola = clockEvent(campaignSource, 'DEPART_ENOLA_SQUATCH');
  const mansionReturn = clockEvent(campaignSource, 'DEPART_MANSION_RETURN')
    ?? clockEvent(campaignSource, 'RETURN_TO_MANSION');
  const cartel = clockEvent(campaignSource, 'DEPART_CARTEL_PALACE');
  const special = clockEvent(campaignSource, 'DEPART_SPECIAL_MEETING');
  const initiation = clockEvent(campaignSource, 'DEPART_INITIATION');
  const enolaWindow = clockWindow(enola, 4 * 60, 'runtime anchor/window');
  if (enolaWindow) result.enola_squatch = enolaWindow;
  const mansionWindow = clockWindow(mansionReturn, 45, 'runtime anchor/window');
  if (mansionWindow) result.mansion_return = mansionWindow;
  const cartelWindow = clockWindow(cartel, 150, 'runtime anchor/window');
  if (cartelWindow) result.cartel_palace = cartelWindow;
  const afterCartel = (event) => event?.anchored && (!cartel?.anchored
    || event.day > cartel.day
    || (event.day === cartel.day && event.timeMinutes >= cartel.timeMinutes));
  if (afterCartel(special)) {
    result.special_meeting_call = [`Day ${special.day}`, `${formatClock(special.timeMinutes)} departure anchor after apartment call`];
    result.pickup_ride = clockWindow(special, 65, 'runtime Special Meeting window');
  }
  if (afterCartel(initiation)) {
    result.initiation = clockWindow(initiation, 110, 'runtime ceremony window');
  }
  return Object.freeze(result);
}

/* One declaration per physical implementation. Mansion Return deliberately
 * shares Mansion's receiver; every other ID is unique save ownership. */
const RECEIVERS = Object.freeze({
  apartment: {
    sourceFile: 'src/main.js', receiverId: 'apartment', venue: 'apartment',
    persisted: true, notice: 'Day One only', news: true, output: 1,
    hour: 'Live campaign clock', fullSongs: false,
  },
  bada_bing_one: {
    sourceFile: 'src/bing/main.js', receiverId: 'bing_car', venue: 'apartment',
    persisted: true, notice: 'Day One only', news: false, output: 1,
    hour: 'Live campaign clock', fullSongs: false,
  },
  countryside_cabin: {
    sourceFile: 'src/cabin/main.js', receiverId: 'countryside_cabin',
    venue: 'countryside_cabin', persisted: true, notice: 'Off', news: true,
    output: 0.9, hour: 'Live campaign clock', fullSongs: false,
  },
  airstrip_smuggling: {
    sourceFile: 'src/beefrun/main.js', receiverId: 'beefrun_cockpit',
    venue: 'beefrun', persisted: true, notice: 'Off', news: false,
    output: 0.62, hour: 'Authored 09:10', fullSongs: false,
  },
  no_wake: {
    sourceFile: 'src/nowake/main.js', receiverId: 'no_wake_cabin',
    venue: 'apartment', persisted: true, notice: 'Off', news: false,
    output: 0.55, hour: 'Authored 12:45', fullSongs: false,
  },
  silver_pines: {
    sourceFile: 'src/golf/main.js', receiverId: 'silver_pines_lead_cart',
    venue: 'silver_pines', persisted: true, notice: 'Off', news: false,
    output: 1, hour: 'Authored 08:00', fullSongs: true,
  },
  luxury_apartment: {
    sourceFile: 'src/luxury-apartment/main.js', receiverId: 'luxury_apartment',
    venue: 'luxury_apartment', persisted: true, notice: 'Off', news: false,
    output: 0.88, hour: 'Live campaign clock', fullSongs: false,
  },
  mansion: {
    sourceFile: 'src/mansion/main.js', receiverId: 'mansion_house', venue: 'mansion',
    persisted: true, notice: 'Off', news: false, output: 1,
    hour: 'Fixed 21:00', fullSongs: false,
  },
  mansion_return: {
    sourceFile: 'src/mansion/main.js', receiverId: 'mansion_house', venue: 'mansion',
    persisted: true, notice: 'Off', news: false, output: 1,
    hour: 'Fixed 21:00', fullSongs: false,
  },
});

const DEDICATED_PROGRAMS = Object.freeze([
  {
    beats: ['bada_bing_one'], source: 'Bada Bing DJ booth', station: 'Venue music',
    cue: 'music.club', files: ['sallie-j.mp3', 'squatch-up.mp3', 'booskibro.mp3', 'squatches-in-the-house.mp3'],
    trigger: 'Bing scene starts; player request swaps to Squatches in the House',
    start: 'Fresh Bada Bing I runtime', stop: 'Scene unload or record replacement',
    loop: 'Current selected record loops', duration: 'Continuous while in venue',
    volume: '0.04 positional · DJ booth', duck: 'Shared music-bus voice duck',
    priority: 'Venue bed', risk: 'MEDIUM — can coexist with car and office radios',
    status: 'LIVE', notes: 'Owner-selected club records retained.',
  },
  {
    beats: ['bada_bing_one'], source: 'Lou’s office radio', station: 'Room record',
    cue: 'office.radio', files: ['good-ole-days.mp3'],
    trigger: 'Bing scene starts', start: 'Office exists', stop: 'Scene unload',
    loop: 'Loops', duration: 'Continuous', volume: '0.20 positional · tight 5.2 m falloff',
    duck: 'Shared music-bus voice duck', priority: 'Room ambience',
    risk: 'LOW — positional and wall-zoned', status: 'LIVE',
    notes: 'Separate from the one-shot Sensi Lou sting.',
  },
  {
    beats: ['bada_bing_one'], source: 'Lou doorway signature sting', station: 'Non-diegetic cue',
    cue: 'music.sensilou', files: ['sensi-lou.mp3'],
    trigger: 'Player opens Lou’s office door', start: '5.0 s into master', stop: '9.7 s hard window',
    loop: 'One-shot', duration: '4.7 s authored window', volume: '0.242 flat',
    duck: 'Shared music-bus voice duck', priority: 'Signature sting', risk: 'LOW', status: 'LIVE',
    notes: 'Owner-picked window; do not turn into room radio.',
  },
  {
    beats: ['bada_bing_one'], source: 'Booski signature sting', station: 'Non-diegetic cue',
    cue: 'music.booski', files: ['baby-snakes.mp3'],
    trigger: 'Player takes Booski’s shot', start: '18.6 s into master', stop: '22.6 s hard window',
    loop: 'One-shot', duration: '4.0 s authored window', volume: '0.40 flat',
    duck: 'Shared music-bus voice duck', priority: 'Signature sting', risk: 'LOW', status: 'LIVE',
    notes: 'Owner-picked window retained.',
  },
  {
    beats: ['bada_bing_one'], source: 'License to Grill store-room radio', station: 'Room record',
    cue: 'music.storeroom', files: ['spy-jazz.mp3'],
    trigger: 'License to Grill store room is active', start: 'Room sequence', stop: 'Scene unload',
    loop: 'Loops', duration: 'Continuous', volume: '0.09 positional',
    duck: 'Shared music-bus voice duck', priority: 'Room ambience', risk: 'LOW', status: 'LIVE',
    notes: 'Delivered track replaces Cosmic Drift fallback.',
  },
  {
    beats: ['beef_run'], source: 'Beef Run takeoff needle-drop', station: 'Non-diegetic cue',
    cue: 'music.knocking', files: ['cant-you-hear-me-knocking.mp3'],
    trigger: 'Initial outbound takeoff passes 45 knots', start: '0 s', stop: '180 s or phase teardown',
    loop: 'One-shot', duration: 'Up to 180 s', volume: '0.30',
    duck: 'Shared music-bus voice duck', priority: 'Mission cue', risk: 'LOW', status: 'LIVE',
    notes: 'Only initial takeoff; owner-selected track retained.',
  },
  {
    beats: ['bada_bing_two'], source: 'Billy Hotdog party record', station: 'Venue music',
    cue: 'party.record', files: ['good-ole-days.mp3'],
    trigger: 'Hotdog party runtime starts', start: 'Mission start', stop: 'Scene teardown / cleanup transition',
    loop: 'Loops', duration: 'Party duration', volume: '0.035 positional · DJ booth',
    duck: 'Shared music-bus voice duck', priority: 'Venue bed', risk: 'LOW', status: 'LIVE',
    notes: 'Owner-selected record retained.',
  },
  {
    beats: ['jerky_motel'], source: 'Jerky Motel drive score', station: 'Non-diegetic score',
    cue: 'motel.drive.score', files: ['driving-jerky-hotel.mp3'],
    trigger: 'Approach drive begins', start: 'Driving phase', stop: 'Arrival / drive phase ends',
    loop: 'Loops while driving', duration: 'Driving phase', volume: '0.16 × user volume',
    duck: 'Dedicated HTML media; voice mix requires active-play check',
    priority: 'Mission score', risk: 'MEDIUM — procedural Motel score starts later', status: 'LIVE',
    notes: 'Background score with no world source.',
  },
  {
    beats: ['bank_heist'], source: 'THE TAKE safehouse record', station: 'Room record',
    cue: 'heist.morning.radio', files: ['codename-sasquatch.mp3'],
    trigger: 'Fresh safehouse start only', start: 'Mission start', stop: 'Retired before escape-drive score',
    loop: 'Loops during prep', duration: 'Safehouse prep', volume: '0.14',
    duck: 'Shared music-bus voice duck', priority: 'Prep needle-drop', risk: 'LOW', status: 'LIVE',
    notes: 'Does not replay on preview, resume, or return.',
  },
  {
    beats: ['bank_heist'], source: 'THE TAKE escape-car score', station: 'Non-diegetic score',
    cue: 'music.heist.escape-drive', files: ['driving-the-take.mp3'],
    trigger: 'Player takes escape-car control', start: 'Driving phase', stop: 'Drive completion / scene teardown',
    loop: 'Loops', duration: 'Escape drive', volume: '0.16',
    duck: 'Shared music-bus voice duck', priority: 'Mission score', risk: 'LOW — prep record explicitly stopped', status: 'LIVE',
    notes: 'Background score with no world source.',
  },
  {
    beats: ['front_and_center'], source: 'Front & Center supper-club bed', station: 'Non-diegetic venue score',
    cue: 'silver.room.background', files: ['front-and-center-background-35c043f1.mp3'],
    trigger: 'Silver Room starts; mix follows player zone', start: 'Scene start at zero gain', stop: 'Scene teardown',
    loop: 'Loops', duration: 'Whole venue scene', volume: '0 exterior · 0.064 corridor · 0.13 club; ×0.48 under dialogue',
    duck: 'Music-bus duck plus explicit dialogue factor', priority: 'Venue bed',
    risk: 'LOW — muted during performance', status: 'LIVE',
    notes: 'Muffled after kitchen, clear but restrained in dining room.',
  },
  {
    beats: ['front_and_center'], source: 'Front & Center opening tail', station: 'Non-diegetic performance cue',
    cue: 'band.feature.tail', files: ['front-and-center-opening-b3b9d1cc.mp3'],
    trigger: 'Band opening joke completes', start: '0 s', stop: '27 s with 0.35 s cut fade',
    loop: 'One-shot', duration: '27 s', volume: 'Performance mix',
    duck: 'Shared music-bus voice duck', priority: 'Featured number',
    risk: 'LOW — background score is explicitly muted', status: 'LIVE',
    notes: 'Transitions directly into Bananaphone; owner-selected 27-second window retained.',
  },
  {
    beats: ['front_and_center'], source: 'Front & Center featured band number', station: 'Stage performance',
    cue: 'band.feature', files: ['front-and-center-bananaphone-e786d7fe.mp3'],
    trigger: 'Third band number', start: 'Number begins', stop: 'Authored ending at 192.62 s',
    loop: 'One-shot', duration: '192.62 s', volume: '0.42; 0.20 duck factor',
    duck: 'Performance mix and voice duck', priority: 'Featured number',
    risk: 'LOW — stems stop before master runs', status: 'LIVE',
    notes: 'Visible trumpeter sells the stage source; owner-selected track retained.',
  },
  {
    beats: ['enola_squatch'], source: 'Enola takeoff needle-drop', station: 'Non-diegetic cue',
    cue: 'music.takeoff', files: ['fortunate-son.mp3'],
    trigger: 'Takeoff phase', start: '0 s', stop: '150 s with 4 s fade or target-run transition',
    loop: 'One-shot', duration: 'Up to 150 s', volume: '0.435',
    duck: 'Shared music-bus voice duck', priority: 'Mission cue', risk: 'LOW', status: 'LIVE',
    notes: 'Owner-selected track retained.',
  },
  {
    beats: ['enola_squatch'], source: 'Enola bomb-run approach score', station: 'Non-diegetic score',
    cue: 'music.enola.approach', files: ['enola-pre-bomb-drop-approach.mp3'],
    trigger: 'Pre-release target-run checkpoint', start: 'Aligned so 37.704 s master ends near release',
    stop: 'Hard-cut on exact release frame if player arrives early', loop: 'One-shot',
    duration: '37.704 s maximum', volume: '0.22', duck: 'Shared music-bus voice duck',
    priority: 'Narrative score', risk: 'LOW — prior score is stopped first', status: 'LIVE',
    notes: 'No music under bomb release or explosion.',
  },
  {
    beats: ['enola_squatch'], source: 'Enola explosion aftermath', station: 'Intentional silence',
    cue: 'enola.explosion.silence', files: [], trigger: 'Bomb release and detonation',
    start: 'Approach score cuts on release', stop: '1.8 s after explosion phase lands',
    loop: 'No', duration: 'Explosion plus 1.8 s authored aftermath', volume: '0',
    duck: 'N/A', priority: 'Narrative silence', risk: 'LOW', status: 'LIVE',
    notes: 'Powerful explosion is intentionally allowed to sit.',
  },
  {
    beats: ['enola_squatch'], source: 'Enola escape score', station: 'Non-diegetic score',
    cue: 'music.enola.escape', files: ['enola-escape-after-drop.mp3'],
    trigger: 'Explosion aftermath completes', start: '1.8 s after explosion phase lands',
    stop: 'Return checkpoint / mission teardown', loop: 'One-shot; checkpoint may resume',
    duration: '148.2 s', volume: '0.24', duck: 'Shared music-bus voice duck',
    priority: 'Narrative score', risk: 'LOW — approach and takeoff tracks are stopped first', status: 'LIVE',
    notes: 'Owner-delivered escape master retained.',
  },
]);

function parseArgs(argv) {
  const out = { check: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--check') out.check = true;
    else if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`);
      out[key] = value;
      i++;
    } else throw new Error(`Unknown argument ${token}`);
  }
  return out;
}

function round(value, places = 3) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function normaliseText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join('; ');
  return String(value).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function csvCell(value) {
  const text = normaliseText(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(columns, rows) {
  // `.gitattributes` pins LF. CRLF passes locally on Windows but Git stores LF,
  // so a Linux `--check` would otherwise reject the exact files we generated.
  return [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ''))]
    .map((row) => row.map(csvCell).join(','))
    .join('\n') + '\n';
}

function slugSheet(name) {
  return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let cursor = 0;
  while ((cursor = haystack.indexOf(needle, cursor)) !== -1) {
    count++;
    cursor += needle.length;
  }
  return count;
}

function lineReference(file, source, needle) {
  const index = source.indexOf(needle);
  if (index < 0) return `${file} (pattern not found)`;
  const line = source.slice(0, index).split('\n').length;
  return `${file}:${line}`;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readOptionalJson(file, fallback) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function walkFiles(root, predicate) {
  const result = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (!predicate || predicate(file)) result.push(file);
    }
  }
  await walk(root);
  return result.sort();
}

function parseMp3Header(buffer, offset) {
  if (offset + 4 > buffer.length || buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) return null;
  const versionBits = (buffer[offset + 1] >> 3) & 0x03;
  const layerBits = (buffer[offset + 1] >> 1) & 0x03;
  const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
  const sampleIndex = (buffer[offset + 2] >> 2) & 0x03;
  const padding = (buffer[offset + 2] >> 1) & 0x01;
  if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) return null;
  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const layer = layerBits === 3 ? 1 : layerBits === 2 ? 2 : 3;
  const bitrateTables = {
    '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  };
  const key = `${version === 1 ? 1 : 2}-${layer}`;
  const bitrate = bitrateTables[key][bitrateIndex] * 1000;
  const sampleRates = version === 1 ? [44100, 48000, 32000]
    : version === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
  const sampleRate = sampleRates[sampleIndex];
  const frameLength = layer === 1
    ? Math.floor((12 * bitrate / sampleRate) + padding) * 4
    : Math.floor(((layer === 3 && version !== 1 ? 72 : 144) * bitrate / sampleRate) + padding);
  const samples = layer === 1 ? 384 : layer === 2 ? 1152 : version === 1 ? 1152 : 576;
  if (!frameLength || !sampleRate) return null;
  return { frameLength, samples, sampleRate };
}

async function mp3Duration(file) {
  const buffer = await fs.readFile(file);
  let offset = 0;
  if (buffer.length >= 10 && buffer.toString('ascii', 0, 3) === 'ID3') {
    const size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14)
      | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
    offset = 10 + size;
  }
  let seconds = 0;
  let frames = 0;
  while (offset + 4 <= buffer.length) {
    const header = parseMp3Header(buffer, offset);
    if (!header || offset + header.frameLength > buffer.length) {
      offset++;
      continue;
    }
    seconds += header.samples / header.sampleRate;
    frames++;
    offset += header.frameLength;
  }
  return frames ? round(seconds, 3) : null;
}

async function mediaDuration(file, manifestDuration = null) {
  if (!file) return Number.isFinite(manifestDuration) ? manifestDuration : null;
  const ext = path.extname(file).toLowerCase();
  if (ext === '.mp3') return mp3Duration(file);
  return Number.isFinite(manifestDuration) ? manifestDuration : null;
}

async function sha256(file) {
  if (!file) return null;
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

function sceneIdsForFiles(referenceFiles, contracts) {
  const roots = new Map();
  for (const contract of contracts) {
    for (const entry of contract.entrypoints) roots.set(entry.root.replace(/\\/g, '/'), contract.id);
  }
  const scenes = new Set();
  for (const file of referenceFiles) {
    const normalized = file.replace(/\\/g, '/');
    for (const [root, sceneId] of roots) {
      const directory = path.posix.dirname(root);
      if (normalized === root || normalized.startsWith(`${directory}/`)) scenes.add(sceneId);
    }
    if (normalized.startsWith('src/core/')) {
      for (const sceneId of Object.keys(RECEIVERS)) scenes.add(sceneId);
    }
  }
  return [...scenes].sort();
}

function musicScenes(file) {
  const explicit = new Map();
  for (const program of DEDICATED_PROGRAMS) {
    if (!program.files.includes(file)) continue;
    for (const beat of program.beats) explicit.set(beat, true);
  }
  const sceneIds = new Set();
  for (const beatId of explicit.keys()) {
    const scene = MUSIC_BEAT_SCENE.get(beatId);
    if (scene) sceneIds.add(scene);
  }
  return sceneIds;
}

const MUSIC_BEAT_SCENE = new Map();

function buildSceneTimeline({ spine, contracts, musicTracks, beatClock }) {
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const programsByBeat = new Map();
  for (const program of DEDICATED_PROGRAMS) {
    for (const beatId of program.beats) {
      if (!programsByBeat.has(beatId)) programsByBeat.set(beatId, []);
      programsByBeat.get(beatId).push(program);
    }
  }
  const rows = [];
  for (const beat of spine) {
    MUSIC_BEAT_SCENE.set(beat.id, beat.scene);
    const contract = contractById.get(beat.scene);
    const clock = beatClock[beat.id] ?? ['Unknown', 'Unmapped'];
    const receiver = RECEIVERS[beat.scene];
    if (receiver) {
      const eligible = musicTracks.filter((track) => !track.cue
        && (!track.venue || track.venue === receiver.venue));
      rows.push({
        Chapter: beat.chapter.replaceAll('_', ' '),
        Beat: `${beat.n} · ${beat.title}`,
        'Campaign day': clock[0],
        'Campaign time': clock[1],
        'Scene ID': beat.scene,
        'Scene filename': contract?.campaign?.href ?? '',
        'Location or venue': LOCATION_BY_SCENE[beat.scene] ?? contract?.title ?? beat.scene,
        'Radio or music source': `Physical 97.8 receiver · ${receiver.receiverId ?? 'scene-local state'}`,
        Station: '97.8 THE SQUATCH',
        'Cue ID': 'station:squatch',
        'Asset path': `assets/music/manifest.json (${eligible.length} eligible tracks); assets/sfx/manifest.json`,
        Trigger: 'Player powers the physical receiver; saved power may start it already on',
        'Start condition': `${receiver.hour}; notice ${receiver.notice}; mission news ${receiver.news ? 'enabled' : 'disabled'}`,
        'Stop condition': 'Power off or scene teardown',
        'Loop behavior': receiver.fullSongs
          ? 'Deterministic 21-slot station cycle; full records on song slots'
          : 'Deterministic 21-slot station cycle; 30 s excerpts on song slots',
        'Expected duration': 'Continuous while powered',
        Volume: `Saved knob defaults 0.70 × output ${receiver.output}`,
        'Ducking behavior': 'Phone calls scale radio to 0.34 where the scene wires call ducking',
        Priority: 'Diegetic receiver',
        'Overlap risk': receiver.persisted ? 'LOW/MEDIUM — verify against scene music' : 'MEDIUM — state resets on reload',
        'Current status': `${beat.status.toUpperCase()} · LIVE RECEIVER`,
        Notes: `Eligible: ${eligible.map((track) => track.file).join(', ') || 'no records'}; ${receiver.persisted ? 'campaign-persisted' : 'not campaign-persisted'}.`,
        'Proposed change': receiver.persisted
          ? 'Keep; add active-play overlap receipt.'
          : 'Mechanical: give this receiver the shared campaign adapter if reload continuity is intended.',
        'Owner decision required': 'No for receiver mechanics; OWNER only for playlist identity.',
        'Implementation status': receiver.persisted ? 'Live; active-play audit pending' : 'Live; persistence gap open',
      });
    }
    const programs = programsByBeat.get(beat.id) ?? [];
    for (const program of programs) {
      rows.push({
        Chapter: beat.chapter.replaceAll('_', ' '), Beat: `${beat.n} · ${beat.title}`,
        'Campaign day': clock[0], 'Campaign time': clock[1], 'Scene ID': beat.scene,
        'Scene filename': contract?.campaign?.href ?? '',
        'Location or venue': LOCATION_BY_SCENE[beat.scene] ?? contract?.title ?? beat.scene,
        'Radio or music source': program.source, Station: program.station,
        'Cue ID': program.cue,
        'Asset path': program.files.length ? program.files.map((file) => `assets/music/${file}`).join('; ') : 'No music asset — deliberate silence',
        Trigger: program.trigger, 'Start condition': program.start, 'Stop condition': program.stop,
        'Loop behavior': program.loop, 'Expected duration': program.duration,
        Volume: program.volume, 'Ducking behavior': program.duck, Priority: program.priority,
        'Overlap risk': program.risk, 'Current status': `${beat.status.toUpperCase()} · ${program.status}`,
        Notes: program.notes, 'Proposed change': 'Keep owner-selected material; verify trigger, stop, restore, and mix in active play.',
        'Owner decision required': 'No creative substitution. OWNER only if track identity changes.',
        'Implementation status': 'Live; active-play audit pending',
      });
    }
    if (!receiver && !programs.length) {
      rows.push({
        Chapter: beat.chapter.replaceAll('_', ' '), Beat: `${beat.n} · ${beat.title}`,
        'Campaign day': clock[0], 'Campaign time': clock[1], 'Scene ID': beat.scene,
        'Scene filename': contract?.campaign?.href ?? '',
        'Location or venue': LOCATION_BY_SCENE[beat.scene] ?? contract?.title ?? beat.scene,
        'Radio or music source': 'No authored radio or music source found', Station: 'None',
        'Cue ID': 'None', 'Asset path': 'None', Trigger: 'None', 'Start condition': 'Scene entry',
        'Stop condition': 'N/A', 'Loop behavior': 'N/A', 'Expected duration': 'Silent by implementation',
        Volume: 'N/A', 'Ducking behavior': 'N/A', Priority: 'N/A',
        'Overlap risk': 'LOW — no source found', 'Current status': `${beat.status.toUpperCase()} · SILENT`,
        Notes: 'Source audit found no station receiver or long-form music asset owned by this beat.',
        'Proposed change': 'Keep silent unless a deliberate creative brief says otherwise.',
        'Owner decision required': 'OWNER only if this scene should gain music.',
        'Implementation status': 'No mechanical change proposed',
      });
    }
  }
  return rows;
}

function formatRuntime(seconds) {
  if (!Number.isFinite(seconds)) return 'Unknown';
  const minutes = Math.floor(seconds / 60);
  const remain = Math.round(seconds % 60);
  return `${minutes}:${String(remain).padStart(2, '0')}`;
}

function buildStationCatalog({ stations, musicTracks, durations, sfxByName }) {
  const rows = [];
  const receiverVenues = [...new Set(Object.values(RECEIVERS).map((receiver) => receiver.venue))].sort();
  const receiverScenes = Object.keys(RECEIVERS).sort();
  for (const station of stations) {
    const tracks = musicTracks.filter((track) => !track.cue);
    const seconds = tracks.reduce((sum, track) => sum + (durations.get(`music:${track.file}`) ?? 0), 0);
    const shows = station.shows.map((show) => `${show.from}:00–${show.to}:00 ${show.name}`).join('; ');
    const exactless = receiverVenues.filter((venue) => !musicTracks.some((track) => !track.cue && track.venue === venue));
    rows.push({
      'Station ID': station.id,
      'Display name': station.name,
      'Intended identity': station.tagline,
      'Genre or mood': `Talk/comedy schedule; ${shows}`,
      'Track count': tracks.length,
      'Total runtime': formatRuntime(seconds),
      'Sweepers or station IDs': [station.ident, 'radio.sting.squatch', 'radio.jingle']
        .map((name) => `${name}${sfxByName.has(name) ? '' : ' (missing)'}`).join('; '),
      'Venues where available': receiverVenues.join('; '),
      'Campaign scenes where heard': receiverScenes.join('; '),
      'Repeat risk': '21-slot deterministic cycle; every finite show/ad/tape/news list wraps after coverage.',
      'Missing content': `No exact venue tracks for: ${exactless.join(', ')}. Those receivers inherit unscoped records.`,
      'Volume or EQ notes': 'Saved knob defaults 70%; receiver output multipliers range 0.55–1.00; positional filtering varies by scene.',
      'Recommended changes': 'Mechanical: preserve deterministic coverage and add stop/restore/overlap receipts. OWNER: approve any venue allocation or show rewrite.',
    });
  }
  for (const legacy of [
    { id: 'uncle', name: '98.8 UNCLE SQUATCH BEATS', ident: 'radio.ident.uncle', sting: 'radio.sting.uncle', mood: 'Warm lo-fi beat station (legacy metadata)' },
    { id: 'ksqch', name: '101.7 KSQCH', ident: 'radio.ident.ksqch', sting: 'radio.sting.ksqch', mood: 'Scrappy garage-rock station (legacy metadata)' },
  ]) {
    const tracks = musicTracks.filter((track) => track.station === legacy.id && !track.cue);
    const seconds = tracks.reduce((sum, track) => sum + (durations.get(`music:${track.file}`) ?? 0), 0);
    rows.push({
      'Station ID': legacy.id, 'Display name': legacy.name,
      'Intended identity': 'Legacy manifest identity; no live STATIONS entry or dial position',
      'Genre or mood': legacy.mood, 'Track count': tracks.length,
      'Total runtime': formatRuntime(seconds),
      'Sweepers or station IDs': `${legacy.ident}; ${legacy.sting}`,
      'Venues where available': 'None as a selectable station; `station` tags are ignored by Radio.playlist',
      'Campaign scenes where heard': 'Tracks may still air through 97.8 when unscoped; station identity itself is not heard.',
      'Repeat risk': 'Not a live station.',
      'Missing content': 'No station runtime, schedule, selection UI, or persistence key.',
      'Volume or EQ notes': 'Legacy sweeper assets exist but are not selected by the live runtime.',
      'Recommended changes': 'OWNER: decide retire metadata or restore a station. Mechanical work follows that decision; do not silently revive or delete it.',
    });
  }
  return rows;
}

async function buildCueInventory({ repoRoot, musicTracks, sfxManifest, voiceCueNames, contracts, sourceFiles, sourceTexts,
  loudnessEvidence, contentEvidence }) {
  const sfxDir = path.join(repoRoot, 'assets/sfx');
  const musicDir = path.join(repoRoot, 'assets/music');
  const sfxFiles = await fs.readdir(sfxDir);
  const musicFiles = await fs.readdir(musicDir);
  const sfxFileMap = new Map(sfxFiles.map((file) => [file.toLowerCase(), file]));
  const musicFileMap = new Map(musicFiles.map((file) => [file.toLowerCase(), file]));
  const radioSfx = sfxManifest.sfx.filter((cue) => voiceCueNames.has(cue.name)
    || /(^|\.)(radio|news)(\.|$)/i.test(cue.name));
  const records = [];
  const loudnessByFile = new Map((loudnessEvidence?.measurements ?? [])
    .map((measurement) => [measurement.file, measurement]));
  const contentByCue = new Map((contentEvidence?.receipts ?? [])
    .map((receipt) => [receipt.cue, receipt]));
  function actualFile(directory, fileMap, base, explicit) {
    const choices = explicit ? [explicit] : MUSIC_EXTENSIONS.map((extension) => `${base}${extension}`);
    for (const choice of choices) {
      const actual = fileMap.get(choice.toLowerCase());
      if (actual) return path.join(directory, actual);
    }
    return null;
  }
  for (const track of musicTracks) {
    const file = actualFile(musicDir, musicFileMap, track.file, track.file);
    records.push({ kind: 'music', id: track.cue ? `music:${track.file}` : `track:${track.file}`,
      manifest: track, file, relative: file ? path.relative(repoRoot, file).replace(/\\/g, '/') : `assets/music/${track.file}` });
  }
  for (const cue of radioSfx) {
    const file = actualFile(sfxDir, sfxFileMap, cue.name, cue.file);
    records.push({ kind: 'sfx', id: cue.name, manifest: cue, file,
      relative: file ? path.relative(repoRoot, file).replace(/\\/g, '/') : `assets/sfx/${cue.file ?? `${cue.name}.mp3`}` });
  }
  for (const record of records) {
    record.duration = await mediaDuration(record.file, record.manifest.duration);
    record.hash = await sha256(record.file);
  }
  const duplicates = new Map();
  for (const record of records) {
    if (!record.hash) continue;
    if (!duplicates.has(record.hash)) duplicates.set(record.hash, []);
    duplicates.get(record.hash).push(record);
  }
  const allReceiverScenes = Object.keys(RECEIVERS).sort();
  const newsScenes = Object.entries(RECEIVERS).filter(([, receiver]) => receiver.news).map(([scene]) => scene).sort();
  const rows = [];
  for (const record of records) {
    const legacyIdentity = /^radio\.(ident|sting)\.(uncle|ksqch)$/.test(record.id);
    const token = record.kind === 'music' ? record.manifest.file : record.id;
    /* Apartment news cue names are deliberately composed at playback as
     * `vo.${bulletin.vo}.1`; the story data owns only `news.radio.day_two`,
     * for example. An exact-source search therefore used to call ten live
     * recordings orphans. Recognise that bounded authoring contract here so
     * the audit proves the dynamic use without pretending every arbitrary
     * template string is reachable. */
    const apartmentNews = record.kind === 'sfx'
      ? record.id.match(/^vo\.news\.(radio|tv)\.([a-z0-9_]+)\.1$/)
      : null;
    const sourceTokens = apartmentNews
      ? [token, `news.${apartmentNews[1]}.${apartmentNews[2]}`]
      : [token];
    const references = [];
    let sourceUses = 0;
    for (let index = 0; index < sourceFiles.length; index++) {
      const count = sourceTokens.reduce((sum, sourceToken) => (
        sum + countOccurrences(sourceTexts[index], sourceToken)
      ), 0);
      if (!count) continue;
      sourceUses += count;
      references.push(sourceFiles[index]);
    }
    const scenes = apartmentNews
      ? new Set(['apartment'])
      : record.kind === 'music' ? musicScenes(record.manifest.file)
        : new Set(sceneIdsForFiles(references, contracts));
    if (record.kind === 'music' && !record.manifest.cue) {
      for (const [sceneId, receiver] of Object.entries(RECEIVERS)) {
        if (!record.manifest.venue || record.manifest.venue === receiver.venue) scenes.add(sceneId);
      }
      if (record.manifest.venue === 'bada_bing') scenes.add('bada_bing_one');
      if (record.manifest.venue === 'silver_room') scenes.add('silver_room');
    }
    if (record.kind === 'sfx') {
      if (voiceCueNames.has(record.id) || /^vo\.radio\./.test(record.id)) {
        for (const scene of allReceiverScenes) scenes.add(scene);
      }
      if (/^news\.radio\./.test(record.id)) {
        scenes.clear();
        for (const scene of newsScenes) scenes.add(scene);
      }
      if (/^radio\.(click|tune|static|cut|talk|airhorn|riff|jingle|slots|kazoo|crowd|ident\.squatch|sting\.squatch|tape\.)/.test(record.id)) {
        for (const scene of allReceiverScenes) scenes.add(scene);
      }
    }
    if (legacyIdentity) scenes.clear();
    const generatedUse = record.kind === 'sfx' && voiceCueNames.has(record.id) ? 1 : 0;
    const uses = legacyIdentity ? 0 : Math.max(sourceUses, generatedUse, scenes.size ? 1 : 0);
    const orphan = uses === 0;
    const duplicateGroup = record.hash ? duplicates.get(record.hash) ?? [] : [];
    const license = record.kind === 'music'
      ? `${record.manifest.artist ? `Artist metadata: ${record.manifest.artist}. ` : ''}${record.manifest._note ?? ''}${record.manifest._note ? ' ' : ''}License/source field not recorded in manifest.`
      : `${record.manifest.voice ? `Voice: ${record.manifest.voice}. ` : ''}${record.manifest.prompt ? 'Generated SFX prompt recorded. ' : ''}License/source field not recorded in manifest.`;
    const measurement = loudnessByFile.get(record.relative);
    const loudnessCurrent = record.kind === 'music' && measurement && measurement.sha256 === record.hash;
    const contentReceipt = contentByCue.get(record.id);
    const spokenCue = record.kind === 'sfx' && typeof record.manifest.say === 'string'
      && record.manifest.say.trim().length > 0;
    const contentCurrent = spokenCue && contentReceipt
      && contentReceipt.sha256 === record.hash
      && contentReceipt.file === path.basename(record.relative)
      && contentReceipt.status === 'MATCH';
    let loudness = record.file
      ? 'Not a long-form master — excluded from the music-master loudness pass; active speech/effect mix receipt pending'
      : 'Cannot measure — file missing';
    if (record.kind === 'music') {
      if (loudnessCurrent) {
        loudness = `Measured: ${measurement.integratedLufs} LUFS integrated; ${measurement.truePeakEstimateDbtp} dBTP 4× estimate; ${measurement.samplePeakDbfs} dBFS sample peak`;
      } else if (measurement) {
        loudness = 'STALE — delivered file hash changed after the loudness receipt; remeasure';
      } else {
        loudness = 'UNMEASURED — run tools/audio-loudness-audit.mjs';
      }
    }
    let contentIdentity = 'NON-SPEECH — transcription is not applicable; inspect the authored prompt and active playback';
    if (!record.file) {
      contentIdentity = 'Cannot test — file missing';
    } else if (spokenCue && contentCurrent) {
      contentIdentity = `VERIFIED — hash-bound Scribe v2 transcript matches authored speech (${Number(contentReceipt.similarity).toFixed(4)})`;
    } else if (spokenCue && contentReceipt) {
      contentIdentity = contentReceipt.sha256 === record.hash
        ? `REVIEW — transcription similarity ${Number(contentReceipt.similarity).toFixed(4)}; ${contentReceipt.status}`
        : 'STALE — delivered speech hash changed after transcription';
    } else if (spokenCue) {
      contentIdentity = 'UNVERIFIED — spoken cue has no transcription receipt';
    } else if (record.kind === 'music') {
      contentIdentity = 'OWNER LISTEN — long-form music identity is not inferred from its filename or speech transcription';
    }
    let action = loudnessCurrent
      ? 'Keep; loudness is hash-bound. Verify audible content, dialogue masking, and lifecycle in the active scene.'
      : 'Keep; verify audible content and loudness in the active scene.';
    if (!record.file) action = 'Mechanical: restore the referenced asset or remove the dead manifest/reference row.';
    else if (orphan && legacyIdentity) {
      action = 'Mechanical: confirm the cue is dead, then remove manifest/file together only after OWNER decides the legacy station identity.';
    } else if (orphan) {
      action = 'Mechanical: confirm the cue is dead, then remove the manifest row and file together; do not hide drift by renaming it.';
    }
    else if (record.kind === 'music' && !record.manifest._note) action = 'OWNER: record provenance/license; keep the selected track unchanged meanwhile.';
    rows.push({
      'Cue ID': record.id, File: record.relative,
      Format: record.file ? path.extname(record.file).slice(1).toUpperCase() : path.extname(record.relative).slice(1).toUpperCase(),
      Duration: Number.isFinite(record.duration) ? record.duration : 'Unknown',
      'Source or license note': license.trim(),
      'Loop flag': record.manifest.loop === true ? 'Yes' : record.kind === 'music' && !record.manifest.cue ? 'Runtime-dependent' : 'No',
      'Number of uses': uses,
      'Scenes using it': scenes.size ? [...scenes].sort().join('; ') : 'None found',
      'Orphan status': record.file ? (orphan ? 'YES — no source/runtime use found' : 'No') : 'BROKEN — file missing',
      'Duplicate status': duplicateGroup.length > 1
        ? `IDENTICAL BY SHA-256: ${duplicateGroup.filter((item) => item !== record).map((item) => item.id).join('; ')}` : 'No byte-identical audit duplicate',
      'Filename-content mismatch': contentIdentity,
      'Loudness issue': loudness,
      'Playback issue': !record.file ? 'Referenced asset is missing' : orphan ? 'No reachable runtime use found' : 'No source-level issue; active-play receipt pending',
      'Recommended action': action,
    });
  }
  rows.sort((a, b) => String(a['Cue ID']).localeCompare(String(b['Cue ID'])));
  return { rows, durations: new Map(records.filter((record) => record.kind === 'music')
    .map((record) => [`music:${record.manifest.file}`, record.duration])), records };
}

function buildProblems({
  source, voiceCueCount, cueRows, musicTracks, timelineRows, lifecycleCoverage,
}) {
  const orphanCount = cueRows.filter((row) => String(row['Orphan status']).startsWith('YES')).length;
  const missingCount = cueRows.filter((row) => String(row['Orphan status']).startsWith('BROKEN')).length;
  const licenseGap = musicTracks.filter((track) => !track.license && !track.source && !track._license).length;
  const silentBeats = timelineRows.filter((row) => row['Radio or music source'] === 'No authored radio or music source found').length;
  const exactless = [...new Set(Object.values(RECEIVERS).map((receiver) => receiver.venue))]
    .filter((venue) => !musicTracks.some((track) => !track.cue && track.venue === venue));
  const measuredMasters = cueRows.filter((row) => /^(music|track):/.test(row['Cue ID'])
    && String(row['Loudness issue']).startsWith('Measured:')).length;
  const verifiedSpoken = cueRows.filter((row) => String(row['Filename-content mismatch']).startsWith('VERIFIED —')).length;
  const unverifiedSpoken = cueRows.filter((row) => /^(UNVERIFIED|STALE|REVIEW) —/.test(String(row['Filename-content mismatch']))).length;
  const legacyIdentityCues = new Set([
    'radio.ident.ksqch', 'radio.ident.uncle', 'radio.sting.ksqch', 'radio.sting.uncle',
  ]);
  const orphanCueIds = cueRows
    .filter((row) => String(row['Orphan status']).startsWith('YES'))
    .map((row) => row['Cue ID']);
  const onlyOwnerLegacyOrphans = orphanCueIds.length > 0
    && orphanCueIds.every((cueId) => legacyIdentityCues.has(cueId));
  const rows = [
    {
      Severity: 'P1', Scene: 'Global', 'Station or cue': 'Station architecture',
      Problem: 'Runtime and source documentation now agree that 97.8 THE SQUATCH is the one live station; `uncle` and `ksqch` remain unresolved legacy identities only.',
      Evidence: lineReference('src/core/stations.js', source.stations, 'One station: 97.8 THE SQUATCH.'),
      'Player impact': 'Resolved for current development: agents no longer mistake legacy tags for selectable dials.',
      'Proposed fix': 'Documentation is corrected. Do not revive or delete legacy identities until the owner decides their future.',
      'Mechanical or creative': 'Mechanical', 'Owner decision needed': 'OWNER: retire or restore `uncle` and `ksqch` identities.', Status: 'DOCUMENTED — OWNER DECISION OPEN',
    },
    {
      Severity: 'P1', Scene: 'Global', 'Station or cue': 'assets/music/manifest.json `station`',
      Problem: 'The manifest now labels `station` as ignored legacy catalog metadata; current Radio.playlist intentionally filters only `cue` plus exact `venue`.',
      Evidence: `${lineReference('assets/music/manifest.json', source.musicManifest, 'Historical `station` values')} and ${lineReference('src/core/radio.js', source.radio, 'return this.tracks.filter')}`,
      'Player impact': 'Current behavior is documented: legacy-tagged unscoped records can air on 97.8 in every physical receiver.',
      'Proposed fix': 'After OWNER decides station/venue allocation, update metadata and runtime together with a contract test.',
      'Mechanical or creative': 'Mechanical', 'Owner decision needed': 'OWNER: desired station/venue allocation for existing tracks.', Status: 'DOCUMENTED — OWNER DECISION OPEN',
    },
    {
      Severity: 'P1', Scene: 'Luxury Apartment; Mansion; Mansion Return', 'Station or cue': 'Physical 97.8 receivers',
      Problem: 'Luxury Apartment and both Mansion visits previously reset their physical 97.8 receivers instead of using the shared campaign adapter.',
      Evidence: `${lineReference('src/luxury-apartment/main.js', source.luxury, "receiverId: 'luxury_apartment'")}; ${lineReference('src/mansion/main.js', source.mansion, "receiverId: 'mansion_house'")}; focused residency and real-browser reload receipts.`,
      'Player impact': 'Resolved: saved power, volume, cursor, and selection now survive reload without autoplay before the player gesture or duplicate Mansion talk beds.',
      'Proposed fix': 'Implemented: unique Luxury ownership and one shared physical Mansion house tuner, both default-off and restored after audio unlock.',
      'Mechanical or creative': 'Mechanical', 'Owner decision needed': 'No; used the established shared receiver behavior.', Status: 'RESOLVED',
    },
    {
      Severity: 'P1', Scene: 'Global', 'Station or cue': 'Radio + venue/mission scores',
      Problem: `The generated Scene Timeline binds all ${lifecycleCoverage.covered}/${lifecycleCoverage.total} unique radio, venue-music, mission-score, and authored-silence owners to exact named active-play receipts.`,
      Evidence: 'tools/radio-active-play-coverage.mjs plus tests/radio-active-play-coverage.test.mjs; the contract rejects missing owners, stale mappings, and renamed verifier receipts.',
      'Player impact': 'Mechanical ownership drift can no longer hide as a complete inventory row; each live owner has a reviewable start/stop/restore/teardown or deliberate-silence receipt.',
      'Proposed fix': lifecycleCoverage.complete
        ? 'Keep the source-driven contract green and rerun the named browser verifiers after lifecycle edits.'
        : `Mechanical: map missing owners and remove stale mappings (${lifecycleCoverage.missing.length} missing; ${lifecycleCoverage.stale.length} stale).`,
      'Mechanical or creative': 'Mechanical', 'Owner decision needed': 'No for lifecycle coverage; OWNER only for a desired creative overlap.',
      Status: lifecycleCoverage.complete
        ? 'SOURCE + MAPPING CONTRACT GREEN — RERUN SCENES AFTER FUTURE LIFECYCLE EDITS'
        : 'OPEN — LIFECYCLE COVERAGE DRIFT',
    },
    {
      Severity: 'P1', Scene: 'Global', 'Station or cue': 'All long-form music',
      Problem: `All ${musicTracks.length} music tracks lack a structured license/source field; ${licenseGap} rely on title/artist/notes only.`,
      Evidence: 'assets/music/manifest.json contains file/title/artist/venue/cue notes but no consistent license or provenance schema.',
      'Player impact': 'Distribution provenance cannot be proven from the repository.',
      'Proposed fix': 'OWNER: supply source/license facts. Mechanical: add structured fields and a manifest check without changing tracks.',
      'Mechanical or creative': 'Creative', 'Owner decision needed': 'OWNER: provenance/license for every retained track.', Status: 'OWNER',
    },
    {
      Severity: 'P1', Scene: 'Global', 'Station or cue': 'Mix / loudness',
      Problem: `${measuredMasters}/${musicTracks.length} long-form masters now have hash-bound integrated-LUFS, sample-peak, and 4× intersample peak evidence; configured gains still need active-scene mix review.`,
      Evidence: 'docs/audits/radio/loudness-measurements.json plus the generated Cue Inventory; the meter makes no production gain changes.',
      'Player impact': 'Tracks at the same configured gain can have very different perceived loudness and mask dialogue.',
      'Proposed fix': 'Mechanical measurement and named active-play ownership coverage are complete. OWNER listens in context and approves any gain or asset normalization changes.',
      'Mechanical or creative': 'Mechanical', 'Owner decision needed': 'OWNER for audible mix changes after measurements.',
      Status: measuredMasters === musicTracks.length
        ? 'MEASURED — OWNER AUDIBLE MIX REVIEW'
        : 'OPEN — MEASUREMENT DRIFT',
    },
    {
      Severity: 'P2', Scene: 'Multiple receivers', 'Station or cue': 'Venue filtering',
      Problem: `No exact non-cue track is tagged for ${exactless.join(', ')}; those venues inherit every unscoped radio record.`,
      Evidence: `${lineReference('src/core/radio.js', source.radio, '(!track.venue || track.venue === this.venue)')} plus manifest venue inventory.`,
      'Player impact': 'Different locations can sound identical even when their venue names imply separate programming.',
      'Proposed fix': 'OWNER: declare whether shared unscoped rotation is intentional. Mechanical changes only after that ruling.',
      'Mechanical or creative': 'Creative', 'Owner decision needed': 'OWNER: venue availability for existing tracks.', Status: 'OWNER',
    },
    {
      Severity: 'P2', Scene: 'Apartment; Cabin vs other receivers', 'Station or cue': 'Mission news',
      Problem: 'Mission-aware NEWS_SEGMENTS are enabled on the apartment and cabin receivers only; other receivers run the same station without news eligibility.',
      Evidence: `${lineReference('src/main.js', source.apartment, 'news: () => newsSegmentsFor(campaign.state)')}; ${lineReference('src/cabin/main.js', source.cabin, 'news: () => newsSegmentsFor(campaign.state)')}`,
      'Player impact': 'A player can hear the same station in another location but not the campaign bulletin that is eligible at home.',
      'Proposed fix': 'OWNER: decide which physical receivers carry mission news; then wire the same shared callback where intended.',
      'Mechanical or creative': 'Creative', 'Owner decision needed': 'OWNER: news coverage by venue.', Status: 'OWNER',
    },
    {
      Severity: 'P2', Scene: 'Global', 'Station or cue': 'Station shows vs mission news',
      Problem: 'Show selection remains hour-only. Mission news is event-gated, but the named hosts do not gain day/chapter-specific exchange pools.',
      Evidence: `${lineReference('src/core/radio.js', source.radio, 'const show = showAt(st, this.time ? this.time.hour : 9)')} and NEWS_SEGMENTS in src/core/stations.js.`,
      'Player impact': 'The station reacts through news bulletins, while ordinary host banter eventually repeats independent of campaign day.',
      'Proposed fix': 'OWNER: approve any host-program rewrite first. Reuse the current deterministic selection and bulletin state rather than adding another radio framework.',
      'Mechanical or creative': 'Creative', 'Owner decision needed': 'OWNER: whether host programming should become chapter-aware.', Status: 'OWNER',
    },
    {
      Severity: 'P2', Scene: 'Global', 'Station or cue': 'Cue inventory',
      Problem: `${orphanCount} radio/music assets have no reachable source/runtime use; ${missingCount} referenced audit assets are missing.`,
      Evidence: 'Generated Cue Inventory combines manifests, generated voice cue names, source references, receiver eligibility, and byte hashes.',
      'Player impact': 'Dead rows increase recording and QA noise; missing assets can produce silent fallback paths.',
      'Proposed fix': 'Mechanical: review each generated row. Remove manifest and file together only after confirming no dynamic use; preserve legacy station assets pending OWNER decision.',
      'Mechanical or creative': 'Mechanical', 'Owner decision needed': 'OWNER only for legacy station identity cues.',
      Status: missingCount
        ? 'OPEN — MISSING FILES'
        : onlyOwnerLegacyOrphans
          ? 'OWNER — LEGACY IDENTITY CUES'
          : 'OPEN — NON-OWNER ORPHANS',
    },
    {
      Severity: 'P2', Scene: 'Global', 'Station or cue': 'Filename/content and source-only audit limit',
      Problem: `${verifiedSpoken} spoken station/news cues have current hash-bound Scribe v2 receipts; ${unverifiedSpoken} spoken cues remain stale, missing, or below the review threshold. Long-form music still requires owner listening/provenance.`,
      Evidence: 'docs/audits/radio/content-transcriptions.json binds cue, current authored text hash, voice, delivered MP3 hash, transcript, language, and similarity.',
      'Player impact': 'A correctly named but stale/wrong spoken take now fails the content gate; music identity is still explicitly not inferred from filenames.',
      'Proposed fix': 'Mechanical spoken-content verification is implemented. OWNER supplies provenance and reviews retained music identity; rerender any future speech review row.',
      'Mechanical or creative': 'Mechanical', 'Owner decision needed': 'OWNER only for long-form music provenance/identity or a genuine creative speech mismatch.',
      Status: unverifiedSpoken ? 'OPEN — SPOKEN CONTENT REVIEW' : 'RESOLVED FOR SPOKEN CUES — MUSIC OWNER REVIEW',
    },
    {
      Severity: 'P3', Scene: 'Campaign-wide', 'Station or cue': 'Intentional silence',
      Problem: `${silentBeats} campaign beat rows have no authored station or long-form music source.`,
      Evidence: 'Generated Scene Timeline covers every CAMPAIGN_SPINE beat and emits an explicit silent row when no source is found.',
      'Player impact': 'Not inherently a defect; the audit now makes silence reviewable instead of invisible.',
      'Proposed fix': 'Keep silent. OWNER may issue a specific music brief; do not fill gaps automatically.',
      'Mechanical or creative': 'Creative', 'Owner decision needed': 'OWNER only if a silent beat should gain music.', Status: 'DOCUMENTED',
    },
    {
      Severity: 'P3', Scene: 'Global', 'Station or cue': 'Previous radio audit',
      Problem: `The 2026-08-05 prose audit reports 222 cues; current voiceCues() reports ${voiceCueCount} and includes mission-aware news.`,
      Evidence: `${lineReference('docs/audits/2026-08-05/radio-audit.md', source.oldAudit, '222')} vs live src/core/stations.js.`,
      'Player impact': 'Agents using the old report can repeat completed redesign work or quote stale counts.',
      'Proposed fix': 'Mechanical: treat this generated workbook/CSVs as the current audit and keep the older report as dated history.',
      'Mechanical or creative': 'Mechanical', 'Owner decision needed': 'No', Status: 'RESOLVED BY THIS AUDIT',
    },
  ];
  if (missingCount) rows.unshift({
    Severity: 'P0', Scene: 'Global', 'Station or cue': 'Missing assets',
    Problem: `${missingCount} inventory rows reference an asset that is not on disk.`,
    Evidence: 'Cue Inventory rows marked BROKEN.',
    'Player impact': 'Reachable playback can be silent or fall back unexpectedly.',
    'Proposed fix': 'Mechanical: restore each file or remove the dead reference after proving it is unreachable.',
    'Mechanical or creative': 'Mechanical', 'Owner decision needed': 'OWNER only if replacement creative is required.', Status: 'OPEN',
  });
  return rows;
}

function buildRevampPlan({
  measuredMasters, musicMasters, verifiedSpokenCues, spokenCueTotal, lifecycleCoverage,
}) {
  return [
    { Order: 1, 'Work item': 'Generate the source-driven radio/music audit and five review sheets', Files: 'tools/radio-audit.mjs; docs/audits/radio/*.csv; docs/audits/SQUATCHSMASH-RADIO-AUDIT.xlsx; docs/audits/SQUATCHSMASH-RADIO-REVAMP.md', Dependency: 'Current manifests, station data, scene contracts, campaign spine', Risk: 'Low', 'Acceptance check': 'Generator --check passes; all five sheets render; every campaign beat is represented', Status: 'DONE', Commit: 'd6f2ae0e; b2e63abb' },
    { Order: 2, 'Work item': 'Reconcile station documentation and manifest semantics while preserving unresolved legacy identities', Files: 'src/core/stations.js; assets/music/manifest.json; src/core/radio.js; tests/radio-*.test.mjs', Dependency: 'OWNER rules on legacy uncle/ksqch identities for any runtime change', Risk: 'Medium', 'Acceptance check': 'Docs, manifest, runtime selection, and tests describe the same current station model without guessing the legacy identities future', Status: 'DOCUMENTATION DONE — IDENTITY DECISION OWNER', Commit: 'b2e63abb' },
    { Order: 3, 'Work item': 'Make receiver persistence consistent', Files: 'src/luxury-apartment/main.js; src/mansion/main.js; src/core/campaign.js', Dependency: 'Existing createCampaignRadioAdapter', Risk: 'Low', 'Acceptance check': 'Power, volume, cursor, and selection survive reload without cross-receiver collisions', Status: 'DONE', Commit: '4d7d01ef' },
    { Order: 4, 'Work item': 'Add stop, restore, overlap, and teardown browser receipts', Files: 'tools/radio-active-play-coverage.mjs; existing Playwright scene verifiers; audio residency tests', Dependency: 'Stable receiver IDs and current music ownership', Risk: 'Medium', 'Acceptance check': 'Every unique non-silent timeline owner maps to an exact named active-play receipt; contract rejects missing/stale mappings and renamed checks', Status: lifecycleCoverage.complete ? `DONE — ${lifecycleCoverage.covered}/${lifecycleCoverage.total} OWNERS MAPPED; SOURCE RECEIPTS GREEN` : `OPEN — ${lifecycleCoverage.covered}/${lifecycleCoverage.total} OWNERS MAPPED`, Commit: '' },
    { Order: 5, 'Work item': 'Add repeatable duration, integrated-loudness, true-peak, and identity evidence', Files: 'tools/audio-loudness-audit.mjs; tools/verify-radio-content.ps1; docs/audits/radio/loudness-measurements.json; docs/audits/radio/content-transcriptions.json; tools/radio-audit.mjs; generated Cue Inventory', Dependency: 'Existing Playwright Chromium decoder and ElevenLabs Scribe v2 for spoken identity', Risk: 'Medium', 'Acceptance check': 'Every retained master has measured duration/LUFS/peak; every spoken cue has a current transcript; music identity remains an explicit owner review', Status: measuredMasters === musicMasters && verifiedSpokenCues === spokenCueTotal ? 'LOUDNESS + SPOKEN IDENTITY DONE — MUSIC OWNER REVIEW' : 'PARTIAL — EVIDENCE DRIFT', Commit: '14cc6c94; b2e63abb' },
    { Order: 6, 'Work item': 'Resolve OWNER programming decisions', Files: 'Problems and Decisions sheet', Dependency: 'Owner chooses legacy stations, venue allocation, news coverage, provenance, and any host rewrite', Risk: 'High if guessed', 'Acceptance check': 'Every OWNER row has an explicit answer; no track is silently replaced or deleted', Status: 'WAITING ON OWNER', Commit: '' },
    { Order: 7, 'Work item': 'Implement approved mechanical trigger, stop, restore, and selection fixes', Files: 'src/core/radio.js; scene-owned score modules; manifests; relevant tests', Dependency: 'Orders 2–6', Risk: 'Medium', 'Acceptance check': 'Source contracts and real-browser receipts pass; owner-selected material remains intact', Status: lifecycleCoverage.complete ? 'MECHANICAL LIFECYCLE SOURCE DONE — PROGRAMMING CHANGES WAIT ON OWNER' : 'OPEN — LIFECYCLE COVERAGE DRIFT', Commit: '' },
    { Order: 8, 'Work item': 'Run campaign-wide active-play music/dialogue mix QA', Files: 'All Scene Timeline rows; Playwright traces and scene evidence', Dependency: 'Mechanical fixes and loudness measurements', Risk: 'Medium', 'Acceptance check': 'Dialogue remains intelligible; intentional silence lands; no stale loop crosses a scene handoff', Status: lifecycleCoverage.complete ? 'MECHANICAL COVERAGE DONE — OWNER LISTENING OPEN' : 'OPEN — MECHANICAL COVERAGE', Commit: '' },
    { Order: 9, 'Work item': 'Regenerate ledgers and certify the final radio revamp', Files: 'Generated dialogue/audio/take ledgers; check:radio-vo; scene tests; campaign marathon if handoffs change', Dependency: 'Any authored line or route changes', Risk: 'Low', 'Acceptance check': 'All applicable cue, take, audio, radio, scene, and campaign gates actually run and pass', Status: lifecycleCoverage.complete ? 'RELEASE-CANDIDATE LEDGERS + MAPPED RECEIPTS GREEN — FINAL HOSTED RECEIPT EXTERNAL' : 'BLOCKED — LIFECYCLE COVERAGE DRIFT', Commit: '' },
  ];
}

function markdownTable(columns, rows) {
  const escape = (value) => normaliseText(value).replace(/\|/g, '\\|');
  return [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => escape(row[column])).join(' | ')} |`),
  ].join('\n');
}

function buildRevampMarkdown(data) {
  const ownerRows = data.rows['Problems and Decisions'].filter((row) => row['Owner decision needed'].startsWith('OWNER'));
  const mechanicalRows = data.rows['Problems and Decisions'].filter((row) => row['Mechanical or creative'] === 'Mechanical');
  const station = data.rows['Station Catalog'].find((row) => row['Station ID'] === 'squatch');
  return `<!-- Generated by tools/radio-audit.mjs. Do not hand-edit generated counts. -->
# SquatchSmash radio revamp

This is the implementation plan paired with [SQUATCHSMASH-RADIO-AUDIT.xlsx](./SQUATCHSMASH-RADIO-AUDIT.xlsx). The generator reads the live campaign spine, scene contracts, station definitions, music and SFX manifests, generated radio voice cues, and source references. It does not substitute songs or infer creative intent.

## Current snapshot

- Campaign beats represented: **${data.summary.beatsCovered} / ${data.summary.beatsTotal}**.
- Scene Timeline rows: **${data.rows['Scene Timeline'].length}**.
- Live stations: **${data.summary.liveStations}**; legacy manifest station identities: **2**.
- Current generated station/news voice cues: **${data.summary.voiceCues}**.
- Cue Inventory rows: **${data.rows['Cue Inventory'].length}**.
- Radio/music rows with no reachable source/runtime use: **${data.summary.orphans}**.
- Referenced audit assets missing on disk: **${data.summary.missingAssets}**.
- Long-form masters with current hash-bound loudness evidence: **${data.summary.measuredMasters} / ${data.summary.musicMasters}**.
- Spoken station/news cues with current hash-bound Scribe receipts: **${data.summary.verifiedSpokenCues} / ${data.summary.spokenCueTotal}**.
- Unique live radio/music owners mapped to named active-play receipts: **${data.summary.lifecycleCovered} / ${data.summary.lifecycleOwners}**.
- Live 97.8 programming pool: **${station?.['Track count'] ?? 0}** non-cue tracks before venue filtering.

## What is actually built

There is one live station, **97.8 THE SQUATCH**. Its running order is deterministic: talk, links, records, commercials, tape, meeting notice, and mission-aware news. The show changes by in-game hour; finite lists wrap after complete coverage. Physical receivers choose records with exact venue filtering plus every unscoped non-cue track.

The manifest still carries 'uncle' and 'ksqch' station tags and matching ident/sting assets. They are not selectable stations in the current runtime. That is an evidence-backed mismatch, not permission to revive or delete them.

Long-form scene music remains owned by the scene-specific systems already in place: the Bing DJ and room radios, Motel drive score, THE TAKE prep and escape score, Front & Center supper-club/performance score, Beef Run signature cue, and Enola takeoff/approach/silence/escape sequence.

## Mechanical findings

${markdownTable(['Severity', 'Scene', 'Station or cue', 'Problem', 'Proposed fix', 'Status'], mechanicalRows)}

## OWNER decisions

No creative decision below is implemented by the generator.

${markdownTable(['Severity', 'Scene', 'Station or cue', 'Problem', 'Owner decision needed', 'Status'], ownerRows)}

## Ordered revamp plan

${markdownTable(SHEETS['Revamp Plan'], data.rows['Revamp Plan'])}

## Generated data

- [Scene Timeline CSV](./radio/scene-timeline.csv)
- [Station Catalog CSV](./radio/station-catalog.csv)
- [Cue Inventory CSV](./radio/cue-inventory.csv)
- [Hash-bound loudness measurements](./radio/loudness-measurements.json)
- [Hash-bound spoken-content transcriptions](./radio/content-transcriptions.json)
- [Problems and Decisions CSV](./radio/problems-and-decisions.csv)
- [Revamp Plan CSV](./radio/revamp-plan.csv)

## Verification boundary

This audit proves source/manifests/route coverage, binds each unique live owner to an exact named active-play verifier receipt, measures MP3 duration, carries hash-bound integrated loudness/sample-peak/4× intersample-peak evidence for every long-form master, and verifies every spoken station/news take against its current authored text with Scribe v2. The release-candidate source mapping, cue/take/audio/radio ledgers, and mapped receipt assertions are green; the final hosted workflow receipt is external because a generated workbook cannot self-reference the commit that contains it. Cue Inventory's \`active-play receipt pending\` language deliberately means per-cue owner listening and mix approval, not missing lifecycle ownership. After a future lifecycle source change, rerun the named browser verifier before updating the receipt. This audit does **not** claim a song's identity from its filename, claim every campaign-wide overlap has been mixed by ear, or claim that measured loudness has been normalized. Those remaining boundaries stay explicit in the workbook.

Regenerate deterministic text artifacts with:

\`\`\`powershell
node tools/radio-audit.mjs
node tools/radio-audit.mjs --check
node tools/audio-loudness-audit.mjs --check
pwsh -NoProfile -File tools/verify-radio-content.ps1 -Check
npm run check:radio-vo
\`\`\`

The same generator authors the workbook when the Codex workspace dependency runtime supplies \`@oai/artifact-tool\`. Pass the loader-provided module URL explicitly; the game does not gain an npm or deployment dependency:

\`\`\`powershell
node tools/radio-audit.mjs --xlsx-output <output.xlsx> --artifact-tool-url <file:///loader/@oai/artifact-tool/dist/artifact_tool.mjs> --preview-dir <rendered-sheets> --qa-output <workbook-qa.json>
\`\`\`

When authored radio dialogue changes, regenerate the normal dialogue, voice, take, and audio ledgers as well. When a trigger, stop, restore, or scene handoff changes, start the actual scene, use the real interaction path, inspect console/page errors, retain Playwright evidence, and run the relevant scene verifier. A route or exit change still requires the campaign marathon.
`;
}

export async function buildAuditData({ repoRoot = DEFAULT_ROOT } = {}) {
  repoRoot = path.resolve(repoRoot);
  const importModule = async (relative) => import(pathToFileURL(path.join(repoRoot, relative)).href);
  const [{ CAMPAIGN_SPINE }, { SCENE_CONTRACTS }, stationsModule] = await Promise.all([
    importModule('src/core/campaign-spine.js'),
    importModule('src/core/scene-contracts.js'),
    importModule('src/core/stations.js'),
  ]);
  const [musicManifest, sfxManifest] = await Promise.all([
    readJson(path.join(repoRoot, 'assets/music/manifest.json')),
    readJson(path.join(repoRoot, 'assets/sfx/manifest.json')),
  ]);
  const loudnessEvidence = await readOptionalJson(
    path.join(repoRoot, 'docs/audits/radio/loudness-measurements.json'),
    { measurements: [] },
  );
  const contentEvidence = await readOptionalJson(
    path.join(repoRoot, 'docs/audits/radio/content-transcriptions.json'),
    { receipts: [] },
  );
  const sourceFilesAbsolute = await walkFiles(path.join(repoRoot, 'src'), (file) => file.endsWith('.js'));
  const sourceTexts = await Promise.all(sourceFilesAbsolute.map((file) => fs.readFile(file, 'utf8')));
  const sourceFiles = sourceFilesAbsolute.map((file) => path.relative(repoRoot, file).replace(/\\/g, '/'));
  const voiceCues = stationsModule.voiceCues();
  const voiceCueNames = new Set(voiceCues.map((cue) => cue.name));
  const source = {};
  for (const [key, relative] of Object.entries({
    stations: 'src/core/stations.js', radio: 'src/core/radio.js',
    musicManifest: 'assets/music/manifest.json', luxury: 'src/luxury-apartment/main.js',
    mansion: 'src/mansion/main.js', apartment: 'src/main.js', cabin: 'src/cabin/main.js',
    oldAudit: 'docs/audits/2026-08-05/radio-audit.md', campaign: 'src/core/campaign.js',
  })) source[key] = await fs.readFile(path.join(repoRoot, relative), 'utf8');

  const beatClock = buildBeatClock(source.campaign);
  const timeline = buildSceneTimeline({
    spine: CAMPAIGN_SPINE, contracts: SCENE_CONTRACTS, musicTracks: musicManifest.tracks,
    beatClock,
  });
  const lifecycleCoverage = summarizeRadioActivePlayCoverage(timeline);
  if (!lifecycleCoverage.complete) {
    throw new Error([
      `Radio active-play coverage drift: ${lifecycleCoverage.covered}/${lifecycleCoverage.total} owners mapped.`,
      ...lifecycleCoverage.missing.map((key) => `Missing: ${key}`),
      ...lifecycleCoverage.stale.map((key) => `Stale: ${key}`),
    ].join('\n'));
  }
  applyRadioActivePlayCoverage(timeline);
  const cueInventory = await buildCueInventory({ repoRoot, musicTracks: musicManifest.tracks,
    sfxManifest, voiceCueNames, contracts: SCENE_CONTRACTS, sourceFiles, sourceTexts,
    loudnessEvidence, contentEvidence });
  const sfxByName = new Map(sfxManifest.sfx.map((cue) => [cue.name, cue]));
  const stationCatalog = buildStationCatalog({ stations: stationsModule.STATIONS,
    musicTracks: musicManifest.tracks, durations: cueInventory.durations, sfxByName });
  const problems = buildProblems({ source, voiceCueCount: voiceCues.length,
    cueRows: cueInventory.rows, musicTracks: musicManifest.tracks, timelineRows: timeline,
    lifecycleCoverage });
  const measuredMasters = cueInventory.rows.filter((row) => /^(music|track):/.test(row['Cue ID'])
    && String(row['Loudness issue']).startsWith('Measured:')).length;
  const verifiedSpokenCues = cueInventory.rows.filter((row) => String(row['Filename-content mismatch']).startsWith('VERIFIED —')).length;
  const spokenCueTotal = cueInventory.rows.filter((row) => /^(VERIFIED|UNVERIFIED|STALE|REVIEW) —/.test(String(row['Filename-content mismatch']))).length;
  const revamp = buildRevampPlan({ measuredMasters, musicMasters: musicManifest.tracks.length,
    verifiedSpokenCues, spokenCueTotal, lifecycleCoverage });
  const rows = {
    'Scene Timeline': timeline,
    'Station Catalog': stationCatalog,
    'Cue Inventory': cueInventory.rows,
    'Problems and Decisions': problems,
    'Revamp Plan': revamp,
  };
  for (const [name, columns] of Object.entries(SHEETS)) {
    if (!rows[name]?.length) throw new Error(`${name} has no rows`);
    for (const row of rows[name]) {
      const extras = Object.keys(row).filter((key) => !columns.includes(key));
      if (extras.length) throw new Error(`${name} row has unexpected columns: ${extras.join(', ')}`);
    }
  }
  const beatIdsCovered = new Set(timeline.map((row) => row.Beat.split(' · ')[0]));
  const sceneIdsCovered = new Set(timeline.map((row) => row['Scene ID']));
  const expectedScenes = new Set(CAMPAIGN_SPINE.map((beat) => beat.scene));
  const missingScenes = [...expectedScenes].filter((scene) => !sceneIdsCovered.has(scene));
  if (missingScenes.length) throw new Error(`Scene Timeline misses campaign scenes: ${missingScenes.join(', ')}`);
  if (beatIdsCovered.size !== CAMPAIGN_SPINE.length) {
    throw new Error(`Scene Timeline covers ${beatIdsCovered.size}/${CAMPAIGN_SPINE.length} beats`);
  }
  const summary = {
    beatsTotal: CAMPAIGN_SPINE.length, beatsCovered: beatIdsCovered.size,
    scenesCovered: sceneIdsCovered.size, liveStations: stationsModule.STATIONS.length,
    voiceCues: voiceCues.length,
    measuredMasters, musicMasters: musicManifest.tracks.length,
    verifiedSpokenCues, spokenCueTotal,
    lifecycleOwners: lifecycleCoverage.total,
    lifecycleCovered: lifecycleCoverage.covered,
    orphans: cueInventory.rows.filter((row) => String(row['Orphan status']).startsWith('YES')).length,
    missingAssets: cueInventory.rows.filter((row) => String(row['Orphan status']).startsWith('BROKEN')).length,
  };
  const data = { rows, summary, repoRoot };
  data.revampMarkdown = buildRevampMarkdown(data);
  return data;
}

export async function writeAuditFiles(data, { check = false } = {}) {
  const auditDir = path.join(data.repoRoot, 'docs/audits');
  const csvDir = path.join(auditDir, 'radio');
  const files = new Map();
  for (const [name, columns] of Object.entries(SHEETS)) {
    files.set(path.join(csvDir, `${slugSheet(name)}.csv`), toCsv(columns, data.rows[name]));
  }
  files.set(path.join(auditDir, 'SQUATCHSMASH-RADIO-REVAMP.md'), data.revampMarkdown);
  if (check) {
    const drift = [];
    for (const [file, expected] of files) {
      let actual = null;
      try { actual = await fs.readFile(file, 'utf8'); } catch { /* reported below */ }
      if (actual !== expected) drift.push(path.relative(data.repoRoot, file));
    }
    if (drift.length) throw new Error(`Radio audit drift: ${drift.join(', ')}. Run node tools/radio-audit.mjs`);
    return [...files.keys()];
  }
  await fs.mkdir(csvDir, { recursive: true });
  await Promise.all([...files].map(([file, text]) => fs.writeFile(file, text, 'utf8')));
  return [...files.keys()];
}

function columnName(index) {
  let value = index + 1;
  let result = '';
  while (value) {
    value--;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function columnWidth(header) {
  if (/^(Order|Beat|Severity|Priority|Status|Format|Duration|Loop flag|Track count)$/.test(header)) return 11;
  if (/^(Campaign day|Campaign time|Scene ID|Station ID|Volume|Current status|Implementation status)$/.test(header)) return 16;
  if (/^(Scene filename|Cue ID|Asset path|File|Station|Location or venue)$/.test(header)) return 24;
  if (/^(Problem|Evidence|Player impact|Proposed fix|Recommended action|Recommended changes|Notes|Proposed change|Source or license note)$/.test(header)) return 36;
  return 22;
}

export async function writeWorkbook(data, { outputFile, artifactToolUrl, previewDir, qaOutput } = {}) {
  if (!outputFile) throw new Error('--xlsx-output is required for workbook authoring');
  if (!artifactToolUrl) throw new Error('--artifact-tool-url is required; use the exact loader-provided @oai/artifact-tool module URL');
  if (!previewDir) throw new Error('--preview-dir is required so every sheet can be rendered and inspected');
  const { SpreadsheetFile, Workbook } = await import(artifactToolUrl);
  const workbook = Workbook.create();
  const qa = { sheets: [], formulaErrors: [] };
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.mkdir(previewDir, { recursive: true });
  for (const [name, columns] of Object.entries(SHEETS)) {
    const rows = data.rows[name];
    const sheet = workbook.worksheets.add(name);
    sheet.showGridLines = false;
    const lastColumn = columnName(columns.length - 1);
    const headerRow = 5;
    const firstDataRow = 6;
    const lastRow = firstDataRow + rows.length - 1;
    sheet.mergeCells(`A1:${lastColumn}1`);
    sheet.getRange('A1').values = [[`SQUATCHSMASH RADIO AUDIT · ${name}`]];
    sheet.getRange(`A1:${lastColumn}1`).format = {
      fill: '#183C2E', font: { bold: true, color: '#FFFFFF', size: 16 },
      verticalAlignment: 'center', horizontalAlignment: 'left',
    };
    sheet.getRange(`A1:${lastColumn}1`).format.rowHeight = 30;
    sheet.mergeCells(`A2:${lastColumn}2`);
    sheet.getRange('A2').values = [['Generated from live campaign, station, manifest, and source data. OWNER marks a decision; no selected track is substituted by this audit.']];
    sheet.getRange(`A2:${lastColumn}2`).format = {
      fill: '#E8F0EC', font: { italic: true, color: '#33443B', size: 10 }, wrapText: true,
      verticalAlignment: 'center',
    };
    sheet.getRange(`A2:${lastColumn}2`).format.rowHeight = 34;
    sheet.mergeCells(`A3:${lastColumn}3`);
    sheet.getRange('A3').values = [[`${rows.length} data rows · Generated by tools/radio-audit.mjs · Active-play mix, music identity, provenance, and owner decisions remain explicitly marked.`]];
    sheet.getRange(`A3:${lastColumn}3`).format = { font: { color: '#52645B', size: 9 }, wrapText: true };
    sheet.getRange(`A${headerRow}:${lastColumn}${headerRow}`).values = [columns];
    sheet.getRange(`A${headerRow}:${lastColumn}${headerRow}`).format = {
      fill: '#2F6B4F', font: { bold: true, color: '#FFFFFF', size: 9 },
      wrapText: true, verticalAlignment: 'center', horizontalAlignment: 'left',
      borders: { preset: 'all', style: 'thin', color: '#B7C7BE' },
    };
    sheet.getRange(`A${headerRow}:${lastColumn}${headerRow}`).format.rowHeight = 34;
    const matrix = rows.map((row) => columns.map((column) => {
      const value = row[column] ?? '';
      return typeof value === 'string' && value.startsWith('=') ? `'${value}` : value;
    }));
    sheet.getRange(`A${firstDataRow}:${lastColumn}${lastRow}`).values = matrix;
    const table = sheet.tables.add(`A${headerRow}:${lastColumn}${lastRow}`, true);
    table.name = `Radio${name.replace(/[^A-Za-z0-9]/g, '')}`;
    sheet.getRange(`A${firstDataRow}:${lastColumn}${lastRow}`).format = {
      font: { color: '#1F2A24', size: 9 }, wrapText: true,
      verticalAlignment: 'top', horizontalAlignment: 'left',
      borders: { preset: 'all', style: 'thin', color: '#D9E2DC' },
    };
    sheet.getRange(`A${firstDataRow}:${lastColumn}${lastRow}`).format.rowHeight = name === 'Cue Inventory' ? 46 : 54;
    for (let index = 0; index < columns.length; index++) {
      const column = columnName(index);
      sheet.getRange(`${column}1:${column}${lastRow}`).format.columnWidth = columnWidth(columns[index]);
    }
    if (name === 'Problems and Decisions') {
      for (let index = 0; index < rows.length; index++) {
        const rowNumber = firstDataRow + index;
        const row = rows[index];
        if (row['Owner decision needed'].startsWith('OWNER')) {
          sheet.getRange(`A${rowNumber}:${lastColumn}${rowNumber}`).format.fill = '#FFF3CD';
        } else if (row.Severity === 'P0' || row.Severity === 'P1') {
          sheet.getRange(`A${rowNumber}:${lastColumn}${rowNumber}`).format.fill = '#FDE8E7';
        }
      }
    }
    if (name === 'Revamp Plan') {
      for (let index = 0; index < rows.length; index++) {
        const rowNumber = firstDataRow + index;
        const status = rows[index].Status;
        if (status === 'DONE') sheet.getRange(`A${rowNumber}:H${rowNumber}`).format.fill = '#DFF2E5';
        else if (status.includes('OWNER')) sheet.getRange(`A${rowNumber}:H${rowNumber}`).format.fill = '#FFF3CD';
      }
    }
    if (name === 'Cue Inventory') {
      const orphanColumn = columnName(columns.indexOf('Orphan status'));
      for (let index = 0; index < rows.length; index++) {
        if (/^(YES|BROKEN)/.test(rows[index]['Orphan status'])) {
          sheet.getRange(`${orphanColumn}${firstDataRow + index}`).format = {
            fill: '#FDE8E7', font: { bold: true, color: '#8A1C1C', size: 9 }, wrapText: true,
          };
        }
      }
    }
    sheet.freezePanes.freezeRows(headerRow);
    sheet.freezePanes.freezeColumns(Math.min(2, columns.length));
    const values = [columns, ...matrix].flat().map(normaliseText);
    const errors = values.filter((value) => FORMULA_ERRORS.some((error) => value.includes(error)));
    qa.formulaErrors.push(...errors.map((value) => ({ sheet: name, value })));
    const inspection = await workbook.inspect({
      kind: 'region', sheetId: name, range: `A1:${lastColumn}${Math.min(lastRow, 10)}`,
      maxChars: 6000, tableMaxRows: 10, tableMaxCols: Math.min(columns.length, 8), tableMaxCellChars: 80,
    });
    const formulaInspection = await workbook.inspect({
      kind: 'formula', sheetId: name, range: `A1:${lastColumn}${lastRow}`,
      maxChars: 800, options: { maxResults: 20 },
    });
    const preview = await workbook.render({
      sheetName: name, autoCrop: 'all', scale: name === 'Cue Inventory' ? 0.24 : 0.42, format: 'png',
    });
    const previewFile = path.join(previewDir, `${slugSheet(name)}.png`);
    await fs.writeFile(previewFile, new Uint8Array(await preview.arrayBuffer()));
    qa.sheets.push({ name, rows: rows.length, columns: columns.length,
      previewFile, inspection: String(inspection?.ndjson ?? inspection).slice(0, 1800),
      formulaInspection: String(formulaInspection?.ndjson ?? formulaInspection).slice(0, 800),
      sampledHeader: columns,
      sampledRows: [matrix[0], matrix[Math.min(1, matrix.length - 1)], matrix.at(-1)],
    });
  }
  if (qa.formulaErrors.length) throw new Error(`Workbook contains formula error tokens: ${JSON.stringify(qa.formulaErrors)}`);
  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(outputFile);
  if (qaOutput) {
    await fs.mkdir(path.dirname(qaOutput), { recursive: true });
    await fs.writeFile(qaOutput, `${JSON.stringify(qa, null, 2)}\n`, 'utf8');
  }
  return qa;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(options['repo-root'] ?? DEFAULT_ROOT);
  const data = await buildAuditData({ repoRoot });
  await writeAuditFiles(data, { check: options.check });
  if (options['xlsx-output']) {
    if (options.check) throw new Error('--check cannot be combined with --xlsx-output');
    await writeWorkbook(data, {
      outputFile: path.resolve(options['xlsx-output']),
      artifactToolUrl: options['artifact-tool-url'],
      previewDir: path.resolve(options['preview-dir']),
      qaOutput: options['qa-output'] ? path.resolve(options['qa-output']) : null,
    });
  }
  console.log(`[radio-audit] ${options.check ? 'checked' : 'wrote'} ${data.summary.beatsCovered}/${data.summary.beatsTotal} beats, ${data.rows['Cue Inventory'].length} cues, ${data.summary.orphans} orphans, ${data.summary.missingAssets} missing assets.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(TOOL_FILE)) {
  main().catch((error) => {
    console.error(`[radio-audit] ${error.stack || error.message || error}`);
    process.exitCode = 1;
  });
}
