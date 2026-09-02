/**
 * Source-driven ownership contract for the generated radio/music timeline.
 *
 * The audit discovers owners from the live campaign spine. This table does
 * not duplicate their trigger or mix configuration; it binds each unique
 * non-silent owner to the exact active-play receipt that proves it is not an
 * inventory-only claim. Adding, renaming, or removing an audited owner must
 * therefore update both the runtime verifier and this small review surface.
 */

export function radioTimelineOwnerKey(row) {
  return [row['Scene filename'], row['Radio or music source'], row['Cue ID']].join(' | ');
}

export function uniqueAuditedRadioOwners(rows) {
  const owners = new Map();
  for (const row of rows) {
    if (row['Radio or music source'] === 'No active radio/music playback owner') continue;
    const key = radioTimelineOwnerKey(row);
    if (!owners.has(key)) owners.set(key, row);
  }
  return owners;
}

function receipt(sceneFilename, source, cueId, verifier, receipt) {
  return Object.freeze({
    key: [sceneFilename, source, cueId].join(' | '),
    verifier,
    receipt,
  });
}

const RECEIPTS = [
  receipt(
    'index.html',
    'Physical 97.8 receiver · apartment',
    'station:squatch',
    'tools/verify-day-two.mjs',
    'the apartment departure tears down its physical receiver with no stale radio beds',
  ),
  receipt(
    'bing.html',
    'Physical 97.8 receiver · bing_car',
    'station:squatch',
    'tools/verify-bing.mjs',
    'the Bing scene handoff tears down every radio and music owner without stale loop keys',
  ),
  receipt(
    'bing.html',
    'Bada Bing DJ booth',
    'music.club',
    'tools/verify-bing.mjs',
    'the Bing scene handoff tears down every radio and music owner without stale loop keys',
  ),
  receipt(
    'bing.html',
    'Lou’s office radio',
    'office.radio',
    'tools/verify-bing.mjs',
    'the Bing scene handoff tears down every radio and music owner without stale loop keys',
  ),
  receipt(
    'bing.html',
    'Lou doorway signature sting',
    'music.sensilou',
    'tools/verify-bing.mjs',
    'the Bing scene handoff tears down every radio and music owner without stale loop keys',
  ),
  receipt(
    'bing.html',
    'Booski signature sting',
    'music.booski',
    'tools/verify-bing.mjs',
    'the Bing scene handoff tears down every radio and music owner without stale loop keys',
  ),
  receipt(
    'bing.html',
    'License to Grill store-room radio',
    'music.storeroom',
    'tools/verify-bing.mjs',
    'the Bing scene handoff tears down every radio and music owner without stale loop keys',
  ),
  receipt(
    'cabin.html',
    'Physical 97.8 receiver · countryside_cabin',
    'station:squatch',
    'tools/verify-cabin.mjs',
    'the Cabin chapter exit tears down the physical receiver with no stale radio beds',
  ),
  receipt(
    'beefrun.html',
    'Physical 97.8 receiver · beefrun_cockpit',
    'station:squatch',
    'tools/verify-beefrun.mjs',
    'the Beef Run report card pauses its physical receiver with no stale radio beds',
  ),
  receipt(
    'beefrun.html',
    'Beef Run takeoff needle-drop',
    'music.knocking',
    'tools/verify-beefrun.mjs',
    'Can’t You Hear Me Knocking opens 30% louder for exactly 24 audible seconds',
  ),
  receipt(
    'bing.html?visit=2',
    'Billy Hotdog party record',
    'party.record',
    'tools/verify-bing-two.mjs',
    'the HotDog exit tears down the party record and every scene loop before the graveyard handoff',
  ),
  receipt(
    'motel.html',
    'Jerky Motel drive score',
    'motel.drive.score',
    'tools/verify-motel.mjs',
    'finishing the drive stops and rewinds its score exactly once',
  ),
  receipt(
    'heist.html',
    'THE TAKE safehouse record',
    'heist.morning.radio',
    'tools/verify-heist.mjs',
    'THE TAKE safehouse record starts once, ducks under dialogue, and follows the crew into the bank low',
  ),
  receipt(
    'heist.html',
    'THE TAKE escape-car score',
    'music.heist.escape-drive',
    'tools/verify-heist.mjs',
    'THE TAKE escape score starts once, ducks under dialogue, and tears down at the final handoff',
  ),
  receipt(
    'golf.html',
    'Physical 97.8 receiver · silver_pines_lead_cart',
    'station:squatch',
    'tools/verify-golf.mjs',
    'the completed round pauses the physical cart receiver with no stale radio beds',
  ),
  receipt(
    'luxury-apartment.html',
    'Physical 97.8 receiver · luxury_apartment',
    'station:squatch',
    'tools/verify-luxury-apartment.mjs',
    'real E input takes the called elevator, closes the scene, locks control, and silences active audio',
  ),
  receipt(
    'silver.html',
    'Front & Center supper-club bed',
    'silver.room.background',
    'tools/verify-silver.mjs',
    'the Silver ending retires the room bed, opening tail, and featured number with no stale music keys',
  ),
  receipt(
    'silver.html',
    'Front & Center opening tail',
    'band.feature.tail',
    'tools/verify-silver.mjs',
    'the Silver ending retires the room bed, opening tail, and featured number with no stale music keys',
  ),
  receipt(
    'silver.html',
    'Front & Center featured band number',
    'band.feature',
    'tools/verify-silver.mjs',
    'the Silver ending retires the room bed, opening tail, and featured number with no stale music keys',
  ),
  receipt(
    'nowake.html',
    'Physical 97.8 receiver · no_wake_cabin',
    'station:squatch',
    'tools/verify-no-wake.mjs',
    'NO WAKE completion owns no radio media or stale radio beds',
  ),
  receipt(
    'mansion.html',
    'Physical 97.8 receiver · mansion_house',
    'station:squatch',
    'tools/verify-mansion.mjs',
    'a fresh ordinary Mansion visit keeps the default-off receiver silent before audio unlock',
  ),
  receipt(
    'enolasquatch.html',
    'Enola takeoff needle-drop',
    'music.takeoff',
    'tools/verify-enolasquatch.mjs',
    'Fortunate Son has one owner, plays once at 13% lower volume, and fades at 2:30',
  ),
  receipt(
    'enolasquatch.html',
    'Enola bomb-run approach score',
    'music.enola.approach',
    'tools/verify-enolasquatch.mjs',
    'the Enola approach score owns one real streamed media handle on the bombing run',
  ),
  receipt(
    'enolasquatch.html',
    'Enola explosion aftermath',
    'enola.explosion.silence',
    'tools/verify-enolasquatch.mjs',
    'the whole explosion phase remains score-silent before the authored escape delay',
  ),
  receipt(
    'enolasquatch.html',
    'Enola escape score',
    'music.enola.escape',
    'tools/verify-enolasquatch.mjs',
    'the Enola escape score starts once after the silent aftermath on a real streamed media handle',
  ),
  receipt(
    'initiation.html',
    'Campaign credits song',
    'music.credits',
    'tools/verify-initiation.mjs',
    'the credits song starts once on the crawl while the cabin stereo stays silent',
  ),
  receipt(
    'mansion.html?visit=return',
    'Physical 97.8 receiver · mansion_house',
    'station:squatch',
    'tools/verify-mansion.mjs',
    'the return gesture restores exactly one house bed while both prior scene contexts stay suspended',
  ),
  receipt(
    'graveyard.html',
    'Graveyard arrival score',
    'music.arrival.squatch-graveyard',
    'tools/verify-graveyard.mjs',
    'the Graveyard arrival score starts once and fades at body pickup',
  ),
  receipt(
    'silvercase.html',
    'Silver Case pickup score',
    'music.arrival.silver-case',
    'tools/verify-silvercase.mjs',
    'the Silver Case pickup score starts once and fades at hallway arrival',
  ),
  receipt(
    'cartel-palace.html',
    'Cartel Palace arrival score',
    'music.arrival.cartel-palace',
    'tools/verify-cartel-palace.mjs',
    'clean start: the Palace arrival score starts once and fades at the perimeter',
  ),
  receipt(
    'specialmeeting.html',
    'Special Meeting two-second car-radio gag',
    'radio.vo.announcer.0177le3',
    'tools/verify-specialmeeting.mjs',
    'SM-200 plays the delivered announcer recording and Seff cuts it at exactly two seconds',
  ),
  receipt(
    'initiation.html',
    'Initiation cabin stereo',
    'initiation.cabin.music',
    'tools/verify-initiation.mjs',
    'the cabin stereo begins its authored fade before the oath and cannot restart afterward',
  ),
];

export const RADIO_ACTIVE_PLAY_COVERAGE = new Map(RECEIPTS.map((entry) => [entry.key, entry]));

if (RADIO_ACTIVE_PLAY_COVERAGE.size !== RECEIPTS.length) {
  throw new Error('radio active-play coverage contains a duplicate owner key');
}

export function summarizeRadioActivePlayCoverage(timelineRows) {
  const owners = uniqueAuditedRadioOwners(timelineRows);
  const expected = new Set(owners.keys());
  const mapped = [...expected].filter((key) => RADIO_ACTIVE_PLAY_COVERAGE.has(key));
  const missing = [...expected].filter((key) => !RADIO_ACTIVE_PLAY_COVERAGE.has(key));
  const stale = [...RADIO_ACTIVE_PLAY_COVERAGE.keys()].filter((key) => !expected.has(key));
  return Object.freeze({
    total: owners.size,
    covered: mapped.length,
    complete: missing.length === 0 && stale.length === 0,
    missing: Object.freeze(missing),
    stale: Object.freeze(stale),
  });
}

export function applyRadioActivePlayCoverage(timelineRows) {
  for (const row of timelineRows) {
    if (row['Radio or music source'] === 'No active radio/music playback owner') continue;
    const evidence = RADIO_ACTIVE_PLAY_COVERAGE.get(radioTimelineOwnerKey(row));
    if (!evidence) continue;
    /* Keep the review sheet scannable. The exact immutable receipt text lives
     * in this source contract and is verified against the named file by the
     * unit test; repeating it inside every timeline cell made the XLSX rows
     * several screens tall without adding evidence. */
    row['Implementation status'] = `Named active-play receipt · ${evidence.verifier}`;
  }
  return timelineRows;
}
