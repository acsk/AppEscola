if (!Array.prototype.toReversed) {
  Object.defineProperty(Array.prototype, "toReversed", {
    value: function toReversed() {
      return Array.from(this).reverse();
    },
    configurable: true,
    writable: true,
  });
}

if (!URL.canParse) {
  URL.canParse = function canParse(url, base) {
    try {
      new URL(url, base);
      return true;
    } catch {
      return false;
    }
  };
}

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Permite que o Metro transforme pdfjs-dist (usa import.meta, não suportado pelo Hermes)
const defaultTransformIgnorePatterns = config.transformer?.transformIgnorePatterns ?? [
  "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind)",
];

config.transformer = {
  ...config.transformer,
  transformIgnorePatterns: defaultTransformIgnorePatterns.map((pattern) =>
    pattern.replace(
      "node_modules/(?!",
      "node_modules/(?!(pdfjs-dist|react-pdf)|"
    )
  ),
};

const nativeWindConfig = withNativeWind(config, { input: "./global.css" });
const upstreamResolve = nativeWindConfig.resolver.resolveRequest;

nativeWindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("lucide-react-native/dist/esm/icons/")) {
    return {
      type: "sourceFile",
      filePath: path.join(__dirname, "node_modules", moduleName),
    };
  }
  if (typeof upstreamResolve === "function") return upstreamResolve(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = nativeWindConfig;
