// Collects every outstanding ESLint *warning* (severity: warn) across both
// lint configs and renders the committed ledger at docs/lint-warnings.md.
//
// DORMANT since 2026-10-06. A lint warning fails the build (`--max-warnings 0`
// on every ESLint and stylelint script, #960), so this ledger can only read
// zero and its CI step is commented out in ci.yml (#963). It is kept as the
// fallback: if warnings are ever allowed again they could linger untracked,
// and the ledger, guarded by `pnpm check:lint-warnings-drift`, prevents that —
// a new warning turns the drift check red until it is fixed or recorded here.
// Reviving it means uncommenting that CI step in the PR that drops the flag.
//
// Run directly (`pnpm sync:lint-warnings`) to regenerate the ledger. The
// collect/render functions are also imported by check-lint-warnings-drift.mts
// so the gate compares against the *exact* same rendering — the two can never
// diverge.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const LEDGER_PATH = "docs/lint-warnings.md";

// The two lint passes CI runs (see `lint:eslint` / `lint:eslint:types`). The
// default config is applied when `--config` is omitted; the typed config is a
// second, separate pass. We union the warnings from both.
/** The fields this script reads from one message of ESLint's `-f json` report. */
interface EslintMessage {
  severity: number;
  ruleId: string | null;
  line: number;
  column: number;
  message: string;
}

/** One per-file entry of ESLint's `-f json` report. */
interface EslintResult {
  filePath: string;
  messages: EslintMessage[];
}

/** One physical warning, with the line/column that never reach the ledger dropped. */
interface PhysicalWarning {
  file: string;
  rule: string;
  message: string;
}

/** One ledger row: a (rule, file, message) group and how often it occurs. */
export interface LedgerWarning extends PhysicalWarning {
  count: number;
}

const ESLINT_CONFIGS: (string | null)[] = [null, "eslint.config.typed.mts"];

/** Run ESLint once with `-f json` and return the parsed results array. ESLint
 * exits non-zero when it finds *errors*; it still writes the JSON report to
 * stdout, so we read stdout regardless of exit code. */
function runEslint(configPath: string | null): EslintResult[] {
  const args = [
    "eslint",
    ".",
    "--format",
    "json",
    ...(configPath === null ? [] : ["--config", configPath]),
  ];

  let stdout: string;

  try {
    stdout = execFileSync("npx", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // Non-zero exit (lint errors present) — the JSON report is still on stdout.
    if (
      typeof error === "object" &&
      error !== null &&
      "stdout" in error &&
      typeof error.stdout === "string" &&
      error.stdout.length > 0
    ) {
      stdout = error.stdout;
    } else {
      throw error;
    }
  }

  return JSON.parse(stdout) as EslintResult[];
}

/** Collect the de-duplicated set of warnings across all configs.
 *
 * Physical-warning identity is (file, rule, line, column, message) — used only
 * to drop the SAME warning reported by both configs. The returned ledger groups
 * are keyed by (rule, file, message) with a count of distinct physical
 * occurrences; line/column never reach the ledger, so unrelated edits that
 * merely shift lines don't cause drift, while a genuinely new warning does.
 *
 * Map keys are JSON.stringify of the identity tuple — unambiguous (no delimiter
 * can collide with field contents) and plain ASCII (a raw separator byte would
 * make git treat this script as binary). */
export function collectWarnings(): LedgerWarning[] {
  const physical = new Map<string, PhysicalWarning>();

  for (const config of ESLINT_CONFIGS) {
    for (const result of runEslint(config)) {
      const file = toRepoRelative(result.filePath);

      for (const message of result.messages) {
        if (message.severity !== 1) {
          continue; // 1 = warn; 2 = error (errors already fail lint)
        }

        const rule = message.ruleId ?? "(no-rule)";
        const key = JSON.stringify([
          file,
          rule,
          message.line,
          message.column,
          message.message,
        ]);
        physical.set(key, { file, rule, message: message.message });
      }
    }
  }

  // Group physical warnings into ledger rows keyed by (rule, file, message).
  const groups = new Map<string, LedgerWarning>();

  for (const w of physical.values()) {
    const key = JSON.stringify([w.rule, w.file, w.message]);
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, { ...w, count: 1 });
    } else {
      existing.count += 1;
    }
  }

  return [...groups.values()];
}

function toRepoRelative(absPath: string): string {
  const cwd = process.cwd();
  return absPath.startsWith(cwd)
    ? absPath
        .slice(cwd.length)
        .replace(/^[/\\]/, "")
        .replaceAll("\\", "/")
    : absPath.replaceAll("\\", "/");
}

/** Render the canonical ledger markdown from collected warnings. Deterministic:
 * groups are sorted by rule, then file, then message, so regeneration is
 * byte-stable regardless of ESLint's traversal order. Contains NO timestamps —
 * the output is a pure function of the warning set (a date would cause drift). */
export function renderLedger(warnings: LedgerWarning[]): string {
  const sorted = [...warnings].sort((a, b) => {
    return (
      a.rule.localeCompare(b.rule) ||
      a.file.localeCompare(b.file) ||
      a.message.localeCompare(b.message)
    );
  });

  const total = sorted.reduce((sum, w) => {
    return sum + w.count;
  }, 0);

  const rules = new Set(
    sorted.map((w) => {
      return w.rule;
    }),
  );

  const files = new Set(
    sorted.map((w) => {
      return w.file;
    }),
  );

  const lines = [
    "<!-- GENERATED by scripts/sync-lint-warnings.mts — do NOT edit by hand.",
    "     Regenerate with `pnpm sync:lint-warnings`; checked by",
    "     `pnpm check:lint-warnings-drift` (not run in CI while dormant). -->",
    "",
    "# Lint Warnings Ledger",
    "",
    "> Machine-generated inventory of every outstanding ESLint **warning**",
    "> (severity `warn`) across both lint configs. Dormant since 2026-10-06: a",
    "> lint warning now fails the build, so this reads zero. It is kept as the",
    "> fallback for tracking warnings if they are ever allowed again. Line",
    "> numbers are omitted deliberately (they churn on unrelated edits); locate",
    "> each warning by its file plus the identifier named in the message.",
    ">",
    `> **Total: ${total} ${total === 1 ? "warning" : "warnings"}** across ` +
      `${rules.size} ${rules.size === 1 ? "rule" : "rules"}, ` +
      `${files.size} ${files.size === 1 ? "file" : "files"}.`,
    "",
  ];

  if (sorted.length === 0) {
    lines.push("_No outstanding lint warnings. 🎉_", "");
    return `${lines.join("\n")}\n`;
  }

  let currentRule: string | null = null;
  let currentFile: string | null = null;

  for (const w of sorted) {
    if (w.rule !== currentRule) {
      if (currentRule !== null) {
        lines.push(""); // separate the previous section's entries from this header
      }

      const ruleTotal = sorted
        .filter((x) => {
          return x.rule === w.rule;
        })
        .reduce((sum, x) => {
          return sum + x.count;
        }, 0);
      lines.push(`## \`${w.rule}\` (${ruleTotal})`, "");
      currentRule = w.rule;
      currentFile = null;
    }

    if (w.file !== currentFile) {
      if (currentFile !== null) {
        lines.push(""); // separate the previous file's entries from this header
      }

      lines.push(`### ${w.file}`, "");
      currentFile = w.file;
    }

    const prefix = w.count === 1 ? "" : `(×${w.count}) `;
    lines.push(`- ${prefix}${w.message}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

// --- Run-as-script guard: only write the file when executed directly. ---
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ledger = renderLedger(collectWarnings());
  let previous: string | null = null;

  try {
    previous = readFileSync(LEDGER_PATH, "utf8");
  } catch {
    // First run — no existing ledger.
  }

  writeFileSync(LEDGER_PATH, ledger);

  if (previous === ledger) {
    console.log(`sync-lint-warnings: ${LEDGER_PATH} already up to date`);
  } else {
    console.log(`sync-lint-warnings: wrote ${LEDGER_PATH}`);
  }
}
