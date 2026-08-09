/**
 * The laboratory contract, as an executable specification.
 *
 * The environment build owns the real thing — the reinforced glass, the six
 * bodies behind it, the core, the vents, the transfer drawer, the keypad and
 * the muffling. The mission (SilentSquatchMission.js) only ever speaks to it
 * through the API the brief fixed:
 *
 *   lab.openDoor() / lab.closeDoor() / lab.lockDoor()   lab.doorLocked
 *   lab.keypad.arm() / lab.keypad.enter(s)  -> true on '6969'
 *   lab.transferDrawer.send()
 *   lab.core.begin() / lab.core.complete()  lab.monitors.setPurple()
 *   lab.gas.start()   lab.gas.density        // 0..1
 *   lab.scientists    // 6, index 0 = Aubbie; .say(cue) .panic() .coughing()
 *                     //                      .crawl() .collapse() .handprint()
 *   lab.muffled       // true once the door locks
 *   lab.glassAudio    // route scientist lines through this
 *   lab.hiddenWall.open()   lab.lifeSigns
 *
 * This file implements exactly that and nothing else, in plain data: no THREE,
 * no sound, no meshes. It exists for two reasons.
 *
 *  1. It is what the mission's own checks drive, in Node and in the browser,
 *     so the mission is provable on its own terms rather than only when the
 *     geometry happens to be finished.
 *  2. It is the written form of the contract. If the real lab and this file
 *     disagree, one of them is wrong, and which one is a conversation rather
 *     than a mystery.
 *
 * It is never mounted in play.
 */

/** How long the gas takes to fill the room, seconds, 0 -> 1 density. */
const GAS_FILL_SECONDS = 26;

function makeScientist(index, glassAudio, lab) {
  return {
    index,
    /** 'lab' while behind the glass, 'observation' once through the door. */
    side: 'lab',
    alive: true,
    state: 'working',
    /** Everything this body was asked to do, in order. */
    log: [],
    /** Cues that came out of this body. */
    lines: [],
    /** The same cues with the options they were played on, so a check can
     * read the level a line actually left at — `VOICE_GAIN` in ../script.js
     * is per-profile and the mission applies it here. */
    takes: [],
    /** The ones that did NOT go through the glass: this man's own voice, in
     * the room, because he has walked out of the sealed lab. */
    dry: [],
    /**
     * A line, out of THIS body.
     *
     * `opts.dry` is the mission saying the line is not behind the glass; a man
     * who has stepped out is dry whether or not anybody said so. Everything
     * else goes through the send.
     *
     * IT IS ALWAYS THIS METHOD, muffled or not. That is the whole of the
     * owner's "Aubbie's mouth stops moving once he leaves the lab" note: the
     * real lab moves a scientist's jaw from inside `say()`, so a line that
     * goes round it is a line spoken with the mouth shut.
     */
    say(cue, opts = {}) {
      this.lines.push(cue);
      this.takes.push({ cue, ...opts });
      if (opts.dry === true || this.side !== 'lab') this.dry.push({ cue, ...opts });
      else glassAudio.play(cue, { from: index, muffled: lab.muffled, ...opts });
      return opts.seconds ?? 0;
    },
    panic() { this.state = 'panic'; this.log.push('panic'); },
    cover() { this.state = 'covering'; this.log.push('cover'); },
    coughing() { this.state = 'coughing'; this.log.push('coughing'); },
    slam() { this.state = 'slamming'; this.log.push('slam'); },
    crawl() { this.state = 'crawling'; this.log.push('crawl'); },
    collapse() {
      this.state = 'down';
      this.alive = false;
      this.log.push('collapse');
    },
    handprint() { this.log.push('handprint'); lab.handprints++; },
    /**
     * The round arriving, which is not the same event as the body going down.
     *
     * Owner playtest: "blood effect when Aubbie is shot." The real lab spends
     * this on a wound decal, spatter and a pool (see `bleed` in
     * scenes/SilentSquatch.js); the contract records that it was asked for,
     * which is the half the mission is responsible for. `collapse` still
     * follows, and the gassing's five collapses still carry no `shot`.
     */
    shot(hit = null) { this.log.push('shot'); this.shotHit = hit ?? null; },
    /** Aubbie, coming out through the glass door into the observation area. */
    stepOut() { this.side = 'observation'; this.log.push('stepOut'); },
    tryHandle() { this.log.push('tryHandle'); },
    stare() { this.state = 'staring'; this.log.push('stare'); },
  };
}

export function createContractLab({ code = '6969' } = {}) {
  const glassAudio = {
    /** Every line that went through the glass, with how muffled it was. */
    log: [],
    play(cue, meta = {}) {
      glassAudio.log.push({ cue, ...meta });
    },
  };

  const lab = {
    /* ---- the glass door ---- */
    doorOpen: false,
    doorLocked: false,
    /** True once the door locks: from that moment every scientist line is
     * behind twelve centimetres of glass. */
    muffled: false,
    openDoor() {
      if (lab.doorLocked) return false;
      lab.doorOpen = true;
      return true;
    },
    closeDoor() {
      lab.doorOpen = false;
      return true;
    },
    lockDoor() {
      lab.doorOpen = false;
      lab.doorLocked = true;
      lab.muffled = true;
      return true;
    },

    /* ---- the keypad beside the door ---- */
    keypad: {
      armed: false,
      attempts: [],
      arm() { lab.keypad.armed = true; },
      enter(typed) {
        lab.keypad.attempts.push(String(typed ?? ''));
        if (!lab.keypad.armed) return false;
        if (String(typed) !== code) return false;
        lab.lockDoor();
        return true;
      },
    },

    /* ---- the secure transfer drawer in the wall ---- */
    transferDrawer: {
      sent: 0,
      send() { lab.transferDrawer.sent++; return true; },
    },

    /* ---- the weapon core. `complete()` is the call the mission makes;
     * `finished` is the flag it leaves behind, so the two never collide. ---- */
    core: {
      running: false,
      finished: false,
      begin() { lab.core.running = true; },
      complete() { lab.core.finished = true; lab.core.running = true; },
    },
    monitors: {
      purple: false,
      setPurple() { lab.monitors.purple = true; },
    },

    /* ---- the ceiling vents ---- */
    gas: {
      running: false,
      density: 0,
      start() { lab.gas.running = true; },
    },

    /* ---- the hidden wall in the wine cellar ---- */
    hiddenWall: {
      isOpen: false,
      open() { lab.hiddenWall.isOpen = true; },
      close() { lab.hiddenWall.isOpen = false; },
    },

    glassAudio,
    handprints: 0,
    scientists: [],

    /** Life signs INSIDE the lab. Aubbie stops counting the moment he steps
     * out through the door, which is why killing him in the observation area
     * does not move this number and gassing the other five takes it to 0. */
    get lifeSigns() {
      return lab.scientists.filter((s) => s.alive && s.side === 'lab').length;
    },

    /** Advance the world. Only the gas moves on its own. */
    update(dt) {
      if (lab.gas.running && lab.gas.density < 1) {
        lab.gas.density = Math.min(1, lab.gas.density + dt / GAS_FILL_SECONDS);
      }
    },
  };

  for (let i = 0; i < 6; i++) lab.scientists.push(makeScientist(i, glassAudio, lab));

  return lab;
}
