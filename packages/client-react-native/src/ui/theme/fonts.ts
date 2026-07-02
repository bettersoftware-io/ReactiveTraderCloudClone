import { ChakraPetch_500Medium } from "@expo-google-fonts/chakra-petch";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono";
import { IBMPlexSans_400Regular } from "@expo-google-fonts/ibm-plex-sans";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";

import {
  FONT_CHAKRA_DISPLAY,
  FONT_IBM_MONO,
  FONT_IBM_SANS,
  FONT_JETBRAINS_MONO,
} from "#/ui/theme/fontFamilies";

/** Loads the four bundled skin fonts, registered under the exact family names
 * the token store references (`fontFamilies.ts`). Returns true once all are
 * ready; `_layout` gates first paint on it so no leaf paints a not-yet-loaded
 * family. `classic` needs no bundled font (system default), so it is absent. */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    [FONT_CHAKRA_DISPLAY]: ChakraPetch_500Medium,
    [FONT_JETBRAINS_MONO]: JetBrainsMono_400Regular,
    [FONT_IBM_SANS]: IBMPlexSans_400Regular,
    [FONT_IBM_MONO]: IBMPlexMono_400Regular,
  });
  return loaded;
}
