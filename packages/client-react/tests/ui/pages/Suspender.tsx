import { type ReactElement, use } from "react";

/** A page fixture, in its own module so it can be a plain exported component
 * (biome's `useComponentExportOnlyModules`). */

export interface SuspenderProps {
  readonly data: Promise<string>;
}

/** Suspends until `data` resolves, then renders it. */
export function Suspender({ data }: SuspenderProps): ReactElement {
  return <div data-testid="suspender">{use(data)}</div>;
}
