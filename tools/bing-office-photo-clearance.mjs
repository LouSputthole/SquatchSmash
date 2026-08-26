/**
 * Measure the two lower photographs on Lou's office door wall.
 *
 * This function is deliberately self-contained: verify-bing passes it directly
 * to Playwright's page.evaluate(), while the focused test runs it against a
 * headless club. Do not capture module-scope values here.
 */
export async function measureBingOfficePhotoClearance() {
  const b = window.__bing;
  await b.club.artReady;

  const T = b.THREE;
  const boxOf = (object) => {
    object.updateMatrixWorld(true);
    return new T.Box3().setFromObject(object);
  };
  const wantedSlots = [
    'bing.office.nephews',
    'bing.office.old_place',
  ];
  const framesBySlot = new Map(wantedSlots.map((slot) => [slot, []]));

  b.club.root.traverse((object) => {
    if (object.name !== 'frame') return;
    const slotsInFrame = new Set();
    object.traverse((child) => {
      const slot = child.userData?.art?.slot;
      if (framesBySlot.has(slot)) slotsInFrame.add(slot);
    });
    for (const slot of slotsInFrame) framesBySlot.get(slot).push(boxOf(object));
  });

  const pictures = wantedSlots.reduce((count, slot) => count + framesBySlot.get(slot).length, 0);
  const nephews = framesBySlot.get('bing.office.nephews')[0] ?? null;
  const oldPlace = framesBySlot.get('bing.office.old_place')[0] ?? null;
  const glassEdge = (b.club.doors.lou.glass || [])
    .reduce((z, pane) => Math.max(z, boxOf(pane).max.z), -Infinity);
  const exactPair = pictures === 2 && nephews && oldPlace;

  return {
    pictures,
    nephewsOffTheGlass: !!exactPair && nephews.min.z > glassEdge + 0.02,
    nephewsGap: exactPair ? +(oldPlace.min.z - nephews.max.z).toFixed(3) : -1,
  };
}
