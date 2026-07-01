// Learn more: https://docs.expo.dev/guides/monorepo/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so Metro sees workspace-package changes.
config.watchFolders = [workspaceRoot];

// 2. Resolve from app-local AND workspace-root node_modules (pnpm strict layout).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. pnpm symlinks + package "exports" (so @rtc/* resolve to their built dist).
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
