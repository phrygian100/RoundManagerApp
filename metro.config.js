const { getDefaultConfig } = require('@expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// Add .cjs extension to source extensions to resolve Firebase v9 CommonJS files
defaultConfig.resolver.sourceExts.push('cjs');

// Disable package exports to avoid module resolution issues
defaultConfig.resolver.unstable_enablePackageExports = false;

module.exports = defaultConfig; 