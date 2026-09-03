// packages/client-react-native/tests/pages/support/sceneHarnessPage.ts
//
// Shared mounting/query surface behind every `boot/scenes/*SceneHarness`
// page (`CoreScenePage`, `LaserScenePage`, etc.) — the eight boot-scene specs
// share an identical shape (mount a harness component that turns plain
// numbers into shared values, rerender it across an elapsedSec/gyro sweep,
// then read a Skia-mocked host node's resolved props off a testID), so the
// framework surface lives here once. Each concrete page (e.g.
// `coreScenePage()`) still owns its own component-specific factory — this
// module is never imported by a spec directly, only by those factories.
import {
  type RenderResult,
  render,
  screen,
} from "@testing-library/react-native";
import type { ComponentType, ReactElement } from "react";
import { createElement } from "react";

/** The shape of the resolved props the mocked Skia/Reanimated primitives
 * expose on their host node under jest — see `jest.setup.ts`'s Skia mock. */
interface SceneNodeProps {
  picture?: unknown;
  start?: number;
  end?: { value: number };
  opacity?: { value: number };
}

export interface SceneHarnessPage<P> {
  mount(props: P): Promise<void>;
  rerender(props: P): Promise<void>;
  /** Resolves once `testId` (default: the harness's own scene testID)
   * appears; throws (with Testing Library's own diagnostic) if it never
   * does — the same failure mode `await screen.findByTestId(...)` always had
   * inline in the spec. */
  exists(testId?: string): Promise<boolean>;
  hasPicture(testId?: string): Promise<boolean>;
  startOf(testId: string): Promise<number>;
  endValueOf(testId: string): Promise<number>;
  opacityValueOf(testId: string): Promise<number>;
}

export function createSceneHarnessPage<P>(
  Harness: ComponentType<P>,
  sceneTestId: string,
): SceneHarnessPage<P> {
  let result: RenderResult | null = null;

  async function propsOf(testId: string): Promise<SceneNodeProps> {
    const node = await screen.findByTestId(testId);
    return node.props as SceneNodeProps;
  }

  return {
    async mount(props: P): Promise<void> {
      result = await render(harnessElement(Harness, props));
    },
    async rerender(props: P): Promise<void> {
      if (!result) {
        throw new Error("mount() must be called before rerender()");
      }

      await result.rerender(harnessElement(Harness, props));
    },
    async exists(testId: string = sceneTestId): Promise<boolean> {
      await screen.findByTestId(testId);
      return true;
    },
    async hasPicture(testId: string = sceneTestId): Promise<boolean> {
      const props = await propsOf(testId);
      return Boolean(props.picture);
    },
    async startOf(testId: string): Promise<number> {
      const props = await propsOf(testId);
      return props.start ?? Number.NaN;
    },
    async endValueOf(testId: string): Promise<number> {
      const props = await propsOf(testId);
      return props.end?.value ?? Number.NaN;
    },
    async opacityValueOf(testId: string): Promise<number> {
      const props = await propsOf(testId);
      return props.opacity?.value ?? Number.NaN;
    },
  };
}

function harnessElement<P>(Harness: ComponentType<P>, props: P): ReactElement {
  // `createElement`'s overloads can't unify a generic `ComponentType<P>`
  // with its own `P extends {}` constraint — every concrete page instantiates
  // this with a concrete, non-generic props type, so the cast is sound at
  // every real call site even though the generic signature isn't.
  const Component = Harness as unknown as ComponentType<Record<string, never>>;
  return createElement(Component, props as Record<string, never>);
}
