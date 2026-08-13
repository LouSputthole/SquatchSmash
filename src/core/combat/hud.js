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
  const rawArmor = Number(actor?.armor);
  const armor = Number.isFinite(rawArmor) ? Math.max(0, rawArmor) : 0;
  const rawMaxArmor = Number(actor?.maxArmor);
  /* Actors created before maxArmor existed sometimes assign `.armor`
   * directly. Treat the current value as their capacity rather than hiding a
   * real vest from the shared HUD. */
  const maxArmor = Math.max(
    armor,
    Number.isFinite(rawMaxArmor) ? Math.max(0, rawMaxArmor) : 0,
  );
  const armorRatio = maxArmor > 0 ? Math.min(1, armor / maxArmor) : 0;
  const armorCurrent = Math.ceil(armor);
  const armorMaximum = Math.ceil(maxArmor);
  const armored = armor > 0;
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
    armor,
    maxArmor,
    armorCurrent,
    armorMaximum,
    armorRatio,
    armorPercent: Math.round(armorRatio * 100),
    armored,
    armorLabel: 'ARMOR',
    aria: `Health ${current} of ${maximum}`
      + (maxArmor > 0 ? `, armor ${armorCurrent} of ${armorMaximum}` : '')
      + (down ? ', down' : ''),
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
    this.track.classList.add('combat-status-health-track');
    this.fill = span(doc, 'combat-status-fill combat-status-health-fill');
    this.track.append(this.fill);
    const readout = span(doc, 'combat-status-readout');
    readout.append(this.value, this.maximum);

    this.armorRoot = span(doc, 'combat-status-armor hidden');
    // Keep the original row name as an adapter alias for existing scenes.
    this.armorRow = this.armorRoot;
    this.armorLabel = span(doc, 'combat-status-armor-label', 'ARMOR');
    this.armorValue = span(doc, 'combat-status-armor-value', '0');
    this.armorMaximum = span(doc, 'combat-status-armor-maximum', '/ 0');
    this.armorTrack = span(doc, 'combat-status-track combat-status-armor-track');
    this.armorFill = span(doc, 'combat-status-fill combat-status-armor-fill');
    this.armorTrack.append(this.armorFill);
    const armorReadout = span(doc, 'combat-status-armor-readout');
    armorReadout.append(this.armorValue, this.armorMaximum);
    this.armorRoot.append(this.armorLabel, armorReadout, this.armorTrack);

    /* This must be a body-level sibling, not a child of the card. The card's
     * hit animation uses `transform`, which would otherwise make it the
     * containing block for this fixed element and centre the wedge on the
     * lower-left HUD instead of on the crosshair. */
    this.direction = span(doc, 'combat-status-direction');
    this.direction.setAttribute('aria-hidden', 'true');

    this.root.replaceChildren(this.label, readout, this.track, this.armorRoot);
    if (!root) (mount || doc.body)?.append(this.root);
    (doc.body || mount)?.append(this.direction);
    this.root.classList.toggle('hidden', !visible);
    this.direction.classList.toggle('hidden', !visible);
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
    /* Capacity is player-facing combat information even when the vest is
     * empty. Keep 0 / max readable before the first pickup and after a break;
     * `combatArmor().visible` remains the mechanical "currently plated"
     * signal for callers that need that distinction. */
    const showArmor = view.maxArmor > 0;
    const signature = `${view.current}|${view.maximum}|${view.percent}|${view.state}`
      + `|${armor.current}|${armor.maximum}|${armor.percent}|${showArmor}`;
    if (signature === this._signature) return view;
    this._signature = signature;
    this.value.textContent = String(view.current);
    this.maximum.textContent = `/ ${view.maximum}`;
    this.fill.style.transform = `scaleX(${view.ratio})`;
    this.root.dataset.state = view.state;
    this.root.dataset.armorState = view.maxArmor <= 0
      ? 'none' : view.armor <= 0 ? 'broken' : view.armorRatio <= 0.35 ? 'low' : 'armored';
    this.root.dataset.health = String(view.current);
    this.root.dataset.maxHealth = String(view.maximum);
    this.root.setAttribute(
      'aria-label',
      showArmor
        ? view.aria
        : `Health ${view.current} of ${view.maximum}${view.down ? ', down' : ''}`,
    );
    this.track.setAttribute('aria-valuemin', '0');
    this.track.setAttribute('aria-valuemax', String(view.maximum));
    this.track.setAttribute('aria-valuenow', String(view.current));
    this.armorRoot.classList.toggle('hidden', !showArmor);
    this.armorValue.textContent = String(armor.current);
    this.armorMaximum.textContent = `/ ${armor.maximum}`;
    this.armorFill.style.transform = `scaleX(${armor.ratio})`;
    this.root.dataset.armor = String(armor.current);
    this.root.dataset.maxArmor = String(armor.maximum);
    this.armorTrack.setAttribute('aria-label', armor.aria);
    this.armorTrack.setAttribute('aria-valuemin', '0');
    this.armorTrack.setAttribute('aria-valuemax', String(armor.maximum));
    this.armorTrack.setAttribute('aria-valuenow', String(armor.current));
    return view;
  }

  /**
   * Flash the vitals and place a directional wedge around the crosshair.
   * `bearing` is relative radians: zero is ahead and +PI/2 is right.
   */
  noteDamage(amount = 0, { absorbed = 0, bearing = null } = {}) {
    const damage = Math.max(0, Number(amount) || 0);
    const armorAbsorbed = Math.max(0, Number(absorbed) || 0);
    if (damage <= 0 && armorAbsorbed <= 0) return false;
    this.root.classList.remove('hit', 'armor-hit', 'armor-break');
    this.direction.classList.remove('armor-hit');
    // Force a new flash even when two hits land inside one CSS transition.
    void this.root.offsetWidth;
    this.root.classList.add('hit');
    if (armorAbsorbed > 0) {
      this.root.classList.add('armor-hit');
      this.direction.classList.add('armor-hit');
    }
    if (armorAbsorbed > 0 && (Number(this.actor?.armor) || 0) <= 0) {
      this.root.classList.add('armor-break');
    }
    this.root.dataset.lastDamage = String(damage);
    this.root.dataset.lastAbsorbed = String(armorAbsorbed);

    if (Number.isFinite(Number(bearing))) {
      let angle = Number(bearing);
      while (angle > Math.PI) angle -= Math.PI * 2;
      while (angle <= -Math.PI) angle += Math.PI * 2;
      const sector = Math.abs(angle) <= Math.PI / 4 ? 'front'
        : Math.abs(angle) >= Math.PI * 3 / 4 ? 'back'
          : angle > 0 ? 'right' : 'left';
      const readable = Number(angle.toFixed(4));
      this.root.dataset.damageBearing = String(readable);
      this.root.dataset.damageDirection = sector;
      this.direction.dataset.bearing = String(readable);
      this.direction.dataset.sector = sector;
      this.direction.style.setProperty('--combat-damage-bearing', `${angle}rad`);
      this.direction.classList.add('active');
    }
    clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => {
      this.root.classList.remove('hit', 'armor-hit', 'armor-break');
      this.direction.classList.remove('active', 'armor-hit');
      this._hitTimer = null;
    }, 650);
    return true;
  }

  /**
   * Clear transient damage presentation after a checkpoint/retry boundary.
   * Model vitals remain owned by CombatActor; this only removes feedback from
   * the discarded timeline and then refreshes the readable values.
   */
  reset() {
    clearTimeout(this._hitTimer);
    this._hitTimer = null;
    this.root.classList.remove('hit', 'armor-hit', 'armor-break');
    this.direction.classList.remove('active', 'armor-hit');
    for (const key of ['lastDamage', 'lastAbsorbed', 'damageBearing', 'damageDirection']) {
      delete this.root.dataset[key];
    }
    for (const key of ['bearing', 'sector']) delete this.direction.dataset[key];
    this.direction.style.removeProperty('--combat-damage-bearing');
    this._signature = '';
    return this.update();
  }

  /** Compatibility spelling for recovery Adapters that call their hook clear. */
  clear() { return this.reset(); }

  show() {
    this.root.classList.remove('hidden');
    this.direction.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
    this.direction.classList.add('hidden');
  }

  dispose() {
    clearTimeout(this._hitTimer);
    this.direction.remove();
    this.root.remove();
  }
}
