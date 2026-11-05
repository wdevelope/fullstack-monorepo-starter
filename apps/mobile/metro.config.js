const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// getDefaultConfig detects the pnpm workspace: it watches the repo root and resolves the
// symlinked workspace packages (@starter/contracts, @starter/api-client) from their real paths.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: path.join(__dirname, "global.css"),
  configPath: path.join(__dirname, "tailwind.config.js"),
});
