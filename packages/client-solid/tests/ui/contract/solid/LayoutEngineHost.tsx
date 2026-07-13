import type { JSX } from "solid-js";

import {
  createDefaultLayoutPort,
  createLayoutMachine,
  type LayoutPort,
  type PanelId,
} from "@rtc/client-core";
import { useMachine } from "@rtc/solid-bindings";

import { InhouseLayoutEngine } from "#/ui/shell/layout/engine/InhouseLayoutEngine";
import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";

import {
  pinnedFixtureLayoutPort,
  pinnedFixtureSpecs,
} from "./pinnedFixtureLayoutPort";

const layoutTestRegistry: PanelRegistry = {
  "fx-rates": () => {
    return <div data-testid="fx-rates-body">RATES</div>;
  },
  "fx-analytics": () => {
    return <div data-testid="fx-analytics-body">ANALYTICS</div>;
  },
  "fx-positions": () => {
    return <div data-testid="fx-positions-body">POSITIONS</div>;
  },
  "fx-blotter": () => {
    return <div data-testid="fx-blotter-body">BLOTTER</div>;
  },
  "credit-rfqs": () => {
    return <div data-testid="credit-rfqs-body">RFQS</div>;
  },
  "credit-blotter": () => {
    return <div data-testid="credit-blotter-body">CREDIT BLOTTER</div>;
  },
  "admin-throughput": () => {
    return <div data-testid="admin-throughput-body">ADMIN</div>;
  },
};

export function LayoutEngineHost(props: LayoutEngineHostProps): JSX.Element {
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
