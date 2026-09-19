import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskCreateDialog } from "@/components/task-create-dialog";

vi.mock("@/components/task-prompt-composer", () => ({ TaskPromptComposer: () => null }));

describe("TaskCreateDialog start routing", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		localStorage.clear();
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	function renderDialog(overrides: Partial<ComponentProps<typeof TaskCreateDialog>> = {}) {
		const props = {
			open: true,
			prompt: "",
			images: [],
			branchRef: "main",
			branchOptions: [{ value: "main", label: "main" }],
			workspaceId: "project-1",
			defaultAgentId: "codex",
			startInPlanMode: false,
			autoReviewEnabled: false,
			autoReviewMode: "commit",
			onOpenChange: vi.fn(),
			onPromptChange: vi.fn(),
			onImagesChange: vi.fn(),
			onBranchRefChange: vi.fn(),
			onStartInPlanModeChange: vi.fn(),
			onAutoReviewEnabledChange: vi.fn(),
			onAutoReviewModeChange: vi.fn(),
			onCreate: vi.fn(() => "created"),
			onCreateMultiple: vi.fn(() => []),
			onCreateAndStart: vi.fn(() => "started"),
			onCreateStartAndOpen: vi.fn(() => "opened"),
			onStartEmptyTask: vi.fn(),
			...overrides,
		} satisfies ComponentProps<typeof TaskCreateDialog>;
		act(() => root.render(<TaskCreateDialog {...props} />));
		return props;
	}

	function startButton(): HTMLButtonElement {
		const button = [...document.querySelectorAll("button")].find((element) =>
			element.textContent?.startsWith("Start task"),
		);
		if (!button) throw new Error("Missing Start task button");
		return button;
	}

	it.each(["", "  \n  "])("routes blank input to creation of a task that opens immediately", (prompt) => {
		const props = renderDialog({ prompt });
		expect(startButton().disabled).toBe(false);
		act(() => startButton().click());
		expect(props.onStartEmptyTask).toHaveBeenCalledOnce();
		expect(props.onCreateAndStart).not.toHaveBeenCalled();
		expect(props.onCreate).not.toHaveBeenCalled();
	});

	it("keeps the normal Start action for a supplied prompt", () => {
		const props = renderDialog({ prompt: "HI" });
		act(() => startButton().click());
		expect(props.onCreateAndStart).toHaveBeenCalledExactlyOnceWith({ keepDialogOpen: false });
		expect(props.onStartEmptyTask).not.toHaveBeenCalled();
	});

	it("requires a branch for the blank task's worktree", () => {
		const props = renderDialog({ branchRef: "" });
		expect(startButton().disabled).toBe(true);
		act(() => startButton().click());
		expect(props.onStartEmptyTask).not.toHaveBeenCalled();
	});
});
