import { buildHotDogPartySequence } from '../bing/second-visit.js';
import {
  GRAVEYARD_ARRIVAL_LINES,
  GRAVEYARD_SNOW_BARKS,
  GRAVES,
  GraveyardMission,
} from '../graveyard/mission.js';

/**
 * Performer names are authored for subtitles, while audio generation needs a
 * stable manifest voice profile. Keep that translation here so the runtime
 * scripts remain the sole authority for cue ids and spoken words.
 *
 * Lawnmower is Snow in this sequence and therefore keeps Snow?s locked voice.
 * Echo is a scene/history role with a dedicated profile so a recording can be
 * recast later without rewriting a cue or splitting Eric into Ericran.
 */
export const HOTDOG_VOICE_BY_SPEAKER = Object.freeze({
  Shubenator: 'shubenator',
  'Hog Mama': 'hogmama',
  Lawnmower: 'snow',
  'Billy HotDog': 'hotdog',
  Ape: 'ape',
  'Big Uncle Lou': 'lou1',
  Rippinflow: 'rippinflow',
  Prospect: 'player',
  Aubbie: 'aubbie',
  Snow: 'snow',
  Echo: 'echo',
});

function catalogLine({ cue, text, speaker }) {
  const voice = HOTDOG_VOICE_BY_SPEAKER[speaker];
  if (!cue?.startsWith('vo.') || !text || !voice) {
    throw new Error(`Uncatalogued HotDog voice line: ${speaker ?? 'unknown'} / ${cue ?? 'no cue'}`);
  }
  return Object.freeze({ cue, text, speaker, voice });
}

function unique(lines) {
  const byCue = new Map();
  for (const line of lines) {
    if (byCue.has(line.cue)) throw new Error(`Duplicate HotDog voice cue: ${line.cue}`);
    byCue.set(line.cue, line);
  }
  return Object.freeze([...byCue.values()]);
}

export function hotDogPartyVoiceLines() {
  return unique(buildHotDogPartySequence().map((beat) => catalogLine({
    cue: beat.cue,
    text: beat.line,
    speaker: beat.who,
  })));
}

/**
 * Exercise each dialogue-bearing public mission action once. This keeps the
 * recording sheet synchronized to what players can actually trigger, without
 * maintaining a second copy of the grave text in a tool-only file.
 */
export function graveyardVoiceLines() {
  const authoredLines = [...GRAVEYARD_ARRIVAL_LINES, ...Object.values(GRAVEYARD_SNOW_BARKS)];
  const lines = authoredLines.map((line) => catalogLine({
    cue: line.cue,
    text: line.text,
    speaker: line.who,
  }));
  const mission = new GraveyardMission({
    onLine(text, { cue, who } = {}) {
      lines.push(catalogLine({ cue, text, speaker: who }));
    },
  });

  for (const id of Object.keys(GRAVES)) mission.inspectGrave(id);
  mission.suggestSaucePlot();
  mission.urinateOn('brawny');
  mission.urinateOn('whiplash');
  mission.pickUpBody();
  mission.placeBody();
  mission.finishBurial();

  return unique(lines);
}

export function allHotDogVoiceLines() {
  return unique([...hotDogPartyVoiceLines(), ...graveyardVoiceLines()]);
}
