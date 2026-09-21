import { afterEach, describe, expect, it, vi } from "vitest";

import { getTerminalThemeColors } from "@/hooks/use-theme";
import { openTerminalLink } from "@/terminal/terminal-links";
import { createKanbanTerminalOptions } from "@/terminal/terminal-options";

afterEach(() => vi.restoreAllMocks());

describe("terminal links", () => {
	it.each(["https://example.com/docs?q=kanban#usage", "http://localhost:3000/preview"])(
		"passes %s directly to the desktop window-open handler even when no child window is returned",
		(uri) => {
			// Electron denies the child window after forwarding its URL to the browser.
			const open = vi.spyOn(window, "open").mockReturnValue(null);
			const event = new MouseEvent("click", { cancelable: true });
			openTerminalLink(event, uri);
			expect(open).toHaveBeenCalledExactlyOnceWith(uri, "_blank", "noopener,noreferrer");
			expect(event.defaultPrevented).toBe(true);
		},
	);

	it("opens OSC 8 hyperlinks through the same browser handoff", () => {
		const open = vi.spyOn(window, "open").mockReturnValue(null);
		const options = createKanbanTerminalOptions({
			cursorColor: "#abcdef",
			isMacPlatform: true,
			terminalBackgroundColor: "#101112",
			themeColors: getTerminalThemeColors("default"),
		});
		options.linkHandler?.activate(new MouseEvent("click"), "https://example.com/osc8", {
			start: { x: 1, y: 1 },
			end: { x: 5, y: 1 },
		});
		expect(open).toHaveBeenCalledExactlyOnceWith("https://example.com/osc8", "_blank", "noopener,noreferrer");
		expect(options.linkHandler?.allowNonHttpProtocols).not.toBe(true);
	});

	it.each(["about:blank", "javascript:alert(1)", "file:///tmp/example.html", "data:text/html,test", "invalid URL"])(
		"does not open unsupported or invalid URL %s",
		(uri) => {
			const open = vi.spyOn(window, "open").mockReturnValue(null);
			openTerminalLink(new MouseEvent("click"), uri);
			expect(open).not.toHaveBeenCalled();
		},
	);
});
