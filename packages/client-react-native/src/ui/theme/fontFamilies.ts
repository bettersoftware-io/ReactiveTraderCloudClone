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
export const FONT_ORBITRON_WORDMARK = "Orbitron_700Bold";
