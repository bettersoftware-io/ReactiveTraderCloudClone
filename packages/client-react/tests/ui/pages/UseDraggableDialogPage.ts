import { act, cleanup, renderHook } from "@testing-library/react";

import type {
  UseDraggableDialogOptions,
  UseDraggableDialogResult,
} from "#/ui/shell/modal/useDraggableDialog";
import { useDraggableDialog } from "#/ui/shell/modal/useDraggableDialog";

interface DraggableDialogHandle {
  readonly state: UseDraggableDialogResult;
  rerender(options: UseDraggableDialogOptions): void;
  /** Flushes a pointer-handler call so the following assertion sees the
   * resulting render synchronously. */
  commit(effects: () => void): void;
}

export interface UseDraggableDialogPage {
  mount(options: UseDraggableDialogOptions): DraggableDialogHandle;
  unmountAll(): void;
}

/** The framework surface for `useDraggableDialog.test.ts`. */
export function draggableDialogPage(): UseDraggableDialogPage {
  return {
    mount(options: UseDraggableDialogOptions): DraggableDialogHandle {
      const { result, rerender } = renderHook(
        (props: UseDraggableDialogOptions) => {
          return useDraggableDialog(props);
        },
        { initialProps: options },
      );

      return {
        get state(): UseDraggableDialogResult {
          return result.current;
        },
        rerender(nextOptions: UseDraggableDialogOptions): void {
          rerender(nextOptions);
        },
        commit(effects: () => void): void {
          act(effects);
        },
      };
    },
    unmountAll(): void {
      cleanup();
    },
  };
}
