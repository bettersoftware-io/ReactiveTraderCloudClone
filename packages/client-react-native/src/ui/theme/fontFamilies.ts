/**
 * Font-family name strings shared by the token store (which references them)
 * and the font loader (Task 3, which registers them via `useFonts`). Kept in a
 * dependency-free module so `tokens.ts` stays importable under vitest — the
 * `@expo-google-fonts` packages pull in react-native and cannot be parsed there.
 * Each constant equals the export name of the corresponding `@expo-google-fonts`
 * font module, which is also the family name RN resolves at paint time.
 */
export const FONT_CHAKRA_DISPLAY = "ChakraPetch_500Medium";
export const FONT_JETBRAINS_MONO = "JetBrainsMono_400Regular";
export const FONT_IBM_SANS = "IBMPlexSans_400Regular";
export const FONT_IBM_MONO = "IBMPlexMono_400Regular";

/** The real 600 / 700 cuts of each skin face. A bundled family registered
 * from ONE file has no sibling weights, so `fontWeight: "600"` on it makes
 * iOS synthesise a faux bold (a smeared regular) — the mobile-v1 design
 * loads every face at 400·500·600·700 and its emphasised labels are the true
 * SemiBold / Bold. Reach these through `weightedFont()`, never by pairing
 * `fontWeight` with a bundled family. */
export const FONT_CHAKRA_DISPLAY_600 = "ChakraPetch_600SemiBold";
export const FONT_CHAKRA_DISPLAY_700 = "ChakraPetch_700Bold";
export const FONT_JETBRAINS_MONO_600 = "JetBrainsMono_600SemiBold";
export const FONT_JETBRAINS_MONO_700 = "JetBrainsMono_700Bold";
export const FONT_IBM_SANS_600 = "IBMPlexSans_600SemiBold";
export const FONT_IBM_SANS_700 = "IBMPlexSans_700Bold";
export const FONT_IBM_MONO_600 = "IBMPlexMono_600SemiBold";
export const FONT_IBM_MONO_700 = "IBMPlexMono_700Bold";
export const FONT_ORBITRON_WORDMARK = "Orbitron_700Bold";
