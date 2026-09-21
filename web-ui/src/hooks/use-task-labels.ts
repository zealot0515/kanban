import {
	createContext,
	type Dispatch,
	type SetStateAction,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { getBoardLabels, renameBoardLabel } from "@/state/task-labels";
import type { BoardData } from "@/types";

interface TaskLabelsContextValue {
	labels: string[];
	selectedLabels: string[] | null;
	selectLabels: (labels: string[] | null) => void;
	registerLabel: (label: string) => void;
	renameLabel: (label: string, replacement: string) => void;
	deleteLabel: (label: string) => void;
}

export const TaskLabelsContext = createContext<TaskLabelsContextValue>({
	labels: [],
	selectedLabels: null,
	selectLabels: () => {},
	registerLabel: () => {},
	renameLabel: () => {},
	deleteLabel: () => {},
});
export const useTaskLabelsContext = () => useContext(TaskLabelsContext);

export function useTaskLabels(
	board: BoardData,
	setBoard: Dispatch<SetStateAction<BoardData>>,
	workspaceId: string | null,
): TaskLabelsContextValue {
	const labels = useMemo(() => getBoardLabels(board), [board]);
	const [selection, setSelection] = useState<{ workspaceId: string | null; labels: string[] | null }>({
		workspaceId,
		labels: null,
	});
	const selectedLabels = selection.workspaceId === workspaceId ? selection.labels : null;
	const selectLabels = useCallback(
		(next: string[] | null) => setSelection({ workspaceId, labels: next }),
		[workspaceId],
	);
	// Import older per-card labels once and retain them when the last card is removed.
	useEffect(() => {
		if (!workspaceId || labels.every((label) => board.labelCatalog?.includes(label))) return;
		setBoard((current) => ({ ...current, labelCatalog: getBoardLabels(current) }));
	}, [board.labelCatalog, labels, setBoard, workspaceId]);
	const registerLabel = useCallback(
		(rawLabel: string) => {
			const label = rawLabel.trim();
			if (!workspaceId || !label || label.length > 40) return;
			setBoard((current) => {
				const catalog = getBoardLabels(current);
				return current.labelCatalog?.includes(label)
					? current
					: { ...current, labelCatalog: [...new Set([...catalog, label])] };
			});
		},
		[setBoard, workspaceId],
	);
	const renameLabel = useCallback(
		(label: string, rawReplacement: string) => {
			const replacement = rawReplacement.trim();
			if (!replacement || replacement.length > 40 || label === replacement) return;
			setBoard((current) => renameBoardLabel(current, label, replacement));
			setSelection((current) => ({
				...current,
				labels: current.labels?.map((item) => (item === label ? replacement : item)) ?? null,
			}));
		},
		[setBoard],
	);
	const deleteLabel = useCallback(
		(label: string) => {
			setBoard((current) => renameBoardLabel(current, label, null));
			setSelection((current) => {
				const next = current.labels?.filter((item) => item !== label);
				return { ...current, labels: next?.length ? next : null };
			});
		},
		[setBoard],
	);
	return useMemo(
		() => ({ labels, selectedLabels, selectLabels, registerLabel, renameLabel, deleteLabel }),
		[labels, selectedLabels, selectLabels, registerLabel, renameLabel, deleteLabel],
	);
}
