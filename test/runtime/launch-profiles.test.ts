import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptLaunchProfiles, encryptLaunchProfiles } from "../../src/config/launch-profiles";
import type { StoredLaunchProfile } from "../../src/core/launch-profiles";

describe("launch profile encryption", () => {
	const profiles: StoredLaunchProfile[] = [
		{
			id: "openai-work",
			name: "OpenAI work",
			agentId: "codex",
			cliArgs: ["-c", "model_context_window=100000"],
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
});
