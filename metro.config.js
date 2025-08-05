const { getDefaultConfig } = require('@expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// Add .cjs extension to source extensions to resolve Firebase v9 CommonJS files
defaultConfig.resolver.sourceExts.push('cjs');

// Disable package exports to avoid module resolution issues
defaultConfig.resolver.unstable_enablePackageExports = false;

// Add explicit resolver options to handle path issues
defaultConfig.resolver.extraNodeModules = {
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
  // Add more if needed for your deps
};
defaultConfig.resolver.assetExts = defaultConfig.resolver.assetExts.filter(ext => ext !== 'svg');
defaultConfig.resolver.sourceExts = [...defaultConfig.resolver.sourceExts, 'svg'];

module.exports = defaultConfig; 