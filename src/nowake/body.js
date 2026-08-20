/**
 * The body: the wrap, the weights, the carry and the disposal.
 *
 * "Reuse the Billy HotDog wrapping system with boat-specific staging: tarp
 * beside the body, roll him on, swap the ragdoll for the stabilised
 * wrapped-body prefab, player folds one side, Booski the other, player fastens
 * the authored straps, Booski closes the bag, and it becomes a two-person carry
 * object. **No knot simulation** — attachment points and authored animation, so
 * the bag never becomes a physics burrito."
 *
 * That is exactly what this file is, and the reason it is a file rather than
 * two hundred lines in `main.js`: every stage below is an authored pose change
 * on a prefab, and nothing in it is simulated. The prefab itself is the shared
 * `buildWrappedBody` from the Bada Bing cleanup and the graveyard burial — the
 * same object, seen a third time, with boat staging around it.
 *
 * THE CARRY IS ROOT MOTION ON A PATH. Eight authored waypoints from the cabin
 * sole to the swim platform, and the two carriers are driven off the same
 * parameter as the bag, so nobody's hands leave it. The path runs through the
 * companionway the deck was widened for — see `deck-collision.js` — and out the
 * transom gate, which is why the cockpit seating is a U that opens to
 * starboard.
 */
import * as THREE from 'three';

import { buildWrappedBody } from '../core/props/wrapped-body.js';
import { box, cylinder, mat, mesh } from './build.js';
import { CABIN } from './deck-collision.js';

/**
 * Where the bag rests, at each authored stage of the carry, in boat space.
 *
 * Re-cut for the bigger boat (punch list N1): he is wrapped in the middle of
 * the salon rather than jammed against the dinette, the climb starts 0.32 m
 * lower because the sole did, and the platform is 0.50 m further aft.
 */
const CARRY_PATH = Object.freeze([
  { at: 0.00, pos: [0.10, -0.48, -3.53], yaw: -0.10, roll: 0 },
  { at: 0.10, pos: [0.00, 0.14, -3.23], yaw: -0.06, roll: 0 },
  { at: 0.22, pos: [-0.25, 0.20, -2.75], yaw: 0.02, roll: 0 },
  { at: 0.40, pos: [-0.80, 1.14, -1.30], yaw: 0.02, roll: 0 },
  { at: 0.52, pos: [-1.10, 1.34, -0.30], yaw: 0.06, roll: 0 },
  { at: 0.70, pos: [0.05, 1.34, 2.10], yaw: 0.10, roll: 0 },
  { at: 0.86, pos: [1.40, 1.30, 4.30], yaw: 0.42, roll: 0 },
  { at: 1.00, pos: [0.62, 0.18, 6.08], yaw: 0.16, roll: 0 },
]);

/** Where each carrier stands relative to the bag, at the head and the feet. */
const CARRIER_OFFSET = Object.freeze({ head: -1.30, feet: 1.14 });

function samplePath(t) {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  for (let i = 1; i < CARRY_PATH.length; i++) {
    const b = CARRY_PATH[i];
    if (k > b.at && i < CARRY_PATH.length - 1) continue;
    const a = CARRY_PATH[i - 1];
    const span = Math.max(1e-4, b.at - a.at);
    const raw = THREE.MathUtils.clamp((k - a.at) / span, 0, 1);
    const e = raw * raw * (3 - 2 * raw);
    return {
      x: THREE.MathUtils.lerp(a.pos[0], b.pos[0], e),
      y: THREE.MathUtils.lerp(a.pos[1], b.pos[1], e),
      z: THREE.MathUtils.lerp(a.pos[2], b.pos[2], e),
      yaw: THREE.MathUtils.lerp(a.yaw, b.yaw, e),
    };
  }
  const last = CARRY_PATH.at(-1);
  return { x: last.pos[0], y: last.pos[1], z: last.pos[2], yaw: last.yaw };
}

/**
 * Build the wrapping rig into the boat's own frame.
 *
 * @param {object} boat the result of `buildBoat` in `world.js`.
 */
export function createBodyRig(boat) {
  const root = new THREE.Group();
  root.name = 'wrapped body rig';
  boat.root.add(root);

  const tarpMat = mat(0x2f4048, .95);
  const strapMat = mat(0x2a241c, .92);
  const ringMat = mat(0x8e979a, .30, .78);

  /* The tarp, laid out beside the body before anything is rolled onto it. */
  const tarp = box('body tarpaulin sheet', [1.34, .02, 2.30], tarpMat, 0, .01, 0);
  const tarpGroup = new THREE.Group();
  tarpGroup.name = 'tarpaulin';
  tarpGroup.add(tarp);
  tarpGroup.position.set(0.10, CABIN.height + 0.01, -3.53);
  tarpGroup.rotation.y = -0.10;
  tarpGroup.visible = false;
  root.add(tarpGroup);

  /* The prefab, and everything strapped to it, built on first use.
   *
   * Lazily, on purpose. The shared wrapped body deliberately draws its sheet
   * twice -- back faces then front faces, because one double-sided transparent
   * mesh sorts its own two sides arbitrarily -- so it reports as coplanar with
   * itself in `tools/scene-audit.mjs` from the moment it exists. Building it
   * when the body actually has to be moved keeps it out of the audit of a boat
   * nobody has been shot on yet, and keeps the loft off the boot path.
   */
  const bag = new THREE.Group();
  bag.name = 'wrapped body';
  bag.visible = false;
  root.add(bag);

  const flaps = {};
  const straps = [];
  const sockets = [];
  let wrapped = null;
  let zip = null;
  let ballastLashing = null;

  function build() {
    if (wrapped) return;
    wrapped = buildWrappedBody({
      length: 1.94, build: 1.18, pose: 'flat', stain: .45, seed: 5, name: 'no-wake-wrapped-body',
    });
    bag.add(wrapped.group);

    /* Two flaps of sheeting standing open either side, folded down one at a
     * time -- the player's side first, then Booski's. Hinged, not simulated. */
    for (const side of ['port', 'starboard']) {
      const sx = side === 'port' ? -1 : 1;
      const hinge = new THREE.Group();
      hinge.name = `tarpaulin flap hinge · ${side}`;
      hinge.position.set(sx * .34, .02, 0);
      hinge.add(box(`tarpaulin flap · ${side}`, [.70, .015, 2.24], tarpMat, sx * .35, 0, 0));
      hinge.rotation.z = sx * -1.32;
      bag.add(hinge);
      flaps[side] = hinge;
    }

    /* Three authored straps. They tighten when the player fastens them; there
     * is no knot and nothing to simulate. */
    for (const [i, z] of [-0.62, 0.02, 0.66].entries()) {
      const strap = new THREE.Group();
      strap.name = `body strap ${i + 1}`;
      strap.add(box(`body strap band ${i + 1}`, [.86, .05, .09], strapMat, 0, .18, 0));
      strap.add(box(`body strap buckle ${i + 1}`, [.09, .06, .12], ringMat, .30, .21, 0));
      strap.position.set(0, 0, z);
      strap.scale.y = 1.5;
      strap.visible = false;
      bag.add(strap);
      straps.push(strap);
    }

    /* The zip that closes the bag, and the two lifting rings the ballast clips
     * to. Authored sockets, exactly as the spec asks. */
    zip = box('body bag closure seam', [.06, .04, 1.94], strapMat, 0, .36, 0);
    zip.visible = false;
    bag.add(zip);
    for (const [i, z] of [-0.30, 0.34].entries()) {
      const socket = mesh(`ballast socket ring ${i + 1}`,
        new THREE.TorusGeometry(.05, .012, 6, 14), ringMat, .30, .30, z);
      socket.rotation.y = Math.PI / 2;
      socket.visible = false;
      bag.add(socket);
      sockets.push(socket);
    }
    ballastLashing = cylinder('ballast lashing', .018, .46, strapMat, .30, .22, .02, 8);
    ballastLashing.rotation.x = Math.PI / 2;
    ballastLashing.visible = false;
    bag.add(ballastLashing);
  }

  const state = {
    stage: 'none',
    folded: 0,
    strapped: false,
    closed: false,
    weighted: false,
    carry: 0,
    sinkDepth: 0,
  };

  function place(t) {
    const at = samplePath(t);
    bag.position.set(at.x, at.y, at.z);
    bag.rotation.y = at.yaw;
    return at;
  }

  return {
    root,
    bag,
    tarp: tarpGroup,
    flaps,
    straps,
    sockets,
    get zip() { return zip; },
    build,
    state,
    path: CARRY_PATH,
    carrierOffset: CARRIER_OFFSET,

    /** Lou says "Finish it." The tarp comes out of the stern locker. */
    layTarp() {
      tarpGroup.visible = true;
      state.stage = 'tarp';
    },

    /**
     * The swap.
     *
     * The ragdoll is a jointed figure with a fall pose on it; the moment it has
     * to be moved by two men it becomes the prefab instead, which cannot flail,
     * cannot clip through a companionway and cannot be a physics burrito. The
     * spec asks for this before any carrying, and it happens here.
     */
    swapToWrapped(willy) {
      build();
      willy.group.visible = false;
      bag.visible = true;
      place(0);
      state.stage = 'wrapped';
      return bag;
    },

    /** One side at a time: the player's, then Booski's. */
    foldSide(side) {
      build();
      const hinge = flaps[side];
      if (!hinge) return false;
      hinge.rotation.z = 0;
      state.folded += 1;
      if (state.folded >= 2) state.stage = 'folded';
      return true;
    },

    /** The player fastens the authored straps. No knot minigame. */
    fastenStraps() {
      build();
      for (const strap of straps) {
        strap.visible = true;
        strap.scale.y = 1;
      }
      state.strapped = true;
      state.stage = 'strapped';
    },

    /** Booski closes the bag, and it becomes one object with two ends. */
    closeBag() {
      build();
      zip.visible = true;
      for (const socket of sockets) socket.visible = true;
      state.closed = true;
      state.stage = 'closed';
    },

    /** The cast iron, clipped to the rings. Booski cinches it. */
    attachBallast(ballast) {
      build();
      if (!ballast) return false;
      ballast.visible = true;
      bag.add(ballast);
      ballast.position.set(.34, .22, .02);
      ballast.rotation.set(0, 0, 0);
      ballastLashing.visible = true;
      state.weighted = true;
      state.stage = 'weighted';
      return true;
    },

    /**
     * The two-person carry, as one parameter.
     *
     * `t` runs 0 to 1 from the cabin sole to the swim platform. The bag and
     * both carriers are placed from the same sample, which is what "synchronised
     * root motion" means here: there is no separate walk cycle that can drift
     * out of step with the thing being carried.
     */
    carryTo(t, { placePlayer = null, booski = null } = {}) {
      const at = place(t);
      state.carry = THREE.MathUtils.clamp(t, 0, 1);
      const sin = Math.sin(at.yaw);
      const cos = Math.cos(at.yaw);
      if (booski) {
        booski.group.position.set(
          at.x + sin * CARRIER_OFFSET.head,
          /* Never below the sole he is standing on. Written as CABIN.height and
           * not as the number: the sole dropped 0.32 m for N1 and a hard -0.20
           * here left Booski hovering over it for the whole lift. */
          Math.max(CABIN.height, at.y - 0.62),
          at.z + cos * CARRIER_OFFSET.head,
        );
        booski.group.rotation.y = at.yaw + Math.PI;
        booski.parts.armL.rotation.set(-.86, 0, -.30);
        booski.parts.armR.rotation.set(-.86, 0, .30);
        booski.parts.foreL.rotation.set(-1.02, 0, 0);
        booski.parts.foreR.rotation.set(-1.02, 0, 0);
      }
      /* The player is the other end of it. He has no body mesh -- nobody in
       * this game does, in first person -- so the carry is shown from HIS eyes
       * rather than from a camera that would frame a bag with one man on it. */
      if (placePlayer) {
        placePlayer(
          at.x + sin * CARRIER_OFFSET.feet,
          at.y,
          at.z + cos * CARRIER_OFFSET.feet,
          at,
        );
      }
      return at;
    },

    /**
     * Over the side.
     *
     * "One strike on the water, it sinks, it is gone. No enormous splash, no
     * floating marker, no joke." `t` runs 0 to 1 over the authored slide; the
     * strike is at 0.55 and everything after it is the bag going down.
     */
    disposeTo(t) {
      const k = THREE.MathUtils.clamp(t, 0, 1);
      const rest = CARRY_PATH.at(-1).pos;
      if (k <= .55) {
        const e = k / .55;
        const eased = e * e;
        bag.position.set(
          rest[0] + eased * .10,
          rest[1] - eased * .32,
          rest[2] + eased * .92,
        );
        bag.rotation.z = -eased * .42;
        state.sinkDepth = 0;
      } else {
        const e = (k - .55) / .45;
        state.sinkDepth = e * 2.2;
        bag.position.set(rest[0] + .10, rest[1] - .32 - state.sinkDepth, rest[2] + .92);
        bag.rotation.z = -.42 - e * .22;
      }
      if (k >= 1) bag.visible = false;
      return { struck: k >= .55, sinkDepth: state.sinkDepth };
    },

    /** Where the bag is, in world space, for the camera and the audio. */
    worldPosition(target = new THREE.Vector3()) {
      bag.getWorldPosition(target);
      return target;
    },
  };
}
