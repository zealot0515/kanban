import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

test("dev launcher preserves the installed agent PATH and handles macOS Bash arguments", {
	skip: process.platform === "win32",
}, () => {
	const fixture = mkdtempSync(join(tmpdir(), "kanban dev launcher "));
	try {
		const repo = join(fixture, "checkout with spaces");
		const bundle = join(repo, "overrides/task-customizations");
		const userBin = join(fixture, "user bin");
		for (const dir of [bundle, userBin, join(repo, "scripts"), join(repo, "node_modules/.bin"), join(repo, "web-ui/node_modules")]) {
			mkdirSync(dir, { recursive: true });
		}
		copyFileSync(new URL("./run-dev.sh", import.meta.url), join(bundle, "run-dev.sh"));
		for (const modules of ["node_modules", "web-ui/node_modules"]) {
			writeFileSync(join(repo, modules, ".package-lock.json"), "{}");
		}
		// A dependency provides a competing CLI, just like the SDK's transitive Codex.
		for (const bin of [userBin, join(repo, "node_modules/.bin")]) {
			writeFileSync(join(bin, "codex"), "#!/bin/sh\nexit 99\n", { mode: 0o755 });
		}
		symlinkSync(process.execPath, join(userBin, "node"));
		writeFileSync(join(repo, "package.json"), JSON.stringify({
			scripts: { "dev:full": "node scripts/dev-full.mjs" },
		}));
		// Observe the runtime launch environment without starting a server or any agent.
		writeFileSync(join(repo, "scripts/dev-full.mjs"), `
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
const codex = process.env.PATH.split(delimiter).map(dir => join(dir, "codex")).find(file => {
  try { accessSync(file, constants.X_OK); return true; } catch { return false; }
});
console.log(JSON.stringify({ codex, args: process.argv.slice(2), mode: process.env.NODE_ENV, noUpdate: process.env.KANBAN_NO_AUTO_UPDATE }));
process.exit(37);
`);
		for (const args of [[], ["--skip-install", "--host", "value with spaces", "$literal"]]) {
			const result = spawnSync("/bin/bash", [join(bundle, "run-dev.sh"), ...args], {
				cwd: fixture,
				env: { ...process.env, PATH: `${userBin}${delimiter}${process.env.PATH}`, NODE_ENV: "production", KANBAN_NO_AUTO_UPDATE: "0" },
				encoding: "utf8",
				timeout: 10_000,
			});
			assert.ifError(result.error);
			assert.equal(result.status, 37, result.stderr);
			assert.deepEqual(JSON.parse(result.stdout.trim().split("\n").at(-1)), {
				codex: join(userBin, "codex"),
				args: args.filter(arg => arg !== "--skip-install"),
				mode: "development",
				noUpdate: "1",
			});
		}
	} finally {
		rmSync(fixture, { recursive: true, force: true });
	}
});
