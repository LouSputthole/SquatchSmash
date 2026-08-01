#!/usr/bin/env node
/**
 * Everything the game asks for and does not have a recording of.
 *
 *   npm run audio:todo        -> writes VOICE-LINES-TODO.md
 *
 * Two different things end up in here and they are generated differently:
 *
 *   vo.*   a person reading a line. There is no synth fallback for these on
 *          purpose -- a synthesised voice is worse than silence -- so an
 *          unrecorded line is a line that shows as text and says nothing.
 *   the rest
 *          sound effects. These DO have a synth fallback, so an unrecorded
 *          one is audible but crude. Lower priority, still worth having.
 *
 * Written as a file rather than printed because the point of it is to hand it
 * to somebody, and regenerated rather than hand-maintained because a list of
 * outstanding work that has to be remembered to update is a list that is
 * wrong within a week.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const have = new Set(read('assets/sfx/index.json').files || []);
const cues = read('assets/sfx/manifest.json').sfx || [];
const missing = cues.filter((c) => !have.has(c.file || `${c.name}.mp3`));

const voice = missing.filter((c) => c.say);
const effects = missing.filter((c) => !c.say);

/** Notes for the person reading, keyed by bank. */
const DIRECTION = {
  'vo.tap': 'Kitchen tap. Flat, to nobody. He turned it on for no reason and knows it.',
  'vo.spooky': 'The comedown. Unbothered, normal volume, the way you talk to an empty room — it stops being funny the second he sounds frightened. He never goes to look.',
  'vo.gun.fire': 'He has just fired a revolver indoors. Not thrilled, not frightened: appalled in a mild, administrative way.',
  'vo.gun.empty': 'The click at the end. Faintly disappointed, as if the gun had let him down.',
  'vo.gun.reload': 'Loading it. He is aware this is a strange thing to be good at.',
  'vo.ammo': 'Finding cartridges in his own flat. Genuine mild surprise.',
  'vo.slice': 'Cold pizza off the coffee table, at whatever time it is. Content.',
  'vo.hr': 'He has just told HR where to go, in writing, having been sacked forty minutes earlier and not yet read that email.',
  'vo.fired': 'Reading that he no longer has a job. Not upset. Processing it the way you process weather.',

  /* The Bada Bing's gambling floor. The prospect's half is the same man as the
   * flat; the dealer's half is not, so every dealer bank says so out loud --
   * the blanket "all in the player voice" above is exactly the wrong
   * assumption to let somebody carry into the booth with these. */
  'vo.bj.win': 'He has just won a hand of blackjack. Not pleased — mildly surprised that it went his way, and unwilling to take any credit for it.',
  'vo.bj.lose': 'Lost the hand. Flat acceptance. This is money he had already written off walking in.',
  'vo.bj.blackjack': 'Twenty-one off the first two cards. The best thing that can happen at the table, reported like a parcel arriving.',
  'vo.bj.bust': 'He drew and went over. Appalled in the mild administrative way — the part that bothers him is that he asked for the card.',
  'vo.bj.double': 'He doubled down and it landed. The closest he comes all night to having an opinion about himself.',
  'vo.bj.broke': 'That was the last of it; he cannot make the twenty-five any more. Said exactly as flatly as everything else, which is the joke.',
  'vo.bj.dealer.deal': 'THE DEALER, not the player — the `uncle` voice. Sharply dressed, older, says almost nothing. Smooth, low, unhurried, bored in a professional way. Calling the table, not performing.',
  'vo.bj.dealer.hit': 'The dealer (`uncle` voice). One word, no inflection. He has said it ten thousand times.',
  'vo.bj.dealer.stand': 'The dealer (`uncle` voice). Acknowledging and moving on.',
  'vo.bj.dealer.blackjack': 'The dealer (`uncle` voice), turning over his own twenty-one. No triumph whatsoever — the house winning is simply Tuesday.',
  'vo.bj.dealer.bust': 'The dealer (`uncle` voice), calling the player over. The "sorry" is courtesy, not sympathy.',
  'vo.bj.dealer.payout': 'The dealer (`uncle` voice), paying the bet. Procedural.',
  'vo.bj.dealer.minimum': 'The dealer (`uncle` voice), to a man sitting at the felt who cannot cover the bet. Not unkind, not remotely interested either.',
  'vo.slots.jackpot': 'He has hit the jackpot on the machine by the front booths, and the whole room is now looking at him. Mortified rather than triumphant.',
  'vo.slots.dead': 'Several spins into nothing at all. A running total rather than a complaint.',
};

/** How each of the mission's speakers reads, for whoever ends up in the booth. */
const VOICE_DIRECTION = {
  lou2: 'Captain Lou Sasole. Late fifties, forty years of this, and something wrong '
    + 'with his stomach the whole way. Deadpan and unhurried — he is not doing bits, '
    + 'he genuinely finds all of this unremarkable. Never raises his voice except to '
    + 'say a number. Half the lines are him being right about something dreadful.',
  player: 'The player — Tony Squatchtana. Younger, competent, aware he is the only one '
    + 'treating any of this as unusual. Flat and dry rather than nervous; he asks the '
    + 'question anybody would ask and gets no answer.',
  'old-stove': 'Old Stove. Squatch, and also the government. Pleasant, unhurried, '
    + 'completely immovable. He is not lying to you, he is simply declining to be '
    + 'anywhere. Warm enough that the refusals land as friendly.',
  cecilio: 'Don Cecilio Barriga. Courteous, slow, and never once says what is in the '
    + 'crates. Every line is hospitality with the temperature taken out of it.',
  'caib-radio': 'Bureau radio. Procedural, bored, filtered — a man reading a checklist '
    + 'at somebody he cannot see.',
  lookout: 'A man on a hill with binoculars who has been there since dawn.',
  lou1: 'Big Uncle Lou. Older, dry, unhurried, and never performing the joke. He is '
    + 'comfortable enough with these men to let the silence after a line do the work.',
  rippinflow: 'Rippinflow. The mouth of the morning: fast, pleased with himself and always '
    + 'half a beat from another story. Warm underneath it, but never sentimental.',
  erican: 'Erican, called Eric here. Spare, steady and warm. He says only what is useful; '
    + 'when he adds a second sentence it matters.',
};

const bankOf = (name) => name.split('.').slice(0, -1).join('.');

let out = '# Audio still to record — Squatch Life\n\n';
out += `Generated by \`npm run audio:todo\`. ${voice.length} voice line(s), `
  + `${effects.length} effect(s).\n\n`;
out += 'Drop the mp3s in `assets/sfx/` under the filename given, then run '
  + '`npm run sfx:listen` to rebuild `assets/sfx/index.json`.\n\n';

/* The Beef Run is a cast rather than one man talking to himself, and every one
 * of its lines is its own cue, so grouping it the way the flat is grouped would
 * make a hundred and ninety one one-line sections. It gets its own chapter,
 * ordered by who is speaking. */
const flatVoice = voice.filter((c) => !c.name.startsWith('vo.beefrun.')
  && !c.name.startsWith('vo.golf.'));
const missionVoice = voice.filter((c) => c.name.startsWith('vo.beefrun.'));
const golfVoice = voice.filter((c) => c.name.startsWith('vo.golf.'));

if (flatVoice.length) {
  out += '## Voice — the flat\n\nAll in the player voice unless the name says otherwise. These have '
    + '**no fallback** — an unrecorded line shows on screen and plays nothing.\n\n';
  const banks = new Map();
  for (const c of flatVoice) {
    const b = bankOf(c.name);
    if (!banks.has(b)) banks.set(b, []);
    banks.get(b).push(c);
  }
  for (const [bank, list] of banks) {
    out += `### \`${bank}.*\` — ${list.length}\n\n`;
    if (DIRECTION[bank]) out += `${DIRECTION[bank]}\n\n`;
    for (const c of list) out += `${(c.file || `${c.name}.mp3`).padEnd(24)}  ${JSON.stringify(c.say)}\n`;
    out += '\n';
  }
} else {
  out += '## Voice — the flat\n\nNothing outstanding. Every written line has a recording.\n\n';
}

if (missionVoice.length) {
  out += `## Voice — The Beef Run\n\n${missionVoice.length} line(s), one cue each so the words `
    + 'heard match the words on screen. Regenerate the cue list with '
    + '`npm run vo:beefrun` after editing `src/beefrun/script.js`.\n\n';
  const byWho = new Map();
  for (const c of missionVoice) {
    const who = c.voice || 'lou2';
    if (!byWho.has(who)) byWho.set(who, []);
    byWho.get(who).push(c);
  }
  for (const [who, list] of [...byWho].sort((a, b) => b[1].length - a[1].length)) {
    out += `### ${who.replace(/-/g, ' ').toUpperCase()} — ${list.length}\n\n`;
    if (VOICE_DIRECTION[who]) out += `${VOICE_DIRECTION[who]}\n\n`;
    for (const c of list) {
      out += `${(c.file || `${c.name}.mp3`).padEnd(46)}  ${JSON.stringify(c.say)}\n`;
    }
    out += '\n';
  }
}

if (golfVoice.length) {
  out += `## Voice — A Morning at Silver Pines\n\n${golfVoice.length} line(s), one stable cue per `
    + 'subtitle. The line-specific direction and authored post-line silence come directly '
    + 'from `src/golf/script.js`; regenerate with `npm run vo:golf` after any script edit.\n\n'
    + '**Casting still required:** `rippinflow` and `erican` have placeholder voice IDs in '
    + '`assets/sfx/manifest.json`. Choose those two voices before running `npm run sfx:vo`.\n\n';
  const byWho = new Map();
  for (const c of golfVoice) {
    const who = c.voice || 'player';
    if (!byWho.has(who)) byWho.set(who, []);
    byWho.get(who).push(c);
  }
  for (const [who, list] of [...byWho].sort((a, b) => b[1].length - a[1].length)) {
    out += `### ${who.replace(/-/g, ' ').toUpperCase()} — ${list.length}\n\n`;
    if (VOICE_DIRECTION[who]) out += `${VOICE_DIRECTION[who]}\n\n`;
    for (const c of list) {
      out += `- \`${c.file || `${c.name}.mp3`}\`\n`
        + `  - Line: ${JSON.stringify(c.say)}\n`
        + `  - Direction: ${c.direction || '(direction missing)'}\n`;
      if (c.postLineHold) out += `  - Silence after: ${c.postLineHold.toFixed(1)} seconds\n`;
      out += '\n';
    }
  }
}

if (effects.length) {
  out += '## Effects\n\nThese fall back to the procedural synth, so they are audible '
    + 'already — a recording replaces a rough approximation rather than silence.\n\n';
  for (const c of effects) {
    out += `### \`${c.name}\`${c.duration ? ` — ${c.duration}s` : ''}\n\n`;
    if (c._comment) out += `${c._comment}\n\n`;
    out += `${c.prompt || '(no prompt written)'}\n\n`;
  }
} else {
  out += '## Effects\n\nNothing outstanding.\n\n';
}

fs.writeFileSync(path.join(ROOT, 'VOICE-LINES-TODO.md'), out);
console.log(`VOICE-LINES-TODO.md — ${voice.length} voice, ${effects.length} effects`);
