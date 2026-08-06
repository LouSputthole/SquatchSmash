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
 *
 * ## THE FRONT DOOR IS THE WAY IN
 *
 * OWNER DIRECTION, 2026-08-05, verbatim:
 *
 *   "I want the main fight to take place from the balcony as they come up the
 *    stairs or come in the front door. for the mansion siege."
 *   "everyone should funnel in through the main door"
 *
 * This file used to stage twenty-two men across six zones -- the forecourt,
 * the porch, the east bay's glass, the trophy hall's glass, the rear service
 * door and the south terrace -- which made the defence a 360-degree problem
 * fought from a balcony that can only see one of those six. The fight was not
 * legible and it was not at the rail.
 *
 * THE SPLIT, AND WHY: eighteen of twenty-two (82%) come up the drive and
 * through `FRONT_DOOR`. The other four are ONE group, 2B, arriving late in
 * the second wave through two panes on opposite flanks. That is deliberately
 * not zero: the brief's other standing instruction is that "twenty-two
 * identical riflemen walking through the same doorway is not an encounter",
 * and a defence with no reason ever to turn round is a shooting gallery. Four
 * men, once, in the middle of the last wave, is the amount of "look away from
 * the stairs" the position can take without stopping being a staircase fight.
 *
 * Wave one is therefore ALL front door: it teaches the shape -- drive, steps,
 * door, foyer, one of the two flights, the rail. Wave two breaks it once and
 * then goes back to the door for its final push.
 *
 * The two removed zones, and why they are not merely unused:
 *
 *   `veranda`      staged at (-6, 33) and walked in at x -6, which is the
 *                  foyer's own two-storey entrance GLAZING, not a terrace
 *                  door. It read as a second front door that is not a door.
 *   `rear_service` the kitchen door at (16, 66) is thirty metres of house
 *                  from the foyer. With real nav he now walks kitchen ->
 *                  lounge -> the arch -> the foyer's rear, which is a fine
 *                  route and a two-minute one; he arrives after the group he
 *                  was released with is dead. Kept in PART XIV as a future
 *                  vehicle for a third wave, not in this one.
 */

/**
 * Where attackers come from.
 *
 * `entry` names the anchor in `./nav.js` he walks to first, and everything
 * after it is the graph's business. Coordinates are the mansion's own -- the
 * verifier checks each one lies in the region its comment names, so a zone
 * cannot quietly drift inside a wall.
 */
export const STAGING = Object.freeze({
  /* Up the drive, north of the abandoned Lincoln at (0, 18.4) and clear of
   * the lamp posts standing in the carriageway at x +/-4.6. He walks past the
   * fountain and the burning cars to the steps. */
  court_north: Object.freeze({
    id: 'court_north', x: 0, z: 20.5, indoor: false,
    entry: 'drive_head', label: 'the drive',
  }),
  /* The bottom of the front steps (z 34..35.5), straight up and in through
   * FRONT_DOOR at (0, 36). The turnaround's north arc, z 27..34, is left
   * empty by `dressing.js` precisely so this walk-in reads. */
  front_steps: Object.freeze({
    id: 'front_steps', x: 0, z: 33.0, indoor: false,
    entry: 'steps_centre', label: 'the front steps',
  }),
  /* THE EAST FLANK, and it is one group in one wave. Outside the east bay,
   * not in it: LOUNGE_BAY (x 16..20.6, z 41..54) is a roofed glazed bay -- a
   * room, not a terrace -- so staging at its centre would put a man inside
   * the house he is about to break into. He stands on the service-road verge
   * beyond it and comes through `bayEastMid`. */
  lounge_bay: Object.freeze({
    id: 'lounge_bay', x: 26.5, z: 43.75, indoor: false,
    entry: 'lawn_bay', label: 'the lounge bay glass',
  }),
  /* The west flank, and it is NOT the west living room's windows.
   *
   * The brief staged wave 2B on "a side entrance, broken window, or adjoining
   * room" and the obvious read was the living room's own west glazing. It is
   * not reachable: the WEST WING was later hung off that whole elevation
   * (x -24.6..-16, z 40.6..74.4), so those windows now look into the trophy
   * hall rather than onto the lawn. An attacker staged at x -18 would arrive
   * inside the trophy hall having walked through its roof.
   *
   * So the flank comes in one room further out -- through the trophy hall's
   * OWN glazing at z 43.0..46.4, across the hall, through the arcade into the
   * living room and out of its arch into the back of the foyer. That is a
   * longer route and a better one: the flanker arrives behind the player's
   * shoulder instead of through a wall he was already watching. */
  living_west: Object.freeze({
    id: 'living_west', x: -28.5, z: 44.4, indoor: false,
    entry: 'lawn_trophy', label: 'the trophy hall glass',
  }),
  /* The cellar corridor itself -- the two men already in the house. */
  cellar_hall: Object.freeze({
    id: 'cellar_hall', x: -4, z: 65.8, indoor: true,
    entry: 'cellar_west', label: 'the cellar corridor',
  }),
  /* The vault end of the same corridor. */
  cellar_vault: Object.freeze({
    id: 'cellar_vault', x: 9.4, z: 65.8, indoor: true,
    entry: 'cellar_vault_door', label: 'the vault door',
  }),
  /* Inside the foyer, already past the door when the player comes up. */
  foyer_floor: Object.freeze({
    id: 'foyer_floor', x: 0, z: 41.6, indoor: true,
    entry: 'foyer_centre', label: 'the foyer floor',
  }),
  /* The foyer's own door line -- the man holding the entrance when the
   * player comes up the basement stair behind him. */
  foyer_door_line: Object.freeze({
    id: 'foyer_door_line', x: 0, z: 37.3, indoor: true,
    entry: 'foyer_door', label: 'the front doors',
  }),
  /* And one in the lounge, coming through its arch. The foyer three are all
   * indoors because the brief says they are: "already past the door when the
   * player comes up". */
  lounge_inside: Object.freeze({
    id: 'lounge_inside', x: 10.4, z: 45.2, indoor: true,
    entry: 'lounge_south', label: 'the lounge arch',
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
     * be able to fight it from one doorway.
     *
     * All three stage INDOORS. They were in the house before he came up the
     * basement stair -- that is what the brief means by "already past the
     * door" -- and staging the third of them on the far lawn made him arrive
     * ninety seconds into a fight that is supposed to be over in twenty. */
    members: Object.freeze([
      Object.freeze({ id: 'foyer_1', role: 'rifle', staging: 'foyer_floor', cover: 'centrepiece' }),
      Object.freeze({ id: 'foyer_2', role: 'smg', staging: 'foyer_door_line', cover: 'front_door' }),
      Object.freeze({ id: 'foyer_3', role: 'flanker', staging: 'lounge_inside', cover: 'lounge_arch' }),
    ]),
  }),
});

/**
 * The staircase defence. Twenty-two men in five groups.
 *
 * `after` is seconds since the previous group released. `whenRemaining` is
 * how many of everything already released must still be standing before the
 * next group is held back -- drop to that number or below and it comes early.
 *
 * `flank: true` marks the one group that does not come through the front
 * door. There is exactly one, `frontDoorShare()` asserts the proportion, and
 * a test holds it above four fifths.
 */
export const WAVES = Object.freeze([
  Object.freeze({
    id: 'one',
    label: 'Wave one',
    groups: Object.freeze([
      /* Straight up the drive and in. Two already on the steps, two walking
       * up from the turnaround, so the first contact is immediate and the
       * second arrives while he is dealing with it. */
      Object.freeze({
        id: '1A', count: 4, after: 0, whenRemaining: null,
        staging: Object.freeze(['front_steps', 'court_north', 'front_steps', 'court_north']),
        roles: Object.freeze(['rifle', 'rifle', 'rifle', 'smg']),
      }),
      /* Same door. The flanker in this group flanks INSIDE -- he takes the
       * other flight of the horseshoe, which is the split the house was built
       * to offer and the reason the player cannot hold one arc. */
      Object.freeze({
        id: '1B', count: 4, after: 22, whenRemaining: 2,
        staging: Object.freeze(['court_north', 'front_steps', 'court_north', 'front_steps']),
        roles: Object.freeze(['rifle', 'rifle', 'smg', 'flanker']),
      }),
    ]),
  }),
  Object.freeze({
    id: 'two',
    label: 'Wave two',
    groups: Object.freeze([
      /* Front door again, with the suppressor who sets up on the door line
       * and pins the rail rather than climbing. */
      Object.freeze({
        id: '2A', count: 5, after: 0, whenRemaining: null,
        staging: Object.freeze(['front_steps', 'front_steps', 'court_north', 'court_north', 'court_north']),
        roles: Object.freeze(['rifle', 'rifle', 'rifle', 'suppressor', 'smg']),
      }),
      /* THE ONE TIME HE HAS TO LOOK AWAY FROM THE STAIRS. Two panes go at
       * once on opposite flanks -- the trophy hall's west glazing and the
       * billiard bay's east -- and four men come through the wings into the
       * BACK of the foyer, behind the horseshoe. They are the only four of
       * twenty-two who are not on the drive. */
      Object.freeze({
        id: '2B', count: 4, after: 18, whenRemaining: 3, flank: true,
        staging: Object.freeze(['living_west', 'living_west', 'lounge_bay', 'lounge_bay']),
        roles: Object.freeze(['shotgun', 'rifle', 'rifle', 'flanker']),
      }),
      /* And back to the door for the last push, with the three men who make
       * 2C the hardest group rather than merely the longest. */
      Object.freeze({
        id: '2C', count: 5, after: 20, whenRemaining: 3,
        staging: Object.freeze(['front_steps', 'court_north', 'front_steps', 'court_north', 'court_north']),
        roles: Object.freeze(['leader', 'armored', 'gunner', 'rifle', 'rifle']),
      }),
    ]),
  }),
]);

/** Staging zones that funnel through `FRONT_DOOR`. */
export const FRONT_DOOR_STAGING = Object.freeze(new Set(['court_north', 'front_steps']));

/**
 * How much of the staircase defence comes in the front door.
 *
 * Exported because it is the direction, not a statistic: the owner asked for
 * everybody to funnel through the main door and the brief asks for the fight
 * not to be one queue, and this is the single number that says whether both
 * are still true.
 */
export function frontDoorShare() {
  let front = 0;
  let total = 0;
  for (const wave of WAVES) {
    for (const group of wave.groups) {
      for (let i = 0; i < group.count; i++) {
        total++;
        if (FRONT_DOOR_STAGING.has(group.staging[i % group.staging.length])) front++;
      }
    }
  }
  return { front, total, share: total ? front / total : 0 };
}

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
