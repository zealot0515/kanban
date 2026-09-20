import { type CliArgumentsInput, formatCliArguments, parseCliArguments } from "@runtime-cli-arguments";
import { useId } from "react";
import { NativeSelect } from "@/components/ui/native-select";

export function CliArgumentsEditor({
	input,
	args = [],
	onChange,
	label = "CLI arguments",
}: {
	input?: CliArgumentsInput;
	args?: string[];
	onChange: (input: CliArgumentsInput) => void;
	label?: string;
}) {
	const id = useId();
	const value: CliArgumentsInput = input ?? { mode: args.length ? "lines" : "command", text: args.join("\n") };
	let parsed: string[] | null = null;
	let error: string | null = null;
	try {
		parsed = parseCliArguments(value);
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "Invalid CLI arguments.";
	}
	return (
		<div className="space-y-1">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<label htmlFor={id} className="text-xs text-text-secondary">
					{label}
				</label>
				<NativeSelect
					size="sm"
					aria-label={`${label} format`}
					value={value.mode}
					onChange={(event) => {
						const mode = event.target.value === "lines" ? "lines" : "command";
						if (mode === "lines" && parsed?.includes("")) return;
						onChange({ mode, text: parsed ? formatCliArguments(parsed, mode) : value.text });
					}}
				>
					<option value="command">Command line</option>
					<option value="lines" disabled={parsed?.includes("")}>
						One argument per line
					</option>
				</NativeSelect>
			</div>
			<textarea
				id={id}
				value={value.text}
				rows={3}
				spellCheck={false}
				onChange={(event) => onChange({ ...value, text: event.target.value })}
				placeholder={
					value.mode === "command"
						? `-c 'model_provider="cliproxy"' -c 'model_context_window=272000'`
						: '-c\nmodel_provider="cliproxy"'
				}
				aria-invalid={Boolean(error)}
				aria-describedby={`${id}-help`}
				className="w-full resize-y rounded-md border border-border-bright bg-surface-2 px-2 py-1 font-mono text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none"
			/>
			<p id={`${id}-help`} className="m-0 text-xs text-text-tertiary">
				{value.mode === "command"
					? "Paste arguments as in a terminal, without the codex/claude command. Quotes group values; variables are kept literal and no shell commands run."
					: "Each line is one argument. Put each -c on its own line, followed by its value. To paste a whole command's arguments, select Command line first."}
			</p>
			{error ? (
				<p role="alert" className="m-0 text-xs text-status-red">
					{error}
				</p>
			) : (
				<p className="m-0 text-xs text-text-tertiary">{parsed?.length ?? 0} arguments</p>
			)}
		</div>
	);
}
