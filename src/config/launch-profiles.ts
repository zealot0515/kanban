import { execFile } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { promisify } from "node:util";
import { resolveCliArguments } from "../core/cli-arguments";

import {
	type LaunchProfileSave,
	type LaunchProfileSummary,
	launchProfileSaveSchema,
	launchProfilesFileSchema,
	launchProfileVariableNameSchema,
	type StoredLaunchProfile,
	storedLaunchProfileSchema,
	summarizeLaunchProfile,
} from "../core/launch-profiles";
import { lockedFileSystem } from "../fs/locked-file-system";

const execFileAsync = promisify(execFile);
const PROFILE_DIR = ".cline/kanban";
const PROFILE_FILE = "launch-profiles.enc.json";
const KEY_FILE = ".launch-profiles.key";
const KEYCHAIN_SERVICE = "com.cline.kanban.launch-profiles";
const ENVELOPE_VERSION = 1;

interface EncryptedEnvelope {
	version: typeof ENVELOPE_VERSION;
	iv: string;
	tag: string;
	ciphertext: string;
}

function profileDirectory(): string {
	return `${homedir()}/${PROFILE_DIR}`;
}

export function getLaunchProfilesPath(): string {
	return `${profileDirectory()}/${PROFILE_FILE}`;
}

function getKeyFilePath(): string {
	return `${profileDirectory()}/${KEY_FILE}`;
}

async function readMacKeychain(): Promise<Buffer | null> {
	if (process.platform !== "darwin") return null;
	try {
		const { stdout } = await execFileAsync("/usr/bin/security", [
			"find-generic-password",
			"-a",
			userInfo().username,
			"-s",
			KEYCHAIN_SERVICE,
			"-w",
		]);
		const value = stdout.trim();
		return value ? Buffer.from(value, "base64") : null;
	} catch {
		return null;
	}
}

async function writeMacKeychain(key: Buffer): Promise<void> {
	if (process.platform !== "darwin") return;
	await execFileAsync("/usr/bin/security", [
		"add-generic-password",
		"-U",
		"-a",
		userInfo().username,
		"-s",
		KEYCHAIN_SERVICE,
		"-w",
		key.toString("base64"),
	]);
}

async function getEncryptionKey(): Promise<Buffer> {
	const keychainKey = await readMacKeychain();
	if (keychainKey?.length === 32) return keychainKey;
	const keyPath = getKeyFilePath();
	try {
		const key = await readFile(keyPath);
		if (key.length === 32) return key;
	} catch {
		// Generate below.
	}
	const key = randomBytes(32);
	await mkdir(profileDirectory(), { recursive: true, mode: 0o700 });
	if (process.platform === "darwin") {
		try {
			await writeMacKeychain(key);
			return key;
		} catch {
			// Keep a locked-down fallback if the user has no keychain session.
		}
	}
	await writeFile(keyPath, key, { mode: 0o600 });
	await chmod(keyPath, 0o600);
	return key;
}

export function encryptLaunchProfiles(
	profiles: StoredLaunchProfile[],
	key: Buffer,
	iv = randomBytes(12),
): EncryptedEnvelope {
	if (key.length !== 32) throw new Error("Launch profile encryption key must be 32 bytes.");
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ profiles })), cipher.final()]);
	return {
		version: ENVELOPE_VERSION,
		iv: iv.toString("base64"),
		tag: cipher.getAuthTag().toString("base64"),
		ciphertext: ciphertext.toString("base64"),
	};
}

export function decryptLaunchProfiles(envelope: EncryptedEnvelope, key: Buffer): StoredLaunchProfile[] {
	if (key.length !== 32 || envelope.version !== ENVELOPE_VERSION) throw new Error("Invalid launch profile envelope.");
	const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
	decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
	const plaintext = Buffer.concat([
		decipher.update(Buffer.from(envelope.ciphertext, "base64")),
		decipher.final(),
	]).toString("utf8");
	const parsed = launchProfilesFileSchema.parse(JSON.parse(plaintext));
	return parsed.profiles;
}

async function readStoredProfiles(): Promise<StoredLaunchProfile[]> {
	let encryptedText: string;
	try {
		encryptedText = await readFile(getLaunchProfilesPath(), "utf8");
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
	const envelope = JSON.parse(encryptedText) as EncryptedEnvelope;
	return decryptLaunchProfiles(envelope, await getEncryptionKey());
}

export async function loadLaunchProfileSummaries(): Promise<LaunchProfileSummary[]> {
	return (await readStoredProfiles()).map(summarizeLaunchProfile);
}

export async function resolveLaunchProfile(profileId: string | undefined): Promise<StoredLaunchProfile | null> {
	if (!profileId) return null;
	const profile = (await readStoredProfiles()).find((candidate) => candidate.id === profileId);
	return profile ?? null;
}

function normalizeProfileVariables(
	variables: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
	const seen = new Set<string>();
	return variables.filter((variable) => {
		launchProfileVariableNameSchema.parse(variable.name);
		const key = variable.name.toUpperCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export async function saveLaunchProfiles(inputs: LaunchProfileSave[]): Promise<LaunchProfileSummary[]> {
	const parsed = inputs.map((input) => launchProfileSaveSchema.parse(input));
	return await lockedFileSystem.withLocks([{ path: getLaunchProfilesPath(), type: "file" }], async () => {
		const existing = await readStoredProfiles();
		const existingById = new Map(existing.map((profile) => [profile.id, profile]));
		const profiles = parsed.map((input) => {
			const id = input.id ?? randomUUID().replaceAll("-", "").slice(0, 12);
			const previous = existingById.get(id);
			const previousValues = new Map(
				previous?.variables.map((variable) => [variable.name.toUpperCase(), variable.value]),
			);
			const variables = normalizeProfileVariables(
				input.variables.flatMap((variable) => {
					const previousValue = previousValues.get(variable.name.toUpperCase());
					if (variable.value === undefined && previousValue !== undefined) {
						return [{ name: variable.name, value: previousValue }];
					}
					if (variable.value === null || variable.value === "") return [];
					return variable.value === undefined ? [] : [{ name: variable.name, value: variable.value }];
				}),
			);
			return storedLaunchProfileSchema.parse({
				id,
				name: input.name,
				agentId: input.agentId ?? null,
				codexProvider: input.codexProvider,
				cliArgs: resolveCliArguments(input),
				cliArgsInput: input.cliArgsInput,
				variables,
			});
		});
		const envelope = encryptLaunchProfiles(profiles, await getEncryptionKey());
		await mkdir(profileDirectory(), { recursive: true, mode: 0o700 });
		await writeFile(getLaunchProfilesPath(), `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
		await chmod(getLaunchProfilesPath(), 0o600);
		return profiles.map(summarizeLaunchProfile);
	});
}

export async function deleteLaunchProfilesFile(): Promise<void> {
	await rm(getLaunchProfilesPath(), { force: true });
}
