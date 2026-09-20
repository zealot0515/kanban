import { z } from "zod";
import { cliArgumentsInputSchema, cliArgumentsSchema } from "./cli-arguments";

export const taskOverridesSchema = z.object({
	labels: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
	cliModel: z
		.string()
		.trim()
		.max(200)
		.refine((value) => !/[\r\n\0]/.test(value), "Invalid model ID")
		.optional(),
	launchProfileId: z
		.string()
		.trim()
		.max(80)
		.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Invalid launch profile ID")
		.optional(),
	cliArgs: cliArgumentsSchema.optional(),
	cliArgsInput: cliArgumentsInputSchema.optional(),
	environment: z
		.object({
			enabled: z.boolean(),
			variables: z
				.array(
					z.object({
						name: z
							.string()
							.regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Use a valid environment variable name")
							.refine((name) => !/^KANBAN_/i.test(name), "KANBAN_ variables are reserved"),
						value: z.string().refine((value) => !value.includes("\0"), "Environment values cannot contain NUL"),
					}),
				)
				.max(100)
				.refine(
					(variables) => new Set(variables.map(({ name }) => name.toUpperCase())).size === variables.length,
					"Environment variable names must be unique",
				),
		})
		.optional(),
});

export type TaskOverrides = z.infer<typeof taskOverridesSchema>;

export function cloneTaskOverrides(value: TaskOverrides | undefined): TaskOverrides | undefined {
	return value === undefined ? undefined : taskOverridesSchema.parse(value);
}

export function getTaskOverridesError(value: TaskOverrides | undefined): string | null {
	if (value === undefined) return null;
	const result = taskOverridesSchema.safeParse(value);
	return result.success ? null : (result.error.issues[0]?.message ?? "Invalid task settings");
}
