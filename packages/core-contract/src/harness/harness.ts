import type { App, MachineFactories } from "@rtc/core-api";

import type { HarnessSeed, ScriptedDriver } from "#/harness/scriptedPorts";

export interface CoreHarness {
  app: App;
  machines: MachineFactories;
  driver: ScriptedDriver;
  /** Disposes the running app and composes a new one over the SAME ports,
   * as a hot swap does. Resolves to the new app; `teardown` disposes it. */
  recompose(): Promise<App>;
  teardown(): Promise<void>;
}

/** A runner builds one harness per test. The optional seed is state the
 * world must ALREADY hold when the app is composed — a driver verb can only
 * act afterwards. */
export type MakeHarness = (seed?: HarnessSeed) => CoreHarness;

export type Suite = (label: string, makeHarness: MakeHarness) => void;
