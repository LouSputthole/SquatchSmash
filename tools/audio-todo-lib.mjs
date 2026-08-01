/**
 * Build the human-facing audio production handoff from the two audio systems
 * that still exist in this repository.
 *
 * The shared manifest is runtime-authoritative: its exact filenames can be
 * delivered to assets/sfx and become playable after the index is rebuilt.
 * The older motel/Squatch Smash queue is only a production-design backlog.
 * Its WAV paths are not loaded by the current runtime, so those rows are kept
 * visible but deliberately quarantined from the drop-in delivery list.
 */

const VOICE_SCENES = [
  ['Bada Bing', (name) => name.startsWith('vo.bing.')
    || name.startsWith('vo.bj.') || name.startsWith('vo.slots.')],
  ['Squatchfather', (name) => name.startsWith('vo.sf.')],
  ['The Beef Run', (name) => name.startsWith('vo.beefrun.')],
  ['Jerky Motel', (name) => name.startsWith('vo.motel.')],
  ['NO WAKE', (name) => name.startsWith('vo.nowake.')],
  ['The Silver Room', (name) => name.startsWith('vo.silver.')],
  ['The HotDog Incident', (name) => name.startsWith('vo.bing2.')],
  ['Squatch Graveyard', (name) => name.startsWith('vo.graveyard.')],
  ['Initiation', (name) => name.startsWith('vo.initiation.')],
  ['Radio', (name) => name.startsWith('radio.')],
];

const EFFECT_SCENES = [
  ['NO WAKE', (name) => name.startsWith('boat.') || name === 'water.splash'],
  ['Bada Bing', (name) => name.startsWith('ambience.rain')
    || name.startsWith('ambience.club') || name.startsWith('ambience.crowd')
    || name.startsWith('car.radio')],
  ['Shared movement', (name) => name.startsWith('footstep.')],
];

const LEGACY_SCENE_NAMES = {
  motel: 'Jerky Motel',
  campground: 'Squatch Smash campground',
};

const VOICE_DIRECTION = {
  lou2: 'Captain Lou Sasole. Late fifties, forty years of this, and something wrong with his stomach the whole way. Deadpan and unhurried; he genuinely finds all of this unremarkable.',
  player: 'Tony Squatchtana. Younger, competent, and aware he is the only person treating any of this as unusual. Flat and dry rather than nervous.',
  'old-stove': 'Old Stove. Pleasant, unhurried, and completely immovable. Warm enough that every refusal lands as friendly.',
  cecilio: 'Don Cecilio Barriga. Courteous, slow, and never once says what is in the crates.',
  'motel-rico': 'Rico, the Jerky Motel antagonist. PROVISIONAL audition casting from the owner\'s Boston side-character pool; voice lead must approve or recast this profile before locking the final cast.',
  'motel-chino': 'Chino, Rico\'s Motel lieutenant. PROVISIONAL audition casting from the owner\'s Southern NPC pool; voice lead must approve or recast this profile before locking the final cast.',
  'npc-male': 'Scene-local male NPC pool. PROVISIONAL audition casting from the owner\'s old-man NPC row; voice lead must approve or recast this profile before locking the final cast.',
  'caib-radio': 'Bureau radio. Procedural, bored, and filtered, as if reading a checklist at somebody it cannot see.',
  lookout: 'A man on a hill with binoculars who has been there since dawn.',
  lou: 'Big Uncle Lou. Controlled and almost gentle. The quiet certainty matters more than menace.',
  willy: 'Willy. Talkative and defensive, not comic relief. He starts by making the ride normal, then realizes why he was invited.',
  booski: 'Booskibro. Usually the room\'s loudest man; deliberately low and precise when family business turns serious.',
  hotdog: 'Billy HotDog. Loud, comfortable, and casually cruel. The final insult gets quieter, not bigger.',
  aubbie: 'Aubbie. Tired utility man, practical and dry. Every joke should sound like a repair estimate.',
  echo: 'Echo. Frightened and plainly alive. Record clean; the grave muffling belongs to scene playback.',
  snow: 'Snow. Minimal words and flat authority. He treats every impossible graveyard sound as weather.',
};

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const fileOf = (cue) => cue.file || `${cue.name}.mp3`;

function group(items, keyOf) {
  const out = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

function voiceScene(name) {
  return VOICE_SCENES.find(([, owns]) => owns(name))?.[0] || 'Apartment and shared hub';
}

function effectScene(name) {
  return EFFECT_SCENES.find(([, owns]) => owns(name))?.[0] || 'Shared / other';
}

function voiceDirection(profile, voices) {
  return VOICE_DIRECTION[profile] || voices?.[profile]?._note || null;
}

function voiceReusePlan(cues) {
  const duplicateGroups = [...group(cues, (cue) => `${cue.voice || 'player'}\u0000${cue.say}`).values()]
    .filter((items) => items.length > 1)
    .map((items) => [...items].sort((a, b) => a.name.localeCompare(b.name)))
    .sort((a, b) => a[0].name.localeCompare(b[0].name));
  const byCue = new Map();
  duplicateGroups.forEach((items, index) => {
    items.forEach((cue, itemIndex) => byCue.set(cue.name, {
      group: index + 1,
      count: items.length,
      master: itemIndex === 0,
    }));
  });
  const redundant = duplicateGroups.reduce((sum, items) => sum + items.length - 1, 0);
  return {
    byCue,
    groups: duplicateGroups.length,
    redundant,
    performances: cues.length - redundant,
  };
}

const isFutureInitiationPartyCue = (cue) => cue.name.startsWith('vo.initiation.party.')
  || cue.name.startsWith('vo.initiation.ambient.');

function renderVoice(out, voice, voices) {
  const byScene = group(voice, (cue) => voiceScene(cue.name));
  const reuse = voiceReusePlan(voice);
  const order = [
    'Apartment and shared hub', 'Bada Bing', 'Squatchfather', 'The Beef Run',
    'Jerky Motel', 'NO WAKE', 'The Silver Room', 'The HotDog Incident',
    'Squatch Graveyard', 'Initiation', 'Radio',
  ];

  if (!voice.length) {
    out.push('## Voice pickups', '', 'Nothing outstanding. Every manifest-authored spoken cue has an indexed recording.', '');
    return;
  }

  for (const scene of order) {
    const sceneCues = byScene.get(scene);
    if (!sceneCues?.length) continue;
    out.push(`## Voice pickups — ${scene} (${sceneCues.length})`, '');
    const byProfile = group(sceneCues, (cue) => cue.voice || 'player');
    for (const [profile, cues] of [...byProfile].sort(([a], [b]) => a.localeCompare(b))) {
      out.push(`### ${profile.replace(/-/g, ' ').toUpperCase()} (${cues.length})`, '');
      out.push(`Voice profile: \`${profile}\`.`);
      const direction = voiceDirection(profile, voices);
      if (direction) out.push('', direction);
      out.push('');
      for (const cue of [...cues].sort((a, b) => a.name.localeCompare(b.name))) {
        const repeated = reuse.byCue.get(cue.name);
        const instruction = !repeated ? '' : repeated.master
          ? ` **PERFORMANCE REUSE GROUP ${repeated.group}: record once; ${repeated.count} exact cue files share this approved take.**`
          : ` **PERFORMANCE REUSE GROUP ${repeated.group}: copy the approved master take; do not record again.**`;
        out.push(`- \`${fileOf(cue)}\` — ${JSON.stringify(cue.say)}${instruction}`);
      }
      out.push('');
    }
  }
}

function renderHotDogLedger(out, cues, have) {
  const authored = cues.filter((cue) => cue.name.startsWith('vo.bing2.')
    || cue.name.startsWith('vo.graveyard.'));
  if (!authored.length) return;

  const recorded = authored.filter((cue) => have.has(fileOf(cue))).length;
  out.push('## Complete authored ledger - The HotDog Incident and Squatch Graveyard', '');
  out.push(`${authored.length} authored cue(s): ${recorded} **RECORDED**, ${authored.length - recorded} **NEEDS RECORDING**.`, '');

  for (const [scene, owns] of [
    ['Closed Bada Bing party', (cue) => cue.name.startsWith('vo.bing2.')],
    ['Squatch graveyard', (cue) => cue.name.startsWith('vo.graveyard.')],
  ]) {
    const sceneCues = authored.filter(owns).sort((a, b) => a.name.localeCompare(b.name));
    out.push(`### ${scene} (${sceneCues.length})`, '');
    for (const cue of sceneCues) {
      const status = have.has(fileOf(cue)) ? '**RECORDED**' : '**NEEDS RECORDING**';
      out.push(`- ${status} \`${fileOf(cue)}\` - ${JSON.stringify(cue.say)}`);
    }
    out.push('');
  }
}

function renderFutureInitiationParty(out, cues, voices, { total, indexed }) {
  if (!total) return;
  out.push(`## Future Initiation party dialogue — ${total} total; ${indexed} indexed; ${cues.length} missing`, '');
  out.push('**Do not include these in the current line run unless the post-initiation party is approved for implementation.** The dialogue brain and exact filenames are authored, but the party body is not instantiated by the playable Initiation scene yet. They are listed so future work stays visible without being misrepresented as a live pickup.', '');
  if (!cues.length) {
    out.push('No recording pickups remain in this deferred catalog. The indexed takes stay lazy-loaded until the party scene is actually connected.', '');
    return;
  }
  const byProfile = group(cues, (cue) => cue.voice || 'player');
  for (const [profile, profileCues] of [...byProfile].sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`### ${profile.replace(/-/g, ' ').toUpperCase()} (${profileCues.length})`, '');
    out.push(`Voice profile: \`${profile}\`.`);
    const direction = voiceDirection(profile, voices);
    if (direction) out.push('', direction);
    out.push('');
    for (const cue of [...profileCues].sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(`- \`${fileOf(cue)}\` — ${JSON.stringify(cue.say)}`);
    }
    out.push('');
  }
}

function renderProvisionalCastingReview(out, cues, voices, have) {
  const profiles = Object.entries(voices || {})
    .filter(([, profile]) => /\bPROVISIONAL\b/i.test(profile?._note || ''))
    .sort(([a], [b]) => a.localeCompare(b));
  if (!profiles.length) return;

  out.push(`## Provisional casting review — ${plural(profiles.length, 'voice profile')}`, '');
  out.push('These profiles have usable audition ids, but they are not owner-locked castings. Existing files remain playable demo takes, not automatic approval. The voice lead should audition each profile in `assets/sfx/_listen.html`; to recast, replace the profile id and regenerate that cast with `npm run sfx -- --force --cast <profile>`.', '');
  for (const [name, profile] of profiles) {
    const owned = cues.filter((cue) => typeof cue.say === 'string' && (cue.voice || 'player') === name);
    const recorded = owned.filter((cue) => have.has(fileOf(cue))).length;
    out.push(`### ${name.replace(/-/g, ' ').toUpperCase()} — ${recorded} indexed, ${owned.length - recorded} missing`, '');
    out.push(profile._note, '');
  }
}

function renderManifestEffects(out, effects) {
  const byScene = group(effects, (cue) => effectScene(cue.name));
  const order = ['NO WAKE', 'Bada Bing', 'Shared movement', 'Shared / other'];

  if (!effects.length) {
    out.push('## Manifest effect pickups', '', 'Nothing outstanding.', '');
    return;
  }

  for (const scene of order) {
    const sceneCues = byScene.get(scene);
    if (!sceneCues?.length) continue;
    out.push(`## Manifest effect pickups — ${scene} (${sceneCues.length})`, '');
    out.push('These are shared-manifest cues. The exact MP3 filename below becomes playable after the runtime index is rebuilt. A procedural WebAudio fallback remains active when the cue is requested.', '');
    for (const cue of [...sceneCues].sort((a, b) => a.name.localeCompare(b.name))) {
      const timing = [cue.duration ? `${cue.duration}s` : null, cue.loop ? 'seamless loop' : null]
        .filter(Boolean).join(', ');
      out.push(`### \`${fileOf(cue)}\`${timing ? ` — ${timing}` : ''}`, '');
      if (cue._comment || cue.note || cue._note) out.push(cue._comment || cue.note || cue._note, '');
      out.push(cue.prompt || '**PROMPT MISSING — fix the manifest before production.**', '');
    }
  }
}

function renderLegacy(out, legacyQueue) {
  const typed = [
    ['Sound effects', 'sfx', legacyQueue?.sfx || []],
    ['Ambience', 'ambience', legacyQueue?.ambience || []],
    ['Music', 'music', legacyQueue?.music || []],
  ].map(([label, type, entries]) => [label, type,
    entries.filter((entry) => (entry.status || 'todo') !== 'in-game')]);
  const pending = typed.flatMap(([, type, entries]) => entries.map((entry) => ({ ...entry, type })));

  out.push(`## Legacy production review backlog — ${plural(pending.length, 'brief')}`, '');
  out.push('**Review before producing:** these are older production briefs, not drop-in runtime filenames. Their `audio/.../*.wav` targets are not loaded by the shared manifest. A row with a local hook is evidence that procedural audio currently plays there, not evidence that the proposed WAV path is wired. Engineering must map, deduplicate, and approve a shared-manifest cue before anybody spends a recording or generation pass on it.', '');

  if (!pending.length) {
    out.push('Nothing outstanding.', '');
    return;
  }

  const scenes = group(pending, (entry) => entry.scene || 'other');
  for (const [scene, sceneEntries] of [...scenes].sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`### ${LEGACY_SCENE_NAMES[scene] || scene} (${sceneEntries.length})`, '');
    for (const [label, type] of typed.map(([label, type]) => [label, type])) {
      const entries = sceneEntries.filter((entry) => entry.type === type);
      if (!entries.length) continue;
      out.push(`#### ${label} (${entries.length})`, '');
      for (const entry of entries) {
        const hook = entry.call
          ? `wired local hook \`${entry.call}\``
          : '**UNWIRED DESIGN BRIEF**';
        const details = [
          entry.seconds ? `${entry.seconds}s` : null,
          entry.variations > 1 ? `${entry.variations} variations` : null,
          entry.loop ? 'seamless loop' : null,
          `status \`${entry.status || 'todo'}\``,
        ].filter(Boolean).join(', ');
        out.push(`- \`${entry.id}\` — ${hook}; legacy target \`${entry.file || '(none)'}\`; ${details}. ${entry.description || '(no production description)'}`);
      }
      out.push('');
    }
  }
}

/**
 * @param {{manifest: object, index: object, legacyQueue?: object}} input
 * @returns {string} deterministic Markdown handoff
 */
export function buildAudioTodo({ manifest = {}, index = {}, legacyQueue = {} }) {
  const cues = Array.isArray(manifest.sfx) ? manifest.sfx : [];
  const have = new Set(Array.isArray(index.files) ? index.files : []);
  const missing = cues.filter((cue) => !have.has(fileOf(cue)));
  const allVoice = missing.filter((cue) => typeof cue.say === 'string' && cue.say.trim());
  const allManifestVoice = cues.filter((cue) => typeof cue.say === 'string' && cue.say.trim());
  const futureInitiationPartyAll = allManifestVoice.filter(isFutureInitiationPartyCue);
  const futureInitiationParty = allVoice.filter(isFutureInitiationPartyCue);
  const voice = allVoice.filter((cue) => !isFutureInitiationPartyCue(cue));
  const reuse = voiceReusePlan(voice);
  const effects = missing.filter((cue) => !(typeof cue.say === 'string' && cue.say.trim()));
  const manifestFiles = new Set(cues.map(fileOf));
  const indexedManifest = cues.filter((cue) => have.has(fileOf(cue))).length;
  const orphanedIndex = [...have].filter((file) => !manifestFiles.has(file)).length;
  const legacyVoice = (legacyQueue.voice || [])
    .filter((entry) => (entry.status || 'todo') !== 'in-game').length;
  const legacyCounts = {
    sfx: (legacyQueue.sfx || []).filter((entry) => (entry.status || 'todo') !== 'in-game').length,
    ambience: (legacyQueue.ambience || []).filter((entry) => (entry.status || 'todo') !== 'in-game').length,
    music: (legacyQueue.music || []).filter((entry) => (entry.status || 'todo') !== 'in-game').length,
  };

  const out = [
    '# Audio production handoff — Squatch Life',
    '',
    'Generated by `npm run audio:todo`. Do not hand-edit this file; fix the authored cue or production queue and regenerate it.',
    '',
    '## Coverage snapshot',
    '',
    `- Shared manifest: ${plural(cues.length, 'cue')}; ${indexedManifest} have indexed recordings and ${missing.length} are missing.`,
    `- Ready for direct delivery: ${plural(voice.length, 'voice cue file')} representing ${plural(reuse.performances, 'unique profile/text performance')}, plus ${plural(effects.length, 'manifest effect')}.`,
    `- Performance reuse: ${plural(reuse.groups, 'duplicate group')} avoids ${plural(reuse.redundant, 'redundant recording')} while retaining every exact runtime filename.`,
    `- Future authored Initiation party dialogue: ${futureInitiationPartyAll.length} total; ${futureInitiationPartyAll.length - futureInitiationParty.length} indexed and ${futureInitiationParty.length} missing. The catalog is not reachable in the playable scene and is excluded from the direct line run.`,
    `- Indexed files with no current manifest owner: ${orphanedIndex}. These do not count as completed cues.`,
    `- Legacy review queue: ${legacyCounts.sfx} sound effects, ${legacyCounts.ambience} ambience beds, and ${legacyCounts.music} music briefs.`,
    `- Historical legacy voice rows excluded from this line-run sheet: ${legacyVoice}. Their old IDs/paths are not runtime-compatible; the current shared-manifest scene catalogs above are authoritative. Do not record the legacy paths.`,
    '',
    '## Delivery workflow',
    '',
    '1. Record voice pickups exactly as written and deliver each file under the exact `.mp3` filename shown.',
    '2. To render the direct voice run with the repo generator, use `npm run sfx:vo`. That command deliberately excludes the unreachable future Initiation party catalog.',
    '3. Put approved manifest pickups in `assets/sfx/`.',
    '4. Run `npm run sfx:listen` to rebuild `assets/sfx/index.json` and audition every delivered take.',
    '5. Run `npm run audio:todo:check`, `npm test`, and `npm run check` before shipping.',
    '6. Treat the legacy review queue as design/reconciliation work only. Do not render its WAV targets until engineering promotes them into the shared manifest.',
    '',
  ];

  renderProvisionalCastingReview(out, cues, manifest.voices || {}, have);
  renderVoice(out, voice, manifest.voices || {});
  renderFutureInitiationParty(out, futureInitiationParty, manifest.voices || {}, {
    total: futureInitiationPartyAll.length,
    indexed: futureInitiationPartyAll.length - futureInitiationParty.length,
  });
  renderHotDogLedger(out, allManifestVoice, have);
  renderManifestEffects(out, effects);
  renderLegacy(out, legacyQueue);

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
