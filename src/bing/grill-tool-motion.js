/** The contact pose lands at 56% for every implement; the rules still own hits. */
export function grillToolPose(id, progress) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  const smooth = (v) => v * v * (3 - 2 * v);
  const reach = p < 0.56 ? smooth(p / 0.56) : 1 - smooth((p - 0.56) / 0.44);
  const wind = p < 0.28 ? Math.sin(p / 0.28 * Math.PI) : 0;
  const position = [0.17, -0.22, -0.38];
  const rotation = [-0.32, 0.46, 0.10];
  switch (id) {
    case 'ice': // Raise the bucket, tip its rim, then bring it upright.
      position[1] += reach * 0.18; position[2] -= reach * 0.20;
      rotation[0] += reach * 1.7; rotation[2] -= reach * 0.28;
      break;
    case 'tongs': // A short, deliberate reach rather than a club swing.
      position[0] -= reach * 0.10; position[2] -= reach * 0.31;
      rotation[0] += reach * 0.32; rotation[1] -= reach * 0.42;
      break;
    case 'sauce': // Turn the bottle mouth down over the chair.
      position[0] -= reach * 0.06; position[1] += reach * 0.12;
      position[2] -= reach * 0.22; rotation[2] -= reach * 1.8;
      break;
    default: // Meat tenderiser: lift, then a compact downward strike.
      position[1] += wind * 0.15 - reach * 0.14;
      position[2] -= reach * 0.18;
      rotation[0] -= wind * 1.1; rotation[0] += reach * 1.8;
      rotation[2] += wind * 0.45 - reach * 0.3;
  }
  return { position, rotation };
}
