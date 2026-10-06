import type { JSX } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { VISUAL_HARNESS_HOME_ID } from "./harnessHomeId";

/**
 * What the app's home route shows on a visual-harness bundle: nothing but a
 * marker.
 *
 * A capture has to load the bundle before it can open a scenario route, and
 * the dev client loads a bundle at its home route. That route used to be the
 * real app, so every capture composed the application core, played the boot
 * splash and mounted the sign-in screen, only to navigate away from all of it
 * a moment later. A scenario needs none of that: it renders on a fake view
 * model, outside the app's providers. On a harness bundle the home route is
 * therefore this screen, and the real app is never mounted.
 *
 * The marker follows the rules of `visual-ready` in `VisualScenarioHost.tsx`:
 * its own accessibility element (iOS exposes a `testID` on nothing else), and
 * halfway down the left edge (Maestro on Android drops an element that sits
 * under the status or navigation bar).
 */
export function VisualHarnessHome(): JSX.Element {
  return (
    <View style={styles.screen}>
      <View
        testID={VISUAL_HARNESS_HOME_ID}
        accessible={true}
        accessibilityLabel={VISUAL_HARNESS_HOME_ID}
        pointerEvents="none"
        style={styles.marker}
      />
    </View>
  );
}

interface HarnessHomeStyles {
  screen: ViewStyle;
  marker: ViewStyle;
}

const styles: HarnessHomeStyles = StyleSheet.create({
  screen: { flex: 1 },
  marker: { position: "absolute", top: "50%", left: 0, width: 1, height: 1 },
});
