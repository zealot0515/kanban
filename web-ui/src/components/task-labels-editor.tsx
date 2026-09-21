import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTaskLabelsContext } from "@/hooks/use-task-labels";

export function TaskLabelsEditor({
	labels = [],
	onChange,
}: {
	labels?: string[];
	onChange: (labels: string[]) => void;
}) {
	const id = useId();
	const { labels: catalog, registerLabel } = useTaskLabelsContext();
	const [draft, setDraft] = useState("");
	const addLabel = (label = draft.trim()) => {
		if (!label || labels.includes(label) || labels.length >= 20) return;
		registerLabel(label);
		onChange([...labels, label]);
		setDraft("");
	};
	return (
		<div className="space-y-2">
			<label htmlFor={id} className="text-xs text-text-secondary">
				Labels
			</label>
			<div className="flex flex-wrap gap-1">
				{labels.map((label) => (
					<span
						key={label}
						className="inline-flex items-center gap-1 rounded-sm bg-surface-3 px-2 py-1 text-xs text-text-primary"
					>
						{label}
						<button
							type="button"
							aria-label={`Remove label ${label}`}
							onClick={() => onChange(labels.filter((item) => item !== label))}
						>
							<X size={12} />
						</button>
					</span>
				))}
			</div>
			<div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
				{catalog
					.filter(
						(label) =>
							!labels.includes(label) && label.toLocaleLowerCase().includes(draft.trim().toLocaleLowerCase()),
					)
					.map((label) => (
						<Button
							key={label}
							size="sm"
							disabled={labels.length >= 20}
							onClick={() => addLabel(label)}
							aria-label={`Select label ${label}`}
						>
							{label}
						</Button>
					))}
			</div>
			<div className="flex gap-1">
				<input
					id={id}
					value={draft}
					maxLength={40}
					placeholder="Add a label"
					className="min-w-0 flex-1 rounded-md border border-border-bright bg-surface-2 px-2 py-1 text-xs text-text-primary focus:outline-border-focus"
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							event.stopPropagation();
							addLabel();
						}
					}}
				/>
				<Button
					size="sm"
					icon={<Plus size={14} />}
					aria-label="Add label"
					onClick={() => addLabel()}
					disabled={!draft.trim() || labels.includes(draft.trim()) || labels.length >= 20}
				/>
			</div>
		</div>
	);
}
