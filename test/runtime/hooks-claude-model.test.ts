import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	enrichClaudeModelMetadata,
	resolveClaudeTranscriptModel,
	resolveClaudeTranscriptTitle,
} from "../../src/commands/hook-events/claude-model";

describe("Claude model reporting", () => {
	it("uses main-session assistant text for titles and skips tool calls, reasoning and sidechains", () => {
		const transcript = [
			{ type: "assistant", message: { content: [{ type: "text", text: "Fixing login" }] } },
			{
				type: "assistant",
				message: {
					content: [
						{ type: "tool_use", input: "secret arguments" },
						{ type: "thinking", thinking: "internal" },
					],
				},
			},
			{ type: "assistant", isSidechain: true, message: { content: [{ type: "text", text: "Child task" }] } },
		]
			.map((entry) => JSON.stringify(entry))
			.join("\n");
		expect(resolveClaudeTranscriptTitle(`${transcript}\n{`)).toBe("Fixing login");
	});
	it("finds the latest main-session model across model changes and incomplete transcript lines", () => {
		const lines = [
			JSON.stringify({ type: "assistant", message: { model: "first-model" } }),
			JSON.stringify({ type: "assistant", message: { model: "second-model" } }),
			JSON.stringify({ type: "assistant", isSidechain: true, message: { model: "subagent-model" } }),
			JSON.stringify({ type: "assistant", message: { model: "<synthetic>" } }),
			'{"incomplete":',
		];
		expect(resolveClaudeTranscriptModel(lines.join("\n"))).toBe("second-model");
		expect(resolveClaudeTranscriptModel("unrelated output")).toBeNull();
	});

	it("enriches hook metadata from the transcript and tolerates missing transcripts", async () => {
		const dir = await mkdtemp(join(tmpdir(), "kanban-claude-model-"));
		try {
			const path = join(dir, "session.jsonl");
			const args = { payload: { transcript_path: path }, metadata: { source: "claude", activityText: "Working" } };
			expect(await enrichClaudeModelMetadata(args)).toEqual(args);
			await writeFile(path, JSON.stringify({ type: "assistant", message: { model: "reported-model" } }));
			expect(await enrichClaudeModelMetadata(args)).toEqual({
				...args,
				metadata: { ...args.metadata, modelId: "reported-model" },
			});
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
