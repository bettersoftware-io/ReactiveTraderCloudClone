import { renderHook } from "@solidjs/testing-library";

import {
  type UseDraggableDialogOptions,
  type UseDraggableDialogResult,
  useDraggableDialog,
} from "#/ui/shell/modal/useDraggableDialog";

import { thenFlush } from "./thenFlush";

export interface UseDraggableDialogPage {
  mount(options: UseDraggableDialogOptions): UseDraggableDialogResult;
}

/** The framework surface for `useDraggableDialog.test.ts`. Each drag
 * handler is followed by a flush (see `thenFlush`), so a test reads each
 * pointer event's outcome as the next event would. */
export function draggableDialogPage(): UseDraggableDialogPage {
  return {
    mount(options: UseDraggableDialogOptions): UseDraggableDialogResult {
      const { result } = renderHook(() => {
        return useDraggableDialog(options);
      });

      return {
        ...result,
        headerProps: {
          onPointerDown: thenFlush(result.headerProps.onPointerDown),
          onPointerMove: thenFlush(result.headerProps.onPointerMove),
          onPointerUp: thenFlush(result.headerProps.onPointerUp),
          onPointerCancel: thenFlush(result.headerProps.onPointerCancel),
        },
      };
    },
  };
}
