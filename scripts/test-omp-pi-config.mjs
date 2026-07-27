#!/usr/bin/env bun

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const managedAgentNames = [
  "accessibility_auditor",
  "code_reviewer",
  "database_optimizer",
  "evidence_analyst",
  "evidence_reader",
  "security_engineer",
  "software_architect",
];
const allowedAgentFrontmatterKeys = new Set([
  "name",
  "description",
  "tools",
  "spawns",
  "model",
  "thinkingLevel",
  "thinking",
  "output",
  "blocking",
  "autoloadSkills",
  "readSummarize",
  "prewalk",
]);

function readAgentDefinition(filePath, expectedName) {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, `${filePath} must start with OMP frontmatter`);
  const frontmatter = Bun.YAML.parse(match[1]);
  assert.equal(frontmatter.name, expectedName);
  assert.equal(typeof frontmatter.description, "string");
  assert.ok(frontmatter.description.trim());
  assert.ok(frontmatter.tools);
  for (const key of Object.keys(frontmatter)) {
    assert.equal(
      allowedAgentFrontmatterKeys.has(key),
      true,
      `${filePath} uses unsupported OMP frontmatter key ${key}`,
    );
  }
  assert.doesNotMatch(
    match[1],
    /^(?:permission|mode|external_directory|text_read|webfetch|websearch)\s*:/m,
  );
  assert.ok(content.slice(match[0].length).trim(), `${filePath} must contain agent guidance`);
  return { content, frontmatter };
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omp-config-test-"));
const homeDir = path.join(testRoot, "home");
const configDir = path.join(homeDir, ".omp", "agent");
const agentsDir = path.join(configDir, "agents");
const configPath = path.join(configDir, "config.yml");
const unmanagedAgentPath = path.join(agentsDir, "user_local.md");
const globalInstructionPath = path.join(configDir, "AGENTS.md");
const globalInstructionSource = path.join(repoRoot, "AGENTS.md");
const stubBin = path.join(testRoot, "bin");
const callLog = path.join(testRoot, "omp-calls.log");
const miseLog = path.join(testRoot, "mise-calls.log");

function writeFile(filePath, content, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { mode });
  fs.chmodSync(filePath, mode);
}

try {
  const sourceAgentDefinitions = new Map();
  for (const name of managedAgentNames) {
    const sourcePath = path.join(repoRoot, "omp", "agents", `${name}.md`);
    const sourceStat = fs.lstatSync(sourcePath, { throwIfNoEntry: false });
    assert.ok(sourceStat, `managed OMP agent source is missing: ${sourcePath}`);
    assert.equal(sourceStat.isSymbolicLink(), false, `${sourcePath} must not be a symlink`);
    assert.equal(sourceStat.isFile(), true, `${sourcePath} must be a regular file`);
    sourceAgentDefinitions.set(name, readAgentDefinition(sourcePath, name));
  }

  const globalInstructionSourceStat = fs.lstatSync(globalInstructionSource, {
    throwIfNoEntry: false,
  });
  assert.ok(globalInstructionSourceStat, `global instruction source is missing: ${globalInstructionSource}`);
  assert.equal(globalInstructionSourceStat.isSymbolicLink(), false);
  assert.equal(globalInstructionSourceStat.isFile(), true);

  const profile = Bun.YAML.parse(
    fs.readFileSync(path.join(repoRoot, "omp", "omp.defaults.yml"), "utf8"),
  );
  assert.equal(profile.modelRoleStorage, "global");
  assert.deepEqual(profile.modelRoles, {
    default: "openai/gpt-5.6-terra:xhigh",
    plan: "openai/gpt-5.6-terra:xhigh",
    smol: "openai/gpt-5.6-luna:high",
    slow: "openai/gpt-5.6-sol:high",
    tiny: "openai/gpt-5.6-luna:medium",
    task: "openai/gpt-5.6-terra:high",
    commit: "baseten/moonshotai/Kimi-K2.7-Code",
    advisor: "openai/gpt-5.6-sol:high",
  });
  assert.equal(profile.hideThinkingBlock, true);
  assert.deepEqual(profile.advisor, { enabled: true });
  assert.equal(profile.task, undefined);
  assert.equal(profile.glob, undefined);
  assert.equal(profile.grep, undefined);
  assert.deepEqual(profile.astGrep, { enabled: true });
  assert.deepEqual(profile.tools, { xdev: true, xdevDocs: "builtins" });
  assert.doesNotMatch(JSON.stringify(profile), /api[_-]?key|token|secret|password/i);

  const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /pi\(\) \{/);
  assert.match(readme, /command omp "\$\{args\[@\]\}"/);
  assert.match(readme, /_run_notion_local_or_command pi "\$\{args\[@\]\}"/);
  assert.match(readme, /--approval-mode|--auto-approve|--yolo/);

  writeFile(configPath, [
    "modelRoles:",
    "  advisor: anthropic/claude-sonnet:high",
    "  commit: anthropic/claude-sonnet:high",
    "  vision: openai/gpt-4o:high",
    "  smol: openai/gpt-5.6-sol:high",
    "  task: \"@smol\"",
    "advisor:",
    "  enabled: true",
    "task:",
    "  maxConcurrency: 10",
    "  maxRecursionDepth: 1",
    "glob:",
    "  enabled: true",
    "grep:",
    "  enabled: true",
    "astGrep:",
    "  enabled: true",
    "unmanaged:",
    "  apiKey: do-not-log-or-replace",
    "  keep: true",
    "",
  ].join("\n"));
  const unmanagedAgentContent = "unmanaged user agent\n";
  writeFile(unmanagedAgentPath, unmanagedAgentContent, 0o640);
  const existingGlobalInstructionContent = "existing global instruction\n";
  writeFile(globalInstructionPath, existingGlobalInstructionContent, 0o640);
  fs.mkdirSync(stubBin, { recursive: true });
  writeFile(path.join(stubBin, "mise"), `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$MISE_CALL_LOG"
if [ "$1" != exec ] || [ "$2" != bun@1.3.14 ] || [ "$3" != -- ]; then
  exit 1
fi
shift 3
exec "$@"
`, 0o700);
  writeFile(path.join(stubBin, "bun"), `#!/usr/bin/env bash
set -eu
exec "$TEST_BUN_BIN" "$@"
`, 0o700);
  writeFile(path.join(stubBin, "omp"), `#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$OMP_CALL_LOG"
if [ "$1" = --version ]; then
  printf '%s\n' 'omp/17.1.2'
  exit 0
fi
if [ "$1" = config ] && [ "$2" = path ]; then
  printf '%s\n' "$STUB_AGENT_DIR"
fi
if [ "$1" = config ] && [ "$2" = get ] && [ "\${OMP_FAIL_CONFIG_GET:-}" = 1 ]; then
  exit 1
fi
`, 0o700);

  const result = Bun.spawnSync(["bash", path.join(repoRoot, "setup-omp.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
       HOME: homeDir,
       OMP_MISE_BIN: path.join(stubBin, "mise"),
       OMP_CALL_LOG: callLog,
       MISE_CALL_LOG: miseLog,
       TEST_BUN_BIN: process.execPath,
       STUB_AGENT_DIR: configDir,
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  assert.equal(result.exitCode, 0, result.stderr.toString());
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  assert.doesNotMatch(output, /do-not-log-or-replace|apiKey/i);

  const installed = Bun.YAML.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(installed.modelRoles.advisor, "openai/gpt-5.6-sol:high");
  assert.equal(installed.modelRoles.commit, "baseten/moonshotai/Kimi-K2.7-Code");
  assert.equal(installed.modelRoles.smol, "openai/gpt-5.6-luna:high");
  assert.equal(installed.modelRoles.task, "openai/gpt-5.6-terra:high");
  assert.equal(installed.advisor.enabled, true);
  assert.equal(installed.hideThinkingBlock, true);
  assert.equal(installed.unmanaged.apiKey, "do-not-log-or-replace");
  assert.equal(installed.unmanaged.keep, true);
  assert.equal(installed.task, undefined);
  assert.equal(installed.glob, undefined);
  assert.equal(installed.grep, undefined);
  assert.equal(installed.astGrep.enabled, true);
  assert.equal(installed.tools.xdev, true);
  assert.equal(installed.tools.discoveryMode, undefined);
  assert.equal(fs.statSync(configPath).mode & 0o077, 0);
  assert.equal(fs.readFileSync(unmanagedAgentPath, "utf8"), unmanagedAgentContent);
  assert.equal(fs.lstatSync(unmanagedAgentPath).mode & 0o777, 0o640);
  const globalInstructionStat = fs.lstatSync(globalInstructionPath, {
    throwIfNoEntry: false,
  });
  assert.ok(globalInstructionStat, "global OMP instruction link was not installed");
  assert.equal(globalInstructionStat.isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(globalInstructionPath), globalInstructionSource);
  assert.equal(
    fs.readFileSync(globalInstructionPath, "utf8"),
    fs.readFileSync(globalInstructionSource, "utf8"),
  );
  for (const name of managedAgentNames) {
    const installedAgentPath = path.join(agentsDir, `${name}.md`);
    const installedStat = fs.lstatSync(installedAgentPath, { throwIfNoEntry: false });
    assert.ok(installedStat, `managed OMP agent was not installed: ${name}`);
    assert.equal(installedStat.isSymbolicLink(), false);
    assert.equal(installedStat.isFile(), true);
    assert.equal(installedStat.mode & 0o077, 0);
    const installedDefinition = readAgentDefinition(installedAgentPath, name);
    assert.equal(installedDefinition.content, sourceAgentDefinitions.get(name).content);
    assert.deepEqual(
      installedDefinition.frontmatter,
      sourceAgentDefinitions.get(name).frontmatter,
    );
  }
  for (const name of ["luna_implementer", "luna_reader", "sol_high"]) {
    assert.equal(fs.existsSync(path.join(agentsDir, `${name}.md`)), false);
  }
  assert.equal(fs.readdirSync(path.join(configDir, "backups", "setup-omp")).length, 2);
  const calls = fs.readFileSync(callLog, "utf8");
  assert.match(calls, /config get modelRoles/);
  assert.match(fs.readFileSync(miseLog, "utf8"), /exec bun@1\.3\.14 -- omp --version/);

  const customTaskConfig = path.join(testRoot, "custom-task", "config.yml");
  writeFile(customTaskConfig, [
    "modelRoles:",
    "  task: openai/gpt-5.6-sol:high",
    "task:",
    "  maxConcurrency: 4",
    "  maxRecursionDepth: 3",
    "glob:",
    "  enabled: false",
    "",
  ].join("\n"));
  const preservedTask = Bun.spawnSync([
    process.execPath,
    path.join(repoRoot, "scripts", "merge-omp-config.mjs"),
    path.join(repoRoot, "omp", "omp.defaults.yml"),
    customTaskConfig,
  ]);
  assert.equal(preservedTask.exitCode, 0, preservedTask.stderr.toString());
  const preservedCustomConfig = Bun.YAML.parse(fs.readFileSync(customTaskConfig, "utf8"));
  assert.equal(
    preservedCustomConfig.modelRoles.task,
    "openai/gpt-5.6-terra:high",
  );
  assert.equal(preservedCustomConfig.glob.enabled, false);
  assert.equal(preservedCustomConfig.task.maxConcurrency, 4);
  assert.equal(preservedCustomConfig.task.maxRecursionDepth, 3);

  const fallbackRoot = path.join(testRoot, "fallback");
  const fallbackConfig = path.join(fallbackRoot, "config.yml");
  writeFile(fallbackConfig, "unmanaged:\n  keep: true\n");
  const fallbackBin = path.join(testRoot, "fallback-bin");
  fs.mkdirSync(fallbackBin, { recursive: true });
  fs.copyFileSync(path.join(stubBin, "mise"), path.join(fallbackBin, "mise"));
  fs.copyFileSync(path.join(stubBin, "bun"), path.join(fallbackBin, "bun"));
  fs.copyFileSync(path.join(stubBin, "omp"), path.join(fallbackBin, "omp"));
  const fallback = Bun.spawnSync(["bash", path.join(repoRoot, "setup-omp.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
       HOME: homeDir,
       OMP_MISE_BIN: path.join(fallbackBin, "mise"),
       OMP_AGENT_DIR: fallbackRoot,
       OMP_CONFIG_PATH: fallbackConfig,
       OMP_CALL_LOG: callLog,
       MISE_CALL_LOG: miseLog,
       TEST_BUN_BIN: process.execPath,
       PATH: `${fallbackBin}:${process.env.PATH}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  assert.equal(fallback.exitCode, 0, fallback.stderr.toString());
  const fallbackInstalled = Bun.YAML.parse(fs.readFileSync(fallbackConfig, "utf8"));
  assert.equal(fallbackInstalled.unmanaged.keep, true);
  assert.equal(fallbackInstalled.modelRoles.default, "openai/gpt-5.6-terra:xhigh");
  assert.equal(fallbackInstalled.hideThinkingBlock, true);
  const fallbackGlobalInstructionPath = path.join(fallbackRoot, "AGENTS.md");
  assert.equal(fs.lstatSync(fallbackGlobalInstructionPath).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(fallbackGlobalInstructionPath), globalInstructionSource);

  const rollbackAgentContents = new Map();
  for (const name of managedAgentNames) {
    const content = `pre-failure managed agent: ${name}\n`;
    rollbackAgentContents.set(name, content);
    writeFile(path.join(agentsDir, `${name}.md`), content, 0o640);
  }
  const rollbackGlobalInstructionContent = "pre-failure global instruction\n";
  fs.unlinkSync(globalInstructionPath);
  writeFile(globalInstructionPath, rollbackGlobalInstructionContent, 0o640);
  const rollbackConfig = "unmanaged:\n  preserved: before-failure\n";
  writeFile(configPath, rollbackConfig);
  const failedUpdate = Bun.spawnSync(["bash", path.join(repoRoot, "setup-omp.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: homeDir,
      OMP_MISE_BIN: path.join(stubBin, "mise"),
      OMP_CALL_LOG: callLog,
      MISE_CALL_LOG: miseLog,
      TEST_BUN_BIN: process.execPath,
      STUB_AGENT_DIR: configDir,
      OMP_FAIL_CONFIG_GET: "1",
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  assert.notEqual(failedUpdate.exitCode, 0);
  assert.equal(fs.readFileSync(configPath, "utf8"), rollbackConfig);
  assert.match(failedUpdate.stderr.toString(), /ROLLBACK OMP setup failed/);
  for (const name of managedAgentNames) {
    const restoredPath = path.join(agentsDir, `${name}.md`);
    assert.equal(fs.readFileSync(restoredPath, "utf8"), rollbackAgentContents.get(name));
    assert.equal(fs.lstatSync(restoredPath).mode & 0o777, 0o640);
  }
  assert.equal(fs.readFileSync(unmanagedAgentPath, "utf8"), unmanagedAgentContent);
  assert.equal(fs.lstatSync(globalInstructionPath).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(globalInstructionPath, "utf8"), rollbackGlobalInstructionContent);
  assert.equal(fs.lstatSync(globalInstructionPath).mode & 0o777, 0o640);

  const missingConfig = path.join(testRoot, "missing", "config.yml");
  const failedCreate = Bun.spawnSync(["bash", path.join(repoRoot, "setup-omp.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: homeDir,
      OMP_CONFIG_PATH: missingConfig,
      OMP_MISE_BIN: path.join(stubBin, "mise"),
      OMP_CALL_LOG: callLog,
      MISE_CALL_LOG: miseLog,
      TEST_BUN_BIN: process.execPath,
      OMP_FAIL_CONFIG_GET: "1",
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  assert.notEqual(failedCreate.exitCode, 0);
  assert.equal(fs.existsSync(missingConfig), false);

  console.log("OK     OMP profile and safe installer invariants");
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true });
}
