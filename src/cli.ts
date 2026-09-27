#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { prepareDemoWorkspace } from "./demo/workspace.js";
import type { Task } from "./domain/types.js";
import { loadConfig } from "./orchestrator/config.js";
import { createRuntime } from "./orchestrator/runtime.js";
import { assessReadiness } from "./orchestrator/readiness.js";
import { nowIso } from "./utils/time.js";

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string[]>;
}

function parseArgs(values: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value) continue;
    if (!value.startsWith("--")) { positional.push(value); continue; }
    const name = value.slice(2);
    const next = values[index + 1];
    const flagValue = next && !next.startsWith("--") ? next : "true";
    if (flagValue !== "true") index += 1;
    flags.set(name, [...(flags.get(name) ?? []), flagValue]);
  }
  return { positional, flags };
}

function flag(args: ParsedArgs, name: string): string | undefined {
  return args.flags.get(name)?.at(-1);
}

function flags(args: ParsedArgs, name: string): string[] {
  return args.flags.get(name) ?? [];
}

function requiredFlag(args: ParsedArgs, name: string): string {
  const value = flag(args, name);
  if (!value || value === "true") throw new Error(`--${name} is required`);
  return value;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): never {
  throw new Error([
    "Usage:",
    "  ade create-task --title <text> --description <text> [--workspace <path>] [--allow <glob>]...",
    "  ade run <task-id> [--workspace <path>]",
    "  ade resume <run-id>",
    "  ade status <run-id>",
    "  ade approve <run-id> [--note <text>]",
    "  ade reject <run-id> [--note <text>]",
    "  ade cancel <run-id>",
    "  ade evidence <run-id>",
    "  ade summary <run-id>",
    "  ade readiness",
    "  ade prune-evidence",
    "  ade demo [--data-dir <path>]",
  ].join("\n"));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command) usage();
  const args = parseArgs(process.argv.slice(3));
  const dataDirFlag = flag(args, "data-dir");
  const env = { ...process.env, ...(dataDirFlag && dataDirFlag !== "true" ? { ADE_DATA_DIR: dataDirFlag } : {}) };
  let config = loadConfig(env);

  if (command === "readiness") {
    const report = await assessReadiness(config);
    print(report);
    if (!report.ready) process.exitCode = 1;
    return;
  }

  if (command === "demo") {
    const demoDir = resolve(dataDirFlag && dataDirFlag !== "true" ? dataDirFlag : ".ade-demo");
    config = loadConfig({ ...env, ADE_MODE: "mock", ADE_DATA_DIR: demoDir, ADE_WORKSPACE: resolve(demoDir, "workspace") });
    const runtime = createRuntime(config);
    const { workspace, task } = await prepareDemoWorkspace(demoDir);
    const result = await runtime.orchestrator.start(task, workspace);
    const evidence = await runtime.store.readEvidence(result.runId);
    print({ demo: "TASK_IN → DISPATCH → ACT → CHECK → FINISH", result, evidenceKinds: [...new Set(evidence.map((entry) => entry.kind))], evidenceCount: evidence.length, dataDir: demoDir });
    if (!result.completed) process.exitCode = 1;
    return;
  }

  const runtime = createRuntime(config);
  if (command === "prune-evidence") {
    print({ retentionDays: config.evidenceRetentionDays, removedRunIds: await runtime.store.pruneTerminalRuns(config.evidenceRetentionDays) });
    return;
  }
  if (command === "create-task") {
    const workspace = resolve(flag(args, "workspace") || config.workspace);
    const allowed = flags(args, "allow").filter((value) => value !== "true");
    const task: Task = {
      id: flag(args, "id") || `task-${randomUUID()}`,
      title: requiredFlag(args, "title"),
      description: requiredFlag(args, "description"),
      repository: { path: workspace, baseBranch: flag(args, "base") || "main" },
      acceptanceCriteria: [{ id: "ac-1", description: flag(args, "acceptance") || "Required repository checks and requested behavior pass.", required: true }],
      scope: {
        allowedPaths: allowed.length > 0 ? allowed : ["src/**", "tests/**", "docs/**", "tickets/**", "scripts/**", "package.json", "package-lock.json", "tsconfig.json", ".env.example"],
        forbiddenPaths: [".env", ".env.*", "config.txt", "**/*.pem", "**/*.key", ".git/**"],
      },
      labels: flags(args, "label").filter((value) => value !== "true"),
      createdAt: nowIso(),
    };
    await runtime.orchestrator.createTask(task);
    print(task);
    return;
  }

  const id = args.positional[0];
  if (!id) usage();
  switch (command) {
    case "run": {
      const task = await runtime.store.loadTask(id);
      print(await runtime.orchestrator.start(task, resolve(flag(args, "workspace") || config.workspace)));
      return;
    }
    case "resume": print(await runtime.orchestrator.resume(id)); return;
    case "status": print(await runtime.orchestrator.status(id)); return;
    case "approve": print(await runtime.orchestrator.approve(id, flag(args, "note"))); return;
    case "reject": print(await runtime.orchestrator.reject(id, flag(args, "note"))); return;
    case "cancel": print(await runtime.orchestrator.cancel(id)); return;
    case "evidence": print(await runtime.store.readEvidence(id)); return;
    case "summary": {
      const run = await runtime.orchestrator.status(id);
      print(run.summary ?? { runId: run.id, state: run.state, verificationResults: run.verificationResults, escalations: run.escalations });
      return;
    }
    default: usage();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
