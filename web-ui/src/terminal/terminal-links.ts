/** Open the final URL immediately so Electron can hand it to the system browser. */
export function openTerminalLink(event: MouseEvent, uri: string): void {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return;

	event.preventDefault();
	// xterm's default opens about:blank first, which the desktop shell rejects.
	// A null result is expected with noopener and Electron's deny + openExternal.
	window.open(url.href, "_blank", "noopener,noreferrer");
}
