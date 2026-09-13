import type { App, MachineFactories } from "@rtc/core-api";

import type { ScriptedDriver } from "#/harness/scriptedPorts";

export interface CoreHarness {
  app: App;
  machines: MachineFactories;
  driver: ScriptedDriver;
  teardown(): Promise<void>;
}

export type MakeHarness = () => CoreHarness;

export type Suite = (label: string, makeHarness: MakeHarness) => void;
