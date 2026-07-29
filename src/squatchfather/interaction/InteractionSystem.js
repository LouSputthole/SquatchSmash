import * as THREE from 'three';

// Look-at-it-and-press-E. A short ray from the centre of the view finds the
// nearest allowed interaction volume and drives the on-screen prompt; holds
// report progress so the toilet search can play out over a few seconds.

const MAX_DIST = 2.5;
const CENTRE = new THREE.Vector2(0, 0); // always picks from the middle of the view

export class InteractionSystem {
  constructor(camera, interactables, ui) {
    this.camera = camera;
    this.interactables = interactables;
    this.ui = ui; // { prompt, promptKey, promptText, holdBar, holdFill }
    this.ray = new THREE.Raycaster();
    this.ray.far = MAX_DIST;
    this.allowed = new Set();
    this.focus = null;
    this.held = 0;
    this.wasDown = false;
    this.reach = 1;

    this.onPress = null;
    this.onHoldProgress = null;
    this.onHoldComplete = null;
    this.onHoldCancel = null;
  }

  // Only these interaction ids respond right now.
  allow(...ids) {
    this.allowed = new Set(ids.flat());
    this.#reset();
  }

  // Nudges the pick distance up — used after two wrong searches.
  setReach(mult) {
    this.reach = mult;
    this.ray.far = MAX_DIST * mult;
  }

  #reset() {
    this.held = 0;
    this.focus = null;
    this.ui.prompt.classList.remove('show');
    this.ui.holdBar.classList.remove('show');
  }

  #pick() {
    if (!this.allowed.size) return null;
    this.ray.setFromCamera(CENTRE, this.camera);
    const targets = this.interactables.filter((m) => this.allowed.has(m.userData.interact.id));
    if (!targets.length) return null;
    const hits = this.ray.intersectObjects(targets, false);
    return hits.length ? hits[0].object : null;
  }

  // `down` is the key's current state (drives holds); `tapped` is set if the key
  // went down at any point since the last frame. Without the second signal a
  // quick press between two frames is simply never seen.
  update(dt, down, tapped = false) {
    const hit = this.#pick();
    const info = hit ? hit.userData.interact : null;

    if (info) {
      this.ui.promptKey.textContent = info.hold ? 'HOLD E' : 'E';
      this.ui.promptText.textContent = info.label;
      this.ui.prompt.classList.add('show');
    } else {
      this.ui.prompt.classList.remove('show');
      this.ui.holdBar.classList.remove('show');
    }

    // Losing the target cancels a hold in progress
    if (this.focus && (!info || info.id !== this.focus)) {
      if (this.held > 0 && this.onHoldCancel) this.onHoldCancel(this.focus);
      this.held = 0;
    }
    this.focus = info ? info.id : null;

    if (info && !info.hold && tapped && !down) {
      // Pressed and released inside one frame — still counts.
      if (this.onPress) this.onPress(info.id);
    }

    if (info && down) {
      if (info.hold) {
        this.held += dt;
        this.ui.holdBar.classList.add('show');
        const p = Math.min(1, this.held / info.hold);
        this.ui.holdFill.style.width = `${p * 100}%`;
        if (this.onHoldProgress) this.onHoldProgress(info.id, p);
        if (this.held >= info.hold) {
          this.held = 0;
          this.ui.holdBar.classList.remove('show');
          if (this.onHoldComplete) this.onHoldComplete(info.id);
        }
      } else if (!this.wasDown) {
        if (this.onPress) this.onPress(info.id);
      }
    } else {
      if (this.held > 0 && this.onHoldCancel) this.onHoldCancel(this.focus);
      this.held = 0;
      this.ui.holdFill.style.width = '0%';
      this.ui.holdBar.classList.remove('show');
    }

    this.wasDown = down;
  }
}
