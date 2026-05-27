module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required for @gorhom/bottom-sheet
      'react-native-reanimated/plugin',
      // Path aliases matching tsconfig.json
      [
        'module-resolver',
        {
          root: ['.'],
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
          alias: {
            '@': '.',
            '@theme': './theme/index.ts',
            '@components': './components',
            '@hooks': './hooks',
            '@services': './services',
            '@types': './types',
            '@tasks': './tasks',
          },
        },
      ],
    ],
  };
};
