import {
  BARKS,
  DATE,
  DATE_BARKS,
  PROFILE_OF,
  VOICE_OF,
  buildScripts,
  silverSpokenWords,
} from './script.js';
import { SET } from './perform.js';

function scriptContext(flags, score, knows) {
  const noop = () => {};
  const mission = {
    flags,
    metFamily: false,
    addObjective: noop,
    resolve: noop,
    roundDone: noop,
  };
  return {
    mission,
    flags,
    woo: { score, has: () => false },
    money: () => 10000,
    knows: () => knows,
    remember: noop,
    fire: noop,
    tip: noop,
    order: noop,
    playRequest: noop,
    holdTheRoom: noop,
    releaseTheRoom: noop,
    serveTable: noop,
    startSway: noop,
    startTableCutscene: noop,
    judgeInvitation: noop,
  };
}

const CASES = Object.freeze([
  { score: 20, knows: false, flags: {} },
  { score: 65, knows: true, flags: { tableBuilt: true, seated: true, drinkOrdered: 'rye', songRequested: 'banana', introducedAs: 'right', driverTipped: true, hazardSeen: true, abandonments: 2 } },
  { score: 92, knows: true, flags: { tableBuilt: false, seated: true, drinkOrdered: false, songRequested: false, introducedAs: 'wrong', driverTipped: false, hazardSeen: false, abandonments: 0 } },
  { score: 45, knows: false, flags: { seated: true, drinkOrdered: 'wrong', songRequested: 'slow', introducedAs: 'job', abandonments: 2 } },
  { score: 10, knows: true, flags: { seated: false, drinkOrdered: 'asked', songRequested: 'horns', introducedAs: 'right', abandonments: 0 } },
  { score: 50, knows: false, flags: { seated: true, drinkOrdered: false, songRequested: false, introducedAs: 'right', abandonments: 0 } },
]);

/** Every unique character-spoken line in Front and Center. */
export function allSilverVoiceLines() {
  const found = new Map();
  const add = (name, bank, displayText, context) => {
    const text = silverSpokenWords(displayText);
    if (!name || !bank || !/[\p{L}\p{N}]/u.test(text)) return;
    const voice = PROFILE_OF[bank] ?? bank;
    const line = { name, bank, voice, text, context };
    const prior = found.get(name);
    if (prior && (prior.text !== text || prior.voice !== voice)) {
      throw new Error(`Silver voice cue collision at ${name}: ${prior.text} / ${text}`);
    }
    if (!prior) found.set(name, line);
  };

  for (const scenario of CASES) {
    const flags = {
      tableBuilt: false,
      seated: false,
      drinkOrdered: false,
      songRequested: false,
      introducedAs: 'right',
      driverTipped: false,
      hazardSeen: false,
      abandonments: 0,
      ...scenario.flags,
    };
    const ctx = scriptContext(flags, scenario.score, scenario.knows);
    const scripts = buildScripts(ctx);
    const visit = (treeName, nodeId, node) => {
      if (!node || typeof node !== 'object') return;
      if (node.line) {
        const display = typeof node.line === 'function' ? node.line() : node.line;
        const cue = typeof node.cue === 'function' ? node.cue() : node.cue;
        add(cue, VOICE_OF[node.who], display, `${treeName}.${nodeId}`);
      }
      const options = typeof node.options === 'function' ? node.options() : node.options;
      for (const [i, option] of (options || []).entries()) {
        const display = typeof option?.text === 'function' ? option.text() : option?.text;
        const cue = typeof option?.cue === 'function' ? option.cue() : option?.cue;
        add(cue, 'player', display, `${treeName}.${nodeId}.choice.${i + 1}`);
      }
    };
    for (const [treeName, tree] of Object.entries(scripts)) {
      if (treeName === 'scenes') {
        for (const [sceneName, beats] of Object.entries(tree)) {
          beats.forEach((beat, i) => visit(`scene-${sceneName}`, i, beat));
        }
      } else {
        for (const [nodeId, node] of Object.entries(tree)) visit(treeName, nodeId, node);
      }
    }
  }

  for (const [key, lines] of Object.entries(DATE_BARKS)) {
    lines.forEach((line, i) => add(`vo.silver.margo.bark.${key}.${i + 1}`, 'margo', line, `Margo bark: ${key}`));
  }
  for (const [key, lines] of Object.entries(BARKS)) {
    lines.forEach(([, line], i) => add(`vo.silver.room.${key}.${i + 1}`, 'room', line, `room bark: ${key}`));
  }
  for (const number of SET) {
    if (number.say) add(number.cue, VOICE_OF[number.lead], number.say, `set: ${number.id}`);
  }

  /* Keep this assertion close to the catalog: the date must not silently
   * lose her own voice when the registry name changes. */
  if (VOICE_OF[DATE.name] !== 'margo') throw new Error(`${DATE.name} is not mapped to Margo's voice bank`);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
