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

    this._warnState = new Set();
    this._objective = '';
    this._hdgShown = -1;
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
