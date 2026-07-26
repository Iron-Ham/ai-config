#!/usr/bin/env bun

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { assertRawBenchmarkOutputOutsideRepository } from "./benchmark-output-containment.mjs";
import { assertToolPathsStayInWorkdir } from "./benchmark-omp-model-pairs.mjs";
import {
  benchmarkConfigOverlay,
  isolatedOmpEnvironment,
  parseOmpEvents,
  recomputedRequestCost,
  summarizeEventTiming,
} from "./omp-benchmark-runtime.mjs";
function parseArguments(argv) {
  const args = { repeat: 3, timeout_ms: 3_600_000, candidate_tools: "glob,grep", require_candidate_tool_use: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) {
      usage();
      throw new Error(`Invalid argument near ${name ?? "end of command"}`);
    }
    args[name.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  args.repeat = Number.parseInt(String(args.repeat), 10);
  args.timeout_ms = Number.parseInt(String(args.timeout_ms), 10);
  if (!Number.isSafeInteger(args.repeat) || args.repeat < 2) throw new Error("--repeat must be an integer of at least 2");
  if (!Number.isSafeInteger(args.timeout_ms) || args.timeout_ms < 1) throw new Error("--timeout-ms must be a positive integer");
  for (const name of ["task_file", "workdir", "output_dir", "model", "validation_command"]) {
    if (typeof args[name] !== "string") throw new Error(`--${name.replaceAll("_", "-")} is required`);
  }
  return args;
}

export function candidateTools(value) {
  const tools = String(value).split(",").map((tool) => tool.trim()).filter(Boolean);
  const allowed = new Set(["read", "glob", "grep", "ast_grep"]);
  if (tools.length === 0 || tools.some((tool) => !allowed.has(tool))) {
    throw new Error("--candidate-tools must be a comma-separated subset of read,glob,grep,ast_grep");
  }
  return [...new Set(tools)];
}

export function requiredCandidateTools(value, candidates) {
  const required = String(value).split(",").map((tool) => tool.trim()).filter(Boolean);
  if (required.some((tool) => !candidates.includes(tool))) throw new Error("--require-candidate-tool-use must be a subset of --candidate-tools");
  return [...new Set(required)];
}

function eventTool(event) {
  return event.part?.tool ?? event.tool ?? event.name ?? event.data?.tool;
}

export function candidateToolUsage(events, required) {
  const calls = events.filter((event) => ["tool_use", "tool_call", "tool_result"].includes(event.type))
    .map(eventTool).filter((tool) => typeof tool === "string");
  const counts = Object.fromEntries([...new Set(required)].sort().map((tool) => [tool, calls.filter((call) => call === tool).length]));
  return { required, counts, missing: required.filter((tool) => counts[tool] === 0) };
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}
function createPrivateOutputDirectory(directory) {
  if (fs.lstatSync(directory, { throwIfNoEntry: false })) throw new Error(`Private benchmark output directory must not already exist: ${directory}`);
  ensurePrivateDirectory(directory);
}
function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}
function writePrivateFile(filePath, content) {
  ensurePrivateDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, content, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}
function parseEvents(output) {
  return parseOmpEvents(output);
}
function extractText(events) {
  return events.filter((event) => event.type === "text" || event.type === "assistant_message")
    .map((event) => event.part?.text ?? event.text ?? event.content ?? "")
    .filter((text) => typeof text === "string").join("\n").trim();
}
function runValidation(command, workdir, answerPath) {
  const result = Bun.spawnSync(["zsh", "-lc", command], { cwd: workdir, env: { ...process.env, OMP_BENCHMARK_ANSWER_PATH: answerPath }, stdout: "pipe", stderr: "pipe" });
  return { passed: result.exitCode === 0, exit_code: result.exitCode, output: `${result.stdout.toString()}${result.stderr.toString()}`.slice(-4_000) };
}
function summarize(events, wallTimeMs, model, startedAtMs) {
  const finishes = events.filter((event) => event.type === "step_finish" || event.type === "turn_end" || event.type === "response");
  const tools = events.filter((event) => ["tool_use", "tool_call"].includes(event.type)).map(eventTool).filter(Boolean);
  const sum = (selector) => finishes.reduce((total, event) => total + Number(selector(event) ?? 0), 0);
  return {
    wall_time_seconds: wallTimeMs / 1000,
    timing: summarizeEventTiming(events, startedAtMs),
    tool_calls: tools.length,
    tool_counts: Object.fromEntries([...new Set(tools)].sort().map((tool) => [tool, tools.filter((value) => value === tool).length])),
    recomputed_cost_usd: finishes.reduce((total, event) => total + recomputedRequestCost(event, model), 0),
    tokens: { input: sum((event) => event.part?.tokens?.input ?? event.usage?.input_tokens), output: sum((event) => event.part?.tokens?.output ?? event.usage?.output_tokens), reasoning: sum((event) => event.part?.tokens?.reasoning), cache_read: sum((event) => event.part?.tokens?.cache?.read), cache_write: sum((event) => event.part?.tokens?.cache?.write) },
  };
}
async function runWithTimeout(command, options, timeoutMs) {
  const child = Bun.spawn(command, { ...options, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  clearTimeout(timer);
  return { stdout, stderr, exitCode, timedOut };
}
async function runArm({ arm, repetition, task, workdir, outputDir, model, timeoutMs, validationCommand, tools, requiredTools }) {
  const stateDirectory = path.join(outputDir, "state", `${String(repetition).padStart(2, "0")}-${arm}`);
  const configHome = path.join(stateDirectory, "config");
  const dataHome = path.join(stateDirectory, "data");
  const configPath = path.join(configHome, "benchmark.json");
  ensurePrivateDirectory(configHome); ensurePrivateDirectory(dataHome);
  fs.writeFileSync(configPath, benchmarkConfigOverlay(workdir, { share: "disabled", tools: Object.fromEntries(tools.map((tool) => [tool, true])) }), { mode: 0o600 });
  const startedAtMs = Date.now(); const startedAt = performance.now();
  const command = ["omp", "-p", "--mode", "json", "--cwd", workdir, "--model", model, "--thinking", "off", "--config", configPath, "--no-session", "--tools", tools.join(","), "--no-pty", task];
  const execution = await runWithTimeout(command, { cwd: workdir, env: isolatedOmpEnvironment({ configContent: fs.readFileSync(configPath, "utf8"), configHome, dataHome, cwd: workdir }) }, timeoutMs);
  const events = parseEvents(execution.stdout);
  const candidateUsageResult = arm === "candidate" ? candidateToolUsage(events, requiredTools) : undefined;
  const answerPath = path.join(outputDir, "answers", `${String(repetition).padStart(2, "0")}-${arm}.md`);
  writePrivateFile(answerPath, `${extractText(events)}\n`);
  const validation = runValidation(validationCommand, workdir, answerPath);
  let policyViolation;
  try { assertToolPathsStayInWorkdir(events, workdir); } catch (error) { policyViolation = error instanceof Error ? error.message : String(error); }
  const worktreeStatus = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: workdir }).stdout.toString().trim();
  if (worktreeStatus) policyViolation = `Benchmark changed the worktree: ${worktreeStatus}`;
  writePrivateFile(path.join(outputDir, "raw", `${String(repetition).padStart(2, "0")}-${arm}.jsonl`), execution.stdout);
  writePrivateFile(path.join(outputDir, "raw", `${String(repetition).padStart(2, "0")}-${arm}.stderr`), execution.stderr);
  return { arm, repetition, status: policyViolation ? "policy_violation" : execution.timedOut ? "timeout" : execution.exitCode !== 0 ? "failed" : !validation.passed ? "validation_failed" : candidateUsageResult?.missing.length ? "candidate_unused" : "completed", exit_code: execution.exitCode, policy_violation: policyViolation, validation: { passed: validation.passed, exit_code: validation.exit_code }, candidate_tool_usage: candidateUsageResult, raw_event_sha256: createHash("sha256").update(execution.stdout).digest("hex"), metrics: summarize(events, performance.now() - startedAt, model, startedAtMs) };
}
async function main() {
  const args = parseArguments(process.argv.slice(2));
  const tools = candidateTools(args.candidate_tools); const requiredTools = requiredCandidateTools(args.require_candidate_tool_use, tools);
  let outputDir = assertRawBenchmarkOutputOutsideRepository(args.output_dir); createPrivateOutputDirectory(outputDir); outputDir = assertRawBenchmarkOutputOutsideRepository(outputDir);
  const workdir = fs.realpathSync(args.workdir); const taskFile = fs.realpathSync(args.task_file);
  if (!fs.statSync(workdir).isDirectory()) throw new Error("--workdir must be a directory");
  if (!fs.statSync(taskFile).isFile()) throw new Error("--task-file must be a regular file");
  if (isPathInside(workdir, outputDir)) throw new Error("--output-dir must be outside the benchmark worktree");
  if (fs.existsSync(path.join(workdir, ".git")) && Bun.spawnSync(["git", "status", "--porcelain"], { cwd: workdir }).stdout.toString().trim()) throw new Error("Benchmark worktree must be clean");
  const task = fs.readFileSync(taskFile, "utf8"); const trials = [];
  for (let repetition = 1; repetition <= args.repeat; repetition += 1) {
    const arms = repetition % 2 === 0 ? ["candidate", "baseline"] : ["baseline", "candidate"];
    for (const arm of arms) trials.push(await runArm({ arm, repetition, task, workdir, outputDir, model: args.model, timeoutMs: args.timeout_ms, validationCommand: args.validation_command, tools: arm === "candidate" ? tools : ["read", "glob", "grep", "ast_grep"], requiredTools }));
  }
  writePrivateFile(path.join(outputDir, "summary.json"), `${JSON.stringify({ schema_version: 1, protocol: "paired-omp-native-tool-subsets-v1", privacy: "raw task, events, stderr, and state remain only in this private output directory", task_sha256: createHash("sha256").update(task).digest("hex"), candidate_tools: tools, required_candidate_tool_use: requiredTools, trials }, null, 2)}\n`);
  console.log(`Private benchmark results written to ${outputDir}`);
}
if (import.meta.main) await main();
