import { CABIN_HOSTAGE_IDS } from '../../src/core/countryside-cabin-story.js';

function requireOk(label, result) {
  if (result?.ok) return result;
  throw new Error(`${label} failed: ${result?.reason ?? 'unknown reason'}`);
}

/**
 * Advance a real CountrysideCabinStory through its complete public contract.
 * Route tests use this instead of minting time-event markers by hand, so a
 * production guard added to the chapter also guards the campaign marathon.
 */
export function completeCabinChapter(story) {
  requireOk('Lou opening call', story.completeOpeningCall());
  requireOk('creek exploration', story.visit('creek'));
  requireOk('Margo hook', story.consumeMargoReady());
  requireOk('range exploration', story.visit('range'));
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
  requireOk('morning call', story.completeMorningCall());
  return requireOk('morning wake', story.completeMorningWake());
}
