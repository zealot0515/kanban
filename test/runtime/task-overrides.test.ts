import { describe, expect, it } from "vitest";
import { runtimeBoardCardSchema, runtimeTaskSessionStartRequestSchema } from "../../src/core/api-contract";
import type { StoredLaunchProfile } from "../../src/core/launch-profiles";
import { addTaskToColumn, updateTask } from "../../src/core/task-board-mutations";
import { taskOverridesSchema } from "../../src/core/task-overrides";
import { resolveTaskLaunchOverrides } from "../../src/terminal/task-launch-overrides";

describe("task overrides", () => {
	const settings = {
		labels: ["backend"],
		cliModel: "custom-model",
		environment: { enabled: true, variables: [{ name: "API_TOKEN", value: "spaces $literal `text`=value" }] },
	};

	it("persists a titled empty task through API validation and updates without substituting a prompt", () => {
		const created = addTaskToColumn(
			{ columns: [{ id: "backlog", title: "Backlog", cards: [] }], dependencies: [] },
			"backlog",
			{ title: "New task", prompt: "", agentId: "codex", baseRef: "main", taskOverrides: settings },
			() => "task-1",
		);
		const restored = runtimeBoardCardSchema.parse(JSON.parse(JSON.stringify(created.task)));
		expect(restored).toMatchObject({ title: "New task", prompt: "", taskOverrides: settings });
		const updated = updateTask(created.board, created.task.id, {
			title: "Configure model",
			prompt: "",
			baseRef: "main",
		});
		expect(updated.updated).toBe(true);
		expect(updated.task).toMatchObject({ title: "Configure model", prompt: "", taskOverrides: settings });
	});

	it("persists overrides across API validation and unrelated task edits without sharing mutable state", () => {
		const created = addTaskToColumn(
			{ columns: [{ id: "backlog", title: "Backlog", cards: [] }], dependencies: [] },
			"backlog",
			{ prompt: "Implement", baseRef: "main", taskOverrides: settings },
			() => "task-1",
		);
		const restored = runtimeBoardCardSchema.parse(JSON.parse(JSON.stringify(created.task)));
		expect(restored.taskOverrides).toEqual(settings);
		expect(created.task.taskOverrides?.environment).not.toBe(settings.environment);
		const edited = updateTask(created.board, created.task.id, {
			title: "Renamed",
			prompt: "Implement",
			baseRef: "main",
		});
		expect(edited.task?.taskOverrides).toEqual(settings);
		const start = runtimeTaskSessionStartRequestSchema.parse({
			taskId: created.task.id,
			prompt: "Implement",
			baseRef: "main",
			taskOverrides: restored.taskOverrides,
		});
		expect(resolveTaskLaunchOverrides("codex", ["--model=old", "--profile", "work"], start.taskOverrides)).toEqual({
			args: ["--model", "custom-model", "--profile", "work"],
			env: { API_TOKEN: "spaces $literal `text`=value" },
			modelId: "custom-model",
		});
	});

	it.each(["codex", "claude"] as const)(
		"passes enabled env literally to %s and does not mutate parent env or args",
		(agentId) => {
			const original = process.env.API_TOKEN;
			const args = ["-m", "old", "--verbose"];
			const launch = resolveTaskLaunchOverrides(agentId, args, settings);
			expect(launch.env?.API_TOKEN).toBe(settings.environment.variables[0].value);
			expect(args).toEqual(["-m", "old", "--verbose"]);
			expect(process.env.API_TOKEN).toBe(original);
			expect(
				resolveTaskLaunchOverrides(agentId, [], {
					...settings,
					environment: { ...settings.environment, enabled: false },
				}).env,
			).toBeUndefined();
			expect(resolveTaskLaunchOverrides(agentId, []).env).toBeUndefined();
		},
	);

	it("combines saved profile args and secrets before task-level overrides", () => {
		const profile: StoredLaunchProfile = {
			id: "profile-1",
			name: "OpenAI work",
			agentId: "codex",
			cliArgs: ["-c", "profile_setting=true"],
			variables: [{ name: "OPENAI_API_KEY", value: "profile-key" }],
		};
		expect(
			resolveTaskLaunchOverrides(
				"codex",
				["--model", "default"],
				{
					cliArgs: ["-c", "task_setting=true"],
					environment: { enabled: true, variables: [{ name: "OPENAI_API_KEY", value: "task-key" }] },
				},
				profile,
			),
		).toEqual({
			args: ["--model", "default", "-c", "profile_setting=true", "-c", "task_setting=true"],
			env: { OPENAI_API_KEY: "task-key" },
			modelId: "default",
		});
	});

	it("overrides the local Codex provider with CLIProxy and passes its key only through env", () => {
		const profile: StoredLaunchProfile = {
			id: "proxy",
			name: "Work proxy",
			agentId: "codex",
			codexProvider: { id: "cliproxy", baseUrl: "http://127.0.0.1:8317/v1", apiKeyEnv: "OPENAI_API_KEY" },
			cliArgs: ["-c", "model_context_window=100000"],
			variables: [{ name: "OPENAI_API_KEY", value: "encrypted-profile-key" }],
		};
		const result = resolveTaskLaunchOverrides("codex", ["-c", 'model_provider="openai"'], undefined, profile);
		expect(result.args).toEqual([
			"-c",
			'model_provider="openai"',
			"-c",
			'model_provider="cliproxy"',
			"-c",
			'model_providers.cliproxy.name="cliproxy"',
			"-c",
			'model_providers.cliproxy.base_url="http://127.0.0.1:8317/v1"',
			"-c",
			'model_providers.cliproxy.wire_api="responses"',
			"-c",
			'model_providers.cliproxy.env_key="OPENAI_API_KEY"',
			"-c",
			"model_providers.cliproxy.requires_openai_auth=false",
			"-c",
			"model_context_window=100000",
		]);
		expect(result.env).toEqual({ OPENAI_API_KEY: "encrypted-profile-key" });
		expect(result.args.join(" ")).not.toContain("encrypted-profile-key");
		expect(
			resolveTaskLaunchOverrides(
				"codex",
				[],
				{
					cliArgs: ["-c", 'model_provider="task-proxy"'],
					environment: { enabled: true, variables: [{ name: "OPENAI_API_KEY", value: "task-key" }] },
				},
				profile,
			),
		).toMatchObject({
			env: { OPENAI_API_KEY: "task-key" },
			args: expect.arrayContaining(['model_provider="task-proxy"']),
		});
		expect(resolveTaskLaunchOverrides("claude", [], undefined, { ...profile, agentId: null }).args).toEqual(
			profile.cliArgs,
		);
		expect(() => resolveTaskLaunchOverrides("codex", [], undefined, { ...profile, variables: [] })).toThrow(
			"needs OPENAI_API_KEY",
		);
	});

	it("does not apply CLI settings to the native Cline SDK", () => {
		expect(resolveTaskLaunchOverrides("cline", [], settings)).toEqual({ args: [], env: undefined, modelId: null });
	});

	it.each([
		{ variables: [{ name: "BAD=NAME", value: "x" }] },
		{ variables: [{ name: "KANBAN_TASK_ID", value: "other-task" }] },
		{ variables: [{ name: "TOKEN", value: "x\0y" }] },
		{
			variables: [
				{ name: "TOKEN", value: "one" },
				{ name: "TOKEN", value: "two" },
			],
		},
	])("rejects invalid or ambiguous environment variables", ({ variables }) => {
		expect(taskOverridesSchema.safeParse({ environment: { enabled: true, variables } }).success).toBe(false);
	});
});
