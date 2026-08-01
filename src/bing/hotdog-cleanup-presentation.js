export function restoreHotDogCleanupPresentation(party, cleanupTasks = []) {
  const completed = new Set(cleanupTasks);
  const bathroomsDone = completed.has('bathrooms');
  for (const pad of Object.values(party.cleanup.bathroomPads)) {
    pad.visible = !bathroomsDone;
  }
  party.cleanup.kit.visible = !completed.has('cleaning_kit');
  const evidenceDone = completed.has('missing_evidence');
  party.cleanup.cufflink.visible = !evidenceDone;
  party.cleanup.lapel.visible = !evidenceDone;
  if (completed.has('final_sweep')) {
    party.banner.visible = false;
    party.food.group.visible = false;
    party.cleanup.brokenStool.visible = false;
    party.cleanup.blood.material.opacity = 0.2;
  }
}
