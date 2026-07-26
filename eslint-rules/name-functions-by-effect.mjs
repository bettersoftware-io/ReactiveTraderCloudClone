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
// Listener/Callback/Handler/Fn as a callback by convention. A callback type
// named otherwise yields a false positive; rename the type or the method.

const TRIGGER_PREFIX = /^(on|handle)[A-Z]/;

const VACUOUS_VERB =
  /^(?:(?:process|do|perform|manage)[A-Z]|(?:respond|react)To[A-Z])/;

const EVENT_NOUN_SUFFIX =
  /^(?:click|change|key|frame|tick|press|submit|msg|message)(?:Handler|Callback|Cb)$/i;

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
 * consumers register with, not a handler that runs. */
function isAttachPoint(params) {
  if (params?.length !== 1) {
    return false;
  }

  const annotation = params[0].typeAnnotation;
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
