import ts from "typescript";

/** from-specifier → exported name → the specifier to import it from instead.
 * A name absent from its inner map stays where it is. */
export type RepointMap = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

export interface RepointResult {
  text: string;
  moved: number;
  problems: readonly string[];
}

/** Rewrites every named import and re-export in `text` whose module is a key
 * of `map`, so each name comes from its mapped module. Written to the repo's
 * target import style: types only → `import type { … }`; types and values →
 * ONE declaration with inline `type` (a type-only import spelled with inline
 * `type` survives as a runtime import under `verbatimModuleSyntax`). Names
 * landing in a module the file already imports are merged into that import,
 * and that module's own split type/value declarations collapse into one.
 * Everything outside the touched declarations is left byte for byte. */
export function repointImports(
  fileName: string,
  text: string,
  map: RepointMap,
): RepointResult {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const problems: string[] = [];
  const imports: NamedImport[] = [];
  const incoming = new Map<string, Spec[]>();
  const rewritten = new Map<ts.Statement, string[]>();
  let moved = 0;

  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) {
      continue;
    }

    const from = moduleOf(node);

    if (from === undefined) {
      continue;
    }

    const targets = map[from];
    const specs = namedSpecs(node);
    const obstacle =
      specs === undefined
        ? "only named imports and re-exports are supported"
        : findLossyRewrite(source, node);

    // A declaration that cannot be re-rendered faithfully is never touched:
    // reported when it is one this run was asked to repoint, and passed over
    // as a merge target otherwise.
    if (specs === undefined || obstacle !== undefined) {
      if (targets !== undefined) {
        problems.push(
          `${fileName}: cannot repoint \`${node.getText(source)}\` — ${obstacle}`,
        );
      }

      continue;
    }

    const leaving = groupByTarget(specs, targets);
    const staying = specs.filter((spec) => {
      return targets?.[spec.name] === undefined;
    });

    moved += specs.length - staying.length;

    if (ts.isImportDeclaration(node)) {
      imports.push({ node, module: from, staying, loses: leaving.size > 0 });

      for (const [target, list] of leaving) {
        incoming.set(target, [...(incoming.get(target) ?? []), ...list]);
      }
    } else if (leaving.size > 0) {
      rewritten.set(node, [
        ...renderEach("export", leaving),
        ...(staying.length > 0 ? [render("export", from, staying)] : []),
      ]);
    }
  }

  // A declaration may both lose names and gain them (it imports from a module
  // that is a key of the map AND a target), so each import's final text is
  // computed once, from what stays in it plus what arrives.
  const inserted = new Map<string, Spec[]>();

  for (const [target, arriving] of incoming) {
    const [host, ...duplicates] = imports.filter((declaration) => {
      return declaration.module === target;
    });

    if (host === undefined) {
      inserted.set(target, arriving);
      continue;
    }

    host.staying = dedupe([
      ...host.staying,
      ...duplicates.flatMap((duplicate) => {
        return duplicate.staying;
      }),
      ...arriving,
    ]);
    host.loses = true;

    for (const duplicate of duplicates) {
      duplicate.staying = [];
      duplicate.loses = true;
    }
  }

  const changed = imports.filter((declaration) => {
    return declaration.loses;
  });

  for (const [index, declaration] of changed.entries()) {
    rewritten.set(declaration.node, [
      // New declarations go where the first rewritten import stood, so a
      // comment above it stays attached to an import.
      ...(index === 0 ? renderEach("import", inserted) : []),
      ...(declaration.staying.length > 0
        ? [render("import", declaration.module, declaration.staying)]
        : []),
    ]);
  }

  return { text: replaceStatements(source, rewritten), moved, problems };
}

interface Spec {
  name: string;
  alias: string | undefined;
  isType: boolean;
}

interface NamedImport {
  node: ts.ImportDeclaration;
  module: string;
  staying: Spec[];
  /** Whether the declaration's text changes. */
  loses: boolean;
}

function moduleOf(node: ts.Statement): string | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }

  return undefined;
}

/** The declaration's named specifiers, or `undefined` when it is not purely
 * a named import/re-export (default, namespace, side-effect, `export *`). */
function namedSpecs(node: ts.Statement): Spec[] | undefined {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;

    if (
      clause === undefined ||
      clause.name !== undefined ||
      clause.namedBindings === undefined ||
      !ts.isNamedImports(clause.namedBindings)
    ) {
      return undefined;
    }

    const typeOnly = clause.isTypeOnly;

    return clause.namedBindings.elements.map((element) => {
      return toSpec(element, typeOnly);
    });
  }

  if (
    ts.isExportDeclaration(node) &&
    node.exportClause !== undefined &&
    ts.isNamedExports(node.exportClause)
  ) {
    const typeOnly = node.isTypeOnly;

    return node.exportClause.elements.map((element) => {
      return toSpec(element, typeOnly);
    });
  }

  return undefined;
}

function toSpec(
  element: ts.ImportSpecifier | ts.ExportSpecifier,
  typeOnly: boolean,
): Spec {
  return {
    name: (element.propertyName ?? element.name).text,
    alias: element.propertyName === undefined ? undefined : element.name.text,
    isType: typeOnly || element.isTypeOnly,
  };
}

/** Why re-rendering `node` from its specifiers would lose something, if it
 * would: `render` writes the names and the module, nothing else. */
function findLossyRewrite(
  source: ts.SourceFile,
  node: ts.ImportDeclaration | ts.ExportDeclaration,
): string | undefined {
  const text = source.text;
  const head = text.slice(
    node.getStart(source),
    node.moduleSpecifier?.getStart(source),
  );
  const lineEnd = text.indexOf("\n", node.getEnd());
  const tail = text.slice(
    node.getEnd(),
    lineEnd === -1 ? text.length : lineEnd,
  );

  if (node.attributes !== undefined) {
    return "it has import attributes";
  }

  if (/\/[/*]/.test(head)) {
    return "it has a comment inside it";
  }

  if (tail.trim() !== "") {
    return "something follows it on its line";
  }

  return undefined;
}

/** One entry per binding: a name that arrives where the file already imports
 * it is imported once, as a value if either side needs the value. */
function dedupe(specs: readonly Spec[]): Spec[] {
  const byBinding = new Map<string, Spec>();

  for (const spec of specs) {
    const binding = `${spec.name} as ${spec.alias ?? spec.name}`;
    const seen = byBinding.get(binding);

    byBinding.set(binding, {
      ...spec,
      isType: seen === undefined ? spec.isType : seen.isType && spec.isType,
    });
  }

  return [...byBinding.values()];
}

/** The specs that move, keyed by the module each moves to. */
function groupByTarget(
  specs: readonly Spec[],
  targets: Readonly<Record<string, string>> | undefined,
): Map<string, Spec[]> {
  const groups = new Map<string, Spec[]>();

  for (const spec of specs) {
    const target = targets?.[spec.name];

    if (target !== undefined) {
      groups.set(target, [...(groups.get(target) ?? []), spec]);
    }
  }

  return groups;
}

/** One declaration per module, modules in alphabetical order — so the output
 * does not depend on the order the names were written in. */
function renderEach(
  keyword: "import" | "export",
  groups: ReadonlyMap<string, readonly Spec[]>,
): string[] {
  return [...groups.keys()].sort().map((module) => {
    return render(keyword, module, groups.get(module) ?? []);
  });
}

function render(
  keyword: "import" | "export",
  module: string,
  specs: readonly Spec[],
): string {
  const allTypes = specs.every((spec) => {
    return spec.isType;
  });

  const names = [...specs]
    .sort((a, b) => {
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    })
    .map((spec) => {
      const binding =
        spec.alias === undefined ? spec.name : `${spec.name} as ${spec.alias}`;

      return !allTypes && spec.isType ? `type ${binding}` : binding;
    });

  return `${keyword}${allTypes ? " type" : ""} { ${names.join(", ")} } from "${module}";`;
}

/** `source`'s text with each statement replaced by its lines. A statement
 * replaced by no lines goes together with its line break; leading comments
 * are never part of the replaced span. */
function replaceStatements(
  source: ts.SourceFile,
  rewritten: ReadonlyMap<ts.Statement, readonly string[]>,
): string {
  let out = source.text;
  const lastFirst = [...rewritten].sort(([a], [b]) => {
    return b.getStart(source) - a.getStart(source);
  });

  for (const [node, lines] of lastFirst) {
    const end = node.getEnd();
    const removesLine = lines.length === 0 && out[end] === "\n";

    out =
      out.slice(0, node.getStart(source)) +
      lines.join("\n") +
      out.slice(removesLine ? end + 1 : end);
  }

  return out;
}
