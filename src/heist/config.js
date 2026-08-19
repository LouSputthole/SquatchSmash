export const HEIST_STATES = Object.freeze([
  'APARTMENT_MARGO', 'MARGO_LEAVES', 'LOU_CALL', 'APARTMENT_PREP', 'DEPART_APARTMENT',
  'SAFEHOUSE_ARRIVAL', 'CREW_INTRO', 'BRIEFING', 'LOADOUT', 'BOARD_VAN',
  'VAN_APPROACH', 'MASKS_ON', 'BANK_ARRIVAL', 'CREW_EXIT',
  'BANK_ENTRY', 'LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT',
  'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER',
  'BANK_DOOR_CONTACT', 'STREET_BLOCK_ONE', 'VAN_REACHED', 'VAN_DISABLED',
  'RIPPIN_INJURED', 'FALLBACK_ROUTE', 'STREET_BLOCK_TWO', 'DROPPED_BAG_DECISION',
  'GARAGE_ENTRY', 'GARAGE_HOLD', 'SECONDARY_CAR_LOAD',
  'PLAYER_TAKES_WHEEL', 'GARAGE_ESCAPE', 'CITY_PURSUIT', 'ROADBLOCK',
  'INDUSTRIAL_ROUTE', 'VEHICLE_SWAP',
  'SAFEHOUSE_RETURN', 'FIRST_AID', 'MONEY_COUNT', 'DEBRIEF', 'LOU_CALL_SAFEHOUSE',
  'RETURN_APARTMENT', 'INITIATION_UNLOCKED', 'SCENE_COMPLETE', 'FAILED',
]);

export const MISSION_START_STATE = 'SAFEHOUSE_ARRIVAL';

export const HEIST_ESCAPE_VEHICLE_CONFIG = Object.freeze({
  acceleration: 12.5,
  reverseAcceleration: 6.5,
  brakeForce: 16,
  drag: 0.014,
  rollingResistance: 0.55,
  maxForwardSpeed: 26,
  maxReverseSpeed: 8,
  maxSteer: 0.62,
  steerRate: 3.4,
  lateralGrip: 7.6,
});

export const HEIST_CHECKPOINT_STATE = Object.freeze({
  safehouse_ready: 'BOARD_VAN',
  bank_secured: 'MANAGER_ESCORT',
  vault_open: 'CASH_LOADING',
  street_withdrawal: 'STREET_BLOCK_ONE',
  mercer_garage: 'GARAGE_HOLD',
  vehicle_swap: 'SAFEHOUSE_RETURN',
});

export const PREVIEW_START_STATE = Object.freeze({
  safehouse: 'SAFEHOUSE_ARRIVAL',
  bank_lobby: 'LOBBY_CONTROL',
  vault_open: 'CASH_LOADING',
  street_withdrawal: 'STREET_BLOCK_ONE',
  mercer_garage: 'GARAGE_HOLD',
  vehicle_escape: 'PLAYER_TAKES_WHEEL',
  safehouse_debrief: 'SAFEHOUSE_RETURN',
});

export const HEIST_PREVIEW_CHECKPOINTS = Object.freeze(Object.keys(PREVIEW_START_STATE));

export const PHASE_FOR_STATE = Object.freeze(Object.fromEntries(HEIST_STATES.map((state) => {
  if (state.startsWith('APARTMENT') || state === 'MARGO_LEAVES' || state === 'LOU_CALL'
    || state === 'DEPART_APARTMENT' || state === 'RETURN_APARTMENT'
    || state === 'INITIATION_UNLOCKED' || state === 'SCENE_COMPLETE') return [state, 'apartment'];
  if (['SAFEHOUSE_ARRIVAL', 'CREW_INTRO', 'BRIEFING', 'LOADOUT', 'BOARD_VAN',
    'SAFEHOUSE_RETURN', 'FIRST_AID', 'MONEY_COUNT', 'DEBRIEF', 'LOU_CALL_SAFEHOUSE']
    .includes(state)) return [state, 'safehouse'];
  if (['VAN_APPROACH', 'MASKS_ON', 'BANK_ARRIVAL', 'CREW_EXIT'].includes(state)) {
    return [state, 'van'];
  }
  if (['BANK_ENTRY', 'LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT',
    'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER']
    .includes(state)) return [state, 'bank'];
  if (['BANK_DOOR_CONTACT', 'STREET_BLOCK_ONE', 'VAN_REACHED', 'VAN_DISABLED',
    'RIPPIN_INJURED', 'FALLBACK_ROUTE', 'STREET_BLOCK_TWO', 'DROPPED_BAG_DECISION']
    .includes(state)) return [state, 'street'];
  if (['GARAGE_ENTRY', 'GARAGE_HOLD', 'SECONDARY_CAR_LOAD'].includes(state)) {
    return [state, 'garage'];
  }
  if (['PLAYER_TAKES_WHEEL', 'GARAGE_ESCAPE', 'CITY_PURSUIT', 'ROADBLOCK',
    'INDUSTRIAL_ROUTE', 'VEHICLE_SWAP'].includes(state)) return [state, 'driving'];
  return [state, 'none'];
})));

export const PERFORMANCE_BUDGET = Object.freeze({
  maxCrew: 6,
  maxBankCivilians: 27,
  maxActivePoliceStreet: 12,
  maxActivePoliceGarage: 10,
  maxDynamicLights: 8,
  maxDecals: 96,
  maxCasings: 64,
  maxImpactParticles: 128,
  maxGlassFragments: 64,
  maxPoliceVehicles: 4,
  maxDialogueQueue: 4,
});
