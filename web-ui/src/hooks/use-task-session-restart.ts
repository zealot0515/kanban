import { useCallback, useState } from "react";

import { notifyError } from "@/components/app-toaster";
import type { UseTaskSessionsResult } from "@/hooks/use-task-sessions";
import { findCardSelection } from "@/state/board-state";
import type { BoardData } from "@/types";

interface UseTaskSessionRestartInput {
	board: BoardData;
	restartTaskSession: UseTaskSessionsResult["restartTaskSession"];
}

export interface UseTaskSessionRestartResult {
	restartTaskSessionLoadingById: Record<string, boolean>;
	handleRestartTaskSession: (taskId: string) => void;
}

/**
 * Restarts a task's CLI agent and resumes its last conversation, so the CLI
 * reloads MCP servers and config without losing context.
 */
export function useTaskSessionRestart({
	board,
	restartTaskSession,
}: UseTaskSessionRestartInput): UseTaskSessionRestartResult {
	const [restartTaskSessionLoadingById, setRestartTaskSessionLoadingById] = useState<Record<string, boolean>>({});

	const handleRestartTaskSession = useCallback(
		(taskId: string) => {
			const selection = findCardSelection(board, taskId);
			if (!selection || restartTaskSessionLoadingById[taskId]) {
				return;
			}
			setRestartTaskSessionLoadingById((current) => ({ ...current, [taskId]: true }));
			void restartTaskSession(selection.card)
				.then((result) => {
					if (!result.ok) {
						notifyError(result.message ?? "Could not restart the task session.");
					}
				})
				.finally(() => {
					setRestartTaskSessionLoadingById((current) => {
						const { [taskId]: _removed, ...rest } = current;
						return rest;
					});
				});
		},
		[board, restartTaskSession, restartTaskSessionLoadingById],
	);

	return { restartTaskSessionLoadingById, handleRestartTaskSession };
}
