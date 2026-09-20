import { z } from "zod";

export const cliArgumentsSchema = z
	.array(
		z
			.string()
			.max(500)
			.refine((value) => !/[\0\r\n]/.test(value), "CLI arguments cannot contain NUL or newlines"),
	)
	.max(100);

export type CliArgumentsInput = { mode: "command" | "lines"; text: string };

// This is intentionally a literal argv tokenizer, not a shell interpreter.
// General shell parsers expand variables and tolerate some incomplete quotes;
// neither behavior is suitable for editable launch settings.
function tokenizeCommandArguments(text: string): string[] {
	const args: string[] = [];
	let word = "";
	let started = false;
	let quote: "'" | '"' | null = null;
	for (let i = 0; i < text.length; i++) {
		const char = text.charAt(i);
		if (quote === "'") {
			if (char === "'") quote = null;
			else word += char;
			continue;
		}
		if (char === "\\") {
			const next = text[i + 1];
			if (next === undefined) throw new Error("Finish the escape after the trailing backslash.");
			if (next === "\n") {
				i++;
				continue;
			}
			if (quote === '"' && !['"', "\\", "$", "`"].includes(next)) {
				word += char;
			} else {
				word += next;
				i++;
			}
			started = true;
			continue;
		}
		if (quote === '"') {
			if (char === '"') quote = null;
			else word += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			started = true;
			continue;
		}
		if (/\s/.test(char)) {
			if (started) args.push(word);
			word = "";
			started = false;
			continue;
		}
		if (/[|&;<>`()]/.test(char))
			throw new Error("Enter arguments only. Quote literal shell operators; shell commands are not supported.");
		word += char;
		started = true;
	}
	if (quote) throw new Error("Close the quoted CLI argument before saving or starting the task.");
	if (started) args.push(word);
	return args;
}

export function parseCliArguments(input: CliArgumentsInput): string[] {
	const text = input.text.replaceAll("\r\n", "\n");
	const args =
		input.mode === "command" ? tokenizeCommandArguments(text) : text.split("\n").filter((line) => line.length > 0);
	const result = cliArgumentsSchema.safeParse(args);
	if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Invalid CLI arguments.");
	return result.data;
}

export const cliArgumentsInputSchema = z
	.object({
		mode: z.enum(["command", "lines"]),
		text: z.string().max(60000),
	})
	.superRefine((input, ctx) => {
		try {
			parseCliArguments(input);
		} catch (error) {
			ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid CLI arguments." });
		}
	});

export function resolveCliArguments(settings?: { cliArgs?: string[]; cliArgsInput?: CliArgumentsInput }): string[] {
	return settings?.cliArgsInput ? parseCliArguments(settings.cliArgsInput) : [...(settings?.cliArgs ?? [])];
}

export function formatCliArguments(args: string[], mode: CliArgumentsInput["mode"]): string {
	return mode === "lines"
		? args.join("\n")
		: args.map((arg) => (/^[A-Za-z0-9_./:@%+=,-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`)).join(" ");
}
