// packages/client-react-native/src/ui/theme/platformFonts.ts
import { Platform } from "react-native";

/**
 * The platform's built-in monospace family. The `classic` skin bundles no font
 * (it uses the system UI font for display), but its numeric columns still need a
 * monospace so FX rates and P&L figures align digit-for-digit — matching the
 * web's `--font-mono`. `tokens.ts` must stay react-native-free (it is vitest-
 * parsed), so this react-native-aware resolution lives here and is applied by
 * `ThemeProvider`: a `classic` cell's `undefined` `fontMono` means "the platform
 * system monospace", which resolves to this value.
 */
export const SYSTEM_MONO: string = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});
