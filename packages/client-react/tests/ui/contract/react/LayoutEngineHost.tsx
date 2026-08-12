import type { ReactElement } from "react";

import {
  createDefaultLayoutPort,
  createLayoutMachine,
  type LayoutPort,
  type PanelId,
} from "@rtc/client-core";
import { useMachine } from "@rtc/react-bindings";

import { InhouseLayoutEngine } from "#/ui/shell/layout/engine/InhouseLayoutEngine";

import { layoutTestRegistry } from "./layoutTestRegistry";
import {
  pinnedFixtureLayoutPort,
  pinnedFixtureSpecs,
} from "./pinnedFixtureLayoutPort";

export function LayoutEngineHost({
  headRegistry,
  pinnedFixture,
}: LayoutEngineHostProps): ReactElement {
  const port: LayoutPort = pinnedFixture
    ? pinnedFixtureLayoutPort
    : createDefaultLayoutPort("fx");

  const { state, maximize, restore, collapse, expand, resize } = useMachine(
    () => {
      return createLayoutMachine(port);
    },
  );
  return (
    <InhouseLayoutEngine
      state={state}
      registry={layoutTestRegistry}
      specs={pinnedFixture ? pinnedFixtureSpecs : undefined}
      headRegistry={headRegistry}
      onMaximize={maximize}
      onRestore={restore}
      onCollapse={collapse}
      onExpand={expand}
      onResize={resize}
    />
  );
}

interface LayoutEngineHostProps {
  headRegistry?: Partial<Record<PanelId, () => ReactElement>>;
  /** Mounts the synthetic pinned + fixedPx fixture instead of the (now fully
   * resizable) default FX tree, to keep InhouseLayoutEngine's pinned/fixedPx
   * render branches — kept for a future non-resizable panel — covered by the
   * contract suite. See pinnedFixtureLayoutPort.ts. */
  pinnedFixture?: boolean;
}
