import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";

import type { MachineIntentRow, MachineRow } from "@rtc/devtools-core";

import { ValueView } from "#/panels/ValueView";
import styles from "#/timeline/MachineTab.module.css";

/** The Machine tab (spec §4.3): current state, transition count, intent
 * history newest-first, and — dev builds only — the confirm-gated intent
 * injector. Relocated verbatim from the retired Machines lens. */
export function MachineTab({
  machine,
  dev,
  onInvokeIntent,
  onPinIntent,
}: MachineTabProps): ReactElement {
  return (
    <div className={styles.detail}>
      <dl className={styles.meta}>
        <MetaRow label="Kind" value={machine.machineKind} />
        <MetaRow label="Transitions" value={String(machine.transitions)} />
        <MetaRow
          label="Status"
          value={machine.disposed ? "DISPOSED" : "LIVE"}
        />
      </dl>
      <h4 className={styles.sectionTitle}>State</h4>
      <ValueView value={machine.state} />
      <h4
        className={styles.sectionTitle}
      >{`Intents (${machine.intents.length})`}</h4>
      <IntentList
        intents={machine.intents}
        machineId={machine.machineId}
        onPinIntent={onPinIntent}
      />
      {dev ? (
        <IntentInjector
          key={machine.machineId}
          machine={machine}
          onInvokeIntent={onInvokeIntent}
        />
      ) : null}
    </div>
  );
}

export interface MachineTabProps {
  machine: MachineRow;
  dev: boolean;
  onInvokeIntent?: (
    machineId: string,
    name: string,
    args: readonly unknown[],
  ) => void;
  onPinIntent?: (machineId: string, name: string, ts: number) => void;
}

interface MetaRowProps {
  label: string;
  value: string;
}

function MetaRow({ label, value }: MetaRowProps): ReactElement {
  return (
    <div className={styles.metaRow}>
      <dt className={styles.metaLabel}>{label}</dt>
      <dd className={styles.metaValue}>{value}</dd>
    </div>
  );
}

interface IntentListProps {
  intents: readonly MachineIntentRow[];
  machineId: string;
  onPinIntent?: (machineId: string, name: string, ts: number) => void;
}

function IntentList({
  intents,
  machineId,
  onPinIntent,
}: IntentListProps): ReactElement {
  const newestFirst = withIntentKeys([...intents].reverse());

  return (
    <ul className={styles.intents}>
      {newestFirst.map((entry) => {
        return (
          <li key={entry.key} className={styles.intent}>
            <IntentPinButton
              machineId={machineId}
              intent={entry.intent}
              onPinIntent={onPinIntent}
            />
            <ValueView value={entry.intent.args} />
          </li>
        );
      })}
    </ul>
  );
}

interface IntentPinButtonProps {
  machineId: string;
  intent: MachineIntentRow;
  onPinIntent?: (machineId: string, name: string, ts: number) => void;
}

/** The only clickable part of an intent-history row. Deliberately a SIBLING
 * of `ValueView` (never its parent/wrapper) — `ValueView` renders `<details>/
 * <summary>` disclosures for object/array/map/set args, and nesting those
 * inside a `<button>` is both invalid content-model nesting and a live bug:
 * a click on the nested `<summary>` bubbles up and would fire this button's
 * `onClick` too, pinning on every expand/collapse instead of only on an
 * intentional pin click. */
function IntentPinButton({
  machineId,
  intent,
  onPinIntent,
}: IntentPinButtonProps): ReactElement {
  function pinIntentOnTimeline(): void {
    onPinIntent?.(machineId, intent.name, intent.ts);
  }

  return (
    <button
      type="button"
      className={styles.intentPin}
      onClick={pinIntentOnTimeline}
    >
      <span data-testid="intent-name" className={styles.intentName}>
        {intent.name}
      </span>
    </button>
  );
}

interface IntentInjectorProps {
  machine: MachineRow;
  onInvokeIntent?: (
    machineId: string,
    name: string,
    args: readonly unknown[],
  ) => void;
}

/** Dev-only, confirm-gated intent injection. Buttons come from the DISTINCT
 * intent names observed on this machine (the only place names reach the panel
 * under the v1 protocol); a future protocol addition could surface the full
 * name set up front. Confirming parses the JSON textarea to an array and hands
 * it to `onInvokeIntent`, which the session forwards over `intent:invoke`. */
function IntentInjector({
  machine,
  onInvokeIntent,
}: IntentInjectorProps): ReactElement {
  const names = distinctIntentNames(machine.intents);
  const [pending, setPending] = useState<string | null>(null);
  const [argsText, setArgsText] = useState("[]");
  const [error, setError] = useState<string | null>(null);

  function arm(name: string): void {
    setPending(name);
    setError(null);
  }

  function cancel(): void {
    setPending(null);
    setError(null);
  }

  function confirm(): void {
    if (pending === null) {
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(argsText);
    } catch {
      setError("Args must be valid JSON.");

      return;
    }

    if (!Array.isArray(parsed)) {
      setError('Args must be a JSON array, e.g. ["EURUSD", 1000000].');

      return;
    }

    onInvokeIntent?.(machine.machineId, pending, parsed as readonly unknown[]);
    setPending(null);
    setError(null);
  }

  function changeIntentArgs(event: ChangeEvent<HTMLTextAreaElement>): void {
    setArgsText(event.target.value);
  }

  return (
    <section data-testid="intent-injector" className={styles.inject}>
      <h4 className={styles.sectionTitle}>Inject intent (dev)</h4>
      {names.length === 0 ? (
        <p className={styles.empty}>
          No intents observed yet — trigger one from the app to enable
          injection.
        </p>
      ) : (
        <div className={styles.injectButtons}>
          {names.map((name) => {
            return <ArmButton key={name} name={name} onArm={arm} />;
          })}
        </div>
      )}
      <label className={styles.injectLabel}>
        Args (JSON array)
        <textarea
          className={styles.injectArgs}
          value={argsText}
          onChange={changeIntentArgs}
        />
      </label>
      {error !== null ? (
        <p data-testid="intent-error" className={styles.injectError}>
          {error}
        </p>
      ) : null}
      {pending !== null ? (
        <div data-testid="intent-confirm" className={styles.injectConfirm}>
          <span className={styles.injectConfirmText}>
            {`Fire ${pending}(${argsText}) on ${machine.machineId}?`}
          </span>
          <button
            type="button"
            data-testid="intent-confirm-yes"
            className={styles.injectButton}
            onClick={confirm}
          >
            Confirm
          </button>
          <button
            type="button"
            className={styles.injectButton}
            onClick={cancel}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </section>
  );
}

interface ArmButtonProps {
  name: string;
  onArm: (name: string) => void;
}

function ArmButton({ name, onArm }: ArmButtonProps): ReactElement {
  function armIntent(): void {
    onArm(name);
  }

  return (
    <button
      type="button"
      data-testid="intent-invoke-button"
      className={styles.injectButton}
      onClick={armIntent}
    >
      {name}
    </button>
  );
}

function distinctIntentNames(
  intents: readonly MachineIntentRow[],
): readonly string[] {
  const seen = new Set<string>();

  for (const intent of intents) {
    seen.add(intent.name);
  }

  return [...seen];
}

interface KeyedIntent {
  intent: MachineIntentRow;
  key: string;
}

/** Pairs each (already newest-first) intent with a positional React key
 * WITHOUT exposing the index in the `.map` that renders JSX — `biome`'s
 * `noArrayIndexKey` flags any `key` expression reading a map callback's own
 * index parameter, so the index is assigned here, one level removed from the
 * render. Intents have no natural id and can repeat a name+ts pair. */
function withIntentKeys(intents: readonly MachineIntentRow[]): KeyedIntent[] {
  return intents.map((intent, i) => {
    return { intent, key: `${i}` };
  });
}
