import { ensureThreeShim, ensureDomShim } from './tools/three-shim.mjs';
ensureDomShim();
const THREE = await import('three');
const { MansionDamageState } = await import('./src/mansion/siege/state.js');
const { FactionMatrix } = await import('./src/core/combat/factions.js');
const { CombatActor } = await import('./src/core/combat/actors.js');
const { FACTIONS } = await import('./src/core/combat/factions.js');
const { createAttackerPool, segmentBlocked } = await import('./src/mansion/siege/attackers.js');
const { ROLES, STAGING } = await import('./src/mansion/siege/waves.js');

const scene = new THREE.Scene();
const colliders = [];
const damage = new MansionDamageState({ colliders, state: 'under_attack' });
const pool = createAttackerPool({ scene, damage, matrix: new FactionMatrix() });
const entry = pool.spawn({ id: 'wall-probe', role: ROLES.rifle, staging: STAGING.front_steps });
const wall = new THREE.Box3(new THREE.Vector3(-2, 0, 30.6), new THREE.Vector3(2, 3.4, 31.4));
entry.root.position.set(0, 0, 33);
entry.floorY = 0; entry.figure.baseY = 0;
entry.path.length = 0; entry.goal.copy(entry.root.position);
entry.root.rotation.y = Math.PI * 0.6;
entry.target = null; entry.targetVisible = false; entry.lastSeen.set(0, 0, 0);
entry.memory = 0; entry.areaTarget = null; entry.awareness = 0; entry.sinceThink = 1;
entry.roundsFired = 0;

entry.root.updateMatrixWorld(true);
const player = {
  position: new THREE.Vector3(0, 1.66, 29),
  actor: new CombatActor({ id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100 }),
};
const originalRandom = Math.random; Math.random = () => 0;
const context = { player, colliders: [wall], alive: [], playerDamageScale: 0 };
for (let i = 0; i < 150; i++) pool.update(1 / 60, context);
console.log('blocked-phase', { visible: entry.targetVisible, target: entry.target?.actor?.id ?? null, rounds: entry.roundsFired, blocked: entry.blocked });
// direct trace sanity
const a = new THREE.Vector3(0, 1.6, 33);
const b = new THREE.Vector3(0, 1.66, 29);
console.log('segmentBlocked eye-line:', segmentBlocked(a, b, [wall]));
Math.random = originalRandom;
