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

function declKind(stmt) {
  const node =
    stmt.type === "ExportNamedDeclaration" && stmt.declaration
      ? stmt.declaration
      : stmt;
  return node.type;
}

function isSecondary(stmt) {
  if (isMovableMock(stmt)) {
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
  return {
    Program(program) {
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
        if (isSecondary(body[i])) {
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
    schema: [],
    messages: {
      moveDown:
        "Newspaper order: move type/helper declarations below the tests ({{count}} found).",
    },
  },
  create,
};
