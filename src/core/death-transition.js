import * as THREE from 'three';

import { setActorPosture } from './staging.js';

export const DEATH_TRANSITION_MODES = Object.freeze([
  'standing',
  'seated',
  'scripted_execution',
]);

function descendants(root) {
  const nodes = [];
  root.traverse((node) => nodes.push({ node, parent: node.parent }));
  return nodes;
}

/**
 * Canonical lifecycle seam for scene-specific death poses.
 *
 * This deliberately does not pretend one procedural rig can replace every
 * standing, seated, execution, stairs, or furniture fall in the game. It owns
 * the invariants those adapters must share: stop live systems, declare the
 * resulting posture, and keep one connected hierarchy for the entire body.
 * The scene adapter remains responsible for the actual animation and floor or
 * seat contact.
 */
export function beginDeathTransition(root, {
  mode = 'standing',
  posture = mode === 'seated' ? 'sit' : 'lie',
  disable = [],
  stop = [],
} = {}) {
  if (!root?.isObject3D) throw new TypeError('DeathTransition requires an Object3D root');
  if (!DEATH_TRANSITION_MODES.includes(mode)) {
    throw new TypeError(`Unknown death-transition mode ${JSON.stringify(mode)}`);
  }

  const previous = root.userData.deathTransitionReceipt;
  if (previous?.active) {
    if (root.userData.actor) setActorPosture(root, previous.posture);
    return previous;
  }

  const actorState = root.userData.actor
    ? {
        posture: root.userData.actorPosture ?? root.userData.actor.posture,
        postureWasOverridden: Object.hasOwn(root.userData, 'actorPosture'),
        seat: root.userData.actorSeat,
        seatWasOverridden: Object.hasOwn(root.userData, 'actorSeat'),
      }
    : null;

  const disabled = [];
  for (const target of disable) {
    if (!target || typeof target !== 'object') continue;
    const state = {};
    if ('enabled' in target) {
      state.enabled = target.enabled;
      target.enabled = false;
    }
    if ('active' in target) {
      state.active = target.active;
      target.active = false;
    }
    target.stop?.();
    target.resetPath?.();
    disabled.push({ target, state });
  }
  for (const callback of stop) callback?.();

  if (root.userData.actor) setActorPosture(root, posture);
  const receipt = {
    root,
    mode,
    posture,
    active: true,
    hierarchy: descendants(root),
    disabled,
    actorState,
    startedAt: Date.now(),
  };
  root.userData.deathTransition = Object.freeze({
    mode,
    posture,
    nodeCount: receipt.hierarchy.length,
  });
  /* Runtime-only: tests and restart Adapters need the captured parent map;
   * it is intentionally non-enumerable so debug/geometry snapshots remain
   * serializable. */
  Object.defineProperty(root.userData, 'deathTransitionReceipt', {
    value: receipt,
    configurable: true,
    writable: true,
    enumerable: false,
  });
  return receipt;
}

/**
 * Audit a completed or in-progress adapter without knowing its rig type.
 * `surfaceY` may be a floor, stair tread, seat cushion, or furniture contact.
 */
export function auditDeathTransition(receipt, {
  surfaceY = null,
  contacts = [],
  maxGap = 0.04,
  maxPenetration = 0.02,
} = {}) {
  if (!receipt?.root?.isObject3D) return ['Death transition has no live root'];
  const findings = [];
  const live = new Set();
  receipt.root.traverse((node) => live.add(node));
  for (const { node, parent } of receipt.hierarchy) {
    if (!live.has(node)) findings.push(`${node.name || node.type} left the body hierarchy`);
    else if (node !== receipt.root && node.parent !== parent) {
      findings.push(`${node.name || node.type} changed parent during death transition`);
    }
  }
  for (const { target } of receipt.disabled) {
    if ('enabled' in target && target.enabled !== false) findings.push('disabled controller re-enabled');
    if ('active' in target && target.active !== false) findings.push('disabled navigation/animation reactivated');
  }
  const contactPlanes = [];
  if (Number.isFinite(surfaceY)) {
    contactPlanes.push({
      axis: 'y',
      side: 'min',
      value: surfaceY,
      label: 'contact surface',
      maxGap,
      maxPenetration,
      legacyFloor: true,
    });
  }
  for (const [index, contact] of contacts.entries()) {
    const axis = contact?.axis;
    const side = contact?.side;
    const value = Number(contact?.value);
    if (!['x', 'y', 'z'].includes(axis)
      || !['min', 'max'].includes(side)
      || !Number.isFinite(value)) {
      findings.push(`invalid death contact plane ${index}`);
      continue;
    }
    contactPlanes.push({
      axis,
      side,
      value,
      label: contact.label || `${axis}-${side} contact`,
      maxGap: Number.isFinite(contact.maxGap) ? contact.maxGap : maxGap,
      maxPenetration: Number.isFinite(contact.maxPenetration)
        ? contact.maxPenetration
        : maxPenetration,
      legacyFloor: false,
    });
  }
  if (contactPlanes.length > 0) {
    receipt.root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    let found = false;
    receipt.root.traverse((node) => {
      if (!node.isMesh || node.visible === false || !node.geometry) return;
      const next = new THREE.Box3().setFromObject(node);
      if (next.isEmpty()) return;
      if (!found) bounds.copy(next);
      else bounds.union(next);
      found = true;
    });
    if (!found) findings.push('death transition has no visible rendered body');
    else {
      for (const contact of contactPlanes) {
        const point = bounds[contact.side][contact.axis];
        const gap = contact.side === 'min'
          ? point - contact.value
          : contact.value - point;
        if (gap > contact.maxGap) {
          findings.push(contact.legacyFloor
            ? `body floats ${gap.toFixed(3)} m above contact surface`
            : `body leaves ${contact.label} by ${gap.toFixed(3)} m`);
        }
        if (gap < -contact.maxPenetration) {
          findings.push(`body penetrates ${contact.label} by ${(-gap).toFixed(3)} m`);
        }
      }
    }
  }
  return findings;
}

export function restoreDeathTransition(receipt) {
  if (!receipt?.active) return false;
  for (const { target, state } of receipt.disabled) {
    if ('enabled' in state) target.enabled = state.enabled;
    if ('active' in state) target.active = state.active;
  }
  if (receipt.actorState && receipt.root.userData.actor) {
    setActorPosture(receipt.root, receipt.actorState.posture);
    if (!receipt.actorState.postureWasOverridden) {
      delete receipt.root.userData.actorPosture;
    }
    if (receipt.actorState.seatWasOverridden) {
      receipt.root.userData.actorSeat = receipt.actorState.seat;
    } else {
      delete receipt.root.userData.actorSeat;
    }
  }
  receipt.active = false;
  delete receipt.root.userData.deathTransition;
  delete receipt.root.userData.deathTransitionReceipt;
  return true;
}
