import { EvidenceRecorder } from "../evidence/recorder.js";
import { DeterministicJevProvider, MockCodexProvider, MockJulesProvider } from "../providers/mock.js";
import { OpenAICodexProvider } from "../providers/openai.js";
import { JulesProvider } from "../providers/jules.js";
import { TypesafeJevProvider } from "../providers/jev.js";
import { ProviderRegistry } from "../providers/registry.js";
import { RoutingPolicy } from "../routing/policy.js";
import { FileRunStore } from "../state/store.js";
import { deleteFileTool, readFileTool, runCommandTool, writeFileTool } from "../tools/builtin.js";
import { ToolExecutor } from "../tools/executor.js";
import { ToolPolicyEngine } from "../tools/policy.js";
import { loadPolicyProfile } from "../tools/profile.js";
import { ToolRegistry } from "../tools/registry.js";
import { VerificationRunner } from "../verification/runner.js";
import { Orchestrator } from "./orchestrator.js";
import type { RuntimeConfig } from "./config.js";

export interface Runtime {
  orchestrator: Orchestrator;
  store: FileRunStore;
  providers: ProviderRegistry;
  tools: ToolRegistry;
}

export function createRuntime(config: RuntimeConfig): Runtime {
  const store = new FileRunStore(config.dataDir, { lockStaleMs: config.lockStaleMs });
  const providers = new ProviderRegistry();

  if (config.mode === "mock") {
    providers.register(new DeterministicJevProvider());
    providers.register(new MockCodexProvider());
    providers.register(new MockJulesProvider());
  } else {
    if (!config.openaiApiKey || !config.openaiModel) throw new Error("Live mode requires OPENAI_API_KEY and explicit OPENAI_MODEL.");
    if (!config.typesafeApiKey || !config.typesafeBaseUrl) throw new Error("Live mode requires TYPESAFE_API_KEY and TYPESAFE_BASE_URL.");
    providers.register(new OpenAICodexProvider({ apiKey: config.openaiApiKey, model: config.openaiModel, baseUrl: config.openaiBaseUrl, timeoutMs: config.providerTimeoutMs }));
    providers.register(new TypesafeJevProvider({ apiKey: config.typesafeApiKey, baseUrl: config.typesafeBaseUrl, model: config.typesafeModel, timeoutMs: config.providerTimeoutMs }));
    if (config.julesApiKey && config.julesSource) {
      providers.register(new JulesProvider({ apiKey: config.julesApiKey, baseUrl: config.julesBaseUrl, source: config.julesSource, startingBranch: config.julesStartingBranch, timeoutMs: config.providerTimeoutMs }));
    }
  }

  for (const id of [config.decisionProvider, config.primaryWorker, config.lowCostWorker, config.reviewWorker]) {
    if (!providers.has(id)) throw new Error(`Configured provider ${id} is unavailable. Check provider credentials/configuration or select an available adapter.`);
  }

  const tools = new ToolRegistry();
  for (const tool of [readFileTool, writeFileTool, deleteFileTool, runCommandTool]) tools.register(tool);
  const policy = new ToolPolicyEngine(tools, loadPolicyProfile(config.policyFile));
  const executor = new ToolExecutor(tools, policy);
  const routing = new RoutingPolicy(providers, {
    decisionProvider: config.decisionProvider,
    primaryWorker: config.primaryWorker,
    lowCostWorker: config.lowCostWorker,
    reviewWorker: config.reviewWorker,
  });
  const verifier = new VerificationRunner(config.verificationTimeoutMs);
  const evidence = new EvidenceRecorder(store);
  const orchestrator = new Orchestrator({ store, providers, routing, executor, verifier, evidence, maxRetries: config.maxRetries, maxActionSteps: config.maxActionSteps });
  return { orchestrator, store, providers, tools };
}
