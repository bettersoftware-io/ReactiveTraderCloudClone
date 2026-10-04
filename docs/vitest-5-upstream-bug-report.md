# Reporting the vitest 5 mock regression upstream

**Status (2026-10-04): not filed yet.** This page is the checklist and the
ready-to-paste text for reporting it to the vitest maintainers. The bug, how
it was found and the workaround this repo uses are in
[vitest-5.md](vitest-5.md#the-mock-regression--concurrent-re-imports-after-viresetmodules).

## Why a person has to file it

vitest's [`CONTRIBUTING.md`](https://github.com/vitest-dev/vitest/blob/main/CONTRIBUTING.md)
("AI Contributions") says every issue must be opened by a real person through
the official template. An issue posted by an automated agent is labelled
"maybe automated" and closed after one day unless a person answers, and the
answer must not be written by an LLM. AI help in preparing a report is allowed
when it is disclosed.

So: an agent session may prepare everything on this page, but **you open the
issue and you answer the maintainers' follow-up questions yourself**.

## The bug in one paragraph

On vitest 5.0.0 through 5.0.3, a `vi.mock` is silently not applied when three
things combine: a `setupFiles` entry has already loaded the modules, the test
calls `vi.resetModules()`, and the test then re-imports several modules
**concurrently** (`Promise.all`). Only the first importer gets the mock; the
others get the real module. vitest 4.1.11 gives every importer the mock.

## Step 1 — check it is still unreported and still broken

1. Search <https://github.com/vitest-dev/vitest/issues> for `resetModules`,
   then for `vi.mock setupFiles`. Skim anything opened after 2026-10-03. If
   someone has reported it, add a comment with the reproduction below instead
   of opening a duplicate.
2. Check the latest release: `npm view vitest dist-tags.latest`. If it is
   newer than 5.0.3, run step 2 against it first. If the test passes there,
   the bug is fixed: skip to [After it is fixed](#after-it-is-fixed).

## Step 2 — build the reproduction and confirm it

Paste this into a terminal. It creates a throwaway project and runs the same
test on both versions.

```sh
mkdir vitest5-concurrent-reimport && cd vitest5-concurrent-reimport
npm init -y >/dev/null && npm pkg set type=module

cat > dep.js <<'JS'
export const which = "real";
JS

for i in 1 2 3; do
cat > "a$i.js" <<'JS'
import { which } from "./dep.js";
export const seen = () => which;
JS
done

cat > setup.js <<'JS'
import "./a1.js";
import "./a2.js";
import "./a3.js";
JS

cat > vitest.config.js <<'JS'
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { setupFiles: ["./setup.js"] } });
JS

cat > concurrent.test.js <<'JS'
import { expect, it, vi } from "vitest";

vi.mock("./dep.js", () => ({ which: "mock" }));

it("concurrent re-imports after resetModules all see the mock", async () => {
  vi.resetModules();
  const mods = await Promise.all([import("./a1.js"), import("./a2.js"), import("./a3.js")]);
  expect(mods.map((m) => m.seen())).toEqual(["mock", "mock", "mock"]);
});
JS

cat > sequential.test.js <<'JS'
import { expect, it, vi } from "vitest";

vi.mock("./dep.js", () => ({ which: "mock" }));

it("sequential re-imports after resetModules all see the mock", async () => {
  vi.resetModules();
  const seen = [];
  for (const path of ["./a1.js", "./a2.js", "./a3.js"]) {
    seen.push((await import(path)).seen());
  }
  expect(seen).toEqual(["mock", "mock", "mock"]);
});
JS

npm i -D vitest@4.1.11 && npx vitest run   # expected: 2 passed
npm i -D vitest@5.0.3  && npx vitest run   # expected: concurrent.test.js fails
```

What was measured on 2026-10-03 (Node 26.10, macOS arm64, npm 11.19):

| vitest | pool | `concurrent.test.js` | `sequential.test.js` |
|---|---|---|---|
| 4.1.11 | `forks`, `threads` | passes | passes |
| 5.0.0 | `forks`, `threads` | **fails**: `["mock", "real", "real"]` | passes |
| 5.0.3 | `forks`, `threads` | **fails**: `["mock", "real", "real"]` | passes |

Removing `setupFiles` from the config makes both pass on 5.0.3.

The maintainers ask for a link, not pasted files. Either push that folder to a
public GitHub repository of yours, or recreate the files on
[StackBlitz](https://vitest.new). Keep the link for step 4.

## Step 3 — collect the system info

Run this **inside the reproduction folder**, on 5.0.3, and keep the output:

```sh
npx envinfo --system --npmPackages '{vitest*,@vitest/*,vite,@vitejs/*,playwright,webdriverio}' --binaries --browsers
```

## Step 4 — open the issue

Open <https://github.com/vitest-dev/vitest/issues/new?template=bug_report.yml>
and fill the form as follows.

**Title**

```text
vi.mock: after vi.resetModules(), concurrent re-imports of setup-preloaded modules get the real module (5.0 regression)
```

**Describe the bug** (edit it into your own words where you like)

```markdown
A `vi.mock` is silently not applied when these three things combine:

1. a `setupFiles` entry has already imported the modules under test,
2. the test calls `vi.resetModules()`,
3. the test then re-imports several of those modules **concurrently**
   (`Promise.all([import(a), import(b), import(c)])`), and each of them
   statically imports the mocked module.

Only the first importer gets the mock. The others get the real module, with
no error or warning. Awaiting the same imports one after another works.

This is a regression: the same test passes on 4.1.11 and fails on 5.0.0 and
5.0.3, on both the `forks` and `threads` pools.

Why this pattern: `vi.resetModules()` followed by a fresh import is the
workaround recommended in #10104 for a module that a setup file preloaded.
On v5 that workaround stops working as soon as the fresh imports are
concurrent.

Expected: `["mock", "mock", "mock"]`
Actual on 5.0.3: `["mock", "real", "real"]`

Variants I checked on 5.0.3:
- the same imports awaited sequentially: passes
- one import of a module that statically imports the three: passes
- no `setupFiles` entry: passes
- an async factory using `importOriginal`: fails the same way

Possibly related: #11460 shows the same symptom (the first import gets the
mock, the rest get the real module), but for concurrent imports from one
importer, and it reproduces on v2, v3 and v4. This one needs the setup
preload plus `resetModules`, and is green on 4.1.11.

Disclosure: an AI assistant (Claude) helped reduce this to a minimal
reproduction and draft this text. I hit the bug in a real suite while
upgrading from vitest 4 to 5, I have run the reproduction myself, and I will
answer questions here personally.
```

**Reproduction**: the link from step 2, followed by:

```text
npm i && npx vitest run
concurrent.test.js fails on vitest 5.0.3 and passes on 4.1.11.
```

**System Info**: paste the `envinfo` output from step 3.

**Used Package Manager**: `npm` (the reproduction uses npm; this repo uses
pnpm, and the bug shows there too).

**Validations**: tick each box only after doing what it says. The
duplicate-search box is step 1.

## Step 5 — record it here

Once the issue exists:

1. Put its link in the "Upstream" part of
   [vitest-5.md](vitest-5.md#upstream), and change the status line at the top
   of this page to "filed" with the link.
2. Add the link to the "vitest 5 follow-ups" entry in [STATUS.md](STATUS.md).
3. Watch the issue. Answer the maintainers yourself (see
   [Why a person has to file it](#why-a-person-has-to-file-it)).

## After it is fixed

When a vitest release contains the fix:

1. Bump vitest to that release.
2. Delete the workaround line from both tests in
   `packages/client-solid/src/ui/shell/layout/engine/__tests__/`:
   - `appHeadRegistry.test.ts`: `await import("../appHeadRegistry");`
   - `appPanelRegistry.test.ts`: `await import("../appPanelRegistry");`
3. Run `pnpm --filter @rtc/client-solid test:ui:contract:coverage`. It must
   pass with the lines removed; if it fails, the fix does not cover this case
   and the lines go back.
4. Remove the follow-up from [STATUS.md](STATUS.md) and note the fixed version
   in [vitest-5.md](vitest-5.md).

If the maintainers decide the behaviour is intended, keep the workaround,
record their answer in [vitest-5.md](vitest-5.md), and remove the follow-up.
