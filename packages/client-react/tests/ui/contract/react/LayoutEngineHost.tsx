import type { ReactElement } from "react";

import {
  createDefaultLayoutPort,
  createLayoutMachine,
  type PanelId,
} from "@rtc/client-core";
import { useMachine } from "@rtc/react-bindings";

import { InhouseLayoutEngine } from "#/ui/shell/layout/engine/InhouseLayoutEngine";
import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";

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

export function LayoutEngineHost({
  headRegistry,
}: LayoutEngineHostProps): ReactElement {
  const { state, maximize, restore, collapse, expand, resize } = useMachine(
    () => {
      return createLayoutMachine(createDefaultLayoutPort("fx"));
    },
  );
  return (
    <InhouseLayoutEngine
      state={state}
      registry={layoutTestRegistry}
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
}
