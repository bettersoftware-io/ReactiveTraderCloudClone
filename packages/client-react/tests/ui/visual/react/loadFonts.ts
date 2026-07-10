// Side-effect: register the app's real web fonts (@font-face) in the visual
// harness, so goldens render in Chakra Petch / IBM Plex / JetBrains Mono /
// Orbitron instead of the fallback system stack. Without these, component CSS
// that references the app fonts by name silently falls back and the goldens
// stop looking like the app. This mirrors the exact @fontsource set the real
// entry point loads (src/main.tsx); keep them in sync. VisualScenario imports
// this once, so all three tiers (plain-Playwright, playwright-ct, vitest-browser)
// pick it up identically.
import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/orbitron/700.css";
