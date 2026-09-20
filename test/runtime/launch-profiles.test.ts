import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptLaunchProfiles, encryptLaunchProfiles } from "../../src/config/launch-profiles";
import {
	codexLaunchProviderSchema,
	launchProfileSaveSchema,
	type StoredLaunchProfile,
	summarizeLaunchProfile,
} from "../../src/core/launch-profiles";

describe("launch profile encryption", () => {
	const profiles: StoredLaunchProfile[] = [
		{
			id: "openai-work",
			name: "OpenAI work",
			agentId: "codex",
			cliArgs: ["-c", "model_context_window=100000"],
			cliArgsInput: { mode: "command", text: "-c model_context_window=100000\n" },
			codexProvider: { id: "cliproxy", baseUrl: "http://localhost:8317/v1", apiKeyEnv: "OPENAI_API_KEY" },
			variables: [{ name: "OPENAI_API_KEY", value: "secret-value" }],
		},
	];

	it("round trips profiles without putting secrets in the envelope plaintext", () => {
		const key = randomBytes(32);
		const envelope = encryptLaunchProfiles(profiles, key);
		expect(JSON.stringify(envelope)).not.toContain("secret-value");
		expect(() => decryptLaunchProfiles(envelope, randomBytes(32))).toThrow();
	});

	it("decrypts with the original key", () => {
		const key = randomBytes(32);
		const envelope = encryptLaunchProfiles(profiles, key);
		expect(decryptLaunchProfiles(envelope, key)).toEqual(profiles);
	});

	it("returns provider routing but never API key values in settings summaries", () => {
		const summary = summarizeLaunchProfile(profiles[0]);
		expect(summary.codexProvider).toEqual(profiles[0].codexProvider);
		expect(summary.codexProvider).not.toBe(profiles[0].codexProvider);
		expect(summary.variables).toEqual([{ name: "OPENAI_API_KEY", configured: true }]);
		expect(JSON.stringify(summary)).not.toContain("secret-value");
	});

	it("keeps older profiles without provider settings valid", () => {
		const { codexProvider: _provider, cliArgsInput: _input, ...legacy } = profiles[0];
		expect(launchProfileSaveSchema.parse(legacy)).toEqual(legacy);
		const key = randomBytes(32);
		expect(decryptLaunchProfiles(encryptLaunchProfiles([legacy], key), key)).toEqual([legacy]);
	});

	it.each([
		{ id: "openai" },
		{ id: "proxy.nested" },
		{ id: 'proxy"injection' },
		{ baseUrl: "not a URL" },
		{ baseUrl: "file:///tmp/socket" },
		{ baseUrl: "https://user:secret@proxy.example/v1" },
		{ baseUrl: "https://proxy.example/v1?key=secret" },
		{ apiKeyEnv: "KANBAN_TASK_ID" },
	])("rejects invalid provider settings: %j", (invalid) => {
		expect(codexLaunchProviderSchema.safeParse({ ...profiles[0].codexProvider, ...invalid }).success).toBe(false);
	});
});
