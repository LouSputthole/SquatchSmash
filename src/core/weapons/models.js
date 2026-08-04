/**
 * The six guns, modelled once, for every scene.
 *
 * THREE of these already existed and are LIFTED here rather than rebuilt:
 *
 *   - `buildRevolver`      was `makeRevolver` in `src/world/props.js` — the
 *                          coffee-table gun, the Squatchfather's prospect's
 *                          gun, and (scaled by `BIG_REVOLVER_SCALE`) both
 *                          heavy-frame guns in The Silver Case. That function
 *                          now calls this one.
 *   - `buildNineMillimeter` was `makeNineMillimeterPistol`, same file — the
 *                          27-mesh semi-automatic Lou and Booski carry on the
 *                          boat in NO WAKE. That function now calls this one.
 *   - `buildCarbine`       was `makeHeistCarbine` in `src/heist/weapons.js` —
 *                          THE TAKE's short carbine, every part of which is a
 *                          part somebody could name. That function now calls
 *                          this one, mesh names and all.
 *
 * Nothing in those three moved a millimetre in the lift. The geometry is
 * transcribed number for number; what changed is where it lives and that it
 * is now DOM-free (see `./build.js` for why that matters).
 *
 * THREE are new: the belt-fed SAW, the Barrett-style anti-materiel rifle and
 * the AK-47.
 *
 * ONE CONVENTION, SIX GUNS. Every model points down local **-Z**, sits with
 * the bore roughly on local y≈0.03, and hands back the same `userData`:
 *
 *   muzzle          THREE.Vector3, local — where the flash is and where a
 *                   round starts.
 *   ejectPort       THREE.Vector3, local — where brass leaves.
 *   magWell         THREE.Vector3, local — where a magazine falls out of.
 *   magazine        THREE.Object3D | null — the fitted magazine, as a real
 *                   child object. Reload takes THIS object off the gun and
 *                   drops it on the floor; it is not a copy.
 *   magazineRest    {position, rotation} the fitted magazine sits at, so a
 *                   fresh one can be seated in exactly the same place.
 *   makeMagazine    () => THREE.Object3D | null — builds another one.
 *   makeCase        () => THREE.Object3D — one spent case, for the guns that
 *                   throw brass rather than a box.
 *   moving          {slide, bolt, hammer, cylinder, charging, bipod…} — the
 *                   parts a scene may want to animate. Every key optional.
 *   length          metres, muzzle to buttplate, for rack spacing.
 */
import * as THREE from 'three';
import { box, cylinder, group, GUARD_ROT, mat, sphere, torus } from './build.js';

/* ------------------------------------------------------------------ */
/* Shared palette                                                      */
/* ------------------------------------------------------------------ */
const M = {
  steel: mat({ color: 0x3a3f45, roughness: 0.34, metalness: 0.82 }),
  slideSteel: mat({ color: 0x343a40, roughness: 0.30, metalness: 0.86 }),
  slideDark: mat({ color: 0x171b1f, roughness: 0.40, metalness: 0.70 }),
  dark: mat({ color: 0x22262b, roughness: 0.5, metalness: 0.6 }),
  parkerized: mat({ color: 0x24282c, roughness: 0.52, metalness: 0.6 }),
  polymer: mat({ color: 0x1b1e21, roughness: 0.82 }),
  polymerLight: mat({ color: 0x202326, roughness: 0.76 }),
  furniture: mat({ color: 0x2b2f26, roughness: 0.88 }),
  wood: mat({ color: 0x5a3520, roughness: 0.62 }),
  woodOrange: mat({ color: 0x8a4a1c, roughness: 0.66 }),
  bakelite: mat({ color: 0x7b2f12, roughness: 0.48 }),
  bore: mat({ color: 0x08090a, roughness: 1 }),
  inset: mat({ color: 0x0a0c0e, roughness: 0.95 }),
  brass: mat({ color: 0xb08a3c, roughness: 0.32, metalness: 0.85 }),
  brassDull: mat({ color: 0xa9873f, roughness: 0.4, metalness: 0.7 }),
  webbing: mat({ color: 0x3d4238, roughness: 1 }),
  glass: mat({ color: 0x101a20, roughness: 0.12, metalness: 0.4 }),
  desert: mat({ color: 0x4b4438, roughness: 0.7, metalness: 0.35 }),
};

/** One spent pistol/rifle case, for the guns that throw brass. */
function makeCase(r = 0.0045, h = 0.019) {
  const g = group('spent-case');
  g.add(cylinder({ r, h, pos: [0, 0, 0], mat: M.brass, seg: 8 }));
  g.add(cylinder({ r: r * 1.12, h: h * 0.12, pos: [0, -h / 2, 0], mat: M.brassDull, seg: 8 }));
  return g;
}

/* ================================================================== */
/* 1. The revolver — a heavy-frame Colt .45                            */
/* ================================================================== */
/**
 * Lifted from `src/world/props.js`'s `makeRevolver`, geometry unchanged, with
 * three things added that only a gun somebody actually shoots needs: the
 * ejector rod under the barrel, the crane the cylinder swings out on, and six
 * live rounds standing in the chambers so an empty gun looks empty.
 *
 * Snub-nosed, six rounds. There is nothing in a flat to reload it with once
 * they are gone, which is the coffee-table gun's whole character; in the
 * armory there is a shelf of speedloaders, which is the armory's.
 */
export function buildRevolver() {
  const g = group('revolver');

  const BARREL = 0.115;
  // Barrel, with the rib along the top and the bore in the end.
  const barrel = cylinder({ r: 0.011, h: BARREL, pos: [0, 0.028, -0.085], rotX: Math.PI / 2, mat: M.steel, name: 'revolver-barrel' });
  g.add(barrel);
  g.add(box({ size: [0.012, 0.008, BARREL], pos: [0, 0.038, -0.085], mat: M.steel }));
  g.add(cylinder({ r: 0.0055, h: 0.012, pos: [0, 0.028, -0.142], rotX: Math.PI / 2, mat: mat({ color: 0x0a0b0c, roughness: 1 }), name: 'revolver-muzzle' }));
  // Front sight.
  g.add(box({ size: [0.004, 0.010, 0.010], pos: [0, 0.045, -0.136], mat: M.dark }));

  // Cylinder, fluted, with the chambers showing at the front face.
  const cyl = cylinder({ r: 0.021, h: 0.040, pos: [0, 0.028, -0.008], rotX: Math.PI / 2, mat: M.steel, name: 'revolver-cylinder' });
  g.add(cyl);
  const chamberMat = mat({ color: 0x131518, roughness: 0.9 });
  const rounds = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(cylinder({
      r: 0.0042, h: 0.006,
      pos: [Math.cos(a) * 0.0135, 0.028 + Math.sin(a) * 0.0135, -0.029],
      rotX: Math.PI / 2, mat: chamberMat,
    }));
    /* A live round standing in each chamber, visible at the cylinder face.
     * `moving.rounds` lets the runtime hide them one at a time, so a gun with
     * two left looks like a gun with two left. */
    const live = cylinder({
      r: 0.0038, h: 0.010,
      pos: [Math.cos(a) * 0.0135, 0.028 + Math.sin(a) * 0.0135, -0.0305],
      rotX: Math.PI / 2, mat: M.brass, seg: 8, name: `revolver-round-${i}`,
    });
    g.add(live);
    rounds.push(live);
  }

  // Ejector rod under the barrel, and the crane the cylinder rides out on.
  const ejectorRod = cylinder({
    r: 0.0055, h: 0.072, pos: [0, 0.0125, -0.055], rotX: Math.PI / 2, mat: M.dark, name: 'revolver-ejector-rod',
  });
  g.add(ejectorRod);
  g.add(cylinder({ r: 0.009, h: 0.008, pos: [0, 0.0125, -0.091], rotX: Math.PI / 2, mat: M.dark }));
  g.add(box({ size: [0.010, 0.024, 0.030], pos: [-0.013, 0.028, -0.006], mat: M.steel, name: 'revolver-crane' }));

  // Frame, top strap and rear sight.
  g.add(box({ size: [0.020, 0.030, 0.075], pos: [0, 0.028, 0.020], mat: M.steel, name: 'revolver-frame' }));
  g.add(box({ size: [0.016, 0.007, 0.055], pos: [0, 0.045, 0.014], mat: M.steel }));
  g.add(box({ size: [0.014, 0.008, 0.006], pos: [0, 0.048, 0.040], mat: M.dark }));

  // Hammer, back and slightly up, and the trigger inside its guard.
  const hammer = box({ size: [0.010, 0.020, 0.012], pos: [0, 0.050, 0.050], mat: M.dark, name: 'revolver-hammer' });
  hammer.rotation.x = -0.30;
  g.add(hammer);
  const trigger = box({ size: [0.006, 0.016, 0.006], pos: [0, 0.010, 0.028], mat: M.dark, rotX: 0.2, name: 'revolver-trigger' });
  g.add(trigger);
  g.add(torus({
    r: 0.017, tube: 0.0035, seg: 6, ring: 14, arc: Math.PI, mat: M.steel,
    pos: [0, 0.009, 0.030], ...GUARD_ROT,
  }));

  /* Grip, raked back the way a revolver's is. Two panels with the frame's
   * backstrap between them, so it is not one lump of wood. */
  const grip = new THREE.Group();
  grip.name = 'revolver-grip';
  grip.position.set(0, 0.012, 0.055);
  grip.rotation.x = 0.42;
  g.add(grip);
  grip.add(box({ size: [0.026, 0.078, 0.030], pos: [0, -0.030, 0], mat: M.wood }));
  grip.add(box({ size: [0.030, 0.070, 0.012], pos: [0, -0.028, -0.012], mat: M.dark }));

  for (const m of [barrel, cyl]) m.castShadow = true;

  g.userData.muzzle = new THREE.Vector3(0, 0.028, -0.148);
  g.userData.ejectPort = new THREE.Vector3(0, 0.028, -0.030);
  g.userData.magWell = new THREE.Vector3(0, 0.010, -0.010);
  g.userData.magazine = null;
  g.userData.magazineRest = null;
  g.userData.makeMagazine = () => null;
  g.userData.makeCase = () => makeCase(0.0055, 0.026);
  g.userData.moving = { hammer, trigger, cylinder: cyl, ejectorRod, rounds };
  g.userData.length = 0.30;
  return g;
}

/* ================================================================== */
/* 2. The 9mm semi-automatic                                           */
/* ================================================================== */
/** The pistol's detachable double-stack magazine, on its own. */
function makeNineMagazine() {
  const g = group('pistol9-magazine');
  g.add(box({ size: [0.030, 0.088, 0.043], pos: [0, -0.044, 0], mat: M.slideDark, name: 'pistol9-mag-body' }));
  g.add(box({ size: [0.039, 0.009, 0.052], pos: [0, -0.092, 0.005], mat: M.slideDark, name: 'pistol9-mag-floorplate' }));
  g.add(box({ size: [0.006, 0.052, 0.004], pos: [0.016, -0.046, -0.021], mat: M.inset }));
  g.add(box({ size: [0.017, 0.010, 0.018], pos: [0, 0.003, -0.004], mat: M.brass, name: 'pistol9-mag-top-round' }));
  return g;
}

/**
 * Lifted from `src/world/props.js`'s `makeNineMillimeterPistol`, geometry
 * unchanged except that the grip's floorplate slab has become a real,
 * detachable magazine object hanging in the magwell — because a reload that
 * does not drop anything is an animation, not a reload.
 *
 * Like the revolver it points along -Z, so character hands, first-person
 * view-models and muzzle effects can share one convention.
 */
export function buildNineMillimeter() {
  const g = group('pistol9');

  const slide = box({ size: [0.032, 0.038, 0.164], pos: [0, 0.038, -0.050], mat: M.slideSteel, name: 'pistol9-slide' });
  g.add(slide);
  g.add(box({ size: [0.026, 0.008, 0.074], pos: [0, 0.060, -0.018], mat: M.slideDark }));
  const port = box({ size: [0.018, 0.010, 0.029], pos: [0, 0.058, -0.005], mat: M.inset, name: 'pistol9-ejection-port' });
  g.add(port);
  g.add(cylinder({ r: 0.0062, h: 0.013, pos: [0, 0.038, -0.137], rotX: Math.PI / 2, mat: M.inset, name: 'pistol9-muzzle' }));

  g.add(box({ size: [0.005, 0.010, 0.010], pos: [0, 0.067, -0.122], mat: M.inset, name: 'pistol9-front-sight' }));
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.006, 0.010, 0.010], pos: [sx * 0.010, 0.067, 0.020], mat: M.inset }));
  }

  g.add(box({ size: [0.030, 0.030, 0.122], pos: [0, 0.012, -0.044], mat: M.polymerLight, name: 'pistol9-frame' }));
  g.add(box({ size: [0.034, 0.012, 0.064], pos: [0, -0.004, -0.082], mat: M.polymerLight }));
  for (const zRail of [-0.100, -0.082, -0.064]) {
    g.add(box({ size: [0.037, 0.005, 0.006], pos: [0, -0.012, zRail], mat: M.inset }));
  }
  g.add(cylinder({ r: 0.0045, h: 0.038, pos: [0, 0.020, 0.004], rotZ: Math.PI / 2, mat: M.slideDark }));

  const grip = new THREE.Group();
  grip.name = 'pistol9-grip';
  grip.position.set(0, 0.003, 0.025);
  grip.rotation.x = 0.20;
  grip.add(box({ size: [0.033, 0.098, 0.047], pos: [0, -0.046, 0.022], mat: M.polymerLight }));
  for (const sx of [-1, 1]) {
    grip.add(box({ size: [0.0035, 0.068, 0.034], pos: [sx * 0.018, -0.044, 0.022], mat: M.inset }));
  }
  g.add(grip);

  const trigger = box({ size: [0.006, 0.022, 0.007], pos: [0, -0.010, 0.000], mat: M.slideDark, rotX: 0.32, name: 'pistol9-trigger' });
  g.add(trigger);
  g.add(torus({
    r: 0.018, tube: 0.0035, seg: 6, ring: 16, arc: Math.PI, mat: M.polymerLight,
    pos: [0, -0.011, -0.001], ...GUARD_ROT,
  }));

  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      g.add(box({
        size: [0.003, 0.026, 0.004],
        pos: [sx * 0.017, 0.038, 0.004 + i * 0.009],
        mat: M.inset,
        rotX: -0.18,
      }));
    }
  }

  /* The magazine, where the floorplate slab used to be: same place, same
   * floorplate, now on an object that can leave. */
  const magRest = { position: new THREE.Vector3(0, -0.010, 0.033), rotation: new THREE.Euler(0.20, 0, 0) };
  const magazine = makeNineMagazine();
  magazine.position.copy(magRest.position);
  magazine.rotation.copy(magRest.rotation);
  g.add(magazine);

  g.userData.muzzle = new THREE.Vector3(0, 0.038, -0.144);
  g.userData.ejectPort = new THREE.Vector3(0.018, 0.058, -0.005);
  g.userData.magWell = new THREE.Vector3(0, -0.070, 0.040);
  g.userData.magazine = magazine;
  g.userData.magazineRest = magRest;
  g.userData.makeMagazine = makeNineMagazine;
  g.userData.makeCase = () => makeCase(0.0045, 0.019);
  g.userData.moving = { slide, trigger, port };
  g.userData.length = 0.21;
  return g;
}

/* ================================================================== */
/* 3. The carbine                                                      */
/* ================================================================== */
/** The carbine's box magazine, on its own. */
function makeCarbineMagazine() {
  const g = group('carbine-magazine');
  g.add(box({ size: [0.024, 0.13, 0.048], pos: [0, 0, 0], mat: M.polymer }));
  g.add(box({ size: [0.028, 0.01, 0.054], pos: [0, -0.068, 0], mat: M.parkerized }));
  g.add(box({ size: [0.02, 0.012, 0.02], pos: [0, 0.064, -0.016], mat: M.brassDull, name: 'carbine-top-round' }));
  return g;
}

/**
 * Lifted from `src/heist/weapons.js`'s `makeHeistCarbine`, part for part and
 * name for name — `tests/heist-loadout.test.mjs` asserts fourteen of those
 * names and a mesh floor of thirty, and both still hold.
 *
 * About 74 cm from muzzle to buttplate with the stock collapsed, which is a
 * short-barrelled carbine and not a metre-long fence post. Every part is a
 * part somebody could name: flash hider, gas block, front sight, free-float
 * handguard with a rail, ejection port and forward assist, charging handle,
 * dust cover, magazine with a floorplate, pistol grip, buffer tube and a
 * collapsed stock.
 */
export function buildCarbine({ sling = false } = {}) {
  const g = group('heist-carbine');

  // Barrel group: bore, flash hider, gas block, front sight tower.
  g.add(cylinder({ r: 0.0095, h: 0.30, pos: [0, 0.028, -0.235], rotX: Math.PI / 2, mat: M.parkerized, name: 'carbine-barrel', seg: 12 }));
  const hider = cylinder({ r: 0.0135, h: 0.055, pos: [0, 0.028, -0.398], rotX: Math.PI / 2, mat: M.parkerized, name: 'carbine-flash-hider', seg: 12 });
  g.add(hider);
  for (let i = 0; i < 4; i++) {
    const slot = box({ size: [0.004, 0.03, 0.03], pos: [0, 0.006, -0.008], mat: M.bore, rotZ: (i / 4) * Math.PI });
    hider.add(slot);
  }
  g.add(cylinder({ r: 0.0055, h: 0.012, pos: [0, 0.028, -0.424], rotX: Math.PI / 2, mat: M.bore, name: 'carbine-muzzle', seg: 12 }));
  g.add(box({ size: [0.026, 0.042, 0.034], pos: [0, 0.036, -0.318], mat: M.parkerized, name: 'carbine-gas-block' }));
  g.add(box({ size: [0.012, 0.05, 0.012], pos: [0, 0.066, -0.318], mat: M.parkerized, name: 'carbine-front-sight' }));

  // Free-float handguard: an octagonal tube with a top rail and side slots.
  g.add(cylinder({
    r: 0.024, h: 0.20, seg: 8, pos: [0, 0.028, -0.19], rotX: Math.PI / 2,
    mat: M.polymer, name: 'carbine-handguard',
  }));
  for (let i = 0; i < 7; i++) {
    g.add(box({ size: [0.036, 0.005, 0.008], pos: [0, 0.053, -0.27 + i * 0.026], mat: M.parkerized }));
    g.add(box({ size: [0.052, 0.008, 0.006], pos: [0, 0.012, -0.26 + i * 0.026], mat: M.bore }));
  }

  // Upper receiver, ejection port, forward assist, charging handle, rear sight.
  g.add(box({ size: [0.032, 0.046, 0.20], pos: [0, 0.03, -0.055], mat: M.steel, name: 'carbine-upper' }));
  const dust = box({ size: [0.006, 0.024, 0.062], pos: [0.017, 0.028, -0.03], mat: M.parkerized, name: 'carbine-dust-cover' });
  g.add(dust);
  g.add(box({ size: [0.012, 0.016, 0.016], pos: [0.019, 0.014, 0.012], mat: M.parkerized, name: 'carbine-forward-assist' }));
  const charging = box({ size: [0.03, 0.012, 0.05], pos: [0, 0.056, 0.05], mat: M.parkerized, name: 'carbine-charging-handle' });
  g.add(charging);
  g.add(box({ size: [0.03, 0.006, 0.12], pos: [0, 0.055, -0.02], mat: M.parkerized, name: 'carbine-top-rail' }));
  g.add(box({ size: [0.024, 0.03, 0.014], pos: [0, 0.072, 0.028], mat: M.parkerized, name: 'carbine-rear-sight' }));
  g.add(box({ size: [0.01, 0.012, 0.01], pos: [0, 0.079, 0.028], mat: M.bore }));

  // Lower receiver, magazine well, magazine, trigger and guard, grip.
  g.add(box({ size: [0.028, 0.05, 0.14], pos: [0, -0.01, -0.005], mat: M.steel, name: 'carbine-lower' }));
  const magRest = { position: new THREE.Vector3(0, -0.062, -0.036), rotation: new THREE.Euler(-0.13, 0, 0) };
  const magazine = makeCarbineMagazine();
  magazine.position.copy(magRest.position);
  magazine.rotation.copy(magRest.rotation);
  g.add(magazine);
  g.add(torus({
    r: 0.019, tube: 0.004, seg: 6, ring: 12, arc: Math.PI, mat: M.steel,
    pos: [0, -0.036, 0.028], ...GUARD_ROT,
  }));
  const trigger = box({ size: [0.006, 0.018, 0.006], pos: [0, -0.028, 0.03], mat: M.parkerized, name: 'carbine-trigger' });
  g.add(trigger);
  const grip = new THREE.Group();
  grip.position.set(0, -0.038, 0.062);
  grip.rotation.x = 0.42;
  grip.add(box({ size: [0.03, 0.098, 0.036], pos: [0, -0.048, 0], mat: M.polymer, name: 'carbine-grip' }));
  for (let i = 0; i < 3; i++) grip.add(box({ size: [0.034, 0.006, 0.006], pos: [0, -0.03 - i * 0.02, 0.017], mat: M.parkerized }));
  g.add(grip);

  // Buffer tube and a stock collapsed onto it.
  g.add(cylinder({ r: 0.017, h: 0.15, pos: [0, 0.026, 0.13], rotX: Math.PI / 2, mat: M.parkerized, name: 'carbine-buffer-tube', seg: 12 }));
  const stock = new THREE.Group();
  stock.name = 'carbine-stock';
  stock.position.set(0, 0.02, 0.145);
  stock.add(box({ size: [0.042, 0.076, 0.1], pos: [0, 0, 0], mat: M.furniture }));
  stock.add(box({ size: [0.048, 0.088, 0.016], pos: [0, -0.004, 0.056], mat: M.polymer, name: 'carbine-buttplate' }));
  stock.add(box({ size: [0.05, 0.014, 0.05], pos: [0, 0.044, -0.01], mat: M.furniture, name: 'carbine-cheek-weld' }));
  g.add(stock);

  if (sling) {
    g.add(torus({
      r: 0.15, tube: 0.006, seg: 4, ring: 14, arc: Math.PI * 1.1, mat: M.webbing,
      pos: [0, -0.06, -0.09], rot: [0, Math.PI / 2, 0.5], name: 'carbine-sling',
    }));
  }

  g.userData.muzzle = new THREE.Vector3(0, 0.028, -0.43);
  g.userData.ejectPort = new THREE.Vector3(0.02, 0.028, -0.03);
  g.userData.magWell = new THREE.Vector3(0, -0.13, -0.04);
  g.userData.magazine = magazine;
  g.userData.magazineRest = magRest;
  g.userData.makeMagazine = makeCarbineMagazine;
  g.userData.makeCase = () => makeCase(0.0045, 0.021);
  g.userData.moving = { charging, dust, trigger };
  g.userData.length = 0.62;
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  return g;
}

/* ================================================================== */
/* 4. The SAW — belt-fed light machine gun                             */
/* ================================================================== */
/**
 * The plastic ammo box that clips under the receiver, with a stub of belt
 * standing out of its mouth. This is what leaves the gun on a reload: an
 * empty box and the last few links, exactly what the gunner throws away.
 */
function makeSawBox({ links = 5 } = {}) {
  const g = group('saw-ammo-box');
  g.add(box({ size: [0.115, 0.145, 0.185], pos: [0, 0, 0], mat: M.furniture, name: 'saw-box-body' }));
  g.add(box({ size: [0.125, 0.014, 0.195], pos: [0, -0.079, 0], mat: M.polymer, name: 'saw-box-floor' }));
  g.add(box({ size: [0.03, 0.05, 0.012], pos: [0, 0.06, 0.098], mat: M.parkerized, name: 'saw-box-latch' }));
  g.add(torus({
    r: 0.032, tube: 0.005, seg: 5, ring: 10, arc: Math.PI, mat: M.webbing,
    pos: [0, 0.078, 0], rot: [0, Math.PI / 2, 0], name: 'saw-box-handle',
  }));
  // The belt stub coming out of the top: alternating link and cartridge.
  for (let i = 0; i < links; i++) {
    g.add(box({ size: [0.016, 0.010, 0.014], pos: [-0.03 + i * 0.015, 0.082 + i * 0.006, -0.05], mat: M.steel }));
    g.add(cylinder({
      r: 0.0048, h: 0.030, pos: [-0.03 + i * 0.015, 0.086 + i * 0.006, -0.05],
      rotZ: Math.PI / 2, mat: M.brass, seg: 6,
    }));
  }
  return g;
}

/**
 * The SAW. Belt-fed, bipod, box magazine — the owner's three words, all
 * three modelled.
 *
 * Long barrel with a slotted heat shield and a carry handle over it, because
 * you change a machine gun's barrel and you do not do it with your hands. The
 * feed tray cover sits on top with the belt running under it into the
 * receiver; the box hangs off the left of the magwell where a SAW's does. The
 * bipod folds — `moving.bipod` is a group whose x rotation opens the legs, so
 * a scene can put it down on a wall or stand it up on a rack.
 */
export function buildSaw() {
  const g = group('saw');

  // Barrel: bore, flash hider, heat shield with cooling slots, gas block.
  g.add(cylinder({ r: 0.0125, h: 0.46, pos: [0, 0.03, -0.36], rotX: Math.PI / 2, mat: M.parkerized, name: 'saw-barrel', seg: 12 }));
  const hider = cylinder({ r: 0.019, h: 0.075, pos: [0, 0.03, -0.62], rotX: Math.PI / 2, mat: M.parkerized, name: 'saw-flash-hider', seg: 12 });
  g.add(hider);
  g.add(cylinder({ r: 0.0075, h: 0.014, pos: [0, 0.03, -0.658], rotX: Math.PI / 2, mat: M.bore, name: 'saw-muzzle', seg: 12 }));
  for (let i = 0; i < 9; i++) {
    const z = -0.53 + i * 0.042;
    g.add(box({ size: [0.052, 0.006, 0.026], pos: [0, 0.058, z], mat: M.parkerized }));
    g.add(box({ size: [0.052, 0.006, 0.026], pos: [0, 0.002, z], mat: M.parkerized }));
  }
  g.add(box({ size: [0.034, 0.05, 0.05], pos: [0, 0.042, -0.30], mat: M.parkerized, name: 'saw-gas-block' }));
  // Carry handle, over the barrel, for a hot barrel change.
  const handle = group('saw-carry-handle',
    box({ size: [0.018, 0.052, 0.02], pos: [0, 0.025, -0.05], mat: M.parkerized }),
    box({ size: [0.018, 0.052, 0.02], pos: [0, 0.025, 0.05], mat: M.parkerized }),
    box({ size: [0.026, 0.018, 0.14], pos: [0, 0.056, 0], mat: M.polymer }));
  handle.position.set(0, 0.06, -0.30);
  g.add(handle);

  // Receiver, feed tray cover, rear sight, ejection port.
  g.add(box({ size: [0.058, 0.082, 0.30], pos: [0, 0.03, -0.05], mat: M.steel, name: 'saw-receiver' }));
  const feedCover = box({ size: [0.062, 0.024, 0.20], pos: [0, 0.081, -0.08], mat: M.parkerized, name: 'saw-feed-cover' });
  g.add(feedCover);
  g.add(box({ size: [0.03, 0.026, 0.016], pos: [0, 0.106, 0.005], mat: M.parkerized, name: 'saw-rear-sight' }));
  const port = box({ size: [0.008, 0.028, 0.06], pos: [0.031, 0.028, -0.06], mat: M.bore, name: 'saw-ejection-port' });
  g.add(port);
  const charging = box({ size: [0.024, 0.014, 0.05], pos: [0.038, 0.012, 0.02], mat: M.parkerized, name: 'saw-charging-handle' });
  g.add(charging);

  // The belt entering the feed tray from the box.
  const belt = group('saw-belt');
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const y = 0.062 - t * 0.052;
    const x = -0.030 - t * 0.014;
    belt.add(box({ size: [0.016, 0.010, 0.014], pos: [x, y, -0.10 + t * 0.01], mat: M.steel }));
    belt.add(cylinder({
      r: 0.0048, h: 0.030, pos: [x, y + 0.004, -0.10 + t * 0.01], rotZ: Math.PI / 2, mat: M.brass, seg: 6,
    }));
  }
  g.add(belt);

  // The ammo box, hung off the left of the magwell.
  const magRest = { position: new THREE.Vector3(-0.02, -0.088, -0.055), rotation: new THREE.Euler(0, 0, 0) };
  const magazine = makeSawBox();
  magazine.position.copy(magRest.position);
  magazine.rotation.copy(magRest.rotation);
  g.add(magazine);
  g.add(box({ size: [0.086, 0.02, 0.14], pos: [-0.01, -0.014, -0.055], mat: M.parkerized, name: 'saw-box-mount' }));

  // Pistol grip, trigger, guard.
  const grip = new THREE.Group();
  grip.name = 'saw-grip';
  grip.position.set(0, -0.012, 0.06);
  grip.rotation.x = 0.34;
  grip.add(box({ size: [0.034, 0.11, 0.042], pos: [0, -0.055, 0], mat: M.polymer }));
  for (let i = 0; i < 4; i++) grip.add(box({ size: [0.038, 0.006, 0.006], pos: [0, -0.03 - i * 0.02, 0.02], mat: M.parkerized }));
  g.add(grip);
  g.add(box({ size: [0.007, 0.02, 0.007], pos: [0, -0.012, 0.036], mat: M.parkerized, name: 'saw-trigger' }));
  g.add(torus({
    r: 0.021, tube: 0.004, seg: 6, ring: 12, arc: Math.PI, mat: M.steel,
    pos: [0, -0.014, 0.034], ...GUARD_ROT,
  }));

  // Skeleton stock with a shoulder rest and a buffer.
  const stock = group('saw-stock',
    box({ size: [0.05, 0.062, 0.18], pos: [0, 0.02, 0.09], mat: M.polymer }),
    box({ size: [0.054, 0.11, 0.022], pos: [0, 0.006, 0.18], mat: M.polymer, name: 'saw-buttplate' }),
    box({ size: [0.05, 0.016, 0.09], pos: [0, 0.062, 0.06], mat: M.furniture, name: 'saw-cheek' }));
  stock.position.set(0, 0, 0.10);
  g.add(stock);

  // Bipod: a mount, two legs and two feet, folded back under the barrel.
  const bipod = new THREE.Group();
  bipod.name = 'saw-bipod';
  bipod.position.set(0, 0.006, -0.40);
  bipod.add(box({ size: [0.036, 0.028, 0.05], pos: [0, 0.012, 0], mat: M.parkerized }));
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = `saw-bipod-leg-${sx < 0 ? 'left' : 'right'}`;
    leg.position.set(sx * 0.014, 0, 0);
    leg.rotation.z = sx * 0.30;
    leg.add(cylinder({ r: 0.006, h: 0.20, pos: [0, -0.10, 0], mat: M.parkerized, seg: 8 }));
    leg.add(box({ size: [0.03, 0.008, 0.03], pos: [0, -0.20, 0], mat: M.parkerized, name: 'saw-bipod-foot' }));
    bipod.add(leg);
  }
  g.add(bipod);

  g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.67);
  g.userData.ejectPort = new THREE.Vector3(0.035, 0.028, -0.06);
  g.userData.magWell = new THREE.Vector3(-0.02, -0.17, -0.055);
  g.userData.magazine = magazine;
  g.userData.magazineRest = magRest;
  g.userData.makeMagazine = makeSawBox;
  g.userData.makeCase = () => makeCase(0.0048, 0.024);
  g.userData.moving = { feedCover, charging, bipod, belt, port };
  g.userData.length = 1.02;
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  return g;
}

/* ================================================================== */
/* 5. The Barrett — anti-materiel rifle                                */
/* ================================================================== */
/** The ten-round .50 magazine: long, straight, and heavier than it looks. */
function makeBarrettMagazine() {
  const g = group('barrett-magazine');
  g.add(box({ size: [0.030, 0.175, 0.086], pos: [0, 0, 0], mat: M.parkerized, name: 'barrett-mag-body' }));
  g.add(box({ size: [0.036, 0.012, 0.094], pos: [0, -0.093, 0], mat: M.parkerized, name: 'barrett-mag-floorplate' }));
  g.add(box({ size: [0.008, 0.11, 0.006], pos: [0.016, -0.01, -0.041], mat: M.bore }));
  g.add(cylinder({ r: 0.0065, h: 0.058, pos: [0, 0.092, -0.010], rotZ: Math.PI / 2, mat: M.brass, seg: 8, name: 'barrett-mag-top-round' }));
  return g;
}

/**
 * The Barrett. Long, muzzle brake, big scope, semi-automatic on a short-recoil
 * barrel — the owner's list, in that order.
 *
 * 1.45 m over the whole thing, which is why the rack it lives on is a metre
 * and a half wide. The arrowhead muzzle brake is the silhouette: two side
 * baffles and a slotted body, because at this calibre the brake is a third of
 * what you look at. The scope sits on a full-length rail on tall rings so a
 * player can see it is a scope and not a pipe, and the bipod folds like the
 * SAW's.
 */
export function buildBarrett() {
  const g = group('barrett');

  // Muzzle brake, arrowhead, with side baffles and a slotted body.
  g.add(cylinder({ r: 0.017, h: 0.115, pos: [0, 0.03, -0.79], rotX: Math.PI / 2, mat: M.desert, name: 'barrett-brake', seg: 12 }));
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.05, 0.030, 0.062], pos: [sx * 0.030, 0.03, -0.80], mat: M.desert, rotY: sx * 0.42, name: 'barrett-brake-baffle' }));
  }
  for (let i = 0; i < 3; i++) {
    g.add(box({ size: [0.040, 0.006, 0.008], pos: [0, 0.046, -0.83 + i * 0.026], mat: M.bore }));
  }
  g.add(cylinder({ r: 0.0105, h: 0.014, pos: [0, 0.03, -0.852], rotX: Math.PI / 2, mat: M.bore, name: 'barrett-muzzle', seg: 12 }));

  // Barrel, fluted, and the recoil shroud around its rear half.
  g.add(cylinder({ r: 0.0135, h: 0.62, pos: [0, 0.03, -0.42], rotX: Math.PI / 2, mat: M.parkerized, name: 'barrett-barrel', seg: 12 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(box({
      size: [0.006, 0.006, 0.50], pos: [Math.cos(a) * 0.0135, 0.03 + Math.sin(a) * 0.0135, -0.42], mat: M.bore,
    }));
  }
  g.add(box({ size: [0.052, 0.058, 0.30], pos: [0, 0.03, -0.24], mat: M.desert, name: 'barrett-shroud' }));

  // Upper receiver, full-length rail, ejection port, bolt handle.
  g.add(box({ size: [0.056, 0.078, 0.44], pos: [0, 0.026, 0.06], mat: M.desert, name: 'barrett-upper' }));
  g.add(box({ size: [0.040, 0.008, 0.72], pos: [0, 0.068, -0.10], mat: M.parkerized, name: 'barrett-rail' }));
  for (let i = 0; i < 14; i++) {
    g.add(box({ size: [0.044, 0.006, 0.008], pos: [0, 0.073, -0.42 + i * 0.05], mat: M.parkerized, cast: false }));
  }
  const port = box({ size: [0.008, 0.036, 0.10], pos: [0.030, 0.026, 0.02], mat: M.bore, name: 'barrett-ejection-port' });
  g.add(port);
  const bolt = group('barrett-bolt-handle',
    cylinder({ r: 0.007, h: 0.05, pos: [0.024, 0, 0], rotZ: Math.PI / 2, mat: M.parkerized, seg: 8 }),
    sphere({ r: 0.011, pos: [0.049, 0, 0], mat: M.parkerized }));
  bolt.position.set(0.03, 0.02, 0.12);
  g.add(bolt);

  // The scope: tube, two bells, elevation and windage turrets, tall rings.
  const scope = group('barrett-scope');
  scope.add(cylinder({ r: 0.020, h: 0.30, pos: [0, 0, 0], rotX: Math.PI / 2, mat: M.slideDark, name: 'barrett-scope-tube', seg: 14 }));
  scope.add(cylinder({ r: 0.030, h: 0.07, pos: [0, 0, -0.175], rotX: Math.PI / 2, mat: M.slideDark, name: 'barrett-scope-objective', seg: 14 }));
  scope.add(cylinder({ r: 0.0285, h: 0.004, pos: [0, 0, -0.209], rotX: Math.PI / 2, mat: M.glass, name: 'barrett-scope-glass', seg: 14 }));
  scope.add(cylinder({ r: 0.026, h: 0.06, pos: [0, 0, 0.170], rotX: Math.PI / 2, mat: M.slideDark, name: 'barrett-scope-ocular', seg: 14 }));
  scope.add(cylinder({ r: 0.0245, h: 0.004, pos: [0, 0, 0.201], rotX: Math.PI / 2, mat: M.glass }));
  scope.add(cylinder({ r: 0.014, h: 0.024, pos: [0, 0.026, -0.03], mat: M.parkerized, seg: 10, name: 'barrett-scope-elevation' }));
  scope.add(cylinder({ r: 0.013, h: 0.022, pos: [0.026, 0, -0.03], rotZ: Math.PI / 2, mat: M.parkerized, seg: 10, name: 'barrett-scope-windage' }));
  for (const sz of [-0.09, 0.09]) {
    scope.add(box({ size: [0.046, 0.044, 0.026], pos: [0, -0.022, sz], mat: M.parkerized, name: 'barrett-scope-ring' }));
  }
  scope.position.set(0, 0.114, -0.10);
  g.add(scope);

  // Lower: magwell, magazine, trigger, grip, and the thumbhole-less stock.
  g.add(box({ size: [0.048, 0.05, 0.20], pos: [0, -0.022, 0.02], mat: M.desert, name: 'barrett-lower' }));
  const magRest = { position: new THREE.Vector3(0, -0.135, 0.02), rotation: new THREE.Euler(0, 0, 0) };
  const magazine = makeBarrettMagazine();
  magazine.position.copy(magRest.position);
  magazine.rotation.copy(magRest.rotation);
  g.add(magazine);
  g.add(box({ size: [0.007, 0.022, 0.007], pos: [0, -0.048, 0.128], mat: M.parkerized, name: 'barrett-trigger' }));
  g.add(torus({
    r: 0.022, tube: 0.004, seg: 6, ring: 12, arc: Math.PI, mat: M.parkerized,
    pos: [0, -0.05, 0.126], ...GUARD_ROT,
  }));
  const grip = new THREE.Group();
  grip.name = 'barrett-grip';
  grip.position.set(0, -0.05, 0.164);
  grip.rotation.x = 0.36;
  grip.add(box({ size: [0.034, 0.108, 0.042], pos: [0, -0.054, 0], mat: M.polymer }));
  g.add(grip);
  const stock = group('barrett-stock',
    box({ size: [0.05, 0.086, 0.24], pos: [0, 0.012, 0.36], mat: M.desert }),
    box({ size: [0.056, 0.13, 0.026], pos: [0, -0.004, 0.49], mat: M.polymer, name: 'barrett-buttplate' }),
    box({ size: [0.052, 0.02, 0.13], pos: [0, 0.058, 0.32], mat: M.polymer, name: 'barrett-cheek' }),
    box({ size: [0.03, 0.05, 0.05], pos: [0, -0.058, 0.48], mat: M.parkerized, name: 'barrett-monopod' }));
  g.add(stock);

  // Bipod, folded, on the shroud.
  const bipod = new THREE.Group();
  bipod.name = 'barrett-bipod';
  bipod.position.set(0, -0.006, -0.30);
  bipod.add(box({ size: [0.042, 0.03, 0.06], pos: [0, 0.008, 0], mat: M.parkerized }));
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = `barrett-bipod-leg-${sx < 0 ? 'left' : 'right'}`;
    leg.position.set(sx * 0.016, 0, 0);
    leg.rotation.z = sx * 0.34;
    leg.add(cylinder({ r: 0.007, h: 0.24, pos: [0, -0.12, 0], mat: M.parkerized, seg: 8 }));
    leg.add(box({ size: [0.034, 0.01, 0.034], pos: [0, -0.24, 0], mat: M.parkerized, name: 'barrett-bipod-foot' }));
    bipod.add(leg);
  }
  g.add(bipod);

  g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.86);
  g.userData.ejectPort = new THREE.Vector3(0.034, 0.026, 0.02);
  g.userData.magWell = new THREE.Vector3(0, -0.24, 0.02);
  g.userData.magazine = magazine;
  g.userData.magazineRest = magRest;
  g.userData.makeMagazine = makeBarrettMagazine;
  g.userData.makeCase = () => makeCase(0.0105, 0.099);
  g.userData.moving = { bolt, bipod, scope, port };
  g.userData.length = 1.36;
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  return g;
}

/* ================================================================== */
/* 6. The AK-47                                                        */
/* ================================================================== */
/** The curved steel thirty. The curve is the whole silhouette. */
function makeAkMagazine() {
  const g = group('ak-magazine');
  /* Six stacked slabs on an arc — a real AK magazine's curve is about 22
   * degrees over its length and a straight box reads as the wrong gun. */
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const a = t * 0.40;
    g.add(box({
      size: [0.026, 0.032, 0.040 - t * 0.002],
      pos: [0, -t * 0.155, Math.sin(a) * 0.062],
      mat: M.bakelite,
      rotX: -a,
      name: i === 0 ? 'ak-mag-top' : '',
    }));
  }
  g.add(box({ size: [0.030, 0.010, 0.044], pos: [0, -0.168, 0.062], mat: M.parkerized, rotX: -0.40, name: 'ak-mag-floorplate' }));
  g.add(box({ size: [0.020, 0.012, 0.020], pos: [0, 0.020, -0.004], mat: M.brass, name: 'ak-mag-top-round' }));
  g.add(box({ size: [0.028, 0.014, 0.010], pos: [0, 0.010, -0.024], mat: M.parkerized, name: 'ak-mag-catch-lug' }));
  return g;
}

/**
 * The AK-47. Stamped receiver, slant brake, gas tube over the barrel, wood
 * furniture, and the curved thirty hanging out of the front of the magwell.
 *
 * The three things that make an AK read as an AK from across a room, all
 * here: the magazine's curve, the long gas tube and front sight block sitting
 * proud above the barrel, and the safety lever — the big flat paddle on the
 * right of the receiver that is half the length of the gun's silhouette.
 */
export function buildAk47() {
  const g = group('ak47');

  // Slant brake, muzzle, front sight block, gas block.
  g.add(cylinder({ r: 0.0125, h: 0.052, pos: [0, 0.03, -0.545], rotX: Math.PI / 2, mat: M.parkerized, name: 'ak-slant-brake', seg: 12 }));
  g.add(box({ size: [0.026, 0.026, 0.026], pos: [0.006, 0.036, -0.562], mat: M.parkerized, rotZ: 0.5, cast: false }));
  g.add(cylinder({ r: 0.0062, h: 0.012, pos: [0, 0.03, -0.575], rotX: Math.PI / 2, mat: M.bore, name: 'ak-muzzle', seg: 12 }));
  g.add(cylinder({ r: 0.0085, h: 0.32, pos: [0, 0.03, -0.36], rotX: Math.PI / 2, mat: M.parkerized, name: 'ak-barrel', seg: 12 }));
  const frontBlock = group('ak-front-sight-block',
    box({ size: [0.028, 0.048, 0.028], pos: [0, 0.014, 0], mat: M.parkerized }),
    cylinder({ r: 0.008, h: 0.026, pos: [0, 0.040, 0], mat: M.parkerized, seg: 8 }),
    box({ size: [0.005, 0.016, 0.005], pos: [0, 0.052, 0], mat: M.bore }));
  frontBlock.position.set(0, 0.03, -0.50);
  g.add(frontBlock);
  g.add(box({ size: [0.028, 0.044, 0.034], pos: [0, 0.038, -0.335], mat: M.parkerized, rotX: -0.35, name: 'ak-gas-block' }));

  // Gas tube over the barrel, with its wooden upper handguard.
  g.add(cylinder({ r: 0.0105, h: 0.20, pos: [0, 0.056, -0.24], rotX: Math.PI / 2, mat: M.parkerized, name: 'ak-gas-tube', seg: 10 }));
  g.add(box({ size: [0.036, 0.028, 0.155], pos: [0, 0.062, -0.235], mat: M.woodOrange, name: 'ak-upper-handguard' }));
  for (let i = 0; i < 2; i++) {
    g.add(box({ size: [0.040, 0.006, 0.012], pos: [0, 0.078, -0.28 + i * 0.07], mat: M.parkerized, cast: false }));
  }

  // Lower handguard.
  g.add(box({ size: [0.046, 0.046, 0.165], pos: [0, 0.012, -0.235], mat: M.woodOrange, name: 'ak-handguard' }));
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.006, 0.030, 0.12], pos: [sx * 0.024, 0.012, -0.235], mat: M.bakelite, cast: false }));
  }

  // Stamped receiver, dust cover, rear sight, charging handle, safety lever.
  g.add(box({ size: [0.040, 0.062, 0.29], pos: [0, 0.020, -0.03], mat: M.parkerized, name: 'ak-receiver' }));
  const dustCover = box({ size: [0.042, 0.026, 0.20], pos: [0, 0.060, -0.02], mat: M.parkerized, name: 'ak-dust-cover' });
  g.add(dustCover);
  g.add(box({ size: [0.030, 0.020, 0.05], pos: [0, 0.062, -0.14], mat: M.parkerized, name: 'ak-rear-sight' }));
  const port = box({ size: [0.008, 0.024, 0.062], pos: [0.021, 0.036, -0.04], mat: M.bore, name: 'ak-ejection-port' });
  g.add(port);
  const charging = box({ size: [0.030, 0.014, 0.026], pos: [0.030, 0.040, 0.02], mat: M.parkerized, name: 'ak-charging-handle' });
  g.add(charging);
  const safety = box({ size: [0.006, 0.030, 0.115], pos: [0.023, 0.036, -0.005], mat: M.parkerized, name: 'ak-safety-lever' });
  g.add(safety);

  // Magwell, the curved thirty, trigger and guard, grip.
  g.add(box({ size: [0.036, 0.024, 0.062], pos: [0, -0.012, -0.055], mat: M.parkerized, name: 'ak-magwell' }));
  const magRest = { position: new THREE.Vector3(0, -0.032, -0.062), rotation: new THREE.Euler(-0.16, 0, 0) };
  const magazine = makeAkMagazine();
  magazine.position.copy(magRest.position);
  magazine.rotation.copy(magRest.rotation);
  g.add(magazine);
  g.add(box({ size: [0.007, 0.020, 0.007], pos: [0, -0.020, 0.020], mat: M.parkerized, name: 'ak-trigger' }));
  g.add(torus({
    r: 0.020, tube: 0.004, seg: 6, ring: 12, arc: Math.PI, mat: M.parkerized,
    pos: [0, -0.022, 0.018], ...GUARD_ROT,
  }));
  const grip = new THREE.Group();
  grip.name = 'ak-grip';
  grip.position.set(0, -0.026, 0.056);
  grip.rotation.x = 0.40;
  grip.add(box({ size: [0.032, 0.100, 0.040], pos: [0, -0.050, 0], mat: M.bakelite }));
  grip.add(box({ size: [0.036, 0.010, 0.044], pos: [0, -0.102, 0], mat: M.parkerized }));
  g.add(grip);

  // Fixed wooden stock with the classic underside cut.
  const stock = group('ak-stock',
    box({ size: [0.042, 0.070, 0.24], pos: [0, 0.006, 0.24], mat: M.woodOrange }),
    box({ size: [0.046, 0.088, 0.020], pos: [0, -0.004, 0.362], mat: M.parkerized, name: 'ak-buttplate' }),
    box({ size: [0.040, 0.026, 0.09], pos: [0, -0.044, 0.19], mat: M.woodOrange, rotX: -0.34, name: 'ak-stock-underside' }));
  g.add(stock);
  // Sling loops, front and rear, because an AK is carried on a strap.
  g.add(torus({ r: 0.013, tube: 0.003, seg: 5, ring: 10, arc: Math.PI * 2, mat: M.parkerized, pos: [-0.024, 0.006, -0.31], rot: [0, Math.PI / 2, 0] }));
  g.add(torus({ r: 0.013, tube: 0.003, seg: 5, ring: 10, arc: Math.PI * 2, mat: M.parkerized, pos: [-0.02, -0.012, 0.20], rot: [0, Math.PI / 2, 0] }));

  g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.582);
  g.userData.ejectPort = new THREE.Vector3(0.026, 0.036, -0.04);
  g.userData.magWell = new THREE.Vector3(0, -0.20, -0.02);
  g.userData.magazine = magazine;
  g.userData.magazineRest = magRest;
  g.userData.makeMagazine = makeAkMagazine;
  g.userData.makeCase = () => makeCase(0.0052, 0.023);
  g.userData.moving = { charging, dustCover, safety, port };
  g.userData.length = 0.88;
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  return g;
}

/* ================================================================== */
/* Speedloader — the revolver's "magazine", on the armory shelf         */
/* ================================================================== */
/** Six rounds in a moon clip with a knurled knob, for the heavy frame. */
export function buildSpeedloader() {
  const g = group('speedloader');
  g.add(cylinder({ r: 0.023, h: 0.010, pos: [0, 0, 0.012], rotX: Math.PI / 2, mat: M.parkerized, seg: 12 }));
  g.add(cylinder({ r: 0.010, h: 0.016, pos: [0, 0, 0.024], rotX: Math.PI / 2, mat: M.polymer, seg: 10 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(cylinder({
      r: 0.0055, h: 0.030, pos: [Math.cos(a) * 0.0135, Math.sin(a) * 0.0135, -0.010],
      rotX: Math.PI / 2, mat: M.brass, seg: 8,
    }));
  }
  return g;
}

/** Every builder, by catalog id. `catalog.js` names the ids. */
export const WEAPON_MODEL_BUILDERS = Object.freeze({
  revolver: buildRevolver,
  pistol9: buildNineMillimeter,
  carbine: () => buildCarbine({ sling: true }),
  saw: buildSaw,
  barrett: buildBarrett,
  ak47: buildAk47,
});

/** Build the model for a catalog id. Throws on an id nobody registered. */
export function buildWeaponModel(id) {
  const make = WEAPON_MODEL_BUILDERS[id];
  if (!make) throw new Error(`no weapon model for "${id}"`);
  return make();
}
