import * as THREE from 'three';
import { box, cylinder, mat, group } from '../../world/build.js';

/**
 * The chrome briefcase — Lou's missing luggage, and the plot device this
 * mission keeps coming back to. Built to the same hinge-plus-glow idiom as
 * world/props.js's makeFridge: a smoothed openness value drives both the
 * lid's hinge rotation and two interior point lights, breathing gently once
 * open.
 *
 * No interior objects are ever built. The lid opens past vertical (roughly
 * 100–110 degrees) so it tips AWAY from a viewer standing in front of the
 * case — the light spills out, but there is nothing to see down into and
 * nowhere the camera could frame it from the front even if there were.
 */
export function makeCase({ x = 0, y = 0, z = 0, rotY = 0 } = {}) {
  const W = 0.46; // width, local x
  const D = 0.32; // depth, local z — +z is the front, where the latches face
  const H = 0.12; // body height
  const LID_H = 0.032;

  const chrome = mat({ color: 0xc7ccd1, roughness: 0.35, metalness: 0.85 });
  const chromeAccent = mat({ color: 0xe4e7ea, roughness: 0.22, metalness: 0.95 });
  const rubber = mat({ color: 0x121212, roughness: 0.92 });
  const liner = mat({ color: 0x0c0c10, roughness: 0.95 });
  const dark = mat({ color: 0x08080a, roughness: 0.5, metalness: 0.4 });

  const outer = group('silvercase');
  outer.position.set(x, y, z);
  outer.rotation.y = rotY;

  const body = group('caseBody');
  outer.add(body);

  body.add(box({ size: [W, H, D], pos: [0, H / 2, 0], mat: chrome }));
  // Thin dark liner standing in for "the top face reads as a hollow interior
  // once the lid opens" — never modelled as an actual cavity or contents.
  body.add(box({ size: [W - 0.03, 0.008, D - 0.03], pos: [0, H - 0.004, 0], mat: liner, cast: false }));

  // Chamfered vertical edges — thin 45-degree strips standing in for
  // rounded/bevelled corners without needing real bevel geometry, plus a
  // rubber corner guard down at each foot.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body.add(box({
        size: [0.028, H, 0.028],
        pos: [sx * (W / 2 - 0.008), H / 2, sz * (D / 2 - 0.008)],
        mat: chromeAccent,
        rotY: Math.PI / 4,
      }));
      body.add(box({
        size: [0.05, 0.03, 0.05],
        pos: [sx * (W / 2 - 0.03), 0.015, sz * (D / 2 - 0.03)],
        mat: rubber,
      }));
    }
  }

  // Hinge knuckles along the back edge — decorative; the actual rotation
  // happens on lidPivot below, not on these.
  for (const hx of [-0.14, 0, 0.14]) {
    body.add(cylinder({
      r: 0.012, h: 0.05, pos: [hx, H, -D / 2], rotZ: Math.PI / 2, mat: chromeAccent,
    }));
  }

  // Twin latches on the front edge, each a body, a combination dial (ringed
  // with small ridge marks) and a release lever.
  for (const lx of [-0.13, 0.13]) {
    const ly = H * 0.55;
    body.add(box({ size: [0.09, 0.045, 0.02], pos: [lx, ly, D / 2 + 0.01], mat: chromeAccent }));
    body.add(cylinder({
      r: 0.017, h: 0.022, pos: [lx, ly, D / 2 + 0.024], rotX: Math.PI / 2, mat: chromeAccent,
    }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      body.add(box({
        size: [0.004, 0.006, 0.004],
        pos: [lx + Math.cos(a) * 0.02, ly + Math.sin(a) * 0.02, D / 2 + 0.024],
        mat: dark,
        cast: false,
      }));
    }
    body.add(box({ size: [0.03, 0.012, 0.01], pos: [lx, ly - 0.024, D / 2 + 0.016], mat: dark }));
  }

  // Lid, hinged along the back edge (world -z side once placed). Opens up
  // and PAST vertical, tipping away from the front (+z) so a viewer standing
  // in front of the case can never look down into it.
  const lidPivot = group('caseLidPivot');
  lidPivot.position.set(0, H, -D / 2);
  outer.add(lidPivot);

  const lid = group('caseLid');
  lidPivot.add(lid);
  lid.add(box({ size: [W - 0.02, LID_H, D - 0.02], pos: [0, LID_H / 2, D / 2 - 0.01], mat: chrome }));
  for (const sx of [-1, 1]) {
    lid.add(box({
      size: [0.024, LID_H, 0.024],
      pos: [sx * (W / 2 - 0.01), LID_H / 2, D - 0.03],
      mat: chromeAccent,
      rotY: Math.PI / 4,
    }));
  }
  // Folding carry handle, on what becomes the case's top face when closed.
  const handleZ = D * 0.65;
  lid.add(box({ size: [0.02, 0.045, 0.018], pos: [-0.08, LID_H + 0.02, handleZ], mat: chromeAccent }));
  lid.add(box({ size: [0.02, 0.045, 0.018], pos: [0.08, LID_H + 0.02, handleZ], mat: chromeAccent }));
  lid.add(box({ size: [0.2, 0.018, 0.018], pos: [0, LID_H + 0.042, handleZ], mat: chromeAccent }));

  // Interior glow — two point lights fixed at the seam inside the body
  // (not on the lid, so the source itself doesn't swing with it). Off when
  // closed; a gentle independent breathing pulse on each once open.
  const glowGold = new THREE.PointLight(0xd8a53a, 0, 0.7, 2);
  glowGold.position.set(-0.09, H - 0.015, -D / 2 + 0.03);
  body.add(glowGold);
  const glowPurple = new THREE.PointLight(0x6a2ad9, 0, 0.7, 2);
  glowPurple.position.set(0.09, H - 0.015, -D / 2 + 0.03);
  body.add(glowPurple);

  const OPEN_ANGLE = -(106 * Math.PI) / 180; // past vertical, away from the front
  let t = 0;
  let target = 0;
  let breathe = Math.random() * Math.PI * 2;

  function apply() {
    lidPivot.rotation.x = OPEN_ANGLE * t;
    const pulseGold = 0.65 + Math.sin(breathe) * 0.35;
    const pulsePurple = 0.65 + Math.sin(breathe * 1.3 + 2.1) * 0.35;
    glowGold.intensity = t * pulseGold * 2.4;
    glowPurple.intensity = t * pulsePurple * 1.8;
  }
  apply();

  /** Animate open (smoothed via update(), same as close()/setOpenness()). */
  function open() { target = 1; }
  /**
   * Shut it. `instant` snaps the lid and kills the glow in the same frame,
   * which is what a hard cut (a checkpoint restore, a scene reset) wants;
   * without it the lid eases down over about a second, which is what the
   * story beat wants.
   */
  function close({ instant = false } = {}) {
    target = 0;
    if (instant) {
      t = 0;
      apply();
    }
  }
  /** Set the target openness fraction (0..1); still eases via update(dt). */
  function setOpenness(v) { target = THREE.MathUtils.clamp(v, 0, 1); }
  function update(dt) {
    t += (target - t) * Math.min(1, dt * 6);
    if (target === 0 && t < 0.004) t = 0; // fully latched, not asymptotically shut
    breathe += dt * 2.2;
    apply();
  }

  // A conservative, rotation-agnostic AABB (half-diagonal on both axes) —
  // good enough for a small hidden prop; exact corners aren't needed here.
  const halfDiag = Math.sqrt((W / 2) ** 2 + (D / 2) ** 2);

  return {
    group: outer,
    body,
    lidPivot,
    lid,
    open,
    close,
    setOpenness,
    isOpen: () => target > 0.5,
    /** How far the lid actually is right now, 0 shut … 1 fully open. */
    openness: () => t,
    /** Lid down, latches home, no light coming out of it. */
    isShut: () => t < 0.01,
    update,
    bounds: [[x - halfDiag, y, z - halfDiag], [x + halfDiag, y + H, z + halfDiag]],
  };
}
