import type { CSSProperties, ReactElement } from "react";
import { useRef } from "react";

import { CreditBlotterPanel } from "#/credit/Blotter/CreditBlotterPanel";
import styles from "#/credit/CreditScreen.module.css";
import { NewRfqPanel } from "#/credit/NewRfq/NewRfqPanel";
import { RfqFilterPills, RfqsPanel } from "#/credit/Rfqs/RfqsPanel";
import type { CreditPanelId } from "#/credit/useCreditDock";
import { useCreditDock } from "#/credit/useCreditDock";
import { useCreditForm } from "#/credit/useCreditForm";
import { useCreditRfqs } from "#/credit/useCreditRfqs";
import { Panel } from "#/layout/Panel";
import { SplitHandle } from "#/layout/SplitHandle";
import { useSplit } from "#/layout/useSplit";

// PROTO 349-520 (Credit variant): the form-vs-right width and the persisted
// dock defaults, mirroring FxScreen's MAIN_SPLIT_INITIAL/LEFT_SPLIT_INITIAL.
const MAIN_SPLIT_INITIAL = 0.25; // creditW
const STACK_SPLIT_INITIAL = 0.62; // creditStackR

// Named (not inline string literal) `id`/head-key props — same
// useUniqueElementIds rationale as FxScreen's TILES_PANEL.
const RFQS_PANEL: CreditPanelId = "rfqs";
const CBLOT_PANEL: CreditPanelId = "cblot";
const FORM_PANEL = "rfqform";

// The Credit dock: a left column (New RFQ form) beside a right column (RFQs
// over the Credit Blotter, split creditStackR), the two columns themselves
// split by creditW. The form has no maximize of its own — it just collapses
// to a restore strip whenever a right panel maximizes (useCreditDock derives
// `leftCollapsed` from `maxPanel`), mirroring FX's aside collapse but driven
// by maximize instead of an independent toggle.
export function CreditScreen(): ReactElement {
  const form = useCreditForm();
  const rfqs = useCreditRfqs();
  const dock = useCreditDock();

  const screenRef = useRef<HTMLDivElement | null>(null);
  const rightColRef = useRef<HTMLDivElement | null>(null);

  const mainSplit = useSplit({
    storageKey: "creditW",
    orientation: "v",
    initial: MAIN_SPLIT_INITIAL,
    containerRef: screenRef,
  });

  const stackSplit = useSplit({
    storageKey: "creditStackR",
    orientation: "h",
    initial: STACK_SPLIT_INITIAL,
    containerRef: rightColRef,
  });

  function handleSend(): void {
    if (form.valid) {
      rfqs.sendRfq(form.value);
      form.clear();
    }
  }

  const countText = `${rfqs.creditTrades.length} trades`;

  const geom = {
    "--main-ratio": mainSplit.ratio,
    "--stack-ratio": stackSplit.ratio,
  } as CSSProperties;

  return (
    <div
      ref={screenRef}
      className={styles.screen}
      data-testid="credit-screen"
      data-max-panel={dock.maxPanel ?? ""}
      style={geom}
    >
      {dock.leftCollapsed ? (
        <LeftCollapsedStrip onRestore={dock.restore} />
      ) : (
        <div className={styles.leftCol}>
          <Panel
            maximizable={false}
            id={FORM_PANEL}
            head={<span className={styles.regionLabel}>✚ New RFQ</span>}
            headAccessory="⊕"
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <NewRfqPanel form={form} onSend={handleSend} />
          </Panel>
        </div>
      )}

      <div className={styles.mainHandle}>
        <SplitHandle api={mainSplit} />
      </div>

      <div className={styles.rightCol} ref={rightColRef}>
        <div className={styles.rfqsRegion}>
          <Panel
            id={RFQS_PANEL}
            head={<span className={styles.regionLabel}>◳ RFQs</span>}
            headControls={
              <RfqFilterPills
                creditTab={rfqs.creditTab}
                liveCount={rfqs.liveCount}
                onTab={rfqs.onTab}
              />
            }
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <RfqsPanel rfqs={rfqs} />
          </Panel>
        </div>

        <div className={styles.rightHandle}>
          <SplitHandle api={stackSplit} />
        </div>

        <div className={styles.cblotRegion}>
          <Panel
            id={CBLOT_PANEL}
            head={<span className={styles.regionLabel}>▤ Credit Blotter</span>}
            maxPanel={dock.maxPanel}
            onToggleMax={dock.toggleMax}
          >
            <CreditBlotterPanel
              trades={rfqs.creditTrades}
              count={countText}
              newCreditId={rfqs.newCreditId}
              onExport={rfqs.onExport}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

interface LeftCollapsedStripProps {
  onRestore(): void;
}

// The left column collapsed to a restore strip (cf. FxScreen's
// AsideCollapsedStrip) — shown whenever a right panel (rfqs/cblot) is
// maximized, since the form has no room to render alongside it.
function LeftCollapsedStrip(props: LeftCollapsedStripProps): ReactElement {
  const { onRestore } = props;

  return (
    <div className={styles.collapsedStrip}>
      <button type="button" className={styles.stripBtn} onClick={onRestore}>
        ⛶ NEW RFQ
      </button>
    </div>
  );
}
