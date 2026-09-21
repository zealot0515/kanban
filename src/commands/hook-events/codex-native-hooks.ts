import type { RuntimeHookEvent, RuntimeTaskHookActivity } from "../../core/api-contract";
import {
	isCodexDescendantSession,
	readCodexSessionMeta,
	readCodexTurnContext,
	resolveCodexRolloutFinalMessageForCwd,
} from "./codex-hook-events";
import { asRecord, readStringField } from "./hook-utils";

interface CodexHookInput {
	event: RuntimeHookEvent;
	metadata?: Partial<RuntimeTaskHookActivity>;
	payload?: Record<string, unknown> | null;
}

/** Native hooks are authoritative; tool approval is a pause within a turn, not its final answer. */
export async function enrichCodexHookMetadata<T extends CodexHookInput>(args: T, cwd: string): Promise<T | null> {
	if (args.metadata?.source?.toLowerCase() !== "codex") return args;
	const payload = args.payload ?? {};
	const metadata = { ...args.metadata };
	const hook = (metadata.hookEventName ?? readStringField(payload, "hook_event_name") ?? "").toLowerCase();
	if (readStringField(payload, "agent_id") || hook.startsWith("subagent")) return null;
	const transcriptPath = readStringField(payload, "transcript_path");
	const sessionId = readStringField(payload, "session_id");
	const turnId = readStringField(payload, "turn_id");
	if (transcriptPath) {
		const sessionMeta = await readCodexSessionMeta(transcriptPath);
		if (isCodexDescendantSession(sessionMeta)) return null;
		const session = sessionMeta ? asRecord(sessionMeta.payload) : null;
		if (sessionId && session && readStringField(session, "id") !== sessionId) return null;
	}

	let event = args.event;
	if (hook === "pretooluse" || hook === "posttooluse" || hook === "userpromptsubmit") {
		event = "to_in_progress";
		metadata.finalMessage = null;
	}
	if (hook === "pretooluse" && metadata.toolName?.split(".").at(-1) === "request_user_input") {
		event = "to_review";
		metadata.activityText = "Waiting for your answer";
	}
	if (hook === "permissionrequest") {
		// This hook precedes both guardian and human approval. The hook's
		// permission_mode does not distinguish them; the exact turn context does.
		const context = transcriptPath && turnId ? await readCodexTurnContext(transcriptPath, turnId) : null;
		const automatic = context?.approvals_reviewer === "auto_review";
		event = automatic ? "to_in_progress" : "to_review";
		metadata.finalMessage = null;
		metadata.activityText = automatic ? "Checking approval automatically" : "Waiting for approval";
	}
	if (hook === "interrupt") {
		event = "to_review";
		metadata.finalMessage = null;
		metadata.activityText = "Interrupted; waiting for your input";
	}
	if (
		event === "to_review" &&
		(!hook || hook === "stop" || hook === "task_complete" || hook === "agent-turn-complete")
	) {
		const finalMessage =
			metadata.finalMessage?.trim() ||
			(await resolveCodexRolloutFinalMessageForCwd(readStringField(payload, "cwd") ?? cwd, undefined, {
				sessionId,
				transcriptPath,
				turnId,
			}));
		metadata.finalMessage = finalMessage;
		metadata.activityText = finalMessage ? `Final: ${finalMessage}` : "Waiting for your input";
	}
	return { ...args, event, metadata };
}
