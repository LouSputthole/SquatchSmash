import * as Foley from '../audio/Foley.js';

// Taking the chair. Pulls it out, sits, and hands the camera over to the
// seated controller — from here the player has their eyes and nothing else.

export class ChairInteraction {
  constructor({ prospect, seated, director, scene, onSeated }) {
    this.prospect = prospect;
    this.seated = seated;
    this.director = director;
    this.chair = scene.props.prospectChair;
    this.onSeated = onSeated;
    this.done = false;
  }

  trigger() {
    if (this.done) return;
    this.done = true;
    Foley.chairScrape();

    // Chair slides back, he sits, chair comes in
    this.chair.position.z -= 0.35;
    this.prospect.canMove = false;

    setTimeout(() => {
      this.prospect.sit();
      this.seated.enter();
      this.director.letterbox(true);
      this.chair.position.z += 0.35;
      Foley.chairKnock();
      if (this.onSeated) this.onSeated();
    }, 620);
  }

  reset() {
    this.done = false;
  }
}
