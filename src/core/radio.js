/**
 * The radio on the sideboard.
 *
 * Tracks are player-supplied: drop audio files into assets/music/ and list
 * them in assets/music/manifest.json. With no tracks the radio still works --
 * it tunes to static, which is both a fair result and an obvious hint.
 *
 * Playback goes through a PannerNode at the radio's position and a lowpass
 * filter, so music genuinely comes from across the room.
 */
import * as THREE from 'three';

const MUSIC_DIR = 'assets/music/';

export class Radio {
  constructor(audio, hud) {
    this.audio = audio;
    this.hud = hud;
    this.tracks = [];
    this.index = 0;
    this.on = false;
    this.station = 'KSQCH 101.7';
    this.el = null;
    this.source = null;
    this.position = new THREE.Vector3();
  }

  async loadManifest() {
    try {
      const res = await fetch(MUSIC_DIR + 'manifest.json', { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        this.tracks = data.tracks || [];
        if (data.station) this.station = data.station;
      }
    } catch {
      this.tracks = [];
    }
    return this.tracks.length;
  }

  setPosition(v) {
    this.position.copy(v);
  }

  /** Build the audio graph lazily -- it needs a running AudioContext. */
  _ensureGraph() {
    if (this.el || !this.audio.ready) return;
    const ctx = this.audio.ctx;

    this.el = new Audio();
    this.el.crossOrigin = 'anonymous';
    this.el.preload = 'auto';
    this.el.volume = 1;
    this.el.addEventListener('ended', () => this.next(true));
    this.el.addEventListener('error', () => {
      if (this.on && this.tracks.length) {
        this.hud.toast(`Could not play ${this._current()?.title || 'track'}`, 'bad');
        this.next(true);
      }
    });

    this.source = ctx.createMediaElementSource(this.el);

    // Small speakers in a big room: roll off the low end and the very top.
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 6200;
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 150;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;

    this.panner = ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 1.6;
    this.panner.maxDistance = 22;
    this.panner.rolloffFactor = 1.1;
    this._applyPannerPosition();

    this.source.connect(this.hp);
    this.hp.connect(this.tone);
    this.tone.connect(this.gain);
    this.gain.connect(this.panner);
    this.panner.connect(this.audio.busMusic);
  }

  _applyPannerPosition() {
    if (!this.panner) return;
    const p = this.position;
    if (this.panner.positionX) {
      this.panner.positionX.value = p.x;
      this.panner.positionY.value = p.y;
      this.panner.positionZ.value = p.z;
    } else {
      this.panner.setPosition(p.x, p.y, p.z);
    }
  }

  _current() {
    return this.tracks[this.index] || null;
  }

  toggle() {
    this.on ? this.turnOff() : this.turnOn();
  }

  turnOn() {
    this.audio.play('radio.click', { position: this.position, volume: 0.8 });
    this._ensureGraph();
    this.on = true;

    if (!this.tracks.length) {
      // Nothing to play: hiss, and say why.
      this.audio.startLoop('radio.static', {
        volume: 0.10, position: this.position, ref: 1.4, maxDist: 12,
      });
      this.hud.setRadio({ station: this.station, track: '— no signal —' });
      this.hud.say('Static. <em>Drop MP3s into assets/music/ and list them in manifest.json.</em>', 6000);
      return;
    }

    this.audio.play('radio.tune', { position: this.position, volume: 0.5 });
    this._playCurrent(0.35);
  }

  turnOff() {
    this.audio.play('radio.click', { position: this.position, volume: 0.8 });
    this.on = false;
    this.audio.stopLoop('radio.static', 0.25);
    if (this.el) {
      this._fadeTo(0, 0.25);
      setTimeout(() => {
        if (!this.on) this.el.pause();
      }, 300);
    }
    this.hud.setRadio(null);
  }

  next(auto = false) {
    if (!this.tracks.length) return;
    this.index = (this.index + 1) % this.tracks.length;
    if (!auto) this.audio.play('radio.tune', { position: this.position, volume: 0.5 });
    if (this.on) this._playCurrent(auto ? 0.2 : 0.3);
  }

  _playCurrent(fade) {
    const track = this._current();
    if (!track) return;
    this._ensureGraph();
    this.el.src = MUSIC_DIR + track.file;
    const p = this.el.play();
    if (p && p.catch) p.catch(() => { /* browser refused; the error handler covers it */ });
    this._fadeTo(0.85, fade);
    this.hud.setRadio({
      station: this.station,
      track: `${track.artist ? track.artist + ' — ' : ''}${track.title || track.file}`,
    });
    if (!this._announced) {
      this._announced = true;
      this.hud.say(`<em>${this.station}.</em> All squatch, all morning.`);
    }
  }

  _fadeTo(v, time) {
    if (!this.gain) return;
    const t = this.audio.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), t);
    this.gain.gain.linearRampToValueAtTime(Math.max(0.0001, v), t + time);
  }

  /** Muffle further when the player is heads-down in the game. */
  setFocusMuffle(on) {
    if (!this.tone) return;
    this.tone.frequency.linearRampToValueAtTime(
      on ? 1400 : 6200,
      this.audio.ctx.currentTime + 0.4,
    );
  }
}
