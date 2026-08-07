#!/usr/bin/env node
/**
 * "Anywhere there are lines for a character, is that character in the
 * scene? They need to be." -- owner, 2026-08-06 playtest
 * (docs/audits/2026-08-06/PLAYTEST-PUNCH-LIST.md, item X1).
 *
 *   npm run check:line-presence
 *
 * The known offender that prompted this: Snow has lab clean-up lines in
 * PROJECT SILENT SQUATCH ("Snow. Basement." / "I told you not to make more
 * work for me.") but cast.js never builds or moves a body into the lab or
 * the basement stairs to say them -- see PLAYTEST-PUNCH-LIST.md S10. This
 * tool is the machine that catches the WHOLE CLASS, not just that instance.
 *
 * ## How the mapping works
 *
 * 1. SOURCE OF TRUTH FOR LINES: `assets/sfx/manifest.json`'s `sfx` array,
 *    filtered to cues with both a `say` (words) and a `voice` (a cast
 *    profile) -- exactly `voice-needed.mjs`'s definition of a spoken line.
 * 2. SCENE MAPPING: each cue's name prefix maps to one scene, the same
 *    convention `voice-needed.mjs` and every `tools/*-vo.mjs` generator
 *    already use (`vo.nowake.*` -> NO WAKE, `heist.*` -> THE TAKE, etc).
 *    The table lives in `tools/scene-casts.json` rather than duplicated
 *    here, alongside each scene's staged cast.
 * 3. STAGED CAST: `tools/scene-casts.json`'s `staged` list per scene -- who
 *    has an actual built body somewhere in that scene. Hand-authored by
 *    reading each scene's own cast/mount source (see that file's header for
 *    why this cannot be reliably derived by pattern-matching across a
 *    codebase that stages people at least four different ways).
 * 4. EXEMPTIONS (below): voices that legitimately speak with no body on
 *    screen -- phone calls, radio/PA/TV, a lab annunciator, a narrator.
 *    Three tiers, from broadest to narrowest; see each table's own comment.
 * 5. A voice with lines in a scene, not exempt and not in that scene's
 *    `staged` list, is a VIOLATION: "voice X has N lines in scene Y but no
 *    staged character."
 *
 * `npm run check` runs this as part of its composite; `npm test` covers the
 * mapping logic in `tests/check-line-presence.test.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'assets/sfx/manifest.json');
const SCENE_CASTS_PATH = path.join(ROOT, 'tools/scene-casts.json');

/* ================================================================== */
/* EXEMPTIONS -- every voice that is allowed to have zero staged body.  */
/*                                                                       */
/* Three tiers, checked in this order, each narrower than the last.      */
/* ================================================================== */

/**
 * TIER 1 -- globally exempt voice ids, in every scene, no matter the cue.
 *
 * `player` is Tony -- the camera, first-person, in every scene by
 * construction. A line voiced `player` is always "staged": it is coming out
 * of the person holding the controller.
 */
export const GLOBAL_EXEMPT_VOICES = Object.freeze(['player']);

/**
 * TIER 2 -- globally exempt CUE-NAME PREFIXES, in every scene.
 *
 * These are the classes the owner named outright: "phone calls (vo.call.*),
 * radio/PA/TV voices, narrator." A cue on one of these prefixes was AUTHORED
 * as a call, a broadcast or an announcement -- the source of the voice is
 * the device, not a body in the room, by the cue's own naming convention.
 *
 *   vo.call.*     -- every phone call in the game (src/core/phone.js).
 *   vo.machine.*  -- the answering machine.
 *   vo.news.*     -- the apartment TV/radio news.
 *   radio.*       -- the in-game radio station(s): idents, DJ patter, every
 *                    show's dialogue (src/core/stations.js). A radio host
 *                    reading his own patter is a PA voice even when the
 *                    same actor also has a body elsewhere in the game.
 */
export const GLOBAL_EXEMPT_PREFIXES = Object.freeze([
  'vo.call.',
  'vo.machine.',
  'vo.news.',
  'radio.',
]);

/**
 * TIER 3 -- individually named cues that are exempt despite belonging to a
 * voice that otherwise HAS a staged body in that scene.
 *
 * Kept to a handful, on purpose: this is for the rare line whose own text or
 * context marks it as a call/broadcast even though its cue sits on the
 * scene's own prefix rather than on `vo.call.`/`radio.` etc. If this list
 * ever needs more than a few entries, that is a sign the scene should mint
 * its "opening call" cues onto `vo.call.*` like everyone else instead.
 *
 * Each entry is `{ includes, reason }`; a cue name matches if it CONTAINS
 * `includes`.
 */
export const CUE_SUBSTRING_EXEMPTIONS = Object.freeze([
  {
    includes: 'vo.enolasquatch.lou.call-opening',
    reason: "The pre-flight telephone call ('Remember that little delivery "
      + "flight?') -- src/enolasquatch/dialogue/script.js's 'call.opening' "
      + 'beat, played before the hangar scene opens. Minted onto '
      + "vo.enolasquatch.* by tools/enolasquatch-vo.mjs's generator instead "
      + 'of vo.call.* like the rest of the game\'s calls, so it needs naming '
      + 'here rather than being caught by the global prefix exemption.',
  },
]);

/* ================================================================== */
/* ALLOWLIST -- accepted, deliberate exceptions to "staged or exempt".   */
/*                                                                        */
/* For a violation the owner has SEEN and decided to accept permanently   */
/* (not "somebody is already fixing it" -- see the note below). Empty by   */
/* design: every violation this tool currently finds is either being fixed */
/* elsewhere or is a genuine new finding from this first run. Shape:        */
/*   { scene: '<tools/scene-casts.json id>', voice: '<profile id>',         */
/*     reason: '<why this is intentional, not a bug>' }                     */
/*                                                                            */
/* SNOW IS DELIBERATELY NOT HERE. His PROJECT SILENT SQUATCH lab lines are   */
/* the known offender this tool was built to catch                          */
/* (docs/audits/2026-08-06/PLAYTEST-PUNCH-LIST.md S10/X1) and a parallel     */
/* agent is fixing the scene, not this tool. Allowlisting him would hide     */
/* the exact regression this tool exists to catch the next time somebody     */
/* moves his post() call. Add him here ONLY if the owner decides, after the  */
/* fix, that some remaining Snow line in this scene is intentionally         */
/* bodiless -- and cite the decision, not just "known issue".                */
/* ================================================================== */
export const ALLOWLIST = Object.freeze([]);

/* ================================================================== */
/* Mechanics                                                             */
/* ================================================================== */

export function loadSceneCasts(scenePath = SCENE_CASTS_PATH) {
  const data = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
  return data.scenes;
}

/** Every cue in the manifest that is actually a spoken line. */
export function spokenCues(manifest) {
  return (manifest.sfx || [])
    .filter((cue) => typeof cue.say === 'string' && cue.say.trim())
    .filter((cue) => typeof cue.voice === 'string' && cue.voice.trim());
}

function matchesAnyPrefix(name, prefixes) {
  return prefixes.some((prefix) => name.startsWith(prefix));
}

/**
 * Which scene a cue belongs to, by its name prefix. Scenes are checked in
 * declaration order; if more than one scene's prefixes match the same cue,
 * that is a configuration bug in scene-casts.json (two scenes claiming the
 * same cue namespace) and is reported rather than silently resolved by
 * order, so it cannot hide a real scene behind another one's cast.
 */
export function sceneForCue(name, scenes) {
  const matches = scenes.filter((scene) => matchesAnyPrefix(name, scene.cuePrefixes));
  if (matches.length > 1) {
    throw new Error(`cue "${name}" matches more than one scene's cuePrefixes: `
      + `${matches.map((s) => s.id).join(', ')} -- fix tools/scene-casts.json`);
  }
  return matches[0] || null;
}

function isCueSubstringExempt(name) {
  return CUE_SUBSTRING_EXEMPTIONS.find((entry) => name.includes(entry.includes)) || null;
}

function isAllowlisted(sceneId, voice) {
  return ALLOWLIST.find((entry) => entry.scene === sceneId && entry.voice === voice) || null;
}

/**
 * Run the whole check.
 *
 * @param {object} manifest   parsed assets/sfx/manifest.json
 * @param {object[]} scenes   tools/scene-casts.json's `scenes` array
 * @returns {{
 *   violations: {scene:string, sceneId:string, voice:string, count:number, cues:string[]}[],
 *   allowlisted: {scene:string, voice:string, count:number, reason:string}[],
 *   unmapped: {name:string, voice:string}[],
 *   sceneSummary: {sceneId:string, label:string, voices:number, violations:number}[],
 * }}
 */
export function findViolations(manifest, scenes) {
  const cues = spokenCues(manifest);
  const unmapped = [];
  /* scene id -> voice -> cue[] */
  const byScene = new Map();

  for (const cue of cues) {
    if (GLOBAL_EXEMPT_VOICES.includes(cue.voice)) continue;
    if (matchesAnyPrefix(cue.name, GLOBAL_EXEMPT_PREFIXES)) continue;
    if (isCueSubstringExempt(cue.name)) continue;

    const scene = sceneForCue(cue.name, scenes);
    if (!scene) { unmapped.push({ name: cue.name, voice: cue.voice }); continue; }

    if (scene.staged.includes(cue.voice)) continue;
    if (scene.sceneVoiceExemptions?.[cue.voice]) continue;

    if (!byScene.has(scene.id)) byScene.set(scene.id, new Map());
    const byVoice = byScene.get(scene.id);
    if (!byVoice.has(cue.voice)) byVoice.set(cue.voice, []);
    byVoice.get(cue.voice).push(cue.name);
  }

  const violations = [];
  const allowlisted = [];
  for (const [sceneId, byVoice] of byScene) {
    const scene = scenes.find((s) => s.id === sceneId);
    for (const [voice, cueNames] of byVoice) {
      const allow = isAllowlisted(sceneId, voice);
      const row = {
        scene: scene.label, sceneId, voice, count: cueNames.length, cues: cueNames.sort(),
      };
      if (allow) allowlisted.push({ ...row, reason: allow.reason });
      else violations.push(row);
    }
  }
  violations.sort((a, b) => a.scene.localeCompare(b.scene) || b.count - a.count);

  const sceneSummary = scenes.map((scene) => {
    const voices = new Set();
    for (const cue of cues) {
      if (sceneForCueSafe(cue.name, scenes)?.id === scene.id) voices.add(cue.voice);
    }
    return {
      sceneId: scene.id,
      label: scene.label,
      voices: voices.size,
      violations: violations.filter((v) => v.sceneId === scene.id).length,
    };
  });

  return {
    violations, allowlisted, unmapped, sceneSummary,
  };
}

/** `sceneForCue` without throwing, for the summary pass (which does not
 * need to re-flag a collision the main pass already reported). */
function sceneForCueSafe(name, scenes) {
  try { return sceneForCue(name, scenes); } catch { return null; }
}

/* ================================================================== */
/* Reporting                                                             */
/* ================================================================== */

export function formatReport({
  violations, allowlisted, unmapped, sceneSummary,
}) {
  const out = [];
  out.push('Line presence — every spoken cue checked against who is actually staged.');
  out.push('');
  out.push('Per scene:');
  for (const s of sceneSummary) {
    const mark = s.violations ? `${s.violations} VIOLATION${s.violations === 1 ? '' : 'S'}` : 'clean';
    out.push(`  ${s.label.padEnd(28)} ${String(s.voices).padStart(2)} voice(s) with lines — ${mark}`);
  }
  out.push('');

  if (unmapped.length) {
    out.push(`UNMAPPED CUES (${unmapped.length}) — no scene in tools/scene-casts.json claims this prefix:`);
    for (const u of unmapped.slice(0, 20)) out.push(`  ${u.name} (voice: ${u.voice})`);
    if (unmapped.length > 20) out.push(`  ... and ${unmapped.length - 20} more`);
    out.push('');
  }

  if (violations.length) {
    out.push(`VIOLATIONS (${violations.length}):`);
    for (const v of violations) {
      out.push(`  voice "${v.voice}" has ${v.count} line${v.count === 1 ? '' : 's'} in scene `
        + `"${v.scene}" but no staged character.`);
      out.push(`    e.g. ${v.cues.slice(0, 3).join(', ')}${v.cues.length > 3 ? ', …' : ''}`);
    }
    out.push('');
  } else {
    out.push('No violations.');
    out.push('');
  }

  if (allowlisted.length) {
    out.push(`Allowlisted (accepted, not counted as failures) (${allowlisted.length}):`);
    for (const a of allowlisted) {
      out.push(`  voice "${a.voice}" in "${a.scene}" — ${a.count} line(s) — ${a.reason}`);
    }
    out.push('');
  }

  return out.join('\n');
}

/* ================================================================== */
/* CLI                                                                   */
/* ================================================================== */

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const scenes = loadSceneCasts();
  const result = findViolations(manifest, scenes);
  console.log(formatReport(result));

  const failed = result.violations.length > 0 || result.unmapped.length > 0;
  if (failed) {
    console.error(`${result.violations.length} presence violation(s), `
      + `${result.unmapped.length} unmapped cue(s).`);
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
