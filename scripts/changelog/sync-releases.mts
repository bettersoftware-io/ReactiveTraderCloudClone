// Mirrors CHANGELOG.md onto GitHub Releases: one release per finished ISO
// week, titled like its heading, its notes generated from that week's section.
// CHANGELOG.md stays the only source — a release is never edited by hand, it
// is rewritten here whenever its section changes (sync-releases.yml runs this
// on every push to main that touches the file).
//
// A week gets a release only once its `2026-Wnn` tag exists (weekly-tag.yml
// creates it), so a partial entry for the current week never creates a tag of
// its own. The newest released week is marked Latest; every other is not.
//
// The notes are the section with three rewrites, because a release body has
// no link-definition block and no file to resolve relative links against:
//   [#123]          -> #123            (GitHub autolinks it, with the PR title)
//   [`abc123456`]   -> [`abc123456`](<commit url from the definition>)
//   ](docs/x.md)    -> ](<repo>/blob/main/docs/x.md)
//
// usage:
//   node scripts/changelog/sync-releases.mts --repo owner/name [--apply]
//       plan against GitHub; --apply carries the plan out (default: print it)
//   node scripts/changelog/sync-releases.mts --repo owner/name --body 2026-W41
//       print one week's release notes
//   --only <week>       write just that week's release (Latest is still judged
//                       across every week)
//   --changelog <path>  defaults to CHANGELOG.md
//   --state <file>      read {tags, releases, latestTag} from a JSON file
//                       instead of GitHub (tests and offline dry runs)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { parseDefinitions, parseWeeks, type Week } from "./changelog.mts";

interface Release {
  id: number;
  tag: string;
  name: string;
  body: string;
}

interface RemoteState {
  tags: string[];
  releases: Release[];
  latestTag: string | null;
}

interface PlannedRelease {
  action: "create" | "update";
  tag: string;
  name: string;
  body: string;
  latest: boolean;
  id?: number;
}

interface Plan {
  changes: PlannedRelease[];
  unchanged: string[];
  untagged: string[];
}

const { values: args } = parseArgs({
  options: {
    repo: { type: "string" },
    apply: { type: "boolean", default: false },
    body: { type: "string" },
    only: { type: "string" },
    changelog: { type: "string", default: "CHANGELOG.md" },
    state: { type: "string" },
  },
});

if (args.repo === undefined) {
  throw new Error("--repo owner/name is required");
}

const repoUrl = `https://github.com/${args.repo}`;
const changelog = readFileSync(args.changelog, "utf8");
const weeks = parseWeeks(changelog);
const definitions = parseDefinitions(changelog);

if (args.body !== undefined) {
  const week = weeks.find((w): boolean => {
    return w.tag === args.body;
  });

  if (week === undefined) {
    throw new Error(`no ${args.body} section in ${args.changelog}`);
  }

  console.log(renderReleaseBody(week, definitions, repoUrl));
} else {
  const state =
    args.state === undefined
      ? fetchRemoteState(args.repo)
      : (JSON.parse(readFileSync(args.state, "utf8")) as RemoteState);

  const full = planReleases(weeks, state, (w): string => {
    return renderReleaseBody(w, definitions, repoUrl);
  });

  const plan =
    args.only === undefined
      ? full
      : {
          ...full,
          changes: full.changes.filter((c): boolean => {
            return c.tag === args.only;
          }),
        };
  printPlan(plan);

  if (args.apply) {
    applyPlan(plan, args.repo);
  }
}

function renderReleaseBody(
  week: Week,
  definitions: Map<string, string>,
  repo: string,
): string {
  const blob = `${repo}/blob/main`;
  const notes = week.section
    .replace(/\[(#\d+)\](?![(:[])/g, "$1")
    .replace(/\[`([0-9a-f]{7,40})`\](?![(:[])/g, (_, sha: string): string => {
      const url = definitions.get(`\`${sha}\``);

      if (url === undefined) {
        throw new Error(`${week.tag}: commit [\`${sha}\`] has no definition`);
      }

      return `[\`${sha}\`](${url})`;
    })
    .replace(/\]\(([^)\s]+)\)/g, (link, target: string): string => {
      if (/^[a-z][a-z0-9+.-]*:/.test(target) || target.startsWith("//")) {
        return link;
      }

      return target.startsWith("#")
        ? `](${blob}/CHANGELOG.md${target})`
        : `](${blob}/${target.replace(/^\.\//, "")})`;
    });
  const anchor = `${blob}/CHANGELOG.md#${slugifyHeading(week.title)}`;

  return (
    `${notes}\n\n---\n\n` +
    `Generated from the [${week.tag} entry](${anchor}) in \`CHANGELOG.md\`. ` +
    "Edit it there: this release is rewritten whenever that section changes."
  );
}

// GitHub's heading anchor (github-slugger) for the characters a week heading
// uses: lowercased, punctuation such as the em and en dashes dropped, and each
// space turned into a hyphen — so " — " becomes "--".
function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/ /g, "-");
}

function planReleases(
  weeks: Week[],
  state: RemoteState,
  render: (week: Week) => string,
): Plan {
  const tags = new Set(state.tags);
  const byTag = new Map(
    state.releases.map((r): [string, Release] => {
      return [r.tag, r];
    }),
  );

  // Oldest first, so the releases page (newest created first) lists them in
  // week order.
  const tagged = weeks
    .filter((w): boolean => {
      return tags.has(w.tag);
    })
    .sort((a, b): number => {
      return a.tag.localeCompare(b.tag);
    });
  const newest = tagged.at(-1)?.tag;
  const plan: Plan = {
    changes: [],
    unchanged: [],
    untagged: weeks
      .filter((w): boolean => {
        return !tags.has(w.tag);
      })
      .map((w) => {
        return w.tag;
      }),
  };

  for (const week of tagged) {
    const body = render(week);
    const latest = week.tag === newest;
    const existing = byTag.get(week.tag);

    if (existing === undefined) {
      plan.changes.push({
        action: "create",
        tag: week.tag,
        name: week.title,
        body,
        latest,
      });
    } else if (
      existing.name !== week.title ||
      existing.body.trim() !== body.trim() ||
      (latest && state.latestTag !== week.tag)
    ) {
      plan.changes.push({
        action: "update",
        id: existing.id,
        tag: week.tag,
        name: week.title,
        body,
        latest,
      });
    } else {
      plan.unchanged.push(week.tag);
    }
  }

  return plan;
}

function fetchRemoteState(repo: string): RemoteState {
  const tags = (
    fetchAllPages(`repos/${repo}/tags?per_page=100`) as { name: string }[]
  ).map((t): string => {
    return t.name;
  });

  const releases = (
    fetchAllPages(`repos/${repo}/releases?per_page=100`) as {
      id: number;
      tag_name: string;
      name: string | null;
      body: string | null;
    }[]
  ).map((r): Release => {
    return {
      id: r.id,
      tag: r.tag_name,
      name: r.name ?? "",
      body: r.body ?? "",
    };
  });
  let latestTag: string | null = null;

  if (releases.length > 0) {
    latestTag = execFileSync(
      "gh",
      ["api", `repos/${repo}/releases/latest`, "--jq", ".tag_name"],
      { encoding: "utf8" },
    ).trim();
  }

  return { tags, releases, latestTag };
}

function fetchAllPages(path: string): unknown[] {
  const out = execFileSync("gh", ["api", "--paginate", "--slurp", path], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  return (JSON.parse(out) as unknown[][]).flat();
}

function printPlan(plan: Plan): void {
  for (const c of plan.changes) {
    console.log(`${c.action} ${c.tag}${c.latest ? " (latest)" : ""}`);
  }

  console.log(
    `sync-releases: ${plan.changes.length} to write, ${plan.unchanged.length} unchanged` +
      (plan.untagged.length > 0
        ? `, waiting for a tag: ${plan.untagged.join(" ")}`
        : ""),
  );
}

function applyPlan(plan: Plan, repo: string): void {
  for (const c of plan.changes) {
    const payload = JSON.stringify({
      tag_name: c.tag,
      name: c.name,
      body: c.body,
      make_latest: c.latest ? "true" : "false",
    });

    const [method, path] =
      c.action === "create"
        ? ["POST", `repos/${repo}/releases`]
        : ["PATCH", `repos/${repo}/releases/${c.id}`];
    execFileSync(
      "gh",
      ["api", "-X", method, path, "--input", "-", "--silent"],
      {
        input: payload,
        stdio: ["pipe", "inherit", "inherit"],
      },
    );
    console.log(`${c.action}d ${c.tag}`);
  }
}
