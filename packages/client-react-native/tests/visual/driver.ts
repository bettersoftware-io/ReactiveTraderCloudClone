import type { ReactNode } from "react";

import type { ThemeMode, ThemeSkin } from "@rtc/domain";

/** One capturable surface: a pinned skin×mode leaf composed under
 * `VisualScenarioHost` (see `VisualScenarioHost.tsx`). `build()` returns the
 * element tree a driver mounts and screenshots. */
export interface Scenario {
  id: string;
  skin: ThemeSkin;
  mode: ThemeMode;
  build: () => ReactNode;
}

/** A capture backend (Tier 1 `simctl`, Tier 2 Maestro, Tier 3 owl). Each tier
 * implements this against the shared `SCENARIOS` registry; `capture` returns
 * the raw PNG bytes for the diff core (Tiers 1+2) or is unused where owl owns
 * its own capture+diff pipeline (Tier 3 uses the registry only, not this
 * interface's `capture`). */
export interface VisualDriver {
  name: "simctl" | "maestro" | "owl";
  capture(scenarioId: string): Promise<Buffer>;
}
