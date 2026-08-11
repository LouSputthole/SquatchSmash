/**
 * Shared player-vitals presentation for scenes that use CombatActor.
 *
 * CombatActor remains the only health model. This adapter reads that actor and
 * owns the stable DOM contract for a visible bar/readout; scenes do not copy
 * health arithmetic or invent their own thresholds.
 */

let stylesheetInstalled = false;

function installStylesheet(doc) {
  if (stylesheetInstalled || !doc?.head) return;
  stylesheetInstalled = true;
  if (doc.querySelector?.('link[data-squatch-combat-hud]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./hud.css', import.meta.url).href;
  link.dataset.squatchCombatHud = 'true';
  doc.head.append(link);
}

/** A deterministic, DOM-free view of one CombatActor's readable vitals. */
export function combatVitals(actor = {}) {
  const rawMax = Number(actor?.maxHealth);
  const maxHealth = Number.isFinite(rawMax) ? Math.max(1, rawMax) : 1;
  const rawHealth = Number(actor?.health);
  const health = Number.isFinite(rawHealth)
    ? Math.max(0, Math.min(maxHealth, rawHealth))
    : 0;
  const ratio = health / maxHealth;
  const down = actor?.incapacitated === true || health <= 0;
  const state = down ? 'down'
    : ratio <= 0.33 ? 'critical'
      : ratio <= 0.66 ? 'hurt' : 'healthy';
  const current = Math.ceil(health);
  const maximum = Math.ceil(maxHealth);
  return {
    health,
    maxHealth,
    current,
    maximum,
    ratio,
    percent: Math.round(ratio * 100),
    state,
    down,
    label: 'HEALTH',
    aria: `Health ${current} of ${maximum}${down ? ', down' : ''}`,
  };
}

/** A deterministic, DOM-free view of the armor carried by one CombatActor. */
export function combatArmor(actor = {}) {
  const rawArmor = Number(actor?.armor);
  const armor = Number.isFinite(rawArmor) ? Math.max(0, rawArmor) : 0;
  const rawMaximum = Number(actor?.maxArmor);
  const maxArmor = Number.isFinite(rawMaximum)
    ? Math.max(1, rawMaximum, armor)
    : Math.max(1, armor);
  const ratio = Math.max(0, Math.min(1, armor / maxArmor));
  const current = Math.ceil(armor);
  const maximum = Math.ceil(maxArmor);
  return {
    armor,
    maxArmor,
    current,
    maximum,
    ratio,
    percent: Math.round(ratio * 100),
    visible: armor > 0,
    label: 'ARMOR',
    aria: `Armor ${current} of ${maximum}`,
  };
}

function span(doc, className, text = '') {
  const node = doc.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

/**
 * Reusable HUD adapter bound to a CombatActor.
 *
 * `update()` is idempotent and cheap enough for a scene frame. `noteDamage()`
 * is presentation feedback only; damage still enters through CombatActor.
 */
export class CombatStatusHud {
  constructor({ actor = null, root = null, mount = null, visible = true, document: doc = globalThis.document } = {}) {
    if (!doc?.createElement) throw new Error('CombatStatusHud needs a document');
    installStylesheet(doc);
    this.document = doc;
    this.actor = actor;
    this.root = root || doc.createElement('div');
    this.root.classList.add('combat-status-hud');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');

    this.label = span(doc, 'combat-status-label', 'HEALTH');
    this.value = span(doc, 'combat-status-value', '0');
    this.maximum = span(doc, 'combat-status-maximum', '/ 0');
    this.track = span(doc, 'combat-status-track');
    this.fill = span(doc, 'combat-status-fill');
    this.track.append(this.fill);
    const readout = span(doc, 'combat-status-readout');
    readout.append(this.value, this.maximum);

    this.armorRoot = span(doc, 'combat-status-armor hidden');
    this.armorLabel = span(doc, 'combat-status-armor-label', 'ARMOR');
    this.armorValue = span(doc, 'combat-status-armor-value', '0');
    this.armorMaximum = span(doc, 'combat-status-armor-maximum', '/ 0');
    this.armorTrack = span(doc, 'combat-status-armor-track');
    this.armorFill = span(doc, 'combat-status-armor-fill');
    this.armorTrack.append(this.armorFill);
    const armorReadout = span(doc, 'combat-status-armor-readout');
    armorReadout.append(this.armorValue, this.armorMaximum);
    this.armorRoot.append(this.armorLabel, armorReadout, this.armorTrack);

    this.root.replaceChildren(this.label, readout, this.track, this.armorRoot);
    if (!root) (mount || doc.body)?.append(this.root);
    this.root.classList.toggle('hidden', !visible);
    this._signature = '';
    this._hitTimer = null;
    this.update();
  }

  bind(actor) {
    this.actor = actor;
    this._signature = '';
    return this.update();
  }

  update(actor = this.actor) {
    const view = combatVitals(actor);
    const armor = combatArmor(actor);
    const signature = `${view.current}|${view.maximum}|${view.percent}|${view.state}`
      + `|${armor.current}|${armor.maximum}|${armor.percent}|${armor.visible}`;
    if (signature === this._signature) return view;
    this._signature = signature;
    this.value.textContent = String(view.current);
    this.maximum.textContent = `/ ${view.maximum}`;
    this.fill.style.transform = `scaleX(${view.ratio})`;
    this.root.dataset.state = view.state;
    this.root.dataset.health = String(view.current);
    this.root.dataset.maxHealth = String(view.maximum);
    this.root.setAttribute('aria-label', armor.visible ? `${view.aria}; ${armor.aria}` : view.aria);
    this.track.setAttribute('aria-valuemin', '0');
    this.track.setAttribute('aria-valuemax', String(view.maximum));
    this.track.setAttribute('aria-valuenow', String(view.current));
    this.armorRoot.classList.toggle('hidden', !armor.visible);
    this.armorValue.textContent = String(armor.current);
    this.armorMaximum.textContent = `/ ${armor.maximum}`;
    this.armorFill.style.transform = `scaleX(${armor.ratio})`;
    this.root.dataset.armor = String(armor.current);
    this.root.dataset.maxArmor = String(armor.maximum);
    this.armorTrack.setAttribute('aria-valuemin', '0');
    this.armorTrack.setAttribute('aria-valuemax', String(armor.maximum));
    this.armorTrack.setAttribute('aria-valuenow', String(armor.current));
    return view;
  }

  noteDamage(amount = 0) {
    const damage = Math.max(0, Number(amount) || 0);
    if (damage <= 0) return false;
    this.root.classList.remove('hit');
    // Force a new flash even when two hits land inside one CSS transition.
    void this.root.offsetWidth;
    this.root.classList.add('hit');
    clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => this.root.classList.remove('hit'), 260);
    return true;
  }

  show() { this.root.classList.remove('hidden'); }

  hide() { this.root.classList.add('hidden'); }

  dispose() {
    clearTimeout(this._hitTimer);
    this.root.remove();
  }
}
