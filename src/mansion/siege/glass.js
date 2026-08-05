/**
 * Every window the fight can reach, in three states.
 *
 * WHY THIS FILE EXISTS AT ALL. A broken window is TWO registrations, not one
 * edit -- the intact pane hidden AND its collider withdrawn in the same
 * instant, plus a shard group shown in its place:
 *
 *   damage.suppress(`glass.${id}`,        { object: pane, collider: paneBox,
 *                                           layers: ['battle'] });
 *   damage.group(   `glass.${id}.shards`, { object: shards,
 *                                           layers: ['battle'] });
 *
 * A pane that only hides is invisible glass you cannot walk through, and a
 * pane whose collider goes but whose mesh stays is a sheet of glass hanging in
 * a hole men are climbing through. Both have shipped in this project before.
 * `shatter(id)` does both halves or neither.
 *
 * WHERE THE PANES COME FROM. `MansionGrounds.js` builds every exterior wall as
 * the COMPLEMENT of its openings and publishes the result as
 * `grounds.shell.windows` -- 33 records, each with an id and its own extent --
 * and names the mesh for each one `<wall tag>-<id>`. So this file does not
 * author a single pane. It looks the base house's own glazing up, decides
 * which of it the siege can reach, and hangs shards behind it. Nothing here
 * edits the mansion.
 *
 * HOW A STATE IS EXPRESSED. Not by a flag this file checks every frame, and
 * not by registering entries lazily (there is no way to un-register one, so a
 * checkpoint could never put a pane back). Each pane owns its two overlay
 * entries for the whole run, and its BREAK STATE is which of them declares the
 * `battle` layer:
 *
 *   intact / cracked   neither declares it -> pane stands and is solid in
 *                      every damage state, shards hidden in every damage state
 *   broken             both declare it     -> in `battle` the pane goes and
 *                      its collider with it, and the shards appear
 *
 * `state.js` copies the layer array into the entry at registration and settles
 * from it on every `apply()`, so mutating that array and calling `refresh()`
 * is the supported way to change what a layer contains mid-state -- which is
 * exactly what its own `refresh()` doc comment says it is for. One `refresh()`
 * covers any number of panes, which is what makes `restoreBroken()` cheap.
 *
 * AUDIO. No files are added here. The scene should play `siege.glass.shatter`
 * at the pane's centre on a real break and `siege.glass.crack` on a first hit;
 * both ids need to reach `assets/sfx/manifest.json` through a `tools/*-vo.mjs`
 * generator or nobody will ever learn they are unrecorded (ENGINE-TRAPS #3).
 */
import * as THREE from 'three';

import { mat, box, group } from '../../world/build.js';
import { takeBaseCollider } from './dressing.js';

/** The three states a pane can be in, in the order it meets them. */
export const GLASS_STATES = Object.freeze(['intact', 'cracked', 'broken']);

/**
 * The glazing the siege can reach, and what it is called in the mission.
 *
 * `window` is the base house's own opening id (`grounds.shell.windows`). `id`
 * is the siege's, and it is what goes in the checkpoint's `brokenGlass` array,
 * so it is stable and readable rather than derived.
 *
 * `broken: true` is the brief's "some windows are broken" when he wakes -- the
 * house has been under attack for a while before the player is upright, so a
 * pane on each of the three faces the attackers have reached is already gone.
 * Everything else breaks when it is shot.
 *
 * The two `bedWestFrontSouth`/`bedEastFrontSouth` panes are the only upper
 * glazing over the forecourt that exists. The brief asks for "the gallery
 * windows above the forecourt" and the gallery has none -- it is an internal
 * room over the foyer void. That is already PART XIV's "More upper-floor
 * window sightlines onto the forecourt" row, and it stays there.
 */
/**
 * `into` is which way is INTO the house from that pane, and it is written out
 * rather than derived. The obvious derivation -- "away from the middle of the
 * building" -- is wrong for the billiard bay, whose north wall stands at
 * z = 54.2 with the room on its SOUTH side, and the failure is silent: shards
 * and litter land on the service road outside instead of on the floor men are
 * climbing onto. Four characters of table beats a heuristic that is right
 * fifteen times out of seventeen.
 */
export const SIEGE_GLASS = Object.freeze([
  /* -- The foyer's front glass, two storeys of it either side of the door. -- */
  { id: 'foyer.south.west', window: 'foyerSouthWest', room: 'foyer', into: '+z', broken: true },
  { id: 'foyer.transom', window: 'frontTransom', room: 'foyer', into: '+z', broken: false },
  { id: 'foyer.south.east', window: 'foyerSouthEast', room: 'foyer', into: '+z', broken: false },
  /* -- The west living room: wave 2B's own way in. -- */
  { id: 'living.south', window: 'livingSouth', room: 'livingRoom', into: '+z', broken: false },
  { id: 'living.west.south', window: 'livingWest', room: 'livingRoom', into: '+x', broken: false },
  { id: 'living.west.north', window: 'livingWestNorth', room: 'livingRoom', into: '+x', broken: true },
  /* -- The lounge, and the billiard bay hung off it: wave 1B's way in. -- */
  { id: 'lounge.south', window: 'loungeSouth', room: 'lounge', into: '+z', broken: false },
  { id: 'lounge.east.south', window: 'loungeEastSouth', room: 'lounge', into: '-x', broken: false },
  { id: 'lounge.east.north', window: 'loungeEastNorth', room: 'lounge', into: '-x', broken: false },
  { id: 'lounge.bay.south', window: 'baySouth', room: 'loungeBay', into: '+z', broken: false },
  { id: 'lounge.bay.north', window: 'bayNorth', room: 'loungeBay', into: '-z', broken: false },
  { id: 'lounge.bay.east.south', window: 'bayEastSouth', room: 'loungeBay', into: '-x', broken: true },
  { id: 'lounge.bay.east.mid', window: 'bayEastMid', room: 'loungeBay', into: '-x', broken: true },
  { id: 'lounge.bay.east.north', window: 'bayEastNorth', room: 'loungeBay', into: '-x', broken: false },
  /* -- The west wing. The living room's own west glazing is no longer an
   * EXTERIOR wall: the trophy hall and the winter garden were hung off that
   * elevation and now stand in front of it (WEST_WING is x -24.6..-16, z
   * 40.6..74.4). So the wing's own glass is what a man coming at the west
   * living room actually has to come through first, and `livingWest` /
   * `livingWestNorth` above are the second pane rather than the first.
   * `trophySouth` faces straight onto the forecourt. -- */
  { id: 'wing.trophy.south', window: 'trophySouth', room: 'trophyHall', into: '+z', broken: false },
  { id: 'wing.trophy.west.south', window: 'trophyWestSouth', room: 'trophyHall', into: '+x', broken: false },
  { id: 'wing.trophy.west.north', window: 'trophyWestNorth', room: 'trophyHall', into: '+x', broken: false },
  { id: 'wing.winter.west.south', window: 'winterWestSouth', room: 'winterGarden', into: '+x', broken: false },
  /* -- The kitchen, on the rear-service approach. -- */
  { id: 'kitchen.east', window: 'kitchenEast', room: 'kitchen', into: '-x', broken: false },
  /* -- Upper floor, over the forecourt: rounds come UP as well as in. -- */
  { id: 'upper.west.front', window: 'bedWestFrontSouth', room: 'bedWestFront', into: '+z', broken: false },
  { id: 'upper.east.front', window: 'bedEastFrontSouth', room: 'bedEastFront', into: '+z', broken: true },
]);

/** Shards on the floor reach this far out from the opening. */
const LITTER_REACH = 1.35;
/** How far a shard or a crack floats off the pane, to beat z-fighting. */
const LIFT = 0.03;
/** Falling glass particles, shared across every pane. Bounded on purpose. */
const PARTICLE_POOL = 48;
const PARTICLE_LIFE = 1.15;

const M_SHARD = mat({
  color: 0xbcd8e2, roughness: 0.08, metalness: 0.12, transparent: true, opacity: 0.62,
});
const M_SHARD_DULL = mat({
  color: 0x8fa8b2, roughness: 0.3, transparent: true, opacity: 0.5,
});
const M_CRACK = mat({
  color: 0xe8f4f8, roughness: 0.1, transparent: true, opacity: 0.75, depthWrite: false,
});
const M_FRAME_BENT = mat({ color: 0x2a2d33, roughness: 0.7, metalness: 0.4 });

export function buildSiegeGlass({ damage, grounds, interior } = {}) {
  if (!damage) throw new Error('buildSiegeGlass needs the damage-state overlay');
  if (!grounds?.shell?.windows) throw new Error('buildSiegeGlass needs the built grounds');

  const root = new THREE.Group();
  root.name = 'MansionSiegeGlass';
  /** @type {Map<string, object>} */
  const panes = new Map();
  /** Panes named in SIEGE_GLASS whose base geometry could not be found. */
  const unmatched = [];

  const liveColliders = damage.colliders;
  const baseArrays = [liveColliders, grounds.colliders, interior?.colliders];

  /** Every pane mesh in the shell, by the base house's own opening id. */
  const paneMeshes = new Map();
  grounds.root.updateMatrixWorld(true);
  grounds.root.traverse((o) => {
    if (!o.isMesh || !o.name) return;
    for (const w of grounds.shell.windows) {
      if (o.name.endsWith(`-${w.id}`)) paneMeshes.set(w.id, o);
    }
  });

  /**
   * The Box3 the shell enrolled for this pane.
   *
   * Reconstructed from the mesh rather than searched for by proximity, because
   * proximity is ambiguous: `panelWall` centres a mullion on the middle of a
   * two-bay pane, so the two boxes share a centre exactly and differ only in
   * size. `box()` writes the mesh's SIZE into its scale and `collider()` pads x
   * and z by 0.02 and leaves y alone, so the box the shell built is completely
   * determined -- match it to the millimetre and there is nothing to guess.
   */
  function colliderForPane(mesh) {
    const p = mesh.position;
    const s = mesh.scale;
    const want = {
      minX: p.x - s.x / 2 - 0.02,
      maxX: p.x + s.x / 2 + 0.02,
      minY: p.y - s.y / 2,
      maxY: p.y + s.y / 2,
      minZ: p.z - s.z / 2 - 0.02,
      maxZ: p.z + s.z / 2 + 0.02,
    };
    const near = (a, b) => Math.abs(a - b) < 1e-4;
    for (const arr of baseArrays) {
      if (!Array.isArray(arr)) continue;
      for (const b of arr) {
        if (!b?.min || !b?.max) continue;
        if (near(b.min.x, want.minX) && near(b.max.x, want.maxX)
          && near(b.min.y, want.minY) && near(b.max.y, want.maxY)
          && near(b.min.z, want.minZ) && near(b.max.z, want.maxZ)) return b;
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* Glass particles                                                    */
  /*                                                                     */
  /* One pool for the whole house rather than a burst allocated per       */
  /* break: twenty-two attackers coming through windows is an unbounded   */
  /* number of shatters and an unbounded number of quads is how a scene    */
  /* stops rendering. Oldest particle is reused when the pool runs dry.    */
  /* ---------------------------------------------------------------- */
  const particles = [];
  const particleRoot = group('siege.glass.particles');
  root.add(particleRoot);
  /* On the battle layer like everything else the siege adds, so a walking tour
   * can never find a shard from a fight that has not happened yet. */
  damage.group('glass.particles', { object: particleRoot, layers: ['battle'] });
  for (let i = 0; i < PARTICLE_POOL; i++) {
    const mesh = box({
      name: `siege.glass.particle.${i}`,
      size: [0.07, 0.09, 0.012],
      pos: [0, -50, 0],
      mat: M_SHARD,
      cast: false,
      receive: false,
    });
    mesh.visible = false;
    particleRoot.add(mesh);
    particles.push({
      mesh, life: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3(), floor: 0,
    });
  }
  let nextParticle = 0;

  function throwParticles(pane, count = 10) {
    const b = pane.box;
    for (let i = 0; i < count; i++) {
      const p = particles[nextParticle % PARTICLE_POOL];
      nextParticle += 1;
      /* Deterministic spread: the same window always breaks the same way, so a
       * checkpoint restore does not produce a different-looking hall. */
      const k = (i + 1) / (count + 1);
      const j = ((i * 53) % 100) / 100 - 0.5;
      p.mesh.position.set(
        THREE.MathUtils.lerp(b.min.x, b.max.x, k),
        THREE.MathUtils.lerp(b.min.y + 0.4, b.max.y - 0.2, 1 - k),
        THREE.MathUtils.lerp(b.min.z, b.max.z, k),
      );
      const outward = pane.axis === 'z' ? new THREE.Vector3(0, 0, pane.inward) : new THREE.Vector3(pane.inward, 0, 0);
      p.vel.copy(outward).multiplyScalar(1.6 + j * 0.9);
      p.vel.x += j * 0.7;
      p.vel.z += j * 0.7;
      p.vel.y = 0.5 + j * 0.6;
      p.spin.set(4 + j * 6, 3 - j * 5, 5 + j * 4);
      p.floor = pane.floorY;
      p.life = PARTICLE_LIFE;
      p.mesh.visible = true;
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; p.mesh.position.y = -50; continue; }
      p.vel.y -= 9.8 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y <= p.floor + 0.01) {
        p.mesh.position.y = p.floor + 0.01;
        p.vel.set(0, 0, 0);
        p.spin.set(0, 0, 0);
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
    }
  }

  /* ---------------------------------------------------------------- */
  /* One pane                                                           */
  /* ---------------------------------------------------------------- */
  for (const spec of SIEGE_GLASS) {
    const record = grounds.shell.windows.find((w) => w.id === spec.window);
    const mesh = paneMeshes.get(spec.window);
    if (!record || !mesh) { unmatched.push(spec.id); continue; }

    /* The wall's normal, and which way is into the house. The shell's own
     * records carry the full wall band, so the thinner axis is the normal --
     * and it must agree with the direction the spec declares, or one of the
     * two is describing a different window. */
    const axis = (record.x1 - record.x0) < (record.z1 - record.z0) ? 'x' : 'z';
    if (spec.into[1] !== axis) {
      throw new Error(`${spec.id} declares into:${spec.into} but its opening's normal is ${axis}`);
    }
    const centre = new THREE.Vector3(
      (record.x0 + record.x1) / 2, (record.y0 + record.y1) / 2, (record.z0 + record.z1) / 2,
    );
    const inward = spec.into[0] === '+' ? 1 : -1;
    const paneBox = colliderForPane(mesh);
    /* The house's own floor under this pane: the sill for a ground-floor
     * window, the upper slab for one over the forecourt. Shards land on it. */
    const floorY = record.y0 > 5 ? 6.0 : 1.2;

    /* ---- shards: the frame with the glass gone out of it ---- */
    const shards = group(`siege.glass.${spec.id}.shards`);
    const w = axis === 'z' ? record.x1 - record.x0 : record.z1 - record.z0;
    const h = record.y1 - record.y0;
    /* Teeth left in the frame, alternating top and bottom, so the opening
     * reads as broken glass and not as a hole somebody cut. */
    const TEETH = 7;
    for (let i = 0; i < TEETH; i++) {
      const k = (i + 0.5) / TEETH;
      const top = i % 2 === 0;
      const th = h * (top ? 0.13 + (i % 3) * 0.045 : 0.09 + (i % 4) * 0.03);
      const u = -w / 2 + k * w;
      const y = top ? record.y1 - th / 2 : record.y0 + th / 2;
      shards.add(box({
        name: `siege.glass.${spec.id}.tooth.${i}`,
        size: axis === 'z' ? [w / TEETH * 0.92, th, 0.01] : [0.01, th, w / TEETH * 0.92],
        pos: axis === 'z'
          ? [centre.x + u, y, centre.z + LIFT * inward]
          : [centre.x + LIFT * inward, y, centre.z + u],
        mat: M_SHARD,
        cast: false,
      }));
    }
    /* The frame itself, bent where somebody came through it. */
    for (const end of [-1, 1]) {
      shards.add(box({
        name: `siege.glass.${spec.id}.frame`,
        size: axis === 'z' ? [0.05, h, 0.05] : [0.05, h, 0.05],
        pos: axis === 'z'
          ? [centre.x + end * (w / 2 - 0.02), centre.y, centre.z]
          : [centre.x, centre.y, centre.z + end * (w / 2 - 0.02)],
        mat: M_FRAME_BENT,
        rotZ: end * 0.05,
      }));
    }
    /* Litter on the floor inside, thrown the way the round came. */
    const LITTER = 9;
    for (let i = 0; i < LITTER; i++) {
      const k = (i + 0.5) / LITTER;
      const j = ((i * 37) % 100) / 100;
      const out = (0.2 + j * 0.8) * LITTER_REACH * inward;
      const u = -w / 2 + k * w + (j - 0.5) * 0.4;
      shards.add(box({
        name: `siege.glass.${spec.id}.litter.${i}`,
        size: [0.09 + j * 0.11, 0.012, 0.07 + j * 0.09],
        pos: axis === 'z'
          ? [centre.x + u, floorY + 0.016, centre.z + out]
          : [centre.x + out, floorY + 0.016, centre.z + u],
        mat: i % 3 === 0 ? M_SHARD_DULL : M_SHARD,
        rotY: j * 3.1,
        cast: false,
      }));
    }
    root.add(shards);

    /* ---- cracks: the middle state, a star on glass that is still there ---- */
    const cracks = group(`siege.glass.${spec.id}.cracks`);
    const hitU = w * 0.12;
    const hitY = centre.y + h * 0.08;
    for (let i = 0; i < 6; i++) {
      const ang = 0.4 + i * 1.05;
      const len = Math.min(w, h) * (0.22 + (i % 3) * 0.11);
      const du = Math.cos(ang) * len / 2;
      const dy = Math.sin(ang) * len / 2;
      cracks.add(box({
        name: `siege.glass.${spec.id}.crack.${i}`,
        size: axis === 'z' ? [len, 0.014, 0.008] : [0.008, 0.014, len],
        pos: axis === 'z'
          ? [centre.x + hitU + du, hitY + dy, centre.z + LIFT * 0.5 * inward]
          : [centre.x + LIFT * 0.5 * inward, hitY + dy, centre.z + hitU + du],
        mat: M_CRACK,
        rotZ: axis === 'z' ? ang : -ang,
        rotY: axis === 'z' ? 0 : ang,
        cast: false,
      }));
    }
    cracks.add(box({
      name: `siege.glass.${spec.id}.crack.hole`,
      size: axis === 'z' ? [0.07, 0.07, 0.01] : [0.01, 0.07, 0.07],
      pos: axis === 'z'
        ? [centre.x + hitU, hitY, centre.z + LIFT * 0.5 * inward]
        : [centre.x + LIFT * 0.5 * inward, hitY, centre.z + hitU],
      mat: M_SHARD_DULL,
      cast: false,
    }));
    root.add(cracks);

    /* ---- the two registrations, plus the crack overlay ---- *
     *
     * The pane's own collider LEAVES the scene's array first. `suppress()`
     * pushes its colliders when it registers -- in `clean` the thing it
     * suppresses is standing -- so handing it a box the shell already enrolled
     * puts that box in the array twice, and splicing one of them out later
     * leaves the other behind. That is invisible glass by the back door. */
    if (paneBox) takeBaseCollider(paneBox, ...baseArrays);
    const paneEntry = damage.suppress(`glass.${spec.id}`, {
      object: mesh, collider: paneBox, layers: ['battle'],
    });
    const shardEntry = damage.group(`glass.${spec.id}.shards`, {
      object: shards, layers: ['battle'],
    });
    const crackEntry = damage.group(`glass.${spec.id}.cracks`, {
      object: cracks, layers: ['battle'],
    });

    const pane = {
      id: spec.id,
      window: spec.window,
      room: spec.room,
      pane: mesh,
      shards,
      cracks,
      box: paneBox,
      colliderFound: Boolean(paneBox),
      axis,
      inward,
      floorY,
      centre,
      state: 'intact',
      entries: { pane: paneEntry, shards: shardEntry, cracks: crackEntry },
    };
    panes.set(spec.id, pane);
  }

  /**
   * Write a pane's break state into the layers of its three entries.
   *
   * Nothing settles here -- the caller batches a single `damage.refresh()`
   * over any number of panes, which is what makes restoring a checkpoint's
   * whole glass list one pass instead of one pass per window.
   */
  function writeLayers(pane, state) {
    pane.state = state;
    const set = (entry, on) => {
      entry.layers.length = 0;
      if (on) entry.layers.push('battle');
    };
    set(pane.entries.pane, state === 'broken');
    set(pane.entries.shards, state === 'broken');
    set(pane.entries.cracks, state === 'cracked');
  }

  /** Panes that start the fight already gone -- see SIEGE_GLASS. */
  for (const spec of SIEGE_GLASS) {
    const pane = panes.get(spec.id);
    if (!pane) continue;
    writeLayers(pane, spec.broken ? 'broken' : 'intact');
  }
  damage.refresh();

  /* ---------------------------------------------------------------- */
  /* The public verbs                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * intact -> cracked. The pane stays standing and stays SOLID: a cracked
   * window is still a window, and a round that cracks one has not opened a
   * firing port. Returns true only on a real change.
   */
  function crack(id) {
    const pane = panes.get(id);
    if (!pane || pane.state !== 'intact') return false;
    writeLayers(pane, 'cracked');
    damage.refresh();
    /* Cue: `siege.glass.crack` at pane.centre. */
    return true;
  }

  /**
   * intact | cracked -> broken. Idempotent.
   *
   * The pane's mesh goes, its collider leaves the scene's live array, the
   * shards appear and a handful of particles fall. From this frame on the
   * opening passes projectiles, line of sight and men, because there is
   * nothing left in it -- which is the entire point of the file.
   */
  function shatter(id) {
    const pane = panes.get(id);
    if (!pane || pane.state === 'broken') return false;
    writeLayers(pane, 'broken');
    damage.refresh();
    if (pane.box) throwParticles(pane, 12);
    /* Cue: `siege.glass.shatter` at pane.centre. */
    return true;
  }

  /** Every pane currently broken, sorted, for the checkpoint to hold onto. */
  function brokenIds() {
    return [...panes.values()].filter((p) => p.state === 'broken').map((p) => p.id).sort();
  }

  /** Every pane currently cracked. Saved alongside the broken ones. */
  function crackedIds() {
    return [...panes.values()].filter((p) => p.state === 'cracked').map((p) => p.id).sort();
  }

  /**
   * Put the house's glass back exactly as the checkpoint found it.
   *
   * Exact means exact in BOTH directions: a pane the player broke after the
   * checkpoint goes back to intact, not just "the saved ones are broken". One
   * `refresh()` at the end covers the lot.
   *
   * The mission's checkpoint field is `brokenGlass` and nothing else, so
   * calling this with one argument takes every cracked pane back to intact
   * too -- which is right, because the checkpoint was taken before those
   * rounds were fired. Pass `crackedIds()` as well if a caller wants to hold
   * onto the halfway state.
   *
   * @param {string[]} ids broken panes, from `brokenIds()`
   * @param {string[]} [cracked] cracked panes, from `crackedIds()`
   * @returns {number} how many panes actually changed
   */
  function restoreBroken(ids, cracked = []) {
    const wantBroken = new Set(ids ?? []);
    const wantCracked = new Set(cracked ?? []);
    let changed = 0;
    for (const pane of panes.values()) {
      const next = wantBroken.has(pane.id)
        ? 'broken'
        : (wantCracked.has(pane.id) ? 'cracked' : 'intact');
      if (pane.state === next) continue;
      writeLayers(pane, next);
      changed += 1;
    }
    if (changed) damage.refresh();
    /* Particles are transient; a restore does not resurrect the ones that
     * already fell, and it must not throw new ones or a reload would rain
     * glass in a room the player has already cleared. */
    for (const p of particles) { p.life = 0; p.mesh.visible = false; p.mesh.position.y = -50; }
    return changed;
  }

  function update(dt) {
    if (!(dt > 0)) return;
    updateParticles(dt);
  }

  return {
    root,
    panes,
    crack,
    shatter,
    brokenIds,
    crackedIds,
    restoreBroken,
    update,
    /** Ids in SIEGE_GLASS the base shell no longer has. Should be empty. */
    unmatched,
    /** Panes whose base collider could not be matched. Should be empty. */
    get unmatchedColliders() {
      return [...panes.values()].filter((p) => !p.colliderFound).map((p) => p.id);
    },
  };
}
