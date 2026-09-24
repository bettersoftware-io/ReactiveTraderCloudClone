import { BehaviorSubject } from "rxjs";

import type {
  LayoutPresetSummary,
  LayoutPresetsPresenter,
  Stream,
  WorkspaceTab,
} from "@rtc/core-api";

import {
  createLayoutPresetsController,
  type LayoutPresetsDeps,
  type PresetSummaryChannel,
} from "#/layout/layoutPresetsController";

export type { LayoutPresetsDeps };

/** The RxJS core's saved-layouts presenter: the shared controller over a
 * `BehaviorSubject` per tab. */
export function createLayoutPresets(
  deps: LayoutPresetsDeps,
): LayoutPresetsPresenter {
  return createLayoutPresetsController(deps, createSubjectSummaryChannel());
}

function createSubjectSummaryChannel(): PresetSummaryChannel {
  const byTab = new Map<
    WorkspaceTab,
    BehaviorSubject<readonly LayoutPresetSummary[]>
  >();

  function subjectFor(
    tab: WorkspaceTab,
    initial: () => readonly LayoutPresetSummary[],
  ): BehaviorSubject<readonly LayoutPresetSummary[]> {
    const existing = byTab.get(tab);

    if (existing) {
      return existing;
    }

    const subject = new BehaviorSubject(initial());
    byTab.set(tab, subject);
    return subject;
  }

  return {
    streamFor: (
      tab: WorkspaceTab,
      initial: () => readonly LayoutPresetSummary[],
    ): Stream<readonly LayoutPresetSummary[]> => {
      return subjectFor(tab, initial).asObservable();
    },
    publish: (
      tab: WorkspaceTab,
      summaries: readonly LayoutPresetSummary[],
    ): void => {
      subjectFor(tab, () => {
        return summaries;
      }).next(summaries);
    },
  };
}
