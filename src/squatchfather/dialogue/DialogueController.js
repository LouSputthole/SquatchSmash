// Plays a sequence of dialogue lines from dialogue.json into the subtitle UI.
//
// A line is one of:
//   { speaker, text, dur, gesture?, look? }  — spoken, shown as a subtitle
//   { beat, stage?, look?, gesture? }        — a silent pause (optional stage direction)
//
// Callbacks let the scene react without the dialogue data knowing about Three.js:
//   onSpeak(speakerId, line)  — a character starts talking
//   onLook(targetId)          — Prospect's seated gaze should move
//   onGesture(name)           — a character animation cue

const GAP = 0.35; // silence between lines

export class DialogueController {
  constructor(data, ui, hooks = {}) {
    this.data = data;
    this.ui = ui; // { root, who, line }
    this.hooks = hooks;
    this.queue = [];
    this.current = null;
    this.t = 0;
    this.gap = 0;
    this.onDone = null;
    this.playing = false;
  }

  speakerName(id) {
    const s = this.data.speakers[id];
    return s ? s.name : id;
  }

  speakerTone(id) {
    const s = this.data.speakers[id];
    return s ? s.tone : '';
  }

  // Start a named sequence from dialogue.json. Replaces anything in flight.
  play(key, onDone = null) {
    const seq = this.data[key];
    if (!seq) {
      if (onDone) onDone();
      return;
    }
    this.queue = seq.slice();
    this.current = null;
    this.t = 0;
    this.gap = 0;
    this.onDone = onDone;
    this.playing = true;
    this.#advance();
  }

  // Say a single line out of band (nudges, failure barks).
  say(key, onDone = null) {
    this.play(key, onDone);
  }

  stop() {
    this.queue.length = 0;
    this.current = null;
    this.playing = false;
    this.onDone = null;
    this.#hide();
  }

  #hide() {
    this.ui.root.classList.remove('show');
  }

  #show(line) {
    const { who, line: lineEl, root } = this.ui;
    if (line.speaker) {
      who.textContent = this.speakerName(line.speaker);
      who.className = `who ${this.speakerTone(line.speaker)}`;
      who.style.display = '';
      lineEl.className = 'line';
      lineEl.textContent = line.text;
      root.classList.add('show');
    } else if (line.stage) {
      who.style.display = 'none';
      lineEl.className = 'stage';
      lineEl.textContent = line.stage;
      root.classList.add('show');
    } else {
      this.#hide();
    }
  }

  #advance() {
    if (!this.queue.length) {
      this.playing = false;
      this.current = null;
      this.#hide();
      const done = this.onDone;
      this.onDone = null;
      if (done) done();
      return;
    }
    const line = this.queue.shift();
    this.current = line;
    this.t = line.speaker ? (line.dur || 2.5) : (line.beat || 1);
    this.#show(line);
    if (line.speaker && this.hooks.onSpeak) this.hooks.onSpeak(line.speaker, line);
    if (line.look && this.hooks.onLook) this.hooks.onLook(line.look);
    if (line.gesture && this.hooks.onGesture) this.hooks.onGesture(line.gesture);
  }

  update(dt) {
    if (!this.playing) return;
    if (this.gap > 0) {
      this.gap -= dt;
      if (this.gap <= 0) this.#advance();
      return;
    }
    if (!this.current) return;
    this.t -= dt;
    if (this.t <= 0) {
      if (this.current.speaker && this.hooks.onSpeakEnd) this.hooks.onSpeakEnd(this.current.speaker);
      this.current = null;
      this.#hide();
      this.gap = GAP;
    }
  }
}
