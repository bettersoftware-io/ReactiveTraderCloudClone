import type { PanelSpecV1 } from "@rtc/shared";

import type { StateStream } from "#/stream";

export type PanelStatus = "live" | "unsupported";

export interface PanelInstance {
  readonly panelId: string;
  /** null when `status` is "unsupported" — see `UNSUPPORTED_SENTINEL_SPEC`'s doc. */
  readonly spec: PanelSpecV1 | null;
  readonly status: PanelStatus;
  /** True once the panel has been docked into the workspace via `dockPanel`
   * (or restored docked at boot via `restoreDockedPanel`) — false for every
   * fresh wire spawn. A docked panel is invisible to `MAX_LIVE_PANELS`'s
   * floating cap; see that const's doc. */
  readonly docked: boolean;
}

export interface JarvisPanelsState {
  readonly panels: readonly PanelInstance[];
}

/** `createJarvisPanelsMachine`'s return — named (rather than inline) to match
 * `JarvisMachine.ts`'s `JarvisMachineHandle` idiom for its own factory
 * return. */
export interface JarvisPanelsMachineHandle {
  readonly state$: StateStream<JarvisPanelsState>;
  readonly dismissPanel: (panelId: string) => void;
  readonly dockPanel: (panelId: string) => void;
  readonly undockPanel: (panelId: string) => void;
  /** Boot-time rehydration ONLY: append a docked panel restored from the
   * persisted workspace payload. Ignores the floating cap; respects
   * `MAX_DOCKED_PANELS` (excess silently dropped). */
  readonly restoreDockedPanel: (panelId: string, spec: PanelSpecV1) => void;
}
