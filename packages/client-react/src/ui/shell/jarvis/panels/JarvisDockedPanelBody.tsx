import type { ReactElement } from "react";

import type { JarvisPanelVm } from "@rtc/client-core";
import { useViewModel } from "@rtc/react-bindings";

import { JarvisPanelBody } from "./JarvisPanelBody";

/**
 * A docked desk panel's body — the leaf `InhouseLayoutEngine`'s dynamic
 * registry renders for a docked `panelId` (see `dockedRegistryFor` in
 * `appPanelRegistry.tsx`, wired from `App.tsx`'s `WorkspaceEngine`). Reuses
 * the SAME `JarvisPanelBody` switch (unsupported / pending / per-viz-kind
 * renderer) the floating layer's `JarvisPanelCard` uses, so a spec edit
 * ("make it a table") restyles a docked panel in place exactly like a
 * floating one — only the chrome (this file's sibling
 * `JarvisDockedPanelHead`, plus the engine's own collapse/maximize
 * controls) differs from the floating card's.
 *
 * `panel` is passed down from the same `JarvisPanelVm` row `dockedRegistryFor`
 * built its registry entry from, rather than re-derived here by id — the
 * registry closures are rebuilt every render `WorkspaceEngine` re-runs
 * (cheap: plain object literals), so this stays live without a second
 * lookup. `useJarvisPanelData` is still the one independent, per-panel
 * subscription (mirrors `JarvisPanelCard`'s own split) so this panel's tick
 * cadence never forces a re-render of its siblings.
 */
export function JarvisDockedPanelBody({
  panel,
}: JarvisDockedPanelBodyProps): ReactElement {
  const { useJarvisPanelData } = useViewModel();
  const data = useJarvisPanelData(panel.panelId);

  return <JarvisPanelBody panel={panel} data={data} />;
}

interface JarvisDockedPanelBodyProps {
  panel: JarvisPanelVm;
}
