import type { ObservedValueOf } from "rxjs";

import type {
  JarvisPanelsMachineHandle,
  JarvisPort,
  WorkspaceTab,
} from "@rtc/core-api";

/* The Jarvis wire types, derived from `@rtc/core-api` rather than imported
 * from `@rtc/shared` — this package depends on core-api and domain only. */

/** One reply event of a Jarvis turn. */
export type JarvisEvent = ObservedValueOf<ReturnType<JarvisPort["ask"]>>;

/** A desk panel's spec, as a `panel` event carries it. */
export type PanelSpec = Parameters<
  JarvisPanelsMachineHandle["restoreDockedPanel"]
>[1];

interface CommandTag {
  readonly type: "command";
}

/** One drive batch, as a `command` event carries it. */
type DriveBatch = Extract<JarvisEvent, CommandTag>["batch"];

/** One drive command of a batch. */
export type DriveCommand = DriveBatch["commands"][number];

/** The four workspace tabs, in nav order. */
export const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  "fx",
  "credit",
  "equities",
  "admin",
];
