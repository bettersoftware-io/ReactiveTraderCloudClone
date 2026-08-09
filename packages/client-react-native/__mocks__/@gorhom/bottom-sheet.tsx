import type { ReactNode, Ref } from "react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { View } from "react-native";

interface SheetProps {
  children?: ReactNode;
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
      },
      close: (): void => {
        setPresented(false);
      },
    };
  });

  if (!presented) {
    return null;
  }

  return <View testID="bottom-sheet">{props.children}</View>;
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
