// Proves CHANGELOG.md complete against what actually merged, week by week.
//
// Errors (exit 1) — the file says something wrong:
//   - a week's section cites a PR that did not merge in that week (or at all);
//   - a FINISHED week's section leaves out a PR that merged in it. This is the
//     "written before the week ended" hole: an entry written on a Sunday
//     afternoon (2026-W40 missed 30 PRs that way) is checked again once the
//     week is over, not only when it is first written;
//   - the link definitions disagree with the citations: one missing, one never
//     cited, one pointing at the wrong PR, or out of ascending order.
//
// Reported, not errors — work still to do, never a wrong statement:
//   - a finished week with merged PRs and no section yet ("unwritten");
//   - the current week's section ("partial"), which /rtc:changelog extends.
//
// usage:
//   node scripts/changelog/check-changelog.mts --repo owner/name
//   --changelog <path>  defaults to CHANGELOG.md
//   --merged <file>     read [{number, mergedAt}] from a JSON file instead of
//                       GitHub (tests and offline runs)
//   --now <iso>         the instant "finished" is judged at (tests)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import {
  formatIsoWeek,
  parseDefinitions,
  parseWeeks,
  type Week,
} from "./changelog.mts";

interface MergedPr {
  number: number;
  mergedAt: string;
}

interface Findings {
  errors: string[];
  todo: string[];
}

const { values: args } = parseArgs({
  options: {
    repo: { type: "string" },
    changelog: { type: "string", default: "CHANGELOG.md" },
    merged: { type: "string" },
    now: { type: "string" },
  },
});

if (args.repo === undefined) {
  throw new Error("--repo owner/name is required");
}

const text = readFileSync(args.changelog, "utf8");
const merged =
  args.merged === undefined
    ? fetchMergedPrs(args.repo)
    : (JSON.parse(readFileSync(args.merged, "utf8")) as MergedPr[]);
const currentWeek = formatIsoWeek(args.now ?? new Date().toISOString());
const findings = checkChangelog(text, merged, currentWeek, args.repo);

for (const line of [...findings.errors, ...findings.todo]) {
  console.log(line);
}

console.log(
  `check-changelog: ${findings.errors.length} error(s), ${findings.todo.length} week(s) still to write`,
);

if (findings.errors.length > 0) {
  process.exit(1);
}

function checkChangelog(
  changelog: string,
  prs: MergedPr[],
  current: string,
  repo: string,
): Findings {
  const findings: Findings = { errors: [], todo: [] };
  const weeks = parseWeeks(changelog);
  const mergedByWeek = groupByWeek(prs);
  const weekOf = new Map(
    prs.map((pr): [number, string] => {
      return [pr.number, formatIsoWeek(pr.mergedAt)];
    }),
  );

  for (const week of weeks) {
    checkWeek(
      week,
      mergedByWeek.get(week.tag) ?? [],
      weekOf,
      current,
      findings,
    );
  }

  const written = new Set(
    weeks.map((w): string => {
      return w.tag;
    }),
  );
  const oldestWritten = [...written].sort()[0];

  for (const [tag, numbers] of [...mergedByWeek].sort()) {
    if (!written.has(tag) && tag < current && tag > (oldestWritten ?? "")) {
      findings.todo.push(`${tag}: unwritten (${numbers.length} PRs merged)`);
    }
  }

  checkDefinitions(changelog, repo, findings);
  return findings;
}

function checkWeek(
  week: Week,
  mergedThere: number[],
  weekOf: Map<number, string>,
  current: string,
  findings: Findings,
): void {
  const cited = citedPrs(week.section);

  for (const n of [...cited].sort((a, b): number => {
    return a - b;
  })) {
    const actual = weekOf.get(n);

    if (actual !== week.tag) {
      findings.errors.push(
        `${week.tag}: cites #${n}, which ${actual === undefined ? "is not a merged PR" : `merged in ${actual}`}`,
      );
    }
  }

  if (week.tag >= current) {
    findings.todo.push(`${week.tag}: partial (the week is not over)`);
    return;
  }

  const missing = mergedThere.filter((n): boolean => {
    return !cited.has(n);
  });

  if (missing.length > 0) {
    findings.errors.push(
      `${week.tag}: leaves out ${missing.length} PR(s) merged that week: ${missing
        .map((n) => {
          return `#${n}`;
        })
        .join(" ")}`,
    );
  }
}

function checkDefinitions(
  changelog: string,
  repo: string,
  findings: Findings,
): void {
  const defs = parseDefinitions(changelog);
  const prose = changelog
    .split("\n")
    .filter((line): boolean => {
      return !/^\[[^\]]+\]: \S+$/.test(line);
    })
    .join("\n");
  const citedPr = citedPrs(prose);
  const citedSha = new Set(
    [...prose.matchAll(/\[`([0-9a-f]{7,40})`\](?![(:[])/g)].map((m) => {
      return m[1];
    }),
  );

  const prDefs = [...defs.keys()].filter((k): boolean => {
    return /^#\d+$/.test(k);
  });

  for (const n of citedPr) {
    if (!defs.has(`#${n}`)) {
      findings.errors.push(`definitions: [#${n}] is cited but not defined`);
    }
  }

  for (const label of prDefs) {
    const n = Number(label.slice(1));

    if (!citedPr.has(n)) {
      findings.errors.push(
        `definitions: [${label}] is defined but never cited`,
      );
    }

    if (defs.get(label) !== `https://github.com/${repo}/pull/${n}`) {
      findings.errors.push(
        `definitions: [${label}] points at ${defs.get(label)}`,
      );
    }
  }

  const numbers = prDefs.map((label): number => {
    return Number(label.slice(1));
  });

  if (
    numbers.some((n, i): boolean => {
      return i > 0 && n <= numbers[i - 1];
    })
  ) {
    findings.errors.push(
      "definitions: the [#n] block is not in ascending order",
    );
  }

  for (const sha of citedSha) {
    if (!defs.has(`\`${sha}\``)) {
      findings.errors.push(
        `definitions: [\`${sha}\`] is cited but not defined`,
      );
    }
  }

  for (const label of defs.keys()) {
    const sha = /^`([0-9a-f]{7,40})`$/.exec(label)?.[1];

    if (sha !== undefined && !citedSha.has(sha)) {
      findings.errors.push(
        `definitions: [${label}] is defined but never cited`,
      );
    }
  }
}

function citedPrs(text: string): Set<number> {
  return new Set(
    [...text.matchAll(/\[#(\d+)\](?![(:[])/g)].map((m) => {
      return Number(m[1]);
    }),
  );
}

function groupByWeek(prs: MergedPr[]): Map<string, number[]> {
  const byWeek = new Map<string, number[]>();

  for (const pr of prs) {
    const tag = formatIsoWeek(pr.mergedAt);
    byWeek.set(tag, [...(byWeek.get(tag) ?? []), pr.number]);
  }

  for (const numbers of byWeek.values()) {
    numbers.sort((a, b): number => {
      return a - b;
    });
  }

  return byWeek;
}

function fetchMergedPrs(repo: string): MergedPr[] {
  const out = execFileSync(
    "gh",
    [
      "pr",
      "list",
      "--repo",
      repo,
      "--state",
      "merged",
      "--base",
      "main",
      "--limit",
      "10000",
      "--json",
      "number,mergedAt",
    ],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  );
  return JSON.parse(out) as MergedPr[];
}
