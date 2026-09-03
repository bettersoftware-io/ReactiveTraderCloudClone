import { expect, test } from "@jest/globals";

import { useBootSceneFontsPage } from "#tests/pages/UseBootSceneFontsPage";

const SPECS = {
  small: { size: 9 },
  body: { size: 11 },
  heading: { size: 18, bold: true },
} as const;

test("builds one font per declared site", async () => {
  const page = useBootSceneFontsPage();
  const fonts = await page.fontsFor(SPECS);

  expect(fonts).not.toBeNull();
  expect(Object.keys(fonts ?? {}).sort()).toEqual(["body", "heading", "small"]);
});

test("builds each font at its declared size", async () => {
  const page = useBootSceneFontsPage();
  const fonts = await page.fontsFor(SPECS);

  expect(fonts?.small.__size).toBe(9);
  expect(fonts?.body.__size).toBe(11);
  expect(fonts?.heading.__size).toBe(18);
});

test("builds every site from a loaded face, never a bare default", async () => {
  // The actual defect: a font built with NO typeface. It draws zero glyphs on
  // device and throws nothing, so this is as close as jest can get — every
  // site must carry a face that came from a load, not `undefined`.
  const page = useBootSceneFontsPage();
  const fonts = await page.fontsFor(SPECS);

  for (const font of Object.values(fonts ?? {})) {
    expect(font.__typeface).toBeDefined();
  }
});

test("hands out nothing until a face has loaded", async () => {
  // The null window is load-bearing twice over: scenes skip their text
  // layers during it, and the visual harness withholds `visual-ready` so a
  // golden can never pin the text-less frame as correct.
  const skia = require("@shopify/react-native-skia");
  const loadedUseFont = skia.useFont;

  skia.useFont = (): null => {
    return null;
  };

  const page = useBootSceneFontsPage();

  try {
    expect(await page.fontsFor(SPECS)).toBeNull();
  } finally {
    skia.useFont = loadedUseFont;
  }
});

/**
 * What jest can and cannot witness here is the whole point of these tests.
 *
 * It CANNOT witness the bug this module exists to fix. A font with no
 * typeface draws zero glyphs on real iOS; under the Skia mock it draws
 * nothing either way, and every call still "succeeds". No assertion written
 * against a mocked rasterizer can distinguish the two. That is why the text
 * was missing on device for weeks with a fully green suite, and why the
 * device capture — not this file — is the oracle for whether glyphs appear.
 *
 * It CAN witness how each font was CONSTRUCTED: that a face is loaded at all,
 * that every declared site gets one, that the sizes are the ones the web
 * draws with, and that nothing is handed out before the faces resolve. Those
 * are the properties that were wrong, so those are the ones pinned.
 *
 * One more property turned out to be unwitnessable, and is recorded here
 * rather than faked: whether the bold sites really draw from the 700 face.
 * jest-expo resolves every `require('*.ttf')` to the same numeric asset stub,
 * so the regular and bold sources are indistinguishable under test even
 * though they are different files at runtime. A test asserting they differ
 * would only be asserting the mock. The device capture covers it — at 18px
 * the RANGE figures make the weight obvious.
 */
