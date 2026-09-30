import { createHash } from "node:crypto";

import type { RuntimeHookEvent } from "../core/api-contract";
import { buildKanbanCommandParts } from "../core/kanban-command";
import { quoteShellArg } from "../core/shell";

const CODEX_HOOK_TIMEOUT_SECONDS = 5;
// Codex clamps Interrupt (and SessionEnd) hook timeouts to 3s before hashing the
// trust identity, so a larger value here would make Codex ask to review the hook.
const CODEX_INTERRUPT_HOOK_TIMEOUT_SECONDS = 3;

type CodexHookConfigEvent =
	| "Interrupt"
	| "PermissionRequest"
	| "PostToolUse"
	| "PreToolUse"
	| "Stop"
	| "UserPromptSubmit";

type JsonValue = JsonPrimitive | JsonArray | JsonObject;
type JsonPrimitive = boolean | null | number | string;
type JsonArray = JsonValue[];
interface JsonObject {
	[key: string]: JsonValue;
}

interface CodexHookConfig {
	eventName: CodexHookConfigEvent;
	matcher?: string;
	command: string;
	timeoutSeconds?: number;
}

interface CodexHookTrustEntry {
	key: string;
	trustedHash: string;
}

export function hasCodexConfigOverride(args: string[], key: string): boolean {
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "-c" || arg === "--config") {
			const next = args[i + 1];
			if (typeof next === "string" && next.startsWith(`${key}=`)) {
				return true;
			}
			i += 1;
			continue;
		}
		if (arg.startsWith(`-c${key}=`) || arg.startsWith(`--config=${key}=`)) {
			return true;
		}
	}
	return false;
}

function findCodexConfigOverrideInsertIndex(args: string[]): number {
	const subcommandIndex = args.findIndex((arg) => arg === "resume" || arg === "fork");
	return subcommandIndex === -1 ? args.length : subcommandIndex;
}

function addCodexConfigOverrideBeforeSubcommand(args: string[], key: string, value: string): void {
	if (hasCodexConfigOverride(args, key)) {
		return;
	}
	args.splice(findCodexConfigOverrideInsertIndex(args), 0, "-c", `${key}=${value}`);
}

function buildCodexHookCommand(event: RuntimeHookEvent): string {
	return buildKanbanCommandParts(["hooks", "codex-hook", "--event", event, "--source", "codex"])
		.map(quoteShellArg)
		.join(" ");
}

function codexHookTimeoutSeconds(config: CodexHookConfig): number {
	return config.timeoutSeconds ?? CODEX_HOOK_TIMEOUT_SECONDS;
}

function buildCodexHookConfigValue(config: CodexHookConfig): string {
	const matcherConfig = config.matcher ? `matcher=${JSON.stringify(config.matcher)},` : "";
	const commandConfig = JSON.stringify(config.command);
	return `[{${matcherConfig}hooks=[{type="command",command=${commandConfig},timeout=${codexHookTimeoutSeconds(config)}}]}]`;
}

function codexSessionFlagsConfigSource(): string {
	return process.platform === "win32" ? String.raw`C:\<session-flags>\config.toml` : "/<session-flags>/config.toml";
}

function codexHookEventKeyLabel(eventName: CodexHookConfigEvent): string {
	switch (eventName) {
		case "Interrupt":
			return "interrupt";
		case "PermissionRequest":
			return "permission_request";
		case "PostToolUse":
			return "post_tool_use";
		case "PreToolUse":
			return "pre_tool_use";
		case "Stop":
			return "stop";
		case "UserPromptSubmit":
			return "user_prompt_submit";
	}
}

function canonicalizeJson(value: JsonValue): JsonValue {
	if (Array.isArray(value)) {
		return value.map(canonicalizeJson);
	}
	if (value !== null && typeof value === "object") {
		const sorted: JsonObject = {};
		for (const key of Object.keys(value).sort()) {
			sorted[key] = canonicalizeJson(value[key]);
		}
		return sorted;
	}
	return value;
}

function versionForCodexHookIdentity(value: JsonObject): string {
	const canonical = canonicalizeJson(value);
	const serialized = JSON.stringify(canonical);
	const hash = createHash("sha256").update(serialized).digest("hex");
	return `sha256:${hash}`;
}

function buildCodexHookTrustEntry(config: CodexHookConfig): CodexHookTrustEntry {
	const handler: JsonObject = {
		async: false,
		command: config.command,
		timeout: codexHookTimeoutSeconds(config),
		type: "command",
	};
	const group: JsonObject = {
		hooks: [handler],
	};
	if (config.matcher !== undefined) {
		group.matcher = config.matcher;
	}
	const eventKeyLabel = codexHookEventKeyLabel(config.eventName);
	const identity: JsonObject = {
		event_name: eventKeyLabel,
		...group,
	};
	return {
		key: `${codexSessionFlagsConfigSource()}:${eventKeyLabel}:0:0`,
		trustedHash: versionForCodexHookIdentity(identity),
	};
}

function buildCodexHookTrustStateConfigValue(entries: CodexHookTrustEntry[]): string {
	const states = entries.map(
		(entry) => `${JSON.stringify(entry.key)}={trusted_hash=${JSON.stringify(entry.trustedHash)}}`,
	);
	return `{${states.join(",")}}`;
}

export function configureCodexHooks(args: string[]): void {
	const inProgressHook: CodexHookConfig = {
		eventName: "UserPromptSubmit",
		command: buildCodexHookCommand("to_in_progress"),
	};
	const reviewHook: CodexHookConfig = {
		eventName: "Stop",
		command: buildCodexHookCommand("to_review"),
	};
	const interruptHook: CodexHookConfig = {
		eventName: "Interrupt",
		command: buildCodexHookCommand("to_review"),
		timeoutSeconds: CODEX_INTERRUPT_HOOK_TIMEOUT_SECONDS,
	};
	const permissionRequestHook: CodexHookConfig = {
		eventName: "PermissionRequest",
		command: buildCodexHookCommand("to_review"),
		matcher: "*",
	};
	const preToolUseActivityHook: CodexHookConfig = {
		eventName: "PreToolUse",
		command: buildCodexHookCommand("activity"),
		matcher: "*",
	};
	const postToolUseActivityHook: CodexHookConfig = {
		eventName: "PostToolUse",
		command: buildCodexHookCommand("activity"),
		matcher: "*",
	};
	const trustStateConfigValue = buildCodexHookTrustStateConfigValue(
		[
			inProgressHook,
			reviewHook,
			interruptHook,
			permissionRequestHook,
			preToolUseActivityHook,
			postToolUseActivityHook,
		].map(buildCodexHookTrustEntry),
	);

	addCodexConfigOverrideBeforeSubcommand(args, "features.hooks", "true");
	addCodexConfigOverrideBeforeSubcommand(args, "hooks.state", trustStateConfigValue);
	addCodexConfigOverrideBeforeSubcommand(args, "hooks.UserPromptSubmit", buildCodexHookConfigValue(inProgressHook));
	addCodexConfigOverrideBeforeSubcommand(args, "hooks.Stop", buildCodexHookConfigValue(reviewHook));
	addCodexConfigOverrideBeforeSubcommand(args, "hooks.Interrupt", buildCodexHookConfigValue(interruptHook));
	addCodexConfigOverrideBeforeSubcommand(
		args,
		"hooks.PermissionRequest",
		buildCodexHookConfigValue(permissionRequestHook),
	);
	addCodexConfigOverrideBeforeSubcommand(args, "hooks.PreToolUse", buildCodexHookConfigValue(preToolUseActivityHook));
	addCodexConfigOverrideBeforeSubcommand(
		args,
		"hooks.PostToolUse",
		buildCodexHookConfigValue(postToolUseActivityHook),
	);
}
