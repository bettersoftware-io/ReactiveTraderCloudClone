import { type JSX, onCleanup } from "solid-js";

/** A tree-mount test fixture: records "probe" in `cleaned` when its reactive
 * owner is disposed — the witness that a tree's root was torn down. */
export function CleanupProbe(props: CleanupProbeProps): JSX.Element {
  onCleanup(() => {
    props.cleaned.push("probe");
  });

  return <div data-testid="probe" />;
}

export interface CleanupProbeProps {
  readonly cleaned: string[];
}
