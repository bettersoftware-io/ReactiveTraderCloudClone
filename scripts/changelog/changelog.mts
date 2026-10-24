// Reads CHANGELOG.md the one way both changelog scripts need it: the week
// sections (heading `## 2026-Wnn — …`, then everything up to the next one)
// and the link-definition block at the bottom. sync-releases.mts renders the
// sections as release notes; check-changelog.mts proves them complete.

export interface Week {
  tag: string;
  title: string;
  section: string;
}

const DEFINITION = /^\[([^\]]+)\]: (\S+)$/;

export function parseWeeks(text: string): Week[] {
  const body = text
    .split("\n")
    .filter((line): boolean => {
      return !DEFINITION.test(line);
    })
    .join("\n");
  const parts = body.split(/\n(?=## \d{4}-W\d\d )/).slice(1);

  return parts.map((part): Week => {
    const [heading, ...rest] = part.split("\n");
    const title = heading.slice(3).trim();
    const tag = title.slice(0, 8);
    return { tag, title, section: rest.join("\n").trim() };
  });
}

// Label -> URL, in file order (Map keeps insertion order, which the ordering
// check reads).
export function parseDefinitions(text: string): Map<string, string> {
  const defs = new Map<string, string>();

  for (const line of text.split("\n")) {
    const m = DEFINITION.exec(line);

    if (m) {
      defs.set(m[1], m[2]);
    }
  }

  return defs;
}

// The ISO week (`2026-W42`) an instant falls in, by UTC — a PR belongs to the
// week of its merge time.
export function formatIsoWeek(iso: string): string {
  const d = new Date(iso);
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
