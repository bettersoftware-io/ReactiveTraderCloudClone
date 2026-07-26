// rtc/name-functions-by-effect — a function's own name must state its EFFECT
// (what it does, to what), never the occasion that triggers it.
//
// The rule turns on one distinction. A SLOT is a placeholder consumers attach a
// handler to — a function-typed prop, or a method whose parameter IS the
// callback. Its declarer cannot name the intent and must not try to: that is
// decoupling, and `onX` is the correct name. A CONCRETE HANDLER receives event
// data (or nothing) and *is* what runs; there `onX`/`handleX` states only when
// it happens and forces every reader into the body.
//
//   <Car onYellowLight={prepare} onRedLight={stop} />   // ✅ slot names the
//                                                       //    event, handler
//                                                       //    names the effect
//   <Car onYellowLight={handleYellowLight} />            // ❌ handler is empty
//   <Car prepare={prepare} />                            // ❌ slot now dictates
//                                                       //    the parent's intent
//
// The discriminator is which way the function flows, so it needs no type
// checker: a slot RECEIVES a function; a handler receives data and runs.
//
// SLOT SYNTAX MATTERS. A function-typed member written in PROPERTY syntax
// (`onToggleDealer: (id: number) => void`) is exempt as a slot. The identical
// intent written in METHOD syntax (`onToggleDealer(id: number): void`) parses
// as a method whose param is DATA, not a callback, so it is flagged as a
// command. This is deliberate, not an oversight: a genuine prop slot must be
// declared in property syntax; method syntax is reserved for things that run.
//
// HANDLERS GET NAMES EVEN WHEN THE BODY IS ONE LINE. The rule cannot enforce
// extraction — it only sees the identifier a handler is already bound to —
// but a reader arriving here from the error message should still extract and
// name an inline arrow (`onChange={(e) => { setX(e.target.value); }}`) rather
// than reach for `handleChange`. An inline arrow is maximally coupled to its
// one call site: it cannot be reused from a different trigger at all, which
// is the exact coupling this rule exists to remove.
//
// TWO KNOWN LIMITS, both deliberate:
//
// 1. It cannot verify the replacement. `handleClick` -> `handleClicked` passes
//    and is no better. The rule only makes the lazy name UNAVAILABLE so the
//    author has to decide — a green lint is not an endorsement of a name.
// 2. `handle` is also a domain noun (drag/file/socket handles).
//    `LayoutEnginePage.handleExists` means "does the resize handle exist" and is
//    a true false positive. The prescribed response is a DISAMBIGUATING RENAME
//    (`resizeHandleExists`), never a disable — read cold, `handleExists` really
//    could mean "does the handler exist," which is the ambiguity this rule cares
//    about.
//
// Resolving a named param type (`listener: TradeListener`) would need type
// information, so the attach-point check treats a type reference ending in
// Listener/Callback/Handler/Fn as a callback by convention. Two failure
// directions follow from that, and only one is documented by habit — both
// matter:
//   - A genuine callback type NOT named with one of those suffixes yields a
//     FALSE POSITIVE (the handler is flagged even though it's a slot); rename
//     the type or the method.
//   - A NON-function type whose name happens to END IN one of those suffixes
//     (e.g. `type FakeHandler = { id: string }`) yields a FALSE NEGATIVE — a
//     real handler is silently exempted. This direction is the dangerous one:
//     it fails open, not loud. Zero such sites today.
//
// EVENT_NOUN_SUFFIX is a CLOSED LIST BY DESIGN, not an attempt at completeness.
// It targets the common, unthinking renames (frameCallback, clickHandler) — a
// determined evader can always contrive a noun outside the list. Widen the
// list when a real instance shows up; don't chase hypothetical ones.
//
// NOT VISITED (known gaps, zero sites today, left unvisited on purpose rather
// than by oversight):
//   - TSAbstractMethodDefinition (`abstract handleClick(e: string): void;`)
//   - TSDeclareFunction (ambient declarations, overload signatures)
//   - functionValueOf() returns null — and so the binding is unchecked — for
//     an identifier alias (`const handleAlias: Cb = other`), a `.bind()`
//     result, and the member-call form `React.useCallback(...)` (only the
//     bare-identifier `useCallback(...)` call is unwrapped).

const TRIGGER_PREFIX = /^(on|handle)[A-Z]/;

const VACUOUS_VERB =
  /^(?:(?:process|do|perform|manage)[A-Z]|(?:respond|react)To[A-Z])/;

const EVENT_NOUN_SUFFIX =
  /^(?:click|change|key|frame|tick|press|submit|msg|message|mouse|pointer|scroll|drag|drop|input|focus|blur|wheel|touch|tap|load|error|data|paint)(?:Handler|Callback|Cb)$/i;

const CALLBACK_TYPE_NAME = /(?:Listener|Callback|Handler|Fn)$/;

const FUNCTION_EXPRESSIONS = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
]);

/** True when the name states a trigger or nothing at all, rather than an effect. */
function statesNoEffect(name) {
  return (
    TRIGGER_PREFIX.test(name) ||
    VACUOUS_VERB.test(name) ||
    EVENT_NOUN_SUFFIX.test(name)
  );
}

/** True when `node` is a type node denoting a function — an inline function
 * type, a *Listener/*Callback/*Handler/*Fn type reference, or a union
 * containing either. */
function isCallbackType(node) {
  if (!node) {
    return false;
  }

  switch (node.type) {
    case "TSFunctionType":
    case "TSConstructorType":
      return true;
    case "TSTypeReference":
      return (
        node.typeName.type === "Identifier" &&
        CALLBACK_TYPE_NAME.test(node.typeName.name)
      );
    case "TSUnionType":
    case "TSIntersectionType":
      return node.types.some((t) => {
        return isCallbackType(t);
      });
    case "TSParenthesizedType":
      return isCallbackType(node.typeAnnotation);
    default:
      return false;
  }
}

/** True when the sole parameter IS the callback — i.e. this is an attach point
 * consumers register with, not a handler that runs. Unwraps a defaulted
 * parameter (`cb: Cb = () => {}`) to its left-hand pattern first, since the
 * type annotation lives there rather than on the AssignmentPattern itself. */
function isAttachPoint(params) {
  if (params?.length !== 1) {
    return false;
  }

  const sole = params[0];
  const pattern = sole.type === "AssignmentPattern" ? sole.left : sole;
  const annotation = pattern.typeAnnotation;
  return isCallbackType(annotation ? annotation.typeAnnotation : null);
}

/** The function expression a binding holds, unwrapping `useCallback(fn, deps)`.
 * Returns null for anything that is not a function value — `vi.fn()` calls and
 * uninitialised declarators land here, which is why spies and slot captures are
 * legal by construction rather than by carve-out. */
function functionValueOf(init) {
  if (!init) {
    return null;
  }

  if (FUNCTION_EXPRESSIONS.has(init.type)) {
    return init;
  }

  if (
    init.type === "CallExpression" &&
    init.callee.type === "Identifier" &&
    init.callee.name === "useCallback"
  ) {
    const first = init.arguments[0];

    if (first && FUNCTION_EXPRESSIONS.has(first.type)) {
      return first;
    }
  }

  return null;
}

export const nameFunctionsByEffect = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require function names to state their effect — what the function does, to what — not the occasion that triggers it. Forbids on*/handle* and vacuous verbs (process*, do*, perform*, manage*) on concrete handlers, while leaving slots (function-typed props, attach points) alone",
    },
    schema: [],
    messages: {
      nameByEffect:
        "'{{name}}' names its trigger, not its effect. Name it for what it does, to what — an effect verb plus a DOMAIN noun, never an event noun. A name that states its effect also survives being wired to a different trigger: handleClick -> dismissTicket; processClick -> dismissTicket (still an event noun); handleKeyDown -> blurNotionalOnEnter; onMessage -> emitParsedFrame; onConnect -> recordConnect; frameCallback -> drawFrame. If this name is a SLOT consumers attach to — a function-typed prop, or a method whose sole parameter is a callback — the rule does not fire; check the shape.",
    },
  },

  create(context) {
    function check(nameNode, name, params) {
      if (!statesNoEffect(name) || isAttachPoint(params)) {
        return;
      }

      context.report({
        node: nameNode,
        messageId: "nameByEffect",
        data: { name },
      });
    }

    return {
      FunctionDeclaration(node) {
        if (node.id) {
          check(node.id, node.id.name, node.params);
        }
      },
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier") {
          return;
        }

        const fn = functionValueOf(node.init);

        if (fn) {
          check(node.id, node.id.name, fn.params);
        }
      },
      PropertyDefinition(node) {
        if (node.computed || node.key.type !== "Identifier") {
          return;
        }

        const fn = functionValueOf(node.value);

        if (fn) {
          check(node.key, node.key.name, fn.params);
        }
      },
      MethodDefinition(node) {
        if (!node.computed && node.key.type === "Identifier") {
          check(node.key, node.key.name, node.value.params);
        }
      },
      TSMethodSignature(node) {
        if (!node.computed && node.key.type === "Identifier") {
          check(node.key, node.key.name, node.params);
        }
      },
    };
  },
};
