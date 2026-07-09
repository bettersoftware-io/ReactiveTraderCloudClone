import type { ViewStyle } from "react-native";

import type { DepthTokens } from "#/ui/theme/tokens";

/** Expand a DepthTokens into an RN shadow/elevation ViewStyle fragment. Flat
 * cells (level 0) return {} so nothing paints. The `topHighlight` and `glow`
 * fields are element-specific (a top hairline border; a pressed-state shadow
 * swap) and are applied by callers, not here. `react-native` is imported
 * type-only, so this module stays runtime-free and vitest-importable. */
export function depthStyle(d: DepthTokens): ViewStyle {
  if (d.level === 0) {
    return {};
  }
  return {
    shadowColor: d.shadowColor,
    shadowOpacity: d.shadowOpacity,
    shadowRadius: d.shadowRadius,
    shadowOffset: { width: 0, height: d.shadowOffsetY },
    elevation: d.elevation,
  };
}
