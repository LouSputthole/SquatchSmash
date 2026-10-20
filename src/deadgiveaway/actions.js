/**
 * What a man does with his hands at this table: drink, smoke, spit, point,
 * lean back, shake his head, raise his glass, nod.
 *
 * Two halves, one vocabulary:
 *   - perform(kind) is YOU, in first person. The props are the flat's own
 *     camera-mounted ones (`src/world/props.js` makeHeldDrinks/poseHeldDrink,
 *     makeHeldCigarette) and the exhale is `src/world/smoke.js`
 *     emitCigaretteExhale, the same plume Tony blows everywhere else. Then the
 *     kind goes to the server so the table sees it.
 *   - remote(playerId, kind) is everybody else, in third person: the seat's
 *     figure moves its own arm and head, the whiskey glass the world set at
 *     that place is lifted in his hand for a sip, a cigar comes up with its
 *     ember, the spit arcs into the brass spittoon, and the sound plays from
 *     his chair.
 *
 * Pacing is the server's 2/s plus one rule here: a kind still playing for a
 * player is not started again for him.
 */
import { makeHeldDrinks, poseHeldDrink, makeHeldCigarette } from '../world/props.js';
import { emitCigaretteExhale } from '../world/smoke.js';

export const ACTIONS = Object.freeze(['drink', 'smoke', 'spit', 'point', 'lean', 'shake', 'raise', 'nod']);

const DEFAULT_KEYS = Object.freeze({
  drink: 'Digit1', smoke: 'Digit2', spit: 'Digit3', point: 'Digit4',
  lean: 'Digit5', shake: 'Digit6', raise: 'Digit7', nod: 'Digit8',
});

/** Seconds each one takes. Drink is a sip, not a swallow; smoke is one draw and a restrained exhale. */
export const ACTION_DURATION = Object.freeze({
  drink: 0.9, smoke: 2.4, spit: 1.0, point: 1.5, lean: 2.2, shake: 1.2, raise: 1.6, nod: 1.0,
});

/* Cue names. Every one is in assets/sfx/manifest.json -- `npm run check`
 * fails on a literal that is not. */
const CUE = Object.freeze({
  sip: 'whiskey.swig',
  setDown: 'glass.set',
  drag: 'cig.drag',
  exhale: 'cig.exhale',
  spit: 'deadgiveaway.spit',
});

/** 0 -> 1 -> 0 over a normalised action, eased at both ends. */
function bell(k) {
  const x = Math.max(0, Math.min(1, k));
  return Math.sin(x * Math.PI) ** 2;
}
/** Up fast, hold, down: the shape of a lifted glass. */
function lift(k, up = 0.3, down = 0.75) {
  if (k <= 0 || k >= 1) return 0;
  if (k < up) { const e = k / up; return e * e * (3 - 2 * e); }
  if (k > down) { const e = (1 - k) / (1 - down); return e * e * (3 - 2 * e); }
  return 1;
}

export function createActions({ scene, camera, audio = null, world, seats, smoke = null, THREE, send = () => {}, selfId = () => null, keys = DEFAULT_KEYS }) {
  const anchors = world.anchors;
  const remotes = new Map();   // playerId -> Map(kind -> { t, dur, ... })
  const local = new Map();     // kind -> { t, dur, ... }
  const spits = [];            // flying droplets
  let time = 0;

  /* ---------------- first-person rig ---------------- */

  const fp = new THREE.Group();
  fp.name = 'deadgiveaway.actions.first-person';
  camera.add(fp);

  /* The flat's held-drink mount, so the lift and tilt are exactly the
   * apartment's (poseHeldDrink). What sits in it here is a whiskey tumbler:
   * the glass on the felt in front of you, picked up. */
  const drinks = makeHeldDrinks();
  drinks.group.position.set(0.26, -0.30, -0.42);
  fp.add(drinks.group);
  const tumbler = new THREE.Group();
  tumbler.name = 'deadgiveaway.actions.held-tumbler';
  tumbler.visible = false;
  drinks.group.add(tumbler);
  const heldRig = { can: tumbler, bottle: drinks.bottle, jug: drinks.jug };
  let tumblerSource = null;

  function fillTumbler() {
    const seat = seats.seatOf(selfId());
    const source = seat === null ? null : world.glasses?.at?.(seat) ?? null;
    if (source === tumblerSource && tumbler.children.length) return source;
    tumbler.clear();
    tumblerSource = source;
    if (source) {
      const copy = source.clone(true);
      copy.position.set(0, -0.045, 0);
      copy.rotation.set(0, 0, 0);
      copy.scale.copy(source.getWorldScale(new THREE.Vector3()));
      copy.visible = true;
      tumbler.add(copy);
    } else {
      tumbler.add(tumblerMesh());
    }
    return source;
  }

  function tumblerMesh() {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.037, 0.033, 0.085, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xd8e2e6, transparent: true, opacity: 0.35, roughness: 0.08, side: THREE.DoubleSide }),
    );
    const whisky = new THREE.Mesh(
      new THREE.CylinderGeometry(0.033, 0.031, 0.03, 16),
      new THREE.MeshStandardMaterial({ color: 0x9a5418, transparent: true, opacity: 0.85, roughness: 0.2 }),
    );
    whisky.position.y = -0.026;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.033, 0.033, 0.012, 16),
      new THREE.MeshStandardMaterial({ color: 0xd8e2e6, transparent: true, opacity: 0.6, roughness: 0.08 }),
    );
    base.position.y = -0.044;
    g.add(glass, whisky, base);
    return g;
  }

  const cig = makeHeldCigarette();
  cig.group.position.set(0.09, -0.19, -0.34);
  cig.group.visible = false;
  fp.add(cig.group);
  const cigRest = cig.group.position.clone();

  /* A hand for pointing, which nothing in the shared props has. A sleeve
   * and a fist with one finger out, at the bottom right of the view. */
  const hand = new THREE.Group();
  hand.name = 'deadgiveaway.actions.point-hand';
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9936d, roughness: 0.85 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.9 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0xe4d8c2, roughness: 0.85 });
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.34), sleeve);
  arm.position.set(0, 0, 0.17);
  const cuffMesh = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.078, 0.02), cuff);
  cuffMesh.position.set(0, 0, 0.0);
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.08), skin);
  fist.position.set(0, -0.005, -0.045);
  const finger = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.075), skin);
  finger.position.set(-0.018, 0.008, -0.12);
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.04), skin);
  thumb.position.set(-0.038, 0.012, -0.06);
  hand.add(arm, cuffMesh, fist, finger, thumb);
  hand.position.set(0.24, -0.34, -0.42);
  hand.visible = false;
  fp.add(hand);
  const handRest = hand.position.clone();

  /* ---------------- third-person props ---------------- */

  function makeCigar() {
    const g = new THREE.Group();
    g.name = 'deadgiveaway.actions.cigar';
    const leaf = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0085, 0.0085, 0.13, 10),
      new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 }),
    );
    leaf.rotation.x = Math.PI / 2;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0089, 0.0089, 0.012, 10),
      new THREE.MeshStandardMaterial({ color: 0xb08a2a, roughness: 0.5, metalness: 0.4 }),
    );
    band.rotation.x = Math.PI / 2;
    band.position.z = -0.035;
    const ember = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0088, 0.0088, 0.008, 10),
      new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff5a1e, emissiveIntensity: 2.0, roughness: 1 }),
    );
    ember.rotation.x = Math.PI / 2;
    ember.position.z = 0.068;
    g.add(leaf, band, ember);
    g.userData.ember = ember;
    return g;
  }

  const spitMat = new THREE.MeshBasicMaterial({ color: 0xd8d2b8, transparent: true, opacity: 0.85 });
  const spitGeo = new THREE.SphereGeometry(0.012, 6, 5);

  function spittoonPoint() {
    const s = anchors.spittoon ?? anchors.table;
    return new THREE.Vector3(s.x, (s.y ?? 0.32), s.z);
  }

  function launchSpit(from) {
    const to = spittoonPoint();
    const drop = new THREE.Mesh(spitGeo, spitMat);
    drop.name = 'deadgiveaway.actions.spit';
    drop.position.copy(from);
    scene.add(drop);
    const d = from.distanceTo(to);
    spits.push({ mesh: drop, from: from.clone(), to, t: 0, dur: Math.max(0.45, Math.min(1.0, d * 0.32)), arc: Math.max(0.25, d * 0.22) });
  }

  /* ---------------- sound ---------------- */

  function play(name, position = null, opts = {}) {
    if (!audio?.ready) return;
    try {
      audio.play(name, { volume: 0.7, ...opts, ...(position ? { position, ref: 1.0, maxDist: 12 } : {}) });
    } catch { /* a missing cue falls back to the synth; nothing to do here */ }
  }

  function seatPosition(playerId, height = 1.15) {
    const seat = seats.seatOf(playerId);
    const info = anchors.seats.find((s) => s.seat === seat);
    if (!info) return null;
    return { x: info.x, y: (info.sitY ?? 0.5) + height - 0.5, z: info.z };
  }

  /* ---------------- local ---------------- */

  function perform(kind) {
    if (!ACTIONS.includes(kind) || local.has(kind)) return false;
    const state = { t: 0, dur: ACTION_DURATION[kind], fired: new Set() };
    if (kind === 'drink' || kind === 'raise') {
      state.source = fillTumbler();
      if (state.source) state.source.visible = false;
    }
    local.set(kind, state);
    send(kind);
    return true;
  }

  const _v = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');

  function updateLocal(dt) {
    /* The look offsets a gesture adds to the camera. Applied after the
     * Player has written the camera this frame, and never fed back into the
     * Player, so the pose the table receives is where you are looking. */
    let nodX = 0;
    let shakeY = 0;
    let leanZ = 0;
    for (const [kind, s] of local) {
      s.t += dt;
      const k = s.t / s.dur;
      const once = (tag, fn) => { if (!s.fired.has(tag)) { s.fired.add(tag); fn(); } };
      switch (kind) {
        case 'drink': {
          once('sip', () => play(CUE.sip));
          tumbler.visible = true;
          /* A tumbler, not a can: a sip is most of the way, never the
           * can's full pour-back. */
          poseHeldDrink(heldRig, 'can', lift(k, 0.35, 0.7) * 0.72);
          nodX -= lift(k, 0.35, 0.7) * 0.05;
          break;
        }
        case 'raise': {
          tumbler.visible = true;
          const e = lift(k, 0.25, 0.7);
          tumbler.position.set(-0.06 * e, 0.24 * e, -0.05 * e);
          tumbler.rotation.set(0.12 * e, 0, 0);
          break;
        }
        case 'smoke': {
          cig.group.visible = true;
          const draw = k < 0.5 ? bell(k / 0.5) : 0;
          cig.ember.material.emissiveIntensity = 2.2 + draw * 2.6;
          cig.glow.intensity = 0.35 + draw * 1.35;
          const away = k > 0.55 ? lift((k - 0.55) / 0.45, 0.2, 0.8) : 0;
          cig.group.position.set(cigRest.x + 0.05 * away, cigRest.y - 0.07 * away + 0.012 * draw, cigRest.z);
          once('drag', () => play(CUE.drag));
          if (k > 0.58) {
            once('exhale', () => {
              play(CUE.exhale, null, { volume: 0.55 });
              if (smoke) {
                camera.getWorldPosition(_v);
                camera.getWorldDirection(_dir);
                emitCigaretteExhale(smoke, _v, _dir);
              }
            });
          }
          break;
        }
        case 'spit': {
          nodX += bell(Math.min(1, k / 0.4)) * 0.12;
          if (k > 0.22) {
            once('spit', () => {
              camera.getWorldPosition(_v);
              camera.getWorldDirection(_dir);
              _v.addScaledVector(_dir, 0.18);
              _v.y -= 0.12;
              launchSpit(_v.clone());
              play(CUE.spit, null, { volume: 0.6 });
            });
          }
          break;
        }
        case 'point': {
          hand.visible = true;
          const e = lift(k, 0.25, 0.75);
          hand.position.set(handRest.x - 0.08 * e, handRest.y + 0.18 * e, handRest.z - 0.06 * e);
          hand.rotation.set(0.15 * e, 0.22 * e, 0);
          break;
        }
        case 'lean':
          leanZ += lift(k, 0.3, 0.75) * 0.14;
          nodX -= lift(k, 0.3, 0.75) * 0.06;
          break;
        case 'shake':
          shakeY += Math.sin(s.t * 15) * 0.09 * bell(k);
          break;
        case 'nod':
          nodX += Math.max(0, Math.sin(s.t * 11)) * 0.13 * bell(k);
          break;
        default:
          break;
      }
      if (s.t >= s.dur) {
        local.delete(kind);
        if (kind === 'drink' || kind === 'raise') {
          tumbler.visible = false;
          tumbler.position.set(0, 0, 0);
          tumbler.rotation.set(0, 0, 0);
          if (s.source) s.source.visible = true;
          if (kind === 'drink') play(CUE.setDown, null, { volume: 0.45 });
        }
        if (kind === 'smoke') { cig.group.visible = false; cig.group.position.copy(cigRest); }
        if (kind === 'point') hand.visible = false;
      }
    }
    if (nodX || shakeY || leanZ) {
      _e.set(-nodX, shakeY, 0, 'YXZ');
      _q.setFromEuler(_e);
      camera.quaternion.multiply(_q);
      if (leanZ) {
        _v.set(0, 0, leanZ).applyQuaternion(camera.quaternion);
        _v.y = 0;
        camera.position.add(_v);
      }
    }
  }

  /* ---------------- remote ---------------- */

  function remote(playerId, kind) {
    if (!ACTIONS.includes(kind) || !playerId || playerId === selfId()) return false;
    const npc = seats.npcOf(playerId);
    if (!npc) return false;
    let mine = remotes.get(playerId);
    if (!mine) { mine = new Map(); remotes.set(playerId, mine); }
    if (mine.has(kind)) return false;
    const s = { t: 0, dur: ACTION_DURATION[kind], fired: new Set(), npc };
    if (kind === 'drink' || kind === 'raise') borrowGlass(playerId, s);
    if (kind === 'smoke') {
      s.cigar = makeCigar();
      s.cigar.position.set(0, -0.01, 0.02);
      npc.parts.handR.add(s.cigar);
    }
    mine.set(kind, s);
    return true;
  }

  /** Lift the world's glass at his place into his right hand for the sip. */
  function borrowGlass(playerId, s) {
    const seat = seats.seatOf(playerId);
    const glass = seat === null ? null : world.glasses?.at?.(seat);
    if (!glass || glass.userData.dgBorrowed) return;
    glass.userData.dgBorrowed = true;
    s.glass = glass;
    s.glassParent = glass.parent;
    s.glassPos = glass.position.clone();
    s.glassQuat = glass.quaternion.clone();
    s.glassScale = glass.scale.clone();
    const ws = glass.getWorldScale(new THREE.Vector3());
    const hand = s.npc.parts.handR;
    hand.updateWorldMatrix(true, false);
    const hs = hand.getWorldScale(new THREE.Vector3());
    hand.add(glass);
    glass.position.set(0, -0.02, 0.03);
    glass.quaternion.identity();
    glass.scale.set(ws.x / (hs.x || 1), ws.y / (hs.y || 1), ws.z / (hs.z || 1));
  }

  function returnGlass(s) {
    const g = s.glass;
    if (!g) return;
    (s.glassParent ?? scene).add(g);
    g.position.copy(s.glassPos);
    g.quaternion.copy(s.glassQuat);
    g.scale.copy(s.glassScale);
    g.userData.dgBorrowed = false;
    s.glass = null;
  }

  function updateRemote(dt) {
    for (const [playerId, mine] of remotes) {
      for (const [kind, s] of mine) {
        s.t += dt;
        const k = Math.min(1, s.t / s.dur);
        const p = s.npc.parts;
        const once = (tag, fn) => { if (!s.fired.has(tag)) { s.fired.add(tag); fn(); } };
        const at = () => seatPosition(playerId);
        switch (kind) {
          case 'drink': {
            const e = lift(k, 0.35, 0.72);
            p.armR.rotation.x = -0.5 - e * 0.55;
            p.armR.rotation.z = 0.12 * e;
            p.foreR.rotation.x = -0.8 - e * 1.25;
            p.head.rotation.x -= e * 0.14;
            if (s.glass) s.glass.rotation.x = -e * 0.9;
            once('sip', () => play(CUE.sip, at(), { volume: 0.55 }));
            break;
          }
          case 'raise': {
            const e = lift(k, 0.25, 0.7);
            p.armR.rotation.x = -0.5 - e * 1.6;
            p.armR.rotation.z = 0.1 * e;
            p.foreR.rotation.x = -0.8 + e * 0.35;
            break;
          }
          case 'smoke': {
            const up = k < 0.55 ? lift(k / 0.55, 0.35, 0.8) : 0;
            p.armR.rotation.x = -0.5 - up * 0.5;
            p.armR.rotation.z = 0.14 * up;
            p.foreR.rotation.x = -0.8 - up * 1.35;
            const ember = s.cigar?.userData.ember;
            if (ember) ember.material.emissiveIntensity = 2.0 + (k < 0.5 ? bell(k / 0.5) : 0) * 3;
            once('drag', () => play(CUE.drag, at(), { volume: 0.45 }));
            if (k > 0.6) {
              once('exhale', () => {
                play(CUE.exhale, at(), { volume: 0.4 });
                if (smoke) {
                  p.head.getWorldPosition(_v);
                  _v.y += 0.12;
                  _dir.set(0, 0, 1).applyQuaternion(p.head.getWorldQuaternion(_q)).setY(0.15).normalize();
                  /* emitCigaretteExhale pushes the plume 0.55 m out to clear
                   * a first-person lens; from across a table it should leave
                   * the lips, so start it that far back. */
                  _v.addScaledVector(_dir, -0.47);
                  emitCigaretteExhale(smoke, _v, _dir);
                }
              });
            }
            break;
          }
          case 'spit': {
            const e = bell(Math.min(1, k / 0.45));
            p.head.rotation.x += e * 0.22;
            p.body.rotation.x = e * 0.1;
            if (k > 0.25) {
              once('spit', () => {
                p.head.getWorldPosition(_v);
                _v.y += 0.12;
                _dir.set(0, 0, 1).applyQuaternion(p.head.getWorldQuaternion(_q));
                _v.addScaledVector(_dir, 0.1);
                launchSpit(_v.clone());
                play(CUE.spit, at(), { volume: 0.5 });
              });
            }
            break;
          }
          case 'point': {
            const e = lift(k, 0.25, 0.75);
            p.armR.rotation.x = -0.5 - e * 0.98;
            p.armR.rotation.z = -0.08 * e;
            p.foreR.rotation.x = -0.8 + e * 0.7;
            p.body.rotation.x = e * 0.06;
            break;
          }
          case 'lean': {
            const e = lift(k, 0.3, 0.75);
            p.body.rotation.x = -0.2 * e;
            p.head.rotation.x += 0.08 * e;
            p.armL.rotation.x = -0.5 + e * 0.25;
            p.armR.rotation.x = -0.5 + e * 0.25;
            break;
          }
          case 'shake':
            p.head.rotation.y += Math.sin(s.t * 15) * 0.32 * bell(k);
            break;
          case 'nod':
            p.head.rotation.x += Math.max(0, Math.sin(s.t * 11)) * 0.28 * bell(k);
            break;
          default:
            break;
        }
        if (s.t >= s.dur) {
          if (s.glass) {
            returnGlass(s);
            if (kind === 'drink') play(CUE.setDown, at(), { volume: 0.35 });
          }
          s.cigar?.removeFromParent();
          mine.delete(kind);
        }
      }
      if (!mine.size) remotes.delete(playerId);
    }
  }

  function updateSpits(dt) {
    for (let i = spits.length - 1; i >= 0; i--) {
      const s = spits[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      s.mesh.position.lerpVectors(s.from, s.to, k);
      s.mesh.position.y += Math.sin(k * Math.PI) * s.arc;
      if (k >= 1) {
        s.mesh.removeFromParent();
        spits.splice(i, 1);
      }
    }
  }

  /** Called every frame AFTER seats.update (which rewrites the rest pose) and after the Player writes the camera. */
  function update(dt) {
    time += dt;
    updateLocal(dt);
    updateRemote(dt);
    updateSpits(dt);
  }

  /** A player left: drop whatever he was holding. */
  function forget(playerId) {
    const mine = remotes.get(playerId);
    if (!mine) return;
    for (const s of mine.values()) {
      returnGlass(s);
      s.cigar?.removeFromParent();
    }
    remotes.delete(playerId);
  }

  return {
    perform,
    remote,
    update,
    forget,
    keyFor: (kind) => keys[kind] ?? null,
    kindForKey: (code) => ACTIONS.find((kind) => keys[kind] === code) ?? null,
    playing: (kind, playerId = null) => (playerId ? remotes.get(playerId)?.has(kind) ?? false : local.has(kind)),
    get time() { return time; },
  };
}
