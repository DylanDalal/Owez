// Metro config that teaches the bundler to resolve packages in the monorepo's
// root node_modules as well as the mobile app's own. Without this, imports
// from @owez/shared won't resolve.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Leave hierarchical lookup enabled (Metro default). `disableHierarchicalLookup: true`
// breaks pnpm: bare imports from packages under .pnpm/.../node_modules/<pkg>/ must
// resolve siblings (e.g. expo → expo-modules-core) by walking that folder.

module.exports = config;
