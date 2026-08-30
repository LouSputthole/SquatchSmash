/**
 * THE CABIN'S OUTDOOR WORLD: the treeline, the footbridge, and the sky.
 *
 * Four owner playtest notes, one file, and every number in it was measured
 * headlessly against the built world rather than reasoned about:
 *
 *   "We need greater draw distance on the tree trunks. as they are floating
 *    trees in the distance."
 *   "The collision on the bridge is weird going over the creek."
 *   "We need a sun and some clouds in the sky."
 *   "I cant listen to the creek or look out over the ridge overlook."
 *
 * Each of the four had a mechanism, and each assertion below fails if that
 * mechanism is put back:
 *
 *   trunks in `forest-near-lod`        canopies outlive trunks by 68-85 m
 *   a blocking `cabin-bridge-deck`     he never sets foot on the span
 *   no sky dome                        there is no sun to find
 *   a wide, LOW landmark proxy         a level ray sails over its lid
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureDomShim();
ensureThreeShim();

const [
  THREE,
  { buildCountrysideCabin },
  { Player },
  { InteractionSystem },
  { DayNight },
  { SkyDome },
  { LANDMARKS, creekWaterAt },
] = await Promise.all([
  import('three'),
  import('../src/cabin/world.js'),
  import('../src/core/player.js'),
  import('../src/core/interaction.js'),
  import('../src/core/daynight.js'),
  import('../src/core/sky.js'),
  import('../src/cabin/field.js'),
]);

/** `WALK_EYE_HEIGHT` in src/cabin/main.js. */
const EYE = 1.66;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.045, 220);
scene.add(camera);
const noopHud = {
  showPrompt() {}, hidePrompt() {}, say() {}, toast() {}, setHand() {}, setHold() {},
};
const interaction = new InteractionSystem(camera, noopHud);
const cabin = await buildCountrysideCabin({
  scene, camera, interaction, externalLighting: true,
});
await cabin.models;
interaction.setOccluders(cabin.occluders ?? []);
scene.updateMatrixWorld(true);

const world = {
  colliders: cabin.colliders,
  floorZones: cabin.floorZones,
  groundAt: (x, z) => cabin.groundAt(x, z, 0),
};

function walker() {
  const p = new Player(camera, world);
  p.mode = 'walk';
  p.enabled = true;
  p.eyeHeight = EYE;
  p.targetEye = EYE;
  return p;
}

/**
 * Every visible tree instance's world position, split by trunk and canopy.
 *
 * `Object3D.raycast` and every world-space read need `matrixWorld`, and
 * nothing updates it headlessly, so the traversal recomputes it first. The
 * all-axes-zero instances are the gate's documented hide sentinel — a snag has
 * no crown — and are not drawn, so they are not counted either.
 */
function visibleTreeInstances(playerX, playerZ) {
  cabin.update(1.0, 1.0, new THREE.Vector3(playerX, 0, playerZ));
  cabin.update(1.0, 2.0, new THREE.Vector3(playerX, 0, playerZ));
  cabin.root.updateMatrixWorld(true);
  const trunks = [];
  const canopies = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  cabin.root.traverse((object) => {
    if (!object.isInstancedMesh) return;
    const trunk = /trunk/.test(object.name);
    const canopy = /crown/.test(object.name);
    if (!trunk && !canopy) return;
    for (let node = object; node; node = node.parent) if (node.visible === false) return;
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      matrix.decompose(position, rotation, scale);
      if (Math.abs(scale.x) <= 1e-3 && Math.abs(scale.y) <= 1e-3 && Math.abs(scale.z) <= 1e-3) {
        continue;
      }
      position.setFromMatrixPosition(matrix).applyMatrix4(object.matrixWorld);
      const distance = Math.hypot(position.x - playerX, position.z - playerZ);
      (trunk ? trunks : canopies).push(distance);
    }
  });
  return { trunks, canopies };
}

/**
 * A canopy is only ever allowed to draw where its trunk draws.
 *
 * Before: the trunks lived in `forest-near-lod`, which switches off at
 * `nearFoliage` (66 m of chunk-centre distance), while the crowns carried on
 * to `farFoliage` (158 m). Measured from three places a player actually
 * stands:
 *
 *   porch      trunks to  86.2 m, canopies to 153.9 m, 337 orphan canopies
 *   overlook   trunks to  78.9 m, canopies to 164.3 m, 210 orphan canopies
 *   bridge     trunks to  79.3 m, canopies to 163.4 m, 376 orphan canopies
 *
 * That 68-to-85 m band of foliage hanging over nothing is what the owner saw.
 * After: both LODs live and die with the chunk, so the two farthest distances
 * are the same instance's, to the metre.
 */
test('the treeline never draws a canopy further than it draws a trunk', () => {
  for (const [label, x, z] of [['porch', 0, 7], ['overlook', 61.6, -64], ['bridge', 4, -37]]) {
    const { trunks, canopies } = visibleTreeInstances(x, z);
    assert.ok(trunks.length > 0, `${label}: no trunks drawn at all`);
    assert.ok(canopies.length > 0, `${label}: no canopies drawn at all`);
    const farthestTrunk = Math.max(...trunks);
    const farthestCanopy = Math.max(...canopies);
    const orphans = canopies.filter((d) => d > farthestTrunk + 0.5).length;
    assert.equal(
      orphans, 0,
      `${label}: ${orphans} canopies drawn past the last trunk `
      + `(trunks to ${farthestTrunk.toFixed(1)} m, canopies to ${farthestCanopy.toFixed(1)} m)`,
    );
    // Same chunk band, so the two agree to well inside one chunk.
    assert.ok(
      Math.abs(farthestTrunk - farthestCanopy) < 1,
      `${label}: trunk reach ${farthestTrunk.toFixed(1)} m vs canopy reach ${farthestCanopy.toFixed(1)} m`,
    );
  }
});

/**
 * "We need some tree variety" — the treeline was 558 copies of one tree.
 *
 * The variety is instance data, not geometry: proportions, tier count, a
 * flipped lower cone for the broadleaf, and a per-instance colour. So this
 * asserts on what the player sees — how many distinct trunk colours are on the
 * property — rather than on the species table, which a refactor could keep
 * while quietly painting every tree the same.
 */
test('the forest plants more than one kind of tree', () => {
  const colours = new Set();
  const colour = new THREE.Color();
  cabin.root.traverse((object) => {
    if (!object.isInstancedMesh || !/trunk/.test(object.name) || !object.instanceColor) return;
    for (let i = 0; i < object.count; i++) {
      object.getColorAt(i, colour);
      colours.add(colour.getHex());
    }
  });
  assert.ok(colours.size >= 40, `only ${colours.size} distinct trunk colours on the property`);

  const heights = new Set();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  cabin.root.traverse((object) => {
    if (!object.isInstancedMesh || !/trunk/.test(object.name)) return;
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      matrix.decompose(position, rotation, scale);
      heights.add(Math.round(scale.y * 4) / 4);
    }
  });
  // Five species spanning 4.2 m snags to 17.2 m lodgepole.
  assert.ok(Math.max(...heights) - Math.min(...heights) > 8, 'every tree is the same height');
});

/**
 * "We need a bit more detail in the forest" — and it cost no draw calls.
 *
 * The floor went from 1,617 identical plants to 3,271 in three forms, plus
 * 181 saplings, 256 small stones and 38 cut stumps. Every one of them rides
 * an instanced mesh that was already being drawn: the saplings are cones in
 * `cabin-tree-crowns-near`, the stones are in `cabin-field-rocks`, the
 * stumps are the deadfall's own cylinder standing up. So the thing worth
 * holding is not the counts — `countryside-cabin-world.test.mjs` holds
 * those — but the SHAPE: six instanced meshes on the property and not one
 * more, and variety carried on `instanceColor` rather than on new material.
 *
 * Put a fourth mesh in a chunk for the saplings and this fails.
 */
test('the forest floor is dressed out of the meshes already being drawn', () => {
  const meshNames = new Set();
  const perChunk = new Map();
  let trunkInstances = 0;
  let nearCrownInstances = 0;
  cabin.root.traverse((object) => {
    if (!object.isInstancedMesh) return;
    meshNames.add(object.name);
    if (/^cabin-tree-trunks$/.test(object.name)) trunkInstances += object.count;
    if (/^cabin-tree-crowns-near$/.test(object.name)) nearCrownInstances += object.count;
    for (let node = object; node; node = node.parent) {
      if (!/^cabin-forest-chunk-/.test(node.name || '')) continue;
      perChunk.set(node.name, (perChunk.get(node.name) ?? 0) + 1);
      break;
    }
  });
  assert.deepEqual([...meshNames].sort(), [
    'cabin-deadfall',
    'cabin-fern-undergrowth',
    'cabin-field-rocks',
    'cabin-tree-crowns-far',
    'cabin-tree-crowns-near',
    'cabin-tree-trunks',
  ], 'the forest grew a new instanced draw call');
  assert.ok(
    Math.max(...perChunk.values()) <= 4,
    `a forest chunk carries ${Math.max(...perChunk.values())} instanced meshes, not 4`,
  );

  // Saplings live in the near crowns' own allocation: three authored tiers a
  // tree, and whatever is left over is young growth.
  const saplings = nearCrownInstances - trunkInstances * 3;
  assert.ok(saplings >= 120, `only ${saplings} saplings share the crowns' draw call`);

  // Three forms — fern, salal, grass — separated by instance data alone.
  const plantColours = new Set();
  const plantShapes = new Set();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const colour = new THREE.Color();
  cabin.root.traverse((object) => {
    if (!object.isInstancedMesh || object.name !== 'cabin-fern-undergrowth') return;
    assert.ok(object.instanceColor, 'the undergrowth lost its per-instance tint');
    for (let i = 0; i < object.count; i++) {
      object.getColorAt(i, colour);
      plantColours.add(colour.getHex());
      object.getMatrixAt(i, matrix);
      matrix.decompose(position, rotation, scale);
      // Height over width: 0.73 for a fern, 1.68 for a tuft of grass.
      plantShapes.add(Math.round((scale.y / scale.x) * 20) / 20);
    }
  });
  assert.ok(plantColours.size >= 40, `only ${plantColours.size} distinct plant colours`);
  assert.ok(plantShapes.size >= 3, `only ${plantShapes.size} distinct plant proportions`);
  assert.ok(
    Math.max(...plantShapes) / Math.min(...plantShapes) > 2,
    'every plant is the same shape',
  );
});

/**
 * THE FOOTBRIDGE.
 *
 * `cabin-bridge-deck` was a blocking world volume laid over the same
 * footprint `makeGroundAt` already publishes as the walking surface, and a
 * capsule cannot be pushed out of a box it is standing inside. Walking the
 * real `Player` at 60 Hz straight up the planked approach at x = 4.000:
 *
 *   from the south bank  stopped dead at z = -31.802, jittering 2.2 cm
 *   from the north bank  stopped dead at z = -42.212, jittering 2.2 cm
 *
 * The deck spans z -41.920 to -32.080, so both stops are the box face plus
 * the 0.30 m capsule radius: he never set foot on the 9.8 m span.
 */
test('the player walks the whole footbridge span, from either bank', () => {
  const p = LANDMARKS.bridge;
  const deckY = cabin.groundAt(p.x, p.z, 0);

  for (const direction of [-1, 1]) {
    const startZ = p.z - direction * 9;
    const player = walker();
    const ground = cabin.groundAt(p.x, startZ, 0);
    player.position.set(p.x, ground + EYE, startZ);
    player.ground = ground;
    player.yaw = direction < 0 ? 0 : Math.PI;
    player.keys = new Set(['KeyW']);

    let reached = startZ;
    let worstDrift = 0;
    let lowestFoot = Infinity;
    for (let i = 0; i < 900; i++) {
      player.update(1 / 60);
      const z = player.position.z;
      const feet = player.position.y - player.eyeHeight;
      if (Math.abs(z - p.z) <= 4.9) {
        worstDrift = Math.max(worstDrift, Math.abs(player.position.x - p.x));
        lowestFoot = Math.min(lowestFoot, feet);
      }
      reached = z;
      if (direction < 0 ? z < p.z - 8 : z > p.z + 8) break;
    }

    const label = direction < 0 ? 'south to north' : 'north to south';
    assert.ok(
      direction < 0 ? reached < p.z - 8 : reached > p.z + 8,
      `${label}: stopped at z = ${reached.toFixed(3)} instead of crossing`,
    );
    // He walked the centre line and stayed on the deck the whole way.
    assert.ok(worstDrift < 0.05, `${label}: shoved ${worstDrift.toFixed(3)} m off the centre line`);
    assert.ok(
      lowestFoot > deckY - 0.05,
      `${label}: feet dropped to ${lowestFoot.toFixed(3)} against a deck at ${deckY.toFixed(3)}`,
    );
  }
});

/**
 * Standing still on the deck used to fire `_resolve`'s dead-centre ejection
 * every frame: the capsule was inside the deck box in XZ, so the nearest face
 * won and threw him from x 4.000 to x 5.740 — out through the east rail and
 * into the creek, feet -1.878 against a deck at -0.933.
 */
test('standing on the footbridge does not eject the player into the creek', () => {
  const p = LANDMARKS.bridge;
  const deckY = cabin.groundAt(p.x, p.z, 0);
  const player = walker();
  player.position.set(p.x, deckY + EYE, p.z);
  player.ground = deckY;
  player.keys = new Set();
  for (let i = 0; i < 120; i++) player.update(1 / 60);

  const feet = player.position.y - player.eyeHeight;
  assert.ok(
    Math.abs(player.position.x - p.x) < 0.05 && Math.abs(player.position.z - p.z) < 0.05,
    `pushed to (${player.position.x.toFixed(3)}, ${player.position.z.toFixed(3)})`,
  );
  assert.ok(
    Math.abs(feet - deckY) < 0.05,
    `feet ${feet.toFixed(3)} against a deck at ${deckY.toFixed(3)}`,
  );
  // And the deck really is a bridge: 61 cm of air over the water.
  assert.ok(deckY - creekWaterAt(p.x, p.z) > 0.5);
});

/**
 * THE SKY.
 *
 * There was none — `scene.background` was `fogColour` mixed toward 0x31453b,
 * which on Day 2 at 09:20 comes out 0x36423f. The dome has to hold two things
 * at once: a good day when the cabin opens, and a convincing turn to dark for
 * the dungeon chapter's 20:45 nightfall. Both come off the one `DayNight`
 * table, so neither can drift away from the other.
 */
test('the sky has a sun, and it still goes dark at nightfall', () => {
  const skyScene = new THREE.Scene();
  const skyCamera = new THREE.PerspectiveCamera();
  const sky = new SkyDome(skyScene, { camera: skyCamera });
  const time = new DayNight();

  const dome = skyScene.getObjectByName('sky-dome');
  assert.ok(dome?.isMesh, 'no sky dome in the scene');
  assert.match(dome.material.fragmentShader, /uDiscDirection/, 'the sky shader draws no disc');

  const luminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

  // Day 2, 09:20: the cabin's own opening hour.
  time.setTime(2, 9 * 60 + 20);
  sky.update(time, 0);
  const dayZenith = luminance(sky.uniforms.uZenith.value);
  const sunDirection = sky.uniforms.uDiscDirection.value.clone();
  assert.ok(
    Math.abs(sunDirection.length() - 1) < 1e-6,
    'the disc direction is not a unit vector',
  );
  assert.ok(
    sunDirection.dot(time.sunPos.clone().normalize()) > 0.999,
    'the sun disc is not where the campaign clock puts the sun',
  );
  assert.ok(sunDirection.y > 0.2, 'the morning sun is not above the horizon');
  assert.ok(sky.uniforms.uDiscIntensity.value > 1.5, 'the daytime sun is not lit');
  assert.ok(sky.uniforms.uGlow.value > 1, 'the daytime sun has no glow');
  assert.ok(sky.uniforms.uCloudOpacity.value > 0.9, 'there are no daytime clouds');
  assert.ok(sky.uniforms.uCloudCover.value > 0.2, 'the cloud deck is empty');
  // A good day, not a grey one: the zenith is a blue with blue in it.
  assert.ok(
    sky.uniforms.uZenith.value.b > sky.uniforms.uZenith.value.r + 0.15,
    `the daytime zenith is ${sky.uniforms.uZenith.value.getHexString()}, not a sky`,
  );
  assert.ok(sky.fogDensity < 0.005, `daytime fog ${sky.fogDensity} is still a grey wall`);

  /* AND IT IS WRITTEN IN THE VALUES THE FRAMEBUFFER SHOWS.
   *
   * Owner: *"I want it day time and sunny out."* The dome is a
   * `ShaderMaterial` with its own fragment shader, so it gets no
   * `colorspace_fragment` chunk and writes working-space values raw — proved
   * in the browser by painting it 0.5 and reading 128 back. Every colour it
   * derives comes from a `DayNight` hex that `Color.setHex` decoded, so the
   * midday zenith reached the screen as 0x4d7ad7: a dark navy where the
   * source says sky. Lifted, it is 0x96b8ed. */
  assert.equal(sky.displayLift, 1, 'the daylight sky is not written in display values');
  assert.ok(
    dayZenith > 0.62,
    `the midday zenith is ${sky.uniforms.uZenith.value.getHexString()}, still a gamma dark`,
  );

  // Day 3, 20:45: the dungeon chapter's nightfall, and 21:30 past it.
  time.setTime(3, 20 * 60 + 45);
  sky.update(time, 0);
  const duskZenith = luminance(sky.uniforms.uZenith.value);
  const duskLift = sky.displayLift;
  time.setTime(3, 21 * 60 + 30);
  sky.update(time, 0);
  const nightZenith = luminance(sky.uniforms.uZenith.value);

  /* THE NIGHT IS UNTOUCHED, TO THE BIT, and this is the assertion that says
   * so. `dayness` is 0.146 at nightfall and 0.000 at 21:30, both below the
   * threshold the display lift starts at, so the dungeon chapter's dark is
   * exactly the dark it was authored as: a 0x0c0c19 zenith at 20:45 and
   * 0x04060e at 21:30. Encoding the dome outright — the obvious fix, and the
   * wrong one — takes that second colour to 0x2a3355. */
  assert.equal(duskLift, 0, 'the display lift leaked into the nightfall');
  assert.equal(sky.displayLift, 0, 'the display lift leaked into the night');
  assert.ok(duskZenith < 0.06, `nightfall zenith rose to ${duskZenith.toFixed(3)}`);
  assert.ok(nightZenith < 0.03, `night zenith rose to ${nightZenith.toFixed(3)}`);

  assert.ok(duskZenith < dayZenith * 0.35, `nightfall only reached ${duskZenith.toFixed(3)}`);
  assert.ok(nightZenith < dayZenith * 0.12, `night only reached ${nightZenith.toFixed(3)}`);
  assert.ok(sky.uniforms.uDiscIntensity.value < 1, 'the night disc is still a sun');
  assert.ok(sky.uniforms.uGlow.value < 0.2, 'the night sky still has sun glow');
  assert.ok(sky.fogDensity > 0.007, 'the night fog never closes in');

  // Day 4, 09:30: the blackout morning comes back to a full day.
  time.setTime(4, 9 * 60 + 30);
  sky.update(time, 0);
  assert.ok(luminance(sky.uniforms.uZenith.value) > dayZenith * 0.95, 'the morning never returns');

  sky.dispose();
  assert.equal(skyScene.getObjectByName('sky-dome'), undefined);
});

/**
 * THE LANDMARK AIM PROXIES.
 *
 * A box is invisible to a ray that starts inside it, and every one of these
 * proxies was a wide, LOW slab whose height came from the terrain under its
 * own centre. Measured with the real `InteractionSystem` ray, looking LEVEL
 * from every legal standing position clear of the proxy's own footprint:
 *
 *   creek     0 of 1944 viewpoints acquired it   ->  1823 of 1944
 *   firepit   0 of 1880                          ->  1841 of 1880
 *   range     0 of 2096                          ->  1856 of 2096
 *
 * The overlook was the other flavour: 6.4 m square and 2.0 m tall with the
 * eye at 7.92 INSIDE it, so no pitch between -60 and +60 degrees found it
 * from the authored approach stance at all.
 *
 * The rule this holds is the one that fixes both: the proxy's side face must
 * cover the standing eye band, and the proxy must not contain the stance the
 * scene sends the player to.
 */
test('every landmark can be aimed at with a level look from clear ground', () => {
  const box = new THREE.Box3();
  const centre = new THREE.Vector3();

  for (const id of ['creek', 'overlook', 'trailhead', 'shed', 'firepit', 'range', 'porch']) {
    const target = cabin.interactionTargets[id];
    assert.ok(target, `${id} has no interaction target`);
    target.updateWorldMatrix(true, true);
    box.setFromObject(target);
    box.getCenter(centre);

    let sampled = 0;
    let acquired = 0;
    for (let bearing = 0; bearing < 48; bearing++) {
      const angle = (bearing / 48) * Math.PI * 2;
      const ux = Math.cos(angle);
      const uz = Math.sin(angle);
      // Start at the footprint edge on this bearing and walk outward.
      const edge = Math.min(
        Math.abs(ux) > 1e-6 ? ((box.max.x - box.min.x) / 2) / Math.abs(ux) : Infinity,
        Math.abs(uz) > 1e-6 ? ((box.max.z - box.min.z) / 2) / Math.abs(uz) : Infinity,
      );
      for (let out = 0.2; out <= 3.0; out += 0.2) {
        const px = centre.x + ux * (edge + out);
        const pz = centre.z + uz * (edge + out);
        const nearX = Math.min(Math.max(px, box.min.x), box.max.x);
        const nearZ = Math.min(Math.max(pz, box.min.z), box.max.z);
        if (Math.hypot(px - nearX, pz - nearZ) > 2.6) break;
        const ground = cabin.groundAt(px, pz, 0);
        sampled += 1;
        camera.position.set(px, ground + EYE, pz);
        camera.rotation.set(0, 0, 0, 'YXZ');
        camera.rotation.y = Math.atan2(-(centre.x - px), -(centre.z - pz));
        camera.rotation.x = 0;
        camera.updateMatrixWorld(true);
        interaction.current = null;
        interaction.update(1 / 60);
        if (interaction.current === target) acquired += 1;
      }
    }
    assert.ok(sampled > 0, `${id}: no legal viewpoint to sweep`);
    const fraction = acquired / sampled;
    assert.ok(
      fraction > 0.7,
      `${id}: only ${acquired}/${sampled} (${(fraction * 100).toFixed(1)}%) level rays from clear `
      + 'ground reach it',
    );
  }
});

/**
 * The proxy sizing rule itself, so a future edit to one landmark cannot
 * quietly reintroduce the shape that broke all of them.
 */
test('a landmark proxy covers the standing eye and excludes its own approach stance', () => {
  const box = new THREE.Box3();
  for (const [id, stance] of Object.entries(cabin.viewpoints)) {
    const target = cabin.interactionTargets[id];
    if (!target) continue;
    target.updateWorldMatrix(true, true);
    box.setFromObject(target);

    const insideFootprint = stance.position.x > box.min.x && stance.position.x < box.max.x
      && stance.position.z > box.min.z && stance.position.z < box.max.z;
    assert.equal(
      insideFootprint, false,
      `${id}: the authored approach stance stands inside its own aim proxy`,
    );

    // Reachable at all: the 2.7 m interaction ray has to get from that stance
    // to a face of the box.
    const nearX = Math.min(Math.max(stance.position.x, box.min.x), box.max.x);
    const nearZ = Math.min(Math.max(stance.position.z, box.min.z), box.max.z);
    const reach = Math.hypot(stance.position.x - nearX, stance.position.z - nearZ);
    assert.ok(reach < 2.7, `${id}: the authored stance is ${reach.toFixed(2)} m from its proxy`);

    // And the side face covers the eye standing on the ground around it.
    const ground = cabin.groundAt(stance.position.x, stance.position.z, 0);
    assert.ok(
      box.max.y > ground + EYE,
      `${id}: proxy lid ${box.max.y.toFixed(2)} sits under an eye at ${(ground + EYE).toFixed(2)}`,
    );
  }
});
