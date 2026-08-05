/**
 * The combat HUD: health, ammunition, a crosshair that tells the truth.
 *
 * Repo convention is a thin DOM wrapper per scene with no state of its own
 * (heist/hud.js, mansion/mission/hud.js); this one is shared because every
 * combat scene wants the same eight readouts. It builds its own elements
 * and styles so a mission only needs a parent element and one `update()`
 * with `PlayerCombat.feedback()`.
 *
 * The crosshair's gap tracks the REAL spread scale — the same number the
 * round uses — and collapses when aiming; it dims and crosses out when the
 * muzzle is obstructed, because a crosshair that lies gets people killed.
 * Damage numbers do not exist here. This is not that kind of game.
 */
export class CombatHud {
  constructor(parent = document.body) {
    const root = el('div', `
      position:absolute; inset:0; pointer-events:none; z-index:40;
      font-family:'Courier New', monospace; color:#e8e4da;
    `);
    parent.appendChild(root);
    this.root = root;

    // Vignette for hits and low health.
    this.vignette = el('div', `
      position:absolute; inset:0; opacity:0; transition:opacity 120ms linear;
      background:radial-gradient(ellipse at center, transparent 52%, rgba(140,10,8,0.55) 100%);
    `);
    root.appendChild(this.vignette);

    // Directional damage indicators: four arcs around centre.
    this.indicatorLayer = el('div', 'position:absolute; inset:0;');
    root.appendChild(this.indicatorLayer);

    // Crosshair: four ticks and a centre dot, gap driven by spread.
    this.cross = el('div', `
      position:absolute; left:50%; top:50%; width:0; height:0;
    `);
    root.appendChild(this.cross);
    this.ticks = [];
    for (let i = 0; i < 4; i++) {
      const t = el('div', `
        position:absolute; background:#e8e4da; opacity:0.9;
        box-shadow:0 0 2px rgba(0,0,0,0.9);
      `);
      this.cross.appendChild(t);
      this.ticks.push(t);
    }
    this.dot = el('div', `
      position:absolute; left:-1.5px; top:-1.5px; width:3px; height:3px;
      border-radius:50%; background:#e8e4da; box-shadow:0 0 2px rgba(0,0,0,0.9);
    `);
    this.cross.appendChild(this.dot);

    // Hit marker.
    this.marker = el('div', `
      position:absolute; left:50%; top:50%; width:26px; height:26px;
      margin:-13px 0 0 -13px; opacity:0; font-size:24px; line-height:26px;
      text-align:center; font-weight:bold; text-shadow:0 0 3px #000;
    `);
    this.marker.textContent = '×';
    root.appendChild(this.marker);
    this._markerTime = 0;

    // Bottom-left: health.
    this.healthWrap = el('div', `
      position:absolute; left:26px; bottom:24px; width:190px;
    `);
    root.appendChild(this.healthWrap);
    this.healthLabel = el('div', 'font-size:11px; letter-spacing:2px; opacity:0.75; margin-bottom:4px;');
    this.healthLabel.textContent = 'HEALTH';
    this.healthWrap.appendChild(this.healthLabel);
    this.healthBar = el('div', `
      height:10px; background:rgba(20,22,20,0.72); border:1px solid rgba(230,226,214,0.4);
    `);
    this.healthFill = el('div', `
      height:100%; width:100%; background:#b8b4a6; transition:width 150ms linear;
    `);
    this.healthBar.appendChild(this.healthFill);
    this.healthWrap.appendChild(this.healthBar);

    // Bottom-right: the gun.
    this.ammoWrap = el('div', `
      position:absolute; right:26px; bottom:24px; text-align:right;
    `);
    root.appendChild(this.ammoWrap);
    this.weaponName = el('div', 'font-size:11px; letter-spacing:2px; opacity:0.75;');
    this.ammoWrap.appendChild(this.weaponName);
    this.ammoCount = el('div', 'font-size:30px; font-weight:bold; text-shadow:0 0 4px #000;');
    this.ammoWrap.appendChild(this.ammoCount);
    this.reloadNote = el('div', 'font-size:11px; letter-spacing:1px; opacity:0; color:#f0c060;');
    this.reloadNote.textContent = 'RELOADING';
    this.ammoWrap.appendChild(this.reloadNote);

    this.dead = el('div', `
      position:absolute; inset:0; display:none; align-items:center; justify-content:center;
      background:rgba(8,4,4,0.72); font-size:34px; letter-spacing:8px;
    `);
    this.dead.textContent = 'DOWN';
    root.appendChild(this.dead);

    this._indicators = [];
  }

  /** One hit marker flash: white for a hit, red edge for a kill/headshot. */
  confirm({ fatal = false, headshot = false, helmetSaved = false } = {}) {
    this._markerTime = fatal ? 0.5 : 0.28;
    this.marker.style.color = fatal ? (headshot ? '#ff5040' : '#f0b040') : '#e8e4da';
    this.marker.style.transform = headshot && fatal ? 'scale(1.35)' : 'scale(1)';
    if (helmetSaved) this.marker.style.color = '#a8c8e8';
  }

  update(dt, feedback) {
    const fb = feedback;
    // Crosshair gap from the true spread.
    const gap = 6 + Math.min(38, (fb.spreadScale ?? 1) * 9) * (1 - (fb.aim ?? 0) * 0.6);
    const len = 8;
    const w = 2;
    place(this.ticks[0], -w / 2, -gap - len, w, len);
    place(this.ticks[1], -w / 2, gap, w, len);
    place(this.ticks[2], -gap - len, -w / 2, len, w);
    place(this.ticks[3], gap, -w / 2, len, w);
    const obstructed = fb.obstructed === true;
    this.cross.style.opacity = obstructed ? '0.25' : '1';
    this.dot.style.background = obstructed ? '#c05040' : '#e8e4da';

    this.vignette.style.opacity = String(fb.vignette ?? 0);

    const frac = Math.max(0, fb.health / fb.maxHealth);
    this.healthFill.style.width = `${Math.round(frac * 100)}%`;
    this.healthFill.style.background = fb.lowHealth ? '#c04838' : '#b8b4a6';

    if (fb.hud) {
      this.weaponName.textContent = fb.hud.name?.toUpperCase() ?? '';
      this.ammoCount.textContent = `${fb.hud.rounds} / ${fb.hud.reserve}`;
      this.ammoCount.style.color = fb.hud.rounds === 0 ? '#c05040' : '#e8e4da';
      this.reloadNote.style.opacity = fb.hud.reloading ? '1' : '0';
    } else {
      this.weaponName.textContent = '';
      this.ammoCount.textContent = '';
      this.reloadNote.style.opacity = '0';
    }

    // Damage direction arcs.
    while (this._indicators.length < (fb.indicators?.length ?? 0)) {
      const d = el('div', `
        position:absolute; left:50%; top:50%; width:64px; height:64px;
        margin:-32px 0 0 -32px; border:3px solid transparent; border-radius:50%;
        border-top-color:#d04838;
      `);
      this.indicatorLayer.appendChild(d);
      this._indicators.push(d);
    }
    this._indicators.forEach((eln, i) => {
      const ind = fb.indicators?.[i];
      if (!ind) { eln.style.opacity = '0'; return; }
      eln.style.opacity = String(Math.max(0, 0.9 - ind.age * 0.45));
      eln.style.transform = `rotate(${(-ind.bearing + Math.PI) * (180 / Math.PI)}deg)`;
    });

    if (this._markerTime > 0) {
      this._markerTime -= dt;
      this.marker.style.opacity = String(Math.max(0, this._markerTime * 3));
    } else {
      this.marker.style.opacity = '0';
    }

    this.dead.style.display = fb.dead ? 'flex' : 'none';
  }

  dispose() { this.root.remove(); }
}

function el(tag, css) {
  const e = document.createElement(tag);
  e.style.cssText = css;
  return e;
}

function place(e, x, y, w, h) {
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  e.style.width = `${w}px`;
  e.style.height = `${h}px`;
}
