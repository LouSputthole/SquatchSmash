/**
 * The bloom pass, and the switch that turns it off.
 *
 * The apartment is a dark flat full of small bright things: a monitor, RGB
 * strips down a tower, a bare bulb, the LEDs on a keyboard, a bong, three
 * candles on a closet floor. There are 151 emissive meshes in the scene and
 * before this every one of them was simply a bright colour with a hard edge --
 * the screen did not spill, the bulb did not glare, the candles did not have
 * anything around them.
 *
 * That is what bloom is for, and it is the one post effect this scene actually
 * wants. It is thresholded, so nothing that is merely light-coloured picks it
 * up: the wall stays a wall and only the things that are emitting bleed.
 *
 * Two things worth knowing about the wiring:
 *
 * The composer renders into linear render targets, and three only applies tone
 * mapping and the colour-space transform when it draws to the canvas -- so
 * OutputPass has to do it at the end instead. It reads renderer.toneMapping
 * and renderer.toneMappingExposure at render time, which means the day-night
 * cycle's exposure ramp keeps driving it with no change at all.
 *
 * And this is separate from the CSS filter chain on the canvas that does the
 * drink and the mushrooms. Those are colour grading over a finished frame;
 * bloom has to happen while the frame still has values above 1 in it. They do
 * not interact and neither can replace the other.
 */
import * as THREE from 'three';
import { EffectComposer } from '../../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/addons/postprocessing/OutputPass.js';

/* Restrained on purpose. This is a flat at night, not a synthwave album cover:
 * the monitor should glow the way a monitor in a dark room glows, and if the
 * radio dial is hazy you have gone too far. */
const STRENGTH = 0.42;
const RADIUS = 0.34;
/* Luminance a pixel has to beat to bloom at all. High enough that lit walls
 * and white porcelain stay out of it. */
const THRESHOLD = 0.82;

/*
 * Bloom runs at a fraction of the frame.
 *
 * UnrealBloomPass already halves once internally; this halves again, so its
 * mip chain starts at a quarter of the frame's linear size and costs about a
 * quarter as much. Nothing is lost: the pass exists to produce a blur, and a
 * blur is the one thing that does not care what resolution it was computed at.
 * The final composite is a full-size quad either way.
 */
const BLOOM_SCALE = 0.5;

/*
 * Frame time above which bloom is not worth what it costs, and how many
 * consecutive frames have to exceed it before giving up.
 *
 * This exists because the cost could not be measured honestly anywhere it was
 * developed: the only browser available here is software-rendered, where a
 * fill-bound effect is thousands of times slower than on any real GPU, so the
 * numbers say nothing either way. Rather than pick a default by guessing at
 * somebody else's hardware, the thing measures itself on the machine it is
 * actually running on and switches off if it is not affordable. [B] puts it
 * back, and having done so, it stops second-guessing you.
 */
const BUDGET_MS = 34;
const BUDGET_FRAMES = 90;

export class PostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;
    this.composer = null;
    this.bloom = null;
    /** Consecutive frames over budget. */
    this._slow = 0;
    /** Set once the player has expressed an opinion with [B]. */
    this._manual = false;
    /** Called with false when it gives up on its own. */
    this.onAuto = null;
  }

  /**
   * Build the chain. Deferred and guarded: a machine that could not give us
   * float render targets should still get the apartment, just flatter.
   * @returns {boolean} whether bloom is on
   */
  enable() {
    if (this.composer) { this.enabled = true; return true; }
    try {
      const size = this.renderer.getSize(new THREE.Vector2());
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(size.x, size.y);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(
        size.clone().multiplyScalar(BLOOM_SCALE), STRENGTH, RADIUS, THRESHOLD,
      );
      /* The composer calls setSize on every pass with the FRAME size, which
       * would undo the scale on the first resize. Fold it in here instead, so
       * there is one place that knows bloom does not run at frame size. */
      const setSize = this.bloom.setSize.bind(this.bloom);
      this.bloom.setSize = (w, h) => setSize(
        Math.max(1, Math.round(w * BLOOM_SCALE)),
        Math.max(1, Math.round(h * BLOOM_SCALE)),
      );
      this.composer.addPass(this.bloom);
      // Last, and the only pass that writes to the canvas.
      this.composer.addPass(new OutputPass());
      this.enabled = true;
    } catch (err) {
      console.warn('bloom unavailable; rendering straight', err);
      this.composer = null;
      this.enabled = false;
    }
    return this.enabled;
  }

  disable() {
    this.enabled = false;
  }

  toggle() {
    // An explicit choice is final; stop measuring and stop overruling it.
    this._manual = true;
    if (this.enabled) this.disable();
    else this.enable();
    return this.enabled;
  }

  /**
   * Watch what it is costing, and give up if it is not affordable.
   * @param {number} dt seconds for the frame just drawn
   */
  sample(dt) {
    if (!this.enabled || this._manual) return;
    if (dt * 1000 > BUDGET_MS) {
      if (++this._slow >= BUDGET_FRAMES) {
        this.disable();
        this._slow = 0;
        this.onAuto?.(false);
      }
    } else if (this._slow) {
      // Has to be sustained. One long frame is a texture decode, not a verdict.
      this._slow = 0;
    }
  }

  setSize(w, h) {
    this.composer?.setSize(w, h);
    this.bloom?.setSize(w, h);
  }

  /** Draw the frame, however it is being drawn. */
  render() {
    if (this.enabled && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.composer?.dispose?.();
    this.composer = null;
    this.bloom = null;
    this.enabled = false;
  }
}
