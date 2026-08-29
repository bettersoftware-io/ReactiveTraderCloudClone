import {
  ChakraPetch_500Medium,
  ChakraPetch_600SemiBold,
  ChakraPetch_700Bold,
} from "@expo-google-fonts/chakra-petch";
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from "@expo-google-fonts/ibm-plex-mono";
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from "@expo-google-fonts/ibm-plex-sans";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";
import { Orbitron_700Bold } from "@expo-google-fonts/orbitron";
import { useFonts } from "expo-font";

import {
  FONT_CHAKRA_DISPLAY,
  FONT_CHAKRA_DISPLAY_600,
  FONT_CHAKRA_DISPLAY_700,
  FONT_IBM_MONO,
  FONT_IBM_MONO_600,
  FONT_IBM_MONO_700,
  FONT_IBM_SANS,
  FONT_IBM_SANS_600,
  FONT_IBM_SANS_700,
  FONT_JETBRAINS_MONO,
  FONT_JETBRAINS_MONO_600,
  FONT_JETBRAINS_MONO_700,
  FONT_ORBITRON_WORDMARK,
} from "#/ui/theme/fontFamilies";

/** Loads the thirteen bundled font files (four skin faces at their base
 * weight plus their real 600 / 700 cuts, and the Orbitron wordmark),
 * registered under the exact family names the token store references
 * (`fontFamilies.ts`). Returns true once all are ready; `_layout` gates first
 * paint on it so no leaf paints a not-yet-loaded family. `classic` needs no
 * bundled skin font (system default), so it is absent — but every skin uses
 * the Orbitron wordmark. */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    [FONT_CHAKRA_DISPLAY]: ChakraPetch_500Medium,
    [FONT_CHAKRA_DISPLAY_600]: ChakraPetch_600SemiBold,
    [FONT_CHAKRA_DISPLAY_700]: ChakraPetch_700Bold,
    [FONT_JETBRAINS_MONO]: JetBrainsMono_400Regular,
    [FONT_JETBRAINS_MONO_600]: JetBrainsMono_600SemiBold,
    [FONT_JETBRAINS_MONO_700]: JetBrainsMono_700Bold,
    [FONT_IBM_SANS]: IBMPlexSans_400Regular,
    [FONT_IBM_SANS_600]: IBMPlexSans_600SemiBold,
    [FONT_IBM_SANS_700]: IBMPlexSans_700Bold,
    [FONT_IBM_MONO]: IBMPlexMono_400Regular,
    [FONT_IBM_MONO_600]: IBMPlexMono_600SemiBold,
    [FONT_IBM_MONO_700]: IBMPlexMono_700Bold,
    [FONT_ORBITRON_WORDMARK]: Orbitron_700Bold,
  });
  return loaded;
}
