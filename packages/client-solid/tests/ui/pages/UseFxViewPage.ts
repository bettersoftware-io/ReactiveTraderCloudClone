import { renderHook } from "@solidjs/testing-library";

import { useFxView } from "#/ui/fx/useFxView";

/** The framework surface for `useFxView.test.ts`: renders the hook with no
 * provider mounted, so the guard's context-missing throw is observable by
 * wrapping this call in `expect(...).toThrow(...)`. */
export function renderFxViewHook(): void {
  renderHook(() => {
    return useFxView();
  });
}
