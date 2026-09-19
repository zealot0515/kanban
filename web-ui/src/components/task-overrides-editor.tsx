import * as Switch from "@radix-ui/react-switch";
import { getTaskOverridesError } from "@runtime-task-state";
import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { TaskLabelsEditor } from "@/components/task-labels-editor";
import { Button } from "@/components/ui/button";
import type { LaunchProfileSummary, RuntimeAgentId, TaskOverrides } from "@/runtime/types";

export function TaskOverridesEditor({
	value = {},
	onChange,
	agentId,
	launchProfiles = [],
}: {
	value?: TaskOverrides;
	onChange: (value: TaskOverrides) => void;
	agentId?: RuntimeAgentId | null;
	launchProfiles?: LaunchProfileSummary[];
}) {
	const id = useId();
	const [showValues, setShowValues] = useState(false);
	const environment = value.environment ?? { enabled: false, variables: [] };
	const error = getTaskOverridesError(value);
	const updateVariables = (variables: typeof environment.variables) =>
		onChange({ ...value, environment: { ...environment, variables } });
	return (
		<div className="mt-3 space-y-3 border-t border-border pt-3">
			<TaskLabelsEditor labels={value.labels} onChange={(labels) => onChange({ ...value, labels })} />
			{agentId && agentId !== "cline" && launchProfiles.length > 0 ? (
				<div className="space-y-1">
					<label htmlFor={`${id}-profile`} className="block text-xs text-text-secondary">
						Saved launch profile
					</label>
					<select
						id={`${id}-profile`}
						value={value.launchProfileId ?? ""}
						onChange={(event) =>
							onChange({
								...value,
								launchProfileId: event.target.value || undefined,
							})
						}
						className="w-full rounded-md border border-border-bright bg-surface-2 px-2 py-1 text-xs text-text-primary focus:outline-border-focus"
					>
						<option value="">No saved profile</option>
						{launchProfiles
							.filter((profile) => profile.agentId === null || profile.agentId === agentId)
							.map((profile) => (
								<option key={profile.id} value={profile.id}>
									{profile.name}
								</option>
							))}
					</select>
					<p className="text-xs text-text-tertiary">
						Applies encrypted variables and saved CLI arguments when this task starts.
					</p>
				</div>
			) : null}
			{agentId === "codex" || agentId === "claude" ? (
				<div className="space-y-1">
					<label htmlFor={`${id}-model`} className="block text-xs text-text-secondary">
						CLI model
					</label>
					<input
						id={`${id}-model`}
						value={value.cliModel ?? ""}
						maxLength={200}
						placeholder="Use CLI default"
						className="w-full rounded-md border border-border-bright bg-surface-2 px-2 py-1 text-xs text-text-primary focus:outline-border-focus"
						onChange={(event) => onChange({ ...value, cliModel: event.target.value })}
					/>
					<p className="text-xs text-text-tertiary">Optional model ID passed to {agentId} with --model.</p>
				</div>
			) : null}
			{agentId && agentId !== "cline" ? (
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<Switch.Root
							id={`${id}-env`}
							checked={environment.enabled}
							onCheckedChange={(enabled) => onChange({ ...value, environment: { ...environment, enabled } })}
							className="h-4 w-7 rounded-full bg-surface-4 data-[state=checked]:bg-accent"
						>
							<Switch.Thumb className="block size-3 translate-x-0.5 rounded-full bg-text-primary transition-transform data-[state=checked]:translate-x-3.5" />
						</Switch.Root>
						<label htmlFor={`${id}-env`} className="text-xs text-text-primary">
							Use extra environment variables
						</label>
					</div>
					{environment.enabled || environment.variables.length > 0 ? (
						<>
							<p className="text-xs text-text-tertiary">
								Values are saved with this task, unencrypted. They override inherited variables for this CLI
								only. Enter literal values without shell quotes.
							</p>
							{environment.variables.map((variable, index) => (
								<div key={index} className="flex gap-1">
									<input
										aria-label={`Variable name ${index + 1}`}
										placeholder="NAME"
										value={variable.name}
										autoComplete="off"
										spellCheck={false}
										className="w-2/5 min-w-0 rounded-md border border-border-bright bg-surface-2 px-2 py-1 font-mono text-xs text-text-primary"
										onChange={(event) =>
											updateVariables(
												environment.variables.map((item, i) =>
													i === index ? { ...item, name: event.target.value } : item,
												),
											)
										}
									/>
									<input
										aria-label={`Variable value ${index + 1}`}
										placeholder="Value"
										type={showValues ? "text" : "password"}
										value={variable.value}
										autoComplete="off"
										className="min-w-0 flex-1 rounded-md border border-border-bright bg-surface-2 px-2 py-1 font-mono text-xs text-text-primary"
										onChange={(event) =>
											updateVariables(
												environment.variables.map((item, i) =>
													i === index ? { ...item, value: event.target.value } : item,
												),
											)
										}
									/>
									<Button
										size="sm"
										variant="ghost"
										icon={<X size={14} />}
										aria-label={`Remove variable ${index + 1}`}
										onClick={() => updateVariables(environment.variables.filter((_, i) => i !== index))}
									/>
								</div>
							))}
							<div className="flex gap-2">
								<Button
									size="sm"
									icon={<Plus size={14} />}
									onClick={() => updateVariables([...environment.variables, { name: "", value: "" }])}
									disabled={environment.variables.length >= 100}
								>
									Add variable
								</Button>
								<Button size="sm" variant="ghost" onClick={() => setShowValues(!showValues)}>
									{showValues ? "Hide values" : "Show values"}
								</Button>
							</div>
						</>
					) : null}
				</div>
			) : null}
			{agentId && agentId !== "cline" ? (
				<div className="space-y-1">
					<label htmlFor={`${id}-args`} className="block text-xs text-text-secondary">
						Additional CLI arguments
					</label>
					<textarea
						id={`${id}-args`}
						value={(value.cliArgs ?? []).join("\n")}
						rows={2}
						placeholder={"One argument per line, e.g.\n-c\nmodel_context_window=100000"}
						onChange={(event) => {
							const cliArgs = event.target.value.split("\n").filter((arg) => arg.length > 0);
							onChange({ ...value, cliArgs: cliArgs.length > 0 ? cliArgs : undefined });
						}}
						className="w-full resize-y rounded-md border border-border-bright bg-surface-2 px-2 py-1 font-mono text-xs text-text-primary focus:outline-border-focus"
					/>
					<p className="text-xs text-text-tertiary">
						Each line is one argument; no shell quoting or expansion is performed.
					</p>
				</div>
			) : null}
			{error ? (
				<p role="alert" className="text-xs text-status-red">
					{error}
				</p>
			) : null}
		</div>
	);
}
