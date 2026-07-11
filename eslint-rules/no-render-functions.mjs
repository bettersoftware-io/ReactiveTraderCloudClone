// rtc/no-render-functions — JSX belongs in components, not render helpers.
//
// Flags any function named `render*` (renderTab, renderPanel, renderItem…)
// that returns JSX from its own scope. The fix is always the same: write a
// standalone React component and use it as JSX — components show up in React
// DevTools, get their own reconciliation identity, and keep UI structure
// declarative at the call site (docs/architecture/17-web-client-up-close.md
// §17.1 documents the DevTools cost of render helpers).
//
// Deliberately NOT flagged:
// - Test/tooling helpers that RETURN A CALL, not JSX — e.g. an RTL-style
//   `renderWithTheme(ui)` returning `render(<Provider>{ui}</Provider>)`. The
//   JSX there is an argument, never the returned value.
// - Anonymous arrows in render-prop position (`renderItem={({ item }) =>
//   <Row … />}`) — the render-prop API shape is the callee's contract; the
//   rule keys on the *name*, and an inline arrow has none.

const RENDER_NAME = /^render[A-Z0-9_]/;

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

/** True when `expr` is a JSX value in return position — a JSX element or
 * fragment, possibly behind conditionals/logicals/casts (`cond ? <A/> : null`,
 * `flag && <B/>`, `<C/> as ReactElement`). A CallExpression is NOT a JSX
 * value, even when its arguments contain JSX. */
function isJsxValue(expr) {
  if (!expr) {
    return false;
  }

  switch (expr.type) {
    case "JSXElement":
    case "JSXFragment":
      return true;
    case "ConditionalExpression":
      return isJsxValue(expr.consequent) || isJsxValue(expr.alternate);
    case "LogicalExpression":
      return isJsxValue(expr.left) || isJsxValue(expr.right);
    case "SequenceExpression":
      return isJsxValue(expr.expressions[expr.expressions.length - 1]);
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "ParenthesizedExpression":
      return isJsxValue(expr.expression);
    default:
      return false;
  }
}

/** Collect the ReturnStatements belonging to `body`'s own function scope —
 * nested function expressions/declarations are skipped, so a callback's
 * returns are never attributed to the enclosing render* function. */
function ownReturns(body) {
  const returns = [];

  function visit(node) {
    if (!node || typeof node.type !== "string") {
      return;
    }

    if (node.type === "ReturnStatement") {
      returns.push(node);
      return;
    }

    if (FUNCTION_TYPES.has(node.type)) {
      return;
    }

    for (const key of Object.keys(node)) {
      if (key === "parent") {
        continue;
      }

      const value = node[key];

      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === "object") {
            visit(child);
          }
        }
      } else if (value && typeof value === "object") {
        visit(value);
      }
    }
  }

  visit(body);
  return returns;
}

/** True when the function node returns JSX from its own scope. */
function returnsJsx(fn) {
  if (fn.body.type !== "BlockStatement") {
    return isJsxValue(fn.body);
  }

  return ownReturns(fn.body).some((r) => {
    return isJsxValue(r.argument);
  });
}

export const noRenderFunctions = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Forbid render*-named functions that return JSX — write a standalone React component instead",
    },
    schema: [],
    messages: {
      renderFunction:
        "'{{name}}' is a render function — a `render*`-named function returning JSX. Write a standalone React component and use it as JSX instead: components appear in React DevTools and keep UI structure declarative at the call site.",
    },
  },

  create(context) {
    function check(fn, nameNode, name) {
      if (!RENDER_NAME.test(name) || !returnsJsx(fn)) {
        return;
      }

      context.report({
        node: nameNode,
        messageId: "renderFunction",
        data: { name },
      });
    }

    return {
      FunctionDeclaration(node) {
        if (node.id) {
          check(node, node.id, node.id.name);
        }
      },
      VariableDeclarator(node) {
        if (
          node.id.type === "Identifier" &&
          node.init &&
          (node.init.type === "ArrowFunctionExpression" ||
            node.init.type === "FunctionExpression")
        ) {
          check(node.init, node.id, node.id.name);
        }
      },
      Property(node) {
        if (
          !node.computed &&
          node.value &&
          (node.value.type === "ArrowFunctionExpression" ||
            node.value.type === "FunctionExpression")
        ) {
          const name =
            node.key.type === "Identifier"
              ? node.key.name
              : node.key.type === "Literal"
                ? String(node.key.value)
                : null;

          if (name) {
            check(node.value, node.key, name);
          }
        }
      },
      MethodDefinition(node) {
        if (
          !node.computed &&
          node.key.type === "Identifier" &&
          node.value.type === "FunctionExpression"
        ) {
          check(node.value, node.key, node.key.name);
        }
      },
    };
  },
};
