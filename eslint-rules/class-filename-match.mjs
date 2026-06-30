function isTopLevel(node) {
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  if (parent.type === "Program") {
    return true;
  }
  return (
    (parent.type === "ExportNamedDeclaration" ||
      parent.type === "ExportDefaultDeclaration") &&
    parent.parent?.type === "Program"
  );
}

function baseSegment(filename) {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.split(".")[0];
}

function create(context) {
  const filename = context.filename;
  return {
    ClassDeclaration(node) {
      if (!node.id || !isTopLevel(node)) {
        return;
      }
      const base = baseSegment(filename);
      const className = node.id.name;
      if (className !== base) {
        context.report({
          node: node.id,
          messageId: "mismatch",
          data: { className, base },
        });
      }
    },
  };
}

export const classFilenameMatch = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A top-level class must live in a file whose name matches the class name.",
    },
    schema: [],
    messages: {
      mismatch:
        "Class '{{className}}' must match its filename — the file's name should start with '{{className}}', but it is '{{base}}'. Give the class its own file named '{{className}}.ts' (or '{{className}}.testHelpers.ts' for an extracted test double), or for a small/local double add `// eslint-disable-next-line rtc/class-filename-match -- <reason>`.",
    },
  },
  create,
};
