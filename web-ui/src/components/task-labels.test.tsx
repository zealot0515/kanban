import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskLabelFilter } from "@/components/task-label-filter";
import { TaskLabelSettings } from "@/components/task-label-settings";
import { TaskLabelsEditor } from "@/components/task-labels-editor";
import { TaskLabelsContext, useTaskLabels } from "@/hooks/use-task-labels";
import type { BoardData } from "@/types";

function Harness() {
	const [board, setBoard] = useState<BoardData>({ columns: [], dependencies: [] });
	const catalog = useTaskLabels(board, setBoard, "project");
	const [first, setFirst] = useState<string[]>([]);
	const [second, setSecond] = useState<string[]>([]);
	return (
		<TaskLabelsContext.Provider value={catalog}>
			<TaskLabelSettings />
			<TaskLabelFilter />
			<section data-testid="first">
				<TaskLabelsEditor labels={first} onChange={setFirst} />
			</section>
			<section data-testid="second">
				<TaskLabelsEditor labels={second} onChange={setSecond} />
			</section>
			<output>{JSON.stringify({ board, selected: catalog.selectedLabels })}</output>
		</TaskLabelsContext.Provider>
	);
}

describe("shared task labels", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(async () => {
		Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		await act(async () => root.render(<Harness />));
	});
	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
	});
	async function click(scope: ParentNode, label: string) {
		const button = Array.from(scope.querySelectorAll("button")).find(
			(element) => element.getAttribute("aria-label") === label || element.textContent === label,
		);
		if (!button) throw new Error(`Missing button: ${label}`);
		await act(async () => button.click());
	}
	async function input(element: HTMLInputElement, text: string) {
		await act(async () => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, text);
			element.dispatchEvent(new Event("input", { bubbles: true }));
		});
	}
	it("reuses labels from another card, manages them in settings, and filters by selection", async () => {
		const first = container.querySelector('[data-testid="first"]') as HTMLElement;
		const second = container.querySelector('[data-testid="second"]') as HTMLElement;
		await input(first.querySelector("input") as HTMLInputElement, "backend");
		await click(first, "Add label");
		await click(second, "Select label backend");
		expect(second.querySelector('[aria-label="Remove label backend"]')).not.toBeNull();
		await click(first, "Remove label backend");
		expect(first.querySelector('[aria-label="Select label backend"]')).not.toBeNull();
		await click(container, "Labels: All");
		await act(async () => {
			(document.querySelector('button[role="checkbox"]') as HTMLButtonElement).click();
		});
		expect(container.querySelector("output")?.textContent).toContain('"selected":["backend"]');
		await click(container, "Show all tasks");
		expect(container.querySelector("output")?.textContent).toContain('"selected":null');
		await click(container, "Rename label backend");
		await input(container.querySelector('input[aria-label="Rename label backend"]') as HTMLInputElement, "api");
		await click(container, "Save");
		expect(container.querySelector("output")?.textContent).toContain('"labelCatalog":["api"]');
		await click(container, "Delete label api");
		expect(container.querySelector("output")?.textContent).toContain('"labelCatalog":[]');
	});
});
