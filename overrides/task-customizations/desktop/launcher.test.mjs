import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("custom macOS launcher uses the bundle and preserves arguments, environment policy, and exit status", {
	skip: process.platform !== "darwin",
}, () => {
	const fixture = mkdtempSync(path.join(tmpdir(), "kanban custom launcher "));
	try {
		const contents = path.join(fixture, "Renamed App.app/Contents");
		const bin = path.join(contents, "Resources/bin");
		const cli = path.join(contents, "Resources/app.asar.unpacked/cli");
		mkdirSync(bin, { recursive: true });
		mkdirSync(cli, { recursive: true });
		mkdirSync(path.join(contents, "MacOS"));
		writeFileSync(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Test Runtime</string></dict></plist>`);
		// A real Node executable stands in for Electron's run-as-node mode.
		symlinkSync(process.execPath, path.join(contents, "MacOS/Test Runtime"));
		writeFileSync(path.join(cli, "cli.js"), `
console.log(JSON.stringify({
  args: process.argv.slice(2),
  electron: process.env.ELECTRON_RUN_AS_NODE,
  noUpdate: process.env.KANBAN_NO_AUTO_UPDATE,
}));
process.exit(37);
`);
		const launcher = path.join(bin, "kanban");
		copyFileSync(new URL("./kanban", import.meta.url), launcher);
		chmodSync(launcher, 0o755);
		const result = spawnSync(launcher, ["--port", "3987", "with spaces", "$literal"], {
			encoding: "utf8",
			timeout: 5_000,
			env: { ...process.env, PATH: "/usr/bin:/bin", KANBAN_NO_AUTO_UPDATE: "0" },
		});
		assert.ifError(result.error);
		assert.equal(result.status, 37, result.stderr);
		assert.deepEqual(JSON.parse(result.stdout), {
			args: ["--skip-shutdown-cleanup", "--port", "3987", "with spaces", "$literal"],
			electron: "1",
			noUpdate: "1",
		});
	} finally {
		rmSync(fixture, { recursive: true, force: true });
	}
});
