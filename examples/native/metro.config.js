const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const config = getDefaultConfig(__dirname);
const repository = path.resolve(__dirname, "../..");
config.watchFolders = [repository];
// Resolve React and native modules from this app, even for the linked library.
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [
  path.join(__dirname, "node_modules"),
  path.join(repository, "node_modules"),
];
config.resolver.assetExts.push("epub");
module.exports = config;
