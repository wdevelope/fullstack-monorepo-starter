const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// getDefaultConfig는 pnpm 워크스페이스를 감지한다. 저장소 루트를 감시하고, 심볼릭 링크로 연결된
// 워크스페이스 패키지(@starter/contracts, @starter/api-client)를 실제 경로에서 해석한다.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: path.join(__dirname, "global.css"),
  configPath: path.join(__dirname, "tailwind.config.js"),
});
