import type { ReactElement } from "react";
import type { ComponentToken, MountedComponent } from "../shared/harness/component";
import { PnlValue, ConnectionStatusBar } from "../shared/components";
import { PnlValue as PnlValueComponent } from "../../../src/ui/fx/analytics/PnlValue";
import { ConnectionStatusBar as ConnectionStatusBarComponent } from "../../../src/ui/shell/connection/ConnectionStatusBar";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToken = ComponentToken<any, MountedComponent<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ElementFor = (props: Record<string, any>) => ReactElement;

/** token → React element factory. Identity-keyed; no string keys. */
export const registry = new Map<AnyToken, ElementFor>([
  [PnlValue, (p) => <PnlValueComponent value={p.value as number} />],
  [ConnectionStatusBar, () => <ConnectionStatusBarComponent />],
]);
