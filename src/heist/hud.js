import { writeGameplayPromptKey } from '../core/gameplay-key-adapter.js';

export class HeistHud {
  constructor() {
    this.root = document.getElementById('heist-hud');
    this.phase = document.getElementById('phase-label');
    this.objective = document.querySelector('#objective span');
    this.threat = document.getElementById('guard-threat');
    this.threatTime = this.threat.querySelector('span');
    this.threatBar = this.threat.querySelector('i');
    this.subtitle = document.getElementById('subtitle');
    this.prompt = document.getElementById('prompt');
    this.promptLabel = this.prompt.querySelector('span');
    this.promptKey = this.prompt.querySelector('kbd');
    this.promptBar = this.prompt.querySelector('i');
    this.ammo = document.querySelector('#ammo b');
    this.reserve = document.querySelector('#ammo span');
    this.weapon = document.querySelector('#ammo small');
    this.bag = document.getElementById('bag-readout');
    this.health = document.querySelector('#health i');
    /* The armour band sits under the health bar and is only there when the
     * plate carrier is on. It is the visible half of "the vest does
     * something": the player can see he picked it up without taking a round
     * to find out. */
    this.armor = document.getElementById('armor');
    this.armorBar = this.armor?.querySelector('i') ?? null;
    this.suppression = document.getElementById('suppression');
    this.damage = document.getElementById('damage-edge');
    this.drive = document.getElementById('drive-hud');
    this.speed = document.getElementById('speed');
    this.route = document.getElementById('route');
    /* The objective spine, on screen, permanently: the two numbers the job is
     * scored on. `docs/TONE-AND-PARODY.md` calls detail load-bearing, and a
     * player who cannot see the count cannot be trying to keep it. */
    this.lobby = document.getElementById('lobby-readout');
    this.lobbyControl = document.querySelector('#lobby-readout .control');
    this.lobbyTies = document.querySelector('#lobby-readout .ties');
    this.lobbyCasualties = document.querySelector('#lobby-readout .casualties');
    this.subtitleTimer = null;
  }

  show() { this.root.classList.remove('hidden'); }
  setPhase(value) { this.phase.textContent = String(value).replaceAll('_', ' '); }
  /**
   * The standing order.
   *
   * Idempotent on purpose: THE TAKE recomputes the objective from the mission
   * state every frame (see `src/heist/orders.js`), which is what stops it
   * going stale, and a DOM write per frame for a sentence that has not changed
   * is a layout the scene does not need.
   */
  setObjective(value) {
    const text = String(value ?? '');
    if (text === this._objectiveText) return false;
    this._objectiveText = text;
    this.objective.textContent = text;
    return true;
  }
  setThreat(active, remaining = 0, total = 1) {
    this.threat.classList.toggle('hidden', !active);
    if (!active) return;
    this.threatTime.textContent = `${Math.max(0, remaining).toFixed(2)} SEC`;
    this.threatBar.style.transform = `scaleX(${Math.max(0, Math.min(1, remaining / Math.max(0.01, total)))})`;
  }

  /**
   * The lobby panel. Hidden outside the bank, because a control figure for a
   * room you are not in is noise.
   */
  setLobby(state) {
    if (!this.lobby) return;
    if (!state) { this.lobby.classList.add('hidden'); return; }
    this.lobby.classList.remove('hidden');
    this.lobbyControl.textContent = `${state.controlled} / ${state.total} DOWN`;
    this.lobbyTies.textContent = `${state.ties} TIES`;
    this.lobbyCasualties.textContent = state.casualties
      ? `${state.casualties} CIVILIAN${state.casualties > 1 ? 'S' : ''} DOWN` : 'NOBODY HURT';
    this.lobbyCasualties.classList.toggle('bad', state.casualties > 0);
    this.lobby.classList.toggle('losing', state.controlled / Math.max(1, state.total) < 0.4);
  }

  showPrompt(label, key = 'E') {
    this.promptLabel.innerHTML = label;
    writeGameplayPromptKey(this.promptKey, key);
    this.prompt.classList.remove('hidden');
  }
  hidePrompt() { this.prompt.classList.add('hidden'); this.setHold(null); }
  setHold(value) { this.promptBar.style.width = value == null ? '0%' : `${Math.round(value * 100)}%`; }
  say(line, duration = 4) {
    clearTimeout(this.subtitleTimer);
    this.subtitle.innerHTML = `<b>${line.subtitleName}:</b> ${line.text}`;
    this.subtitle.classList.remove('hidden');
    this.subtitleTimer = setTimeout(() => this.subtitle.classList.add('hidden'), duration * 1000);
  }

  /**
   * @param {number|string} magazine rounds left, or a dash for empty hands
   * @param {number|string} reserve  already-formatted reserve text
   * @param {string} name            what is actually in Tony's hands
   */
  setAmmo(magazine, reserve, name) {
    this.ammo.textContent = magazine;
    this.reserve.textContent = typeof reserve === 'number' ? `/ ${reserve}` : String(reserve ?? '');
    this.weapon.textContent = name;
  }

  setHealth(value) { this.health.style.background = `linear-gradient(90deg,#8fa391 ${value}%,rgba(255,255,255,.12) ${value}%)`; this.damage.style.opacity = String((100 - value) / 150); }

  /** @param {number} fraction 0 for no carrier, 1 for a fresh one. */
  setArmor(fraction = 0) {
    if (!this.armor) return;
    const value = Math.max(0, Math.min(1, fraction)) * 100;
    this.armor.classList.toggle('hidden', value <= 0);
    if (this.armorBar) {
      this.armorBar.style.background = `linear-gradient(90deg,#7d97b4 ${value}%,rgba(255,255,255,.10) ${value}%)`;
    }
  }
  setSuppression(value) { this.suppression.style.opacity = String(value * 0.75); }
  setBag(value, count) { this.bag.classList.toggle('hidden', count <= 0); this.bag.querySelector('span').textContent = `$${value.toLocaleString()}`; }
  setDriving(active, mph = 0, route = '') { this.drive.classList.toggle('hidden', !active); this.speed.textContent = Math.round(mph); if (route) this.route.textContent = route; }
}
