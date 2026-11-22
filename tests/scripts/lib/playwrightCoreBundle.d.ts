// playwright-core ships `lib/coreBundle` (listed in its package exports) with
// no type declarations. This declares only what `playwrightPixelDiff.ts` uses:
// the comparator behind `toHaveScreenshot`. `utils` and `getComparator` are
// typed optional on purpose, because the export is undocumented and a release
// may move it. The helper checks both at runtime and fails loudly.
declare module "playwright-core/lib/coreBundle" {
  interface ComparatorOptions {
    readonly threshold: number;
    readonly maxDiffPixels: number;
  }

  interface ComparatorResult {
    readonly errorMessage: string;
  }

  type Comparator = (
    actual: Buffer,
    expected: Buffer,
    options: ComparatorOptions,
  ) => ComparatorResult | null;

  interface CoreBundle {
    readonly utils?: {
      readonly getComparator?: (mimeType: string) => Comparator;
    };
  }

  const coreBundle: CoreBundle;

  export default coreBundle;
  export type { Comparator };
}
