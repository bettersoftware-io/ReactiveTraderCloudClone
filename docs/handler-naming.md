# Handler Naming

A function's own name must state its **effect** — what it does, to what —
never the occasion that triggers it. `rtc/name-functions-by-effect`
(`eslint-rules/name-functions-by-effect.mjs`) enforces this on every
`.ts`/`.tsx` file in the repo: `handleClick`, `onMessage`, `processClick` and
`frameCallback` (when the binding holds a function) all fail CI.

## Slots vs. handlers

The rule turns on one distinction. A **SLOT** is a placeholder a consumer
attaches a handler to — a function-typed prop, or a method whose sole
parameter is the callback. Its declarer cannot know what the consumer will do
and must not try to name it: that is decoupling, and `onX` is the correct
name. A **CONCRETE HANDLER** receives the event (or nothing) and *is* what
runs; there, `onX`/`handleX` states only when it happens and forces every
reader into the body to learn what it actually does.

```jsx
<Car onYellowLight={prepare} onRedLight={stop} />   // ✅ slot names the
                                                     //    event, handler
                                                     //    names the effect
<Car onYellowLight={handleYellowLight} />           // ❌ handler is empty
<Car prepare={prepare} />                           // ❌ slot now dictates
                                                     //    the parent's intent
```

**Slots are exempt and correct as `onX`.** `<Car onYellowLight={prepare} />`
is right; `<Car onYellowLight={handleYellowLight} />` is not.

### Property vs. method syntax

Slot syntax matters. A function-typed member written in **property** syntax
(`onExecute: (d: Direction) => void`) is exempt as a slot. The identical
intent written in **method** syntax (`onExecute(d: Direction): void`) parses
as a method whose parameter is *data*, not a callback, so it is flagged as a
command. This is deliberate, not an oversight: a genuine prop slot must be
declared in property syntax; method syntax is reserved for things that run.
So `onTrade(listener: TradeListener)` (a method whose sole parameter *is* the
callback) is still recognized as a slot — the discriminator is which way the
function flows, not the syntax alone.

## Handlers get names even when the body is one line

An inline arrow (`onChange={(e) => { notional.change(e.target.value); }}`) is
maximally coupled to its one call site — it cannot be reused from a different
trigger at all, which is the exact coupling the rule exists to remove.
Extract and name it instead: `onChange={changeNotional}` over the inline
form.

Since 2026-09, rtc/name-jsx-handlers enforces the extraction itself — an
inline arrow in an on-slot is a lint error in migrated packages.

## A name is part of the contract

When a diff — or a merge — widens a function's condition, guard, or set of
effects, re-check that its name still describes them; the lint rule cannot,
since a decayed name is still perfectly well-formed. `dismissOnReducedMotion`
decayed exactly this way once a catch-up merge widened its condition to also
cover power-saver Freeze, and was renamed to `dismissOnJumpCut`.

## Two known limits, both deliberate

1. **It cannot verify the replacement.** `handleClick` → `handleClicked`
   passes and is no better. The rule only makes the lazy name unavailable so
   the author has to decide — a green lint is not an endorsement of a name.
2. **`handle` is also a domain noun** (drag/file/socket handles, or this
   repo's resize handles between split panes). `LayoutEnginePage.handleExists`
   means "does the resize handle exist" and is a true false positive. The
   prescribed response is a **disambiguating rename**
   (`resizeHandleExists`), never a disable — read cold, `handleExists` really
   could mean "does the handler exist," which is the ambiguity this rule
   cares about.

## Further reading

- Design: [`docs/superpowers/specs/2026-07-26-name-functions-by-effect-design.md`](superpowers/specs/2026-07-26-name-functions-by-effect-design.md)
- Architecture writeup: [§17](architecture/17-web-client-up-close.md)
- The rule itself: `eslint-rules/name-functions-by-effect.mjs`
