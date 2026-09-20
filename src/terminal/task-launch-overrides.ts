import type { RuntimeAgentId } from "../core/api-contract";
import { resolveCliArguments } from "../core/cli-arguments";
import type { StoredLaunchProfile } from "../core/launch-profiles";
import { type TaskOverrides, taskOverridesSchema } from "../core/task-overrides";
import { buildCodexProviderArgs, validateCodexConfigArgs } from "./codex-launch-provider";

/** Keep launch overrides in argv/env; never interpolate them into shell commands. */
export function resolveTaskLaunchOverrides(
	agentId: RuntimeAgentId,
	args: string[],
	overrides?: TaskOverrides,
	profile?: StoredLaunchProfile | null,
) {
	const settings = overrides === undefined ? undefined : taskOverridesSchema.parse(overrides);
	if (agentId === "cline") {
		return { args: [...args], env: undefined, modelId: null };
	}
	const cliModel = settings?.cliModel?.trim();
	const supportsModel = agentId === "codex" || agentId === "claude";
	const nextArgs: string[] = [];
	const providerArgs =
		agentId === "codex" && profile?.codexProvider ? buildCodexProviderArgs(profile.codexProvider) : [];
	const configuredArgs = [
		...args,
		...providerArgs,
		...resolveCliArguments(profile ?? undefined),
		...resolveCliArguments(settings),
	];
	if (agentId === "codex") validateCodexConfigArgs(configuredArgs);
	for (let index = 0; index < configuredArgs.length; index++) {
		const arg = configuredArgs[index];
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
	const profileEnvironment = profile
		? Object.fromEntries(profile.variables.map(({ name, value }) => [name, value]))
		: {};
	const taskEnvironment = settings?.environment?.enabled
		? Object.fromEntries(settings.environment.variables.map(({ name, value }) => [name, value]))
		: {};
	const environment =
		Object.keys(profileEnvironment).length > 0 || Object.keys(taskEnvironment).length > 0
			? { ...profileEnvironment, ...taskEnvironment }
			: undefined;
	if (agentId === "codex" && profile?.codexProvider && !environment?.[profile.codexProvider.apiKeyEnv]?.trim()) {
		throw new Error(
			`Launch profile "${profile.name}" needs ${profile.codexProvider.apiKeyEnv}. Add its API key to the profile's encrypted environment variables or this task's environment variables.`,
		);
	}
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
