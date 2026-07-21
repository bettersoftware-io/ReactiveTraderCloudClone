/**
 * Per-point 3D projection for the boot scenes: yaw spin, pitch tilt, then a
 * perspective divide.
 *
 * Returns UNIT-SPACE coordinates. The caller applies centre, scale and screen-Y
 * sign, because the scenes disagree on all three: the globe treats +y as up
 * (`centerY - y * r`) while the schematic scenes treat it as down
 * (`centerY + y * r`). Keeping that out of the kernel is what lets one function
 * serve every scene.
 *
 * `perspectiveK` is the depth coefficient (0.22–0.30 across the eight scenes).
 * `minPerspectiveDenom` clamps the divisor: the cursor- and gyro-driven scenes
 * pass 0.4 so that a point swinging behind the camera cannot flip the
 * perspective sign and mirror the geometry. Omit it for fixed-tilt scenes,
 * whose depth range cannot reach the singularity.
 */
export interface Projection3dParams {
  readonly yaw: number;
  readonly pitch: number;
  readonly perspectiveK: number;
  readonly minPerspectiveDenom?: number;
}

export interface Projected3dPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly perspective: number;
}

export function project3d(
  x: number,
  y: number,
  z: number,
  params: Projection3dParams,
): Projected3dPoint {
  "worklet";

  const cosYaw = Math.cos(params.yaw);
  const sinYaw = Math.sin(params.yaw);
  const cosPitch = Math.cos(params.pitch);
  const sinPitch = Math.sin(params.pitch);

  const rotX = x * cosYaw - z * sinYaw;
  const rotZ = x * sinYaw + z * cosYaw;

  const pitchedY = y * cosPitch - rotZ * sinPitch;
  const depthZ = y * sinPitch + rotZ * cosPitch;

  const denom = 1 + depthZ * params.perspectiveK;
  const clamped =
    params.minPerspectiveDenom === undefined
      ? denom
      : Math.max(params.minPerspectiveDenom, denom);
  const perspective = 1 / clamped;

  return {
    x: rotX * perspective,
    y: pitchedY * perspective,
    z: depthZ,
    perspective,
  };
}
