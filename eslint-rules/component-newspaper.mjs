const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

function isPascal(name) {
  return typeof name === "string" && PASCAL_CASE.test(name);
}

// Shallow-recursive search for a JSX node anywhere in a subtree (skips `parent`
// back-references and non-AST values).
function containsJsx(node) {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (node.type === "JSXElement" || node.type === "JSXFragment") {
    return true;
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === "string" && containsJsx(child)) {
          return true;
        }
      }
    } else if (value && typeof value.type === "string" && containsJsx(value)) {
      return true;
    }
  }
  return false;
}

// An init expression is a component value if it is an arrow/function returning
// JSX, or a memo(...)/forwardRef(...) wrapper call.
function isComponentInit(init) {
  if (!init) {
    return false;
  }
  if (
    init.type === "ArrowFunctionExpression" ||
    init.type === "FunctionExpression"
  ) {
    return containsJsx(init.body);
  }
  if (init.type === "CallExpression") {
    const callee = init.callee;
    const name =
      callee.type === "Identifier"
        ? callee.name
        : callee.type === "MemberExpression" &&
            callee.property.type === "Identifier"
          ? callee.property.name
          : null;
    return name === "memo" || name === "forwardRef";
  }
  return false;
}

// If a top-level statement declares a React component, return {name, exported};
// else null. Handles `function`, `const = …`, and their `export`/`export
// default` (named) forms.
function componentInfo(stmt) {
  let exported = false;
  let decl = stmt;
  if (
    stmt.type === "ExportNamedDeclaration" ||
    stmt.type === "ExportDefaultDeclaration"
  ) {
    if (!stmt.declaration) {
      return null;
    }
    exported = true;
    decl = stmt.declaration;
  }
  if (
    decl.type === "FunctionDeclaration" &&
    decl.id &&
    isPascal(decl.id.name) &&
    containsJsx(decl.body)
  ) {
    return { name: decl.id.name, exported };
  }
  if (decl.type === "VariableDeclaration" && decl.declarations.length === 1) {
    const d = decl.declarations[0];
    if (
      d.id.type === "Identifier" &&
      isPascal(d.id.name) &&
      isComponentInit(d.init)
    ) {
      return { name: d.id.name, exported };
    }
  }
  return null;
}

function baseSegment(filename) {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.split(".")[0];
}

function create(context) {
  const sourceCode = context.sourceCode;
  const filename = context.filename;
  return {
    Program(program) {
      const body = program.body;
      const components = [];
      for (let i = 0; i < body.length; i++) {
        const info = componentInfo(body[i]);
        if (info) {
          components.push({ ...info, index: i, node: body[i] });
        }
      }
      if (components.length === 0) {
        return;
      }
      const exported = components.filter((c) => c.exported);

      // Facet 1 — one exported component per file.
      if (exported.length > 1) {
        for (let k = 1; k < exported.length; k++) {
          context.report({
            node: exported[k].node,
            messageId: "multipleExports",
            data: { name: exported[k].name },
          });
        }
        return;
      }
      if (exported.length === 0) {
        return;
      }
      const lede = exported[0];

      // Facet 3 — filename === exported component name.
      const base = baseSegment(filename);
      if (lede.name !== base) {
        context.report({
          node: lede.node,
          messageId: "filenameMismatch",
          data: { name: lede.name, base },
        });
      }

      // Facet 2 — the exported component is the lede (first decl after imports).
      let firstNonImport = 0;
      while (
        firstNonImport < body.length &&
        body[firstNonImport].type === "ImportDeclaration"
      ) {
        firstNonImport++;
      }
      if (lede.index === firstNonImport) {
        return;
      }
      context.report({
        node: lede.node,
        messageId: "notLede",
        data: { name: lede.name },
        fix(fixer) {
          const programText = sourceCode.text;
          const nonImportBody = body.slice(firstNonImport);
          const rangeStart = nonImportBody[0].range[0];
          const rangeEnd = programText.length;
          const ledeText = programText.slice(
            lede.node.range[0],
            lede.node.range[1],
          );
          const others = nonImportBody.filter(
            (_, i) => i + firstNonImport !== lede.index,
          );
          const otherTexts = others.map((s) =>
            programText.slice(s.range[0], s.range[1]),
          );
          let replacement = ledeText;
          if (otherTexts.length > 0) {
            replacement += `\n\n${otherTexts.join("\n\n")}`;
          }
          replacement += "\n";
          return fixer.replaceTextRange([rangeStart, rangeEnd], replacement);
        },
      });
    },
  };
}

export const componentNewspaper = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "One component per .tsx file: the exported component is the newspaper lede (private subcomponents/helpers below), and the filename matches it.",
    },
    fixable: "code",
    schema: [],
    messages: {
      multipleExports:
        "A .tsx file may export only one component. Extract '{{name}}' into its own '{{name}}.tsx'.",
      notLede:
        "The exported component '{{name}}' must be the first declaration after imports (newspaper order); private subcomponents and helpers belong below it.",
      filenameMismatch:
        "Filename must match the exported component: expected '{{name}}.tsx' for component '{{name}}' (got '{{base}}').",
    },
  },
  create,
};
