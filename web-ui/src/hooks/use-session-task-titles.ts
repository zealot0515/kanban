import { deriveTaskTitleFromPrompt } from "@runtime-task-title";
import { type Dispatch, type SetStateAction, useEffect } from "react";
import type { RuntimeTaskSessionSummary } from "@/runtime/types";
import type { BoardData } from "@/types";

export function applySessionTaskTitles(
	board: BoardData,
	sessions: Record<string, RuntimeTaskSessionSummary>,
): BoardData {
	let changed = false;
	const columns = board.columns.map((column) => ({
		...column,
		cards: column.cards.map((card) => {
			const title = sessions[card.id]?.taskTitle?.trim();
			if (!title || title === card.title) return card;
			changed = true;
			// Preserve names entered with the old manual-title editor on the first update.
			const legacyNote =
				card.title !== "New task" && card.title !== deriveTaskTitleFromPrompt(card.prompt) ? card.title : "";
			return {
				...card,
				title,
				taskOverrides: { ...card.taskOverrides, note: card.taskOverrides?.note ?? legacyNote },
			};
		}),
	}));
	return changed ? { ...board, columns } : board;
}

export function useSessionTaskTitles(
	board: BoardData,
	sessions: Record<string, RuntimeTaskSessionSummary>,
	setBoard: Dispatch<SetStateAction<BoardData>>,
) {
	useEffect(() => {
		setBoard((board) => applySessionTaskTitles(board, sessions));
	}, [board, sessions, setBoard]);
}
