import * as THREE from 'three';
import { createPromptHud } from '../../core/hud.js';

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
    /* THE PROMPT IS THE SHARED ONE. Everything else in this file is still this
     * restaurant's own -- its own ray, its own allow-list, its own hold clock
     * -- and that fork is a bigger argument for another day. But the three
     * lines that write the prompt were the sixth hand-written copy of the same
     * three lines in the game, and one of the things they disagreed about was
     * whether a label is markup or text. This one said text. See
     * `createPromptHud` in src/core/hud.js for what the other five got wrong.
     *
     * `show` is this scene's visibility idiom, and the hold bar is a separate
     * element that carries the same class. Both are passed rather than
     * normalised. */
    this.prompt = createPromptHud({
      prompt: ui.prompt,
      label: ui.promptText,
      key: ui.promptKey,
      holdContainer: ui.holdBar,
      holdFill: ui.holdFill,
      visibility: 'show',
      holdClass: 'show',
    });
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
    this.prompt.hidePrompt();
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

    if (info) this.prompt.showPrompt(info.label, info.hold ? 'HOLD E' : 'E');
    else this.prompt.hidePrompt();

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
        const p = Math.min(1, this.held / info.hold);
        this.prompt.setHold(p);
        if (this.onHoldProgress) this.onHoldProgress(info.id, p);
        if (this.held >= info.hold) {
          this.held = 0;
          this.prompt.setHold(null);
          if (this.onHoldComplete) this.onHoldComplete(info.id);
        }
      } else if (!this.wasDown) {
        if (this.onPress) this.onPress(info.id);
      }
    } else {
      if (this.held > 0 && this.onHoldCancel) this.onHoldCancel(this.focus);
      this.held = 0;
      this.prompt.setHold(null);
    }

    this.wasDown = down;
  }
}
