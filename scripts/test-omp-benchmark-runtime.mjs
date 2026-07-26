#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertParallelModelAuthSafe,
  benchmarkConfigOverlay,
  benchmarkInstructionManifest,
  buildOmpCommand,
  parseOmpEvents,
  isolatedOmpEnvironment,
  parseOmpModelCatalog,
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
  assert.deepEqual(buildOmpCommand({ cwd: workspace, model: "openai/gpt-5.6-terra", prompt: "inspect", thinking: "high", tools: ["read", "glob"], configPath: path.join(workspace, "benchmark.json") }), [
    "omp", "-p", "--mode", "json", "--cwd", workspace, "--model", "openai/gpt-5.6-terra",
    "--thinking", "high", "--config", path.join(workspace, "benchmark.json"), "--no-session",
    "--tools", "read,glob", "--no-pty", "inspect",
  ]);
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
assert.equal(route.variants.high.reasoningEffort, "high");
assert.equal(route.sha256.length, 64);
assert.throws(() => resolveBenchmarkModelRoute(catalog, { model: "openai/missing" }), /absent from OMP catalog/);
assert.throws(() => resolveBenchmarkModelRoute(catalog, { model: "openai/gpt-5.6-terra", variant: "xhigh" }), /thinking level/);
assert.deepEqual(summarizeEventTiming([], 1000), { launcher_startup_seconds: null, time_to_first_observed_action_seconds: null, time_to_first_text_block_seconds: null, model_session_seconds: null, per_step_decision_latency_seconds: { count: 0, p50: null, p90: null, max: null } });
console.log("PASS OMP benchmark command, auth isolation, catalog, path, provenance, and timing integrity");
