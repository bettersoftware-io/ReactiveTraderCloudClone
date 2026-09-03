import { renderHook } from "@solidjs/testing-library";

import type {
  UseDraggableDialogOptions,
  UseDraggableDialogResult,
} from "#/ui/shell/modal/useDraggableDialog";
import { useDraggableDialog } from "#/ui/shell/modal/useDraggableDialog";

export interface UseDraggableDialogPage {
  mount(options: UseDraggableDialogOptions): UseDraggableDialogResult;
}

/** The framework surface for `useDraggableDialog.test.ts`. */
export function draggableDialogPage(): UseDraggableDialogPage {
  return {
    mount(options: UseDraggableDialogOptions): UseDraggableDialogResult {
      const { result } = renderHook(() => {
        return useDraggableDialog(options);
      });

      return result;
    },
  };
}
