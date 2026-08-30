import { CABIN_HOSTAGE_IDS, COUNTRYSIDE_CABIN_LANDMARKS } from '../../src/core/countryside-cabin-story.js';

function requireOk(label, result) {
  if (result?.ok) return result;
  throw new Error(`${label} failed: ${result?.reason ?? 'unknown reason'}`);
}

/**
 * VISIT ONE: beats 4 and 5. He arrives near two in the morning, sleeps, and
 * wakes into a day of walking a property he has never seen while two phones
 * decide what happens to him next.
 *
 * It ends on Booski's call, which is also what unlocks the Beef Run -- so a
 * route helper that stopped short of it would leave the aeroplane locked and
 * the test would blame the airstrip.
 */
export function completeCabinVisitOne(story) {
  requireOk('arrival rest', story.completeArrivalRest());
  requireOk('Lou opening call', story.completeOpeningCall());
  for (const { id } of COUNTRYSIDE_CABIN_LANDMARKS) {
    requireOk(`${id} exploration`, story.visit(id));
  }
  requireOk('Margo call', story.completeMargoCall());
  return requireOk('Booski / Sasole call', story.completeBooskiSasoleCall());
}

/**
 * VISIT TWO: beat 7, which is the dungeon and everything under it.
 *
 * Sasole runs him back, he sleeps a second night on his own marker -- the
 * ledger is exact-once by id, so the arrival's rest cannot be spent twice --
 * and Gratin rings on the Day Three morning.
 */
export function completeCabinVisitTwo(story) {
  requireOk('return from the airstrip', story.recordReturnFromAirstrip());
  requireOk('second night', story.completeSecondRest());
  requireOk('Gratin call', story.completeGratinCall());
  requireOk('cellar reveal', story.openCellar());
  requireOk('dungeon entry', story.enterDungeon());

  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    const hostage = story.hostageState(id);
    requireOk(`${id} interrogation`, story.hitHostage(id, { hits: hostage.threshold }));
  }
  requireOk('A-Team intel', story.learnAteamIntel());
  requireOk('execution choice', story.chooseExecution('player'));

  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    const hostage = story.hostageState(id);
    requireOk(`${id} execution damage`, story.damageHostage(id, { hits: hostage.remaining }));
    requireOk(`${id} death`, story.killHostage(id));
  }

  requireOk('nightfall', story.completeNightfall());
  for (const id of Object.values(CABIN_HOSTAGE_IDS)) {
    requireOk(`${id} wrap`, story.wrapHostage(id));
    requireOk(`${id} pyre carry`, story.moveBodyToFire(id));
  }
  requireOk('body staging rollup', story.stageBodies());
  requireOk('gasoline', story.pourGas());
  requireOk('bonfire ignition', story.igniteBonfire());
  requireOk('fire cleanup', story.completeFireCleanup());
  requireOk('bonfire drinks', story.drink());
  requireOk('blackout', story.blackout());
  return requireOk('Booski / Billy call', story.completeBillyCall());
}

/**
 * Advance a real CountrysideCabinStory through its complete public contract.
 * Route tests use this instead of minting time-event markers by hand, so a
 * production guard added to the chapter also guards the campaign marathon.
 *
 * The Beef Run belongs BETWEEN the two halves, so a caller that owns the
 * aeroplane should run the halves itself. This convenience marks the flight
 * complete on the way past, which is honest about the order without making
 * every caller build an airstrip story it does not care about.
 */
export function completeCabinChapter(story, { flyBeefRun } = {}) {
  completeCabinVisitOne(story);
  if (typeof flyBeefRun === 'function') flyBeefRun();
  else story.campaign.update((state) => {
    state.missions.airstrip_smuggling.status = 'complete';
  });
  return completeCabinVisitTwo(story);
}
