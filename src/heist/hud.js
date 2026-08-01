export class HeistHud {
  constructor() {
    this.root = document.getElementById('heist-hud');
    this.phase = document.getElementById('phase-label');
    this.objective = document.querySelector('#objective span');
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
    this.suppression = document.getElementById('suppression');
    this.damage = document.getElementById('damage-edge');
    this.drive = document.getElementById('drive-hud');
    this.speed = document.getElementById('speed');
    this.route = document.getElementById('route');
    this.subtitleTimer = null;
  }

  show() { this.root.classList.remove('hidden'); }
  setPhase(value) { this.phase.textContent = String(value).replaceAll('_', ' '); }
  setObjective(value) { this.objective.textContent = value; }
  showPrompt(label, key = 'E') { this.promptLabel.innerHTML = label; this.promptKey.textContent = key; this.prompt.classList.remove('hidden'); }
  hidePrompt() { this.prompt.classList.add('hidden'); this.setHold(null); }
  setHold(value) { this.promptBar.style.width = value == null ? '0%' : `${Math.round(value * 100)}%`; }
  say(line, duration = 4) {
    clearTimeout(this.subtitleTimer);
    this.subtitle.innerHTML = `<b>${line.subtitleName}:</b> ${line.text}`;
    this.subtitle.classList.remove('hidden');
    this.subtitleTimer = setTimeout(() => this.subtitle.classList.add('hidden'), duration * 1000);
  }
  setAmmo(magazine, reserve, name) { this.ammo.textContent = magazine; this.reserve.textContent = `/ ${reserve}`; this.weapon.textContent = name; }
  setHealth(value) { this.health.style.background = `linear-gradient(90deg,#8fa391 ${value}%,rgba(255,255,255,.12) ${value}%)`; this.damage.style.opacity = String((100 - value) / 150); }
  setSuppression(value) { this.suppression.style.opacity = String(value * 0.75); }
  setBag(value, count) { this.bag.classList.toggle('hidden', count <= 0); this.bag.querySelector('span').textContent = `$${value.toLocaleString()}`; }
  setDriving(active, mph = 0, route = '') { this.drive.classList.toggle('hidden', !active); this.speed.textContent = Math.round(mph); if (route) this.route.textContent = route; }
}
