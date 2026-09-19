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
			args: ["-c", "profile_setting=true", "-c", "task_setting=true", "--model", "default"],
			env: { OPENAI_API_KEY: "task-key" },
			modelId: "default",
		});
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
