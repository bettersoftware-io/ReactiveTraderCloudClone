import type { Accessor, JSX } from "solid-js";
import { createMemo, Show } from "solid-js";

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
 * `panelId` is a plain, stable string (this component is mounted once per
 * docked id — see `dockedRegistryFor`'s doc for why the REGISTRY itself no
 * longer changes identity on a same-membership tick) — `dockedPanels` is
 * the shared `useJarvisPanels()` accessor threaded down from `App.tsx`'s
 * `WorkspaceEngine` rather than re-subscribed here, so this component does
 * its OWN reactive lookup for its current row: a restyle updates THIS one
 * already-mounted leaf's body in place, without the containing registry
 * ever needing to change (which is what caused the identity-churn bug this
 * shape fixes — see `App.tsx`'s `registry` memo doc). `useJarvisPanelData`
 * is still the one independent, per-panel subscription (mirrors
 * `JarvisPanelCard`'s own split) so this panel's tick cadence never forces
 * a re-render of its siblings.
 */
export function JarvisDockedPanelBody(
  props: JarvisDockedPanelBodyProps,
): JSX.Element {
  const { useJarvisPanelData } = useViewModel();
  // eslint-disable-next-line solid/reactivity -- setup-scope read is correct: `props.panelId` is a plain string, fixed for this component's whole lifetime (one mount per docked id — see the doc comment above), not a captured object field the way it was before this file's identity-churn fix; `solid/reactivity` flags any `props.x` read outside a tracked scope regardless of nesting depth, so the rule still fires on the simpler shape too — verified empirically, this disable does not become removable.
  const data = useJarvisPanelData(props.panelId);

  const panel = createMemo((): JarvisPanelVm | undefined => {
    return props.dockedPanels().find((row) => {
      return row.panelId === props.panelId;
    });
  });

  return (
    <Show when={panel()}>
      {(currentPanel: Accessor<JarvisPanelVm>): JSX.Element => {
        return <JarvisPanelBody panel={currentPanel} data={data()} />;
      }}
    </Show>
  );
}

interface JarvisDockedPanelBodyProps {
  panelId: string;
  dockedPanels: Accessor<readonly JarvisPanelVm[]>;
}
