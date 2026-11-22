import { configure } from "@testing-library/dom";
import { flush } from "solid-js";

// Solid 2 applies a signal write at the next microtask, not when it is made.
// A browser runs that microtask between two user events — every input event
// is its own task — so a handler always sees what the previous event wrote.
// A test fires its events synchronously, one after another in one turn (an
// input, then the submit click that reads what the input wrote), so here
// nothing would run in between. Testing Library hands every event it fires
// (fireEvent, and user-event's, which dispatch through the same hook) to the
// `eventWrapper` — the seam React's own binding wraps in `act()` — and this
// one applies the event's writes before the next line runs, as the browser's
// task boundary would.
configure({
  eventWrapper: (dispatch: () => unknown): unknown => {
    const result = dispatch();

    flush();

    return result;
  },
});
