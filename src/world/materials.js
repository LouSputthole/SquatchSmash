/** The apartment's material palette, built once and shared by every prop. */
import * as THREE from 'three';
import { mat, emissive } from './build.js';
import * as T from './textures.js';

export function makeMaterials() {
  const wood = T.woodFloor();
  wood.repeat.set(10, 9);

  const wallTex = T.wallPaint('#c8bca4');
  wallTex.repeat.set(5, 1.6);

  const ceilTex = T.ceilingTex();
  ceilTex.repeat.set(6, 5);

  const splash = T.tileTex(6, '#7f7a6d', '#e6e2d6');
  splash.repeat.set(6, 2);

  const rug = T.rugTex();

  return {
    floor: mat({ map: wood, roughness: 0.72 }),
    wall: mat({ map: wallTex, roughness: 0.96 }),
    wallAccent: mat({ color: 0x3c4a45, roughness: 0.96 }),
    ceiling: mat({ map: ceilTex, roughness: 1 }),
    trim: mat({ color: 0xe8e2d4, roughness: 0.7 }),

    rug: mat({ map: rug, roughness: 1 }),
    splash: mat({ map: splash, roughness: 0.5 }),

    darkWood: mat({ map: T.laminate('#5c4430'), roughness: 0.6 }),
    lightWood: mat({ color: 0xb08a58, roughness: 0.68 }),
    cabinet: mat({ color: 0xa89578, roughness: 0.55 }),
    deskTop: mat({ map: T.laminate('#26221f'), roughness: 0.45 }),
    counter: mat({ map: T.laminate('#4d4b46'), roughness: 0.35 }),

    steel: mat({ map: T.brushedMetal('#b7babe'), roughness: 0.34, metalness: 0.82 }),
    darkSteel: mat({ color: 0x4a4d52, roughness: 0.4, metalness: 0.7 }),
    chrome: mat({ color: 0xd8dce0, roughness: 0.15, metalness: 0.95 }),
    black: mat({ color: 0x232326, roughness: 0.55 }),
    plasticBlack: mat({ color: 0x2b2b31, roughness: 0.42 }),
    plasticGrey: mat({ color: 0x6d6f74, roughness: 0.6 }),

    fabricCouch: mat({ map: T.fabricTex('#4a5a52'), roughness: 1 }),
    fabricBed: mat({ map: T.fabricTex('#5d6b7a'), roughness: 1 }),
    sheet: mat({ color: 0xdcd6c6, roughness: 1 }),
    pillow: mat({ color: 0xefe9da, roughness: 1 }),

    aluminium: mat({ color: 0xc9ccd1, roughness: 0.3, metalness: 0.85 }),
    beerLabel: mat({ color: 0x2f6b3a, roughness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xbfd8e8, roughness: 0.06, metalness: 0, transmission: 0.9,
      thickness: 0.05, transparent: true, opacity: 0.4,
    }),
    windowGlass: new THREE.MeshPhysicalMaterial({
      color: 0xdfeaf5, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.16,
    }),

    screenOff: mat({ color: 0x0a0b0d, roughness: 0.22 }),
    lampShade: mat({ color: 0xe8dcc0, roughness: 0.9, side: THREE.DoubleSide }),
    bulbOn: emissive(0xffd9a0, 2.2),
    bulbOff: mat({ color: 0x2a2723, roughness: 0.9 }),
    ledRed: emissive(0xff2a1e, 3),
    ledGreen: emissive(0x37ff6a, 2.4),
    ledAmber: emissive(0xffb648, 2.2),
    ledBlue: emissive(0x4aa8ff, 2.2),

    cardboard: mat({ color: 0xb98d5c, roughness: 1 }),
    paper: mat({ color: 0xe9e0cb, roughness: 1 }),
    leaf: mat({ color: 0x3f7a43, roughness: 0.85, side: THREE.DoubleSide }),
    soil: mat({ color: 0x3a2a20, roughness: 1 }),
    terracotta: mat({ color: 0xa5573a, roughness: 0.85 }),
    fur: mat({ color: 0x4a3626, roughness: 1 }),
    frame: mat({ color: 0x241a12, roughness: 0.6 }),
    // The view outside is a backdrop, not a lit surface -- keep it unshaded.
    sky: new THREE.MeshBasicMaterial({ map: T.citySkyline(), toneMapped: false }),
  };
}
