import { BulletHoles } from '../world/bullets.js';
import { McClawskyController } from './characters/McClawskyController.js';
import { ProspectController } from './characters/ProspectController.js';
import { SalController } from './characters/SalController.js';
import { buildSquatchfatherScene } from './scenes/SquatchfatherScene.js';

function identifyRoot(root, name, assemblyId) {
  if (!root) throw new Error(`Squatchfather runtime geometry: missing ${name}`);
  root.name = name;
  root.userData.geometryGate = {
    ...(root.userData.geometryGate ?? {}),
    assemblyId,
  };
}

/**
 * Construct the complete boot-time restaurant geometry without browser boot.
 * Main and the permanent geometry gate use this same producer set.
 */
export function buildSquatchfatherRuntimeGeometry(scene, camera, { renderer = null } = {}) {
  const sceneState = buildSquatchfatherScene(scene, renderer);
  const impacts = new BulletHoles(scene);
  const blood = new BulletHoles(scene, 'blood');
  const prospect = new ProspectController(scene, camera, sceneState.colliders);
  const sal = new SalController(scene);
  const mcclawsky = new McClawskyController(scene);

  identifyRoot(prospect.fig?.group, 'squatchfather-prospect', 'squatchfather:prospect');
  identifyRoot(prospect.weapon, 'squatchfather-prospect-viewmodel', 'squatchfather:prospect-viewmodel');
  identifyRoot(sal.group, 'squatchfather-sal', 'squatchfather:sal');
  identifyRoot(mcclawsky.group, 'squatchfather-mcclawsky', 'squatchfather:mcclawsky');

  const bindFixture = (root, assemblyId) => {
    if (!root) throw new Error(`Squatchfather runtime geometry: missing fixture for ${assemblyId}`);
    root.userData.geometryGate = {
      ...(root.userData.geometryGate ?? {}),
      assemblyId,
    };
  };
  bindFixture(sceneState.props.prospectChair, 'squatchfather:prospect');
  bindFixture(sceneState.props.salChair, 'squatchfather:sal');
  bindFixture(sceneState.props.mcChair, 'squatchfather:mcclawsky');

  identifyRoot(sceneState.figures.diner1?.group, 'squatchfather-diner1', 'squatchfather:diner1');
  identifyRoot(sceneState.figures.diner2?.group, 'squatchfather-diner2', 'squatchfather:diner2');
  bindFixture(sceneState.props.diner1Chair, 'squatchfather:diner1');
  bindFixture(sceneState.props.diner2Chair, 'squatchfather:diner2');

  return Object.freeze({
    sceneState,
    impacts,
    blood,
    prospect,
    sal,
    mcclawsky,
  });
}
