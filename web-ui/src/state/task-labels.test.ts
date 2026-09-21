import type { DropResult } from "@hello-pangea/dnd";
import { describe, expect, it } from "vitest";
import { createIdleTaskSession } from "@/hooks/app-utils";
import { applySessionTaskTitles } from "@/hooks/use-session-task-titles";
import { applyDragResult, normalizeBoardData } from "@/state/board-state";
import { getBoardLabels, matchesTaskLabels, renameBoardLabel, resolveFilteredDrop } from "@/state/task-labels";
import type { BoardCard, BoardData } from "@/types";

function card(id: string, labels: string[] = []): BoardCard {
	return {
		id,
		title: "New task",
		prompt: "",
		startInPlanMode: false,
		baseRef: "main",
		createdAt: 1,
		updatedAt: 1,
		taskOverrides: { labels, cliModel: "model" },
	};
}
function board(): BoardData {
	return {
		labelCatalog: ["unused"],
		dependencies: [],
		columns: [
			{
				id: "backlog",
				title: "Backlog",
				cards: [card("hidden"), card("a", ["backend"]), card("hidden2"), card("b", ["backend", "bug"])],
			},
			{ id: "in_progress", title: "In progress", cards: [] },
		],
	};
}

describe("task metadata", () => {
	it("updates blank task names while preserving personal notes and launch settings through reload", () => {
		const original = board();
		const session = { ...createIdleTaskSession("a"), taskTitle: "Checking login" };
		const updated = applySessionTaskTitles(original, { a: session });
		const task = updated.columns[0]!.cards[1]!;
		expect(task).toMatchObject({
			title: "Checking login",
			prompt: "",
			taskOverrides: { note: "", labels: ["backend"], cliModel: "model" },
		});
		task.taskOverrides = { ...task.taskOverrides, note: "Ask Sam before release" };
		const finished = applySessionTaskTitles(updated, { a: { ...session, taskTitle: "Login fixed" } });
		const restored = normalizeBoardData(JSON.parse(JSON.stringify(finished)));
		expect(restored?.columns[0]?.cards[1]).toMatchObject({
			title: "Login fixed",
			taskOverrides: { note: "Ask Sam before release" },
		});
		expect(restored?.labelCatalog).toEqual(["unused"]);
		expect(applySessionTaskTitles(finished, { a: { ...session, taskTitle: "Login fixed" } })).toBe(finished);
	});

	it("preserves a legacy custom title as a note only once", () => {
		const original = board();
		original.columns[0]!.cards[1]!.title = "My old custom name";
		const session = { ...createIdleTaskSession("a"), taskTitle: "Checking login" };
		const updated = applySessionTaskTitles(original, { a: session });
		expect(updated.columns[0]!.cards[1]!.taskOverrides?.note).toBe("My old custom name");
		expect(
			applySessionTaskTitles(updated, { a: { ...session, taskTitle: "Login fixed" } }).columns[0]!.cards[1]!
				.taskOverrides?.note,
		).toBe("My old custom name");
	});

	it("renames and removes labels on all cards without losing other metadata", () => {
		const renamed = renameBoardLabel(board(), "backend", "api");
		expect(getBoardLabels(renamed)).toEqual(["api", "bug", "unused"]);
		expect(renamed.columns[0]!.cards[3]!.taskOverrides).toEqual({ labels: ["api", "bug"], cliModel: "model" });
		const removed = renameBoardLabel(renamed, "api", null);
		expect(getBoardLabels(removed)).toEqual(["bug", "unused"]);
		expect(removed.columns[0]!.cards[1]!.taskOverrides?.labels).toEqual([]);
	});

	it("shows unlabeled cards by default and matches any selected label", () => {
		expect(board().columns[0]!.cards.filter((task) => matchesTaskLabels(task, null))).toHaveLength(4);
		expect(board().columns[0]!.cards.filter((task) => matchesTaskLabels(task, ["bug", "backend"]))).toHaveLength(2);
		expect(matchesTaskLabels(card("empty"), ["backend"])).toBe(false);
		expect(matchesTaskLabels(card("a", ["backend"]), [])).toBe(false);
	});

	it("reorders filtered cards using full-board indices without moving hidden cards", () => {
		const original = board();
		const drop: DropResult = {
			draggableId: "b",
			type: "CARD",
			reason: "DROP",
			mode: "FLUID",
			combine: null,
			source: { droppableId: "backlog", index: 1 },
			destination: { droppableId: "backlog", index: 0 },
		};
		const unmoved = resolveFilteredDrop({ ...drop, destination: { droppableId: "backlog", index: 1 } }, original, [
			"backend",
		]);
		expect(applyDragResult(original, unmoved).board).toBe(original);
		const translated = resolveFilteredDrop(drop, original, ["backend"]);
		expect(translated.source.index).toBe(3);
		expect(translated.destination?.index).toBe(1);
		expect(applyDragResult(original, translated).board.columns[0]!.cards.map((task) => task.id)).toEqual([
			"hidden",
			"b",
			"a",
			"hidden2",
		]);
	});
});
