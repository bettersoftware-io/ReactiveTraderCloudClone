/**
 * Parses the `AUTH_USERS` secret format: `"user:pass,user2:pass2"`.
 * Blank entries are ignored; usernames and passwords are trimmed.
 */
export function parseAuthUsers(raw: string | undefined): Map<string, string> {
  const credentials = new Map<string, string>();

  if (!raw) {
    return credentials;
  }

  for (const entry of raw.split(",")) {
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

    credentials.set(username, password);
  }

  return credentials;
}
