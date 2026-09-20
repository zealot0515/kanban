import { useId } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import type { LaunchProfileSummary } from "@/runtime/types";

type CodexLaunchProvider = NonNullable<LaunchProfileSummary["codexProvider"]>;

export function CodexLaunchProviderEditor({
	value,
	onChange,
}: {
	value?: CodexLaunchProvider;
	onChange: (value: CodexLaunchProvider | undefined) => void;
}) {
	const id = useId();
	const inputClassName =
		"w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none";
	return (
		<div className="space-y-2 rounded-md border border-border p-2">
			<label htmlFor={`${id}-mode`} className="block text-xs text-text-secondary">
				Codex provider
			</label>
			<NativeSelect
				id={`${id}-mode`}
				value={value ? "custom" : "default"}
				onChange={(event) =>
					onChange(
						event.target.value === "custom"
							? { id: "cliproxy", baseUrl: "", apiKeyEnv: "OPENAI_API_KEY" }
							: undefined,
					)
				}
			>
				<option value="default">Use local Codex configuration</option>
				<option value="custom">Custom provider / CLIProxy</option>
			</NativeSelect>
			{value ? (
				<>
					<label htmlFor={`${id}-provider`} className="block text-xs text-text-secondary">
						Provider ID
					</label>
					<input
						id={`${id}-provider`}
						value={value.id}
						placeholder="cliproxy"
						className={inputClassName}
						onChange={(event) => onChange({ ...value, id: event.target.value })}
					/>
					<label htmlFor={`${id}-url`} className="block text-xs text-text-secondary">
						API base URL
					</label>
					<input
						id={`${id}-url`}
						value={value.baseUrl}
						placeholder="http://127.0.0.1:8317/v1"
						className={inputClassName}
						onChange={(event) => onChange({ ...value, baseUrl: event.target.value })}
					/>
					<label htmlFor={`${id}-key`} className="block text-xs text-text-secondary">
						API key variable name
					</label>
					<input
						id={`${id}-key`}
						value={value.apiKeyEnv}
						placeholder="OPENAI_API_KEY"
						className={inputClassName}
						onChange={(event) => onChange({ ...value, apiKeyEnv: event.target.value })}
					/>
					<p className="m-0 text-xs text-text-tertiary">
						Save the key as an encrypted variable below with this exact name. Codex will use this Responses API
						provider instead of your local default and ChatGPT login. Additional CLI arguments can override these
						settings. Changes apply when a task starts a new CLI process.
					</p>
				</>
			) : (
				<p className="m-0 text-xs text-text-tertiary">
					An API key alone does not switch Codex providers. Select a custom provider to use CLIProxy.
				</p>
			)}
		</div>
	);
}
