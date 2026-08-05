/**
 * The siege's encounters: two men in the cellar corridor, three in the foyer,
 * and then twenty-two up the stairs in two waves.
 *
 * PURE ON PURPOSE. No THREE, no scene, no meshes. This file decides WHO
 * exists, WHERE they come in and WHEN they are released; the scene decides
 * what they look like and the shared combat core decides what happens when
 * they are shot. That split is what lets the whole wave structure -- the
 * part most likely to be wrong -- be tested headless in milliseconds instead
 * of by standing on a staircase for four minutes.
 *
 * THE RELEASE RULE IS THE DESIGN. From the brief:
 *
 *   "Do not wait until all of Wave 1A are dead. The second group should
 *    create pressure and prevent a slow cleanup."
 *
 * So a group releases on whichever comes first: a timer since the previous
 * group went in, or the previous groups being worn down to a threshold. A
 * player who fights fast triggers the next group by attrition; a player who
 * turtles triggers it by clock. Neither gets a quiet room.
 *
 * NOBODY APPEARS FROM THIN AIR. Every attacker is assigned a staging zone
 * outside the player's view and walks in from it. `release()` returns spawn
 * orders carrying the zone, not a position under the player's feet.
 */

/**
 * Where attackers come from. Coordinates are the mansion's own -- the
 * verifier checks each one lies in the region its comment names, so a zone
 * cannot quietly drift inside a wall.
 */
export const STAGING = Object.freeze({
  /* Behind the fountain and the burning cars. COURT_CENTRE (0, 30) r 12. */
  court_north: Object.freeze({
    id: 'court_north', x: 0, z: 26, indoor: false,
    approach: [[0, 33], [0, 36.5]], label: 'the forecourt',
  }),
  /* The porch, straight in through FRONT_DOOR at (0, 36). */
  front_steps: Object.freeze({
    id: 'front_steps', x: 0, z: 34, indoor: false,
    approach: [[0, 36.5], [0, 40]], label: 'the front steps',
  }),
  /* The east bay's glass. LOUNGE_BAY x 16..20.6, z 41..54. */
  lounge_bay: Object.freeze({
    id: 'lounge_bay', x: 18.5, z: 47, indoor: false,
    approach: [[14, 47], [10, 45]], label: 'the lounge bay',
  }),
  /* The west living room's windows. LIVING x -16..-9.15, z 36..57.85. */
  living_west: Object.freeze({
    id: 'living_west', x: -18, z: 46, indoor: false,
    approach: [[-13, 46], [-9.5, 44]], label: 'the west windows',
  }),
  /* The rear service door at (16, 66) -- the long way round the house. */
  rear_service: Object.freeze({
    id: 'rear_service', x: 20, z: 66, indoor: false,
    approach: [[16.5, 66], [12, 62]], label: 'the service door',
  }),
  /* The south terrace, under the balcony. */
  veranda: Object.freeze({
    id: 'veranda', x: -6, z: 33, indoor: false,
    approach: [[-6, 36.5], [-5, 41]], label: 'the veranda',
  }),
  /* The cellar corridor itself -- the two men already in the house. */
  cellar_hall: Object.freeze({
    id: 'cellar_hall', x: -4, z: 65.8, indoor: true,
    approach: [[0, 65.8]], label: 'the cellar corridor',
  }),
  /* The vault end of the same corridor. */
  cellar_vault: Object.freeze({
    id: 'cellar_vault', x: 8, z: 65.8, indoor: true,
    approach: [[4, 65.8]], label: 'the vault door',
  }),
  /* Inside the foyer, already past the door when the player comes up. */
  foyer_floor: Object.freeze({
    id: 'foyer_floor', x: 0, z: 44, indoor: true,
    approach: [[0, 48]], label: 'the foyer floor',
  }),
});

/**
 * Attacker roles. The brief is explicit that twenty-two identical riflemen
 * walking through one doorway is not an encounter, so every group below
 * mixes these, and the mix is what makes 2C read as the hardest push rather
 * than simply the longest.
 */
export const ROLES = Object.freeze({
  rifle: Object.freeze({ id: 'rifle', health: 90, armor: 0, range: 26, aggression: 0.5 }),
  smg: Object.freeze({ id: 'smg', health: 80, armor: 0, range: 16, aggression: 0.75 }),
  shotgun: Object.freeze({ id: 'shotgun', health: 95, armor: 8, range: 9, aggression: 1 }),
  flanker: Object.freeze({ id: 'flanker', health: 80, armor: 0, range: 18, aggression: 0.85 }),
  suppressor: Object.freeze({ id: 'suppressor', health: 95, armor: 6, range: 30, aggression: 0.3 }),
  armored: Object.freeze({ id: 'armored', health: 120, armor: 45, range: 20, aggression: 0.6 }),
  leader: Object.freeze({ id: 'leader', health: 105, armor: 20, range: 24, aggression: 0.55 }),
  gunner: Object.freeze({ id: 'gunner', health: 110, armor: 25, range: 28, aggression: 0.4 }),
});

/** The two fights on the way to Lou's office. Neither is a wave. */
export const ENCOUNTERS = Object.freeze({
  corridor: Object.freeze({
    id: 'corridor',
    label: 'the cellar corridor',
    /* The first shots the player is in. Two men, and the first one has his
     * back turned until the guest-room door opens. */
    members: Object.freeze([
      Object.freeze({ id: 'corridor_1', role: 'rifle', staging: 'cellar_hall', facing: 'east', alertAt: 'door' }),
      Object.freeze({ id: 'corridor_2', role: 'smg', staging: 'cellar_vault', facing: 'east', alertAt: 'contact' }),
    ]),
  }),
  foyer: Object.freeze({
    id: 'foyer',
    label: 'the foyer',
    /* Louder than the corridor, shorter than a wave. The player should not
     * be able to fight it from one doorway. */
    members: Object.freeze([
      Object.freeze({ id: 'foyer_1', role: 'rifle', staging: 'foyer_floor', cover: 'centrepiece' }),
      Object.freeze({ id: 'foyer_2', role: 'smg', staging: 'front_steps', cover: 'front_door' }),
      Object.freeze({ id: 'foyer_3', role: 'flanker', staging: 'lounge_bay', cover: 'lounge_arch' }),
    ]),
  }),
});

/**
 * The staircase defence. Twenty-two men in five groups.
 *
 * `after` is seconds since the previous group released. `whenRemaining` is
 * how many of everything already released must still be standing before the
 * next group is held back -- drop to that number or below and it comes early.
 */
export const WAVES = Object.freeze([
  Object.freeze({
    id: 'one',
    label: 'Wave one',
    groups: Object.freeze([
      Object.freeze({
        id: '1A', count: 4, after: 0, whenRemaining: null,
        staging: Object.freeze(['front_steps', 'court_north', 'front_steps', 'court_north']),
        roles: Object.freeze(['rifle', 'rifle', 'rifle', 'smg']),
      }),
      Object.freeze({
        id: '1B', count: 4, after: 22, whenRemaining: 2,
        staging: Object.freeze(['lounge_bay', 'lounge_bay', 'veranda', 'court_north']),
        roles: Object.freeze(['rifle', 'rifle', 'smg', 'flanker']),
      }),
    ]),
  }),
  Object.freeze({
    id: 'two',
    label: 'Wave two',
    groups: Object.freeze([
      Object.freeze({
        id: '2A', count: 5, after: 0, whenRemaining: null,
        staging: Object.freeze(['front_steps', 'front_steps', 'court_north', 'court_north', 'veranda']),
        roles: Object.freeze(['rifle', 'rifle', 'rifle', 'suppressor', 'smg']),
      }),
      Object.freeze({
        id: '2B', count: 4, after: 18, whenRemaining: 3,
        staging: Object.freeze(['living_west', 'living_west', 'rear_service', 'lounge_bay']),
        roles: Object.freeze(['shotgun', 'rifle', 'rifle', 'flanker']),
      }),
      Object.freeze({
        id: '2C', count: 5, after: 20, whenRemaining: 3,
        staging: Object.freeze(['front_steps', 'court_north', 'lounge_bay', 'front_steps', 'court_north']),
        roles: Object.freeze(['leader', 'armored', 'gunner', 'rifle', 'rifle']),
      }),
    ]),
  }),
]);

/**
 * The volume the defence is fought in. An attacker who leaves it is pulled
 * back rather than allowed to wander into the hedge maze and strand the
 * wave-cleared check forever.
 */
export const COMBAT_BOUNDARY = Object.freeze({
  x0: -32, x1: 32, y0: -4, y1: 12, z0: 18, z1: 80,
});

/** The firing step: the gallery edge and the balcony bay above the foyer. */
export const DEFENCE_POST = Object.freeze({
  x0: -8.85, x1: 8.85, y: 6.0, z0: 45.2, z1: 48.4,
});

export function waveById(id) {
  return WAVES.find((wave) => wave.id === id) ?? null;
}

/** Every attacker the whole mission ever spawns. Handy for budgeting. */
export function totalAttackers() {
  const encounters = Object.values(ENCOUNTERS)
    .reduce((sum, e) => sum + e.members.length, 0);
  const waves = WAVES.reduce((sum, wave) => sum
    + wave.groups.reduce((n, group) => n + group.count, 0), 0);
  return { encounters, waves, total: encounters + waves };
}

/**
 * Runs one wave. The mission owns two of these, one after the other, with a
 * lull between them.
 */
export class WaveDirector {
  constructor({ wave, onSpawn = null, idPrefix = '' } = {}) {
    const definition = typeof wave === 'string' ? waveById(wave) : wave;
    if (!definition) throw new Error(`Unknown wave: ${wave}`);
    this.wave = definition;
    this.onSpawn = onSpawn;
    this.idPrefix = idPrefix;
    this.reset();
  }

  reset() {
    this.started = false;
    this.finished = false;
    this.released = [];
    this.sinceRelease = 0;
    /** Attacker ids that have been spawned and are still standing. */
    this.standing = new Set();
    /** Attacker ids that have gone down. */
    this.down = new Set();
  }

  get pendingGroups() {
    return this.wave.groups.filter((group) => !this.released.includes(group.id));
  }

  get spawnedCount() { return this.standing.size + this.down.size; }
  get totalCount() { return this.wave.groups.reduce((n, g) => n + g.count, 0); }

  /**
   * Cleared means every attacker this wave owns has been spawned AND is
   * down. Checking only `standing.size === 0` would call the wave clear in
   * the half-second before its first group releases.
   */
  get cleared() {
    return this.started
      && this.pendingGroups.length === 0
      && this.standing.size === 0;
  }

  begin() {
    if (this.started) return [];
    this.started = true;
    this.sinceRelease = 0;
    return this._releaseNext();
  }

  update(dt) {
    if (!this.started || this.finished) return [];
    this.sinceRelease += Math.max(0, Number(dt) || 0);
    const next = this.pendingGroups[0];
    if (!next) {
      if (this.cleared) this.finished = true;
      return [];
    }
    const byClock = this.sinceRelease >= next.after;
    const byAttrition = next.whenRemaining !== null
      && this.standing.size <= next.whenRemaining;
    if (!byClock && !byAttrition) return [];
    return this._releaseNext(byAttrition && !byClock ? 'attrition' : 'clock');
  }

  _releaseNext(trigger = 'start') {
    const group = this.pendingGroups[0];
    if (!group) return [];
    this.released.push(group.id);
    this.sinceRelease = 0;
    const orders = [];
    for (let i = 0; i < group.count; i++) {
      const stagingId = group.staging[i % group.staging.length];
      const staging = STAGING[stagingId];
      if (!staging) throw new Error(`${group.id} slot ${i} names unknown staging "${stagingId}"`);
      const roleId = group.roles[i % group.roles.length];
      const role = ROLES[roleId];
      if (!role) throw new Error(`${group.id} slot ${i} names unknown role "${roleId}"`);
      const id = `${this.idPrefix}${this.wave.id}_${group.id}_${i}`;
      this.standing.add(id);
      orders.push({ id, group: group.id, wave: this.wave.id, role, staging, trigger });
    }
    for (const order of orders) this.onSpawn?.(order);
    return orders;
  }

  /** Called by the scene when an attacker is killed or incapacitated. */
  noteDown(id) {
    if (!this.standing.delete(id)) return false;
    this.down.add(id);
    if (this.cleared) this.finished = true;
    return true;
  }

  snapshot() {
    return {
      wave: this.wave.id,
      started: this.started,
      finished: this.finished,
      released: [...this.released],
      sinceRelease: this.sinceRelease,
      standing: [...this.standing],
      down: [...this.down],
    };
  }

  restore(snapshot) {
    if (!snapshot || snapshot.wave !== this.wave.id) {
      throw new Error(`Wave snapshot mismatch: expected ${this.wave.id}`);
    }
    this.started = snapshot.started === true;
    this.finished = snapshot.finished === true;
    this.released = [...(snapshot.released ?? [])];
    this.sinceRelease = Number(snapshot.sinceRelease) || 0;
    this.standing = new Set(snapshot.standing ?? []);
    this.down = new Set(snapshot.down ?? []);
    return this;
  }
}
