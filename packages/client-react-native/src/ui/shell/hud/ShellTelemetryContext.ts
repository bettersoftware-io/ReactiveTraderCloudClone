// packages/client-react-native/src/ui/shell/hud/ShellTelemetryContext.ts
import { createContext } from "react";

/** A frozen telemetry snapshot the visual harness injects so the FPS readout
 * is deterministic across golden captures (the RN analogue of the web
 * `LiveMetricsContext`). `null` in production ⇒ the live meter runs. */
export interface FrozenTelemetry {
  readonly fps: number;
  readonly latencyMs: number;
}

export const ShellTelemetryContext = createContext<FrozenTelemetry | null>(
  null,
);
