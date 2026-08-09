import type { ReactNode, Ref } from "react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { View } from "react-native";

interface SheetProps {
  children?: ReactNode;
  /** Fired when the sheet leaves the "presented" state — via `.dismiss()`,
   * `.close()`, a backdrop tap, or a pan-down-to-dismiss on the real
   * component. `TradeTicketSheet` and `AppearanceOverlay` both wire this to
   * their own `onClose`, so a double that never calls it can't catch a
   * caller that dropped the wiring — which is exactly what this double did
   * until this prop and the calls below were added: `dismiss()`/`close()`
   * flipped local state but never told the caller, so nothing in this
   * package could ever observe TradeTicketSheet's machine-driven auto-close
   * actually closing the sheet. */
  onDismiss?: () => void;
}

interface ViewSheetProps extends SheetProps {
  testID?: string;
}

interface BottomSheetHandle {
  present: () => void;
  dismiss: () => void;
  close: () => void;
}

/** Test double: gates `children` behind the imperative handle rather than
 * always rendering them — mirrors the real component's own contract (its
 * `mount` state starts `false`; content only portal-mounts after
 * `.present()`). A double that renders unconditionally would pass a caller's
 * "is the sheet showing" assertion even if that caller never called
 * `.present()` at all, which is exactly the class of bug this double exists
 * to let a test catch. */
export const BottomSheetModal = forwardRef(function BottomSheetModal(
  props: SheetProps,
  ref: Ref<BottomSheetHandle>,
) {
  const [presented, setPresented] = useState(false);

  useImperativeHandle(ref, () => {
    return {
      present: (): void => {
        setPresented(true);
      },
      dismiss: (): void => {
        setPresented(false);
        props.onDismiss?.();
      },
      close: (): void => {
        setPresented(false);
        props.onDismiss?.();
      },
    };
  });

  if (!presented) {
    return null;
  }

  // No `testID` here: the real `BottomSheetModalProps` doesn't carry one (a
  // caller testID's the CONTENT via `BottomSheetView` below, not the modal
  // itself), so a hardcoded literal here would assert nothing a real render
  // could match.
  return <View>{props.children}</View>;
});

export function BottomSheetModalProvider(props: SheetProps): React.JSX.Element {
  return <View>{props.children}</View>;
}

/** Forwards `testID` — unlike `BottomSheetModal`'s own props (the real
 * `BottomSheetModalProps` has no `testID` field), the real
 * `BottomSheetViewProps` extends RN's `ViewProps` and spreads it onto a real
 * `View`, so a caller can and does testID its sheet content this way. */
export function BottomSheetView(props: ViewSheetProps): React.JSX.Element {
  return <View testID={props.testID}>{props.children}</View>;
}

export function BottomSheetBackdrop(): null {
  return null;
}
