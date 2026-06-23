import { type ReactElement, useSyncExternalStore } from "react";
import type { BehaviorSubject } from "rxjs";

/** Renders the component from the latest props on the subject; re-renders on push. */
export function PropsHost<P>({
  subject,
  build,
}: {
  subject: BehaviorSubject<Partial<P>>;
  build: (props: Partial<P>) => ReactElement;
}): ReactElement {
  const props = useSyncExternalStore(
    (onChange) => {
      const sub = subject.subscribe(onChange);

      return (): void => {
        sub.unsubscribe();
      };
    },
    (): Partial<P> => {
      return subject.getValue();
    },
  );
  return build(props);
}
