/**
 * Cecilio's people service the Brushrunner while the return cargo is loaded,
 * then put it at the high end of the strip ready for the downhill departure.
 * Kept independent of the mission controller so this critical handoff is
 * covered by the fast Node suite.
 */
export function stageRemoteDeparture({
  physics,
  input,
  engines,
  aircraft,
  runway,
  gearHeight,
  heading,
}) {
  const position = physics.position.clone().set(
    runway.x,
    runway.y + gearHeight,
    runway.z,
  );

  input.clear?.();
  input.throttle = 0;
  input.throttleSplit = 0;
  input.flaps = 0.5;
  input.brake = 0;
  input.airBrake = 0;
  input.parkingBrake = true;

  physics.damage.wing = 0;
  physics.damage.gear = 0;
  physics.damage.tireBurst = false;
  physics.setPose(position, heading, 0);
  Object.assign(physics.controls, {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttleL: 0,
    throttleR: 0,
    flaps: 0.5,
    brake: 0,
    airBrake: 0,
    parkingBrake: true,
  });

  engines.reset(true);
  engines.forceRunning();
  engines.setThrottles(0);
  aircraft.syncTo(physics);

  return Object.freeze({
    x: position.x,
    y: position.y,
    z: position.z,
    heading,
  });
}
