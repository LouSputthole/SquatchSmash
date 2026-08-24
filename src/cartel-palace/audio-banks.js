/**
 * The Palace's residency banks — WHAT loads WHEN, as data.
 *
 * The start button used to await the finale's whole `vo.palace.` bank, a
 * confrontation twenty minutes past the service gate. The split follows the
 * night: combat can start on the first fence (a spotted approach raises the
 * alarm), so everything a firefight or a checkpoint chime needs blocks the
 * click; the dining-room speech blocks the DINING DOOR (see main.js — its
 * interaction awaits `whenNextBeat()` before the door swings, so the beat
 * cannot begin before its recordings are resident, by construction); the
 * city bed rides along whenever the pipe is free.
 */
import { GROUND_COMBAT_AUDIO_CUES } from '../core/combat/index.js';

export const PALACE_START_BANK = Object.freeze({
  /* `weapon.` also covers the mission's suppressed report and its mechanical
   * layer (`weapon.suppressed.*`, see ./suppressor.js), which the FIRST
   * trigger pull reaches for. The three voice prefixes are the non-finale
   * palace lines (./voice.js): recognition on the evidence, the cleaner, and
   * the payroll's combat barks -- all of which can fire minutes before the
   * dining door, so they cannot ride the next-beat bank. Unrecorded cues
   * cost nothing; the index filter skips absent files. */
  prefixes: Object.freeze([
    'weapon.', 'footstep.',
    'vo.palace.tony.', 'vo.palace.cleaner.', 'vo.palace.guard.',
    /* The idle guard conversations (./conversations.js). These run from the
     * first frame of the approach -- two men on a gate are already talking
     * when the player climbs the fence -- so they cannot ride the next-beat
     * bank either. They are also the one bank whose absence is FELT: the
     * stealth affordance is finding a conversation by ear. */
    'vo.palace.shift.',
  ]),
  names: Object.freeze([
    ...GROUND_COMBAT_AUDIO_CUES,
    /* The estate's own weather and rooms: the rain loop and the two
     * interior beds the acoustics automate (see ./acoustics.js). All three
     * loops START at boot with their gains at the boot room's levels, so
     * their recordings must be resident before `startLoop` picks a buffer —
     * a loop started before its decode is a synth stand-in for the night. */
    'ambience.rain', 'ambience.palace.interior', 'ambience.palace.dining',
    /* The estate's own security klaxon, reused from Lou's mansion -- see the
     * note on `soundTheEstateAlarm` in ./main.js. `alarm.chirp` stays for the
     * door panel it was recorded for. */
    'alarm.chirp', 'siege.alarm.tone',
    'door.creak', 'door.locked', 'heist.bullet.impact',
    'ui.select', 'woo.streak', 'chat.ping', 'switch.click', 'light.dip',
  ]),
});

export const PALACE_NEXT_BEAT_BANK = Object.freeze({
  /* 'vo.palace.' is the finale confrontation bank. Unrecorded cues cost
   * nothing — the index filter skips absent files — and recorded takes
   * start playing the day they land, with no code change. */
  prefixes: Object.freeze(['vo.palace.']),
  names: Object.freeze([]),
});

export const PALACE_BACKGROUND_BANK = Object.freeze({
  prefixes: Object.freeze([]),
  /* Loaded, never gated: distant city under the rain if a mix ever wants
   * it. Nothing beat-shaped waits on this bank. */
  names: Object.freeze(['ambience.city.night']),
});
