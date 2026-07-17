// Guards the two hand-maintained presenter manifests against silent drift.
// `PRESENTER_MANIFEST` (web, packages/client-react) and
// `NATIVE_PRESENTER_MANIFEST` (React Native, packages/client-react-native) are
// deliberately call-site copies: devtools-core stays structurally typed, so
// each composition root owns a concrete map of which presenter members its
// ViewModel observes. Both clients wire the *same* @rtc/client-core presenters,
// so the two maps must stay identical entry-for-entry — but nothing in the type
// system couples them (the clients never import each other). This check reads
// both files, extracts the object literal each assigns to `PresenterManifest`,
// and fails if the bodies differ, so adding a presenter to one client without
// the other is caught in CI instead of showing up as a silently-absent row in
// one client's state tree.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = "packages/client-react/src/app/devtools/presenterManifest.ts";
const NATIVE =
  "packages/client-react-native/src/app/devtools/presenterManifest.ts";

/** Extract the `{ ... }` object literal assigned to a `PresenterManifest`,
 * dropping the `export const NAME: PresenterManifest =` prefix and the leading
 * doc comment so only the shared body is compared. */
function manifestBody(relPath) {
  const source = readFileSync(join(process.cwd(), relPath), "utf8");
  const match = source.match(/:\s*PresenterManifest\s*=\s*(\{[\s\S]*\n\});/);

  if (match === null) {
    console.error(
      `check-manifest-drift: could not find a \`PresenterManifest\` object ` +
        `literal in ${relPath}`,
    );
    process.exit(1);
  }

  return match[1];
}

const webBody = manifestBody(WEB);
const nativeBody = manifestBody(NATIVE);

if (webBody === nativeBody) {
  console.log(
    "check-manifest-drift: web and React Native presenter manifests match",
  );
  process.exit(0);
}

const webLines = webBody.split("\n");
const nativeLines = nativeBody.split("\n");
const diff = [];

for (let i = 0; i < Math.max(webLines.length, nativeLines.length); i++) {
  const web = webLines[i];
  const native = nativeLines[i];

  if (web !== native) {
    if (web !== undefined) {
      diff.push(`  web    | ${web.trim()}`);
    }

    if (native !== undefined) {
      diff.push(`  native | ${native.trim()}`);
    }
  }
}

console.error(
  `check-manifest-drift: the web and React Native presenter manifests have ` +
    `drifted — add every presenter to BOTH \`PRESENTER_MANIFEST\` and ` +
    `\`NATIVE_PRESENTER_MANIFEST\`. First differences:\n${diff
      .slice(0, 20)
      .join("\n")}`,
);
process.exit(1);
