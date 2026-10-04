/**
 * Parses the `AUTH_USERS` secret format: `"user:pass,user2:pass2"`.
 * Blank entries are ignored; usernames and passwords are trimmed. A username
 * containing `@` is refused: `/login` sends any identifier with an `@` to the
 * account service, so such a roster entry could never sign in. The error names
 * the entry by position only, never the username or password.
 */
export function parseAuthUsers(raw: string | undefined): Map<string, string> {
  const credentials = new Map<string, string>();

  if (!raw) {
    return credentials;
  }

  for (const [index, entry] of raw.split(",").entries()) {
    const trimmedEntry = entry.trim();

    if (!trimmedEntry) {
      continue;
    }

    const separatorIndex = trimmedEntry.indexOf(":");

    if (separatorIndex < 0) {
      continue;
    }

    const username = trimmedEntry.slice(0, separatorIndex).trim();
    const password = trimmedEntry.slice(separatorIndex + 1).trim();

    if (!username || !password) {
      continue;
    }

    if (username.includes("@")) {
      throw new Error(
        `AUTH_USERS: a roster username must not contain "@" (entry ${index + 1})`,
      );
    }

    credentials.set(username, password);
  }

  return credentials;
}
