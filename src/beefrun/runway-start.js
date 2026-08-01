/**
 * Put the outbound Brushrunner at the runway threshold before its engines are
 * started. This stays dependency-free so the on-foot-to-flight handoff can be
 * exercised by the Node suite without loading the renderer.
 */
export function stageRunwayStartup({
  physics,
  input,
  engines,
  aircraft,
  runway,
  elevation,
  gearHeight,
  heading,
}) {
  const position = physics.position.clone().set(
    runway.x,
    elevation + gearHeight,
    runway.z,
  );

  // E boards on foot but becomes right rudder in the cockpit. Clear it along
  // with any stale throttle/brake state before moving the attached occupants.
  input.clear?.();
  input.parkingBrake = true;
  input.throttle = 0;
  input.throttleSplit = 0;
  input.brake = 0;
  physics.setPose(position, heading, 0);
  physics.controls.pitch = 0;
  physics.controls.roll = 0;
  physics.controls.yaw = 0;
  physics.controls.throttleL = 0;
  physics.controls.throttleR = 0;
  physics.controls.brake = 0;
  physics.controls.parkingBrake = true;
  engines.setThrottles(0);
  aircraft.syncTo(physics);

  return Object.freeze({
    x: position.x,
    y: position.y,
    z: position.z,
    heading,
  });
}
