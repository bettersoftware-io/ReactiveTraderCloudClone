// Refuse to REGENERATE the canonical `react/` visual goldens on a non-x86 host.
//
// Since the single-set collapse, `baseline` is the constant `react`, so a native
// `--update` run on arm64 (a Mac, or the linux-arm64 sandbox) writes THIS host's
// pixels straight into `react/` and corrupts the canonical x86 set — the exact
// footgun the ADR warns about. The sanctioned regen paths all render as x64 and
// pass this guard untouched:
//   - `pnpm goldens:regen` — the emulated `--platform linux/amd64` container.
//   - the `update-visual-goldens` workflow — the pinned container on a CI runner.
//
// Only regeneration is blocked; asserting (verify / CI) is never gated. Escape
// hatch for a deliberate throwaway experiment: RTC_ALLOW_NATIVE_GOLDEN_UPDATE=1.
//
// Imported and called at the top of all three react tier configs, so it fires
// whether goldens are regenerated via the `:update` npm scripts OR a direct
// `npx playwright … --update-snapshots` / `npx vitest … --update` invocation.
export function guardGoldenUpdate(): void {
  const isUpdate = process.argv.some((arg) => {
    return arg.startsWith("--update") || arg === "-u";
  });

  if (!isUpdate) {
    return;
  }

  if (process.arch === "x64") {
    return;
  }

  if (process.env.RTC_ALLOW_NATIVE_GOLDEN_UPDATE === "1") {
    return;
  }

  console.error(
    [
      "",
      `✋ Refusing to regenerate react/ goldens on ${process.platform}-${process.arch}.`,
      "",
      "The canonical golden set is x86-only. A native --update here would write",
      "this host's pixels into react/ and corrupt the CI-enforced set. Regenerate",
      "through the pinned container instead:",
      "",
      "    pnpm goldens:regen                 # local, needs Docker",
      "    # …or dispatch update-visual-goldens.yml (no Docker needed)",
      "",
      "See packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md.",
      "Override (throwaway experiment; will NOT match CI):",
      "    RTC_ALLOW_NATIVE_GOLDEN_UPDATE=1",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
