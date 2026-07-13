import type { JSX } from "solid-js";

import type { PanelId } from "@rtc/client-core";

/** Maps a panel id to the module root that fills it. The app references panels
 * only by id; this registry is the single id→component map (Task 13+ wires the
 * real module roots). */
export type PanelRegistry = Record<PanelId, () => JSX.Element>;
