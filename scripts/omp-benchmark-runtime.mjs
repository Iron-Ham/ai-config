import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const OPENAI_MODELS = {
  "gpt-5.5": {
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
    },
    limit: {
      context: 1050000,
      input: 922000,
      output: 128000,
    },
  },
  "gpt-5.6-luna": {
    cost: {
      input: 1,
      output: 6,
      cache_read: 0.1,
      cache_write: 1.25,
    },
    limit: {
      context: 1050000,
      input: 922000,
      output: 128000,
    },
  },
  "gpt-5.6-sol": {
    cost: {
      input: 5,
      output: 30,
      cache_read: 0.5,
      cache_write: 6.25,
    },
    limit: {
      context: 1050000,
      input: 922000,
      output: 128000,
    },
  },
  "gpt-5.6-terra": {
    cost: {
      input: 2.5,
      output: 15,
      cache_read: 0.25,
      cache_write: 3.125,
    },
    limit: {
      context: 1050000,
      input: 922000,
      output: 128000,
    },
  },
};

const TRUSTED_PROVIDER_CONFIG = {
  openai: {
    npm: "@ai-sdk/openai",
    options: {
      headerTimeout: false,
      timeout: 600000,
      chunkTimeout: 120000,
    },
    models: OPENAI_MODELS,
  },
  anthropic: {
    npm: "@ai-sdk/anthropic",
  },
  baseten: {
    npm: "@ai-sdk/openai-compatible",
    options: {
      baseURL: "https://inference.baseten.co/v1",
    },
    whitelist: [
      "deepseek-ai/DeepSeek-V4-Pro",
      "zai-org/GLM-5.2",
      "moonshotai/Kimi-K2.7-Code",
      "moonshotai/Kimi-K3",
      "thinkingmachines/inkling",
    ],
  },
  "fireworks-ai": {
    npm: "@ai-sdk/openai-compatible",
    options: {
      baseURL: "https://api.fireworks.ai/inference/v1/",
    },
    whitelist: [
      "accounts/fireworks/models/glm-5p2",
      "accounts/fireworks/routers/glm-5p2-fast",
      "accounts/fireworks/models/kimi-k2p7-code",
      "accounts/fireworks/routers/kimi-k2p7-code-fast",
    ],
  },
};

const EXPECTED_COMPATIBLE_APIS = {
  baseten: {
    npm: "@ai-sdk/openai-compatible",
    url: "https://inference.baseten.co/v1",
  },
  "fireworks-ai": {
    npm: "@ai-sdk/openai-compatible",
    url: "https://api.fireworks.ai/inference/v1/",
  },
};

const MODEL_PRICING = {
  "openai/gpt-5.5": {
    input: 5,
    output: 30,
    cache_read: 0.5,
    long_context_threshold: 272000,
  },
  "openai/gpt-5.6-luna": {
    input: 1,
    output: 6,
    cache_read: 0.1,
    cache_write: 1.25,
    long_context_threshold: 272000,
  },
  "openai/gpt-5.6-sol": {
    input: 5,
    output: 30,
    cache_read: 0.5,
    cache_write: 6.25,
    long_context_threshold: 272000,
  },
  "openai/gpt-5.6-terra": {
    input: 2.5,
    output: 15,
    cache_read: 0.25,
    cache_write: 3.125,
    long_context_threshold: 272000,
  },
  "anthropic/claude-opus-5": {
    input: 5,
    output: 25,
    cache_read: 0.5,
    cache_write: 6.25,
  },
  "baseten/zai-org/GLM-5.2": {
    input: 1.4,
    output: 4.4,
    cache_read: 0.14,
  },
  "fireworks-ai/accounts/fireworks/models/glm-5p2": {
    input: 1.4,
    output: 4.4,
    cache_read: 0.14,
  },
  "fireworks-ai/accounts/fireworks/routers/glm-5p2-fast": {
    input: 2.1,
    output: 6.6,
    cache_read: 0.21,
  },
  "baseten/moonshotai/Kimi-K2.7-Code": {
    input: 0.95,
    output: 4,
    cache_read: 0.16,
  },
  "baseten/moonshotai/Kimi-K3": {
    input: 3,
    output: 15,
    cache_read: 0.3,
  },
  "baseten/thinkingmachines/inkling": {
    input: 1,
    output: 4.05,
    cache_read: 0.17,
  },
  "baseten/deepseek-ai/DeepSeek-V4-Pro": {
    input: 1.74,
    output: 3.48,
    cache_read: 0.145,
  },
  "fireworks-ai/accounts/fireworks/models/kimi-k2p7-code": {
    input: 0.95,
    output: 4,
    cache_read: 0.19,
  },
  "fireworks-ai/accounts/fireworks/routers/kimi-k2p7-code-fast": {
    input: 1.9,
    output: 8,
    cache_read: 0.38,
  },
};

function clonedTrustedProviders() {
  return structuredClone(TRUSTED_PROVIDER_CONFIG);
}

export function benchmarkInstructionManifest(cwd) {
  const instructionPath = path.join(path.resolve(cwd), "AGENTS.md");
  const entry = fs.lstatSync(instructionPath, { throwIfNoEntry: false });
  if (!entry) return [];
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new Error(`Benchmark instruction path must be a regular file: ${instructionPath}`);
  }
  return [{
    path: instructionPath,
    sha256: createHash("sha256")
      .update(fs.readFileSync(instructionPath))
      .digest("hex"),
  }];
}

export function benchmarkConfigOverlay(cwd, benchmarkConfig = {}) {
  const config = structuredClone(benchmarkConfig);
  config.instructions = benchmarkInstructionManifest(cwd).map((instruction) => instruction.path);
  return JSON.stringify(config);
}

function validatedJsonObject(source, label) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} must contain valid JSON`, { cause: error });
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return source;
}

export function loadOmpAuthContent() {
  // OMP credentials are owned by its auth broker/profile. Never read, copy,
  // or mutate them from a benchmark; this marker exists only for provenance.
  return "{}";
}

export function assertParallelModelAuthSafe({ concurrency }) {
  if (concurrency > 1) {
    throw new Error(
      "Parallel benchmark routes are disabled because OMP OAuth refresh safety cannot be independently verified; run with --concurrency 1.",
    );
  }
}

export function isolatedOmpEnvironment({
  baseEnv = process.env,
  configContent,
  configHome,
  dataHome,
  cwd,
}) {
  const env = { ...baseEnv };
  for (const name of [
    "OMP_PROFILE",
    "PI_CODING_AGENT_DIR",
    "OMP_CONFIG",
    "OMP_CONFIG_CONTENT",
    "OMP_MODELS_PATH",
    "OMP_MODELS_URL",
    "ANTHROPIC_BASE_URL",
    "OPENAI_BASE_URL",
    "OPENAI_CUSTOM_HEADERS",
  ]) {
    delete env[name];
  }
  return {
    ...env,
    PWD: cwd,
    INIT_CWD: cwd,
    XDG_CONFIG_HOME: configHome,
    XDG_DATA_HOME: dataHome,
    PI_CODING_AGENT_DIR: dataHome,
    OMP_BENCHMARK_CONFIG: configContent,
  };
}

export function managedOmpEnvironment({
  baseEnv = process.env,
  configContent,
  configHome,
  dataHome,
  cwd,
  launcherCwd = os.tmpdir(),
}) {
  const environment = isolatedOmpEnvironment({
    baseEnv,
    configContent,
    configHome,
    dataHome,
    cwd,
  });
  environment.PWD = launcherCwd;
  environment.INIT_CWD = launcherCwd;
  for (const name of ["XDG_CONFIG_HOME", "XDG_DATA_HOME"]) {
    if (baseEnv[name] === undefined) {
      delete environment[name];
    } else {
      environment[name] = baseEnv[name];
    }
  }
  return environment;
}

export function buildOmpCommand({
  cwd,
  model,
  prompt,
  thinking = "auto",
  tools = "read,glob,grep",
  configPath,
}) {
  const command = [
    "notion", "local", "pi", "-p", "--mode", "json", "--cwd", cwd, "--model", model,
    "--thinking", thinking,
  ];
  if (configPath) command.push("--config", configPath);
  command.push("--no-session", "--tools", Array.isArray(tools) ? tools.join(",") : tools, "--no-pty", prompt);
  return command;
}

export function buildOmpCatalogCommand() {
  return ["notion", "local", "pi", "models", "--json"];
}

export function extractOmpJsonDocument(source) {
  const line = String(source).split("\n").find((candidate) => {
    const trimmed = candidate.trim();
    return trimmed.startsWith("{") && trimmed.endsWith("}");
  });
  if (!line) throw new Error("OMP command did not emit a JSON document");
  return line;
}

export function extractOmpVersion(source) {
  const match = String(source).match(/^omp(?:\/| v)[^\s]+$/mu);
  if (!match) throw new Error("Managed Pi launcher did not report an OMP version");
  return match[0];
}

export function parseOmpEvents(source) {
  const events = [];
  let activeAssistantMessage;
  let lastAssistantFinish;
  for (const line of String(source).split("\n")) {
    if (!line.trim()) continue;
    let values;
    try {
      const parsed = JSON.parse(line);
      values = Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      if (line.trim().startsWith("{")) throw new Error("Malformed OMP JSON event", { cause: error });
      continue;
    }
    for (const event of values) {
      const type = event.type;
      if (type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
        const index = events.push({
          type: "text",
          timestamp: event.timestamp,
          part: { text: event.assistantMessageEvent.delta },
        }) - 1;
        activeAssistantMessage?.actionIndices.push(index);
      } else if (type === "message_update" && event.assistantMessageEvent?.type === "thinking_delta") {
        const index = events.push({
          type: "reasoning",
          timestamp: event.timestamp,
          part: { text: event.assistantMessageEvent.delta },
        }) - 1;
        activeAssistantMessage?.actionIndices.push(index);
      } else if (type === "tool_execution_start") {
        const timestamp = event.timestamp ?? lastAssistantFinish;
        events.push({ type: "tool_use", timestamp, part: { tool: event.toolName, state: { input: event.args ?? event.input ?? {}, time: { start: timestamp } } } });
      } else if (type === "message_start" && event.message?.role === "assistant") {
        const timestamp = event.message.timestamp;
        activeAssistantMessage = { actionIndices: [], timestamp };
        events.push({ type: "step_start", timestamp });
      } else if (type === "message_end" && event.message?.role === "assistant") {
        const message = event.message;
        const firstTokenAt = Number.isFinite(message.ttft)
          ? message.timestamp + message.ttft
          : message.timestamp;
        for (const index of activeAssistantMessage?.actionIndices ?? []) {
          if (events[index].timestamp === undefined) events[index].timestamp = firstTokenAt;
        }
        const duration = Number.isFinite(message.duration) ? message.duration : 0;
        lastAssistantFinish = message.timestamp + duration;
        events.push({
          type: "step_finish",
          timestamp: lastAssistantFinish,
          part: {
            reason: message.stopReason ?? "stop",
            cost: message.usage?.cost?.total,
            tokens: normalizeOmpUsage(message.usage),
          },
        });
        activeAssistantMessage = undefined;
      } else if (type === "turn_start") {
        if (event.timestamp !== undefined) {
          events.push({ type: "step_start", timestamp: event.timestamp });
        }
      } else if (type === "turn_end" || type === "agent_end") {
        if (event.timestamp !== undefined) {
          events.push({ type: "step_finish", timestamp: event.timestamp, part: { reason: "stop", tokens: event.usage } });
        }
      } else {
        events.push(event);
      }
    }
  }
  return events;
}

function normalizeOmpUsage(usage) {
  if (!usage) return undefined;
  const reasoning = Number(usage.reasoning ?? usage.reasoningTokens ?? 0);
  const output = Number(usage.output ?? 0);
  return {
    input: usage.input,
    output,
    reasoning: 0,
    reasoning_in_output: reasoning,
    cache: {
      read: usage.cache?.read ?? usage.cacheRead,
      write: usage.cache?.write ?? usage.cacheWrite,
    },
  };
}

export function parseOmpModelCatalog(source) {
  let parsed;
  try {
    parsed = typeof source === "string" ? JSON.parse(source) : source;
  } catch (error) {
    throw new Error("OMP model catalog must be valid JSON", { cause: error });
  }
  const models = Array.isArray(parsed) ? parsed : parsed?.models;
  if (!Array.isArray(models)) throw new Error("OMP model catalog must contain a models array");
  const result = new Map();
  for (const model of models) {
    const fullModel = model.selector ?? `${model.provider}/${model.id}`;
    if (!fullModel.includes("/")) throw new Error(`Invalid model identifier in OMP catalog: ${fullModel}`);
    if (result.has(fullModel)) throw new Error(`OMP catalog contains duplicate model ${fullModel}`);
    result.set(fullModel, model);
  }
  return result;
}


function milliseconds(value) {
  return Number.isFinite(value) ? Number(value) : undefined;
}

function secondsBetween(start, end) {
  if (start === undefined || end === undefined) return null;
  return Math.max(0, end - start) / 1000;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function distribution(values) {
  const present = values.filter((value) => Number.isFinite(value));
  return {
    count: present.length,
    total: present.length > 0
      ? present.reduce((total, value) => total + value, 0)
      : null,
    p50: percentile(present, 0.5),
    p90: percentile(present, 0.9),
    max: present.length > 0 ? Math.max(...present) : null,
  };
}

function actionStart(event) {
  if (event.type === "text" || event.type === "reasoning") {
    return milliseconds(event.part?.time?.start) ?? milliseconds(event.timestamp);
  }
  if (event.type === "tool_use") {
    return milliseconds(event.part?.state?.time?.start) ?? milliseconds(event.timestamp);
  }
  return undefined;
}

function eventTimingDetails(events, invocationStartedAtMs) {
  const stepStarts = events
    .filter((event) => event.type === "step_start")
    .map((event) => milliseconds(event.timestamp))
    .filter((value) => value !== undefined);
  const firstStepStart = stepStarts.length > 0 ? Math.min(...stepStarts) : undefined;
  const finishTimes = events
    .filter((event) => event.type === "step_finish")
    .map((event) => milliseconds(event.timestamp))
    .filter((value) => value !== undefined);
  const actions = events
    .map((event, index) => ({ event, index, start: actionStart(event) }))
    .filter((entry) => entry.start !== undefined);
  const actionStarts = actions.map((entry) => entry.start);
  const textStarts = actions
    .filter((entry) => entry.event.type === "text")
    .map((entry) => entry.start);

  const decisionLatencies = [];
  for (const [index, event] of events.entries()) {
    if (event.type !== "step_start") continue;
    const stepStart = milliseconds(event.timestamp);
    if (stepStart === undefined) continue;
    const finishIndex = events.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && candidate.type === "step_finish",
    );
    const starts = actions
      .filter(
        (entry) =>
          entry.index > index &&
          (finishIndex === -1 || entry.index < finishIndex),
      )
      .map((entry) => entry.start);
    if (starts.length > 0) {
      decisionLatencies.push(secondsBetween(stepStart, Math.min(...starts)));
    }
  }

  return {
    launcherStartup: secondsBetween(
      milliseconds(invocationStartedAtMs),
      firstStepStart,
    ),
    firstAction: secondsBetween(
      firstStepStart,
      actionStarts.length > 0 ? Math.min(...actionStarts) : undefined,
    ),
    firstText: secondsBetween(
      firstStepStart,
      textStarts.length > 0 ? Math.min(...textStarts) : undefined,
    ),
    modelSession: secondsBetween(
      firstStepStart,
      finishTimes.length > 0 ? Math.max(...finishTimes) : undefined,
    ),
    decisionLatencies,
  };
}

function publicTiming(details) {
  return {
    launcher_startup_seconds: details.launcherStartup,
    time_to_first_observed_action_seconds: details.firstAction,
    time_to_first_text_block_seconds: details.firstText,
    model_session_seconds: details.modelSession,
    per_step_decision_latency_seconds: {
      count: details.decisionLatencies.length,
      p50: percentile(details.decisionLatencies, 0.5),
      p90: percentile(details.decisionLatencies, 0.9),
      max: details.decisionLatencies.length > 0
        ? Math.max(...details.decisionLatencies)
        : null,
    },
  };
}

export function summarizeEventTiming(events, invocationStartedAtMs) {
  return publicTiming(eventTimingDetails(events, invocationStartedAtMs));
}

export function aggregateEventTiming(invocations) {
  const details = invocations.map(({ events, invocationStartedAtMs }) =>
    eventTimingDetails(events, invocationStartedAtMs)
  );
  const decisionLatencies = details.flatMap((item) => item.decisionLatencies);
  const first = details[0];
  const sumPresent = (selector) => {
    const values = details.map(selector).filter((value) => Number.isFinite(value));
    return values.length > 0
      ? values.reduce((total, value) => total + value, 0)
      : null;
  };
  return {
    invocation_count: details.length,
    launcher_startup_seconds: sumPresent((item) => item.launcherStartup),
    time_to_first_observed_action_seconds: first?.firstAction ?? null,
    time_to_first_text_block_seconds: first?.firstText ?? null,
    model_session_seconds: sumPresent((item) => item.modelSession),
    per_step_decision_latency_seconds: {
      count: decisionLatencies.length,
      p50: percentile(decisionLatencies, 0.5),
      p90: percentile(decisionLatencies, 0.9),
      max: decisionLatencies.length > 0 ? Math.max(...decisionLatencies) : null,
    },
    invocation_statistics: {
      launcher_startup_seconds: distribution(
        details.map((item) => item.launcherStartup),
      ),
      time_to_first_observed_action_seconds: distribution(
        details.map((item) => item.firstAction),
      ),
      time_to_first_text_block_seconds: distribution(
        details.map((item) => item.firstText),
      ),
      model_session_seconds: distribution(
        details.map((item) => item.modelSession),
      ),
    },
  };
}

function eventCost(event) {
  const value = Number(event.part?.cost ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function recomputedRequestCost(event, model) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return eventCost(event);
  const tokens = event.part?.tokens ?? {};
  const cacheRead = Number(tokens.cache?.read ?? 0);
  const cacheWrite = Number(tokens.cache?.write ?? 0);
  const input = Number(tokens.input ?? 0);
  const output = Number(tokens.output ?? 0) + Number(tokens.reasoning ?? 0);
  if (cacheWrite > 0 && !Number.isFinite(pricing.cache_write)) {
    return eventCost(event);
  }
  const contextInput = input + cacheRead + cacheWrite;
  const longContext = Number.isFinite(pricing.long_context_threshold) &&
    contextInput > pricing.long_context_threshold;
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;
  return (
    input * pricing.input * inputMultiplier +
    cacheRead * pricing.cache_read * inputMultiplier +
    cacheWrite * (pricing.cache_write ?? 0) * inputMultiplier +
    output * pricing.output * outputMultiplier
  ) / 1_000_000;
}

function routeRecord(fullModel, model) {
  const record = {
    full_model: fullModel,
    provider_id: model.provider ?? fullModel.split("/", 1)[0],
    model_id: model.id ?? fullModel.slice(fullModel.indexOf("/") + 1),
    api: model.api ?? null,
    status: model.status ?? "available",
    cost: model.cost ?? null,
    limits: {
      context: model.contextWindow ?? null,
      output: model.maxTokens ?? null,
    },
    variants: Object.fromEntries(
      (model.thinking ?? []).map((thinking) => [thinking, { reasoningEffort: thinking }]),
    ),
    capabilities: {
      toolcall: Array.isArray(model.input) ? model.input.includes("text") : true,
    },
  };
  return {
    ...record,
    sha256: createHash("sha256").update(JSON.stringify(canonicalValue(record))).digest("hex"),
  };
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

export function resolveBenchmarkModelRoute(catalogSource, { model, variant }) {
  const catalog = parseOmpModelCatalog(catalogSource);
  const entry = catalog.get(model);
  if (!entry) throw new Error(`Exact benchmark model is absent from OMP catalog: ${model}`);
  const providerID = model.split("/", 1)[0];
  if ((entry.provider ?? providerID) !== providerID) {
    throw new Error(`Catalog provider mismatch for ${model}: ${entry.provider ?? "missing"}`);
  }
  if (variant && (
    Array.isArray(entry.thinking)
      ? !entry.thinking.includes(variant)
      : !Object.hasOwn(entry.variants ?? {}, variant)
  )) {
    throw new Error(`Model ${model} does not expose requested thinking level ${variant}`);
  }
  return routeRecord(model, entry);
}
