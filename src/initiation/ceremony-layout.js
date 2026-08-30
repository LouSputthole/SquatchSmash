/**
 * Outdoor bodies around the Initiation clearing.
 *
 * This is a layout Module, not a character factory. Keeping the stations here
 * makes the arrival aisle testable without booting WebGL, and keeps collision
 * geometry from depending on the old random visual scale in main.js.
 */
export const OUTDOOR_MEMBER_STATIONS = Object.freeze([
  Object.freeze({
    key: 'BOOSKIBRO', name: 'BOOSKIBRO', face: 'assets/faces/booski.png',
    x: -6.4, z: -3.6, founder: true,
  }),
  Object.freeze({
    key: 'LOU', name: 'BIG UNCLE LOU SPUTTHOLE', face: 'assets/faces/lou.png',
    x: -7.8, z: -4.4, founder: true,
  }),
  Object.freeze({ key: 'GRATIN', name: 'GRATIN', face: 'assets/faces/gratin.png', shirt: 0x5a4a6e, x: 1.6, z: -10.2 }),
  Object.freeze({ key: 'SEFF', name: 'SEFF', shirt: 0x46505f, x: 3.4, z: -10.4 }),
  /* West of the aisle, with a full person-width of light between body and path. */
  Object.freeze({ key: 'DEATHMEGATRON', name: 'DEATHMEGATRON', face: 'assets/faces/deathmegatron.png', shirt: 0x9aa0ab, x: -4.4, z: -9.9 }),
  Object.freeze({ key: 'RIPPINFLOW', name: 'RIPPINFLOW', face: 'assets/faces/rippinflow.png', shirt: 0x2f62d9, x: -5.0, z: -9.9 }),
  Object.freeze({ key: 'SHUBENATOR', name: 'THE SHUBENATOR', face: 'assets/faces/shubenator.png', shirt: 0x8a8f9c, x: -6.6, z: -10.3 }),
  /* East of the aisle; the old -0.2 station stood directly in Tony's route. */
  Object.freeze({ key: 'NUMBSKULL', name: 'NUMBSKULL', shirt: 0x3f4a3a, x: 2.2, z: -9.7 }),
  Object.freeze({ key: 'APE', name: 'APE', face: 'assets/faces/ape.png', shirt: 0x2a2e38, x: 5.2, z: -10.2 }),
  Object.freeze({ key: 'SNOW', name: 'SNOW', face: 'assets/faces/snow.png', shirt: 0xf0f0ec, x: -3.9, z: -10.6 }),
  Object.freeze({ key: 'IRISH', name: 'IRISH', face: 'assets/faces/irish.png', shirt: 0x3d6b4a, x: 6.9, z: -9.8 }),
  Object.freeze({ key: 'HOGMAMA', name: 'HOG MAMA', face: 'assets/faces/hogmama.png', shirt: 0x3a3a44, x: 8.2, z: -9.4 }),
  Object.freeze({ key: 'LAG', name: 'LAG', shirt: 0x584a3c, x: 0.9, z: -11.3 }),
  /* West of the aisle; the old -1.4 station pinched the final approach. */
  Object.freeze({ key: 'ERIC', name: 'ERIC', face: 'assets/faces/erican.png', shirt: 0xe8e4d4, x: -4.2, z: -11.8 }),
  Object.freeze({ key: 'SASOLE', name: 'CAPTAIN LOU SASOLE', face: 'assets/faces/sasole.png', shirt: 0x2e3a5e, x: 1.4, z: -12.2 }),
]);

/** Deterministic visual scale; it must never silently change collision space. */
export function memberScale(spec) {
  if (spec.scale) return spec.scale;
  if (spec.key === 'BOOSKIBRO') return 1.22;
  if (spec.key === 'LOU') return 1.12;
  return 1;
}
