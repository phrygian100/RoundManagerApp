const { getDefaultConfig } = require('@expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// Add .cjs extension to source extensions to resolve Firebase v9 CommonJS files
defaultConfig.resolver.sourceExts.push('cjs');

// Keep Metro close to defaults; avoid Node polyfills that can destabilize Android bundling
defaultConfig.resolver.unstable_enablePackageExports = false;
defaultConfig.resolver.assetExts = defaultConfig.resolver.assetExts.filter(ext => ext !== 'svg');
defaultConfig.resolver.sourceExts = [...defaultConfig.resolver.sourceExts, 'svg'];

module.exports = defaultConfig; 