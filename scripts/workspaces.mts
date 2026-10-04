// The workspace set, read from pnpm-workspace.yaml so every gate stays in
// lockstep with the real workspaces (packages/* AND the `tests` workspace).
// Shared by check-workspace-scripts.mts and check-package-wiring.mts.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The package.json fields the gate scripts read. */
export interface WorkspaceManifest {
  readonly name?: string;
  readonly scripts?: Record<string, string>;
  readonly exports?: Record<string, unknown>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

export const repoRoot: string = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

// Read the `packages:` list from pnpm-workspace.yaml. The file is trivially
// shaped (a flat YAML sequence of quoted globs), so a full YAML parser would be
// overkill — we collect the `- "<glob>"` items directly under the key.
function readWorkspaceGlobs(): string[] {
  const yaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
  const globs: string[] = [];
  let inPackages = false;

  for (const raw of yaml.split("\n")) {
    if (/^packages:\s*$/.test(raw)) {
      inPackages = true;
      continue;
    }

    if (inPackages) {
      const item = raw.match(/^\s*-\s*["']?([^"'#]+?)["']?\s*(#.*)?$/);

      if (item) {
        globs.push(item[1].trim());
        continue;
      }

      // A non-list, non-blank line ends the sequence.
      if (raw.trim() !== "" && !raw.startsWith(" ")) {
        break;
      }
    }
  }

  return globs;
}

// Expand a workspace glob to concrete directories. pnpm-workspace globs here use
// a trailing `*` segment at most (`packages/*`), plus literals (`tests`), so we
// resolve each path segment, fanning out only on a `*` segment.
function expandGlob(glob: string): string[] {
  let dirs = [""];

  for (const segment of glob.split("/")) {
    const next: string[] = [];

    for (const dir of dirs) {
      if (segment === "*") {
        for (const entry of readdirSync(join(repoRoot, dir), {
          withFileTypes: true,
        })) {
          if (entry.isDirectory()) {
            next.push(join(dir, entry.name));
          }
        }
      } else {
        next.push(join(dir, segment));
      }
    }

    dirs = next;
  }

  return dirs;
}

export function readManifest(dir: string): WorkspaceManifest | null {
  try {
    const manifest: WorkspaceManifest = JSON.parse(
      readFileSync(join(repoRoot, dir, "package.json"), "utf8"),
    );

    return manifest;
  } catch {
    // Not every matched directory is a package (a `*` glob can catch a stray
    // dir); a missing/unreadable package.json just means "no workspace here".
    return null;
  }
}

/** Every workspace directory (repo-relative), sorted and de-duplicated. */
export function listWorkspaceDirs(): string[] {
  return [...new Set(readWorkspaceGlobs().flatMap(expandGlob))].sort();
}
