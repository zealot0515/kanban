import { z } from "zod";

// Keep this module dependency-free from api-contract: api-contract imports
// these schemas for the browser/runtime boundary, so importing it back here
// would create an initialization cycle.
const launchProfileAgentIdSchema = z.enum(["claude", "codex", "gemini", "opencode", "droid", "kiro", "cline"]);

const safeIdentifier = z
	.string()
	.trim()
	.min(1)
	.max(80)
	.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dots, underscores, or hyphens.");

export const launchProfileVariableNameSchema = z
	.string()
	.regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Use a valid environment variable name")
	.refine((name) => !/^KANBAN_/i.test(name), "KANBAN_ variables are reserved");

export const launchProfileVariableSchema = z.object({
	name: launchProfileVariableNameSchema,
	value: z.string().refine((value) => !value.includes("\0"), "Environment values cannot contain NUL"),
});

export const launchProfileSummaryVariableSchema = z.object({
	name: launchProfileVariableNameSchema,
	configured: z.boolean(),
});

export const launchProfileSummarySchema = z.object({
	id: safeIdentifier,
	name: z.string().trim().min(1).max(80),
	agentId: launchProfileAgentIdSchema.nullable(),
	cliArgs: z
		.array(
			z
				.string()
				.max(500)
				.refine((value) => !/[\0\r\n]/.test(value)),
		)
		.max(100),
	variables: z.array(launchProfileSummaryVariableSchema).max(100),
});

export const launchProfileSaveVariableSchema = z.object({
	name: launchProfileVariableNameSchema,
	/** Undefined preserves an already stored secret; null or an empty string clears it. */
	value: z
		.string()
		.nullable()
		.optional()
		.refine(
			(value) => value === undefined || value === null || !value.includes("\0"),
			"Environment values cannot contain NUL",
		),
});

export const launchProfileSaveSchema = z.object({
	id: safeIdentifier.optional(),
	name: z.string().trim().min(1).max(80),
	agentId: launchProfileAgentIdSchema.nullable().optional(),
	cliArgs: z
		.array(
			z
				.string()
				.max(500)
				.refine((value) => !/[\0\r\n]/.test(value)),
		)
		.max(100),
	variables: z.array(launchProfileSaveVariableSchema).max(100),
});

export const storedLaunchProfileSchema = z.object({
	id: safeIdentifier,
	name: z.string().trim().min(1).max(80),
	agentId: launchProfileAgentIdSchema.nullable(),
	cliArgs: z
		.array(
			z
				.string()
				.max(500)
				.refine((value) => !/[\0\r\n]/.test(value)),
		)
		.max(100),
	variables: z.array(launchProfileVariableSchema).max(100),
});

export const launchProfilesFileSchema = z.object({
	profiles: z.array(storedLaunchProfileSchema).max(50),
});

export type LaunchProfileSummary = z.infer<typeof launchProfileSummarySchema>;
export type LaunchProfileSave = z.infer<typeof launchProfileSaveSchema>;
export type StoredLaunchProfile = z.infer<typeof storedLaunchProfileSchema>;

export function summarizeLaunchProfile(profile: StoredLaunchProfile): LaunchProfileSummary {
	return {
		id: profile.id,
		name: profile.name,
		agentId: profile.agentId,
		cliArgs: [...profile.cliArgs],
		variables: profile.variables.map(({ name }) => ({ name, configured: true })),
	};
}
