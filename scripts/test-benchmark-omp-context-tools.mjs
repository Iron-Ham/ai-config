#!/usr/bin/env bun

import assert from "node:assert/strict";

import {
  candidateTools,
  candidateToolUsage,
  requiredCandidateTools,
} from "./benchmark-omp-context-tools.mjs";

assert.deepEqual(candidateTools("read"), ["read"]);
assert.deepEqual(candidateTools("glob,read"), ["glob", "read"]);
assert.throws(
  () => candidateTools("text_read"),
  /subset of read,glob,grep,ast_grep/,
);
assert.deepEqual(
  requiredCandidateTools("read", ["glob", "read"]),
  ["read"],
);
assert.throws(
  () => requiredCandidateTools("text_read", ["glob"]),
  /subset of --candidate-tools/,
);
assert.deepEqual(
  candidateToolUsage([
    { type: "tool_call", tool: "grep" },
    { type: "tool_call", tool: "read" },
    { type: "tool_call", tool: "read" },
  ], ["read", "glob"]),
  {
    required: ["read", "glob"],
    counts: { glob: 0, read: 2 },
    missing: ["glob"],
  },
);

console.log("PASS OMP context-tool selection safeguards");
