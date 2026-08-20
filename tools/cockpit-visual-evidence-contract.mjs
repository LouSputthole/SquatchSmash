import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveEvidenceOutputRoot } from './evidence-directory-transaction.mjs';

const roots = (rootNames, objectCount, selection = 'subtree') => Object.freeze({
  rootNames: Object.freeze(rootNames),
  objectCount,
  selection,
});

/* Exact production identities. There is deliberately no `expectedRootCount =
 * 1` fallback: every visual claim resolves a named, cardinality-bound owner
 * from the real builder. `selection` lets a parent mesh own only its own draw
 * (windshield pane, panel shell) without borrowing named children that have an
 * independent colour/claim. */
export const COCKPIT_VISUAL_OWNER_POLICIES = Object.freeze({
  beefrun: Object.freeze({
    'windshield-pane': roots(['windshield'], 1, 'root-only'),
    'windshield-frames': roots(['windshield-frame-header', 'windshield-frame-port', 'windshield-frame-sill', 'windshield-frame-starboard'], 4),
    'instrument-panel-shell': roots(['instrument-panel'], 1, 'root-only'),
    gauges: roots(['(unnamed)'], 1),
    'pilot-yoke': roots(['yoke-pilot'], 4),
    'copilot-yoke': roots(['yoke-copilot'], 4),
    'port-window-pane': roots(['cabin-glass-side-left'], 1, 'root-only'),
    'port-aperture-shell': roots(['fuselage-side-port-header', 'fuselage-side-port-lower', 'fuselage-side-port-window-wall-1', 'fuselage-side-port-window-wall-2', 'fuselage-side-port-window-wall-3'], 5),
    'port-frame': roots(['windshield-frame-port'], 1),
    'starboard-window-pane': roots(['cabin-glass-side-right'], 1, 'root-only'),
    'starboard-aperture-shell': roots(['fuselage-side-starboard-header', 'fuselage-side-starboard-lower-1', 'fuselage-side-starboard-lower-2', 'fuselage-side-starboard-opening-wall-1', 'fuselage-side-starboard-opening-wall-2', 'fuselage-side-starboard-opening-wall-3', 'fuselage-side-starboard-opening-wall-4'], 7),
    'sasole-body': roots(['captain_lou_sasole-head', 'captain_lou_sasole-torso'], 2),
    'sasole-boots': roots(['captain_lou_sasole-leg-left-boot', 'captain_lou_sasole-leg-right-boot'], 2),
    'supported-footwell': roots(['cockpit-footwell', 'cockpit-footwell-leg-1', 'cockpit-footwell-leg-2', 'cockpit-footwell-leg-3', 'cockpit-footwell-leg-4'], 5),
    'rudder-pedals': roots(['rudder-pedal-left', 'rudder-pedal-left-mount', 'rudder-pedal-right', 'rudder-pedal-right-mount'], 4),
    'cargo-door-leaf': roots(['cargo-door-leaf'], 1, 'root-only'),
    'cargo-threshold': roots(['cargo-door-threshold'], 1),
    'cargo-ramp': roots(['cargo-ramp'], 10),
    'cargo-door-frame': roots(['cargo-door-frame-head', 'cargo-door-frame-sill', 'cargo-door-jamb-0', 'cargo-door-jamb-1'], 4),
    'side-shell': roots(['fuselage-side-shell'], 16),
    'rolled-hull': roots(['fuselage-shell'], 8),
    'nose-shell': roots(['nose-cone', 'nose-fairing'], 2),
    'tail-shell': roots(['tail-boom', 'tail-boom-fairing'], 2),
    'engine-quadrant': roots(['engine-control-quadrant'], 1),
    'engine-levers': roots(['lever-mixture-left', 'lever-mixture-right', 'lever-prop-left', 'lever-prop-right', 'lever-throttle-left', 'lever-throttle-right'], 12),
    'flap-lever': roots(['flap-lever'], 2),
  }),
  enola: Object.freeze({
    'windshield-pane': roots(['cockpit-windshield'], 1, 'root-only'),
    'windshield-frames': roots(['cockpit-windshield-frame-header', 'cockpit-windshield-frame-post-centre', 'cockpit-windshield-frame-post-port', 'cockpit-windshield-frame-post-starboard'], 4),
    'side-window-panes': roots(['cockpit-side-window-port', 'cockpit-side-window-starboard'], 2, 'root-only'),
    'roof-annuli': roots(['fuselage-roof-astrodome-annulus', 'fuselage-roof-dorsal-annulus'], 2),
    'waist-annuli': roots(['fuselage-waist-annulus-port', 'fuselage-waist-annulus-starboard'], 2),
    'instrument-panel-shell': roots(['cockpit-instrument-panel'], 1, 'root-only'),
    'instrument-face': roots(['cockpit-instrument-face'], 1),
    'panel-supports': roots(['cockpit-instrument-panel-support-port', 'cockpit-instrument-panel-support-starboard'], 2),
    'throttle-quadrant': roots(['cockpit-throttle-quadrant'], 1, 'root-only'),
    'quadrant-supports': roots(['cockpit-throttle-quadrant-support-port', 'cockpit-throttle-quadrant-support-starboard'], 2),
    'throttle-levers': roots(['cockpit-throttle-lever-1', 'cockpit-throttle-lever-2', 'cockpit-throttle-lever-3', 'cockpit-throttle-lever-4'], 8),
    'pilot-yoke': roots(['pilot-control-yoke'], 6),
    'copilot-yoke': roots(['copilot-control-yoke'], 6),
    'rudder-pedals': roots(['copilot-rudder-pedal-left', 'copilot-rudder-pedal-left-mount', 'copilot-rudder-pedal-right', 'copilot-rudder-pedal-right-mount', 'pilot-rudder-pedal-left', 'pilot-rudder-pedal-left-mount', 'pilot-rudder-pedal-right', 'pilot-rudder-pedal-right-mount'], 8),
    'sasole-body': roots(['captain_lou_sasole-head', 'captain_lou_sasole-torso'], 2),
    'sasole-boots': roots(['captain_lou_sasole-leg-left-boot', 'captain_lou_sasole-leg-right-boot'], 2),
    'sasole-seat': roots(['cockpit-seat-back', 'cockpit-seat-head-armour', 'cockpit-seat-lap-belt', 'cockpit-seat-leg', 'cockpit-seat-leg', 'cockpit-seat-leg', 'cockpit-seat-leg', 'cockpit-seat-pan'], 8),
    'irish-body': roots(['irish-head', 'irish-torso'], 2),
    'irish-boots': roots(['irish-leg-left-boot', 'irish-leg-right-boot'], 2),
    'nav-table': roots(['nav-table'], 10),
    'seat-pans': roots(['cockpit-seat-pan', 'cockpit-seat-pan', 'cockpit-seat-pan'], 3),
    'crew-door-leaf': roots(['crew-door-leaf'], 1, 'root-only'),
    'crew-door-frame': roots(['crew-door-frame-aft-jamb', 'crew-door-frame-forward-jamb', 'crew-door-frame-header'], 3),
    'crew-threshold': roots(['crew-door-frame-sill'], 1),
    'boarding-ladder': roots(['boarding-ladder'], 15),
    'side-shell-panel': roots(['fuselage-skin-starboard-20'], 1),
    'belly-shell': roots(['fuselage-belly-aft', 'fuselage-belly-forward'], 2),
    'bomb-bay-edges': roots(['fuselage-bomb-bay-port-edge', 'fuselage-bomb-bay-starboard-edge'], 2),
    'bomb-bay-leaves': roots(['bomb-bay-door-port', 'bomb-bay-door-starboard'], 2),
    'bombardier-pane': roots(['bombardier-glazing'], 1),
    'nose-glazing-frame': roots(['nose-glazing-collar', 'nose-glazing-rib', 'nose-glazing-rib', 'nose-glazing-rib'], 4),
    'rear-gun-trunnions': roots(['rear-gun-left-trunnion', 'rear-gun-right-trunnion'], 2),
    'rear-gun-barrels': roots(['rear-gun-left-barrel', 'rear-gun-right-barrel'], 2),
    'rear-gunner-hands': roots(['shubes-arm-left-hand', 'shubes-arm-right-hand'], 2),
    'rear-gun-grips': roots(['rear-gun-spade-grip', 'rear-gun-spade-grip'], 2),
    /* The public manned-gun path intentionally hides Shubes' neck subtree at
     * the camera.  Own his still-rendered torso here; gun.head-hidden binds
     * the production-hidden head separately instead of demanding impossible
     * first-person head pixels. */
    'rear-gunner-body': roots(['shubes-torso'], 1),
    'rear-gun-seat': roots(['rear-gun-seat-pan'], 1),
    'rear-gun-fairing': roots(['rear-gun-fairing'], 1),
    'aft-tail-shell': roots(['fuselage-aft-cap', 'vertical-fin'], 2),
    'rear-turret-pane': roots(['rear-gun-glazing'], 1, 'root-only'),
    'rear-turret-frames': roots(['rear-gun-frame-equator', 'rear-gun-frame-meridian-left', 'rear-gun-frame-meridian-right', 'rear-gun-glazing-ring'], 4),
    'gun-tracer': roots(['tracer-pool'], 1, 'root-only'),
    'pinup-port': roots(['enola-squatch-nose-art'], 1, 'root-only'),
    'pinup-starboard': roots(['enola-squatch-nose-art'], 1, 'root-only'),
    'name-port': roots(['enola-squatch-nose-name'], 1, 'root-only'),
    'name-starboard': roots(['enola-squatch-nose-name'], 1, 'root-only'),
  }),
});

const owner = (scene, id, color, minPixels = 120, minContrast = 0.01) => {
  const policy = COCKPIT_VISUAL_OWNER_POLICIES[scene]?.[id];
  if (!policy) throw new Error(`cockpit visual owner policy is missing: ${scene}/${id}`);
  const maxComponentCount = Math.max(policy.rootNames.length, policy.objectCount * 2);
  const minLargestComponentRatio = Math.max(0.12, 0.72 / maxComponentCount);
  return Object.freeze({
    id,
    color,
    minPixels,
    minContrast,
    minLargestComponentPixels: Math.max(32, Math.ceil(minPixels * minLargestComponentRatio)),
    minLargestComponentRatio,
    maxComponentCount,
    minRootPixels: Math.max(6, Math.ceil(minPixels / (policy.rootNames.length * 12))),
    expectedRootCount: policy.rootNames.length,
    expectedObjectCount: policy.objectCount,
    expectedRootNames: policy.rootNames,
    selection: policy.selection,
  });
};

const seam = (id, requiredOwners, numericGates) => Object.freeze({
  id,
  requiredOwners: Object.freeze(requiredOwners),
  numericGates: Object.freeze(numericGates),
});

export const COCKPIT_VISUAL_SEAM_POLICIES = Object.freeze(Object.fromEntries([
  seam('beef:forward-gauges-panel-windshield-yoke', ['windshield-pane', 'windshield-frames', 'instrument-panel-shell', 'gauges', 'pilot-yoke'], ['aperture.windshield', 'controls.neutral', 'camera.pilot']),
  seam('beef:port-aperture', ['port-window-pane', 'port-aperture-shell', 'port-frame'], ['aperture.port', 'camera.pilot-port']),
  seam('beef:starboard-aperture', ['starboard-window-pane', 'starboard-aperture-shell'], ['aperture.starboard', 'camera.pilot-starboard']),
  seam('beef:sasole', ['sasole-body', 'sasole-boots'], ['crew.sasole-seated', 'crew.name-tag-hidden']),
  seam('beef:footwell-pedals', ['supported-footwell', 'rudder-pedals'], ['supports.footwell', 'controls.pedals-mounted']),
  seam('beef:door-threshold-ramp', ['cargo-door-leaf', 'cargo-threshold', 'cargo-ramp'], ['door.real-overlap', 'door.real-egress-clearance']),
  seam('beef:cargo-aperture-inside-out', ['cargo-door-leaf', 'cargo-threshold', 'cargo-ramp'], ['door.inside-out-aperture']),
  seam('beef:cargo-ramp-sill-traversal', ['cargo-threshold', 'cargo-ramp', 'cargo-door-frame'], ['traversal.crouched-ramp-sill']),
  seam('beef:closed-shell-side', ['side-shell', 'rolled-hull', 'cargo-door-leaf'], ['collision.side-underwing']),
  seam('beef:closed-shell-nose-tail', ['nose-shell', 'tail-shell'], ['collision.nose-tail']),
  seam('beef:controls-extreme', ['pilot-yoke', 'copilot-yoke', 'engine-quadrant', 'rudder-pedals', 'engine-levers', 'flap-lever'], ['controls.beef-full-extreme', 'controls.intended-yoke-joins']),
  seam('enola:windshield-shell-opening', ['windshield-pane', 'windshield-frames'], ['aperture.windshield', 'glazing.exact-pane']),
  seam('enola:side-panes-lower-forward-shell-clear', ['side-window-panes'], ['aperture.side-panes', 'glazing.exact-pane']),
  seam('enola:side-pane-frames-nose-sector', ['side-window-panes', 'windshield-frames'], ['glazing.side-frame-fit']),
  seam('enola:roof-dome-annuli-no-holes', ['roof-annuli'], ['glazing.roof-annuli-fit']),
  seam('enola:waist-glazing-annuli-no-holes', ['waist-annuli'], ['glazing.waist-annuli-fit']),
  seam('enola:panel-load-path', ['instrument-panel-shell', 'instrument-face', 'panel-supports'], ['supports.panel']),
  seam('enola:quadrant-load-path', ['throttle-quadrant', 'quadrant-supports'], ['supports.quadrant']),
  seam('enola:pedals-mounted-animated', ['rudder-pedals'], ['controls.enola-pedals']),
  seam('enola:yokes-panel-clear-full-controls', ['pilot-yoke', 'copilot-yoke', 'instrument-panel-shell'], ['controls.enola-yokes', 'controls.intended-yoke-joins']),
  seam('enola:four-throttles-animated', ['throttle-levers'], ['controls.enola-throttles']),
  seam('enola:sasole-seat-body-boots-pedals-clear', ['sasole-seat', 'sasole-body', 'sasole-boots', 'rudder-pedals'], ['crew.sasole-seated', 'crew.dynamic-contacts']),
  seam('enola:irish-nav-table-boots-clear', ['irish-body', 'irish-boots', 'nav-table'], ['crew.irish-seated', 'crew.nav-clearance']),
  seam('enola:dynamic-seated-contacts', ['sasole-boots', 'irish-boots', 'seat-pans'], ['crew.dynamic-contacts']),
  seam('enola:crew-door-closed', ['crew-door-leaf', 'crew-door-frame'], ['door.closed']),
  seam('enola:crew-door-open-ladder-sill-route', ['crew-door-leaf', 'crew-door-frame', 'crew-threshold', 'boarding-ladder'], ['door.open-route', 'door.real-overlap', 'door.real-egress-clearance']),
  seam('enola:shell-side-collision', ['side-shell-panel'], ['collision.enola-side']),
  seam('enola:belly-closed-collision', ['belly-shell', 'bomb-bay-edges'], ['collision.enola-belly-closed']),
  seam('enola:bomb-bay-open-stand-under', ['bomb-bay-edges', 'bomb-bay-leaves'], ['bomb-bay.open-stand-under']),
  seam('enola:bomb-leaves-open-clear', ['bomb-bay-leaves'], ['bomb-bay.leaf-clearance']),
  seam('enola:bombardier-nose-glazing', ['bombardier-pane', 'nose-glazing-frame'], ['glazing.bombardier']),
  seam('enola:rear-gun-model-reticle-tracer-parity', ['rear-gun-trunnions', 'rear-gun-barrels', 'gun-tracer'], ['gun.public-toggle', 'gun.model-camera-reticle-tracer']),
  seam('enola:rear-gunner-hands-grips', ['rear-gunner-hands', 'rear-gun-grips'], ['gun.hand-grip-contact']),
  seam('enola:rear-gunner-body-seat-turret', ['rear-gunner-body', 'rear-gun-seat', 'rear-gun-trunnions'], ['gun.body-seat-clearance']),
  seam('enola:rear-gun-manned-camera-unoccluded', ['rear-gun-trunnions', 'rear-gun-barrels'], ['gun.public-camera', 'gun.head-hidden', 'gun.reticle-visible']),
  seam('enola:rear-gun-fairing-tail-clear', ['rear-gun-fairing', 'aft-tail-shell'], ['gun.fairing-tail-clearance']),
  seam('enola:rear-turret-glazing-clear', ['rear-turret-pane', 'rear-turret-frames'], ['glazing.rear-turret']),
  seam('enola:nose-art-pinup-port-ready', ['pinup-port'], ['art.ready-four', 'art.pinup-port']),
  seam('enola:nose-art-pinup-starboard-ready', ['pinup-starboard'], ['art.ready-four', 'art.pinup-starboard']),
  seam('enola:nose-art-name-port-ready', ['name-port'], ['art.ready-four', 'art.name-port']),
  seam('enola:nose-art-name-starboard-ready', ['name-starboard'], ['art.ready-four', 'art.name-starboard']),
].map((policy) => [policy.id, policy])));

const rawBinding = (measurement, comparator, threshold, unit) => Object.freeze({
  measurement, comparator, threshold, unit,
});
const gte = (measurement, threshold, unit = 'count') => rawBinding(measurement, 'gte', threshold, unit);
const lte = (measurement, threshold, unit = 'count') => rawBinding(measurement, 'lte', threshold, unit);
const eq = (measurement, threshold, unit = 'count') => rawBinding(measurement, 'eq', threshold, unit);
const semanticGate = (id, ...bindings) => Object.freeze({
  id,
  bindings: Object.freeze(bindings),
});
const apertureGate = (id, key, expectedPaneCount = 1) => semanticGate(id,
  eq(`aperture.${key}.exact-pane-count`, expectedPaneCount),
  gte(`aperture.${key}.transparent-pane-ratio`, 1, 'ratio'),
  gte(`aperture.${key}.pane-first-hit-ratio`, 0.6, 'ratio'),
  gte(`aperture.${key}.clear-beyond-ratio`, 0.6, 'ratio'),
  gte(`aperture.${key}.frame-hit-ratio`, 0.75, 'ratio'),
  lte(`aperture.${key}.frame-max-gap-m`, 0.08, 'metres'),
);

/**
 * Contract-owned semantic thresholds. The page adapter records only the raw
 * quantities named here; it cannot supply its own `passed`, `minimum`, or
 * comparator. This keeps a cover declaration executable without trusting the
 * producer to grade itself.
 */
export const COCKPIT_VISUAL_SEMANTIC_GATE_POLICIES = Object.freeze(Object.fromEntries([
  apertureGate('aperture.port', 'port'),
  apertureGate('aperture.side-panes', 'side-panes', 2),
  apertureGate('aperture.starboard', 'starboard'),
  apertureGate('aperture.windshield', 'windshield'),
  semanticGate('art.name-port',
    eq('art.name-port.role-match', 1, 'boolean'),
    eq('art.name-port.side-sign', 1, 'sign'),
    eq('art.name-port.visible-textured-owner-count', 1)),
  semanticGate('art.name-starboard',
    eq('art.name-starboard.role-match', 1, 'boolean'),
    eq('art.name-starboard.side-sign', -1, 'sign'),
    eq('art.name-starboard.visible-textured-owner-count', 1)),
  semanticGate('art.pinup-port',
    eq('art.pinup-port.role-match', 1, 'boolean'),
    eq('art.pinup-port.side-sign', 1, 'sign'),
    eq('art.pinup-port.visible-textured-owner-count', 1)),
  semanticGate('art.pinup-starboard',
    eq('art.pinup-starboard.role-match', 1, 'boolean'),
    eq('art.pinup-starboard.side-sign', -1, 'sign'),
    eq('art.pinup-starboard.visible-textured-owner-count', 1)),
  semanticGate('art.ready-four',
    eq('art.ready', 1, 'boolean'), eq('art.load-error-count', 0),
    eq('art.real-artwork-count', 4), eq('art.paired-side-count', 2),
    eq('art.overlap-count', 0), gte('art.minimum-gap-m', 0.0001, 'metres')),
  semanticGate('bomb-bay.leaf-clearance',
    gte('bomb-bay.open-fraction', 0.95, 'ratio'),
    lte('bomb-bay.leaf-shell-overlap-m3', 0.0001, 'cubic-metres')),
  semanticGate('bomb-bay.open-stand-under',
    eq('bomb-bay.public-open', 1, 'boolean'),
    gte('bomb-bay.open-fraction', 0.95, 'ratio'),
    gte('bomb-bay.capsule-clearance-m', 0.25, 'metres')),
  semanticGate('camera.pilot',
    eq('camera.public-identity', 1, 'boolean'), eq('camera.phase-match', 1, 'boolean'),
    eq('camera.in-cockpit', 1, 'boolean'), eq('camera.manager-cockpit-view', 1, 'boolean'),
    lte('camera.pilot-eye-distance-m', 0.2, 'metres')),
  semanticGate('camera.pilot-port',
    eq('camera.public-identity', 1, 'boolean'), eq('camera.phase-match', 1, 'boolean'),
    eq('camera.in-cockpit', 1, 'boolean'), eq('camera.manager-cockpit-view', 1, 'boolean'),
    gte('camera.port-look-yaw-rad', 1, 'radians')),
  semanticGate('camera.pilot-starboard',
    eq('camera.public-identity', 1, 'boolean'), eq('camera.phase-match', 1, 'boolean'),
    eq('camera.in-cockpit', 1, 'boolean'), eq('camera.manager-cockpit-view', 1, 'boolean'),
    lte('camera.starboard-look-yaw-rad', -0.9, 'radians')),
  semanticGate('collision.enola-belly-closed',
    eq('collision.enola-belly-bay-closed', 1, 'boolean'),
    gte('collision.enola-belly-capsule-clearance-m', 0.25, 'metres'),
    eq('collision.enola-belly-intrusion-count', 0)),
  semanticGate('collision.enola-side',
    gte('collision.enola-side-capsule-clearance-m', 0.25, 'metres'),
    eq('collision.enola-side-intrusion-count', 0)),
  semanticGate('collision.nose-tail',
    gte('collision.beef-nose-z-m', 5.65, 'metres'),
    lte('collision.beef-tail-z-m', -7.35, 'metres')),
  semanticGate('collision.side-underwing',
    gte('collision.beef-side-abs-x-m', 1.23, 'metres'),
    gte('collision.beef-underwing-progress-m', 9.3, 'metres'),
    lte('collision.beef-underwing-ground-delta-m', 0.002, 'metres')),
  semanticGate('controls.beef-full-extreme',
    eq('controls.beef.engine-lever-count', 6),
    lte('controls.beef.max-transform-error', 0.003, 'metres-radians')),
  semanticGate('controls.enola-pedals',
    eq('controls.enola.pedal-count', 4),
    lte('controls.enola.max-pedal-transform-error', 0.003, 'metres-radians')),
  semanticGate('controls.enola-throttles',
    eq('controls.enola.throttle-count', 4),
    lte('controls.enola.max-throttle-transform-error', 0.003, 'radians')),
  semanticGate('controls.enola-yokes',
    eq('controls.enola.yoke-count', 2),
    lte('controls.enola.max-yoke-transform-error', 0.003, 'radians')),
  semanticGate('controls.intended-yoke-joins',
    eq('controls.intended-yoke-join-count', 2),
    lte('controls.intended-yoke-maximum-join-gap-m', 0.003, 'metres'),
    eq('controls.unintended-intrusion-count', 0),
    gte('controls.movable-clearance-m', 0.02, 'metres')),
  semanticGate('controls.neutral', lte('controls.max-axis-error', 0.02, 'ratio')),
  semanticGate('controls.pedals-mounted',
    eq('controls.beef.pedal-count', 2),
    lte('controls.beef.pedal-mount-gap-m', 0.002, 'metres')),
  semanticGate('crew.dynamic-contacts',
    lte('crew.maximum-seat-contact-gap-m', 0.08, 'metres'),
    gte('crew.minimum-boot-clearance-m', -0.002, 'metres')),
  semanticGate('crew.irish-seated',
    eq('crew.irish-seat-parent-match', 1, 'boolean'),
    eq('crew.irish-name-tag-hidden', 1, 'boolean')),
  semanticGate('crew.name-tag-hidden',
    eq('crew.sasole-name-tag-count', 1),
    eq('crew.sasole-name-tag-hidden', 1, 'boolean'),
    eq('crew.sasole-name-tag-text-match', 1, 'boolean')),
  semanticGate('crew.nav-clearance', gte('crew.irish-nav-clearance-m', 0.02, 'metres')),
  semanticGate('crew.sasole-seated',
    eq('crew.sasole-seat-parent-match', 1, 'boolean'),
    lte('crew.sasole-seat-contact-gap-m', 0.08, 'metres')),
  semanticGate('door.closed',
    lte('door.closed-rotation-error-rad', 0.002, 'radians'),
    lte('door.closed-seam-max-gap-m', 0.08, 'metres'),
    eq('door.closed-leaf-shell-intrusion-count', 0)),
  semanticGate('door.inside-out-aperture',
    gte('door.open-fraction', 0.95, 'ratio'),
    gte('door.inside-out-clear-ray-ratio', 0.75, 'ratio')),
  semanticGate('door.open-route',
    gte('door.open-fraction', 0.95, 'ratio'), eq('door.egress-deployed', 1, 'boolean'),
    gte('door.route-width-m', 0.4, 'metres'), gte('door.route-height-m', 0.6, 'metres')),
  semanticGate('door.real-egress-clearance', gte('door.capsule-route-clearance-m', 0.02, 'metres')),
  semanticGate('door.real-overlap',
    eq('door.open-leaf-shell-intrusion-count', 0),
    eq('door.swept-shell-intrusion-count', 0),
    gte('door.sweep-sample-count', 257),
    lte('door.shell-maximum-penetration-m', 0.00001, 'metres')),
  semanticGate('glazing.bombardier',
    eq('glazing.bombardier.exact-pane-count', 1),
    gte('glazing.bombardier.transparent-pane-ratio', 1, 'ratio'),
    gte('glazing.bombardier.clear-beyond-ratio', 0.6, 'ratio'),
    lte('glazing.bombardier.frame-max-gap-m', 0.08, 'metres')),
  semanticGate('glazing.exact-pane',
    eq('glazing.exact-pane-owner-match', 1, 'boolean'),
    gte('glazing.transparent-material-ratio', 1, 'ratio'),
    gte('glazing.minimum-opacity', 0.05, 'ratio'),
    lte('glazing.maximum-opacity', 0.65, 'ratio'),
    lte('glazing.maximum-thickness-m', 0.08, 'metres')),
  semanticGate('glazing.rear-turret',
    eq('glazing.rear-turret.exact-pane-count', 1),
    gte('glazing.rear-turret.transparent-pane-ratio', 1, 'ratio'),
    gte('glazing.rear-turret.clear-beyond-ratio', 0.6, 'ratio'),
    lte('glazing.rear-turret.frame-max-gap-m', 0.08, 'metres')),
  semanticGate('glazing.roof-annuli-fit',
    eq('glazing.roof-annuli-count', 2),
    eq('glazing.roof-annuli-exact-pane-count', 2),
    eq('glazing.roof-annuli-transparent-pane-count', 2),
    eq('glazing.roof-annuli-centre-pane-hit-count', 2),
    gte('glazing.roof-annuli-surface-coverage-ratio', 1, 'ratio'),
    gte('glazing.roof-annuli-pane-coverage-ratio', 0.12, 'ratio'),
    eq('glazing.roof-annuli-naked-sample-count', 0)),
  semanticGate('glazing.side-frame-fit',
    eq('glazing.side-frame-pane-count', 2),
    lte('glazing.side-frame-max-gap-m', 0.08, 'metres')),
  semanticGate('glazing.waist-annuli-fit',
    eq('glazing.waist-annuli-count', 2),
    eq('glazing.waist-annuli-exact-pane-count', 2),
    eq('glazing.waist-annuli-transparent-pane-count', 2),
    eq('glazing.waist-annuli-centre-pane-hit-count', 2),
    gte('glazing.waist-annuli-surface-coverage-ratio', 1, 'ratio'),
    gte('glazing.waist-annuli-pane-coverage-ratio', 0.12, 'ratio'),
    eq('glazing.waist-annuli-naked-sample-count', 0)),
  semanticGate('gun.body-seat-clearance',
    lte('gun.body-seat-contact-gap-m', 0.08, 'metres'),
    gte('gun.body-turret-clearance-m', 0.02, 'metres')),
  semanticGate('gun.fairing-tail-clearance', gte('gun.fairing-tail-clearance-m', 0.02, 'metres')),
  semanticGate('gun.hand-grip-contact', lte('gun.hand-grip-maximum-gap-m', 0.04, 'metres')),
  semanticGate('gun.head-hidden', eq('gun.shubes-neck-hidden', 1, 'boolean')),
  semanticGate('gun.model-camera-reticle-tracer',
    lte('gun.camera-eye-distance-m', 0.02, 'metres'),
    gte('gun.camera-aim-dot', 0.995, 'dot-product'),
    lte('gun.muzzle-tracer-distance-m', 0.02, 'metres'),
    gte('gun.tracer-aim-dot', 0.99, 'dot-product')),
  semanticGate('gun.public-camera',
    eq('gun.public-camera-identity', 1, 'boolean'),
    lte('gun.camera-eye-distance-m', 0.02, 'metres')),
  semanticGate('gun.public-toggle',
    eq('gun.manned', 1, 'boolean'), eq('gun.airborne', 1, 'boolean'),
    gte('gun.shots-fired-delta', 1), gte('gun.tracer-fired-delta', 1),
    gte('gun.live-tracer-count', 1)),
  semanticGate('gun.reticle-visible',
    eq('gun.reticle-visible', 1, 'boolean'),
    lte('gun.reticle-centre-error-px', 2, 'pixels')),
  semanticGate('supports.footwell',
    eq('supports.footwell.member-count', 4),
    eq('supports.footwell.complete-member-count', 4),
    lte('supports.footwell.maximum-endpoint-gap-m', 0.03, 'metres')),
  semanticGate('supports.panel',
    eq('supports.panel.member-count', 2),
    eq('supports.panel.complete-member-count', 2),
    lte('supports.panel.maximum-endpoint-gap-m', 0.03, 'metres')),
  semanticGate('supports.quadrant',
    eq('supports.quadrant.member-count', 2),
    eq('supports.quadrant.complete-member-count', 2),
    lte('supports.quadrant.maximum-endpoint-gap-m', 0.03, 'metres')),
  semanticGate('traversal.crouched-ramp-sill',
    eq('traversal.crossed-sill', 1, 'boolean'),
    lte('traversal.maximum-horizontal-step-m', 0.03, 'metres'),
    lte('traversal.inside-floor-error-m', 0.002, 'metres'),
    gte('traversal.crouched-head-margin-m', 0.4, 'metres')),
].map((policy) => [policy.id, policy])));

const shot = ({ id, scene, page, covers, owners, pose }) => Object.freeze({
  id,
  scene,
  page,
  file: `${id}.png`,
  covers: Object.freeze(covers),
  owners: Object.freeze(owners),
  pose: Object.freeze(pose),
});

/**
 * The independent visual proof surface. Every entry is a real runtime view;
 * `pose` is interpreted only against window.__beefrun/window.__enolaSquatch.
 * Colours are ID-mask colours, never production materials.
 */
export const COCKPIT_VISUAL_EVIDENCE_SHOTS = Object.freeze([
  shot({
    id: 'beef-forward-neutral', scene: 'beefrun',
    page: 'beefrun.html?preview=1&checkpoint=takeoff',
    covers: ['beef:forward-gauges-panel-windshield-yoke'],
    pose: { view: 'pilot-forward', controls: 'neutral', phase: 'lineup' },
    owners: [
      owner('beefrun', 'windshield-pane', '#ff2d55', 600),
      owner('beefrun', 'windshield-frames', '#00d4ff', 500),
      owner('beefrun', 'instrument-panel-shell', '#ffcc00', 700),
      owner('beefrun', 'gauges', '#65ff65', 400),
      owner('beefrun', 'pilot-yoke', '#bf5af2', 240),
    ],
  }),
  shot({
    id: 'beef-port-aperture', scene: 'beefrun',
    page: 'beefrun.html?preview=1&checkpoint=takeoff',
    covers: ['beef:port-aperture'],
    pose: { view: 'pilot-port', controls: 'neutral', phase: 'lineup' },
    owners: [
      owner('beefrun', 'port-window-pane', '#ff2d55', 500),
      owner('beefrun', 'port-aperture-shell', '#00d4ff', 500),
      owner('beefrun', 'port-frame', '#ffcc00', 200),
    ],
  }),
  shot({
    id: 'beef-starboard-aperture-sasole', scene: 'beefrun',
    page: 'beefrun.html?preview=1&checkpoint=takeoff',
    covers: ['beef:starboard-aperture', 'beef:sasole', 'beef:footwell-pedals'],
    pose: { view: 'pilot-starboard-down', controls: 'neutral', phase: 'lineup' },
    owners: [
      owner('beefrun', 'starboard-window-pane', '#ff2d55', 400),
      owner('beefrun', 'starboard-aperture-shell', '#00d4ff', 400),
      owner('beefrun', 'sasole-body', '#ffcc00', 500),
      owner('beefrun', 'sasole-boots', '#65ff65', 120),
      owner('beefrun', 'supported-footwell', '#bf5af2', 180),
      owner('beefrun', 'rudder-pedals', '#ff9f0a', 120),
    ],
  }),
  shot({
    id: 'beef-cargo-egress-open', scene: 'beefrun',
    page: 'beefrun.html?preview=1&checkpoint=takeoff',
    covers: ['beef:door-threshold-ramp'],
    pose: { view: 'exterior-cargo-door', cargoDoor: 'open', phase: 'lineup' },
    owners: [
      owner('beefrun', 'cargo-door-leaf', '#ff2d55', 500),
      owner('beefrun', 'cargo-threshold', '#00d4ff', 200),
      owner('beefrun', 'cargo-ramp', '#ffcc00', 700),
    ],
  }),
  shot({
    id: 'beef-cargo-egress-inside-out', scene: 'beefrun',
    page: 'beefrun.html?preview=1&checkpoint=takeoff',
    covers: ['beef:cargo-aperture-inside-out'],
    pose: { view: 'interior-cargo-door', cargoDoor: 'open', phase: 'lineup' },
    owners: [
      owner('beefrun', 'cargo-door-leaf', '#ff2d55', 350),
      owner('beefrun', 'cargo-threshold', '#00d4ff', 180),
      owner('beefrun', 'cargo-ramp', '#ffcc00', 500),
    ],
  }),
  shot({
    id: 'beef-cargo-ramp-traversal', scene: 'beefrun',
    page: 'beefrun.html?preview=1&checkpoint=takeoff',
    covers: ['beef:cargo-ramp-sill-traversal'],
    pose: { view: 'exterior-cargo-traversal', cargoDoor: 'open', traversal: 'crouched-ramp-sill', phase: 'lineup' },
    owners: [
      owner('beefrun', 'cargo-threshold', '#ff2d55', 180),
      owner('beefrun', 'cargo-ramp', '#00d4ff', 500),
      owner('beefrun', 'cargo-door-frame', '#ffcc00', 100),
    ],
  }),
  shot({
    id: 'beef-closed-shell-side', scene: 'beefrun',
    page: 'beefrun.html?preview=1&checkpoint=takeoff',
    covers: ['beef:closed-shell-side'],
    pose: { view: 'exterior-shell-side', cargoDoor: 'closed', collisionMatrix: 'side-underwing', phase: 'lineup' },
    owners: [
      owner('beefrun', 'side-shell', '#ff2d55', 1200),
      owner('beefrun', 'rolled-hull', '#00d4ff', 800),
      owner('beefrun', 'cargo-door-leaf', '#ffcc00', 350),
    ],
  }),
  shot({
    id: 'beef-closed-shell-nose-tail', scene: 'beefrun',
    page: 'beefrun.html?preview=1&checkpoint=takeoff',
    covers: ['beef:closed-shell-nose-tail'],
    pose: { view: 'exterior-shell-nose-tail', cargoDoor: 'closed', collisionMatrix: 'nose-tail', phase: 'lineup' },
    owners: [
      owner('beefrun', 'nose-shell', '#ff2d55', 800),
      owner('beefrun', 'tail-shell', '#00d4ff', 600),
    ],
  }),
  shot({
    id: 'beef-controls-extreme', scene: 'beefrun',
    page: 'beefrun.html?preview=1&checkpoint=takeoff',
    covers: ['beef:controls-extreme'],
    pose: {
      view: 'pilot-controls', controls: 'full-extreme', phase: 'lineup',
      axes: { pitch: 1, roll: 1, yaw: 1, throttleL: 1, throttleR: 1, flaps: 1 },
    },
    owners: [
      owner('beefrun', 'pilot-yoke', '#ff2d55', 240),
      owner('beefrun', 'copilot-yoke', '#00d4ff', 240),
      owner('beefrun', 'engine-quadrant', '#ffcc00', 120),
      owner('beefrun', 'rudder-pedals', '#65ff65', 120),
      owner('beefrun', 'engine-levers', '#bf5af2', 160),
      owner('beefrun', 'flap-lever', '#ff9f0a', 80),
    ],
  }),
  shot({
    id: 'enola-pilot-forward', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:windshield-shell-opening', 'enola:panel-load-path'],
    pose: { view: 'pilot-forward', controls: 'neutral', phase: 'preflight' },
    owners: [
      owner('enola', 'windshield-pane', '#ff2d55', 700),
      owner('enola', 'windshield-frames', '#00d4ff', 500),
      owner('enola', 'instrument-panel-shell', '#ffcc00', 700),
      owner('enola', 'instrument-face', '#65ff65', 400),
      owner('enola', 'panel-supports', '#bf5af2', 160),
      owner('enola', 'pilot-yoke', '#ff9f0a', 240),
    ],
  }),
  shot({
    id: 'enola-side-glazing', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:side-panes-lower-forward-shell-clear', 'enola:side-pane-frames-nose-sector'],
    pose: { view: 'cockpit-side-glazing', controls: 'neutral', phase: 'preflight' },
    owners: [
      owner('enola', 'side-window-panes', '#ff2d55', 700),
      owner('enola', 'windshield-frames', '#00d4ff', 350),
    ],
  }),
  shot({
    id: 'enola-dome-waist-annuli', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:roof-dome-annuli-no-holes', 'enola:waist-glazing-annuli-no-holes'],
    pose: { view: 'exterior-dome-waist', controls: 'neutral', phase: 'preflight' },
    owners: [
      owner('enola', 'roof-annuli', '#ff2d55', 350),
      owner('enola', 'waist-annuli', '#00d4ff', 350),
    ],
  }),
  shot({
    id: 'enola-controls-extreme', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:quadrant-load-path', 'enola:pedals-mounted-animated',
      'enola:yokes-panel-clear-full-controls', 'enola:four-throttles-animated'],
    pose: { view: 'pilot-controls', controls: 'full-extreme', phase: 'preflight',
      axes: { pitch: 1, roll: 1, yaw: 1, throttleL: 1, throttleR: 1, flaps: 1 } },
    owners: [
      owner('enola', 'pilot-yoke', '#ff2d55', 220),
      owner('enola', 'copilot-yoke', '#00d4ff', 220),
      owner('enola', 'instrument-panel-shell', '#ffcc00', 500),
      owner('enola', 'throttle-quadrant', '#65ff65', 140),
      owner('enola', 'quadrant-supports', '#bf5af2', 100),
      owner('enola', 'throttle-levers', '#ff9f0a', 180),
      owner('enola', 'rudder-pedals', '#32d6ff', 150),
    ],
  }),
  shot({
    id: 'enola-sasole-seat', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:sasole-seat-body-boots-pedals-clear'],
    pose: { view: 'copilot-seat', controls: 'neutral', phase: 'preflight' },
    owners: [
      owner('enola', 'sasole-seat', '#ff2d55', 500),
      owner('enola', 'sasole-body', '#00d4ff', 500),
      owner('enola', 'sasole-boots', '#ffcc00', 120),
      owner('enola', 'rudder-pedals', '#65ff65', 120),
    ],
  }),
  shot({
    id: 'enola-navigator-contacts', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:irish-nav-table-boots-clear', 'enola:dynamic-seated-contacts'],
    pose: { view: 'navigator-table', controls: 'neutral', phase: 'preflight' },
    owners: [
      owner('enola', 'irish-body', '#ff2d55', 450),
      owner('enola', 'irish-boots', '#00d4ff', 120),
      owner('enola', 'nav-table', '#ffcc00', 600),
      owner('enola', 'sasole-boots', '#65ff65', 100),
      owner('enola', 'seat-pans', '#bf5af2', 250),
    ],
  }),
  shot({
    id: 'enola-crew-door-closed', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:crew-door-closed'],
    pose: { view: 'exterior-crew-door', crewDoor: 'closed', phase: 'preflight' },
    owners: [
      owner('enola', 'crew-door-leaf', '#ff2d55', 500),
      owner('enola', 'crew-door-frame', '#00d4ff', 250),
    ],
  }),
  shot({
    id: 'enola-crew-egress-open', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:crew-door-open-ladder-sill-route'],
    pose: { view: 'exterior-crew-door', crewDoor: 'open', phase: 'walkaround' },
    owners: [
      owner('enola', 'crew-door-leaf', '#ff2d55', 500),
      owner('enola', 'crew-door-frame', '#00d4ff', 250),
      owner('enola', 'crew-threshold', '#ffcc00', 120),
      owner('enola', 'boarding-ladder', '#65ff65', 350),
    ],
  }),
  shot({
    id: 'enola-shell-side', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:shell-side-collision'],
    pose: { view: 'exterior-shell-side', collisionMatrix: 'enola-side', phase: 'preflight' },
    owners: [
      owner('enola', 'side-shell-panel', '#ff2d55', 900),
      owner('enola', 'waist-annuli', '#00d4ff', 250),
    ],
  }),
  shot({
    id: 'enola-belly-closed', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:belly-closed-collision'],
    pose: { view: 'exterior-belly', bombBay: 'closed', collisionMatrix: 'enola-belly', phase: 'preflight' },
    owners: [
      owner('enola', 'belly-shell', '#ff2d55', 900),
      owner('enola', 'bomb-bay-edges', '#00d4ff', 300),
    ],
  }),
  shot({
    id: 'enola-bomb-bay-open', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=release',
    covers: ['enola:bomb-bay-open-stand-under', 'enola:bomb-leaves-open-clear'],
    pose: { view: 'exterior-bomb-bay', bombBay: 'open', phase: 'release' },
    owners: [
      owner('enola', 'bomb-bay-edges', '#ff2d55', 300),
      owner('enola', 'bomb-bay-leaves', '#00d4ff', 900),
    ],
  }),
  shot({
    id: 'enola-bombardier-glazing', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:bombardier-nose-glazing'],
    pose: { view: 'exterior-bombardier-nose', phase: 'preflight' },
    owners: [
      owner('enola', 'bombardier-pane', '#ff2d55', 700),
      owner('enola', 'nose-glazing-frame', '#00d4ff', 300),
    ],
  }),
  shot({
    id: 'enola-rear-gun-neutral', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=defense',
    covers: ['enola:rear-gun-model-reticle-tracer-parity', 'enola:rear-gunner-hands-grips',
      'enola:rear-gunner-body-seat-turret', 'enola:rear-gun-manned-camera-unoccluded',
      'enola:rear-turret-glazing-clear'],
    pose: { view: 'rear-gun', gun: 'neutral', phase: 'defense', fireGun: true },
    owners: [
      owner('enola', 'rear-gun-trunnions', '#ff2d55', 180),
      owner('enola', 'rear-gun-barrels', '#00d4ff', 220),
      owner('enola', 'rear-gunner-hands', '#ffcc00', 120),
      owner('enola', 'rear-gun-grips', '#65ff65', 120),
      owner('enola', 'rear-gunner-body', '#bf5af2', 400),
      owner('enola', 'rear-gun-seat', '#ff9f0a', 180),
      owner('enola', 'rear-turret-pane', '#32d6ff', 500),
      owner('enola', 'rear-turret-frames', '#ff375f', 300),
      owner('enola', 'gun-tracer', '#7dff73', 100),
    ],
  }),
  shot({
    id: 'enola-rear-gun-left-down-limit', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=defense',
    covers: ['enola:rear-gun-model-reticle-tracer-parity', 'enola:rear-gun-fairing-tail-clear'],
    pose: { view: 'rear-gun-exterior', gun: 'left-down-limit', phase: 'defense', fireGun: true },
    owners: [
      owner('enola', 'rear-gun-trunnions', '#ff2d55', 180),
      owner('enola', 'rear-gun-barrels', '#00d4ff', 220),
      owner('enola', 'rear-gun-fairing', '#ffcc00', 500),
      owner('enola', 'aft-tail-shell', '#65ff65', 700),
      owner('enola', 'gun-tracer', '#bf5af2', 100),
    ],
  }),
  shot({
    id: 'enola-rear-gun-right-up-limit', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=defense',
    covers: ['enola:rear-gun-model-reticle-tracer-parity', 'enola:rear-gun-fairing-tail-clear'],
    pose: { view: 'rear-gun-exterior', gun: 'right-up-limit', phase: 'defense', fireGun: true },
    owners: [
      owner('enola', 'rear-gun-trunnions', '#ff2d55', 180),
      owner('enola', 'rear-gun-barrels', '#00d4ff', 220),
      owner('enola', 'rear-gun-fairing', '#ffcc00', 500),
      owner('enola', 'aft-tail-shell', '#65ff65', 700),
      owner('enola', 'gun-tracer', '#bf5af2', 100),
    ],
  }),
  shot({
    id: 'enola-nose-art-port', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:nose-art-pinup-port-ready', 'enola:nose-art-name-port-ready'],
    pose: { view: 'exterior-nose-art-port', phase: 'preflight', awaitArt: true },
    owners: [
      owner('enola', 'pinup-port', '#ff2d55', 700),
      owner('enola', 'name-port', '#00d4ff', 500),
    ],
  }),
  shot({
    id: 'enola-nose-art-starboard', scene: 'enola',
    page: 'enolasquatch.html?preview=1&checkpoint=preflight',
    covers: ['enola:nose-art-pinup-starboard-ready', 'enola:nose-art-name-starboard-ready'],
    pose: { view: 'exterior-nose-art-starboard', phase: 'preflight', awaitArt: true },
    owners: [
      owner('enola', 'pinup-starboard', '#ff2d55', 700),
      owner('enola', 'name-starboard', '#00d4ff', 500),
    ],
  }),
]);

export function parseCockpitVisualEvidenceRun(args = []) {
  const values = { out: 'docs/validation/2026-08-12/cockpit-visual' };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--label', '--port', '--out'].includes(flag)) {
      throw new Error(`unknown cockpit evidence argument: ${flag}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    values[flag.slice(2)] = value;
    index += 1;
  }
  if (!values.label) throw new Error('cockpit evidence requires --label');
  if (!SAFE_LABEL.test(values.label)) throw new Error(`unsafe evidence label: ${values.label}`);
  if (values.port == null) throw new Error('cockpit evidence requires an explicitly granted --port');
  const port = Number(values.port);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`cockpit evidence requires an unprivileged loopback port: ${values.port}`);
  }
  const outputDir = resolveEvidenceOutputRoot(values.out, OUTPUT_WORKSPACE_ROOT);
  if (outputDir === OUTPUT_WORKSPACE_ROOT
      || !outputDir.startsWith(`${OUTPUT_WORKSPACE_ROOT}${path.sep}`)) {
    throw new Error(`cockpit evidence output must stay inside the workspace: ${values.out}`);
  }
  return Object.freeze({
    label: values.label,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    outputDir,
    workspaceRoot: WORKSPACE_ROOT,
  });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableCockpitEvidenceJson(value) {
  return JSON.stringify(stableValue(value));
}

const COCKPIT_VISUAL_EVIDENCE_TOOL_FILES = Object.freeze([
  'tools/capture-cockpit-visual-evidence.mjs',
  'tools/cockpit-visual-evidence-contract.mjs',
  'tools/cockpit-visual-page-api.mjs',
  'tools/cockpit-visual-pixel-proof.mjs',
  'tools/evidence-directory-transaction.mjs',
  'tools/evidence-lifecycle.mjs',
  'tools/evidence-output-transaction.mjs',
  'tools/screenshot-artifact-contract.mjs',
]);

const COCKPIT_VISUAL_EVIDENCE_RUNTIME_FILES = Object.freeze([
  'beefrun.html',
  'enolasquatch.html',
  'src/beefrun/aircraft.js',
  'src/beefrun/cameras.js',
  'src/beefrun/config.js',
  'src/beefrun/main.js',
  'src/beefrun/mission.js',
  'src/beefrun/npc.js',
  'src/enolasquatch/config.js',
  'src/enolasquatch/crew.js',
  'src/enolasquatch/main.js',
  'src/enolasquatch/mission/MissionController.js',
  'src/enolasquatch/scenes/EnolaSquatch.js',
  'src/enolasquatch/systems/GunnerStation.js',
]);

const COCKPIT_TEXT_SOURCE_EXTENSIONS = new Set([
  '.css', '.html', '.js', '.json', '.mjs',
]);
const COCKPIT_SERVABLE_SOURCE_EXTENSIONS = new Set([
  '.bin', '.css', '.gif', '.glb', '.gltf', '.html', '.jpeg', '.jpg', '.js',
  '.json', '.mjs', '.mp3', '.ogg', '.otf', '.png', '.svg', '.ttf', '.wav',
  '.webp', '.woff', '.woff2',
]);
const COCKPIT_DYNAMIC_RESOURCE_REASONS = Object.freeze({
  'assets/art/logo-crest.png': Object.freeze([
    'Beef aircraft TextureLoader', 'Enola crest.round manifest selection',
  ]),
  'assets/art/sticker-pinup.png': Object.freeze(['Beef aircraft TextureLoader']),
  'assets/faces/sasole.png': Object.freeze(['Beef Lou and Enola Sasole name-tag portrait']),
  'assets/faces/stove.png': Object.freeze(['Beef Stove name-tag portrait']),
  'assets/faces/irish.png': Object.freeze(['Enola Irish name-tag portrait']),
  'assets/faces/shubes.png': Object.freeze(['Enola Shubes name-tag portrait']),
  'assets/art/enola-squatch-nose-art.webp': Object.freeze(['Enola nose-art TextureLoader']),
  'assets/art/enola-squatch-nose-name.png': Object.freeze(['Enola nose-name TextureLoader']),
  'assets/art/manifest.json': Object.freeze(['Enola crest.round manifest selector']),
  'assets/music/manifest.json': Object.freeze(['Beef radio boot manifest']),
});
const COCKPIT_SOURCE_EXCLUDED_DIRECTORIES = new Set([
  '.git', '.tmp', '.codex', '.agents', 'coverage', 'graphify-out',
  'node_modules', 'test-results',
]);

export function isCockpitServableSourceFile(relativeFile) {
  const normalized = String(relativeFile ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('docs/validation/')) return false;
  const segments = normalized.split('/');
  return !segments.some((segment) => COCKPIT_SOURCE_EXCLUDED_DIRECTORIES.has(segment))
    && COCKPIT_SERVABLE_SOURCE_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase());
}

function cockpitServableSourceFiles(root = WORKSPACE_ROOT) {
  const importMap = new Map();
  const runtimeFiles = new Set();
  const queue = [];
  const enqueue = (file, reason) => {
    const normalized = path.posix.normalize(String(file).replaceAll('\\', '/').replace(/^\/+/, ''));
    if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`cockpit resource closure escaped workspace via ${reason}: ${file}`);
    }
    const segments = normalized.split('/');
    if (segments.some((segment) => COCKPIT_SOURCE_EXCLUDED_DIRECTORIES.has(segment))) {
      throw new Error(`cockpit resource closure entered excluded directory via ${reason}: ${normalized}`);
    }
    const absolute = path.resolve(root, normalized);
    if (!absolute.startsWith(`${root}${path.sep}`) || !fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`cockpit resource closure omitted local dependency via ${reason}: ${normalized}`);
    }
    if (!runtimeFiles.has(normalized)) {
      runtimeFiles.add(normalized);
      if (COCKPIT_TEXT_SOURCE_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase())) queue.push(normalized);
    }
    return normalized;
  };
  const resolveReference = (reference, fromFile, relativeBare = false) => {
    const raw = String(reference ?? '').trim();
    if (!raw || /^(?:data:|blob:|https?:|mailto:|javascript:|#)/i.test(raw)) return null;
    const withoutQuery = raw.split(/[?#]/, 1)[0];
    if (!withoutQuery) return null;
    if (withoutQuery.startsWith('/') || withoutQuery.startsWith('.')) {
      return path.posix.normalize(withoutQuery.startsWith('/')
        ? withoutQuery.slice(1) : path.posix.join(path.posix.dirname(fromFile), withoutQuery));
    }
    if (importMap.has(withoutQuery)) return resolveReference(importMap.get(withoutQuery), fromFile);
    const prefix = [...importMap.keys()].filter((key) => key.endsWith('/') && withoutQuery.startsWith(key))
      .sort((left, right) => right.length - left.length)[0];
    if (prefix) return resolveReference(`${importMap.get(prefix)}${withoutQuery.slice(prefix.length)}`, fromFile);
    return relativeBare ? path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), withoutQuery)) : null;
  };
  const addReference = (reference, fromFile, reason, relativeBare = false) => {
    const resolved = resolveReference(reference, fromFile, relativeBare);
    if (resolved) enqueue(resolved, `${reason} in ${fromFile}`);
  };

  /* Import maps must exist before any bare module specifier is resolved. */
  for (const page of ['beefrun.html', 'enolasquatch.html']) {
    const html = fs.readFileSync(path.resolve(root, page), 'utf8');
    for (const match of html.matchAll(/<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      const parsed = JSON.parse(match[1]);
      for (const [specifier, target] of Object.entries(parsed.imports ?? {})) {
        const documentTarget = String(target).startsWith('.')
          ? `/${path.posix.normalize(path.posix.join(path.posix.dirname(page), target))}` : target;
        importMap.set(specifier, documentTarget);
      }
    }
  }
  for (const file of COCKPIT_VISUAL_EVIDENCE_RUNTIME_FILES) enqueue(file, 'authoritative runtime seed');
  for (const file of Object.keys(COCKPIT_DYNAMIC_RESOURCE_REASONS)) enqueue(file, 'audited dynamic loader');

  for (let index = 0; index < queue.length; index += 1) {
    const file = queue[index];
    const source = fs.readFileSync(path.resolve(root, file), 'utf8');
    const extension = path.posix.extname(file).toLowerCase();
    if (extension === '.html') {
      for (const match of source.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
        addReference(match[1], file, 'HTML resource', true);
      }
    } else if (extension === '.css') {
      for (const match of source.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)|url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        addReference(match[1] ?? match[2], file, 'CSS resource', true);
      }
    } else if (['.js', '.mjs'].includes(extension)) {
      for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)) {
        addReference(match[1], file, 'static module import');
      }
      for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)|\bfetch\s*\(\s*["']([^"']+)["']/g)) {
        addReference(match[1] ?? match[2] ?? match[3], file, 'literal runtime dependency', true);
      }
    }
  }
  return [...new Set([...COCKPIT_VISUAL_EVIDENCE_TOOL_FILES, ...runtimeFiles])].sort();
}

function readSourceIdentity(relativeFile, root = WORKSPACE_ROOT) {
  const absoluteFile = path.resolve(root, relativeFile);
  if (!absoluteFile.startsWith(`${root}${path.sep}`)) {
    throw new Error(`cockpit evidence source escaped workspace: ${relativeFile}`);
  }
  const realRoot = fs.realpathSync(root);
  const realFile = fs.realpathSync(absoluteFile);
  if (realFile === realRoot || !realFile.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`cockpit evidence source symlink escaped workspace: ${relativeFile}`);
  }
  const bytes = fs.readFileSync(absoluteFile);
  const normalized = relativeFile.replaceAll('\\', '/');
  return {
    bytes,
    identity: Object.freeze({
      file: normalized,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      kind: COCKPIT_TEXT_SOURCE_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase())
        ? 'source' : 'runtime-asset',
      reasons: Object.freeze(COCKPIT_DYNAMIC_RESOURCE_REASONS[normalized]
        ? [...COCKPIT_DYNAMIC_RESOURCE_REASONS[normalized]] : ['capture-start source universe']),
    }),
  };
}

export function snapshotCockpitVisualEvidenceSources(root = WORKSPACE_ROOT) {
  const sourceRoot = path.resolve(root);
  const immutableSourceBytes = new Map();
  const servedSources = cockpitServableSourceFiles(sourceRoot).map((file) => {
    const read = readSourceIdentity(file, sourceRoot);
    immutableSourceBytes.set(file, read.bytes);
    return read.identity;
  });
  const byFile = new Map(servedSources.map((entry) => [entry.file, entry]));
  const requireIdentity = (file) => {
    const identity = byFile.get(file);
    if (!identity) throw new Error(`cockpit source universe omitted required file: ${file}`);
    return identity;
  };
  const tools = COCKPIT_VISUAL_EVIDENCE_TOOL_FILES.map(requireIdentity);
  const runtimeSources = COCKPIT_VISUAL_EVIDENCE_RUNTIME_FILES.map(requireIdentity);
  const sourceSnapshotSha256 = createHash('sha256')
    .update(stableCockpitEvidenceJson({ tools, runtimeSources, servedSources }))
    .digest('hex');
  const identity = Object.freeze({
    tools: Object.freeze(tools),
    runtimeSources: Object.freeze(runtimeSources),
    servedSources: Object.freeze(servedSources),
    sourceSnapshotSha256,
  });
  return Object.freeze({ identity, immutableSourceBytes });
}

export function currentCockpitVisualEvidenceSourceIdentities(root = WORKSPACE_ROOT) {
  return snapshotCockpitVisualEvidenceSources(root).identity;
}

export function assertCockpitVisualEvidenceSourcesUnchanged(startSnapshot, root = WORKSPACE_ROOT) {
  const current = currentCockpitVisualEvidenceSourceIdentities(root);
  if (stableCockpitEvidenceJson(startSnapshot) !== stableCockpitEvidenceJson(current)) {
    throw new Error('cockpit evidence source or tool changed during capture');
  }
  return current;
}

function expectedServedFiles(spec) {
  return [
    spec.page.split('?')[0],
    spec.scene === 'beefrun' ? 'src/beefrun/main.js' : 'src/enolasquatch/main.js',
  ];
}

function validSourceIdentity(entry) {
  return typeof entry?.file === 'string' && entry.file.length > 0
    && Number.isSafeInteger(entry?.bytes) && entry.bytes > 0
    && /^[a-f0-9]{64}$/.test(entry?.sha256 ?? '');
}

function snapshotDigest(snapshot) {
  return createHash('sha256').update(stableCockpitEvidenceJson({
    tools: snapshot?.tools,
    runtimeSources: snapshot?.runtimeSources,
    servedSources: snapshot?.servedSources,
  })).digest('hex');
}

function canonicalServedResourceLedger(captures) {
  const observations = (captures ?? []).flatMap((capture) => (
    (capture?.served?.entries ?? []).map((entry) => ({ shotId: capture.id, ...entry }))
  ));
  const signatures = (entries) => new Set(entries.map((entry) => stableCockpitEvidenceJson({
    status: entry.status,
    bytes: entry.bytes,
    sha256: entry.sha256,
  })));
  const group = (field) => {
    const grouped = new Map();
    for (const entry of observations) {
      const key = entry[field];
      if (typeof key !== 'string' || !key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(entry);
    }
    return grouped;
  };
  const conflicts = [];
  for (const [kind, grouped] of [['file', group('file')], ['url', group('url')]]) {
    for (const [key, entries] of grouped) {
      const variants = signatures(entries);
      if (variants.size > 1) conflicts.push(Object.freeze({ kind, key, variants: variants.size }));
    }
  }
  const triples = new Map();
  for (const entry of observations) {
    const key = `${entry.file ?? ''}\0${entry.url ?? ''}\0${entry.resourceType ?? ''}`;
    if (!triples.has(key)) triples.set(key, []);
    triples.get(key).push(entry);
  }
  for (const [key, entries] of triples) {
    const variants = signatures(entries);
    if (variants.size > 1) conflicts.push(Object.freeze({ kind: 'canonical', key, variants: variants.size }));
  }
  const entries = [...triples.values()].map((grouped) => {
    const first = grouped[0];
    return Object.freeze({
      file: first.file,
      url: first.url,
      resourceType: first.resourceType,
      status: first.status,
      bytes: first.bytes,
      sha256: first.sha256,
      shots: Object.freeze([...new Set(grouped.map(({ shotId }) => shotId))].sort()),
    });
  }).sort((left, right) => (
    `${left.file}\0${left.url}\0${left.resourceType}`
      .localeCompare(`${right.file}\0${right.url}\0${right.resourceType}`)
  ));
  return Object.freeze({
    ok: conflicts.length === 0,
    observations: observations.length,
    entries: Object.freeze(entries),
    conflicts: Object.freeze(conflicts),
  });
}

function servedCaptureIsBound(spec, capture, sourceStart) {
  const entries = capture?.served?.entries;
  if (capture?.served?.launchDocument !== `${capture?.baseUrl}/${spec.page}`
      || !Array.isArray(entries) || entries.length < 2
      || !/^[a-f0-9]{64}$/.test(capture?.served?.fingerprint ?? '')
      || capture?.served?.quiescence?.sealed !== true
      || capture?.served?.quiescence?.timedOut !== false
      || capture?.served?.quiescence?.pendingCount !== 0
      || capture?.served?.quiescence?.bodyPendingCount !== 0
      || capture?.served?.quiescence?.failedCount !== 0
      || capture?.served?.quiescence?.requestCount !== capture?.served?.quiescence?.responseCount
      || capture?.served?.quiescence?.requestCount !== capture?.served?.quiescence?.finishedCount) return false;
  const expectedFingerprint = createHash('sha256')
    .update(JSON.stringify(entries)).digest('hex');
  if (capture.served.fingerprint !== expectedFingerprint) return false;
  const sourceByFile = new Map(sourceStart.servedSources.map((entry) => [entry.file, entry]));
  const entriesByFile = new Map(entries.map((entry) => [entry.file, entry]));
  if (!expectedServedFiles(spec).every((file) => {
    const served = entriesByFile.get(file);
    const source = sourceByFile.get(file);
    return served && source && served.bytes === source.bytes && served.sha256 === source.sha256;
  })) return false;
  return entries.every((entry) => {
    const source = sourceByFile.get(entry?.file);
    return (
    typeof entry?.url === 'string' && entry.url.startsWith(`${capture.baseUrl}/`)
    && typeof entry?.file === 'string' && entry.file.length > 0
    && typeof entry?.resourceType === 'string' && entry.resourceType.length > 0
    && Number.isSafeInteger(entry?.status) && entry.status >= 200 && entry.status < 400
    && Number.isSafeInteger(entry?.bytes) && entry.bytes > 0
    && /^[a-f0-9]{64}$/.test(entry?.sha256 ?? '')
    && entry.bytes === entry.captureStartBytes && entry.sha256 === entry.captureStartSha256
    && source && entry.bytes === source.bytes && entry.sha256 === source.sha256
    );
  });
}

export function buildCockpitVisualEvidenceLedger({
  options,
  captures,
  artifactIdentities,
  sourceStart,
  sourceEnd,
  bootstrapProof,
  startedAt,
  completedAt,
}) {
  const shotGates = COCKPIT_VISUAL_EVIDENCE_SHOTS.map((spec, index) => ({
    id: spec.id,
    ...evaluateCockpitVisualShot(spec, captures?.[index], options?.label),
  }));
  const expectedArtifacts = COCKPIT_VISUAL_EVIDENCE_SHOTS.flatMap(({ id }) => [
    `${options?.label}-${id}.png`,
    `${options?.label}-${id}-id-mask.png`,
  ]).sort();
  const actualArtifacts = (artifactIdentities ?? []).map(({ file }) => file).sort();
  const manifestSha256 = createHash('sha256')
    .update(stableCockpitEvidenceJson(COCKPIT_VISUAL_EVIDENCE_SHOTS))
    .digest('hex');
  const servedResources = canonicalServedResourceLedger(captures);
  const checks = {
    schema: COCKPIT_VISUAL_EVIDENCE_SCHEMA === 'squatch-cockpit-visual-evidence/v1',
    identity: typeof options?.label === 'string'
      && options?.baseUrl === `http://127.0.0.1:${options?.port}`,
    completeShotSet: captures?.length === COCKPIT_VISUAL_EVIDENCE_SHOTS.length
      && captures.every((capture, index) => capture?.id === COCKPIT_VISUAL_EVIDENCE_SHOTS[index].id),
    shotGates: shotGates.every(({ ok }) => ok),
    artifactSet: stableCockpitEvidenceJson(actualArtifacts) === stableCockpitEvidenceJson(expectedArtifacts)
      && artifactIdentities.every(validSourceIdentity),
    sourceProvenance: Array.isArray(sourceStart?.tools) && sourceStart.tools.length > 0
      && Array.isArray(sourceStart?.runtimeSources) && sourceStart.runtimeSources.length > 0
      && Array.isArray(sourceStart?.servedSources) && sourceStart.servedSources.length > 0
      && [...sourceStart.tools, ...sourceStart.runtimeSources, ...sourceStart.servedSources]
        .every(validSourceIdentity)
      && sourceStart.sourceSnapshotSha256 === snapshotDigest(sourceStart),
    sourceFreeze: stableCockpitEvidenceJson(sourceStart) === stableCockpitEvidenceJson(sourceEnd),
    immutableBootstrap: ['content-addressed-worker', 'test-injected'].includes(bootstrapProof?.mode)
      && bootstrapProof?.verified === true
      && bootstrapProof?.expectedSourceSha256 === sourceStart?.sourceSnapshotSha256
      && bootstrapProof?.executedSourceSha256 === sourceStart?.sourceSnapshotSha256,
    servedSourceBinding: captures?.length === COCKPIT_VISUAL_EVIDENCE_SHOTS.length
      && COCKPIT_VISUAL_EVIDENCE_SHOTS.every((spec, index) => (
        servedCaptureIsBound(spec, captures[index], sourceStart)
      )),
    canonicalServedResources: servedResources.ok,
    chronology: Number.isFinite(Date.parse(startedAt)) && Number.isFinite(Date.parse(completedAt))
      && Date.parse(completedAt) >= Date.parse(startedAt),
  };
  checks.allPassed = Object.values(checks).every(Boolean);
  return Object.freeze({
    schema: COCKPIT_VISUAL_EVIDENCE_SCHEMA,
    label: options.label,
    generatedAt: completedAt,
    baseUrl: options.baseUrl,
    viewport: COCKPIT_VISUAL_EVIDENCE_VIEWPORT,
    manifest: Object.freeze({ sha256: manifestSha256, shots: COCKPIT_VISUAL_EVIDENCE_SHOTS }),
    sourceProvenance: sourceStart,
    sourceFreeze: Object.freeze({
      startSha256: sourceStart?.sourceSnapshotSha256,
      endSha256: sourceEnd?.sourceSnapshotSha256,
    }),
    immutableBootstrap: bootstrapProof,
    artifacts: Object.freeze(artifactIdentities),
    servedResources,
    shots: Object.freeze(captures),
    shotGates: Object.freeze(shotGates),
    checks: Object.freeze(checks),
  });
}

function finiteAtLeast(value, minimum) {
  return Number.isFinite(value) && value >= minimum;
}

function expectedRuntimeHandle(scene) {
  return scene === 'beefrun' ? 'window.__beefrun' : 'window.__enolaSquatch';
}

function evaluateGeometryState(spec, state) {
  const geometry = state?.geometry;
  const supportMembers = geometry?.supports?.members;
  const subjects = state?.subjects;
  const apertureRequired = spec.covers.some((coverage) => (
    /(?:port-aperture|starboard-aperture|windshield|glazing)/.test(coverage)
  ))
    || spec.owners.some(({ id }) => /aperture|windshield|glazing/.test(id));
  const apertureChecks = Array.isArray(geometry?.shell?.apertures)
    && geometry.shell.apertures.length > 0
    && geometry.shell.apertures.every((aperture) => (
      finiteAtLeast(aperture?.clearWidthM, 0.2)
      && finiteAtLeast(aperture?.clearHeightM, 0.2)
      && Number.isSafeInteger(aperture?.sampleRayCount) && aperture.sampleRayCount >= 5
      && Number.isSafeInteger(aperture?.clearRayCount)
      && aperture.clearRayCount >= Math.ceil(aperture.sampleRayCount * 0.6)
      && Number.isSafeInteger(aperture?.paneFirstHitCount)
      && aperture.paneFirstHitCount >= Math.ceil(aperture.sampleRayCount * 0.6)
      && aperture.exactPaneCount === aperture.expectedPaneCount
      && aperture.exactOwnerMatch === true
      && Number.isFinite(aperture.thicknessM) && aperture.thicknessM > 0
      && aperture.thicknessM <= 0.08
      && Number.isSafeInteger(aperture?.frameRayCount) && aperture.frameRayCount >= 2
      && Number.isSafeInteger(aperture?.frameRayHitCount)
      && aperture.frameRayHitCount >= Math.ceil(aperture.frameRayCount * 0.75)
      && aperture.frameAttached === true
      && Number.isFinite(aperture.frameMaxGapM) && aperture.frameMaxGapM <= 0.08
      && aperture.activeMaterialCount > 0
      && aperture.transparentMaterialCount === aperture.activeMaterialCount
      && finiteAtLeast(aperture.minimumOpacity, 0.05)
      && aperture.maximumOpacity <= 0.65
      && aperture.transparentPixelsCredited === true
    ));
  const subjectEntries = spec.owners.map((requirement) => [
    requirement,
    subjects?.[requirement.id],
  ]);
  const claimedObjectUuids = subjectEntries.flatMap(([, subject]) => subject?.objectUuids ?? []);
  const ownerIds = new Set(spec.owners.map(({ id }) => id));
  const seamPolicies = spec.covers.map((cover) => COCKPIT_VISUAL_SEAM_POLICIES[cover]);
  const semanticGate = (gate) => {
    const policy = COCKPIT_VISUAL_SEMANTIC_GATE_POLICIES[gate];
    return Boolean(policy?.bindings?.length) && policy.bindings.every((binding) => {
      const value = state?.measurements?.[binding.measurement];
      if (!Number.isFinite(value)) return false;
      if (binding.comparator === 'gte') return value >= binding.threshold;
      if (binding.comparator === 'lte') return value <= binding.threshold;
      return binding.comparator === 'eq' && value === binding.threshold;
    });
  };
  const checks = {
    identity: state?.shotId === spec.id
      && state?.runtimeHandle === expectedRuntimeHandle(spec.scene)
      && typeof state?.sceneUuid === 'string' && state.sceneUuid.length > 3,
    legalCamera: typeof state?.camera?.uuid === 'string'
      && state?.camera?.type === 'PerspectiveCamera'
      && ['public-runtime-camera', 'public-gunner-camera'].includes(state?.camera?.legalSource)
      && Array.isArray(state?.camera?.position) && state.camera.position.length === 3
      && state.camera.position.every(Number.isFinite)
      && Array.isArray(state?.camera?.quaternion) && state.camera.quaternion.length === 4
      && state.camera.quaternion.every(Number.isFinite)
      && Array.isArray(state?.camera?.projection) && state.camera.projection.length === 16
      && state.camera.projection.every(Number.isFinite),
    subjects: subjectEntries.every(([requirement, subject]) => (
      Number.isSafeInteger(subject?.rootCount)
      && subject.rootCount === requirement.expectedRootCount
      && Array.isArray(subject.rootUuids) && subject.rootUuids.length === subject.rootCount
      && new Set(subject.rootUuids).size === subject.rootUuids.length
      && Array.isArray(subject.rootNames) && subject.rootNames.length === subject.rootCount
      && Array.isArray(subject.roots) && subject.roots.length === subject.rootCount
      && subject.roots.every((root) => typeof root?.uuid === 'string'
        && typeof root?.name === 'string'
        && Number.isSafeInteger(root?.objectCount) && root.objectCount > 0
        && Number.isSafeInteger(root?.visibleObjectCount) && root.visibleObjectCount > 0
        && root.finiteWorldBounds === true)
      && (requirement.expectedRootNames.length === 0
        || stableCockpitEvidenceJson(subject.rootNames)
          === stableCockpitEvidenceJson([...requirement.expectedRootNames].sort()))
      && Number.isSafeInteger(subject.objectCount) && subject.objectCount > 0
      && subject.objectCount === requirement.expectedObjectCount
      && Array.isArray(subject.objectUuids) && subject.objectUuids.length === subject.objectCount
      && new Set(subject.objectUuids).size === subject.objectUuids.length
      && Number.isSafeInteger(subject.visibleObjectCount) && subject.visibleObjectCount > 0
      && subject.finiteWorldBounds === true
    )) && new Set(claimedObjectUuids).size === claimedObjectUuids.length,
    seamPolicies: seamPolicies.length === spec.covers.length
      && seamPolicies.every((policy) => policy
        && policy.requiredOwners.every((id) => ownerIds.has(id))
        && policy.numericGates.every(semanticGate)),
    supports: Array.isArray(supportMembers) && supportMembers.length > 0
      && supportMembers.every((member) => member?.attached === true
        && member?.finiteWorldBounds === true
        && typeof member?.endpointA === 'string' && member.endpointA.length > 0
        && typeof member?.endpointB === 'string' && member.endpointB.length > 0
        && Number.isFinite(member?.endpointAGapM) && member.endpointAGapM <= 0.03
        && Number.isFinite(member?.endpointBGapM) && member.endpointBGapM <= 0.03
        && Number.isFinite(member?.gapM) && Math.abs(member.gapM) <= 0.03)
      && Array.isArray(geometry?.supports?.unsupported)
      && geometry.supports.unsupported.length === 0,
    shell: ['inside', 'outside'].includes(geometry?.shell?.expectedCameraRelation)
      && geometry.shell.cameraRelation === geometry.shell.expectedCameraRelation
      && finiteAtLeast(geometry.shell.nearestFixtureClearanceM, 0.02)
      && Array.isArray(geometry.shell.intrusions) && geometry.shell.intrusions.length === 0
      && (!apertureRequired || apertureChecks),
    controls: Array.isArray(geometry?.controls?.yokes) && geometry.controls.yokes.length >= 2
      && geometry.controls.yokes.every(({ atRequestedPose }) => atRequestedPose === true)
      && finiteAtLeast(geometry.controls.minimumClearanceM, 0.02)
      && Array.isArray(geometry.controls.intrusions) && geometry.controls.intrusions.length === 0,
    traversal: spec.pose.traversal !== 'crouched-ramp-sill' || (
      geometry?.traversal?.id === 'beef-crouched-ramp-sill'
      && geometry.traversal.startLocal?.[0] <= -3.3
      && geometry.traversal.endLocal?.[0] >= 0
      && Number.isSafeInteger(geometry.traversal.frames) && geometry.traversal.frames <= 220
      && Number.isFinite(geometry.traversal.maximumHorizontalStepM)
      && geometry.traversal.maximumHorizontalStepM <= 0.03
      && geometry.traversal.crouching === true
      && Math.abs(geometry.traversal.eyeHeightM - 1.02) <= 0.002
      && geometry.traversal.crossedSill === true
      && Number.isFinite(geometry.traversal.insideFloorErrorM)
      && geometry.traversal.insideFloorErrorM <= 0.002
      && Number.isFinite(geometry.traversal.crouchedHeadMarginYM)
      && geometry.traversal.crouchedHeadMarginYM >= 0.4
      && Array.isArray(geometry.traversal.samples) && geometry.traversal.samples.length > 1
    ),
    collision: spec.pose.collisionMatrix == null
      || (spec.pose.collisionMatrix === 'side-underwing'
        ? geometry?.collision?.id === 'beef-side-underwing'
          && geometry.collision.sideCapsuleLocalX >= geometry.collision.sideMinimumAbsX
          && geometry.collision.sideMinimumAbsX >= 1.23
          && geometry.collision.underWingStartLocal?.[0] === 3
          && geometry.collision.underWingStartLocal?.[2] >= 5.8
          && geometry.collision.underWingEndLocal?.[0] === 3
          && geometry.collision.underWingEndLocal?.[2] < -3.5
          && Number.isSafeInteger(geometry.collision.underWingFrames)
          && geometry.collision.underWingFrames <= 360
          && geometry.collision.underWingGroundDeltaM <= 0.002
          && geometry.collision.maximumHorizontalStepM <= 0.03
        : spec.pose.collisionMatrix === 'nose-tail'
          ? geometry?.collision?.id === 'beef-nose-tail'
            && geometry.collision.noseCapsuleLocalZ >= geometry.collision.noseMinimumZ
            && geometry.collision.noseMinimumZ >= 5.65
            && geometry.collision.tailCapsuleLocalZ <= geometry.collision.tailMaximumZ
            && geometry.collision.tailMaximumZ <= -7.35
          : spec.pose.collisionMatrix === 'enola-side'
            ? geometry?.collision?.id === 'enola-side'
              && finiteAtLeast(geometry.collision.capsuleClearanceM, 0.25)
              && Array.isArray(geometry.collision.intrusions)
              && geometry.collision.intrusions.length === 0
            : spec.pose.collisionMatrix === 'enola-belly'
              && geometry?.collision?.id === 'enola-belly-closed'
              && geometry.collision.bayClosed === true
              && finiteAtLeast(geometry.collision.capsuleClearanceM, 0.25)
              && Array.isArray(geometry.collision.intrusions)
              && geometry.collision.intrusions.length === 0),
  };
  if (spec.pose.controls === 'full-extreme') {
    checks.controls = checks.controls
      && geometry.controls.mode === spec.pose.controls
      && geometry.controls.pitch >= 0.99 && geometry.controls.roll >= 0.99
      && geometry.controls.yaw >= 0.99
      && geometry.controls.throttleL >= 0.99 && geometry.controls.throttleR >= 0.99
      && geometry.controls.flaps >= 0.99;
    const transforms = geometry.controls.expectedTransforms;
    if (spec.scene === 'beefrun') {
      checks.controls = checks.controls
        && Math.abs(transforms?.yokeZ - 2.35) <= 0.002
        && Math.abs(transforms?.yokeRollRad + 0.5) <= 0.002
        && transforms?.pedalZ?.length === 2
        && Math.abs(transforms.pedalZ[0] - 2.35) <= 0.002
        && Math.abs(transforms.pedalZ[1] - 2.25) <= 0.002
        && Math.abs(transforms.pedalMountGapM) <= 0.002
        && transforms?.engineLeverRad?.length === 6
        && transforms.engineLeverRad.every(
          (value, index) => Math.abs(value - [0.4, 0.4, 0, 0, 0, 0][index]) <= 0.002,
        )
        && Math.abs(transforms?.flapLeverRad - 0.5) <= 0.002
        && Math.abs(transforms?.externalFlapRad - 0.62) <= 0.002;
    } else {
      checks.controls = checks.controls
        && transforms?.yokePitchRad?.length === 2
        && transforms.yokePitchRad.every((value) => Math.abs(value - 0.16) <= 0.002)
        && transforms?.yokeRollRad?.length === 2
        && transforms.yokeRollRad.every((value) => Math.abs(value - 0.65) <= 0.002)
        && transforms?.throttleRad?.length === 4
        && transforms.throttleRad.every((value) => Math.abs(value - 0.4) <= 0.002)
        && transforms?.pedalZ?.length === 4
        && transforms?.pedalRad?.length === 4
        && Number.isFinite(transforms.maximumYokeError) && transforms.maximumYokeError <= 0.003
        && Number.isFinite(transforms.maximumThrottleError) && transforms.maximumThrottleError <= 0.003
        && Number.isFinite(transforms.maximumPedalError) && transforms.maximumPedalError <= 0.003
        && Math.abs(transforms?.externalFlapRad - 0.55) <= 0.002;
    }
  } else if (spec.pose.controls === 'neutral') {
    checks.controls = checks.controls
      && Math.abs(geometry.controls.pitch) <= 0.02 && Math.abs(geometry.controls.roll) <= 0.02;
  }
  const doorRequired = spec.pose.cargoDoor === 'open' || spec.pose.crewDoor === 'open';
  checks.door = !doorRequired || (
    geometry?.door?.id === (spec.scene === 'beefrun' ? 'cargo-door' : 'crew-door')
    && geometry.door.openFraction >= 0.95
    && finiteAtLeast(geometry.door.openingWidthM, 0.4)
    && finiteAtLeast(geometry.door.openingHeightM, 0.6)
    && finiteAtLeast(geometry.door.thresholdClearanceM, 0.02)
    && geometry.door.egressDeployed === true
    && finiteAtLeast(geometry.door.egressClearanceM, 0.02)
    && geometry.door.leafShellIntrusionCount === 0
    && geometry.door.sweptShellIntrusionCount === 0
  );
  const expectedGun = spec.pose.gun;
  checks.gun = Array.isArray(geometry?.gun?.intrusions) && geometry.gun.intrusions.length === 0
    && finiteAtLeast(geometry.gun.minimumClearanceM, 0.02);
  if (expectedGun === 'neutral') {
    checks.gun = checks.gun && Math.abs(geometry.gun.yaw) <= 0.002
      && Math.abs(geometry.gun.pitch) <= 0.002;
  } else if (expectedGun === 'left-down-limit') {
    checks.gun = checks.gun && Math.abs(geometry.gun.yaw + 1.02) <= 0.002
      && Math.abs(geometry.gun.pitch + 0.38) <= 0.002
      && geometry.gun.atTraverseLimit === true && geometry.gun.atElevationLimit === true;
  } else if (expectedGun === 'right-up-limit') {
    checks.gun = checks.gun && Math.abs(geometry.gun.yaw - 1.02) <= 0.002
      && Math.abs(geometry.gun.pitch - 0.58) <= 0.002
      && geometry.gun.atTraverseLimit === true && geometry.gun.atElevationLimit === true;
  }
  return checks;
}

export function evaluateCockpitVisualShot(spec, capture, label) {
  const screenshot = capture?.screenshot;
  const mask = screenshot?.ownerMask;
  const proof = screenshot?.pixelProof;
  const ownerProofs = new Map((proof?.owners ?? []).map((entry) => [entry.id, entry]));
  const rootProofs = new Map((proof?.roots ?? []).map((entry) => [entry.rootUuid, entry]));
  const beforeGeometry = evaluateGeometryState(spec, capture?.before);
  const stateJson = stableCockpitEvidenceJson(capture?.before);
  const diagnostics = capture?.runtime;
  const fingerprint = capture?.before?.renderStateFingerprint;
  const receipts = capture?.renderReceipts;
  const frozenScheduler = (scheduler) => scheduler?.installedBeforeModules === true
    && scheduler?.frozen === true && Number.isSafeInteger(scheduler?.generation)
    && scheduler.generation >= 1 && scheduler?.pendingTimers === 0
    && scheduler?.pendingIntervals === 0 && scheduler?.pendingAnimationFrames === 0;
  const normalPath = spec.scene === 'enola' ? 'public-postfx' : 'raw-webgl';
  const productionPostfx = (receipt) => spec.scene !== 'enola'
    ? receipt?.postfx == null
    : receipt?.path === 'public-postfx'
      && receipt?.postfx?.ready === true
      && receipt.postfx.renderMethodPresent === true
      && receipt.postfx.enabled === true
      && receipt.postfx.composerPresent === true
      && receipt.postfx.bloomPresent === true
      && receipt.postfx.bloomPassAttached === true
      && receipt.postfx.bloomEnabled === true
      && receipt.postfx.bloomType === 'UnrealBloomPass'
      && Math.abs(receipt.postfx.bloomThreshold - 1.18) <= 1e-6
      && Math.abs(receipt.postfx.bloomStrength - 0.25) <= 1e-6
      && Math.abs(receipt.postfx.bloomRadius - 0.34) <= 1e-6;
  const checks = {
    identity: capture?.id === spec?.id && capture?.scene === spec?.scene && capture?.page === spec?.page,
    loopback: /^http:\/\/127\.0\.0\.1:\d+$/.test(capture?.baseUrl ?? ''),
    fresh: capture?.fresh?.screenshotAbsentBefore === true && capture?.fresh?.maskAbsentBefore === true,
    diagnostics: ['pageErrors', 'consoleErrors', 'httpErrors', 'requestFailures', 'contextErrors']
      .every((key) => Array.isArray(diagnostics?.[key]) && diagnostics[key].length === 0),
    seamPolicies: beforeGeometry.seamPolicies === true,
    beforeState: Object.values(beforeGeometry).every(Boolean),
    exactPngState: stateJson === stableCockpitEvidenceJson(capture?.pngBinding),
    exactAfterState: stateJson === stableCockpitEvidenceJson(capture?.after),
    exactMaskState: stateJson === stableCockpitEvidenceJson(proof?.maskBinding)
      && stateJson === stableCockpitEvidenceJson(proof?.restoredBinding),
    callbackFreeze: frozenScheduler(capture?.before?.scheduler)
      && frozenScheduler(capture?.pngBinding?.scheduler)
      && frozenScheduler(proof?.maskBinding?.scheduler)
      && frozenScheduler(proof?.restoredBinding?.scheduler)
      && frozenScheduler(capture?.after?.scheduler),
    atomicRender: /^[a-f0-9]{64}$/.test(fingerprint ?? '')
      && receipts?.normal?.mode === 'normal' && receipts.normal.path === normalPath
      && productionPostfx(receipts.normal)
      && receipts?.mask?.mode === 'mask' && receipts.mask.path === 'raw-webgl'
      && receipts?.restored?.mode === 'normal' && receipts.restored.path === normalPath
      && productionPostfx(receipts.restored)
      && Number.isSafeInteger(receipts?.normal?.serial)
      && receipts.mask.serial === receipts.normal.serial + 1
      && receipts.restored.serial === receipts.mask.serial + 1
      && receipts.normal.preFingerprint === fingerprint
      && receipts.normal.postFingerprint === fingerprint
      && receipts.mask.sourceFingerprint === fingerprint
      && /^[a-f0-9]{64}$/.test(receipts.mask.preFingerprint ?? '')
      && receipts.mask.preFingerprint === receipts.mask.postFingerprint
      && receipts.mask.preFingerprint !== fingerprint
      && receipts.restored.preFingerprint === fingerprint
      && receipts.restored.postFingerprint === fingerprint
      && frozenScheduler(receipts.normal.scheduler)
      && frozenScheduler(receipts.mask.scheduler)
      && frozenScheduler(receipts.restored.scheduler),
    screenshot: screenshot?.file === `${label}-${spec.id}.png`
      && screenshot?.width === COCKPIT_VISUAL_EVIDENCE_VIEWPORT.width
      && screenshot?.height === COCKPIT_VISUAL_EVIDENCE_VIEWPORT.height
      && Number.isSafeInteger(screenshot?.bytes) && screenshot.bytes > 0
      && /^[a-f0-9]{64}$/.test(screenshot?.sha256 ?? ''),
    ownerMask: mask?.file === `${label}-${spec.id}-id-mask.png`
      && mask?.width === COCKPIT_VISUAL_EVIDENCE_VIEWPORT.width
      && mask?.height === COCKPIT_VISUAL_EVIDENCE_VIEWPORT.height
      && Number.isSafeInteger(mask?.bytes) && mask.bytes > 0
      && /^[a-f0-9]{64}$/.test(mask?.sha256 ?? ''),
    pixelBinding: proof?.width === screenshot?.width && proof?.height === screenshot?.height
      && proof?.imagePngBytes === screenshot?.bytes
      && proof?.imagePngSha256 === screenshot?.sha256
      && proof?.maskPngBytes === mask?.bytes
      && proof?.maskPngSha256 === mask?.sha256,
    ownerPixels: Array.isArray(proof?.owners) && proof.owners.length === spec.owners.length
      && spec.owners.every((requirement) => {
        const actual = ownerProofs.get(requirement.id);
        return actual?.color === requirement.color.toLowerCase()
          && actual?.visiblePixels >= requirement.minPixels
          && actual?.largestComponentPixels >= requirement.minLargestComponentPixels
          && actual?.largestComponentRatio >= requirement.minLargestComponentRatio
          && Number.isSafeInteger(actual?.componentCount) && actual.componentCount > 0
          && actual.componentCount <= requirement.maxComponentCount
          && actual?.ringPixels > 0
          && actual?.contrast >= requirement.minContrast;
      })
      && proof?.classifiedPixels === (proof?.owners ?? [])
        .reduce((sum, entry) => sum + entry.visiblePixels, 0)
      && Number.isSafeInteger(proof?.unclassifiedColoredPixels)
      && Number.isFinite(proof?.unclassifiedColoredRatio)
      && proof.unclassifiedColoredRatio <= 0.002
      && proof.unclassifiedColoredPixels <= Math.max(64, Math.ceil(proof.classifiedPixels * 0.02)),
    rootPixels: Array.isArray(proof?.roots)
      && proof.roots.length === spec.owners.reduce((sum, owner) => sum + owner.expectedRootCount, 0)
      && new Set(proof.roots.map(({ id }) => id)).size === proof.roots.length
      && new Set(proof.roots.map(({ rootUuid }) => rootUuid)).size === proof.roots.length
      && new Set(proof.roots.map(({ color }) => color)).size === proof.roots.length
      && spec.owners.every((requirement) => {
        const subject = capture?.before?.subjects?.[requirement.id];
        return subject?.roots?.every((root) => {
          const actual = rootProofs.get(root.uuid);
          const maximumComponents = Math.max(2, root.objectCount);
          const minimumLargestRatio = Math.max(0.18, 0.8 / maximumComponents);
          return actual?.ownerId === requirement.id
            && actual?.rootName === root.name
            && /^#[a-f0-9]{6}$/.test(actual?.color ?? '')
            && actual?.visiblePixels >= requirement.minRootPixels
            && Number.isSafeInteger(actual?.componentCount) && actual.componentCount > 0
            && actual.componentCount <= maximumComponents
            && actual?.largestComponentPixels >= Math.max(
              2, Math.ceil(requirement.minRootPixels * minimumLargestRatio),
            )
            && actual?.largestComponentRatio >= minimumLargestRatio
            && actual?.ringPixels > 0
            && actual?.contrast >= requirement.minContrast;
        });
      }),
  };
  const errors = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return Object.freeze({ ok: errors.length === 0, checks: Object.freeze(checks), errors: Object.freeze(errors) });
}
export const COCKPIT_VISUAL_EVIDENCE_SCHEMA = 'squatch-cockpit-visual-evidence/v1';
export const COCKPIT_VISUAL_EVIDENCE_VIEWPORT = Object.freeze({
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
});

const WORKSPACE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT_WORKSPACE_ROOT = process.env.COCKPIT_VISUAL_EVIDENCE_IMMUTABLE_WORKER === '1'
  && process.env.COCKPIT_VISUAL_EVIDENCE_OUTPUT_ROOT
  ? path.resolve(process.env.COCKPIT_VISUAL_EVIDENCE_OUTPUT_ROOT) : WORKSPACE_ROOT;
const SAFE_LABEL = /^[a-z0-9][a-z0-9_-]*$/i;
