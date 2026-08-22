/**
 * The Mansion's residency banks — WHAT loads WHEN, as data.
 *
 * `beginTour()` used to await the entire mansion bank — all 217 recorded
 * `vo.silentsquatch.` takes plus every effect list — before the start click
 * could produce a playable frame. The guarantee it was buying is real and is
 * kept: nothing retries a line's audio, dispatch is the one chance, so a
 * beat's recordings must be resident before its first line can be asked for
 * (see the loadManifest comment in ./main.js for the night this was learned).
 * But the guarantee only ever needed to hold PER BEAT, and the script is
 * already partitioned by scope — `vo.silentsquatch.<scope>.` — so the split
 * is a scope list, not a judgement call per line:
 *
 *   start     everything hearable between the gate and Lou's office — the
 *             arrival walk, the door and booth men, the guards on their
 *             posts, the bartender, the ground-floor cast, and Lou's office
 *             itself — plus every effect list, because the case hums and the
 *             gate man's cord cues are beat 1.
 *   nextBeat  the basement: the wine cellar hunt and everything below it,
 *             through the execution, the exit and the walk back to Lou. The
 *             boundary is the cellar-side zone set (see
 *             MANSION_NEXT_BEAT_ZONES) — the mission cannot enter a basement
 *             beat until this bank has settled.
 *   background the optional and the later-than-the-mission: the evening
 *             dressing after the case is delivered, the pee system, the line
 *             on the table. No beat boundary waits on any of it.
 *
 * A return visit collapses the mission banks: the briefing page's cast is
 * dressed for the aftermath from the first frame, so the scopes that are
 * post-mission on the first visit are opening-beat material on the return.
 */
import { weaponCueNames } from '../core/weapons/audio.js';
import { PEE_CUE_NAMES } from '../core/pee-system.js';
import { MANSION_CAST_CUE_NAMES } from './cast.js';
import { MANSION_INTERACTION_CUE_NAMES } from './interaction-audio.js';
import { silentSquatchCueNames } from './scenes/SilentSquatch.js';

/** The scopes hearable before the basement — spawn through Lou's office. */
export const MANSION_START_SCOPES = Object.freeze([
  'arrival', 'gate', 'office', 'house', 'guards', 'bar',
]);

/** The basement run, in script order: beat 3 through the report to Lou. */
export const MANSION_NEXT_BEAT_SCOPES = Object.freeze([
  'cellar', 'corridor', 'lab', 'delivery', 'build', 'torture', 'gas',
  'lock', 'execution', 'silentnight', 'reaction', 'exit', 'completion',
  'aftermath',
]);

/** Post-mission dressing; nothing beat-gated ever asks for these. */
export const MANSION_BACKGROUND_SCOPES = Object.freeze(['evening']);

/**
 * The master suite's four own recordings.
 *
 * These are the only `mansion.*` cues in the manifest that this scene plays,
 * and until this list existed the house decoded none of them: the start bank
 * named the weapons, the script, the cast and the furniture foley, and four
 * takes cut specifically for the third floor sat in `assets/sfx` and in
 * `index.json` with nothing on this page ever asking for them. The bookcase
 * swung on `synth()`'s generic tick and the two beds hummed on `synthLoop()`.
 * That is the `enola.blast.*` failure again -- delivered, indexed, and
 * outside the one filter that decides what this page decodes.
 *
 * They ride the START bank because all four are reachable on the ground the
 * start bank covers: the beds come up as soon as it settles (see
 * `startSuiteBeds` in ./main.js) and the bookcase is an ordinary interaction
 * with no beat gate in front of it.
 */
export const MANSION_SUITE_CUE_NAMES = Object.freeze([
  'mansion.suite.tone',
  'mansion.suite.hottub',
  'mansion.suite.bookcase.open',
  'mansion.suite.bookcase.shut',
]);

const prefixesOf = (scopes) => scopes.map((scope) => `vo.silentsquatch.${scope}.`);

/**
 * The zones whose one-shot crossing begins a basement beat. Holding these
 * while the nextBeat bank is in flight is the await-at-the-boundary: the
 * player's feet stay in the cylinder, the id stays unconsumed, and the beat
 * begins on the first tick after the bank settles. `officeReturn` is beat
 * 11's second leg and speaks from the same bank.
 */
export const MANSION_NEXT_BEAT_ZONES = Object.freeze(new Set([
  'cellar', 'bust', 'corridor', 'xxx', 'observation', 'stairs',
  'cellarTop', 'officeReturn',
]));

/**
 * The three banks, in `audio.loadManifest` / `audio.loadAdditional` shape.
 *
 * @param {'first'|'return'} visit — the return briefing has no basement run
 *   and its cast opens on the aftermath, so the mission scopes fold into the
 *   start bank rather than being gated behind zones the visit never crosses.
 */
export function mansionAudioBanks(visit = 'first') {
  if (visit === 'return') {
    return {
      start: {
        names: [
          ...weaponCueNames(),
          ...silentSquatchCueNames(),
          ...MANSION_CAST_CUE_NAMES,
          ...MANSION_INTERACTION_CUE_NAMES,
          ...MANSION_SUITE_CUE_NAMES,
        ],
        prefixes: prefixesOf([
          ...MANSION_START_SCOPES,
          ...MANSION_NEXT_BEAT_SCOPES,
          ...MANSION_BACKGROUND_SCOPES,
        ]),
      },
      nextBeat: null,
      background: {
        names: [...PEE_CUE_NAMES, 'bing.line.snort'],
        prefixes: [],
      },
    };
  }
  return {
    start: {
      names: [
        ...weaponCueNames(),
        ...silentSquatchCueNames(),
        ...MANSION_CAST_CUE_NAMES,
        ...MANSION_INTERACTION_CUE_NAMES,
        ...MANSION_SUITE_CUE_NAMES,
      ],
      prefixes: prefixesOf(MANSION_START_SCOPES),
    },
    nextBeat: {
      names: [],
      prefixes: prefixesOf(MANSION_NEXT_BEAT_SCOPES),
    },
    background: {
      names: [...PEE_CUE_NAMES, 'bing.line.snort'],
      prefixes: prefixesOf(MANSION_BACKGROUND_SCOPES),
    },
  };
}
