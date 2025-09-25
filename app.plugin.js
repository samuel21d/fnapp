// app.plugin.js
const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withIapPlayStore(config) {
  return withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;

    // Inserta la estrategia dentro de defaultConfig { ... }
    if (!src.includes("missingDimensionStrategy 'store', 'play'")) {
      src = src.replace(
        /defaultConfig\s*{([\s\S]*?)}/m,
        (match) => {
          if (match.includes("missingDimensionStrategy 'store', 'play'")) return match;
          const inject = `missingDimensionStrategy 'store', 'play'`;
          return match.replace(/defaultConfig\s*{/, `defaultConfig {\n        ${inject}`);
        }
      );
      config.modResults.contents = src;
    }
    return config;
  });
};
