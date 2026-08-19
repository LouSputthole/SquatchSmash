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
  prefixes: Object.freeze(['weapon.', 'footstep.']),
  names: Object.freeze([
    ...GROUND_COMBAT_AUDIO_CUES,
    /* The estate's own weather and rooms: the rain loop and the two
     * interior beds the acoustics automate (see ./acoustics.js). All three
     * loops START at boot with their gains at the boot room's levels, so
     * their recordings must be resident before `startLoop` picks a buffer —
     * a loop started before its decode is a synth stand-in for the night. */
    'ambience.rain', 'ambience.palace.interior', 'ambience.palace.dining',
    'alarm.chirp',
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
