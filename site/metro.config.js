const { getDefaultConfig } = require("expo/metro-config");

/** Metro padrão do Expo (web). O site importa CSS puro em src/styles.css. */
module.exports = getDefaultConfig(__dirname);
