#!/usr/bin/env tsx
// Cross-platform "free the dev-server port" helper.
//
// macOS ships `lsof`; the linuxkit/Docker images we run CI in often ship only
// `ss` (and sometimes `fuser`) instead. Rather than bake one tool into the docs
// and have it fail on the other platform, this script probes for whichever PID
// finder is present, kills the listener(s), and reports clearly.
//
// Usage: tsx scripts/free-port.ts [port]   (defaults to the dev-server port)
import { spawnSync } from "node:child_process";

import { DEV_PORT } from "./devServer";

const port = Number(process.argv[2] ?? DEV_PORT);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`free-port: invalid port "${process.argv[2]}"`);
  process.exit(2);
}

// Each finder returns the listening PIDs for `port`, or null if the tool itself
// is not installed (so we can fall through to the next one). An installed tool
// that simply finds nothing returns [].
type Finder = { name: string; run: () => number[] | null };

function tryTool(
  bin: string,
  args: string[],
  parse: (stdout: string) => number[],
): number[] | null {
  const result = spawnSync(bin, args, { encoding: "utf8" });

  // ENOENT => tool not installed; fall through to the next finder.
  if (
    result.error &&
    (result.error as NodeJS.ErrnoException).code === "ENOENT"
  ) {
    return null;
  }

  return parse(result.stdout ?? "");
}

function pidLines(stdout: string): number[] {
  return stdout
    .split(/\s+/)
    .map((t) => {
      return Number(t.trim());
    })
    .filter((n) => {
      return Number.isInteger(n) && n > 0;
    });
}

const finders: Finder[] = [
  // macOS + Linux-with-lsof: -t prints bare PIDs, one per line.
  {
    name: "lsof",
    run: () => {
      return tryTool("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], pidLines);
    },
  },
  // Linux: ss embeds the owner as users:(("name",pid=737,fd=22)).
  {
    name: "ss",
    run: () => {
      return tryTool("ss", ["-ltnpH", `sport = :${port}`], (out) => {
        return [...out.matchAll(/pid=(\d+)/g)].map((m) => {
          return Number(m[1]);
        });
      });
    },
  },
  // Linux fallback: fuser prints the owning PIDs (to stdout on modern util-linux).
  {
    name: "fuser",
    run: () => {
      return tryTool("fuser", [`${port}/tcp`], pidLines);
    },
  },
];

let pids: number[] | null = null;
let used = "";

for (const finder of finders) {
  const found = finder.run();

  if (found !== null) {
    pids = found;
    used = finder.name;
    break;
  }
}

if (pids === null) {
  console.error(
    `free-port: none of lsof/ss/fuser are installed; cannot find the process on :${port}.\n` +
      `Install one of them, or stop the dev server manually.`,
  );
  process.exit(1);
}

const unique = [...new Set(pids)].filter((pid) => {
  return pid !== process.pid;
});

if (unique.length === 0) {
  console.log(
    `free-port: nothing is listening on :${port} (checked via ${used}).`,
  );
  process.exit(0);
}

for (const pid of unique) {
  try {
    process.kill(pid, "SIGTERM");
    console.log(
      `free-port: sent SIGTERM to pid ${pid} on :${port} (via ${used}).`,
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;

    if (code === "ESRCH") {
      continue; // already gone
    }

    console.error(`free-port: could not kill pid ${pid}: ${code ?? err}`);
  }
}

// Give graceful shutdown a moment, then SIGKILL anything that ignored SIGTERM.
await new Promise((r) => {
  return setTimeout(r, 1_000);
});

for (const pid of unique) {
  try {
    process.kill(pid, 0); // probe: throws ESRCH once the process is gone
    process.kill(pid, "SIGKILL");
    console.log(`free-port: pid ${pid} survived SIGTERM; sent SIGKILL.`);
  } catch {
    /* gone — nothing to do */
  }
}
