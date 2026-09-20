import { type CliArgumentsInput, parseCliArguments } from "@runtime-cli-arguments";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliArgumentsEditor } from "@/components/cli-arguments-editor";

describe("CLI argument editing", () => {
	let container: HTMLDivElement;
	let root: Root;
	const changed = vi.fn<(input: CliArgumentsInput) => void>();
	function Editor({ args }: { args?: string[] }) {
		const [input, setInput] = useState<CliArgumentsInput>();
		return (
			<CliArgumentsEditor
				args={args}
				input={input}
				onChange={(next) => {
					changed(next);
					setInput(next);
				}}
			/>
		);
	}
	beforeEach(() => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		changed.mockClear();
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});
	function setText(text: string) {
		const textarea = container.querySelector("textarea");
		act(() => {
			Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, text);
			textarea?.dispatchEvent(new Event("input", { bubbles: true }));
		});
	}
	function selectMode(mode: string) {
		const select = container.querySelector("select");
		if (!select) throw new Error("Missing format selector");
		act(() => {
			select.value = mode;
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
	}

	it("accepts pasted -c flags as one command, preserving TOML quoting when changing formats", () => {
		act(() => root.render(<Editor />));
		const text = `-c 'model_provider="cliproxy"' -c 'model_providers.cliproxy={ name="CLIProxyAPI", base_url="https://proxy.example/v1" }' -c model_context_window=272000 -c model_auto_compact_token_limit=240000`;
		setText(text);
		expect(container.querySelector("textarea")?.value).toBe(text);
		expect(container.textContent).toContain("8 arguments");
		const commandInput = changed.mock.lastCall?.[0];
		expect(commandInput).toEqual({ mode: "command", text });
		selectMode("lines");
		const linesInput = changed.mock.lastCall?.[0];
		expect(linesInput?.text.split("\n")).toHaveLength(8);
		selectMode("command");
		const restored = changed.mock.lastCall?.[0];
		if (!commandInput || !restored) throw new Error("Missing editor output");
		expect(parseCliArguments(restored)).toEqual(parseCliArguments(commandInput));
	});

	it("keeps legacy arguments in line mode and preserves Enter while typing", () => {
		act(() => root.render(<Editor args={["-c", 'model_provider="cliproxy"']} />));
		expect(container.querySelector("select")?.value).toBe("lines");
		setText('-c\nmodel_provider="cliproxy"\n');
		expect(container.querySelector("textarea")?.value).toBe('-c\nmodel_provider="cliproxy"\n');
		setText('-c\nmodel_provider="cliproxy"\n-c\nmodel_context_window=272000');
		expect(container.textContent).toContain("4 arguments");
	});

	it("retains incomplete quotes for editing and reports the error until corrected", () => {
		act(() => root.render(<Editor />));
		setText("-c 'model_provider=");
		expect(container.querySelector("textarea")?.value).toBe("-c 'model_provider=");
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Close the quoted");
		setText(`-c 'model_provider="cliproxy"'`);
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.textContent).toContain("2 arguments");
	});
});
