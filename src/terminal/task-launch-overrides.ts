import type { RuntimeAgentId } from "../core/api-contract";
import { type TaskOverrides, taskOverridesSchema } from "../core/task-overrides";

/** Keep launch overrides in argv/env; never interpolate them into shell commands. */
export function resolveTaskLaunchOverrides(agentId: RuntimeAgentId, args: string[], overrides?: TaskOverrides) {
	const settings = overrides === undefined ? undefined : taskOverridesSchema.parse(overrides);
	const cliModel = settings?.cliModel?.trim();
	const supportsModel = agentId === "codex" || agentId === "claude";
	const nextArgs: string[] = [];
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (supportsModel && cliModel) {
			if (arg === "--model" || arg === "-m") {
				index++;
				continue;
			}
			if (arg.startsWith("--model=") || arg.startsWith("-m=")) continue;
		}
		nextArgs.push(arg);
	}
	if (supportsModel && cliModel) nextArgs.unshift("--model", cliModel);
	const environment =
		agentId !== "cline" && settings?.environment?.enabled
			? Object.fromEntries(settings.environment.variables.map(({ name, value }) => [name, value]))
			: undefined;
	let modelId: string | null = null;
	if (supportsModel) {
		for (let index = 0; index < nextArgs.length; index++) {
			const arg = nextArgs[index];
			if (arg === "--model" || arg === "-m") modelId = nextArgs[++index] ?? null;
			else if (arg.startsWith("--model=") || arg.startsWith("-m=")) modelId = arg.slice(arg.indexOf("=") + 1);
		}
		if (!modelId && agentId === "claude")
			modelId = environment?.ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL ?? null;
	}
	return { args: nextArgs, env: environment, modelId };
}
