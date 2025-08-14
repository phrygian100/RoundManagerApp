const { getDefaultConfig } = require('@expo/metro-config');

// Use Expo's default Metro config without overrides to maximize EAS compatibility
module.exports = getDefaultConfig(__dirname);