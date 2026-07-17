// Side-effect: register the app's real web fonts (@font-face) in the visual
// harness, so goldens render in Chakra Petch / IBM Plex / JetBrains Mono /
// Orbitron instead of the fallback system stack. Without these, component CSS
// that references the app fonts by name silently falls back and the goldens
// stop looking like the app. This mirrors the exact @fontsource set the real
// entry point loads (src/main.tsx) — verbatim copy of the react tier's
// loadFonts.ts (packages/client-react/tests/ui/visual/react/loadFonts.ts) so
// both frameworks force-load the identical (weight, family) set. VisualScenario
// imports this once.
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
import "@fontsource/orbitron/800.css";

// The exact (weight, family) pairs the imports above register, as CSS
// font-shorthand strings for `document.fonts.load()`. Registering an @font-face
// only *declares* it — the browser defers the actual download until some laid-out
// element uses that family+weight. `document.fonts.ready` resolves once no load
// is *pending*, so if nothing has triggered a face yet it resolves immediately in
// the fallback state and the real glyphs swap in after the screenshot — a
// timing-dependent width drift. VisualScenario force-triggers every face via
// `document.fonts.load` and awaits them before rendering, so captures are
// font-deterministic regardless of run timing. Keep this list in lock-step with
// the imports above (and with the react tier's copy).
export const FONT_LOAD_SPECS: readonly string[] = [
  '400 16px "Chakra Petch"',
  '500 16px "Chakra Petch"',
  '600 16px "Chakra Petch"',
  '700 16px "Chakra Petch"',
  '400 16px "IBM Plex Mono"',
  '500 16px "IBM Plex Mono"',
  '600 16px "IBM Plex Mono"',
  '400 16px "IBM Plex Sans"',
  '500 16px "IBM Plex Sans"',
  '600 16px "IBM Plex Sans"',
  '400 16px "JetBrains Mono"',
  '500 16px "JetBrains Mono"',
  '700 16px "JetBrains Mono"',
  '700 16px "Orbitron"',
  '800 16px "Orbitron"',
];
