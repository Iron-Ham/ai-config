#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertParallelModelAuthSafe,
  benchmarkConfigOverlay,
  benchmarkInstructionManifest,
  buildOmpCatalogCommand,
  buildOmpCommand,
  extractOmpJsonDocument,
  extractOmpVersion,
  parseOmpEvents,
  isolatedOmpEnvironment,
  managedOmpEnvironment,
  parseOmpModelCatalog,
  recomputedRequestCost,
  resolveBenchmarkModelRoute,
  summarizeEventTiming,
} from "./omp-benchmark-runtime.mjs";
import { assertToolPathsStayInWorkdir, benchmarkRepetitionProvenance } from "./benchmark-omp-model-pairs.mjs";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "omp-benchmark-runtime-"));
try {
  fs.writeFileSync(path.join(workspace, "AGENTS.md"), "# locked\n");
  const config = JSON.parse(benchmarkConfigOverlay(workspace, { permission: { "*": "deny" } }));
  assert.deepEqual(config.permission, { "*": "deny" });
  assert.deepEqual(config.instructions, [path.join(workspace, "AGENTS.md")]);
  assert.equal(benchmarkInstructionManifest(workspace)[0].sha256.length, 64);
  const environment = isolatedOmpEnvironment({
    baseEnv: {
      PATH: process.env.PATH,
      OMP_PROFILE: "attacker",
      PI_CODING_AGENT_DIR: "/attacker/state",
      OMP_CONFIG: "/attacker/config",
      ANTHROPIC_BASE_URL: "https://attacker.invalid",
      OPENAI_BASE_URL: "https://attacker.invalid",
      OPENAI_CUSTOM_HEADERS: "leak",
      FIREWORKS_API_KEY: "env-only-auth",
    },
    configContent: "{}",
    configHome: path.join(workspace, "config"),
    dataHome: path.join(workspace, "state"),
    cwd: workspace,
  });
  for (const name of ["OMP_PROFILE", "OMP_CONFIG", "ANTHROPIC_BASE_URL", "OPENAI_BASE_URL", "OPENAI_CUSTOM_HEADERS"]) assert.equal(environment[name], undefined);
  assert.equal(environment.PI_CODING_AGENT_DIR, path.join(workspace, "state"));
  assert.equal(environment.FIREWORKS_API_KEY, "env-only-auth");
  const managedEnvironment = managedOmpEnvironment({
    baseEnv: {
      PATH: process.env.PATH,
      XDG_CONFIG_HOME: "/managed/config",
      XDG_DATA_HOME: "/managed/data",
    },
    configContent: "{}",
    configHome: path.join(workspace, "config"),
    dataHome: path.join(workspace, "state"),
    cwd: workspace,
    launcherCwd: "/launcher",
  });
  assert.equal(managedEnvironment.XDG_CONFIG_HOME, "/managed/config");
  assert.equal(managedEnvironment.XDG_DATA_HOME, "/managed/data");
  assert.equal(managedEnvironment.PI_CODING_AGENT_DIR, path.join(workspace, "state"));
  assert.equal(managedEnvironment.PWD, "/launcher");
  assert.equal(managedEnvironment.INIT_CWD, "/launcher");
  assert.deepEqual(buildOmpCommand({ cwd: workspace, model: "openai/gpt-5.6-terra", prompt: "inspect", thinking: "high", tools: ["read", "glob"], configPath: path.join(workspace, "benchmark.json") }), [
    "notion", "local", "pi", "-p", "--mode", "json", "--cwd", workspace, "--model", "openai/gpt-5.6-terra",
    "--thinking", "high", "--config", path.join(workspace, "benchmark.json"), "--no-session",
    "--tools", "read,glob", "--no-pty", "inspect",
  ]);
  assert.deepEqual(buildOmpCatalogCommand(), ["notion", "local", "pi", "models", "--json"]);
  assert.equal(extractOmpJsonDocument("Updating OMP\n{\"models\":[]}\n"), "{\"models\":[]}");
  assert.throws(() => extractOmpJsonDocument("Updating OMP\n"), /JSON document/);
  assert.equal(extractOmpVersion("Updating OMP\nomp/17.1.6\n"), "omp/17.1.6");
  assert.equal(extractOmpVersion("omp v17.1.6\n"), "omp v17.1.6");
  assert.throws(() => extractOmpVersion("Updating OMP\n"), /OMP version/);
  assert.doesNotThrow(() => assertParallelModelAuthSafe({ concurrency: 1 }));
  assert.throws(() => assertParallelModelAuthSafe({ concurrency: 2 }), /OAuth refresh safety/);
  const provenance = benchmarkRepetitionProvenance({ round: "round-a", seed: 123, repetition: 2, concurrency: 1, executionOrder: ["a", "b"] });
  assert.equal(provenance.concurrency, 1);
  assert.deepEqual(provenance.execution_order, ["a", "b"]);
  assertToolPathsStayInWorkdir([{ type: "tool_use", part: { tool: "read", state: { input: { filePath: "AGENTS.md" } } } }], workspace);
  assert.throws(() => assertToolPathsStayInWorkdir([{ type: "tool_use", part: { tool: "read", state: { input: { filePath: "../secret" } } } }], workspace), /outside|traversal/);
} finally { fs.rmSync(workspace, { recursive: true, force: true }); }
const catalog = { models: [{ provider: "openai", id: "gpt-5.6-terra", selector: "openai/gpt-5.6-terra", contextWindow: 1_050_000, maxTokens: 128_000, thinking: ["low", "high"], cost: { input: 2.5, output: 15 } }] };
assert.equal(parseOmpModelCatalog(catalog).size, 1);
const route = resolveBenchmarkModelRoute(catalog, { model: "openai/gpt-5.6-terra", variant: "high" });
assert.equal(route.provider_id, "openai");
assert.deepEqual(parseOmpEvents([
  JSON.stringify({ type: "turn_start", timestamp: 100 }),
  JSON.stringify({ type: "message_update", timestamp: 110, assistantMessageEvent: { type: "text_delta", delta: "hello" } }),
  JSON.stringify({ type: "tool_execution_start", timestamp: 120, toolName: "glob", args: { pattern: "*.swift" } }),
  JSON.stringify({ type: "turn_end", timestamp: 130 }),
].join("\n")), [
  { type: "step_start", timestamp: 100 },
  { type: "text", timestamp: 110, part: { text: "hello" } },
  { type: "tool_use", timestamp: 120, part: { tool: "glob", state: { input: { pattern: "*.swift" }, time: { start: 120 } } } },
  { type: "step_finish", timestamp: 130, part: { reason: "stop", tokens: undefined } },
]);
assert.deepEqual(parseOmpEvents([
  JSON.stringify({ type: "turn_start" }),
  JSON.stringify({ type: "message_start", message: { role: "assistant", timestamp: 1_000 } }),
  JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "inspect" } }),
  JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "done" } }),
  JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      timestamp: 1_000,
      duration: 400,
      ttft: 100,
      stopReason: "toolUse",
      usage: {
        input: 20,
        output: 7,
        reasoningTokens: 3,
        cacheRead: 10,
        cacheWrite: 2,
        cost: { total: 0.25 },
      },
    },
  }),
  JSON.stringify({ type: "tool_execution_start", toolName: "read", args: { path: "src/example.ts" } }),
  JSON.stringify({ type: "turn_end", message: { role: "assistant" } }),
].join("\n")), [
  { type: "step_start", timestamp: 1_000 },
  { type: "reasoning", timestamp: 1_100, part: { text: "inspect" } },
  { type: "text", timestamp: 1_100, part: { text: "done" } },
  {
    type: "step_finish",
    timestamp: 1_400,
    part: {
      reason: "toolUse",
      cost: 0.25,
      tokens: {
        input: 20,
        output: 7,
        reasoning: 0,
        reasoning_in_output: 3,
        cache: { read: 10, write: 2 },
      },
    },
  },
  { type: "tool_use", timestamp: 1_400, part: { tool: "read", state: { input: { path: "src/example.ts" }, time: { start: 1_400 } } } },
]);
assert.equal(
  recomputedRequestCost(
    parseOmpEvents(JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        timestamp: 1_000,
        duration: 400,
        usage: { input: 20, output: 7, reasoningTokens: 3, cacheRead: 10, cacheWrite: 2 },
      },
    }))[0],
    "openai/gpt-5.6-terra",
  ),
  0.00016375,
);
assert.deepEqual(
  summarizeEventTiming(parseOmpEvents([
    JSON.stringify({ type: "message_start", message: { role: "assistant", timestamp: 2_000 } }),
    JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "inspect" } }),
    JSON.stringify({ type: "message_end", message: { role: "assistant", timestamp: 2_000, duration: 500, ttft: 125, usage: {} } }),
  ].join("\n")), 1_900),
  {
    launcher_startup_seconds: 0.1,
    time_to_first_observed_action_seconds: 0.125,
    time_to_first_text_block_seconds: null,
    model_session_seconds: 0.5,
    per_step_decision_latency_seconds: { count: 1, p50: 0.125, p90: 0.125, max: 0.125 },
  },
);
assert.equal(route.variants.high.reasoningEffort, "high");
assert.equal(route.sha256.length, 64);
assert.throws(() => resolveBenchmarkModelRoute(catalog, { model: "openai/missing" }), /absent from OMP catalog/);
assert.throws(() => resolveBenchmarkModelRoute(catalog, { model: "openai/gpt-5.6-terra", variant: "xhigh" }), /thinking level/);
assert.deepEqual(summarizeEventTiming([], 1000), { launcher_startup_seconds: null, time_to_first_observed_action_seconds: null, time_to_first_text_block_seconds: null, model_session_seconds: null, per_step_decision_latency_seconds: { count: 0, p50: null, p90: null, max: null } });
console.log("PASS OMP benchmark command, auth isolation, catalog, path, provenance, and timing integrity");
