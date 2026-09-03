import { renderHook } from "@solidjs/testing-library";

import { useCreditView } from "#/ui/credit/useCreditView";

/** The framework surface for `useCreditView.test.ts`: renders the hook with
 * no provider mounted, so the guard's context-missing throw is observable by
 * wrapping this call in `expect(...).toThrow(...)`. */
export function renderCreditViewHook(): void {
  renderHook(() => {
    return useCreditView();
  });
}
