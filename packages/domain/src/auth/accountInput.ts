export const EMAIL_MAX_LENGTH = 254;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRMATION_CODE_SHAPE = /^\d{6}$/;
const CONTROL_CHARACTER = /\p{Cc}/u;

/** One person, one spelling: every account lookup uses this form. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** A pragmatic shape check on an already-normalized address. Whether the
 * mailbox exists is what the confirmation code proves. */
export function isValidEmail(email: string): boolean {
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(email);
}

export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function isValidDisplayName(name: string): boolean {
  return (
    name.length >= DISPLAY_NAME_MIN_LENGTH &&
    name.length <= DISPLAY_NAME_MAX_LENGTH &&
    !CONTROL_CHARACTER.test(name)
  );
}

export function isConfirmationCode(code: string): boolean {
  return CONFIRMATION_CODE_SHAPE.test(code);
}

/** First letters of the first and last word; two letters of a single word. */
export function initialsOf(displayName: string): string {
  const words = displayName.split(" ").filter((word) => {
    return word !== "";
  });
  const first = words[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1] ?? "") : "";
  const letters =
    last === "" ? first.slice(0, 2) : `${first.charAt(0)}${last.charAt(0)}`;

  return letters.toUpperCase();
}
