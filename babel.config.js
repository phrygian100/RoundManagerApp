module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Must be last for Reanimated to work in release builds
      'react-native-reanimated/plugin'
    ],
  };
};




