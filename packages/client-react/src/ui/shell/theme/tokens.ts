/**
 * Design tokens for dark and light themes.
 * Applied as CSS custom properties on :root via ThemeProvider.
 */

export interface ThemeTokens {
  // Backgrounds
  "--bg-primary": string;
  "--bg-secondary": string;
  "--bg-header": string;
  "--bg-footer": string;
  "--bg-tile": string;
  "--bg-overlay": string;

  // Text
  "--text-primary": string;
  "--text-secondary": string;
  "--text-muted": string;
  // Text painted on a coloured accent/status fill — stays light in both themes.
  "--text-on-accent": string;

  // Accents
  "--accent-positive": string;
  "--accent-negative": string;
  "--accent-aware": string;
  "--accent-primary": string;

  // Borders
  "--border-primary": string;
  "--border-subtle": string;

  // Status
  "--status-connected": string;
  "--status-connecting": string;
  "--status-disconnected": string;
  // Error-message fill. Kept theme-independent to preserve the exact prior
  // rendering (was a hardcoded #d32f2f fallback on an undefined token); unify
  // with --accent-negative later if a theme-aware error colour is wanted.
  "--status-error": string;
}

export const darkTokens: ThemeTokens = {
  "--bg-primary": "#111827",
  "--bg-secondary": "#1f2937",
  "--bg-header": "#0f172a",
  "--bg-footer": "#0f172a",
  "--bg-tile": "#1e293b",
  "--bg-overlay": "rgba(0, 0, 0, 0.75)",

  "--text-primary": "#f1f5f9",
  "--text-secondary": "#94a3b8",
  "--text-muted": "#64748b",
  "--text-on-accent": "#fff",

  "--accent-positive": "#22c55e",
  "--accent-negative": "#ef4444",
  "--accent-aware": "#f59e0b",
  "--accent-primary": "#3b82f6",

  "--border-primary": "#334155",
  "--border-subtle": "#1e293b",

  "--status-connected": "#22c55e",
  "--status-connecting": "#f59e0b",
  "--status-disconnected": "#ef4444",
  "--status-error": "#d32f2f",
};

export const lightTokens: ThemeTokens = {
  "--bg-primary": "#f8fafc",
  "--bg-secondary": "#f1f5f9",
  "--bg-header": "#ffffff",
  "--bg-footer": "#ffffff",
  "--bg-tile": "#ffffff",
  "--bg-overlay": "rgba(0, 0, 0, 0.5)",

  "--text-primary": "#0f172a",
  "--text-secondary": "#475569",
  "--text-muted": "#94a3b8",
  "--text-on-accent": "#fff",

  "--accent-positive": "#16a34a",
  "--accent-negative": "#dc2626",
  "--accent-aware": "#d97706",
  "--accent-primary": "#2563eb",

  "--border-primary": "#e2e8f0",
  "--border-subtle": "#f1f5f9",

  "--status-connected": "#16a34a",
  "--status-connecting": "#d97706",
  "--status-disconnected": "#dc2626",
  "--status-error": "#d32f2f",
};
