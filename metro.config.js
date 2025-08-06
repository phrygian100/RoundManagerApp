const { getDefaultConfig } = require('@expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// Add .cjs extension to source extensions to resolve Firebase v9 CommonJS files
defaultConfig.resolver.sourceExts.push('cjs');

// Disable package exports to avoid module resolution issues
defaultConfig.resolver.unstable_enablePackageExports = false;

// Add explicit resolver options to handle Node core modules in RN. These `require.resolve` calls
// run inside EAS *before* npm ci installs packages, so wrap them in try/catch.
const extraNodeModules = {};
try { extraNodeModules.crypto = require.resolve('crypto-browserify'); } catch {}
try { extraNodeModules.stream = require.resolve('stream-browserify'); } catch {}
if (Object.keys(extraNodeModules).length) {
  defaultConfig.resolver.extraNodeModules = {
    ...(defaultConfig.resolver.extraNodeModules || {}),
    ...extraNodeModules,
  };
}
defaultConfig.resolver.assetExts = defaultConfig.resolver.assetExts.filter(ext => ext !== 'svg');
defaultConfig.resolver.sourceExts = [...defaultConfig.resolver.sourceExts, 'svg'];

module.exports = defaultConfig; 