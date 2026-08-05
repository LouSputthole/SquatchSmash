/**
 * One firefight, configured, not scripted.
 *
 * A mission hands EncounterController a config object and callbacks and gets
 * back spawn orders, reinforcement timing, completion/failure decisions and
 * checkpoint capture/restore — without owning any combat logic itself. The
 * controller is presentation-free: it says WHO should exist WHERE and WHEN;
 * the scene's combatant layer builds the bodies.
 *
 * Config shape (see docs/COMBAT-FRAMEWORK.md for the full reference):
 *
 *   {
 *     id: 'yard-fight',
 *     groups: [{ id, archetype, count, spawns:[{x,z,yaw}], faction,
 *                patrol?, alert?: 'unaware'|'alerted', leader?: true }],
 *     reinforcements: [{ id, group, entry, after?: seconds,
 *                        onDeaths?: n, onAlert?: true, limit?: waves }],
 *     entries: { doorId: {x, z, yaw} },        // believable arrival points
 *     boundary?: { x, z, w, d },               // combat area, keeps AI inside
 *     retreatPoints?: [{x,z}],
 *     missionCritical?: ['id'],                // protected, kill = never
 *     failOnKill?: ['id'],
 *     complete?: { allDead?: true, survive?: seconds, custom?: (ec)=>bool },
 *     fail?: { playerDead?: true, custom?: (ec)=>bool },
 *     bodyCleanup?: { linger, minimum },
 *   }
 *
 * Events out (all optional): onSpawn(order), onReinforce(wave), onKill(info),
 * onComplete(), onFail(reason), onMusic(state), onDialogue(key).
 */
export class EncounterController {
  constructor(config, callbacks = {}) {
    this.config = config;
    this.cb = callbacks;
    this.id = config.id ?? 'encounter';
    this.state = 'idle'; // idle | running | complete | failed
    this.clock = 0;
    this.kills = 0;
    this.deaths = new Set(); // combatant ids
    this.spawned = new Map(); // id -> {group, alive}
    this.wavesSent = new Map(); // reinforcement id -> count
    this.alerted = false;
    this._pendingReinforce = [];
    this.history = ['idle'];
  }

  /** Start: emits one spawn order per configured body. */
  begin() {
    if (this.state !== 'idle') return false;
    this.state = 'running';
    this.history.push('running');
    let n = 0;
    for (const group of this.config.groups ?? []) {
      for (let i = 0; i < (group.count ?? group.spawns?.length ?? 1); i++) {
        const spawn = group.spawns?.[i % (group.spawns?.length || 1)] ?? { x: 0, z: 0, yaw: 0 };
        const id = `${this.id}.${group.id}.${n++}`;
        this.spawned.set(id, { group: group.id, alive: true });
        this.cb.onSpawn?.({
          id,
          archetype: group.archetype,
          faction: group.faction ?? 'police',
          spawn,
          patrol: group.patrol ?? null,
          alert: group.alert ?? 'unaware',
          leader: group.leader === true && i === 0,
        });
      }
    }
    this.cb.onMusic?.('combat-ready');
    return true;
  }

  /** The scene tells the controller somebody died. */
  reportKill({ id, byPlayer = false, faction = null, headshot = false }) {
    if (this.deaths.has(id)) return; // restores must not double-count
    this.deaths.add(id);
    const s = this.spawned.get(id);
    if (s) s.alive = false;
    this.kills++;
    this.cb.onKill?.({ id, byPlayer, faction, headshot, kills: this.kills });
    this._check();
  }

  reportAlert() {
    if (!this.alerted) {
      this.alerted = true;
      this.cb.onMusic?.('combat');
      this.cb.onDialogue?.('alerted');
    }
  }

  reportPlayerDead() {
    if (this.state !== 'running') return;
    if (this.config.fail?.playerDead !== false) this._fail('player-dead');
  }

  get aliveCount() {
    let n = 0;
    for (const s of this.spawned.values()) if (s.alive) n++;
    return n;
  }

  aliveInGroup(groupId) {
    let n = 0;
    for (const s of this.spawned.values()) if (s.alive && s.group === groupId) n++;
    return n;
  }

  update(dt) {
    if (this.state !== 'running') return;
    this.clock += Math.max(0, dt);

    for (const r of this.config.reinforcements ?? []) {
      const sent = this.wavesSent.get(r.id) ?? 0;
      if (sent >= (r.limit ?? 1)) continue;
      const due = (r.after !== undefined && this.clock >= r.after)
        || (r.onDeaths !== undefined && this.kills >= r.onDeaths)
        || (r.onAlert === true && this.alerted);
      if (!due) continue;
      this.wavesSent.set(r.id, sent + 1);
      this._sendWave(r, sent);
    }
    this._check();
  }

  _sendWave(r, waveIndex) {
    const group = (this.config.groups ?? []).find((g) => g.id === r.group);
    const entry = this.config.entries?.[r.entry] ?? { x: 0, z: 0, yaw: 0 };
    const count = r.count ?? group?.count ?? 2;
    this.cb.onDialogue?.('reinforcements');
    let n = 0;
    for (let i = 0; i < count; i++) {
      const id = `${this.id}.${r.id}.w${waveIndex}.${n++}`;
      this.spawned.set(id, { group: r.group, alive: true });
      this.cb.onSpawn?.({
        id,
        archetype: r.archetype ?? group?.archetype ?? 'rifleman',
        faction: r.faction ?? group?.faction ?? 'police',
        /* Reinforcements arrive AT the entry — a door, a stair, a gate —
         * never materialising in the player's view. Where the entry is, is
         * the level's promise to keep. */
        spawn: { x: entry.x, z: entry.z, yaw: entry.yaw ?? 0, stagger: i * (r.stagger ?? 0.8) },
        alert: 'alerted',
        leader: false,
        entry: r.entry,
      });
    }
    this.cb.onReinforce?.({ id: r.id, wave: waveIndex, count });
  }

  _check() {
    if (this.state !== 'running') return;
    const c = this.config.complete ?? { allDead: true };
    if (c.custom?.(this)) return this._complete();
    if (c.allDead && this.aliveCount === 0 && this._allWavesSent()) return this._complete();
    if (c.survive !== undefined && this.clock >= c.survive) return this._complete();
    const f = this.config.fail ?? {};
    if (f.custom?.(this)) return this._fail('custom');
    return undefined;
  }

  _allWavesSent() {
    for (const r of this.config.reinforcements ?? []) {
      if ((this.wavesSent.get(r.id) ?? 0) < (r.limit ?? 1)) {
        // Timed/alert waves still owed hold completion; death-triggered
        // waves that can no longer trigger do not.
        if (r.after !== undefined || r.onAlert) return false;
        if (r.onDeaths !== undefined && this.kills >= r.onDeaths) return false;
      }
    }
    return true;
  }

  _complete() {
    this.state = 'complete';
    this.history.push('complete');
    this.cb.onMusic?.('aftermath');
    this.cb.onComplete?.();
  }

  _fail(reason) {
    this.state = 'failed';
    this.history.push(`failed:${reason}`);
    this.cb.onFail?.(reason);
  }

  /* ---- checkpoints: CheckpointDirector-compatible adapter ---------- */

  capture() {
    return {
      state: this.state,
      clock: this.clock,
      kills: this.kills,
      deaths: [...this.deaths],
      alerted: this.alerted,
      waves: [...this.wavesSent.entries()],
      spawned: [...this.spawned.entries()].map(([id, s]) => [id, { ...s }]),
    };
  }

  restore(snap) {
    if (!snap) return;
    this.state = snap.state ?? 'idle';
    this.clock = snap.clock ?? 0;
    this.kills = snap.kills ?? 0;
    this.deaths = new Set(snap.deaths ?? []);
    this.alerted = snap.alerted === true;
    this.wavesSent = new Map(snap.waves ?? []);
    this.spawned = new Map((snap.spawned ?? []).map(([id, s]) => [id, { ...s }]));
    this.history.push('restored');
  }

  reset() {
    this.state = 'idle';
    this.clock = 0;
    this.kills = 0;
    this.deaths.clear();
    this.spawned.clear();
    this.wavesSent.clear();
    this.alerted = false;
    this.history.push('reset');
  }

  report() {
    return {
      id: this.id,
      state: this.state,
      clock: this.clock,
      kills: this.kills,
      alive: this.aliveCount,
      alerted: this.alerted,
      history: [...this.history],
    };
  }
}
