import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { enrichCodexHookMetadata } from "../../src/commands/hook-events/codex-native-hooks";
import type { RuntimeHookEvent, RuntimeTaskSessionSummary } from "../../src/core/api-contract";
import { prepareAgentLaunch } from "../../src/terminal/agent-session-adapters";
import { TerminalSessionManager } from "../../src/terminal/session-manager";
import { createHooksApi } from "../../src/trpc/hooks-api";

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function transcript(source: unknown, final = "Root answer") {
	const directory = await mkdtemp(join(tmpdir(), "kanban-native-hooks-"));
	directories.push(directory);
	const path = join(directory, "rollout-session.jsonl");
	await writeFile(
		path,
		[
			{ type: "session_meta", payload: { id: "session-1", cwd: "/tmp/task", source } },
			{ type: "event_msg", payload: { type: "task_started", turn_id: "turn-1" } },
			{ type: "event_msg", payload: { type: "task_complete", turn_id: "turn-1", last_agent_message: final } },
		]
			.map((line) => JSON.stringify(line))
			.join("\n"),
	);
	return path;
}

function hook(name: string, event: RuntimeHookEvent = "activity", payload: Record<string, unknown> = {}) {
	return {
		event,
		payload: { session_id: "session-1", turn_id: "turn-1", cwd: "/tmp/task", hook_event_name: name, ...payload },
		metadata: {
			source: "codex",
			hookEventName: name,
			toolName: typeof payload.tool_name === "string" ? payload.tool_name : "Bash",
			finalMessage: typeof payload.last_assistant_message === "string" ? payload.last_assistant_message : null,
		},
	};
}

function initialSummary(): RuntimeTaskSessionSummary {
	return {
		taskId: "task-1",
		state: "running",
		agentId: "codex",
		workspacePath: "/tmp/task",
		pid: 123,
		startedAt: 1,
		updatedAt: 1,
		lastOutputAt: null,
		reviewReason: null,
		exitCode: null,
		lastHookAt: null,
		latestHookActivity: null,
	};
}

describe("Codex native hook task state", () => {
	it("returns to running after tool completion, and waits again only when the root turn stops", async () => {
		const manager = new TerminalSessionManager();
		manager.hydrateFromRecord({ "task-1": initialSummary() });
		const api = createHooksApi({
			getWorkspacePathById: () => "/tmp/task",
			ensureTerminalManagerForWorkspace: async () => manager,
			broadcastRuntimeWorkspaceStateUpdated: vi.fn(),
			broadcastTaskReadyForReview: vi.fn(),
			captureTaskTurnCheckpoint: async () => ({ turn: 1, ref: "test-ref", commit: "abc", createdAt: 1 }),
			deleteTaskTurnCheckpointRef: async () => {},
		});
		async function deliver(input: ReturnType<typeof hook>) {
			const mapped = await enrichCodexHookMetadata(input, "/tmp/task");
			if (mapped)
				expect(await api.ingest({ ...mapped, taskId: "task-1", workspaceId: "workspace-1" })).toEqual({ ok: true });
			return manager.getSummary("task-1");
		}
		expect((await deliver(hook("Stop", "to_review", { last_assistant_message: "Previous answer" })))?.state).toBe(
			"awaiting_review",
		);
		expect((await deliver(hook("UserPromptSubmit", "to_in_progress")))?.state).toBe("running");
		expect(manager.getSummary("task-1")?.latestHookActivity?.finalMessage).toBeNull();
		expect((await deliver(hook("PermissionRequest", "to_review")))?.state).toBe("awaiting_review");
		expect((await deliver(hook("PostToolUse")))?.state).toBe("running");
		expect(
			(await deliver(hook("Stop", "to_review", { agent_id: "child", last_assistant_message: "Child done" })))?.state,
		).toBe("running");
		expect((await deliver(hook("Stop", "to_review", { last_assistant_message: "Root done" })))?.state).toBe(
			"awaiting_review",
		);
		expect(manager.getSummary("task-1")?.taskTitle).toBe("Root done");
	});

	it("keeps automatic approval in progress before a long-running tool completes", async () => {
		const path = await transcript("cli");
		await appendFile(
			path,
			`\n${JSON.stringify({ type: "turn_context", payload: { turn_id: "turn-1", approvals_reviewer: "auto_review" } })}\n`,
		);
		// Context may be well before the current command, beyond the final-message tail window.
		await appendFile(
			path,
			`${JSON.stringify({ type: "response_item", payload: { text: "命令輸出".repeat(220_000) } })}\n`,
		);
		expect(
			await enrichCodexHookMetadata(hook("PermissionRequest", "to_review", { transcript_path: path }), "/tmp/task"),
		).toMatchObject({
			event: "to_in_progress",
			metadata: { finalMessage: null, activityText: "Checking approval automatically" },
		});
	});

	it.each([
		{ turn_id: "turn-1", approvals_reviewer: "user" },
		{ turn_id: "previous-turn", approvals_reviewer: "auto_review" },
		{ turn_id: "turn-1" },
	])("preserves a human approval wait when automatic review is not established: %j", async (context) => {
		const path = await transcript("cli");
		await appendFile(path, `\n${JSON.stringify({ type: "turn_context", payload: context })}\n`);
		expect(
			await enrichCodexHookMetadata(hook("PermissionRequest", "to_review", { transcript_path: path }), "/tmp/task"),
		).toMatchObject({
			event: "to_review",
			metadata: { activityText: "Waiting for approval" },
		});
	});

	it("uses prompt repaint only for a pending human approval, never an idle completed turn", async () => {
		const launch = await prepareAgentLaunch({
			taskId: "task-1",
			workspaceId: "workspace-1",
			agentId: "codex",
			binary: "codex",
			args: [],
			cwd: "/tmp/task",
			prompt: "",
		});
		const manager = new TerminalSessionManager();
		manager.hydrateFromRecord({ "task-1": { ...initialSummary(), state: "awaiting_review", reviewReason: "hook" } });
		for (const name of ["PermissionRequest", "Stop", "Interrupt"]) {
			const mapped = await enrichCodexHookMetadata(
				hook(name, "to_review", { last_assistant_message: "Done" }),
				"/tmp/task",
			);
			const summary = manager.applyHookActivity("task-1", mapped?.metadata ?? {});
			if (!summary) throw new Error("Missing session");
			expect(launch.detectOutputTransition?.("\r\n› ", summary)).toEqual(
				name === "PermissionRequest" ? { type: "agent.prompt-ready" } : null,
			);
			expect(launch.shouldInspectOutputForTransition?.(summary)).toBe(name === "PermissionRequest");
		}
	});

	it("treats user questions and interrupts as waiting, and resumes on tool completion", async () => {
		const question = await enrichCodexHookMetadata(
			hook("PreToolUse", "activity", { tool_name: "functions.request_user_input" }),
			"/tmp/task",
		);
		expect(question).toMatchObject({
			event: "to_review",
			metadata: { activityText: "Waiting for your answer", finalMessage: null },
		});
		expect(
			await enrichCodexHookMetadata(
				hook("PostToolUse", "activity", { tool_name: "request_user_input" }),
				"/tmp/task",
			),
		).toMatchObject({ event: "to_in_progress" });
		expect(await enrichCodexHookMetadata(hook("PreToolUse"), "/tmp/task")).toMatchObject({ event: "to_in_progress" });
		expect(await enrichCodexHookMetadata(hook("Interrupt", "to_review"), "/tmp/task")).toMatchObject({
			event: "to_review",
			metadata: { finalMessage: null, activityText: "Interrupted; waiting for your input" },
		});
	});

	it("never attaches an old final answer to a permission request", async () => {
		const path = await transcript("cli");
		expect(
			await enrichCodexHookMetadata(hook("PermissionRequest", "to_review", { transcript_path: path }), "/tmp/task"),
		).toMatchObject({
			event: "to_review",
			metadata: { finalMessage: null, activityText: "Waiting for approval" },
		});
	});

	it.each([
		{ subagent: { other: "guardian" } },
		{ subagent: "review" },
		{ subagent: { thread_spawn: { parent_thread_id: "root" } } },
	])("ignores internal and child transcript source %j", async (source) => {
		const path = await transcript(source, '{"risk_level":"low"}');
		for (const name of ["PreToolUse", "PostToolUse", "PermissionRequest", "Stop"]) {
			expect(
				await enrichCodexHookMetadata(hook(name, "to_review", { transcript_path: path }), "/tmp/task"),
			).toBeNull();
		}
	});

	it("uses the hook's exact root transcript and rejects a mismatched session", async () => {
		const path = await transcript("cli");
		expect(
			await enrichCodexHookMetadata(hook("Stop", "to_review", { transcript_path: path }), "/different/process/cwd"),
		).toMatchObject({ metadata: { finalMessage: "Root answer" } });
		expect(
			await enrichCodexHookMetadata(
				hook("Stop", "to_review", { transcript_path: path, session_id: "other-session" }),
				"/tmp/task",
			),
		).toBeNull();
		expect(
			await enrichCodexHookMetadata(
				hook("Stop", "to_review", { transcript_path: path, turn_id: "new-turn" }),
				"/tmp/task",
			),
		).toMatchObject({ metadata: { finalMessage: null } });
	});
});
