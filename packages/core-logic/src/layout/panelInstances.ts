import { MAX_PANEL_INSTANCES as DOMAIN_MAX_PANEL_INSTANCES } from "@rtc/domain";

import type { PanelId } from "./layoutPort";

/** Global cap on dynamically opened panel instances (Phase 4) — mirrors the
 * `MAX_DOCKED_PANELS = 4` precedent in `composition.ts` /
 * `JarvisPanelsMachine.ts`. Lives in `layout/` (not beside the machine in
 * `presenters/`) so both the layout machine and the workspace persistence
 * parser import the ONE definition — `presenters` already imports from
 * `layout`, never the reverse. */
export const MAX_PANEL_INSTANCES: number = DOMAIN_MAX_PANEL_INSTANCES;

/** Builds the engine panelId for a dynamically opened instance — `id` doubles
 * as the panelId so every id-keyed subsystem (registry, blob, strips, pins)
 * needs no new key shape. The persistence parser also uses it to reject an
 * entry whose `id` disagrees with its `kind`/`symbol`. */
export function instanceIdFor(kind: "eq-chart", symbol: string): PanelId {
  return `${kind}:${symbol}`;
}

/** Whether `panelId` lies in the chart-instance id namespace
 * (`instanceIdFor("eq-chart", "")` — the prefix every instance id starts
 * with). Used to keep a non-instance panel (a Jarvis-docked id off the wire)
 * from ever claiming an id an instance could hold. */
export function isPanelInstanceId(panelId: string): boolean {
  return panelId.startsWith(instanceIdFor("eq-chart", ""));
}
