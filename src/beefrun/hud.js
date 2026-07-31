/**
 * The flight HUD.
 *
 * Deliberately thin: airspeed, altitude, heading, what the engines are doing,
 * where the cargo is, and one line telling you what the mission wants. The
 * cockpit view already has six real instruments in it — putting a second,
 * better set of them on the glass would make the panel decorative, which is
 * the opposite of the intention.
 *
 * Warnings are the exception. They are large, they are contextual, and they
 * disappear the moment the thing they are about stops being true.
 */
import { KT, FT } from './config.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);

const WARNINGS = {
  stall: { text: 'STALL', kind: 'red' },
  terrain: { text: 'TERRAIN', kind: 'red' },
  overspeed: { text: 'TOO FAST', kind: 'amber' },
  hot: { text: 'ENGINE HOT', kind: 'amber' },
  cargo: { text: 'CARGO SHIFT', kind: 'amber' },
  runway: { text: 'RUNWAY AHEAD', kind: 'green' },
  patrol: { text: 'PATROL SEARCHING', kind: 'amber' },
  located: { text: 'LOCATED', kind: 'red' },
  fuel: { text: 'FUEL LOW', kind: 'amber' },
  gear: { text: 'GEAR DAMAGE', kind: 'amber' },
};

export class FlightHud {
  constructor() {
    this.root = $('br-hud');
    this.speed = $('br-speed');
    this.speedTape = $('br-speed-tape');
    this.speedBand = $('br-speed-band');
    this.alt = $('br-alt');
    this.agl = $('br-agl');
    this.vsi = $('br-vsi');
    this.hdg = $('br-hdg');
    this.hdgTape = $('br-hdg-tape');
    this.bug = $('br-bug');
    this.nav = $('br-nav');
    this.objective = $('br-objective');
    this.warnings = $('br-warnings');
    this.engines = [$('br-eng-l'), $('br-eng-r')];
    this.flaps = $('br-flaps');
    this.cargo = $('br-cargo');
    this.cg = $('br-cg');
    this.cgNeedle = $('br-cg-needle');
    this.patrol = $('br-patrol');
    this.patrolFill = $('br-patrol-fill');
    this.patrolLabel = $('br-patrol-label');
    this.checkpoint = $('br-checkpoint');
    this.complete = $('br-complete');
    this.completeBody = $('br-complete-body');
    this.rank = $('br-rank');
    this.guide = $('br-guide');
    this.checklist = $('br-checklist');
    this.dir = $('br-dir');
    this.dirArrow = this.dir?.querySelector('.arrow');
    this.dirTag = this.dir?.querySelector('.tag');
    this.controls = $('br-controls');

    this._warnState = new Set();
    this._objective = '';
    this._hdgShown = -1;
    this.controlsWanted = true;      // until the player says otherwise
    this._controlsT = 0;
  }

  show(on = true) {
    this.root.classList.toggle('hidden', !on);
  }

  /** Flight instruments. Called every frame; only touches the DOM on change. */
  setFlight(p, { fuel = 1 } = {}) {
    const ias = Math.round(p.ias * KT);
    if (this._ias !== ias) {
      this._ias = ias;
      this.speed.textContent = String(ias);
      // The band: green where the approach wants to be, red at the bottom.
      const frac = clamp(ias / 160, 0, 1);
      this.speedTape.style.setProperty('--v', frac.toFixed(3));
    }
    const altFt = Math.round(p.position.y * FT / 10) * 10;
    if (this._alt !== altFt) {
      this._alt = altFt;
      this.alt.textContent = altFt.toLocaleString();
    }
    const aglFt = Math.max(0, Math.round(p.agl * FT / 10) * 10);
    if (this._aglFt !== aglFt) {
      this._aglFt = aglFt;
      this.agl.textContent = `${aglFt.toLocaleString()} AGL`;
      this.agl.classList.toggle('low', p.agl < 120 && !p.onGround);
    }
    const vs = Math.round(p.vspeed * FT * 60 / 50) * 50;
    if (this._vs !== vs) {
      this._vs = vs;
      this.vsi.textContent = `${vs > 0 ? '+' : ''}${vs}`;
      this.vsi.classList.toggle('down', vs < -700);
    }
    const hdg = Math.round(p.headingDeg);
    if (this._hdgShown !== hdg) {
      this._hdgShown = hdg;
      this.hdg.textContent = String(hdg).padStart(3, '0');
      this.hdgTape.style.setProperty('--h', String(hdg));
    }
    if (this._fuel !== Math.round(fuel * 20)) {
      this._fuel = Math.round(fuel * 20);
      this.root.style.setProperty('--fuel', fuel.toFixed(2));
    }
  }

  setEngines(engineSystem) {
    for (let i = 0; i < 2; i++) {
      const e = engineSystem.engines[i];
      const el = this.engines[i];
      const status = engineSystem.status(i);
      const sig = `${status}|${Math.round(e.temp / 5)}|${Math.round(e.throttle * 10)}`;
      if (el.dataset.sig === sig) continue;
      el.dataset.sig = sig;
      el.className = `eng ${status.toLowerCase()}`;
      el.querySelector('.val').textContent = status;
      el.querySelector('.bar i').style.width = `${clamp((e.temp - 40) / 260, 0, 1) * 100}%`;
    }
  }

  setFlaps(v) {
    const label = v === 0 ? 'UP' : v >= 1 ? 'FULL' : 'HALF';
    if (this._flaps === label) return;
    this._flaps = label;
    this.flaps.textContent = `FLAPS ${label}`;
    this.flaps.classList.toggle('out', v > 0);
  }

  /**
   * Cargo readout plus the balance diagram: a bar with a good band in the
   * middle and a needle. No numbers — the player needs to know "move one
   * forward", not a moment arm.
   */
  setCargo(cargo) {
    const count = cargo.crateCount;
    const strapped = cargo.allStrapped;
    const kind = cargo.kind;
    const sig = `${count}|${strapped}|${kind}|${cargo.balanceState}`;
    if (this._cargoSig !== sig) {
      this._cargoSig = sig;
      // What it says on the crates, which is not what is in them.
      const what = kind === 'guns' ? 'TRACTOR PARTS' : kind === 'mixed' ? 'MIXED' : 'JERKY';
      this.cargo.textContent = count === 0 ? 'EMPTY'
        : `${count} × ${what}${strapped ? '' : ' · LOOSE'}`;
      this.cargo.classList.toggle('warn', count > 0 && !strapped);
      this.cg.className = `cg ${cargo.balanceState}`;
      this.cg.classList.toggle('hidden', count === 0);
    }
    this.cgNeedle.style.setProperty('--b', cargo.balance.toFixed(3));
  }

  /**
   * The compass guidance: a bearing bug on the heading tape and the distance
   * to run, for whichever end of the route the mission currently wants. The
   * tape reads as ±60°; past that the bug pegs at the edge and dims, which
   * still says "turn this way" without drawing a heading that is not on it.
   *
   * @param {?{label: string, delta: number, nm: number}} nav null to hide
   */
  setNav(nav) {
    if (!nav) {
      if (this._navShown) {
        this._navShown = false;
        this.bug.classList.add('hidden');
        this.nav.classList.add('hidden');
      }
      return;
    }
    if (!this._navShown) {
      this._navShown = true;
      this.bug.classList.remove('hidden');
      this.nav.classList.remove('hidden');
    }
    const d = Math.round(clamp(nav.delta, -60, 60));
    const pegged = Math.abs(nav.delta) > 60;
    if (this._navD !== d || this._navPegged !== pegged) {
      this._navD = d;
      this._navPegged = pegged;
      this.bug.style.setProperty('--d', ((d / 60) * 50).toFixed(1));
      this.bug.classList.toggle('off', pegged);
    }
    const line = `${nav.label} · ${nav.nm.toFixed(1)} NM`;
    if (this._navLine !== line) {
      this._navLine = line;
      this.nav.textContent = line;
    }
  }

  /**
   * The objective, on the world.
   *
   * The heading tape says the same thing as a number on a scale, which is the
   * right readout for flying an intercept and the wrong one for "where am I
   * supposed to be going". This is the other half: a diamond sitting on the
   * place while it is on screen, and an arrow pinned to the edge pointing at
   * it while it is not. Both are fed from the same nav target as the bug, so
   * the two can never disagree.
   *
   * @param {?{onScreen: boolean, x: number, y: number, angle: number,
   *           label: string, nm: number}} d  x/y in per cent; null to hide
   */
  setDirection(d) {
    if (!this.dir) return;
    if (!d) {
      if (this._dirShown) {
        this._dirShown = false;
        this.dir.classList.add('hidden');
      }
      return;
    }
    if (!this._dirShown) {
      this._dirShown = true;
      this.dir.classList.remove('hidden');
    }
    this.dir.style.setProperty('--x', `${d.x.toFixed(2)}%`);
    this.dir.style.setProperty('--y', `${d.y.toFixed(2)}%`);
    if (this._dirEdge !== !d.onScreen) {
      this._dirEdge = !d.onScreen;
      this.dir.classList.toggle('edge', this._dirEdge);
    }
    this.dirArrow.style.setProperty('--a', d.onScreen ? '0deg' : `${d.angle.toFixed(1)}deg`);
    const tag = `${d.label} ${d.nm.toFixed(1)} NM`;
    if (this._dirTagText !== tag) {
      this._dirTagText = tag;
      this.dirTag.textContent = tag;
    }
  }

  /**
   * The controls card. Up and bright whenever a flight starts, stepping back
   * to a quarter of itself once the player has had a minute with it, and
   * toggled outright with H for anybody who already knows the aeroplane.
   */
  showControls(on) {
    if (!this.controls) return;
    this._controlsT = 0;
    this.controls.classList.toggle('hidden', !(on && this.controlsWanted));
    this.controls.classList.remove('faded');
  }

  toggleControls() {
    this.controlsWanted = !this.controlsWanted;
    if (!this.controls) return this.controlsWanted;
    this.controls.classList.toggle('hidden', !this.controlsWanted);
    if (this.controlsWanted) {
      this._controlsT = 0;
      this.controls.classList.remove('faded');
    }
    return this.controlsWanted;
  }

  /** Called every frame in the cockpit; fades the card once it has been read. */
  ageControls(dt) {
    if (!this.controls || this.controls.classList.contains('hidden')) return;
    this._controlsT += dt;
    if (this._controlsT > 22) this.controls.classList.add('faded');
  }

  setPatrol(state, meter) {
    this.patrol.classList.remove('hidden');
    this.patrolFill.style.width = `${Math.round(meter * 100)}%`;
    if (this._patrolState !== state) {
      this._patrolState = state;
      this.patrol.className = `patrol ${state}`;
      this.patrolLabel.textContent = state === 'located' ? 'LOCATED'
        : state === 'searching' ? 'SEARCHING' : 'UNNOTICED';
    }
  }

  hidePatrol() {
    this.patrol.classList.add('hidden');
    this._patrolState = null;
  }

  /** The walkaround checklist — on-foot, so independent of the flight HUD. */
  showChecklist(on) {
    this.checklist.classList.toggle('hidden', !on);
    if (!on) this._checkSig = null;
  }

  /** @param {Array<{label,count,need,state}>} rows state: done | next | todo */
  setChecklist(rows) {
    const sig = rows.map((r) => `${r.state}${r.count}`).join('|');
    if (this._checkSig === sig) return;
    this._checkSig = sig;
    this.checklist.querySelector('ul').replaceChildren(...rows.map((r) => {
      const li = document.createElement('li');
      li.className = r.state;
      const glyph = r.state === 'done' ? '✓' : r.state === 'next' ? '▸' : '·';
      li.textContent = `${glyph} ${r.label}${r.need > 1 ? ` ${r.count}/${r.need}` : ''}`;
      return li;
    }));
  }

  setObjective(text) {
    if (this._objective === text) return;
    this._objective = text;
    this.objective.textContent = text || '';
    this.objective.classList.toggle('hidden', !text);
    if (text) {
      this.objective.classList.remove('pop');
      void this.objective.offsetWidth;      // restart the animation
      this.objective.classList.add('pop');
    }
  }

  /** @param {Set<string>|string[]} active warning keys that are true right now */
  setWarnings(active) {
    const set = new Set(active);
    let changed = set.size !== this._warnState.size;
    if (!changed) for (const k of set) if (!this._warnState.has(k)) { changed = true; break; }
    if (!changed) return;
    this._warnState = set;
    this.warnings.replaceChildren(...[...set].map((k) => {
      const spec = WARNINGS[k];
      if (!spec) return document.createComment(k);
      const el = document.createElement('div');
      el.className = `warn ${spec.kind}`;
      el.textContent = spec.text;
      return el;
    }));
  }

  /**
   * The projected approach path, on the assisted setting only. Drawn as a
   * simple ladder of gates in world space by the mission; this just says
   * whether it is on.
   */
  setGuide(text) {
    this.guide.textContent = text || '';
    this.guide.classList.toggle('hidden', !text);
  }

  showCheckpoint(text) {
    this.checkpoint.textContent = text;
    this.checkpoint.classList.remove('hidden');
  }

  hideCheckpoint() {
    this.checkpoint.classList.add('hidden');
  }

  /* ---------------------------------------------------------------- */

  /**
   * The end card.
   * @param {object} report from MissionController.report()
   */
  showComplete(report) {
    // The card has buttons, and a locked pointer cannot reach a button.
    document.exitPointerLock?.();
    const rows = report.stats.map((s) => `
      <div class="stat">
        <span class="k">${s.label}</span>
        <span class="v ${s.grade || ''}">${s.value}</span>
      </div>`).join('');
    const unlocks = report.unlocks.map((u) => `<li>${u}</li>`).join('');
    this.completeBody.innerHTML = `
      <div class="stats">${rows}</div>
      <div class="unlocks">
        <h3>UNLOCKED</h3>
        <ul>${unlocks}</ul>
      </div>`;
    this.rank.textContent = report.rank;
    this.rank.dataset.tier = String(report.tier);
    this.complete.classList.remove('hidden');
    // The frame loop reads this to freeze the simulation under the card.
    this.completeUp = true;
  }

  hideComplete() {
    this.complete.classList.add('hidden');
    this.completeUp = false;
  }
}
