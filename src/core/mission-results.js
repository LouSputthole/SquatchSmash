/**
 * Project durable campaign facts onto existing mission-complete cards.
 *
 * This Module does not invent scores and does not own mission completion. It
 * reads the exact persisted mission record, selects a small authored set of
 * facts for that mission, and returns label/value rows a presentation Adapter
 * can render. A fact absent from the save is absent from the card.
 */
import { CAMPAIGN_STORAGE_KEY, MISSION_IDS, SCENE_IDS } from './campaign.js';

const yesNo = (value) => (value ? 'Yes' : 'No');
const title = (value) => String(value).replaceAll('_', ' ').replaceAll('-', ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());
const integer = (value) => String(Math.round(Number(value) || 0));
const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const meter = (value) => `${Math.round(Number(value) || 0)}%`;
const money = (value) => `$${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
const count = (value) => String(Array.isArray(value) ? value.length : 0);
const golfScore = (value) => {
  const n = Math.round(Number(value) || 0);
  return n === 0 ? 'Even' : n > 0 ? `+${n}` : String(n);
};

const field = (key, label, format = title) => Object.freeze({ key, label, format });

export const MISSION_RESULT_FIELDS = Object.freeze({
  [MISSION_IDS.BADA_BING_ONE]: Object.freeze([
    field('packageReceived', 'Package received', yesNo),
    field('ending', 'Visit ending'),
  ]),
  [MISSION_IDS.SQUATCHFATHER]: Object.freeze([
    field('weaponStaged', 'Weapon staged', yesNo),
    field('weaponDropped', 'Weapon dropped', yesNo),
  ]),
  [MISSION_IDS.AIRSTRIP_SMUGGLING]: Object.freeze([
    field('rank', 'Rank', String),
    field('landingQuality', 'Landing'),
    field('packagesDelivered', 'Packages delivered', integer),
    field('gunsDelivered', 'Guns delivered', integer),
    field('detected', 'Detected', yesNo),
    field('unlocks', 'Rewards earned', count),
  ]),
  [MISSION_IDS.BADA_BING_TWO]: Object.freeze([
    field('attackResolved', 'Attack resolved', yesNo),
    field('bodyWrapped', 'Body wrapped', yesNo),
    field('bodyLoaded', 'Body loaded', yesNo),
    field('burialComplete', 'Burial complete', yesNo),
    field('respectedGraves', 'Graves respected', count),
    field('urinatedOn', 'Graves disrespected', count),
  ]),
  [MISSION_IDS.JERKY_MOTEL]: Object.freeze([
    field('ending', 'Outcome'),
    field('cargoRecovered', 'Cargo recovered', yesNo),
    field('packagesIntact', 'Packages intact', integer),
    field('freshness', 'Freshness', meter),
    field('policeHeat', 'Police heat', meter),
  ]),
  [MISSION_IDS.NO_WAKE]: Object.freeze([
    field('betrayalConfirmed', 'Betrayal confirmed', yesNo),
    field('playerFired', 'Tony fired', yesNo),
    field('bodyDisposed', 'Body disposed', yesNo),
  ]),
  [MISSION_IDS.SILVER_ROOM]: Object.freeze([
    field('outcome', 'Evening'),
    field('woo', 'Connection', meter),
    field('band', 'Band'),
    field('tippedEverybody', 'Tipped everybody', yesNo),
    field('seeingHerAgain', 'Another date', yesNo),
    field('cameHome', 'Came home together', yesNo),
  ]),
  [MISSION_IDS.SILVER_PINES]: Object.freeze([
    field('holesPlayed', 'Holes played', integer),
    field('strokes', 'Strokes', integer),
    field('toPar', 'To par', golfScore),
    field('penalties', 'Penalties', integer),
    field('ace', 'Hole in one', yesNo),
  ]),
  [MISSION_IDS.BANK_HEIST]: Object.freeze([
    field('outcome', 'Outcome'),
    field('grossTake', 'Gross take', money),
    field('familyShare', 'Family share', money),
    field('bagsRecovered', 'Bags recovered', integer),
    field('civiliansHarmed', 'Civilians harmed', integer),
    field('alarmTriggered', 'Alarm triggered', yesNo),
    field('crewSurvived', 'Crew survived', yesNo),
  ]),
  [MISSION_IDS.SILVER_CASE]: Object.freeze([
    field('caseRecovered', 'Case recovered', yesNo),
    field('winstonOutcome', 'Winston'),
    field('irritatedApe', 'Irritated Ape', yesNo),
    field('apeFinishedChester', 'Chester handled by Ape', yesNo),
    field('apeFinishedWinston', 'Winston handled by Ape', yesNo),
  ]),
  [MISSION_IDS.MANSION_SIEGE]: Object.freeze([
    field('attackersDown', 'Attackers down', integer),
    field('littleFriendSaid', 'Little friend said', yesNo),
    field('sasoleMet', 'Sasole met', yesNo),
  ]),
  [MISSION_IDS.ENOLA_SQUATCH]: Object.freeze([
    field('rank', 'Rank', String),
    field('score', 'Score', percent),
    field('payloadReleased', 'Payload released', yesNo),
    field('returnedHome', 'Returned home', yesNo),
    field('unlocks', 'Rewards earned', count),
  ]),
  [MISSION_IDS.MANSION_RETURN]: Object.freeze([
    field('briefingComplete', 'Briefing complete', yesNo),
    field('wrongCityConfirmed', 'Wrong city confirmed', yesNo),
    field('sauceMissingConfirmed', 'Sauce missing confirmed', yesNo),
  ]),
  [MISSION_IDS.CARTEL_PALACE]: Object.freeze([
    field('outcome', 'Outcome'),
    field('evidenceFound', 'Evidence found', count),
    field('sauceBetrayalConfirmed', 'Betrayal confirmed', yesNo),
    field('alarmRaised', 'Alarm raised', yesNo),
    field('markEliminated', 'Mark eliminated', yesNo),
    field('sauceEliminated', 'Sauce eliminated', yesNo),
  ]),
  [MISSION_IDS.SILENT_SQUATCH]: Object.freeze([
    field('caseDelivered', 'Case delivered', yesNo),
    field('aubbieEliminated', 'Aubbie eliminated', yesNo),
    field('scientistsLost', 'Scientists lost', integer),
    field('silentNightActivated', 'Silent Night activated', yesNo),
  ]),
});

const SCENE_TO_MISSION = Object.freeze({
  [SCENE_IDS.BADA_BING_ONE]: MISSION_IDS.BADA_BING_ONE,
  [SCENE_IDS.SQUATCHFATHER]: MISSION_IDS.SQUATCHFATHER,
  [SCENE_IDS.AIRSTRIP_SMUGGLING]: MISSION_IDS.AIRSTRIP_SMUGGLING,
  [SCENE_IDS.BADA_BING_TWO]: MISSION_IDS.BADA_BING_TWO,
  [SCENE_IDS.SQUATCH_GRAVEYARD]: MISSION_IDS.BADA_BING_TWO,
  [SCENE_IDS.JERKY_MOTEL]: MISSION_IDS.JERKY_MOTEL,
  [SCENE_IDS.NO_WAKE]: MISSION_IDS.NO_WAKE,
  [SCENE_IDS.SILVER_ROOM]: MISSION_IDS.SILVER_ROOM,
  [SCENE_IDS.SILVER_PINES]: MISSION_IDS.SILVER_PINES,
  [SCENE_IDS.BANK_HEIST]: MISSION_IDS.BANK_HEIST,
  [SCENE_IDS.SILVER_CASE]: MISSION_IDS.SILVER_CASE,
  [SCENE_IDS.MANSION_SIEGE]: MISSION_IDS.MANSION_SIEGE,
  [SCENE_IDS.ENOLA_SQUATCH]: MISSION_IDS.ENOLA_SQUATCH,
  [SCENE_IDS.MANSION_RETURN]: MISSION_IDS.MANSION_RETURN,
  [SCENE_IDS.CARTEL_PALACE]: MISSION_IDS.CARTEL_PALACE,
  [SCENE_IDS.INITIATION]: MISSION_IDS.INITIATION,
});

export function readDurableCampaignState(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(CAMPAIGN_STORAGE_KEY) ?? 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function resultMissionId(state) {
  const sceneId = state?.scene?.id;
  if (sceneId === SCENE_IDS.MANSION) {
    if (state.missions?.[MISSION_IDS.SILENT_SQUATCH]?.status === 'complete') {
      return MISSION_IDS.SILENT_SQUATCH;
    }
    return MISSION_IDS.MANSION_RETURN;
  }
  return SCENE_TO_MISSION[sceneId] ?? null;
}

export function missionResultRows(state, missionId = resultMissionId(state)) {
  const mission = state?.missions?.[missionId];
  if (!mission || mission.status !== 'complete') return [];
  const specs = MISSION_RESULT_FIELDS[missionId] ?? [];
  const rows = [];
  for (const spec of specs) {
    if (!Object.prototype.hasOwnProperty.call(mission, spec.key)) continue;
    const value = mission[spec.key];
    if (value === null || value === undefined || value === '') continue;
    rows.push(Object.freeze({
      key: spec.key,
      label: spec.label,
      value: spec.format(value),
    }));
  }
  return rows;
}

export function populateMissionResults(card, {
  state = readDurableCampaignState(),
  missionId = resultMissionId(state),
  doc = card?.ownerDocument ?? globalThis.document,
} = {}) {
  if (!card || !doc?.createElement) return 0;
  const rows = missionResultRows(state, missionId);
  let list = card.querySelector?.('[data-systemic-mission-results]') ?? null;
  if (!rows.length) {
    list?.remove?.();
    return 0;
  }
  if (!list) {
    list = doc.createElement('dl');
    list.dataset.systemicMissionResults = missionId;
    list.className = 'systemic-mission-results';
    list.setAttribute('aria-label', 'Mission results');
    const actions = card.querySelector?.('.actions, .btnrow, .foot, .exits, button, a[href]');
    const anchor = actions?.closest?.('.actions, .btnrow, .foot, .exits') ?? actions;
    if (anchor?.parentNode) anchor.parentNode.insertBefore(list, anchor);
    else card.appendChild(list);
  }
  list.dataset.systemicMissionResults = missionId;
  const signature = JSON.stringify(rows.map(({ key, value }) => [key, value]));
  if (list.dataset.systemicResultSignature === signature) return rows.length;
  list.dataset.systemicResultSignature = signature;
  list.replaceChildren(...rows.flatMap((row) => {
    const term = doc.createElement('dt');
    term.textContent = row.label;
    const detail = doc.createElement('dd');
    detail.textContent = row.value;
    return [term, detail];
  }));
  return rows.length;
}
