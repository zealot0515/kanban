import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTaskLabelsContext } from "@/hooks/use-task-labels";

export function TaskLabelSettings() {
	const { labels, registerLabel, renameLabel, deleteLabel } = useTaskLabelsContext();
	const [draft, setDraft] = useState("");
	const [editing, setEditing] = useState<string | null>(null);
	const [replacement, setReplacement] = useState("");
	const invalid = (value: string) => !value.trim() || labels.includes(value.trim());
	const inputClass =
		"min-w-0 flex-1 rounded-md border border-border-bright bg-surface-2 px-2 py-1 text-sm text-text-primary focus:outline-border-focus";
	const add = () => {
		if (!invalid(draft)) {
			registerLabel(draft);
			setDraft("");
		}
	};
	return (
		<div className="space-y-3">
			<h3 className="text-sm font-semibold text-text-primary">Labels</h3>
			<p className="text-xs text-text-secondary">
				Shared by all tasks in this project. Changes save immediately. Renaming or deleting a label updates every
				card in this project.
			</p>
			<div className="flex gap-2">
				<input
					aria-label="New label"
					maxLength={40}
					value={draft}
					placeholder="New label"
					className={inputClass}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							add();
						}
					}}
				/>
				<Button size="sm" disabled={invalid(draft)} onClick={add}>
					Create label
				</Button>
			</div>
			<div className="max-h-72 space-y-2 overflow-y-auto">
				{labels.map((label) => (
					<div key={label} className="flex items-center gap-2">
						{editing === label ? (
							<>
								<input
									aria-label={`Rename label ${label}`}
									value={replacement}
									maxLength={40}
									className={inputClass}
									onChange={(event) => setReplacement(event.target.value)}
								/>
								<Button
									size="sm"
									disabled={invalid(replacement)}
									onClick={() => {
										renameLabel(label, replacement);
										setEditing(null);
									}}
								>
									Save
								</Button>
								<Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
									Cancel
								</Button>
							</>
						) : (
							<>
								<span className="min-w-0 flex-1 break-all text-sm text-text-primary">{label}</span>
								<Button
									size="sm"
									aria-label={`Rename label ${label}`}
									onClick={() => {
										setEditing(label);
										setReplacement(label);
									}}
								>
									Rename
								</Button>
								<Button
									size="sm"
									variant="danger"
									aria-label={`Delete label ${label}`}
									onClick={() => deleteLabel(label)}
								>
									Delete
								</Button>
							</>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
