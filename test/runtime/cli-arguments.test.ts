import { describe, expect, it } from "vitest";
import {
	cliArgumentsInputSchema,
	formatCliArguments,
	parseCliArguments,
	resolveCliArguments,
} from "../../src/core/cli-arguments";
import { launchProfileSaveSchema } from "../../src/core/launch-profiles";
import { getTaskOverridesError, taskOverridesSchema } from "../../src/core/task-overrides";
import { resolveTaskLaunchOverrides } from "../../src/terminal/task-launch-overrides";

const proxyArgs = [
	"-c",
	'model_provider="cliproxy"',
	"-c",
	'model_providers.cliproxy={ name="CLIProxyAPI", base_url="https://proxy.example/v1", env_key="OPENAI_API_KEY", wire_api="responses", requires_openai_auth=false }',
	"-c",
	"model_context_window=272000",
	"-c",
	"model_auto_compact_token_limit=240000",
];
const command = ` -c 'model_provider="cliproxy"' -c 'model_providers.cliproxy={ name="CLIProxyAPI", base_url="https://proxy.example/v1", env_key="OPENAI_API_KEY", wire_api="responses", requires_openai_auth=false }'  -c 'model_context_window=272000'  -c 'model_auto_compact_token_limit=240000'`;

describe("CLI argument input", () => {
	it.each([command, command.replaceAll(" -c", "\n-c"), command.replaceAll(" -c", " \\\n-c")])(
		"parses pasted CLIProxy flags, including TOML quotes and repeated -c flags",
		(text) => {
			expect(parseCliArguments({ mode: "command", text })).toEqual(proxyArgs);
		},
	);

	it("preserves literal variables, empty values, backticks, escaping, and quote concatenation", () => {
		const text = [
			'--key "$API_KEY"',
			`'\${TOKEN}'`,
			String.raw`'$(ignored)' '\path' "C:\work" "say \"hi\"" a\ b pre' mid 'post ''`,
		].join(" ");
		expect(parseCliArguments({ mode: "command", text })).toEqual([
			"--key",
			"$API_KEY",
			`\${TOKEN}`,
			"$(ignored)",
			"\\path",
			"C:\\work",
			'say "hi"',
			"a b",
			"pre mid post",
			"",
		]);
		const args = ["-c", 'some_text="dollar $HOME and `literal`"', "O'Reilly", "", "spaces around value"];
		expect(parseCliArguments({ mode: "command", text: formatCliArguments(args, "command") })).toEqual(args);
	});

	it("keeps legacy argv unchanged and raw line input editable with trailing newlines", () => {
		const input = { mode: "lines", text: `${proxyArgs.join("\r\n")}\r\n` } as const;
		expect(cliArgumentsInputSchema.parse(input).text).toBe(input.text);
		expect(parseCliArguments(input)).toEqual(proxyArgs);
		expect(resolveCliArguments({ cliArgs: proxyArgs })).toEqual(proxyArgs);
		expect(resolveCliArguments({ cliArgs: proxyArgs })).not.toBe(proxyArgs);
	});

	it.each([
		"-c 'unfinished",
		'-c "unfinished',
		"--flag \\",
		"-c test=true | cat",
		"$(echo bad)",
		"`echo bad`",
		"'a\nb'",
		"--flag \0",
		"x".repeat(501),
		Array(101).fill("x").join(" "),
	])("rejects malformed command input before saving a task or profile: %j", (text) => {
		const cliArgsInput = { mode: "command", text } as const;
		expect(cliArgumentsInputSchema.safeParse(cliArgsInput).success).toBe(false);
		expect(getTaskOverridesError({ cliArgsInput })).not.toBeNull();
		expect(
			launchProfileSaveSchema.safeParse({ name: "Work", cliArgs: [], cliArgsInput, variables: [] }).success,
		).toBe(false);
	});

	it("resolves command input from both encrypted profiles and tasks with task precedence", () => {
		const profile = {
			id: "work",
			name: "Work",
			agentId: "codex" as const,
			cliArgs: ["ignored-legacy-value"],
			cliArgsInput: { mode: "command" as const, text: command },
			variables: [{ name: "OPENAI_API_KEY", value: "test-key" }],
		};
		const overrides = taskOverridesSchema.parse({
			cliArgsInput: { mode: "command", text: "-c model_context_window=300000" },
		});
		const restored = taskOverridesSchema.parse(JSON.parse(JSON.stringify(overrides)));
		const launch = resolveTaskLaunchOverrides("codex", [], restored, profile);
		expect(launch.args).toEqual([...proxyArgs, "-c", "model_context_window=300000"]);
		expect(launch.env).toEqual({ OPENAI_API_KEY: "test-key" });
	});

	it.each(
		[
			[command],
			["-c", 'model_provider="cliproxy"', "model_providers.cliproxy='{ name=\"CLIProxyAPI\" }'"],
			["-c"],
			["-c", "--model", "test-model"],
		].map((cliArgs) => ({ cliArgs })),
	)("rejects malformed legacy Codex config arguments before spawning: %j", ({ cliArgs }) => {
		expect(() => resolveTaskLaunchOverrides("codex", [], { cliArgs })).toThrow(/Codex/);
	});
});
