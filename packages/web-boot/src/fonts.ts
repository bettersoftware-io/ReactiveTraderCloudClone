// The web clients' font manifest, once: the app's v2 design fonts — Chakra Petch
// 400/500/600/700, JetBrains Mono 400/500/700, IBM Plex Sans 400/500/600,
// IBM Plex Mono 400/500/600, Orbitron 700/800 (wordmark, P&L amount, lock-screen
// fallback, prefs-dialog title chrome) — registered as @font-face by the
// @fontsource stylesheets below, plus the list of faces to force-load.
//
// It is its OWN entry point (`@rtc/web-boot/fonts`), not re-exported from
// `index.ts`: the `.css` imports are for a bundler, and node-run scripts import
// the main entry, which node would fail to load because it cannot load a `.css`
// file. Importing this module is what registers the faces — a client's `main.tsx`
// and each visual-tier `VisualScenario.tsx` import it, and nothing else lists a
// font.
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

/**
 * The faces the imports above register, as CSS font-shorthand strings for
 * `document.fonts.load()`, in the same order. Registering an @font-face only
 * *declares* it: the browser defers the download until some laid-out element uses
 * that family and weight. `document.fonts.ready` resolves once no load is
 * *pending*, so if nothing has triggered a face yet it resolves at once in the
 * fallback state and the real glyphs swap in after a screenshot, a
 * timing-dependent width drift (a header measured 1139px in the fallback face and
 * 1180px in the real one). A visual harness force-loads every spec and awaits
 * them before it renders, so a capture is font-deterministic whatever the timing.
 * `fonts.test.ts` fails when this list and the imports above stop agreeing.
 */
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
