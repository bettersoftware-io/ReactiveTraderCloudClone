import { createSignal, flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import { sceneCanvasPage } from "#tests/ui/pages/SceneCanvasPage";

afterEach(() => {
  page.unmountAll();
});

// The paint runs in an effect's apply phase, which Solid 2 never tracks: a
// scene read inside the `draw` slot would paint the first scene and then
// never again. The scene is a prop the effect reads in its compute phase,
// and these cases pin that a new scene repaints.
describe("SceneCanvas", () => {
  it("paints its scene once the box has a size", () => {
    const painted = page.mount(() => {
      return "first";
    });

    expect(painted).toEqual(["first"]);
  });

  it("repaints when the scene changes, with the new scene", () => {
    const [scene, setScene] = createSignal("first");
    const painted = page.mount(scene);

    setScene("second");
    flush();

    expect(painted).toEqual(["first", "second"]);
  });
});

const page = sceneCanvasPage();
