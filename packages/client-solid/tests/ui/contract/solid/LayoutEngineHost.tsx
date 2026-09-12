import type { JSX } from "solid-js";
import { untrack } from "solid-js";

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
  // Picks the LayoutPort handed to the machine factory below, which runs
  // exactly once: a deliberate snapshot of the fixture this host mounted
  // with, spelt `untrack`. The props.pinnedFixture read in the JSX stays live.
  const port = untrack((): LayoutPort => {
    return props.pinnedFixture
      ? pinnedFixtureLayoutPort
      : createDefaultLayoutPort("fx");
  });

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
