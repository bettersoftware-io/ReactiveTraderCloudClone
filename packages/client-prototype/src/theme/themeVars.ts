import type { ThemeTokens } from "#/mock/types";

function toKebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => {
    return `-${c.toLowerCase()}`;
  });
}

export function tokensToCssVars(tokens: ThemeTokens): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(tokens)) {
    if (value != null) {
      vars[`--${toKebab(key)}`] = value;
    }
  }

  return vars;
}
