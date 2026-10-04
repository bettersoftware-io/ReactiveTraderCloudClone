import path from "node:path";

import ts from "typescript";

export interface Home {
  /** Workspace package directory name (`core-api`), or `""` if the
   * declaration is outside `packages/<pkg>/src` or did not resolve. */
  pkg: string;
  /** Path of the declaring module under that package's `src/`. */
  module: string;
  isValue: boolean;
}

/** For every export of `entryFile`: the workspace package whose source
 * declares it, found by following re-export aliases with the type checker.
 * `@rtc/<pkg>` resolves to that package's `src` through
 * `tsconfig.depcruise.json`'s path pairs; a package's own `#/…` alias
 * resolves to its own `src/`. */
export function buildHomeMap(
  entryFile: string,
  repoRoot: string,
): Record<string, Home> {
  const options = readSourceResolvingOptions(repoRoot);
  const host = ts.createCompilerHost(options);

  host.resolveModuleNames = (
    names: string[],
    containingFile: string,
  ): (ts.ResolvedModule | undefined)[] => {
    return names.map((name) => {
      return (
        resolveOwnAlias(name, containingFile) ??
        ts.resolveModuleName(name, containingFile, options, ts.sys)
          .resolvedModule
      );
    });
  };

  const program = ts.createProgram({ rootNames: [entryFile], options, host });
  const checker = program.getTypeChecker();
  const entry = program.getSourceFile(entryFile);
  const moduleSymbol =
    entry === undefined ? undefined : checker.getSymbolAtLocation(entry);

  if (moduleSymbol === undefined) {
    throw new Error(`${entryFile} is not a module`);
  }

  const homes: Record<string, Home> = {};

  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const target =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
    const file = target.declarations?.[0]?.getSourceFile().fileName ?? "";
    const match = path
      .relative(repoRoot, file)
      .match(/^packages\/([^/]+)\/src\/(.*)$/);

    homes[exported.getName()] = {
      pkg: match?.[1] ?? "",
      module: match?.[2] ?? file,
      isValue: (target.flags & ts.SymbolFlags.Value) !== 0,
    };
  }

  return homes;
}

/** `tsconfig.depcruise.json`'s options: the path pairs that send `@rtc/<pkg>`
 * to that package's `src` instead of its `dist`. */
function readSourceResolvingOptions(repoRoot: string): ts.CompilerOptions {
  const config = ts.getParsedCommandLineOfConfigFile(
    path.join(repoRoot, "tsconfig.depcruise.json"),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (
        diagnostic: ts.Diagnostic,
      ): void => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
      },
    },
  );

  if (config === undefined) {
    throw new Error("tsconfig.depcruise.json did not parse");
  }

  return { ...config.options, noEmit: true, skipLibCheck: true };
}

function resolveOwnAlias(
  name: string,
  containingFile: string,
): ts.ResolvedModuleFull | undefined {
  const own = containingFile.match(/^(.*\/packages\/[^/]+)\/src\//);

  if (!name.startsWith("#/") || own === null) {
    return undefined;
  }

  for (const extension of [".ts", ".tsx", "/index.ts"]) {
    const candidate = `${own[1]}/src/${name.slice(2)}${extension}`;

    if (ts.sys.fileExists(candidate)) {
      return {
        resolvedFileName: candidate,
        extension: extension === ".tsx" ? ts.Extension.Tsx : ts.Extension.Ts,
      };
    }
  }

  return undefined;
}
