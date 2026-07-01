import type { ReactElement } from "react";

import type { PanelId } from "@rtc/client-core";

/** Maps a panel id to the module root that fills it. The app references panels
 * only by id; this registry is the single id→component map (Task 5 wires the
 * real module roots). */
export type PanelRegistry = Record<PanelId, () => ReactElement>;
