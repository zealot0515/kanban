#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const bundle = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.env.KANBAN_OVERRIDE_ROOT || resolve(bundle, "../.."));
const manifestPath = resolve(bundle, "manifest.json");
const patchPath = resolve(bundle, "changes.patch");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const action = process.argv[2] || "check";

function git(args, allowed = [0]) {
	const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
	if (result.error) throw result.error;
	if (!allowed.includes(result.status)) throw new Error(result.stderr || `git ${args[0]} failed`);
	return result;
}

try {
	if (action === "export") {
		// An explicit file list prevents unrelated edits and runtime secrets entering the bundle.
		const tracked = [];
		const added = [];
		for (const file of manifest.files) {
			if (git(["cat-file", "-e", `HEAD:${file}`], [0, 128]).status === 0) tracked.push(file);
			else added.push(file);
		}
		let patch = tracked.length ? git(["diff", "--binary", "--full-index", "HEAD", "--", ...tracked]).stdout : "";
		for (const file of added) patch += git(["diff", "--no-index", "--binary", "--full-index", "--", "/dev/null", file], [0, 1]).stdout;
		if (!patch.trim()) throw new Error("No override changes found; existing bundle was preserved.");
		writeFileSync(patchPath, patch);
		writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, baseCommit: git(["rev-parse", "HEAD"]).stdout.trim() }, null, 2)}\n`);
		console.log(`Exported ${manifest.files.length} files to ${patchPath}`);
	} else if (["check", "apply", "remove"].includes(action)) {
		const canApply = git(["apply", "--check", patchPath], [0, 1]).status === 0;
		const canRemove = git(["apply", "--reverse", "--check", patchPath], [0, 1]).status === 0;
		if (action === "check") {
			if (!canApply && !canRemove) throw new Error("Override conflicts with this checkout. No files changed; reconcile changes.patch with the upstream changes first.");
			console.log(canRemove ? "Override is already applied." : "Override can be applied.");
		} else if (action === "apply") {
			if (canRemove) console.log("Override is already applied.");
			else {
				if (!canApply) throw new Error("Override conflicts with this checkout. No files changed. Run check after reconciling upstream changes.");
				git(["apply", patchPath]);
				console.log("Override applied. Rebuild Kanban before starting it.");
			}
		} else {
			if (!canRemove) throw new Error("Cannot remove this override cleanly. No files changed; preserve or export your newer edits first.");
			git(["apply", "--reverse", patchPath]);
			console.log("Override removed. The bundle remains available for reapplication.");
		}
	} else throw new Error("Usage: node overrides/task-customizations/override.mjs [check|apply|remove|export]");
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
