// rtc/newspaper-order — in a test file the TESTS are the lede. Supporting
// declarations sit below them, so a reader meets what the file asserts before
// the machinery that makes it possible.
//
// TWO ARMS, deliberately different in strength:
//
// 1. HELPERS AND TYPES — always on, repo-wide. Function declarations, type
//    aliases, interfaces and the hoisted `vi.mock`/`jest.mock` calls are moved
//    below the tests. All four are safe to move UNCONDITIONALLY: declarations
//    hoist, types are erased, and both runners hoist their mock factories above
//    the imports, so physical position cannot change behaviour.
//
// 2. FIXTURES (`{ fixtures: true }`) — opt-in per package. Module-level
//    `const`/`let` fixtures join the move. This one cannot be unconditional,
//    because a `const` does NOT hoist: Vitest runs every `describe` callback
//    synchronously at COLLECTION time, so a fixture that a describe body reads
//    would land in the temporal dead zone and kill the file at import. The rule
//    therefore moves a fixture only when every reference to it is DEFERRED —
//    read after module evaluation finishes — following helper calls
//    transitively to decide (see isMovableFixture / isDeferredReference).
//    Anything it cannot prove deferred is left exactly where it is.
//
// The arm is opt-in rather than repo-wide because it is a burn-down, not a
// flip: 430 declarations across 199 test files at the time it was added. The
// migrated list lives in eslint.config.mjs; add a package once its tree is
// clean.
//
// class/enum/`vi.doMock`/`jest.doMock`/`vi.hoisted` always stay put — the first
// two because a class is not hoisted the way a function is and moving it can
// break `extends`, the rest because they run in place by design.

const PRIMARY_CALLERS = new Set([
  "describe",
  "it",
  "test",
  "suite",
  "beforeEach",
  "afterEach",
  "beforeAll",
  "afterAll",
]);

function baseCalleeName(callee) {
  let node = callee;
  while (node) {
    if (node.type === "MemberExpression") {
      node = node.object;
    } else if (node.type === "CallExpression") {
      node = node.callee;
    } else if (node.type === "TaggedTemplateExpression") {
      node = node.tag;
    } else {
      break;
    }
  }
  return node && node.type === "Identifier" ? node.name : null;
}

function isPrimary(stmt) {
  if (stmt.type !== "ExpressionStatement") {
    return false;
  }
  const expr = stmt.expression;
  if (expr?.type !== "CallExpression") {
    return false;
  }
  const name = baseCalleeName(expr.callee);
  return name !== null && PRIMARY_CALLERS.has(name);
}

// `vi.mock`/`vi.unmock` (Vitest) and `jest.mock`/`jest.unmock` (Jest) are all
// hoisted above the imports by their respective transforms, so their physical
// position is irrelevant to behaviour and they can sit below the tests like any
// other helper. The non-hoisted variants (`vi.doMock`, `jest.doMock`) run in
// place and must NOT be moved — they are deliberately excluded here.
function isMovableMock(stmt) {
  if (stmt.type !== "ExpressionStatement") {
    return false;
  }
  const expr = stmt.expression;
  if (expr?.type !== "CallExpression") {
    return false;
  }
  const callee = expr.callee;
  return (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    (callee.object.name === "vi" || callee.object.name === "jest") &&
    callee.property.type === "Identifier" &&
    (callee.property.name === "mock" || callee.property.name === "unmock")
  );
}

// Callbacks these receive are registered now and RUN LATER, after the module has
// finished evaluating. `describe` is deliberately NOT here: its callback runs
// SYNCHRONOUSLY at collection, so anything it dereferences is read while the
// module is still evaluating.
const DEFERRED_CALLERS = new Set([
  "it",
  "test",
  "beforeEach",
  "afterEach",
  "beforeAll",
  "afterAll",
]);

/** True when this identifier is only ever read after module evaluation finishes
 * — i.e. it sits inside a callback handed to `it`/`test`/a hook. Walking out to
 * Program without crossing one of those boundaries means the read happens
 * DURING evaluation (top-level code, or a `describe` body at collection time).
 *
 * Indirection through helpers is followed: a read inside a function declaration
 * is deferred exactly when every call to that function is itself deferred,
 * recursively. Without this the check is far too weak to be useful — fixtures
 * are overwhelmingly reached through a `base()`/`seed()` helper rather than
 * named in the `it` body.
 *
 * Nesting depth is deliberately NOT part of the test. The helpers that matter
 * here are declared INSIDE a `describe` body, not at module level, and an
 * earlier cut that only followed top-level declarations moved 2 of the 8
 * fixtures in `createDockEngine.test.ts` while leaving every prominent one in
 * place. `seen` breaks mutual recursion; a cycle no eager caller enters is by
 * definition never evaluated at module time. */
function isDeferredReference(identifier, sourceCode, seen) {
  let node = identifier;
  while (node && node.type !== "Program") {
    const parent = node.parent;
    if (
      (node.type === "ArrowFunctionExpression" ||
        node.type === "FunctionExpression") &&
      parent?.type === "CallExpression" &&
      parent.arguments.includes(node)
    ) {
      const name = baseCalleeName(parent.callee);
      if (name !== null && DEFERRED_CALLERS.has(name)) {
        return true;
      }
    }
    if (node.type === "FunctionDeclaration") {
      return isCalledOnlyWhenDeferred(node, sourceCode, seen);
    }
    node = parent;
  }
  return false;
}

/** True when nothing calls this helper during module evaluation, so a binding it
 * closes over is not read then either. A helper merely MENTIONED at
 * top level (`[build]`, `register(build)`) fails here: the reference is not
 * inside a deferred callback, and where the value ends up is unknowable. */
function isCalledOnlyWhenDeferred(fnDecl, sourceCode, seen) {
  if (seen.has(fnDecl)) {
    return true;
  }
  seen.add(fnDecl);

  return sourceCode.getDeclaredVariables(fnDecl).every((variable) => {
    return variable.references.every((ref) => {
      return isDeferredReference(ref.identifier, sourceCode, seen);
    });
  });
}

/** `vi.hoisted`/`jest.hoisted` initialisers must stay above the mocks they feed,
 * so a binding holding one is never moved — the same exclusion the non-hoisted
 * `vi.doMock` gets above. */
function holdsHoistedCall(stmt) {
  return stmt.declarations.some((d) => {
    const init = d.init;
    return (
      init?.type === "CallExpression" &&
      init.callee.type === "MemberExpression" &&
      init.callee.object.type === "Identifier" &&
      (init.callee.object.name === "vi" ||
        init.callee.object.name === "jest") &&
      init.callee.property.type === "Identifier" &&
      init.callee.property.name === "hoisted"
    );
  });
}

/** True when a module-level `const`/`let` can be moved below the tests WITHOUT
 * changing behaviour.
 *
 * Unlike a function declaration, a `const` is not hoisted: moving one below a
 * `describe` that reads it during collection puts that read in the temporal
 * dead zone, and the file dies at import. So this is gated on every reference
 * being DEFERRED — read only after module evaluation completes.
 *
 * The check is deliberately CONSERVATIVE and lexical. A reference reached
 * through a top-level helper (`it(... build() ...)` where `build()` closes over
 * the binding) is reported as NOT movable, even though it usually would be,
 * because proving it needs a call graph: the same helper could equally be
 * invoked from a `describe` body. Skipping a safe move costs nothing; making an
 * unsafe one breaks the suite at import time. */
function isMovableFixture(stmt, sourceCode) {
  if (stmt.type !== "VariableDeclaration") {
    return false;
  }
  if (stmt.kind !== "const" && stmt.kind !== "let") {
    return false;
  }
  if (holdsHoistedCall(stmt)) {
    return false;
  }

  const declared = sourceCode.getDeclaredVariables(stmt);
  if (declared.length === 0) {
    return false;
  }

  return declared.every((variable) => {
    return variable.references.every((ref) => {
      // The declaration's OWN initialiser is not a read of the binding — it is
      // what creates it, and it travels with the statement when it moves.
      if (ref.init) {
        return true;
      }
      return isDeferredReference(ref.identifier, sourceCode, new Set());
    });
  });
}

function declKind(stmt) {
  const node =
    stmt.type === "ExportNamedDeclaration" && stmt.declaration
      ? stmt.declaration
      : stmt;
  return node.type;
}

function isSecondary(stmt, sourceCode, fixtures) {
  if (isMovableMock(stmt)) {
    return true;
  }
  if (fixtures && isMovableFixture(stmt, sourceCode)) {
    return true;
  }
  const kind = declKind(stmt);
  return (
    kind === "FunctionDeclaration" ||
    kind === "TSTypeAliasDeclaration" ||
    kind === "TSInterfaceDeclaration"
  );
}

function startWithLeadingComments(node, sourceCode) {
  const comments = sourceCode.getCommentsBefore(node);
  let start = node.range[0];
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    const tokenBefore = sourceCode.getTokenBefore(comment, {
      includeComments: true,
    });
    if (tokenBefore && tokenBefore.loc.end.line === comment.loc.start.line) {
      break;
    }
    start = comment.range[0];
  }
  return start;
}

function create(context) {
  const sourceCode = context.sourceCode;
  const fixtures = context.options[0]?.fixtures === true;
  return {
    // `:exit` rather than enter: isDeferredReference walks `parent` pointers,
    // which ESLint only populates as it traverses.
    "Program:exit"(program) {
      const body = program.body;
      let lastPrimary = -1;
      for (let i = 0; i < body.length; i++) {
        if (isPrimary(body[i])) {
          lastPrimary = i;
        }
      }
      if (lastPrimary === -1) {
        return;
      }

      const violations = [];
      for (let i = 0; i < lastPrimary; i++) {
        if (isSecondary(body[i], sourceCode, fixtures)) {
          violations.push(body[i]);
        }
      }
      if (violations.length === 0) {
        return;
      }

      context.report({
        node: violations[0],
        messageId: "moveDown",
        data: { count: String(violations.length) },
        fix(fixer) {
          const fixes = [];
          const chunks = [];
          for (const node of violations) {
            const start = startWithLeadingComments(node, sourceCode);
            const nextToken = sourceCode.getTokenAfter(node, {
              includeComments: true,
            });
            const end = nextToken ? nextToken.range[0] : node.range[1];
            fixes.push(fixer.removeRange([start, end]));
            chunks.push(sourceCode.text.slice(start, node.range[1]));
          }
          const programEnd = sourceCode.ast.range[1];
          fixes.push(
            fixer.insertTextAfterRange(
              [programEnd, programEnd],
              `\n${chunks.join("\n\n")}\n`,
            ),
          );
          return fixes;
        },
      });
    },
  };
}

export const newspaperOrder = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Test files: keep type/helper declarations below the tests (newspaper order).",
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          // Opt-in per package while the burn-down runs: module-level
          // const/let fixtures join the move, but only the provably-deferred
          // ones (see isMovableFixture).
          fixtures: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      moveDown:
        "Newspaper order: move type/helper declarations below the tests ({{count}} found).",
    },
  },
  create,
};
