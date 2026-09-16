// packages/client-react-native/tests/pages/support/flattenStyle.ts
//
// The single home for "read a rendered node's resolved style", so no page
// object calls `StyleSheet.flatten` directly. Two reasons, one of them
// load-bearing for an upgrade this package cannot take yet.
//
// 1. The `as TextStyle` this replaces was a FICTION. Every one of the 23 call
//    sites wrote `StyleSheet.flatten(n.props.style as TextStyle)`, asserting a
//    type about a value — whatever the component happened to render into
//    `style` — that nothing had checked. The node goes in here instead, and
//    the style comes out; no cast at any call site.
//
// 2. It is the shape react-native 0.87 REQUIRES, written while this package is
//    still on 0.86. 0.87 flips `package.json`'s `exports` so the `types`
//    condition resolves to `./types_generated/index.d.ts` (Flow-derived) and
//    demotes the hand-written `./types/index.d.ts` to a
//    `react-native-legacy-deep-imports` condition. Both trees ship in one
//    tarball, so a mismatch between them reports as TS2719 ("two different
//    types with this name exist") with BOTH sides pointing into the same
//    `react-native@0.87.x` directory — two type systems in one install, not
//    two installs. Under the generated types `StyleSheet.flatten` becomes
//
//      <T>(style: null | undefined | T)
//        => null | undefined | NonAnimatedNodeObject<____FlattenStyleProp_Internal<T>>
//
//    which breaks the old idiom twice over: the result is NULLABLE, and it is
//    a DERIVED type rather than the `T` that went in. Routing every page
//    object through one function means that upgrade touches this file only.
//
// WHY 0.86 STILL: the 0.87 bump is blocked on Expo, not on types —
// `@expo/metro-config@57.0.12` (the last SDK 57 release) does
// `require(path.join(reactNativeHostPath, "rn-get-polyfills"))`, and 0.87
// deleted that file along with its `@react-native/js-polyfills` dependency,
// so Metro cannot bundle at all. Expo SDK 58 is the fix. See docs/STATUS.md.
//
// A node with no style at all THROWS rather than returning a nullish value a
// caller would then read a property off. Every caller in this tree asserts
// against a style the component is expected to have rendered, so an absent one
// is a broken test, not a legitimate reading — and the throw names the node,
// which `expected undefined to be 56` would not.
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { StyleSheet } from "react-native";

type StyleLike = ViewStyle | TextStyle | ImageStyle;

/** The structural slice of RNTL's `ReactTestInstance` this needs — kept local
 * so a page object can pass a `getByTestId`/`getByText` result without the
 * support module depending on RNTL's own exported instance type. */
interface StyledNodeLike {
  type: unknown;
  props: {
    style?: unknown;
    testID?: unknown;
  };
}

/** How the throw refers to a node: its `testID` when it has one (the usual
 * case — pages address nodes by test id), otherwise its element type, which
 * is what a `getByText` lookup leaves to go on. */
function describeNode(node: StyledNodeLike): string {
  const { testID } = node.props;

  if (typeof testID === "string" && testID.length > 0) {
    return `testID=${testID}`;
  }

  return typeof node.type === "string" ? `<${node.type}>` : "<unknown>";
}

/** A rendered node's resolved style, flattened from whatever array/falsy
 * `StyleProp` shape the component passed. Throws when the node rendered no
 * style. `T` is normally inferred from the calling page method's declared
 * return type. */
export function flattenStyleOf<T extends StyleLike>(node: StyledNodeLike): T {
  const flattened = StyleSheet.flatten(node.props.style as StyleLike);

  if (flattened == null) {
    throw new Error(
      `flattenStyleOf: node has no style (${describeNode(node)})`,
    );
  }

  return flattened as T;
}
