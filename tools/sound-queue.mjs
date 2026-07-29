#!/usr/bin/env node
// Builds assets/audio/sound-queue.json — the list of every sound the game
// needs, so real audio can be produced later and dropped in against these ids.
//
// Everything is currently synthesised at runtime with WebAudio, so this file is
// the brief, not a loader manifest. Each entry names the code hook it replaces.
//
// It also *checks* the queue: it scans the source for `sfx.<name>` cues and
// fails if any cue in the code has no entry here (or vice versa).
//
// Usage: node tools/sound-queue.mjs            (write the queue, run the check)
//        node tools/sound-queue.mjs --check    (check only, non-zero on drift)

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const OUT = join(root, 'assets', 'audio', 'sound-queue.json');

// ---------------------------------------------------------------------------
// The queue. `call` is the audio-module export the asset replaces; entries with
// no `call` are sounds the design asks for that nothing triggers yet.
// ---------------------------------------------------------------------------

const sfx = [
  // ---- Scene two: doors, motel fabric ----
  ['motel', 'doors', 'knock', 'knock_room_door', 'Three heavy sasquatch knuckles on a hollow motel door.', 1.2, 2],
  ['motel', 'doors', 'doorOpen', 'door_open', 'Cheap door opening on a dry hinge, chain rattling.', 1.0, 2],
  ['motel', 'doors', 'doorSlam', 'door_slam', 'Door slammed hard enough to move the frame.', 0.8, 3],
  ['motel', 'doors', 'lockClick', 'deadbolt', 'Deadbolt thrown, then the chain. The sound of a deal changing.', 0.7, 2],
  ['motel', 'doors', 'doorSplinter', 'door_splinter', 'Door leaving its frame with a body attached (Room Service).', 1.4, 2],
  ['motel', 'doors', 'windowSlide', 'window_slide', 'Bathroom window sliding open an inch and stopping.', 1.0, 2],

  // ---- Scene two: bodies and violence ----
  ['motel', 'combat', 'punch', 'punch_light', 'Fist into a torso. Close, wet, unglamorous.', 0.5, 4],
  ['motel', 'combat', 'punch', 'punch_heavy', 'Full sasquatch swing connecting. Deeper, with a wooden crack.', 0.7, 3],
  ['motel', 'combat', 'whiff', 'swing_whiff', 'A heavy arm moving through humid air and hitting nothing.', 0.4, 3],
  ['motel', 'combat', 'bodyFall', 'body_fall', 'A grown seller going down onto motel carpet.', 0.9, 3],
  ['motel', 'combat', 'gunshot', 'gunshot_revolver', 'Compact revolver in a small room: crack, then the room slapping back.', 1.4, 3],
  ['motel', 'combat', 'gunshot', 'gunshot_pistol', 'Enemy pistol, thinner and further away.', 1.2, 2],
  ['motel', 'combat', 'dryFire', 'dry_fire', 'Hammer on an empty chamber.', 0.3, 1],
  ['motel', 'combat', 'sliceWhir', 'meat_slicer_spin', 'Commercial meat slicer spinning up in a bathroom. Never reassuring.', 1.6, 2],
  ['motel', 'combat', 'prod', 'stun_prod', 'Stun prod arcing — dry electrical snap.', 0.6, 2],
  [null, 'combat', null, 'cleaver_swipe', 'Cleaver through air, ending in a chop into furniture.', 0.7, 2],
  ['motel', 'combat', 'grapple', 'grapple_struggle', 'Two heavy bodies wrestling, fabric and breath.', 2.5, 2, true],
  ['motel', 'combat', 'spice', 'spice_throw', 'A jar of classified seasoning thrown into somebody\'s eyes.', 0.8, 2],
  [null, 'combat', null, 'curtain_rip', 'Shower curtain and rod coming down over a man.', 1.0, 2],
  ['motel', 'combat', 'bodyFall', 'trip_fall', 'Somebody catching the sealer cord and hitting the floor.', 0.9, 2],

  // ---- Scene two: breaking things ----
  ['motel', 'destruction', 'glassSmash', 'glass_smash', 'Motel window going out onto concrete.', 1.6, 3],
  ['motel', 'destruction', 'glassSettle', 'glass_settle', 'Shards settling ten seconds after the smash.', 1.2, 2],
  ['motel', 'destruction', 'woodBreak', 'wood_break', 'Cheap table or railing giving up.', 0.9, 3],
  ['motel', 'destruction', 'crash', 'heavy_crash', 'Air-conditioning unit or car meeting the ground.', 1.8, 3],
  ['motel', 'destruction', 'tvBreak', 'tv_implode', 'A 1997 television taking a man and dying loudly.', 1.5, 2],
  ['motel', 'destruction', 'sparks', 'fan_sparks', 'Ceiling fan overspeeding and spitting sparks.', 2.0, 2],
  ['motel', 'destruction', 'neonShort', 'neon_short', 'Motel sign shorting out — bang, then the hum stops.', 2.2, 1],

  // ---- Scene two: the merchandise ----
  ['motel', 'jerky', 'packaging', 'vacuum_pack_handle', 'Vacuum-sealed foil being turned over in big hands.', 0.9, 4],
  ['motel', 'jerky', 'chew', 'jerky_chew', 'Somebody chewing evidence.', 1.4, 3],
  ['motel', 'jerky', 'bite', 'jerky_bite', 'One deliberate bite of the Reserve. The last sound of the scene.', 1.2, 2],
  [null, 'jerky', null, 'jerky_bend', 'A cured strip bent until the outer edge cracks.', 0.6, 3],
  ['motel', 'jerky', 'caseLatch', 'case_latches', 'Suitcase latches popping, lid lifting.', 1.0, 2],
  [null, 'jerky', null, 'wax_seal_break', 'A numbered wax seal broken off a package.', 0.5, 2],
  ['motel', 'jerky', 'fire', 'shipment_burn', 'Vacuum-sealed contraband meeting an open flame. Plastic first, then meat.', 3.0, 2],
  [null, 'jerky', null, 'vacuum_sealer_run', 'The counter sealer running a bag: pump, heat, click.', 2.6, 1],

  // ---- Scene two: motel soundscape one-shots ----
  ['motel', 'motel', 'tvStatic', 'tv_static', 'Television volume going up on nothing in particular.', 1.4, 2],
  ['motel', 'motel', 'iceDrop', 'ice_machine_drop', 'Ice machine dropping a load of cubes at the worst moment.', 1.8, 3],
  ['motel', 'motel', 'plumbing', 'plumbing_knock', 'Motel plumbing: a faucet running, then stopping too suddenly.', 2.4, 3],
  ['motel', 'motel', 'knifeTap', 'knife_tap', 'A knife tapping a laminate table, unhurried.', 1.2, 2],
  [null, 'motel', null, 'ceiling_fan_click', 'Uneven ceiling fan clicking once per rotation.', 0.4, 3, true],
  [null, 'motel', null, 'ac_drip', 'Air-conditioning unit dripping onto the walkway.', 0.5, 3],
  [null, 'motel', null, 'vending_hum_bump', 'Vending machine compressor kicking in.', 1.6, 2],
  ['motel', 'motel', 'alarm', 'office_alarm', 'The clerk\'s under-counter alarm. Cheap, insistent, effective.', 2.6, 1, true],

  // ---- Scene two: vehicles and outside ----
  ['motel', 'vehicles', 'carStart', 'car_start', 'Tired sedan turning over twice before it catches.', 2.0, 2],
  ['motel', 'vehicles', 'tires', 'tires_squeal', 'Tyres on warm asphalt leaving a motel lot.', 1.6, 3],
  ['motel', 'vehicles', 'siren', 'siren_distant', 'A siren somewhere else, getting interested.', 4.0, 2],
  ['motel', 'vehicles', 'siren', 'siren_close', 'The same siren, no longer somewhere else.', 4.0, 2],
  ['motel', 'vehicles', 'carDoor', 'car_door', 'Heavy car door opening and shutting.', 0.8, 3],
  [null, 'vehicles', null, 'engine_idle', 'The second car idling in the lot with nobody in it.', 6.0, 1, true],
  ['motel', 'vehicles', 'crash', 'car_ram', 'Two cars trading paint at speed.', 1.8, 3],

  // ---- Scene two: movement ----
  ['motel', 'footsteps', 'step', 'step_concrete', 'Sasquatch foot on cracked motel concrete.', 0.4, 6],
  ['motel', 'footsteps', 'step', 'step_carpet', 'Same foot on thin motel carpet.', 0.4, 6],
  ['motel', 'footsteps', 'step', 'step_tile', 'Same foot on bathroom tile.', 0.4, 6],
  ['motel', 'footsteps', 'step', 'step_asphalt', 'Same foot crossing the parking lot.', 0.4, 6],
  ['motel', 'footsteps', 'step', 'step_pool', 'Same foot on the painted floor of a drained pool.', 0.4, 4],
  ['motel', 'footsteps', 'step', 'stairs_metal', 'Exterior staircase taking more weight than it was built for.', 0.5, 4],
  ['motel', 'footsteps', 'land', 'land_heavy', 'Landing from the balcony or into the deep end.', 0.8, 3],
  ['motel', 'footsteps', 'tunnel', 'tunnel_crawl', 'Crawling through a wet drainage tunnel.', 3.0, 2],

  // ---- Scene two: interface ----
  ['motel', 'ui', 'blip', 'ui_line_blip', 'Per-line subtitle tick. Very quiet, very short.', 0.1, 3],
  ['motel', 'ui', 'select', 'ui_select', 'Dialogue option chosen.', 0.3, 1],
  ['motel', 'ui', 'objective', 'ui_objective', 'Objective updated.', 0.6, 1],
  ['motel', 'ui', 'achievement', 'ui_achievement', 'Achievement unlocked — brass, brief, pleased with itself.', 1.2, 1],
  ['motel', 'ui', 'sting', 'scene_end_sting', 'End-of-scene sting: minor, humid, unresolved.', 2.4, 1],

  // ---- Scene one: campground rampage ----
  ['campground', 'combat', 'smash', 'smash_impact', 'Sasquatch double-fist slam into a structure.', 0.8, 4],
  ['campground', 'combat', 'crack', 'structure_crack', 'Non-final hit: wood and panel cracking.', 0.5, 4],
  ['campground', 'combat', 'whiff', 'swing_whiff_outdoor', 'Arms through open air.', 0.4, 3],
  ['campground', 'combat', 'clang', 'fist_on_rock', 'Fist meets boulder. Rock wins.', 0.5, 3],
  ['campground', 'combat', 'stomp', 'ground_stomp', 'Both feet down: a shockwave with dirt in it.', 1.0, 3],
  ['campground', 'combat', 'squish', 'camper_squish', 'A camper ceasing to be a camper.', 0.6, 4],
  ['campground', 'combat', 'boom', 'vehicle_explosion', 'Car or RV going up.', 2.0, 3],
  ['campground', 'movement', 'step', 'step_forest', 'Heavy footfall on pine needles and dirt.', 0.4, 6],
  ['campground', 'creatures', 'scream', 'camper_scream', 'Panicked camper doppler-ing away.', 1.2, 5],
  ['campground', 'creatures', 'roar', 'sasquatch_roar', 'The roar. Chest, gravel, and a little bit of grief.', 1.6, 3],
  ['campground', 'creatures', 'buzz', 'bee_swarm', 'Beehive alumni looking for someone to blame.', 2.0, 2, true],
  ['campground', 'rangers', 'dart', 'tranq_fire', 'Tranquiliser rifle: compressed air, no bang.', 0.4, 3],
  ['campground', 'rangers', 'dartHit', 'tranq_hit', 'Dart finding fur.', 0.5, 3],
  ['campground', 'ui', 'chime', 'time_bonus', 'Golden cooler: seconds added to the clock.', 0.8, 1],
  ['campground', 'ui', 'powerup', 'powerup_collect', 'Power-up collected.', 0.6, 1],
  ['campground', 'ui', 'frenzyJingle', 'final_frenzy', 'Final frenzy alarm: everything is worth double.', 1.2, 1],
  ['campground', 'ui', 'sting', 'run_end_sting', 'End-of-run sting.', 2.0, 1],
];

const ambience = [
  ['motel', 'amb_neon_hum', 'Buzzing pink motel sign. Mains hum with a thin harmonic on top.', 30],
  ['motel', 'amb_ac_rattle', 'A wall air-conditioner running badly, with a loose panel.', 30],
  ['motel', 'amb_night_traffic', 'Distant road, insects, warm wind through palms.', 45],
  ['motel', 'amb_room_tone', 'Inside room twelve: fan, television murmur, plumbing, nobody breathing normally.', 30],
  ['motel', 'amb_tv_murmur', 'Muffled late-night television through a wall.', 30],
  ['motel', 'amb_pool_bottom', 'Down in the drained pool: enclosed, dead, dripping.', 20],
  ['motel', 'amb_alley', 'Rear alley: extractor fan, dumpster metal ticking as it cools.', 20],
  ['motel', 'amb_tension_pulse', 'The suspicion bed. A low pulse that speeds up as the room turns.', 30],
  ['campground', 'amb_forest_day', 'Campground afternoon: birds, wind in pines, a distant generator.', 45],
];

const music = [
  ['motel', 'mus_deal_tense', 'Under the deal: minimal, humid, two notes and a lot of patience.', 90],
  ['motel', 'mus_fight', 'The room goes: fast percussion, brass stabs, distorted guitar, clave. Original — no film score.', 120],
  ['motel', 'mus_chase', 'The getaway: same band, faster, driving bass, siren-shaped topline.', 120],
  ['campground', 'mus_rampage', 'Scene one groove: four-on-the-floor, square bass riff, sparse lead.', 120],
];

// ---------------------------------------------------------------------------

function buildQueue(dialogue) {
  const q = {
    schemaVersion: 1,
    purpose: 'Every sound SquatchSmash needs. All cues are procedural WebAudio today; '
      + 'these ids are the brief for produced audio, and the drop-in points once it exists.',
    conventions: {
      format: '48 kHz mono WAV for one-shots, 48 kHz stereo for music and ambience loops',
      naming: 'audio/<scene>/<category>/<file>[_NN].wav — NN is the variation index, 01-based',
      loops: 'entries marked loop:true must be seamless',
      status: "todo | recorded | in-game — update as assets land",
    },
    sfx: [], ambience: [], music: [], voice: [],
  };

  for (const [scene, category, call, file, description, seconds, variations, loop] of sfx) {
    q.sfx.push({
      id: `${scene || 'motel'}.${category}.${file}`,
      scene: scene || 'motel',
      category,
      file: `audio/${scene || 'motel'}/${category}/${file}.wav`,
      call: call || null,
      description,
      seconds,
      variations: variations || 1,
      loop: !!loop,
      status: 'todo',
    });
  }
  for (const [scene, file, description, seconds] of ambience) {
    q.ambience.push({
      id: `${scene}.ambience.${file}`, scene, file: `audio/${scene}/ambience/${file}.wav`,
      description, seconds, loop: true, status: 'todo',
    });
  }
  for (const [scene, file, description, seconds] of music) {
    q.music.push({
      id: `${scene}.music.${file}`, scene, file: `audio/${scene}/music/${file}.wav`,
      description, seconds, loop: true, status: 'todo',
    });
  }

  // Voice lines are pulled straight from the dialogue module so the queue can
  // never drift from what the scene actually says.
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
  const pushLine = (speaker, line, context) => {
    if (!speaker || speaker === '*' || !line) return;
    q.voice.push({
      id: `vo.${slug(speaker)}.${slug(line)}`,
      speaker,
      line,
      context,
      file: `audio/motel/voice/${slug(speaker)}/${slug(line)}.wav`,
      status: 'todo',
    });
  };

  for (const [nodeId, node] of Object.entries(dialogue.NODES)) {
    pushLine(node.speaker, node.line, `dialogue node "${nodeId}" — prompt`);
    for (const extra of ['prospect', 'prospect2', 'chino']) {
      if (node[extra]) pushLine(node[extra][0], node[extra][1], `dialogue node "${nodeId}" — ${extra}`);
    }
    for (const [style, opt] of Object.entries(node.options || {})) {
      pushLine('Prospect', opt.text, `dialogue node "${nodeId}" — ${style} answer`);
      if (opt.reply) pushLine(opt.reply[0], opt.reply[1], `dialogue node "${nodeId}" — reply to ${style}`);
    }
  }
  for (const [who, line] of dialogue.SELLER_BARKS) pushLine(who, line, 'ambient seller bark in room twelve');
  for (const line of dialogue.PROSPECT_BARKS) pushLine('Prospect', line, 'ambient Prospect bark');
  for (const line of dialogue.MANNY_BARKS) pushLine('Manny', line, 'ambient Manny bark in the lot');
  for (const [who, line] of dialogue.FIGHT_BARKS) pushLine(who, line, 'combat bark');
  for (const line of dialogue.MANNY_FIGHT_BARKS) pushLine('Manny', line, 'Manny combat bark');
  for (const [who, line] of dialogue.ENDING) pushLine(who, line, 'closing exchange on the road');

  // De-duplicate identical lines (barks repeat across contexts)
  const seen = new Set();
  q.voice = q.voice.filter((v) => (seen.has(v.id) ? false : seen.add(v.id)));

  q.counts = {
    sfx: q.sfx.length, ambience: q.ambience.length, music: q.music.length, voice: q.voice.length,
    total: q.sfx.length + q.ambience.length + q.music.length + q.voice.length,
  };
  return q;
}

// ---- Coverage check: every sfx.<name>() in the source needs an entry ----
function sourceCues() {
  const found = new Map(); // name -> files
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith('.js')) {
        const src = readFileSync(p, 'utf8');
        for (const m of src.matchAll(/\bsfx\.([a-zA-Z0-9_]+)/g)) {
          const name = m[1];
          if (!found.has(name)) found.set(name, new Set());
          found.get(name).add(p.replace(root + '/', ''));
        }
      }
    }
  };
  walk(join(root, 'src'));
  return found;
}

// Cues that are plumbing, not sounds.
const NON_AUDIO_EXPORTS = new Set([
  'init', 'resume', 'setMuted', 'isMuted', 'setMusic', 'stopMusic', 'startMusic',
  'startAmbience', 'stopAmbience', 'setTension', 'shutdown',
]);

const dialogue = await import(join(root, 'src', 'motel', 'dialogue.js'));
const queue = buildQueue(dialogue);

const cues = sourceCues();
const queued = new Set(queue.sfx.map((s) => s.call).filter(Boolean));
const missing = [];
for (const [name, files] of cues) {
  if (NON_AUDIO_EXPORTS.has(name)) continue;
  if (!queued.has(name)) missing.push(`${name}  (called from ${[...files].join(', ')})`);
}
const orphans = [...queued].filter((c) => !cues.has(c));

if (!checkOnly) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(queue, null, 2)}\n`);
  console.log(`wrote ${OUT.replace(root + '/', '')}`);
}
console.log(`queue: ${queue.counts.sfx} sfx · ${queue.counts.ambience} ambience · `
  + `${queue.counts.music} music · ${queue.counts.voice} voice lines (${queue.counts.total} assets)`);
console.log(`unqueued design sounds (no code hook yet): ${queue.sfx.filter((s) => !s.call).length}`);

if (missing.length) {
  console.error(`\nMISSING from the queue — code plays these with nothing briefed:\n  ${missing.join('\n  ')}`);
}
if (orphans.length) {
  console.error(`\nQueued cues that no longer exist in code:\n  ${orphans.join('\n  ')}`);
}
if (missing.length || orphans.length) process.exit(1);
console.log('coverage: every cue played by the code has a queue entry ✓');
