const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const desktopRoot = path.join(repoRoot, "packages/desktop");
const desktopRequire = createRequire(path.join(desktopRoot, "package.json"));
const { load } = desktopRequire("js-yaml");
// Builder's `extends` concatenates extraResources, which would copy two
// different launchers to bin/kanban. Read the base and replace that list.
const upstream = load(readFileSync(path.join(desktopRoot, "electron-builder.yml"), "utf8"));
const version = process.env.KANBAN_RELEASE_VERSION;
if (!version || !/^[0-9]+\.[0-9]+\.[0-9]+-custom\.[a-f0-9]+(?:\.dirty)?$/.test(version)) {
	throw new Error("Run overrides/task-customizations/build-release.sh to set the release version.");
}

module.exports = {
	...upstream,
	appId: "com.zealot0515.kanban.custom",
	productName: "Kanban Custom",
	extraMetadata: { version },
	directories: {
		...upstream.directories,
		output: path.join(desktopRoot, "out/custom", version),
	},
	// Replace the official hardcoded executable shim for our custom app name.
	extraResources: [{ from: path.join(__dirname, "kanban"), to: "bin/kanban" }],
	afterSign: null,
	publish: null,
	mac: { ...upstream.mac, identity: "-", notarize: false },
	dmg: {
		...upstream.dmg,
		artifactName: "Kanban-Custom-${version}-${arch}.${ext}",
		writeUpdateInfo: false,
	},
};
