import { readFileSync } from "node:fs";

export const BUILT_IN_NPM_SCRIPTS = ["lint", "typecheck", "test", "test:unit", "test:integration", "build", "security", "demo"] as const;

export interface PolicyProfile {
  name: string;
  allowedNpmScripts: readonly string[];
  additionalForbiddenPaths: readonly string[];
}

export const defaultPolicyProfile: PolicyProfile = {
  name: "built-in-restrictive",
  allowedNpmScripts: BUILT_IN_NPM_SCRIPTS,
  additionalForbiddenPaths: [],
};

export function loadPolicyProfile(path?: string): PolicyProfile {
  if (!path) return defaultPolicyProfile;
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Policy profile must be a JSON object.");
  const value = raw as Record<string, unknown>;
  const name = typeof value.name === "string" && value.name.trim() ? value.name : "organization-profile";
  const allowedNpmScripts = value.allowedNpmScripts === undefined ? [...BUILT_IN_NPM_SCRIPTS] : value.allowedNpmScripts;
  const additionalForbiddenPaths = value.additionalForbiddenPaths === undefined ? [] : value.additionalForbiddenPaths;
  if (!Array.isArray(allowedNpmScripts) || !allowedNpmScripts.every((entry) => typeof entry === "string")) throw new Error("Policy profile allowedNpmScripts must be an array of strings.");
  if (!Array.isArray(additionalForbiddenPaths) || !additionalForbiddenPaths.every((entry) => typeof entry === "string")) throw new Error("Policy profile additionalForbiddenPaths must be an array of strings.");
  const unsupported = allowedNpmScripts.filter((entry) => !(BUILT_IN_NPM_SCRIPTS as readonly string[]).includes(entry));
  if (unsupported.length > 0) throw new Error(`Policy profile cannot enable scripts outside the built-in allowlist: ${unsupported.join(", ")}`);
  return { name, allowedNpmScripts, additionalForbiddenPaths };
}
