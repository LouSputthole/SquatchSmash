/**
 * PROJECT SILENT SQUATCH — the mission's own HUD.
 *
 * It builds and appends its own DOM and its own stylesheet, the way
 * `core/pause-menu.js` and `core/scene-inventory.js` do, so mansion.html needs
 * nothing added to it and the exploration build keeps working untouched when
 * the mission is not mounted.
 *
 * Four things, and they are deliberately four different registers:
 *
 *   objective   the standing order, top centre, in the campaign's own voice
 *   instruction which buttons — raised ONLY in a dialogue sequence's onDone,
 *               never on the same frame as the line that set it up
 *   subtitle    who is speaking and what they said
 *   callout     the name under the reticle when the crosshair is on the man
 *
 * Plus the keypad, which is a real thing the player types a real number into.
 */

const CSS = `
.ss-hud { position: fixed; inset: 0; pointer-events: none; z-index: 6;
  font-family: "Trebuchet MS", "Segoe UI", Verdana, sans-serif; color: #f2eee1; }
.ss-objective { position: absolute; top: 22px; left: 50%; transform: translateX(-50%);
  padding: 8px 18px; border-radius: 8px; background: rgba(10,10,16,.74);
  border: 1px solid rgba(232,194,104,.42); font-size: 15px; letter-spacing: .4px;
  opacity: 0; transition: opacity .22s; max-width: min(72vw, 620px); text-align: center; }
.ss-objective.show { opacity: 1; }
.ss-objective b { color: #ffe4a0; }
.ss-instruction { position: absolute; top: 74px; left: 50%; transform: translateX(-50%);
  padding: 7px 16px; border-radius: 6px; background: rgba(0,0,0,.55);
  border: 1px solid rgba(255,255,255,.18); font-size: 13px; letter-spacing: 2px;
  text-transform: uppercase; opacity: 0; transition: opacity .2s; text-align: center; }
.ss-instruction.show { opacity: 1; }
.ss-instruction.urgent { border-color: rgba(214,74,52,.8); color: #ffd9cd; }
.ss-callout { position: absolute; top: calc(50% + 26px); left: 50%; transform: translateX(-50%);
  font-size: 13px; font-weight: 900; letter-spacing: 3px; color: #ff8d6b;
  text-shadow: 0 0 8px rgba(0,0,0,.9); opacity: 0; transition: opacity .12s; }
.ss-callout.show { opacity: 1; }
.ss-subs { position: absolute; bottom: 62px; left: 50%; transform: translateX(-50%);
  width: min(78vw, 780px); text-align: center; opacity: 0; transition: opacity .16s; }
.ss-subs.show { opacity: 1; }
.ss-who { display: block; font-size: 12px; letter-spacing: 3px; font-weight: 800;
  color: #e8c268; margin-bottom: 3px; }
.ss-line { display: inline-block; font-size: 18px; line-height: 1.4; padding: 6px 14px;
  border-radius: 8px; background: rgba(4,4,8,.66); text-shadow: 0 2px 6px rgba(0,0,0,.9); }
.ss-subs.muffled .ss-line { color: #c9c4bb; font-style: italic;
  background: rgba(4,4,8,.48); text-shadow: none; }
.ss-timing { position: absolute; bottom: 132px; left: 50%; transform: translateX(-50%);
  width: min(56vw, 460px); padding: 9px 12px 8px; border-radius: 8px;
  background: rgba(4,4,8,.78); border: 1px solid rgba(232,194,104,.42); display: none; }
.ss-timing.show { display: block; }
.ss-timing-track { height: 13px; position: relative; overflow: hidden; border-radius: 5px;
  background: #1b1b22; border: 1px solid rgba(255,255,255,.18); }
.ss-timing-window { position: absolute; top: 0; bottom: 0; background: rgba(113,205,126,.48); }
.ss-timing-marker { position: absolute; top: -2px; bottom: -2px; width: 4px;
  transform: translateX(-2px); background: #f6e7b4; box-shadow: 0 0 7px rgba(246,231,180,.8); }
.ss-timing.hit .ss-timing-marker { background: #6cff82; }
.ss-timing.miss .ss-timing-marker { background: #ff624c; }
.ss-timing-count { margin-top: 5px; text-align: center; font-size: 11px; letter-spacing: 2px; }
.ss-keypad { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  padding: 18px 22px; border-radius: 10px; background: rgba(8,10,14,.92);
  border: 1px solid rgba(232,194,104,.5); text-align: center; display: none; }
.ss-keypad.show { display: block; }
.ss-keypad .ss-readout { font-size: 34px; letter-spacing: 12px; font-weight: 900;
  color: #7cff9d; min-height: 40px; font-family: "Courier New", monospace; }
.ss-keypad .ss-readout.bad { color: #ff6b4a; }
.ss-keypad .ss-hint { font-size: 12px; letter-spacing: 2px; color: #b7c0cf; margin-top: 6px; }
`;

export function createMissionHud({ parent = document.body } = {}) {
  if (!document.getElementById('ss-hud-style')) {
    const style = document.createElement('style');
    style.id = 'ss-hud-style';
    style.textContent = CSS;
    document.head.append(style);
  }

  const root = document.createElement('div');
  root.className = 'ss-hud';

  const objective = document.createElement('div');
  objective.className = 'ss-objective';
  const instruction = document.createElement('div');
  instruction.className = 'ss-instruction';
  const callout = document.createElement('div');
  callout.className = 'ss-callout';

  const timing = document.createElement('div');
  timing.className = 'ss-timing';
  const timingTrack = document.createElement('div');
  timingTrack.className = 'ss-timing-track';
  const timingWindow = document.createElement('div');
  timingWindow.className = 'ss-timing-window';
  const timingMarker = document.createElement('div');
  timingMarker.className = 'ss-timing-marker';
  const timingCount = document.createElement('div');
  timingCount.className = 'ss-timing-count';
  timingTrack.append(timingWindow, timingMarker);
  timing.append(timingTrack, timingCount);

  const subs = document.createElement('div');
  subs.className = 'ss-subs';
  const who = document.createElement('span');
  who.className = 'ss-who';
  const line = document.createElement('span');
  line.className = 'ss-line';
  subs.append(who, line);

  const keypad = document.createElement('div');
  keypad.className = 'ss-keypad';
  const readout = document.createElement('div');
  readout.className = 'ss-readout';
  const hint = document.createElement('div');
  hint.className = 'ss-hint';
  hint.textContent = 'TYPE THE CODE · ENTER TO CONFIRM · ESC TO STEP AWAY';
  keypad.append(readout, hint);

  root.append(objective, instruction, callout, timing, subs, keypad);
  parent.append(root);

  return {
    root,
    setObjective(text) {
      /* RETIRED AS A DISPLAY, kept as a model. The standing upper-left panel
       * mirrors this exact text (`mansionObjectivePlan` reads
       * `mission.objective`), so the transient top-center copy was the same
       * sentence twice on screen -- the literal "too many objectives".
       * Owner, 2026-08-30: keep the panel, retire the banner. The element
       * and its text remain for probes and the region selector; it simply
       * never shows. */
      objective.textContent = text || '';
    },
    setInstruction(text, { urgent = false } = {}) {
      instruction.textContent = text || '';
      instruction.classList.toggle('show', Boolean(text));
      instruction.classList.toggle('urgent', Boolean(text) && urgent);
    },
    setCallout(text) {
      callout.textContent = text || '';
      callout.classList.toggle('show', Boolean(text));
    },
    setTiming(view) {
      timing.classList.toggle('show', Boolean(view));
      timing.classList.toggle('hit', view?.flash === 'hit');
      timing.classList.toggle('miss', view?.flash === 'miss');
      if (!view) return;
      timingWindow.style.left = `${view.from * 100}%`;
      timingWindow.style.width = `${(view.to - view.from) * 100}%`;
      timingMarker.style.left = `${view.pos * 100}%`;
      timingCount.textContent = `PULL ${view.hits} / ${view.total}`;
    },
    /** A spoken line. `muffled` is what the reinforced glass looks like. */
    showLine({ speakerName, text, muffled }) {
      if (!text) return;
      who.textContent = speakerName || '';
      line.textContent = text;
      subs.classList.toggle('muffled', muffled === true);
      subs.classList.add('show');
    },
    hideLine() {
      subs.classList.remove('show');
    },
    /* ---- the keypad beside the laboratory door ---- */
    openKeypad() {
      readout.textContent = '';
      readout.classList.remove('bad');
      keypad.classList.add('show');
    },
    closeKeypad() {
      keypad.classList.remove('show');
    },
    get keypadOpen() {
      return keypad.classList.contains('show');
    },
    setKeypadDigits(digits, { bad = false } = {}) {
      readout.textContent = digits;
      readout.classList.toggle('bad', bad);
    },
    /** Everything on screen right now, for headless verification. */
    text() {
      return {
        /* The banner was retired as a display (see `setObjective`) but kept
         * as a model for exactly this probe, so the probe reads the model:
         * gating it on `show` here made every objective read "" from the
         * moment the banner stopped showing, and three verify:mansion checks
         * went red for a sentence that was on the upper-left panel the whole
         * time. */
        objective: objective.textContent,
        instruction: instruction.classList.contains('show') ? instruction.textContent : '',
        callout: callout.classList.contains('show') ? callout.textContent : '',
        timing: timing.classList.contains('show') ? timingCount.textContent : '',
        subtitle: subs.classList.contains('show') ? line.textContent : '',
        speaker: subs.classList.contains('show') ? who.textContent : '',
        keypad: keypad.classList.contains('show') ? readout.textContent : null,
      };
    },
    dispose() {
      root.remove();
    },
  };
}
