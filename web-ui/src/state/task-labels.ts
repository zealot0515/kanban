import type { DropResult } from "@hello-pangea/dnd";
import type { BoardCard, BoardData } from "@/types";

export function getBoardLabels(board: BoardData): string[] {
	return [
		...new Set([
			...(board.labelCatalog ?? []),
			...board.columns.flatMap((column) => column.cards.flatMap((card) => card.taskOverrides?.labels ?? [])),
		]),
	].sort((a, b) => a.localeCompare(b));
}

export function renameBoardLabel(board: BoardData, label: string, replacement: string | null): BoardData {
	const replace = (labels: string[]) => [
		...new Set(labels.flatMap((item) => (item === label ? (replacement ? [replacement] : []) : [item]))),
	];
	return {
		...board,
		labelCatalog: replace(getBoardLabels(board)),
		columns: board.columns.map((column) => ({
			...column,
			cards: column.cards.map((card) =>
				card.taskOverrides?.labels?.includes(label)
					? { ...card, taskOverrides: { ...card.taskOverrides, labels: replace(card.taskOverrides.labels) } }
					: card,
			),
		})),
	};
}

export function matchesTaskLabels(card: BoardCard, selectedLabels: string[] | null): boolean {
	return (
		selectedLabels === null || (card.taskOverrides?.labels?.some((label) => selectedLabels.includes(label)) ?? false)
	);
}

/** Translate the visible drop position to the full column, preserving hidden cards. */
export function resolveFilteredDrop(result: DropResult, board: BoardData, selectedLabels: string[] | null): DropResult {
	if (!result.destination || selectedLabels === null) return result;
	const source = board.columns.find((column) => column.id === result.source.droppableId);
	const destination = board.columns.find((column) => column.id === result.destination?.droppableId);
	if (!source || !destination) return result;
	const sourceIndex = source.cards.findIndex((card) => card.id === result.draggableId);
	if (
		result.source.droppableId === result.destination.droppableId &&
		result.source.index === result.destination.index
	) {
		return {
			...result,
			source: { ...result.source, index: sourceIndex },
			destination: { ...result.destination, index: sourceIndex },
		};
	}
	const remaining = destination.cards.filter((card) => card.id !== result.draggableId);
	const visible = remaining.filter((card) => matchesTaskLabels(card, selectedLabels));
	const nextCard = visible[result.destination.index];
	const previousCard = visible[result.destination.index - 1];
	const destinationIndex = nextCard
		? remaining.findIndex((card) => card.id === nextCard.id)
		: previousCard
			? remaining.findIndex((card) => card.id === previousCard.id) + 1
			: remaining.length;
	return {
		...result,
		source: { ...result.source, index: sourceIndex },
		destination: { ...result.destination, index: destinationIndex },
	};
}
