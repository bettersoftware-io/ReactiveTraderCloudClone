// packages/client-react-native/tests/pages/LockEmblemPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";

import { LockEmblem } from "#/ui/shell/lock/LockEmblem";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

export interface LockEmblemPage {
  mount(): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  /** What each `<Svg>` in the emblem holds, in render order. */
  layers(): EmblemLayer[];
  /** How the orbit is turned: the rotation of the view wrapping its layer,
   * and any SVG `rotation` prop on the orbit circle itself. */
  orbitTurn(): OrbitTurn;
}

interface OrbitTurn {
  readonly viewRotation: string | null;
  readonly svgRotation: unknown;
}

interface EmblemLayer {
  /** The drop-shadow `<Filter>` the hexes are drawn under. */
  readonly holdsGlowFilter: boolean;
  /** The dashed orbit circle, the part that animates. */
  readonly holdsOrbit: boolean;
}

/** The framework surface for `LockEmblem.test.tsx`. */
export function lockEmblemPage(): LockEmblemPage {
  return {
    async mount(): Promise<void> {
      await renderWithTheme(<LockEmblem />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    orbitTurn(): OrbitTurn {
      // The view whose DIRECT child is the orbit's <Svg> — the emblem's outer
      // View holds the orbit too, one level further down.
      const wrapper = findHosts(screen.toJSON(), "View").find((view) => {
        return (view.children ?? []).some((child) => {
          return (
            findHosts(child, "RNSVGSvgView")[0] === child &&
            findHosts(child, "RNSVGCircle").some(isOrbit)
          );
        });
      });

      const transform = StyleSheet.flatten(
        wrapper?.props.style as StyleProp<ViewStyle>,
      )?.transform;

      const rotate = Array.isArray(transform)
        ? (transform as readonly Record<string, unknown>[]).find((step) => {
            return "rotate" in step;
          })?.rotate
        : undefined;

      return {
        viewRotation: typeof rotate === "string" ? rotate : null,
        svgRotation: findHosts(screen.toJSON(), "RNSVGCircle").find(isOrbit)
          ?.props.rotation,
      };
    },
    layers(): EmblemLayer[] {
      return findHosts(screen.toJSON(), "RNSVGSvgView").map((layer) => {
        return {
          holdsGlowFilter: findHosts(layer, "RNSVGFilter").length > 0,
          holdsOrbit: findHosts(layer, "RNSVGCircle").some(isOrbit),
        };
      });
    },
  };
}

/** Every host node of `type` under `node`, itself included, in render order. */
function findHosts(node: unknown, type: string): RenderedNode[] {
  if (node === null || typeof node !== "object") {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap((child) => {
      return findHosts(child, type);
    });
  }

  const host = node as RenderedNode;
  const children = (host.children ?? []).flatMap((child) => {
    return findHosts(child, type);
  });

  return host.type === type ? [host, ...children] : children;
}

/** The orbit is the one dashed circle in the emblem. */
function isOrbit(circle: RenderedNode): boolean {
  return JSON.stringify(circle.props.strokeDasharray) === ORBIT_DASHES;
}

/** The slice of a `screen.toJSON()` node this page reads. */
interface RenderedNode {
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly unknown[] | null;
}

/** The orbit's `strokeDasharray="3 5"` in `LockEmblem.tsx` — the one dashed
 * stroke in the emblem — as react-native-svg hands it to the host. */
const ORBIT_DASHES = JSON.stringify(["3", "5"]);
