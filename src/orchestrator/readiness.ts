import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { RuntimeConfig } from "./config.js";

export type ReadinessStatus = "PASS" | "WARN" | "BLOCKED";

export interface ReadinessCheck {
  id: string;
  status: ReadinessStatus;
  message: string;
}

export interface ReadinessReport {
  ready: boolean;
  checks: ReadinessCheck[];
}

function check(id: string, status: ReadinessStatus, message: string): ReadinessCheck {
  return { id, status, message };
}

function endpointCheck(id: string, value: string | undefined, required: boolean): ReadinessCheck {
  if (!value) return required ? check(id, "BLOCKED", "Endpoint is not configured.") : check(id, "PASS", "Endpoint is not required in the selected mode.");
  try {
    const url = new URL(value);
    if (url.username || url.password) return check(id, "BLOCKED", "Endpoint must not embed credentials.");
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      return check(id, "BLOCKED", "Production provider endpoints must use HTTPS.");
    }
    return check(id, "PASS", `Endpoint is a valid ${url.protocol.slice(0, -1).toUpperCase()} URL.`);
  } catch {
    return check(id, "BLOCKED", "Endpoint is not a valid URL.");
  }
}

export async function assessReadiness(config: RuntimeConfig): Promise<ReadinessReport> {
  const checks: ReadinessCheck[] = [];
  checks.push(config.mode === "mock"
    ? check("runtime-mode", "WARN", "Mock mode is credential-free and suitable for local validation, not production execution.")
    : check("runtime-mode", "PASS", "Live mode selected."));

  if (config.mode === "live") {
    checks.push(config.openaiApiKey ? check("openai-credential", "PASS", "OpenAI credential is supplied without exposing its value.") : check("openai-credential", "BLOCKED", "OPENAI_API_KEY is not configured."));
    checks.push(config.openaiModel ? check("openai-model", "PASS", `OpenAI model is explicitly pinned to ${config.openaiModel}.`) : check("openai-model", "BLOCKED", "OPENAI_MODEL must be explicitly configured."));
    checks.push(config.typesafeApiKey ? check("typesafe-credential", "PASS", "TypeSafe credential is supplied without exposing its value.") : check("typesafe-credential", "BLOCKED", "TYPESAFE_API_KEY is not configured."));
    checks.push(endpointCheck("openai-endpoint", config.openaiBaseUrl, true));
    checks.push(endpointCheck("typesafe-endpoint", config.typesafeBaseUrl, true));
    const julesSelected = [config.reviewWorker, config.primaryWorker, config.lowCostWorker].includes("google-jules");
    checks.push(julesSelected
      ? (config.julesApiKey && config.julesSource ? check("jules-configuration", "PASS", "Jules credential and source are configured without exposing secret values.") : check("jules-configuration", "BLOCKED", "Google Jules is selected but JULES_API_KEY or JULES_SOURCE is missing."))
      : check("jules-configuration", "PASS", "Google Jules is not selected by the current routing configuration."));
    checks.push(endpointCheck("jules-endpoint", config.julesBaseUrl, julesSelected));
  }

  const workspace = resolve(config.workspace);
  const dataDir = resolve(config.dataDir);
  const dataInsideWorkspace = dataDir === workspace || dataDir.startsWith(`${workspace}${process.platform === "win32" ? "\\" : "/"}`);
  checks.push(dataInsideWorkspace
    ? check(config.requireIsolation ? "data-isolation" : "data-isolation", config.requireIsolation ? "BLOCKED" : "WARN", "The data directory is inside the workspace; production isolation should place runtime state outside the checkout.")
    : check("data-isolation", "PASS", "Runtime state is outside the workspace."));
  checks.push(config.evidenceRetentionDays > 0 ? check("evidence-retention", "PASS", `Terminal evidence retention is ${config.evidenceRetentionDays} days.`) : check("evidence-retention", "BLOCKED", "Evidence retention must be greater than zero."));
  checks.push(config.lockStaleMs >= 10_000 ? check("execution-lock", "PASS", `Per-run execution lock stale threshold is ${config.lockStaleMs}ms.`) : check("execution-lock", "BLOCKED", "Execution lock stale threshold must be at least 10 seconds."));

  if (config.policyFile) {
    try {
      await access(config.policyFile);
      checks.push(check("policy-profile", "PASS", "Configured organization policy profile is readable."));
    } catch {
      checks.push(check("policy-profile", "BLOCKED", "Configured organization policy profile cannot be read."));
    }
  } else {
    checks.push(check("policy-profile", "WARN", "The built-in restrictive policy profile is active; configure an organization profile before production."));
  }

  return { ready: checks.every((entry) => entry.status !== "BLOCKED"), checks };
}
