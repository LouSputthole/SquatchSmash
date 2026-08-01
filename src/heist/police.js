export class PoliceDirector {
  constructor(blocks = {}) {
    this.blocks = new Map(Object.entries(blocks).map(([id, block]) => [id, {
      budget: block.budget,
      spawned: 0,
      active: 0,
      gates: [...block.gates],
      closed: false,
    }]));
  }

  request(blockId, { visibleGates = [], count = 1 } = {}) {
    const block = this.blocks.get(blockId);
    if (!block || block.closed) return [];
    const available = block.gates.filter((gate) => !visibleGates.includes(gate));
    if (!available.length) return [];
    const allowed = Math.max(0, Math.min(count, block.budget - block.spawned));
    const spawns = [];
    for (let i = 0; i < allowed; i++) {
      spawns.push(available[(block.spawned + i) % available.length]);
    }
    block.spawned += spawns.length;
    block.active += spawns.length;
    if (block.spawned >= block.budget) block.closed = true;
    return spawns;
  }

  remove(blockId, count = 1) {
    const block = this.blocks.get(blockId);
    if (block) block.active = Math.max(0, block.active - count);
  }

  close(blockId) { const block = this.blocks.get(blockId); if (block) block.closed = true; }
  capture() { return Object.fromEntries([...this.blocks].map(([id, b]) => [id, { ...b, gates: [...b.gates] }])); }
  restore(snapshot = {}) { this.blocks = new Map(Object.entries(snapshot).map(([id, b]) => [id, { ...b, gates: [...b.gates] }])); }
  reset() { for (const block of this.blocks.values()) { block.spawned = 0; block.active = 0; } }
}
