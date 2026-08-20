/**
 * Browser-independent geometry staging for Apartment preview beats.
 *
 * The Apartment builder constructs Margo once and keeps her hidden until the
 * Silver Room return or Day Four wake starts. The geometry gate must stage
 * those same visible poses without importing src/main.js and starting the
 * browser runtime.
 */

export const APARTMENT_MARGO_GEOMETRY_STAGES = Object.freeze({
  HIDDEN: 'hidden',
  COME_HOME_ENTRY: 'come-home-entry',
  WAKE_LYING: 'wake-lying',
});

export const APARTMENT_MARGO_ENTRY_POSITION = Object.freeze({
  x: 2.72,
  y: 0.87,
  z: 4.28,
});

const MARGO_ASSEMBLY = 'apartment-margo';
const MARGO_BED_ASSEMBLY = 'apartment-margo-bed-occupancy';

function own(object, assemblyId) {
  if (!object?.isObject3D) throw new TypeError(`Missing Object3D for ${assemblyId}`);
  object.userData.geometryGate = {
    ...(object.userData.geometryGate ?? {}),
    assemblyId,
  };
}

function requireMargo(apartment) {
  const margo = apartment?.margo;
  if (!margo?.group || typeof margo.setPose !== 'function') {
    throw new TypeError('Apartment preview geometry requires the complete Margo rig');
  }
  if (typeof margo.setDressHelpProgress !== 'function' || typeof margo.setDressGlue !== 'function') {
    throw new TypeError('Apartment preview geometry requires Margo dress staging controls');
  }
  return margo;
}

function exactDirectChild(root, name) {
  const matches = root?.children?.filter((child) => child.name === name) ?? [];
  if (matches.length !== 1) {
    throw new Error(`Apartment preview geometry expected one direct ${name}; found ${matches.length}`);
  }
  return matches[0];
}

export function apartmentPreviewGeometryStage(variant) {
  if (variant === 'after-silver-room') return APARTMENT_MARGO_GEOMETRY_STAGES.COME_HOME_ENTRY;
  if (variant === 'day-four-wake') return APARTMENT_MARGO_GEOMETRY_STAGES.WAKE_LYING;
  return APARTMENT_MARGO_GEOMETRY_STAGES.HIDDEN;
}

/** Stage one exact runtime pose and return plain evidence for headless tests. */
export function stageApartmentMargoGeometry(apartment, stage) {
  const margo = requireMargo(apartment);
  margo.setDressGlue(0);
  margo.setDressHelpProgress(0);

  if (stage === APARTMENT_MARGO_GEOMETRY_STAGES.HIDDEN) {
    own(margo.group, MARGO_ASSEMBLY);
    margo.group.visible = false;
  } else if (stage === APARTMENT_MARGO_GEOMETRY_STAGES.COME_HOME_ENTRY) {
    own(margo.group, MARGO_ASSEMBLY);
    margo.setPose('standing');
    margo.group.position.set(
      APARTMENT_MARGO_ENTRY_POSITION.x,
      APARTMENT_MARGO_ENTRY_POSITION.y,
      APARTMENT_MARGO_ENTRY_POSITION.z,
    );
    margo.group.rotation.set(0, 0, 0);
    margo.group.visible = true;
  } else if (stage === APARTMENT_MARGO_GEOMETRY_STAGES.WAKE_LYING) {
    const bed = exactDirectChild(apartment.root, 'bed');
    // Her body deliberately occupies compressible bedding. Keep that fitted
    // relationship local to this exact bed and actor instead of suppressing
    // overlap checks on either object or on the bedroom.
    own(bed, MARGO_BED_ASSEMBLY);
    own(margo.group, MARGO_BED_ASSEMBLY);
    margo.setPose('lying');
    margo.group.visible = true;
  } else {
    throw new RangeError(`Unknown Apartment Margo geometry stage: ${stage}`);
  }

  return Object.freeze({
    stage,
    visible: margo.group.visible,
    pose: margo.pose,
    assemblyId: margo.group.userData.geometryGate.assemblyId,
    position: Object.freeze({
      x: margo.group.position.x,
      y: margo.group.position.y,
      z: margo.group.position.z,
    }),
    yaw: margo.group.rotation.y,
  });
}

export function stageApartmentPreviewGeometry(apartment, variant) {
  return stageApartmentMargoGeometry(apartment, apartmentPreviewGeometryStage(variant));
}
