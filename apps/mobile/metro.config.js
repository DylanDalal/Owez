// Metro config with pnpm monorepo support + Firebase v11 compatibility.
//
// Non-default settings and why each one is here:
//   1. watchFolders / nodeModulesPaths — so Metro sees the shared workspace
//      package and hoisted pnpm deps.
//   2. unstable_enableSymlinks — pnpm stores every package under
//      node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>, with symlinks at the
//      top-level `node_modules` pointing in. Metro's default resolver can't
//      walk those symlinks, which is the root cause of the
//      "Unable to resolve @babel/runtime/helpers/interopRequireDefault from
//       node_modules/.pnpm/@expo+metro-runtime@.../..." crash at boot. This
//      flag was added in Metro 0.80 specifically for pnpm/Yarn PnP layouts.
//   3. unstable_enablePackageExports — Firebase v11 ships with conditional
//      `exports` in its package.json. Without this flag Metro resolves
//      `firebase/auth` to the wrong entry and you get the cryptic
//      "Component auth has not been registered yet" error at startup.
//
// NB: `disableHierarchicalLookup` is intentionally NOT set. With
// unstable_enableSymlinks the default hierarchical resolver is what we want —
// it lets Metro walk up through symlinked `.pnpm` dirs to find peer deps.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
