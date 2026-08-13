/**
 * Authoritative camera/evidence contract for the owner's Mansion pictures.
 * Floor-height positions use mansion.teleport's public `(x, floorY, z)` API.
 */
export function parseMansionArtEvidenceRun(args = [], env = {}) {
  const requestedMode = args[1] ?? 'all';
  if (requestedMode !== 'all') {
    throw new Error(
      `Retained screenshot reuse is disabled (${requestedMode}); run a fresh full 11-shot capture.`,
    );
  }
  if (args.length > 2) {
    throw new Error('Unexpected Mansion-art verifier arguments; run a fresh full 11-shot capture.');
  }
  const label = String(env.MANSION_ART_LABEL || args[0] || 'final')
    .replace(/[^a-z0-9_-]/gi, '-');
  return { label, mode: 'all' };
}

export function resolveMansionArtNullSightline({
  primary, primaryIsOwnBacking = false, target, retries,
}) {
  /* A ray aimed exactly at PlaneGeometry's shared triangle edge can miss both
   * triangles numerically and continue into that picture's own mount board.
   * Treat only that known self-backing case like a null hit. An unrelated
   * opaque primary blocker remains authoritative and cannot borrow retries. */
  if (primary !== null && !primaryIsOwnBacking) return primary;
  if (retries.length !== 4) {
    throw new Error('A recoverable art ray requires exactly four micro-neighborhood retries.');
  }
  const failed = retries.findIndex((hit) => hit !== target);
  return failed === -1 ? target : retries[failed];
}

/**
 * Pure semantic gate for the vault-facing Casa Bonita evidence. Browser code
 * supplies real Box3 measurements; keeping the pass/fail policy here makes it
 * unit-testable and binds the policy into the capture provenance fingerprint.
 */
export function evaluateCasaFrameContract(proof) {
  const containment = proof?.containment;
  const frameComplete = Boolean(proof?.frame && proof?.bezel && proof?.board && containment);
  const artContained = frameComplete
    && containment.boardLeft >= 0.0055 && containment.boardRight >= 0.0055
    && containment.boardBottom >= 0.0055 && containment.boardTop >= 0.0055
    && containment.bezelLeft >= 0.0345 && containment.bezelRight >= 0.0345
    && containment.bezelBottom >= 0.0345 && containment.bezelTop >= 0.0345;
  const symmetric = frameComplete
    && Math.abs(containment.boardLeft - containment.boardRight) <= 0.0005
    && Math.abs(containment.boardBottom - containment.boardTop) <= 0.0005
    && Math.abs(containment.bezelLeft - containment.bezelRight) <= 0.0005
    && Math.abs(containment.bezelBottom - containment.bezelTop) <= 0.0005;
  const railClear = Array.isArray(proof?.intersections)
    && proof.intersections.length === 0
    && Number.isFinite(proof?.railClearance) && proof.railClearance >= 0.05;
  const rearGap = proof?.nearestStructuralWall?.frameRearGap;
  const wallMounted = Number.isFinite(rearGap) && rearGap >= -0.0005 && rearGap <= 0.005;
  return {
    frameComplete,
    artContained,
    symmetric,
    railClear,
    wallMounted,
    ok: frameComplete && artContained && symmetric && railClear && wallMounted,
  };
}

const OWNER_PICTURES = [
  {
    name: '01-gallery-roster', room: 'Upper gallery',
    slot: 'mansion.gallery.roster', file: 'austin-major-2025-roster.jpg',
    position: [11.0, 6.0, 51.6],
  },
  {
    name: '02-ballroom-major', room: 'Ballroom',
    slot: 'mansion.ballroom.major', file: 'austin-major-cowboy-banner.jpg',
    position: [5.0, 1.2, 62.0],
  },
  {
    name: '03-lounge-cowboy', room: 'Billiards lounge',
    slot: 'mansion.lounge.cowboy', file: 'austin-major-cowboy.jpg',
    position: [13.5, 1.2, 40.0],
  },
  {
    name: '04-conference-stacks', room: 'Conference room',
    slot: 'mansion.conference.stacks', file: 'logo-5-years-of-stacks.jpg',
    position: [4.7, 6.0, 59.8],
  },
  {
    name: '05-office-boss', room: "Lou's office",
    slot: 'mansion.office.boss', file: 'boss-camp-shirt.jpg',
    position: [-6.0, 6.0, 66.6],
  },
  {
    name: '06-winter-almighty', room: 'Winter garden',
    slot: 'mansion.winter.almighty', file: 'squatch-almighty.jpg',
    position: [-20.1, 1.2, 66.2],
  },
  {
    name: '07-cellar-party-bus', room: 'Cellar hall',
    slot: 'mansion.cellar.bus', file: 'party-bus-night.jpg',
    position: [-10.5, -2.8, 66.4],
  },
  {
    name: '08-guest-dog', room: 'Lower guest room',
    slot: 'mansion.guest.dog', file: 'house-dog.jpg',
    position: [-10.0, -2.8, 72.6],
  },
  {
    name: '09-theatre-lockup', room: 'Theatre',
    slot: 'mansion.theatre.lockup', file: 'austin-major-lockup.jpg',
    position: [-0.5, -2.8, 73.5],
  },
  {
    name: '10-lan-denver', room: 'LAN room',
    slot: 'mansion.lan.denver', file: 'logo-denver-2026.jpg',
    position: [8.0, -2.8, 73.2], allowPerimeterOcclusion: true,
  },
];

const VAULT_FACING_CASA = {
  name: '11-vault-facing-casa-bonita', room: 'Cellar hall, across from vault',
  slot: 'mansion.cellar.crest', file: 'casabonita.webp',
  position: [10.5, -2.8, 66.4], railProof: true,
};

export const MANSION_ART_EVIDENCE_SHOTS = Object.freeze(
  [...OWNER_PICTURES, VAULT_FACING_CASA].map((shot) => Object.freeze({
    ...shot,
    position: Object.freeze([...shot.position]),
  })),
);

export const MANSION_OWNER_PICTURE_COUNT = OWNER_PICTURES.length;
