#!/usr/bin/env node
/**
 * Promote the Motel and Campground sound briefs into the shared manifest.
 *
 *   npm run sfx:legacy         -> synchronize the promoted cues
 *   npm run check:legacy-sfx   -> report missing/stale/drifted cues
 *   npm run sfx                -> renders them, once they are in there
 *
 * WHY THIS EXISTS. `assets/audio/sound-queue.json` has described every noise
 * the Jerky Motel and the campground rampage make since before the shared
 * manifest existed -- a name, a paragraph of direction and a duration for each
 * one -- and `assets/audio/README.md` has said the same thing about them the
 * whole time:
 *
 *   > Its `audio/.../*.wav` paths are production-design targets, not files the
 *   > current runtime loads. Reconcile and promote an approved brief to the
 *   > shared manifest first.
 *
 * Nobody ever did the promoting, so `src/motel/audio.js` and `game/src/audio.js`
 * have been synthesising sixty described sounds out of two oscillators and a
 * noise buffer. This is `tools/mansion-sfx.mjs` for the two oldest procedural
 * systems in the repo, and it keeps that file's rules: the brief is the source,
 * and a cue this table claims must still exist in the queue with a code hook.
 *
 * What it deliberately does NOT promote, and why:
 *
 *   - Briefs whose function already prefers a recording (`lockClick` has
 *     `door.locked`, `carStart` has `car.engine.start`, and so on). Sixteen of
 *     them. A second cue for a sound that already plays is a second sound.
 *   - `motel.combat.trip_fall`, which calls the same argument-less `bodyFall()`
 *     as `motel.combat.body_fall`. Two briefs, one code path, one cue.
 *   - `motel.ui.ui_line_blip` (0.1s) and `motel.ui.ui_select` (0.3s). Both sit
 *     under the sound API's 0.5s floor, and a per-line subtitle tick is exactly
 *     the "anything a generator would do worse" that `tools/generate-sfx.mjs`
 *     skips on purpose. The oscillator keeps them.
 *   - `dryFire`, `glassSmash` and `caseLatch`, which are wired to `gun.dry`,
 *     `siege.glass.shatter` and `silent.case.latches` instead. Those takes are
 *     already on disk and they are the same sound.
 *   - `motel.footsteps.step_concrete`, which `footstep.concrete` already
 *     covers, take and all. This table briefly redefined that cue's prompt to
 *     describe a barefoot sasquatch, which would have left the manifest
 *     describing a recording nobody was going to make again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');
const QUEUE = path.join(ROOT, 'assets/audio/sound-queue.json');

/**
 * The promotion table: `[manifest name, prompt, seconds, brief id]`.
 *
 * The brief id is not decoration. `checkLegacySfxManifest` looks every one of
 * them up in `sound-queue.json` and fails if the brief has gone or lost its
 * code hook, so a cue cannot outlive the sound it was promoted for.
 *
 * Durations come from the brief. Anything the brief put below the API's 0.5s
 * floor is raised to 0.5 here rather than silently clipped by the service.
 */
const CUES = Object.freeze([
  // ---- Motel: doors ----
  ['door.knock.motel', 'three heavy slow knuckle knocks on a hollow-core motel door, close mic, dry interior corridor, no voice', 1.2, 'motel.doors.knock_room_door'],
  ['door.open.motel', 'cheap interior door opening on a dry unoiled hinge, thin security chain rattling against the frame, close, no voice', 1.0, 'motel.doors.door_open'],
  ['door.slam', 'lightweight interior door slammed hard, sharp wooden crack and the frame rattling afterwards, small room, no voice', 0.8, 'motel.doors.door_slam'],
  ['door.splinter', 'a door torn out of its frame, wood splintering and screws tearing free, heavy weight following it to the floor, no voice', 1.4, 'motel.doors.door_splinter'],
  ['window.slide', 'a small aluminium bathroom window sliding open a few inches on gritty runners and stopping hard, close mic, no voice', 1.0, 'motel.doors.window_slide'],

  // ---- Motel: combat ----
  ['punch.light', 'a bare fist landing flat on a human torso, close and dull with a soft cloth impact, no music, no voice', 0.5, 'motel.combat.punch_light'],
  ['punch.heavy', 'an enormous full-weight punch connecting with a body, deep low thud with a dry wooden crack inside it, no music, no voice', 0.7, 'motel.combat.punch_heavy'],
  ['swing.whiff', 'a heavy arm swinging fast through still humid air and hitting nothing, low airy whoosh, close, no voice', 0.5, 'motel.combat.swing_whiff'],
  ['body.fall.carpet', 'a large adult body dropping limp onto thin motel carpet over concrete, dull heavy thud with a small fabric rustle, no voice', 0.9, 'motel.combat.body_fall'],
  ['slicer.spin', 'a commercial deli meat slicer motor spinning up, blade whine rising then holding steady, tiled room, no voice', 1.6, 'motel.combat.meat_slicer_spin'],
  ['stunprod.arc', 'a stun prod arcing, dry high-voltage electrical snapping and crackling in short bursts, close, no voice', 0.6, 'motel.combat.stun_prod'],
  ['grapple.struggle', 'two heavy bodies wrestling and shoving against each other, clothing scuffing, strained breathing, feet dragging on carpet', 2.5, 'motel.combat.grapple_struggle'],
  ['spice.throw', 'a glass jar of dry ground spice thrown open, powder bursting into the air in a dry hiss, glass jar clattering away, no voice', 0.8, 'motel.combat.spice_throw'],

  // ---- Motel: destruction ----
  ['glass.settle', 'the last broken window shards sliding loose and tinkling down onto concrete, sparse and delicate, no voice', 1.2, 'motel.destruction.glass_settle'],
  ['wood.break', 'a cheap pine table leg snapping under weight, single dry splintering crack with a short debris rattle, no voice', 0.9, 'motel.destruction.wood_break'],
  ['tv.implode', 'an old CRT television destroyed, thick glass tube imploding into a muffled inward whump, sparks and plastic casing cracking, no voice', 1.5, 'motel.destruction.tv_implode'],
  ['fan.sparks', 'an overspeeding ceiling fan motor whining and spitting electrical sparks, intermittent bright snaps over a straining hum, no voice', 2.0, 'motel.destruction.fan_sparks'],
  ['neon.short', 'a neon motel sign shorting out, sharp electrical bang then the transformer hum falling away to silence, exterior night, no voice', 2.2, 'motel.destruction.neon_short'],

  // ---- Motel: jerky ----
  ['vacuum.pack.handle', 'a stiff vacuum-sealed foil food pouch being turned over and gripped in large hands, crisp plastic crackling, close mic, no voice', 0.9, 'motel.jerky.vacuum_pack_handle'],
  ['jerky.chew', 'someone chewing a tough piece of dried meat, wet muffled mastication, close and unglamorous, no voice', 1.4, 'motel.jerky.jerky_chew'],
  ['jerky.bite', 'one deliberate bite tearing through a strip of dried jerky, dry fibrous rip then slow chewing, close mic, no voice', 1.2, 'motel.jerky.jerky_bite'],
  ['shipment.burn', 'vacuum-sealed plastic packaging catching fire and shrivelling, then fat rendering and meat spitting into an open flame, no voice', 3.0, 'motel.jerky.shipment_burn'],

  // ---- Motel: the building ----
  ['tv.static', 'an old television tuned to dead air, harsh white noise static swelling as the volume is turned up, small room, no voice', 1.4, 'motel.motel.tv_static'],
  ['knife.tap', 'the flat of a kitchen knife tapping slowly and evenly on a cheap laminate table, unhurried, close mic, no voice', 1.2, 'motel.motel.knife_tap'],
  ['alarm.counter', 'a cheap battery-powered under-counter panic alarm, insistent shrill repeating electronic buzz, small office, no voice', 2.6, 'motel.motel.office_alarm'],

  // ---- Motel: vehicles ----
  ['siren.distant', 'a single police siren several streets away at night, thin and reverberant between buildings, no traffic, no voice', 4.0, 'motel.vehicles.siren_distant'],
  ['siren.close', 'a police siren arriving fast and close, loud wailing with engine noise underneath, exterior parking lot, no voice', 4.0, 'motel.vehicles.siren_close'],

  // ---- Motel: movement ----
  ['footstep.asphalt', 'one heavy barefoot step on warm asphalt parking lot, soft tacky slap with loose grit, exterior, no voice', 0.5, 'motel.footsteps.step_asphalt'],
  ['land.heavy', 'an enormous heavy body landing from a two storey drop onto concrete, deep impact thud with a low rumble tail, no voice', 0.8, 'motel.footsteps.land_heavy'],
  ['tunnel.crawl', 'a large body crawling through a wet concrete drainage tunnel, hands and knees in shallow water, close confined echo, no voice', 3.0, 'motel.footsteps.tunnel_crawl'],

  // ---- Motel: interface ----
  ['ui.objective', 'a short soft two-note electronic confirmation tone, clean and quiet, notification style, no music bed', 0.6, 'motel.ui.ui_objective'],
  ['ui.achievement', 'a brief warm brass fanfare flourish, three notes, pleased with itself, dry and small, no reverb tail', 1.2, 'motel.ui.ui_achievement'],
  ['sting.scene.end', 'a short minor-key orchestral sting, humid and unresolved, low strings with a muted brass swell that stops without landing', 2.4, 'motel.ui.scene_end_sting'],

  // ---- Campground: combat ----
  ['smash.structure', 'an enormous double-fisted slam into a wooden building, timber and panelling caving in, debris scattering, outdoor, no voice', 0.8, 'campground.combat.smash_impact'],
  ['structure.crack', 'wooden wall panelling cracking and buckling under a heavy blow without collapsing, single dry split, outdoor, no voice', 0.5, 'campground.combat.structure_crack'],
  ['swing.whiff.outdoor', 'huge arms swinging through open outdoor air and hitting nothing, broad low whoosh, forest clearing, no voice', 0.5, 'campground.combat.swing_whiff_outdoor'],
  ['fist.on.rock', 'a heavy fist striking solid granite boulder, dull stone impact with a sharp rock chip crack, outdoor, no voice', 0.5, 'campground.combat.fist_on_rock'],
  ['ground.stomp', 'both enormous feet slamming down on packed forest dirt together, deep shockwave thud with soil and gravel scattering, no voice', 1.0, 'campground.combat.ground_stomp'],
  ['camper.squish', 'a wet heavy crushing impact, short and blunt, damp organic squelch, outdoor, no voice, no scream', 0.6, 'campground.combat.camper_squish'],
  ['vehicle.explosion', 'a car fuel tank exploding, sharp ignition crack into a deep booming fireball with metal debris raining down, outdoor, no voice', 2.0, 'campground.combat.vehicle_explosion'],

  // ---- Campground: movement ----
  ['footstep.forest', 'one heavy footfall on dry pine needles and forest dirt, soft crunch with twigs snapping underneath, outdoor, no voice', 0.5, 'campground.movement.step_forest'],

  // ---- Campground: creatures ----
  ['camper.scream', 'a panicked adult screaming and running away at speed, voice dopplering off into the distance, forest, terrified', 1.2, 'campground.creatures.camper_scream'],
  ['sasquatch.roar', 'an enormous ape creature roaring, deep chest resonance with a gravelly torn edge and a mournful falling tail, outdoor forest', 1.6, 'campground.creatures.sasquatch_roar'],
  ['bee.swarm', 'an angry swarm of hundreds of bees, dense chaotic buzzing rising and moving past the listener, outdoor, no voice', 2.0, 'campground.creatures.bee_swarm'],

  // ---- Campground: rangers ----
  ['tranq.fire', 'a compressed air tranquiliser rifle firing, sharp pneumatic thump and hiss, no gunpowder bang, outdoor, no voice', 0.5, 'campground.rangers.tranq_fire'],
  ['tranq.hit', 'a tranquiliser dart thudding into thick fur and muscle, soft dull puncture with a small feathered flick, no voice', 0.5, 'campground.rangers.tranq_hit'],

  // ---- Campground: interface ----
  ['ui.time.bonus', 'a bright ascending three-note chime, clean and golden, arcade reward tone, dry, no music bed', 0.8, 'campground.ui.time_bonus'],
  ['ui.powerup', 'a short rising electronic power-up sweep, bright and synthetic, arcade pickup, dry, no music bed', 0.6, 'campground.ui.powerup_collect'],
  ['ui.goal.complete', 'a single bright confirmation ding with a short bell tail, cutting and readable over noise, arcade style, no music bed', 0.8, 'campground.ui.goal_complete'],
  ['ui.final.frenzy', 'an urgent repeating arcade alarm jingle, bright synth stabs over a klaxon pulse, escalating, exciting, no voice', 1.2, 'campground.ui.final_frenzy'],
  ['sting.run.end', 'a short descending orchestral end-of-round sting, brass and low strings resolving downward, dry and brief', 2.0, 'campground.ui.run_end_sting'],

  // ---- Campground: boss ----
  ['boss.hit', 'a heavy armoured body absorbing a huge blow, dense padded impact with body armour plates knocking together, no voice', 0.7, 'campground.boss.boss_hit'],
  ['boss.down', 'an armoured body collapsing to the ground, plates and webbing clattering, followed by a short bright victory accent', 1.4, 'campground.boss.boss_down'],
]);

/** The cue table in manifest shape. */
export function legacySfxCues() {
  return CUES.map(([name, prompt, duration]) => ({ name, duration, prompt }));
}

/** Every manifest name this tool owns. */
export function legacySfxNames() {
  return new Set(CUES.map(([name]) => name));
}

/** An updated manifest, without mutating or writing the input. */
export function syncLegacySfxManifest(manifest, cues = legacySfxCues()) {
  const owned = legacySfxNames();
  const kept = (manifest.sfx || []).filter((cue) => !owned.has(cue.name));
  return { ...manifest, sfx: [...kept, ...cues] };
}

/**
 * Drift between this table, the manifest, and the briefs, as a list of reasons.
 *
 * The brief check is the one that matters: a promoted cue whose brief has lost
 * its `call` is a recording nothing plays, and the whole point of promoting was
 * that a described sound and a sounding sound should be the same list.
 */
export function checkLegacySfxManifest(manifest, queue, cues = legacySfxCues()) {
  const failures = [];
  const briefs = new Map((queue.sfx || []).map((entry) => [entry.id, entry]));

  const expected = new Map();
  for (const cue of cues) {
    if (expected.has(cue.name)) failures.push(`duplicate promoted cue ${cue.name}`);
    expected.set(cue.name, cue);
  }
  for (const [name, , , briefId] of CUES) {
    const brief = briefs.get(briefId);
    if (!brief) failures.push(`${name} promotes ${briefId}, which is not in the queue`);
    else if (!brief.call) failures.push(`${name} promotes ${briefId}, which has lost its code hook`);
  }

  const declared = new Map();
  for (const cue of (manifest.sfx || []).filter((entry) => expected.has(entry.name))) {
    if (declared.has(cue.name)) failures.push(`duplicate manifest cue ${cue.name}`);
    else declared.set(cue.name, cue);
  }
  for (const [name, cue] of expected) {
    const actual = declared.get(name);
    if (!actual) { failures.push(`missing cue ${name}`); continue; }
    if (actual.prompt !== cue.prompt) failures.push(`drifted prompt ${name}`);
    if (actual.duration !== cue.duration) failures.push(`drifted duration ${name}`);
    /* A promoted effect with a voice is a line of dialogue filed as a noise. */
    if (actual.voice || actual.say) failures.push(`${name} is cast to a voice`);
    /* The API refuses anything under half a second, and a clipped cue comes
     * back as a success with the wrong sound in it. */
    if (!(actual.duration >= 0.5)) failures.push(`${name} is under the 0.5s floor`);
  }
  return failures;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const queue = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
  const cues = legacySfxCues();

  if (process.argv.includes('--check')) {
    const failures = checkLegacySfxManifest(manifest, queue, cues);
    if (failures.length) {
      failures.forEach((failure) => console.error(`FAIL ${failure}`));
      console.error(`${failures.length} promoted sound problem(s). Run \`npm run sfx:legacy\`.`);
      process.exitCode = 1;
    } else {
      console.log(`Promoted Motel and Campground sound manifest matches ${cues.length} cue(s).`);
    }
    return;
  }

  const owned = legacySfxNames();
  const dropped = (manifest.sfx || []).filter((cue) => owned.has(cue.name)).length;
  fs.writeFileSync(MANIFEST, `${JSON.stringify(syncLegacySfxManifest(manifest, cues), null, 2)}\n`);
  const motel = CUES.filter(([, , , id]) => id.startsWith('motel.')).length;
  console.log(`${cues.length} promoted sound cue(s) in the manifest`
    + `${dropped ? ` (replaced ${dropped})` : ''} — ${motel} Motel, ${cues.length - motel} Campground.`);
  console.log('\nRun `npm run audio:todo` for the recording sheet, and `npm run sfx` to render them.');
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
