import { codexLaunchProviderSchema, type StoredLaunchProfile } from "../core/launch-profiles";

export function validateCodexConfigArgs(args: string[]): void {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "-c" || arg === "--config") {
			if (!args[i + 1]?.includes("=")) throw new Error("Each Codex -c / --config flag needs a key=value argument.");
			i++;
		} else if (/^\s*-c\s|^\s*--config\s|^\s+[-]|^\s*['"]?model_[A-Za-z0-9_.-]*=/.test(arg)) {
			throw new Error(
				"Codex CLI arguments have an unpaired config setting or a combined command. Select Command line format and paste -c 'key=value' arguments, or put each -c and its value on separate lines.",
			);
		}
	}
}

/** Override provider routing for this process without changing ~/.codex/config.toml or auth.json. */
export function buildCodexProviderArgs(provider: NonNullable<StoredLaunchProfile["codexProvider"]>): string[] {
	const { id, baseUrl, apiKeyEnv } = codexLaunchProviderSchema.parse(provider);
	return [
		"-c",
		`model_provider=${JSON.stringify(id)}`,
		"-c",
		`model_providers.${id}.name=${JSON.stringify(id)}`,
		"-c",
		`model_providers.${id}.base_url=${JSON.stringify(baseUrl)}`,
		"-c",
		`model_providers.${id}.wire_api="responses"`,
		"-c",
		`model_providers.${id}.env_key=${JSON.stringify(apiKeyEnv)}`,
		"-c",
		`model_providers.${id}.requires_openai_auth=false`,
	];
}
