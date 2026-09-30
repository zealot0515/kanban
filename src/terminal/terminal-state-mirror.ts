import serializeAddonModule from "@xterm/addon-serialize";
import headlessTerminalModule from "@xterm/headless";

const { SerializeAddon } = serializeAddonModule as typeof import("@xterm/addon-serialize");
const { Terminal } = headlessTerminalModule as typeof import("@xterm/headless");

const TERMINAL_SCROLLBACK = 10_000;
// DEC private modes that pick the mouse report encoding (UTF-8, SGR, urxvt).
const MOUSE_ENCODING_MODES = [1005, 1006, 1015] as const;
type MouseEncodingMode = (typeof MOUSE_ENCODING_MODES)[number];

function isMouseEncodingMode(value: number): value is MouseEncodingMode {
	return (MOUSE_ENCODING_MODES as readonly number[]).includes(value);
}

export interface TerminalRestoreSnapshot {
	snapshot: string;
	cols: number;
	rows: number;
}

interface TerminalStateMirrorOptions {
	onInputResponse?: (data: string) => void;
}

export class TerminalStateMirror {
	private readonly terminal: InstanceType<typeof Terminal>;
	private readonly serializeAddon = new SerializeAddon();
	private operationQueue: Promise<void> = Promise.resolve();
	// SerializeAddon restores mouse tracking (?1000/?1002/?1003) but not the report
	// encoding. Without it xterm falls back to X10 reports, which SGR-only TUIs like
	// Codex and Claude echo into their prompt as stray letters on every mouse move.
	private mouseEncodingMode: MouseEncodingMode | null = null;

	constructor(cols: number, rows: number, options: TerminalStateMirrorOptions = {}) {
		this.terminal = new Terminal({
			allowProposedApi: true,
			cols,
			rows,
			scrollback: TERMINAL_SCROLLBACK,
		});
		this.terminal.loadAddon(this.serializeAddon);
		this.terminal.onData((data) => {
			options.onInputResponse?.(data);
		});
		this.terminal.parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) =>
			this.trackMouseEncodingMode(params, true),
		);
		this.terminal.parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) =>
			this.trackMouseEncodingMode(params, false),
		);
	}

	applyOutput(chunk: Buffer): void {
		const chunkCopy = new Uint8Array(chunk);
		this.enqueueOperation(
			() =>
				new Promise<void>((resolve) => {
					this.terminal.write(chunkCopy, () => {
						resolve();
					});
				}),
		);
	}

	resize(cols: number, rows: number): void {
		if (cols === this.terminal.cols && rows === this.terminal.rows) {
			return;
		}
		this.enqueueOperation(() => {
			this.terminal.resize(cols, rows);
		});
	}

	async getSnapshot(): Promise<TerminalRestoreSnapshot> {
		await this.operationQueue;
		return {
			snapshot: this.serializeAddon.serialize() + this.serializeMouseEncodingMode(),
			cols: this.terminal.cols,
			rows: this.terminal.rows,
		};
	}

	dispose(): void {
		this.terminal.dispose();
	}

	private trackMouseEncodingMode(params: (number | number[])[], enabled: boolean): boolean {
		for (const param of params) {
			const mode = Array.isArray(param) ? param[0] : param;
			if (mode === undefined || !isMouseEncodingMode(mode)) {
				continue;
			}
			if (enabled) {
				this.mouseEncodingMode = mode;
			} else if (this.mouseEncodingMode === mode) {
				this.mouseEncodingMode = null;
			}
		}
		// Let xterm apply the mode as usual.
		return false;
	}

	private serializeMouseEncodingMode(): string {
		if (this.terminal.modes.mouseTrackingMode === "none" || this.mouseEncodingMode === null) {
			return "";
		}
		return `\x1b[?${this.mouseEncodingMode}h`;
	}

	private enqueueOperation(operation: () => void | Promise<void>): void {
		this.operationQueue = this.operationQueue
			.catch(() => undefined)
			.then(async () => {
				await operation();
			});
	}
}
