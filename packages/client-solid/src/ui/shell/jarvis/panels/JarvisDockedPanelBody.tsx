import type { JSX } from "solid-js";

import type { JarvisPanelVm } from "@rtc/client-core";
import { useViewModel } from "@rtc/solid-bindings";

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
 * `panel` is a plain `JarvisPanelVm` (not an accessor) — the same row
 * `dockedRegistryFor` closed over when it built this registry entry.
 * `InhouseLayoutEngine`'s `PanelLeaf` reads `props.registry[panelId]?.()`
 * reactively (see that file's doc), so a fresh closure — and a fresh mount
 * of this component — is produced whenever `WorkspaceEngine`'s merged
 * `registry` memo re-runs (any dock/undock/edit); a second, independent
 * re-derivation by id inside this component would be redundant.
 * `useJarvisPanelData` is still the one independent, per-panel subscription
 * (mirrors `JarvisPanelCard`'s own split) so this panel's tick cadence
 * never forces a re-render of its siblings.
 */
export function JarvisDockedPanelBody(
  props: JarvisDockedPanelBodyProps,
): JSX.Element {
  const { useJarvisPanelData } = useViewModel();
  // eslint-disable-next-line solid/reactivity -- setup-scope read is correct: `props.panel` is a plain (non-signal) value, fixed for this component's whole lifetime — see the doc comment above.
  const data = useJarvisPanelData(props.panel.panelId);

  function panel(): JarvisPanelVm {
    return props.panel;
  }

  return <JarvisPanelBody panel={panel} data={data()} />;
}

interface JarvisDockedPanelBodyProps {
  panel: JarvisPanelVm;
}
