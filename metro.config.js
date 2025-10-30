// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname, {
  isCSSEnabled: true, // bật CSS cho Metro
});

module.exports = withNativeWind(config, { input: "./global.css" });
