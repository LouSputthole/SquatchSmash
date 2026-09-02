/**
 * Campaign programming for 97.8 THE SQUATCH.
 *
 * Radio owns playback. This module owns intent: which physical receiver is in
 * the room, which campaign beat the player is on, whether that receiver may
 * carry campaign news, and the ordered entry packet heard before the generic
 * station rotation resumes. Keeping that as data gives runtime, tests, and
 * the radio audit one source instead of three hand-maintained descriptions.
 */

const frozen = (value) => Object.freeze(value);
const block = (id, type, fields = {}) => frozen({ id, type, ...fields });

/** Every physical instance of the shared station makes its news choice here. */
export const PHYSICAL_RADIO_RECEIVERS = frozen({
  apartment: frozen({ campaignNews: 'enabled' }),
  bing_car: frozen({ campaignNews: 'disabled' }),
  countryside_cabin: frozen({ campaignNews: 'enabled' }),
  beefrun_cockpit: frozen({ campaignNews: 'disabled' }),
  silver_pines_lead_cart: frozen({ campaignNews: 'disabled' }),
  luxury_apartment: frozen({ campaignNews: 'enabled' }),
  no_wake_cabin: frozen({ campaignNews: 'disabled' }),
  mansion_house: frozen({ campaignNews: 'enabled' }),
});

const TALK_FIRST = 'talkFirst';
const MUSIC_FIRST = 'musicFirst';
const SILENCE = 'intentionalSilence';
const NONE = 'none';

/**
 * An explicit policy for all 31 campaign beats. `none` means there is no
 * physical receiver or authored long-form music owner; it is not silently
 * treated as successful radio coverage.
 */
export const CAMPAIGN_RADIO_BEATS = frozen({
  squatch_smash_intro: frozen({ policy: NONE }),
  first_apartment: frozen({ policy: TALK_FIRST, receiverId: 'apartment', programId: 'H-APT-01' }),
  bada_bing_one: frozen({ policy: MUSIC_FIRST, receiverId: 'bing_car' }),
  squatchfather: frozen({ policy: NONE }),
  cabin_lay_low: frozen({ policy: TALK_FIRST, receiverId: 'countryside_cabin', programId: 'H-CAB-01' }),
  booski_sasole_call: frozen({ policy: TALK_FIRST, receiverId: 'countryside_cabin', programId: 'H-CAB-02' }),
  beef_run: frozen({ policy: MUSIC_FIRST, receiverId: 'beefrun_cockpit' }),
  cabin_two: frozen({ policy: TALK_FIRST, receiverId: 'countryside_cabin', programId: 'H-CAB-03' }),
  bada_bing_two: frozen({ policy: MUSIC_FIRST }),
  graveyard: frozen({ policy: MUSIC_FIRST }),
  jerky_motel: frozen({ policy: MUSIC_FIRST }),
  return_to_old_apartment: frozen({ policy: TALK_FIRST, receiverId: 'apartment', programId: 'H-APT-02' }),
  bank_heist: frozen({ policy: MUSIC_FIRST }),
  new_space_call: frozen({ policy: TALK_FIRST, receiverId: 'apartment', programId: 'H-APT-03' }),
  silver_pines: frozen({ policy: MUSIC_FIRST, receiverId: 'silver_pines_lead_cart' }),
  luxury_apartment_intro: frozen({ policy: TALK_FIRST, receiverId: 'luxury_apartment', programId: 'H-LUX-01' }),
  front_and_center: frozen({ policy: MUSIC_FIRST }),
  margo_stayover: frozen({ policy: TALK_FIRST, receiverId: 'luxury_apartment', programId: 'H-LUX-02' }),
  luxury_apartment_morning: frozen({ policy: TALK_FIRST, receiverId: 'luxury_apartment', programId: 'H-LUX-03' }),
  no_wake: frozen({ policy: MUSIC_FIRST, receiverId: 'no_wake_cabin' }),
  luxury_apartment_return: frozen({ policy: TALK_FIRST, receiverId: 'luxury_apartment', programId: 'H-LUX-04' }),
  silver_case_setup: frozen({ policy: MUSIC_FIRST }),
  silver_case_mansion: frozen({ policy: TALK_FIRST, receiverId: 'mansion_house', programId: 'H-MAN-01' }),
  silent_squatch: frozen({ policy: TALK_FIRST, receiverId: 'mansion_house', programId: 'H-MAN-01' }),
  mansion_siege: frozen({ policy: SILENCE }),
  enola_squatch: frozen({ policy: MUSIC_FIRST }),
  mansion_return: frozen({ policy: TALK_FIRST, receiverId: 'mansion_house', programId: 'H-MAN-02' }),
  cartel_palace: frozen({ policy: MUSIC_FIRST }),
  special_meeting_call: frozen({ policy: TALK_FIRST, receiverId: 'luxury_apartment', programId: 'H-LUX-05' }),
  pickup_ride: frozen({ policy: MUSIC_FIRST }),
  initiation: frozen({ policy: MUSIC_FIRST }),
});

/* Existing, delivered material arranged into a long entry packet. Talk
 * blocks select the next not-yet-used exchange from the hour's real show.
 * Their progress advances only after the final recording in the exchange
 * finishes, so leaving a room mid-line resumes that block on the next set. */
function hubPacket({
  id,
  beatId,
  receiverId,
  songs,
  showHour,
  editorial = { type: 'link' },
  adId = 'jerky',
}) {
  const blocks = [
    block('ident', 'ident'),
    block('show-intro', 'showIntro'),
    block('talk-01', 'talk', { ordinal: 0 }),
    block('talk-02', 'talk', { ordinal: 1 }),
    block('talk-03', 'talk', { ordinal: 2 }),
    block('talk-04', 'talk', { ordinal: 3 }),
    block('song-01', 'song', { songId: songs[0] }),
    block('editorial', editorial.type, editorial),
    block('talk-05', 'talk', { ordinal: 4 }),
    block('talk-06', 'talk', { ordinal: 5 }),
    block('talk-07', 'talk', { ordinal: 6 }),
    block('talk-08', 'talk', { ordinal: 7 }),
    block('song-02', 'song', { songId: songs[1] }),
    block('ad', 'ad', { adId }),
    block('handoff', 'handoff'),
  ];
  return frozen({
    id, beatId, receiverId, policy: TALK_FIRST, targetSeconds: 300, showHour,
    blocks: frozen(blocks),
  });
}

export const RADIO_PROGRAMS = frozen([
  hubPacket({
    id: 'H-APT-01', beatId: 'first_apartment', receiverId: 'apartment',
    /* Day One wakes at 5:04 PM now (owner, 2026-09-02: "have it be five
     * PM"), so the flat's packet airs the 17:00 show instead of the old
     * breakfast slot -- a morning-drive intro over an evening window was
     * the wart, and it also meant the preloaded show never matched the
     * aired one, which is how the announcer intro fell to the synth. */
    showHour: 17,
    songs: ['good-ole-days', 'cosmic-drift'],
    editorial: { type: 'notice', noticeId: 'notice.meeting.day_one' },
    adId: 'station.morning',
  }),
  hubPacket({
    id: 'H-CAB-01', beatId: 'cabin_lay_low', receiverId: 'countryside_cabin',
    showHour: 9,
    songs: ['through-the-night', 'i-aint-gay'], adId: 'station.evening',
  }),
  hubPacket({
    id: 'H-CAB-02', beatId: 'booski_sasole_call', receiverId: 'countryside_cabin',
    showHour: 12,
    songs: ['good-ole-days', '10-drunk-cigarettes'], adId: 'jerky',
  }),
  hubPacket({
    id: 'H-CAB-03', beatId: 'cabin_two', receiverId: 'countryside_cabin',
    showHour: 8,
    songs: ['nehoo-with-a-guu', '10-drunk-cigarettes'], adId: 'attorney',
  }),
  hubPacket({
    id: 'H-APT-02', beatId: 'return_to_old_apartment', receiverId: 'apartment',
    showHour: 12,
    songs: ['through-the-night', 'good-ole-days'],
    editorial: { type: 'news', newsId: 'news.segment.motel' }, adId: 'dealership',
  }),
  hubPacket({
    id: 'H-APT-03', beatId: 'new_space_call', receiverId: 'apartment',
    showHour: 18,
    songs: ['cosmic-drift', 'good-ole-days'],
    editorial: { type: 'news', newsId: 'news.segment.heist' }, adId: 'jerky',
  }),
  hubPacket({
    id: 'H-LUX-01', beatId: 'luxury_apartment_intro', receiverId: 'luxury_apartment',
    showHour: 12,
    songs: ['good-ole-days', 'cosmic-drift'], adId: 'station.morning',
  }),
  hubPacket({
    id: 'H-LUX-02', beatId: 'margo_stayover', receiverId: 'luxury_apartment',
    showHour: 23,
    songs: ['through-the-night', '10-drunk-cigarettes'], adId: 'attorney',
  }),
  hubPacket({
    id: 'H-LUX-03', beatId: 'luxury_apartment_morning', receiverId: 'luxury_apartment',
    showHour: 7,
    songs: ['good-ole-days', 'cosmic-drift'], adId: 'station.morning',
  }),
  hubPacket({
    id: 'H-LUX-04', beatId: 'luxury_apartment_return', receiverId: 'luxury_apartment',
    showHour: 17,
    songs: ['good-ole-days', 'through-the-night'],
    editorial: { type: 'news', newsId: 'news.segment.lake' }, adId: 'attorney',
  }),
  hubPacket({
    id: 'H-MAN-01', beatId: 'silver_case_mansion', receiverId: 'mansion_house',
    showHour: 20,
    songs: ['daydream-diner-2', 'good-ole-days'], adId: 'station.evening',
  }),
  hubPacket({
    id: 'H-MAN-02', beatId: 'mansion_return', receiverId: 'mansion_house',
    showHour: 18,
    songs: ['daydream-diner-2', 'through-the-night'],
    editorial: { type: 'news', newsId: 'news.segment.detonation' }, adId: 'dealership',
  }),
  hubPacket({
    id: 'H-LUX-05', beatId: 'special_meeting_call', receiverId: 'luxury_apartment',
    showHour: 20,
    songs: ['nehoo-with-a-guu', 'through-the-night'],
    editorial: { type: 'news', newsId: 'news.segment.compound' }, adId: 'station.evening',
  }),
]);

const PROGRAM_BY_KEY = new Map(
  RADIO_PROGRAMS.map((program) => [`${program.beatId}\0${program.receiverId}`, program]),
);

export function radioProgramFor({ beatId, receiverId } = {}) {
  return PROGRAM_BY_KEY.get(`${beatId}\0${receiverId}`) ?? null;
}

const completed = (state, missionId) => state?.missions?.[missionId]?.status === 'complete';
const eventComplete = (state, eventId) => state?.events?.[eventId]?.status === 'complete';

/** Resolve only the repeat-location ambiguity; scene code does not own this table. */
export function campaignRadioBeat(state, receiverId) {
  if (receiverId === 'apartment') {
    if (completed(state, 'bank_heist') && !completed(state, 'silver_pines')) return 'new_space_call';
    if (completed(state, 'jerky_motel')) return 'return_to_old_apartment';
    return 'first_apartment';
  }
  if (receiverId === 'countryside_cabin') {
    if (completed(state, 'airstrip_smuggling')) return 'cabin_two';
    if (eventComplete(state, 'cabin_margo_call')) return 'booski_sasole_call';
    return 'cabin_lay_low';
  }
  if (receiverId === 'luxury_apartment') {
    if (completed(state, 'cartel_palace')) return 'special_meeting_call';
    if (completed(state, 'no_wake')) return 'luxury_apartment_return';
    if (state?.scene?.spawn === 'bed') return 'luxury_apartment_morning';
    if (completed(state, 'silver_room')) return 'margo_stayover';
    return 'luxury_apartment_intro';
  }
  if (receiverId === 'mansion_house') {
    return state?.scene?.id === 'mansion_return' ? 'mansion_return' : 'silver_case_mansion';
  }
  return ({
    bing_car: state?.scene?.id === 'bada_bing_two' ? 'bada_bing_two' : 'bada_bing_one',
    beefrun_cockpit: 'beef_run',
    silver_pines_lead_cart: 'silver_pines',
    no_wake_cabin: 'no_wake',
  })[receiverId] ?? null;
}

export function campaignRadioContext(state, receiverId) {
  const beatId = campaignRadioBeat(state, receiverId);
  const declaration = CAMPAIGN_RADIO_BEATS[beatId] ?? frozen({ policy: NONE });
  const program = radioProgramFor({ beatId, receiverId });
  return frozen({
    receiverId,
    beatId,
    policy: declaration.policy,
    programId: program?.id ?? null,
    program,
    campaignNews: PHYSICAL_RADIO_RECEIVERS[receiverId]?.campaignNews ?? 'disabled',
  });
}
