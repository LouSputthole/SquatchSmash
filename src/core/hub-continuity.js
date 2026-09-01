/**
 * Campaign continuity contract for the four locations the player revisits.
 *
 * A hub owns its geometry and interactions; this module owns the question
 * "what must be visibly different on this visit?".  Scene adapters bind the
 * semantic ids below to real Object3Ds.  `applyHubContinuity` then changes the
 * actual objects and reports missing required content instead of letting an
 * unmounted metadata row masquerade as presentation.
 */

const EMPTY = Object.freeze([]);

const row = ({ visible = EMPTY, hidden = EMPTY, news = null, callback = null, cleanup = null }) =>
  Object.freeze({
    visible: Object.freeze([...visible]),
    hidden: Object.freeze([...hidden]),
    news,
    callback,
    cleanup,
  });

const APARTMENT = Object.freeze({
  day_one: row({
    visible: ['apartment.lanyard', 'apartment.willy-photo'],
    hidden: ['apartment.bing-matches', 'apartment.willy-gap'],
  }),
  day_two: row({
    visible: ['apartment.bing-matches'],
    hidden: ['apartment.lanyard'],
    callback: 'apartment.answering-machine',
  }),
  no_wake: row({
    visible: ['apartment.motel-key', 'apartment.willy-gap'],
    hidden: ['apartment.willy-photo'],
    news: 'apartment.news.no-wake',
  }),
  date: row({
    visible: ['apartment.motel-key', 'apartment.willy-gap'],
    hidden: ['apartment.willy-photo'],
  }),
  big_night: row({ visible: ['apartment.suit-bag'] }),
  golf_morning: row({ visible: ['apartment.suit-bag'] }),
  heist_day: row({ visible: ['apartment.heist-kit'], cleanup: 'apartment.pre-heist-kit' }),
  post_heist: row({
    visible: ['apartment.heist-cleanup'],
    hidden: ['apartment.heist-kit'],
    news: 'apartment.news.post-heist',
    cleanup: 'apartment.post-heist-wash-and-cut',
  }),
});

const CABIN_EARLY = new Set([
  'arrival_rest', 'opening_call', 'explore', 'margo_call', 'booski_call', 'beef_run',
]);
const CABIN_RETURN_WAIT = new Set(['return_to_cabin', 'second_rest', 'gratin_call']);
const CABIN_DUNGEON = new Set([
  'enter_dungeon', 'interrogation', 'ateam_intel', 'execution_choice', 'execution', 'nightfall',
]);
const CABIN_CLEANUP = new Set([
  'wrap_bodies', 'carry_bodies', 'pour_gas', 'ignite_bonfire', 'fire_cleanup',
  'drink', 'blackout', 'morning_call', 'morning_wake', 'billy_call', 'complete',
]);

function cabinRow(phase) {
  if (CABIN_EARLY.has(phase)) {
    return row({
      visible: ['cabin.lay-low-note'],
      hidden: ['cabin.cellar-entry', 'cabin.dungeon', 'cabin.body-cleanup'],
      callback: 'cabin.lay-low-note',
    });
  }
  if (CABIN_RETURN_WAIT.has(phase)) {
    return row({
      visible: ['cabin.lay-low-note'],
      hidden: ['cabin.cellar-entry', 'cabin.dungeon', 'cabin.body-cleanup'],
      callback: 'cabin.gratin-reveal-call',
    });
  }
  if (phase === 'open_cellar') {
    return row({
      visible: ['cabin.cellar-entry'],
      hidden: ['cabin.lay-low-note', 'cabin.dungeon', 'cabin.body-cleanup'],
      callback: 'cabin.cellar-entry',
    });
  }
  if (CABIN_DUNGEON.has(phase)) {
    return row({
      visible: ['cabin.cellar-entry', 'cabin.dungeon'],
      hidden: ['cabin.lay-low-note', 'cabin.body-cleanup'],
      callback: 'cabin.cellar-work',
    });
  }
  if (CABIN_CLEANUP.has(phase)) {
    return row({
      visible: ['cabin.cellar-entry', 'cabin.dungeon', 'cabin.body-cleanup'],
      hidden: ['cabin.lay-low-note'],
      callback: phase === 'complete' ? 'cabin.departure-call' : 'cabin.cleanup-work',
      cleanup: 'cabin.body-cleanup',
    });
  }
  return row({
    visible: ['cabin.lay-low-note'],
    hidden: ['cabin.cellar-entry', 'cabin.dungeon', 'cabin.body-cleanup'],
  });
}

const LUXURY = Object.freeze({
  get_ready: row({ hidden: ['luxury.margo-morning-mugs'] }),
  date: row({ hidden: ['luxury.margo-morning-mugs'] }),
  come_home: row({ hidden: ['luxury.margo-morning-mugs'], callback: 'luxury.margo-arrival' }),
  stayover: row({ hidden: ['luxury.margo-morning-mugs'], callback: 'luxury.margo-stayover' }),
  morning: row({ visible: ['luxury.margo-morning-mugs'], callback: 'luxury.margo-morning' }),
  no_wake: row({ visible: ['luxury.margo-morning-mugs'], callback: 'luxury.lou-no-wake-call' }),
  return: row({ hidden: ['luxury.margo-morning-mugs'], callback: 'luxury.silver-case-call' }),
  complete: row({ hidden: ['luxury.margo-morning-mugs'] }),
  special_meeting: row({
    hidden: ['luxury.margo-morning-mugs'],
    callback: 'luxury.special-meeting-call',
    news: 'luxury.news.post-palace',
  }),
});

const MANSION = Object.freeze({
  silent_squatch: row({
    hidden: ['mansion.foyer-repair-site'],
    callback: 'mansion.silent-squatch-handover',
  }),
  return: row({
    visible: ['mansion.foyer-repair-site'],
    news: 'mansion.return.wrong-city-and-palace',
    callback: 'mansion.lou-return-briefing',
    cleanup: 'mansion.siege-repairs-in-progress',
  }),
});

/** Resolve one durable campaign phase into the hub's presentation contract. */
export function resolveHubContinuity(hub, phase) {
  const id = String(hub ?? '');
  const visit = String(phase ?? '');
  let plan;
  if (id === 'apartment') plan = APARTMENT[visit] ?? APARTMENT.day_one;
  else if (id === 'cabin') plan = cabinRow(visit);
  else if (id === 'luxury_apartment') plan = LUXURY[visit] ?? LUXURY.get_ready;
  else if (id === 'mansion') plan = MANSION[visit] ?? MANSION.silent_squatch;
  else throw new RangeError(`Unknown repeat hub: ${id || '(empty)'}`);
  return Object.freeze({ hub: id, phase: visit, ...plan });
}

function registryEntry(props, id) {
  if (props instanceof Map) return props.get(id) ?? null;
  return props?.[id] ?? null;
}

/**
 * Apply a continuity plan to real scene objects.
 *
 * A missing object required to be visible is a failure. A missing object that
 * should be hidden is harmless: absence is already hidden. The returned
 * `visible` list is observed from Object3D.visible after application, not
 * copied from the plan.
 */
export function applyHubContinuity({ hub, phase, props = new Map() } = {}) {
  const plan = resolveHubContinuity(hub, phase);
  const missing = [];
  for (const id of plan.visible) {
    const object = registryEntry(props, id);
    if (!object || typeof object !== 'object' || !Object.hasOwn(object, 'visible')) {
      missing.push(id);
      continue;
    }
    object.visible = true;
    object.userData ??= {};
    object.userData.hubContinuity = { hub: plan.hub, phase: plan.phase, id };
  }
  for (const id of plan.hidden) {
    const object = registryEntry(props, id);
    if (!object || typeof object !== 'object' || !Object.hasOwn(object, 'visible')) continue;
    object.visible = false;
    object.userData ??= {};
    object.userData.hubContinuity = { hub: plan.hub, phase: plan.phase, id };
  }
  const visible = plan.visible.filter((id) => registryEntry(props, id)?.visible === true);
  return Object.freeze({ ...plan, visible: Object.freeze(visible), missing: Object.freeze(missing), ok: missing.length === 0 });
}
