/**
 * The combat debug panel: every lie detector in one drawer.
 *
 * Off unless the scene asks for it (`?debug=1` is the convention the lab
 * uses); nothing here is constructed in an ordinary play session, so release
 * pages pay nothing. The panel gets a CONTEXT object of live systems and
 * pokes them directly — it owns no combat logic:
 *
 *   {
 *     playerCombat, weapons, combatants: ()=>[], encounter, cover, log,
 *     spawn: (archetype, faction)=>void, resetEncounter: ()=>void,
 *     setTimeScale: (k)=>void, scene, camera,
 *   }
 */
import * as THREE from 'three';
import { NPC_ARCHETYPES } from './archetypes.js';

export class CombatDebug {
  constructor(ctx, parent = document.body) {
    this.ctx = ctx;
    this.show = {
      hitboxes: false, state: false, cover: false, vision: false,
      lastKnown: false, rays: false, paths: false,
    };
    this._sprites = new Map();
    this._helpers = new THREE.Group();
    this._helpers.name = 'combat.debug';
    ctx.scene.add(this._helpers);
    this._rays = [];

    const panel = el('div', `
      position:absolute; top:12px; right:12px; z-index:60; width:230px;
      background:rgba(12,14,12,0.88); border:1px solid #3a4038; padding:10px;
      font:11px 'Courier New', monospace; color:#cfe0c8; pointer-events:auto;
      max-height:86vh; overflow-y:auto;
    `);
    parent.appendChild(panel);
    this.panel = panel;

    panel.appendChild(title('COMBAT DEBUG'));

    // Toggles.
    this._check(panel, 'God mode', (on) => { ctx.playerCombat.vitals.godMode = on; });
    this._check(panel, 'Infinite ammo', (on) => { ctx.playerCombat.infiniteAmmo = on; });
    this._check(panel, 'Show hitboxes', (on) => {
      this.show.hitboxes = on;
      for (const c of ctx.combatants()) c.hitboxes?.setDebug(on);
    });
    this._check(panel, 'Show AI state', (on) => { this.show.state = on; });
    this._check(panel, 'Show cover points', (on) => { this.show.cover = on; this._rebuildCover(); });
    this._check(panel, 'Show vision', (on) => { this.show.vision = on; });
    this._check(panel, 'Show last known', (on) => { this.show.lastKnown = on; });
    this._check(panel, 'Show bullet rays', (on) => { this.show.rays = on; });
    this._check(panel, 'Slow motion', (on) => ctx.setTimeScale?.(on ? 0.25 : 1));

    panel.appendChild(title('SPAWN'));
    const row = el('div', 'display:flex; gap:4px; margin:4px 0;');
    this.archSelect = document.createElement('select');
    this.archSelect.style.cssText = 'flex:1; background:#1a201a; color:#cfe0c8; border:1px solid #3a4038; font:inherit;';
    for (const name of Object.keys(NPC_ARCHETYPES)) {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      this.archSelect.appendChild(o);
    }
    row.appendChild(this.archSelect);
    panel.appendChild(row);
    this._button(panel, 'Spawn enemy', () => ctx.spawn?.(this.archSelect.value, 'police'));
    this._button(panel, 'Spawn ally', () => ctx.spawn?.('friendlyCrew', 'crew'));

    panel.appendChild(title('CONTROL'));
    this._button(panel, 'Force alert all', () => {
      for (const c of ctx.combatants()) {
        if (!c.dead) { c.perception.confidence = 1; c.perception.inform({ x: ctx.playerCombat.player.position.x, z: ctx.playerCombat.player.position.z, confidence: 0.75 }); }
      }
    });
    this._button(panel, 'Force surrender all', () => {
      for (const c of ctx.combatants()) {
        if (!c.dead && c.faction !== 'crew') { c.morale.value = 0; c.morale.fightToDeath = false; c.morale.surrendered = true; }
      }
    });
    this._button(panel, 'Kill all enemies', () => {
      for (const c of ctx.combatants()) {
        if (!c.dead && c.faction !== 'crew') c.scriptKill({ direction: { x: 0, z: 1 } });
      }
    });
    this._button(panel, 'Reset encounter', () => ctx.resetEncounter?.());
    this._button(panel, 'Heal player', () => ctx.playerCombat.vitals.revive({}));

    panel.appendChild(title('LOG'));
    this.logPre = el('pre', `
      white-space:pre-wrap; font-size:9px; line-height:1.35; margin:4px 0 0;
      color:#9fb898; max-height:180px; overflow-y:auto;
    `);
    panel.appendChild(this.logPre);

    this.stats = el('div', 'margin-top:6px; color:#8fa888;');
    panel.appendChild(this.stats);
  }

  _check(parent, label, onChange) {
    const wrap = el('label', 'display:block; margin:2px 0; cursor:pointer;');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.addEventListener('change', () => onChange(box.checked));
    wrap.appendChild(box);
    wrap.appendChild(document.createTextNode(` ${label}`));
    parent.appendChild(wrap);
  }

  _button(parent, label, onClick) {
    const b = el('button', `
      display:block; width:100%; margin:2px 0; padding:3px; cursor:pointer;
      background:#20281f; color:#cfe0c8; border:1px solid #3a4038; font:inherit;
    `);
    b.textContent = label;
    b.addEventListener('click', onClick);
    parent.appendChild(b);
  }

  /** The resolver's rays, when enabled. Call from the scene's shot events. */
  noteRay(from, to, colour = 0xffe080) {
    if (!this.show.rays) return;
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({
      color: colour, transparent: true, opacity: 0.85,
    }));
    this._helpers.add(line);
    this._rays.push({ line, life: 0.6 });
  }

  _rebuildCover() {
    for (const m of [...this._helpers.children]) {
      if (m.userData.coverMarker) this._helpers.remove(m);
    }
    if (!this.show.cover || !this.ctx.cover) return;
    for (const p of this.ctx.cover.points) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, p.height === 'low' ? 0.5 : 1.1, 0.16),
        new THREE.MeshBasicMaterial({
          color: p.height === 'low' ? 0x50c080 : 0x3080c0,
          transparent: true, opacity: 0.55, depthTest: false,
        }),
      );
      m.position.set(p.x, (p.y ?? 0) + 0.4, p.z);
      m.userData.coverMarker = true;
      this._helpers.add(m);
    }
  }

  update(dt) {
    const ctx = this.ctx;
    for (let i = this._rays.length - 1; i >= 0; i--) {
      const r = this._rays[i];
      r.life -= dt;
      r.line.material.opacity = Math.max(0, r.life * 1.4);
      if (r.life <= 0) {
        this._helpers.remove(r.line);
        r.line.geometry.dispose();
        r.line.material.dispose();
        this._rays.splice(i, 1);
      }
    }

    // AI state labels above heads.
    if (this.show.state || this.show.lastKnown || this.show.vision) {
      for (const c of ctx.combatants()) {
        this._updateSprite(c);
      }
    } else if (this._sprites.size) {
      for (const [, s] of this._sprites) this._helpers.remove(s.sprite);
      this._sprites.clear();
    }

    // Rolling combat log tail + counters.
    if (ctx.log) {
      this.logPre.textContent = ctx.log.tail(10).join('\n');
      const k = ctx.log.counts;
      this.stats.textContent =
        `shots ${k.shots} hits ${k.hits} kills ${k.kills} hs ${k.headshots} saves ${k.helmetSaves}`;
    }
  }

  _updateSprite(c) {
    let entry = this._sprites.get(c.id);
    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const tex = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthTest: false,
      }));
      sprite.scale.set(1.6, 0.4, 1);
      this._helpers.add(sprite);
      entry = { sprite, canvas, tex, last: '' };
      this._sprites.set(c.id, entry);
    }
    const r = c.report();
    const text = `${r.state} ${Math.round(r.health)}hp m${Math.round(r.morale * 100)} s${Math.round(r.suppression * 100)}`;
    if (text !== entry.last) {
      entry.last = text;
      const g = entry.canvas.getContext('2d');
      g.clearRect(0, 0, 256, 64);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, 0, 256, 64);
      g.fillStyle = c.dead ? '#c05040' : c.faction === 'crew' ? '#70c080' : '#e0d8b0';
      g.font = '22px monospace';
      g.textAlign = 'center';
      g.fillText(text, 128, 40);
      entry.tex.needsUpdate = true;
    }
    entry.sprite.visible = this.show.state && !c.dead;
    entry.sprite.position.set(c.x, (c.npc?.position.y ?? 0) + 2.15, c.z);
  }

  dispose() {
    this.panel.remove();
    this.ctx.scene.remove(this._helpers);
  }
}

function el(tag, css) {
  const e = document.createElement(tag);
  e.style.cssText = css;
  return e;
}

function title(text) {
  const t = el('div', 'margin:8px 0 3px; color:#8fc088; letter-spacing:2px; font-weight:bold;');
  t.textContent = text;
  return t;
}
