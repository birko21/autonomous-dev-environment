import { resolve } from "node:path";

export type RuntimeMode = "mock" | "live";

export interface RuntimeConfig {
  mode: RuntimeMode;
  dataDir: string;
  workspace: string;
  maxRetries: number;
  maxActionSteps: number;
  providerTimeoutMs: number;
  verificationTimeoutMs: number;
  decisionProvider: string;
  primaryWorker: string;
  lowCostWorker: string;
  reviewWorker: string;
  openaiApiKey?: string;
  openaiModel?: string;
  openaiBaseUrl: string;
  julesApiKey?: string;
  julesSource?: string;
  julesStartingBranch: string;
  julesBaseUrl: string;
  typesafeApiKey?: string;
  typesafeBaseUrl?: string;
  typesafeModel: string;
  evidenceRetentionDays: number;
  lockStaleMs: number;
  policyFile?: string;
  requireIsolation: boolean;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): RuntimeConfig {
  const mode = env.ADE_MODE === "live" ? "live" : "mock";
  const defaults = mode === "mock"
    ? { decision: "deterministic-jev", primary: "mock-codex", low: "mock-codex", review: "mock-jules" }
    : { decision: "typesafe-jev", primary: "openai-codex", low: "openai-codex", review: "google-jules" };
  return {
    mode,
    dataDir: resolve(cwd, env.ADE_DATA_DIR || ".ade"),
    workspace: resolve(cwd, env.ADE_WORKSPACE || "."),
    maxRetries: positiveInteger(env.ADE_MAX_RETRIES, 2, "ADE_MAX_RETRIES"),
    maxActionSteps: positiveInteger(env.ADE_MAX_ACTION_STEPS, 8, "ADE_MAX_ACTION_STEPS"),
    providerTimeoutMs: positiveInteger(env.ADE_PROVIDER_TIMEOUT_MS, 120_000, "ADE_PROVIDER_TIMEOUT_MS"),
    verificationTimeoutMs: positiveInteger(env.ADE_VERIFICATION_TIMEOUT_MS, 180_000, "ADE_VERIFICATION_TIMEOUT_MS"),
    decisionProvider: env.ADE_DECISION_PROVIDER || defaults.decision,
    primaryWorker: env.ADE_PRIMARY_WORKER || defaults.primary,
    lowCostWorker: env.ADE_LOW_COST_WORKER || defaults.low,
    reviewWorker: env.ADE_REVIEW_WORKER || defaults.review,
    ...(env.OPENAI_API_KEY ? { openaiApiKey: env.OPENAI_API_KEY } : {}),
    ...(env.OPENAI_MODEL ? { openaiModel: env.OPENAI_MODEL } : {}),
    openaiBaseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    ...(env.JULES_API_KEY ? { julesApiKey: env.JULES_API_KEY } : {}),
    ...(env.JULES_SOURCE ? { julesSource: env.JULES_SOURCE } : {}),
    julesStartingBranch: env.JULES_STARTING_BRANCH || "main",
    julesBaseUrl: env.JULES_BASE_URL || "https://jules.googleapis.com/v1alpha",
    ...(env.TYPESAFE_API_KEY ? { typesafeApiKey: env.TYPESAFE_API_KEY } : {}),
    ...(env.TYPESAFE_BASE_URL ? { typesafeBaseUrl: env.TYPESAFE_BASE_URL } : {}),
    typesafeModel: env.TYPESAFE_MODEL || "jev-latest",
    evidenceRetentionDays: positiveInteger(env.ADE_EVIDENCE_RETENTION_DAYS, 30, "ADE_EVIDENCE_RETENTION_DAYS"),
    lockStaleMs: positiveInteger(env.ADE_LOCK_STALE_MS, 300_000, "ADE_LOCK_STALE_MS"),
    ...(env.ADE_POLICY_FILE ? { policyFile: resolve(cwd, env.ADE_POLICY_FILE) } : {}),
    requireIsolation: env.ADE_REQUIRE_ISOLATION === "true",
  };
}
