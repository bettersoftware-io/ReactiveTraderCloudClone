import { Gyroscope, type GyroscopeMeasurement } from "expo-sensors";
import { useEffect } from "react";
import { type SharedValue, useSharedValue } from "react-native-reanimated";

/**
 * Feeds the boot scene's cursor-equivalent pointer seam from the device
 * gyroscope. The web's cursor-driven scenes fold a normalized `{mx, my}`
 * (−1..1) pointer into yaw/pitch (`client-react/.../BootSequence.tsx:72-77`);
 * RN has no cursor, so this hook produces the identical shape from rotation
 * rate — a leaky integrator that self-centres when the device is still,
 * rather than a raw (unbounded) angle.
 *
 * Subscribes only while `enabled`, and only once `Gyroscope.isAvailableAsync`
 * confirms the sensor exists (simulators and some devices have none). The
 * listener is removed — and the value reset to centre — on unmount and
 * whenever `enabled` goes false, so a disabled scene renders centred rather
 * than frozen at the last drift.
 */
export function useGyroDrift(enabled: boolean): SharedValue<GyroDrift> {
  const drift = useSharedValue<GyroDrift>(CENTERED);

  useEffect(() => {
    if (!enabled) {
      drift.value = CENTERED;
      return;
    }

    let cancelled = false;
    let subscription: GyroSubscription | undefined;

    Gyroscope.isAvailableAsync()
      .then((available) => {
        if (cancelled || !available) {
          return;
        }

        Gyroscope.setUpdateInterval(UPDATE_INTERVAL_MS);
        subscription = Gyroscope.addListener((measurement) => {
          drift.value = integrateDrift(drift.value, measurement);
        });
      })
      .catch(() => {
        // No gyroscope, or the availability probe rejected — leave the
        // scene centred; never throw or warn on every boot.
      });

    return () => {
      cancelled = true;
      subscription?.remove();
      drift.value = CENTERED;
    };
  }, [enabled, drift]);

  return drift;
}

export interface GyroDrift {
  mx: number;
  my: number;
}

type GyroSubscription = ReturnType<typeof Gyroscope.addListener>;

/** Do not sample faster than the boot scene renders. */
const UPDATE_INTERVAL_MS = 60;

/** Per-sample leak toward centre, so the offset drifts back to {0,0} once
 * the device stops rotating instead of holding the last value forever. */
const DECAY = 0.9;

/** rad/s → normalized-offset scale per sample interval, tuned so an ordinary
 * hand-tilt reads as a noticeable but not disorienting drift. */
const GAIN = 4;

const SAMPLE_DT_S: number = UPDATE_INTERVAL_MS / 1000;

const CENTERED: GyroDrift = { mx: 0, my: 0 };

/** Leaky-integrate one gyroscope sample into the bounded pointer offset:
 * decay the previous offset toward centre, add this sample's contribution,
 * then clamp — so the value can never accumulate unbounded regardless of how
 * large or how long a run of samples arrives.
 *
 * Axis mapping follows head-tracking convention: rotation about the
 * device's Y axis (yaw — turning left/right) drives `mx`; rotation about
 * the X axis (pitch — tilting up/down) drives `my`. */
function integrateDrift(
  prev: GyroDrift,
  measurement: GyroscopeMeasurement,
): GyroDrift {
  return {
    mx: integrateAxis(prev.mx, measurement.y),
    my: integrateAxis(prev.my, measurement.x),
  };
}

function integrateAxis(prev: number, rate: number): number {
  return clamp(prev * DECAY + rate * GAIN * SAMPLE_DT_S);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(-1, value));
}
