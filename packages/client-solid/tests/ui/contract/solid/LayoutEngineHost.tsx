import type { JSX } from "solid-js";

import {
  createDefaultLayoutPort,
  createLayoutMachine,
  type LayoutPort,
  type PanelId,
} from "@rtc/client-core";
import { useMachine } from "@rtc/solid-bindings";

import { InhouseLayoutEngine } from "#/ui/shell/layout/engine/InhouseLayoutEngine";

import { layoutTestRegistry } from "./layoutTestRegistry";
import {
  pinnedFixtureLayoutPort,
  pinnedFixtureSpecs,
} from "./pinnedFixtureLayoutPort";

export function LayoutEngineHost(props: LayoutEngineHostProps): JSX.Element {
  // eslint-disable-next-line solid/reactivity -- props.pinnedFixture picks the LayoutPort fed into useMachine's factory below, which itself runs exactly once (Solid setup runs once, per useMachine's own doc comment); this test host is mounted fresh per contract test, never toggled on an existing instance
  const port: LayoutPort = props.pinnedFixture
    ? pinnedFixtureLayoutPort
    : createDefaultLayoutPort("fx");

  const { state, maximize, restore, collapse, expand, resize } = useMachine(
    () => {
      return createLayoutMachine(port);
    },
  );
  return (
    <InhouseLayoutEngine
      state={state()}
      registry={layoutTestRegistry}
      specs={props.pinnedFixture ? pinnedFixtureSpecs : undefined}
      headRegistry={props.headRegistry}
      onMaximize={maximize}
      onRestore={restore}
      onCollapse={collapse}
      onExpand={expand}
      onResize={resize}
    />
  );
}

interface LayoutEngineHostProps {
  headRegistry?: Partial<Record<PanelId, () => JSX.Element>>;
  /** Mounts the synthetic pinned + fixedPx fixture instead of the (now fully
   * resizable) default FX tree, to keep InhouseLayoutEngine's pinned/fixedPx
   * render branches — kept for a future non-resizable panel — covered by the
   * contract suite. See pinnedFixtureLayoutPort.ts. */
  pinnedFixture?: boolean;
}
