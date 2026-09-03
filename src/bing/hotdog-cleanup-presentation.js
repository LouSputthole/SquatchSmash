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
  for (const marker of Object.values(party.cleanup.evidenceMarkers ?? {})) {
    marker.visible = !evidenceDone;
  }
  if (completed.has('final_sweep')) {
    // The circle round the pool has done its job with the pool.
    if (party.cleanup.sweepMarker) party.cleanup.sweepMarker.visible = false;
    party.banner.visible = false;
    party.food.group.visible = false;
    party.cleanup.brokenStool.visible = false;
    if (party.cleanup.blood.material) party.cleanup.blood.material.opacity = 0.2;
    party.cleanup.blood.traverse?.((node) => {
      if (node.material) node.material.opacity = 0.2;
    });
  }
}
