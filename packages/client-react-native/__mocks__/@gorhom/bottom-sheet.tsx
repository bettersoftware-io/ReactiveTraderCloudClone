import type { ReactNode, Ref } from "react";
import { forwardRef, useImperativeHandle } from "react";
import { View } from "react-native";

interface SheetProps {
  children?: ReactNode;
}

interface BottomSheetHandle {
  present: () => void;
  dismiss: () => void;
  close: () => void;
}

/** Test double: renders children inline (always "open") and exposes a no-op
 * imperative present/dismiss/close so tiles can call ref.present(). */
export const BottomSheetModal = forwardRef(function BottomSheetModal(
  props: SheetProps,
  ref: Ref<BottomSheetHandle>,
) {
  useImperativeHandle(ref, () => {
    return { present: () => {}, dismiss: () => {}, close: () => {} };
  });
  return <View testID="bottom-sheet">{props.children}</View>;
});

export function BottomSheetModalProvider(props: SheetProps): React.JSX.Element {
  return <View>{props.children}</View>;
}

export function BottomSheetView(props: SheetProps): React.JSX.Element {
  return <View>{props.children}</View>;
}

export function BottomSheetBackdrop(): null {
  return null;
}
