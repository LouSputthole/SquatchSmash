import * as Foley from '../audio/Foley.js';
import { weaponDrop } from '../audio/GunshotAudio.js';
import { writeGameplayPromptKey } from '../../core/gameplay-key-adapter.js';

// Letting go of it has to be the player's doing. He will not walk out of the
// restaurant with it in his hand — if the player tries, he stops and looks at
// the weapon until they press the button.

export class WeaponDropInteraction {
  constructor({ prospect, ui, onDropped }) {
    this.prospect = prospect;
    this.ui = ui;
    this.onDropped = onDropped;
    this.dropped = false;
    this.nagT = 0;
  }

  prompt(show, text = 'Drop the weapon') {
    writeGameplayPromptKey(this.ui.promptKey, 'E');
    this.ui.promptText.textContent = text;
    this.ui.prompt.classList.toggle('show', show);
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
