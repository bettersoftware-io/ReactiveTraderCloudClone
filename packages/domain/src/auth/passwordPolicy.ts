const PASSWORD_MIN_LENGTH = 12;

/** Supabase hashes with bcrypt, which reads at most 72 BYTES of input. */
const PASSWORD_MAX_BYTES = 72;

export type PasswordRuleId =
  | "min-length"
  | "max-length"
  | "uppercase"
  | "lowercase"
  | "digit"
  | "special";

export interface PasswordRule {
  readonly id: PasswordRuleId;
  readonly label: string;
  readonly test: (password: string) => boolean;
}

/**
 * The sign-up password rule, in display order. One list feeds the form's
 * live checklist and the server's enforcement, so they cannot disagree.
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "min-length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (password: string): boolean => {
      return password.length >= PASSWORD_MIN_LENGTH;
    },
  },
  {
    id: "max-length",
    label: `At most ${PASSWORD_MAX_BYTES} bytes`,
    test: (password: string): boolean => {
      return utf8ByteLength(password) <= PASSWORD_MAX_BYTES;
    },
  },
  {
    id: "uppercase",
    label: "One uppercase letter",
    test: (password: string): boolean => {
      return /[A-Z]/.test(password);
    },
  },
  {
    id: "lowercase",
    label: "One lowercase letter",
    test: (password: string): boolean => {
      return /[a-z]/.test(password);
    },
  },
  {
    id: "digit",
    label: "One number",
    test: (password: string): boolean => {
      return /[0-9]/.test(password);
    },
  },
  {
    id: "special",
    label: "One special character",
    test: (password: string): boolean => {
      return /[^A-Za-z0-9]/.test(password);
    },
  },
];

/** The first rule the password breaks, in display order; null when it passes. */
export function findPasswordViolation(password: string): PasswordRule | null {
  return (
    PASSWORD_RULES.find((rule) => {
      return !rule.test(password);
    }) ?? null
  );
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
