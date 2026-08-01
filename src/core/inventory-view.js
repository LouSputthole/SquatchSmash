/**
 * Turn any scene's loadout into the one stable five-box inventory language.
 * This module deliberately knows nothing about the DOM or Three.js so every
 * scene can use it and CI can verify the contract without booting a renderer.
 */
export function inventorySlotView({ slots = 5, items = [], selected = 0, catalog = {} } = {}) {
  const count = Number.isFinite(slots) ? Math.max(1, Math.floor(slots)) : 5;
  const active = Number.isFinite(selected)
    ? Math.max(0, Math.min(count - 1, Math.floor(selected)))
    : 0;

  return Array.from({ length: count }, (_, index) => {
    const raw = items[index] ?? null;
    const item = typeof raw === 'string' ? (catalog[raw] ?? { name: raw }) : raw;
    const label = item?.label ?? item?.name ?? item?.text ?? `Empty slot ${index + 1}`;
    return {
      key: String(index + 1),
      icon: item?.icon ?? '',
      label,
      selected: index === active,
    };
  });
}
