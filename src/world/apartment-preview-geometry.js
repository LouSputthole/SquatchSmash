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

/* The next authored point on MARGO_ENTRY_PATH is (0.90, 3.30). Face that
 * first step at the moment she appears, rather than spending the first
 * rendered frame looking 9 cm into the south wall before the walk updater
 * corrects her heading. */
export const APARTMENT_MARGO_ENTRY_HEADING = Math.atan2(
  0.90 - APARTMENT_MARGO_ENTRY_POSITION.x,
  3.30 - APARTMENT_MARGO_ENTRY_POSITION.z,
);
/* The entry leaf is hinged on the west jamb and opens outward to a right
 * angle. At the old one-radian angle the leaf still occupied Margo's exact
 * authored doorway pose; this is the first clear physical state. Runtime
 * imports the same value for both directions of her walk. */
export const APARTMENT_MARGO_ENTRY_DOOR_YAW = -Math.PI / 2;

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
    margo.group.rotation.set(0, APARTMENT_MARGO_ENTRY_HEADING, 0);
    margo.group.visible = true;
    /* Runtime opens this leaf on the first walk frame. Stage it open before
     * that frame too: with her body correctly facing the path, the closed
     * leaf cuts through her hips and left arm. */
    if (!apartment.frontDoorPivot?.rotation) {
      throw new TypeError('Apartment Margo entry requires the front-door pivot');
    }
    apartment.frontDoorPivot.rotation.y = APARTMENT_MARGO_ENTRY_DOOR_YAW;
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
    frontDoorYaw: apartment.frontDoorPivot?.rotation?.y ?? null,
  });
}

export function stageApartmentPreviewGeometry(apartment, variant) {
  return stageApartmentMargoGeometry(apartment, apartmentPreviewGeometryStage(variant));
}
