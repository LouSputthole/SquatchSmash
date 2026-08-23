import * as Foley from '../audio/Foley.js';
import { weaponDrop } from '../audio/GunshotAudio.js';
import { createPromptHud } from '../../core/hud.js';

// Letting go of it has to be the player's doing. He will not walk out of the
// restaurant with it in his hand — if the player tries, he stops and looks at
// the weapon until they press the button.

export class WeaponDropInteraction {
  constructor({ prospect, ui, onDropped }) {
    this.prospect = prospect;
    this.ui = ui;
    /* The same shared prompt the restaurant's InteractionSystem builds, from
     * the same three elements -- this one just drives it directly, because a
     * weapon in the hand is not something you look at to be prompted about. */
    this.hud = createPromptHud({
      prompt: ui.prompt, label: ui.promptText, key: ui.promptKey, visibility: 'show',
    });
    this.onDropped = onDropped;
    this.dropped = false;
    this.nagT = 0;
  }

  prompt(show, text = 'Drop the weapon') {
    if (show) this.hud.showPrompt(text, 'E');
    else this.hud.hidePrompt();
  }

  drop() {
    if (this.dropped) return;
    this.dropped = true;
    this.prompt(false);
    Foley.cloth();
    const mesh = this.prospect.dropWeapon();
    if (mesh) this.prospect.onWeaponLanded = () => weaponDrop();
    if (this.onDropped) this.onDropped();
  }

  // Called while he's still holding it and trying to leave.
  nag(dt) {
    this.nagT -= dt;
    if (this.nagT <= 0) {
      this.nagT = 1.6;
      Foley.cloth();
    }
    this.prompt(true, 'Drop it.');
  }

  reset() {
    this.dropped = false;
    this.prompt(false);
  }
}
