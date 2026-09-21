import { Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function TaskNoteEditor({ note = "", onSave }: { note?: string; onSave?: (note: string) => void }) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(note);
	const save = () => {
		onSave?.(draft.trim());
		setEditing(false);
	};
	return (
		<div
			className="mt-2 space-y-1"
			onClick={(event) => event.stopPropagation()}
			onMouseDown={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
		>
			{editing ? (
				<>
					<textarea
						aria-label="Task note"
						value={draft}
						maxLength={2000}
						rows={3}
						className="w-full resize-y rounded-md border border-border-focus bg-surface-2 px-2 py-1 text-xs text-text-primary focus:outline-none"
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") setEditing(false);
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) save();
						}}
					/>
					<div className="flex gap-1">
						<Button size="sm" onClick={save}>
							Save note
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
							Cancel
						</Button>
					</div>
				</>
			) : (
				<>
					{note ? (
						<p className="m-0 whitespace-pre-wrap break-words text-xs text-text-secondary">
							<span className="text-text-tertiary">Note: </span>
							{note}
						</p>
					) : null}
					{onSave ? (
						<Button
							variant="ghost"
							size="sm"
							icon={<Pencil size={12} />}
							aria-label="Edit task note"
							onClick={() => {
								setDraft(note);
								setEditing(true);
							}}
						>
							{note ? "Edit note" : "Add note"}
						</Button>
					) : null}
				</>
			)}
		</div>
	);
}
