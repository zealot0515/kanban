import * as Popover from "@radix-ui/react-popover";
import { Check, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskLabelsContext } from "@/hooks/use-task-labels";

export function TaskLabelFilter() {
	const { labels, selectedLabels, selectLabels } = useTaskLabelsContext();
	return (
		<div className="flex items-center gap-2 border-b border-border px-3 py-2">
			<Popover.Root>
				<Popover.Trigger asChild>
					<Button size="sm" icon={<Tags size={14} />}>
						Labels:{" "}
						{selectedLabels === null
							? "All"
							: selectedLabels.length === 0
								? "None"
								: selectedLabels.length === 1
									? selectedLabels[0]
									: `${selectedLabels.length} selected`}
					</Button>
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content
						align="start"
						sideOffset={4}
						className="z-50 w-64 rounded-lg border border-border-bright bg-surface-1 p-2 shadow-lg"
					>
						<Button size="sm" variant="ghost" fill onClick={() => selectLabels(null)}>
							Select all labels
						</Button>
						<div className="max-h-64 overflow-y-auto">
							{labels.map((label) => {
								const checked = selectedLabels === null || selectedLabels.includes(label);
								return (
									<button
										key={label}
										type="button"
										role="checkbox"
										aria-checked={checked}
										className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text-primary hover:bg-surface-3"
										onClick={() =>
											selectLabels(
												selectedLabels === null
													? [label]
													: checked
														? selectedLabels.filter((item) => item !== label)
														: [...selectedLabels, label],
											)
										}
									>
										<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border-bright">
											{checked ? <Check size={12} /> : null}
										</span>
										<span className="break-all">{label}</span>
									</button>
								);
							})}
						</div>
						<p className="px-2 text-xs text-text-tertiary">
							{labels.length
								? "Choose a label to filter. Multiple labels match any selected label."
								: "Create labels on a card or in Settings."}
						</p>
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
			{selectedLabels !== null ? (
				<Button size="sm" variant="ghost" onClick={() => selectLabels(null)}>
					Show all tasks
				</Button>
			) : null}
		</div>
	);
}
