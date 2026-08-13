export class AuthoredNavigationGraph {
  constructor(anchors = []) {
    this.anchors = new Map();
    this.occupants = new Map();
    for (const anchor of anchors) this.add(anchor);
  }

  add({ id, zone, roles = [], neighbors = [], recovery = false, lane = null }) {
    if (!id || this.anchors.has(id)) throw new Error(`Duplicate anchor ${id}`);
    this.anchors.set(id, {
      id, zone, roles: new Set(roles), neighbors: [...neighbors], recovery, lane,
    });
  }

  occupy(anchorId, actorId) {
    if (!this.anchors.has(anchorId)) return false;
    const held = this.occupants.get(anchorId);
    if (held && held !== actorId) return false;
    for (const [id, occupant] of this.occupants) {
      if (occupant === actorId) this.occupants.delete(id);
    }
    this.occupants.set(anchorId, actorId);
    return true;
  }

  releaseActor(actorId) {
    for (const [id, occupant] of this.occupants) {
      if (occupant === actorId) this.occupants.delete(id);
    }
  }

  findPath(startId, predicate, actorId = null) {
    if (!this.anchors.has(startId)) return null;
    const queue = [[startId]];
    const visited = new Set([startId]);
    while (queue.length) {
      const path = queue.shift();
      const id = path[path.length - 1];
      const anchor = this.anchors.get(id);
      const occupied = this.occupants.has(id) && this.occupants.get(id) !== actorId;
      if (!occupied && predicate(anchor)) return path;
      for (const next of anchor.neighbors) {
        if (this.anchors.has(next) && !visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
      }
    }
    return null;
  }

  destination(startId, { zone, role, actorId }) {
    const path = this.findPath(startId, (anchor) => anchor.zone === zone
      && (!role || anchor.roles.size === 0 || anchor.roles.has(role)), actorId);
    return path?.at(-1) ?? null;
  }

  recovery(startId, actorId) {
    const path = this.findPath(startId, (anchor) => anchor.recovery, actorId);
    return path?.at(-1) ?? null;
  }

  capture() { return Object.fromEntries(this.occupants); }
  restore(value = {}) { this.occupants = new Map(Object.entries(value)); }
  reset() { this.occupants.clear(); }
}

export class SquadDirector {
  constructor({ graph, actors }) {
    this.graph = graph;
    this.actors = actors;
    this.blockedFor = new Map();
  }

  assign(actorId, zone) {
    const actor = this.actors.get(actorId);
    if (!actor) return false;
    const destination = this.graph.destination(actor.anchor, {
      zone, role: actor.role, actorId,
    });
    if (!destination || !this.graph.occupy(destination, actorId)) return false;
    actor.anchor = destination;
    this.blockedFor.delete(actorId);
    return true;
  }

  noteBlocked(actorId, dt) {
    const elapsed = (this.blockedFor.get(actorId) ?? 0) + Math.max(0, dt);
    this.blockedFor.set(actorId, elapsed);
    if (elapsed < 2.5) return { recover: false };
    const actor = this.actors.get(actorId);
    const anchor = actor ? this.graph.recovery(actor.anchor, actorId) : null;
    return { recover: Boolean(anchor), anchor, offscreenOnly: true };
  }

  /** Real travel breaks a blocked streak; separate waypoint pauses do not add. */
  noteMoving(actorId) {
    this.blockedFor.delete(actorId);
  }

  /**
   * Squad traffic is not a broken route. Clear obstruction patience while a
   * peer owns the next body-width, without claiming that the actor travelled.
   */
  noteCongested(actorId) {
    this.blockedFor.delete(actorId);
  }
}
