import { open } from "node:fs/promises";
import type { RuntimeTaskHookActivity } from "../../core/api-contract";
import { asRecord, readStringField } from "./hook-utils";

export function resolveClaudeTranscriptModel(text: string): string | null {
	const lines = text.split(/\r?\n/);
	for (let index = lines.length - 1; index >= 0; index--) {
		try {
			const entry = asRecord(JSON.parse(lines[index]));
			if (!entry || entry.type !== "assistant" || entry.isSidechain === true) continue;
			const message = asRecord(entry.message);
			const model = message ? readStringField(message, "model") : null;
			if (model && model !== "<synthetic>") return model;
		} catch {
			/* The first/last line of a transcript tail may be incomplete. */
		}
	}
	return null;
}

export async function enrichClaudeModelMetadata<
	T extends {
		payload?: Record<string, unknown> | null;
		metadata?: Partial<RuntimeTaskHookActivity>;
	},
>(args: T): Promise<T> {
	if (args.metadata?.source !== "claude" || !args.payload) return args;
	const path = readStringField(args.payload, "transcript_path");
	if (!path) return args;
	let file: Awaited<ReturnType<typeof open>> | undefined;
	try {
		file = await open(path, "r");
		const stat = await file.stat();
		if (!stat.isFile()) return args;
		const bytes = Math.min(stat.size, 1024 * 1024);
		const buffer = Buffer.alloc(bytes);
		const { bytesRead } = await file.read(buffer, 0, bytes, stat.size - bytes);
		const modelId = resolveClaudeTranscriptModel(buffer.subarray(0, bytesRead).toString("utf8"));
		return modelId ? { ...args, metadata: { ...args.metadata, modelId } } : args;
	} catch {
		return args;
	} finally {
		await file?.close();
	}
}
