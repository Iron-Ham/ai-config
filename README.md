# OMP Configuration

Personal configuration for [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi), including a safe global-profile installer, managed defaults, and a focused regression test.

## Setup

Herdr is required for delegated OMP agents. Install it before configuring this repository:

```bash
curl -fsSL https://herdr.dev/install.sh | sh
```

```bash
git clone git@github.com:Iron-Ham/claude-config.git ~/Developer/claude-config
cd ~/Developer/claude-config
./setup-omp.sh
```

`setup-omp.sh` requires `mise`. It installs and verifies OMP 17.1.2 with Bun 1.3.14, discovers the profile path using `omp config path`, and merges the repository profile into the global configuration. Set `OMP_AGENT_DIR`, `PI_CODING_AGENT_DIR`, or `OMP_CONFIG_PATH` to select an explicit location. The installer creates private timestamped backups, writes atomically, validates the resulting roles and managed agents, and restores the previous configuration and managed agent files if validation fails.

The installer also symlinks the repository's `AGENTS.md` into the selected OMP global instruction location, `$OMP_AGENT_DIR/AGENTS.md`. It replaces a regular file only after backing it up, preserves an existing link to that repository source, and rejects a link to any other destination.

The installer copies the seven repository-managed agent definitions from `omp/agents/` into `$OMP_AGENT_DIR/agents`: `accessibility_auditor`, `code_reviewer`, `database_optimizer`, `evidence_analyst`, `evidence_reader`, `security_engineer`, and `software_architect`. It replaces only those known files, rejects symlinked managed paths, and leaves unrelated user agent definitions untouched.

Optional macOS dependencies used by OMP's repository tools:

```bash
brew install ripgrep ast-grep
```

## Managed profile

`omp/omp.defaults.yml` is the source of truth for the managed global profile. It sets global model roles (`default`, `plan`, `smol`, `slow`, `tiny`, `task`, `commit`, and `advisor`), enables the advisor and AST-grep integration, hides thinking blocks, and enables OMP's `xdev` tools with built-in documentation. The seven managed read-only agent definitions are sourced from `omp/agents/` and installed under the selected OMP agent directory. They contain no credentials; the merge keeps unrelated user configuration, custom task settings, and unmanaged agent definitions intact.

Use the `pi` and `omp` dispatchers when work should run through the local Notion wrapper. `pi` uses local Pi only inside the Notion checkout; `omp` forces that local path without changing the caller's directory. Explicit approval flags are preserved, and unattended invocations default to `--yolo`.

```zsh
_run_notion_local_or_command() {
  local tool="$1"
  shift
  if command -v mise >/dev/null 2>&1; then
    command mise exec node@22.13.1 -- notion local "$tool" "$@"
  else
    command "$tool" "$@"
  fi
}

pi() {
  local notion_next_dir="${NOTION_NEXT_DIR:-$HOME/Developer/Notion/notion-next}"
  local approval_flag=false
  local arg
  for arg in "$@"; do
    case "$arg" in
      --approval-mode|--approval-mode=*|--auto-approve|--yolo)
        approval_flag=true
        ;;
    esac
  done

  local -a args=("$@")
  if [[ "$approval_flag" == false ]]; then
    args+=(--yolo)
  fi

  if [[ "${OMP_LOCAL_PI:-}" == true || "$PWD" == "$notion_next_dir" || "$PWD" == "$notion_next_dir/"* ]]; then
    _run_notion_local_or_command pi "${args[@]}"
    return
  fi

  command omp "${args[@]}"
}

omp() {
  local OMP_LOCAL_PI=true
  pi --config "$HOME/Developer/claude-config/omp/omp.defaults.yml" "$@"
}
```

`omp` invokes the existing `pi()` function with a function-local `OMP_LOCAL_PI=true`, so `pi` uses `notion local pi` while retaining the original working directory and every argument boundary. The repository profile is a CLI overlay after Notion and environment overlays; a later user-supplied `--config` can explicitly override it.

### Delegating through Herdr

**OMP only:** Every delegated session in this configuration MUST be an OMP session started with `herdr agent start --kind omp`. NEVER start Codex or invoke `codex` as a fallback. If Herdr or OMP is unavailable, stop and report the blocked dependency.

For a Herdr-managed OMP subagent, create a sibling pane with the harness directory, then set the variables from the returned pane ID before starting and prompting the recognized agent:

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus

agent_name="my-agent"
pane_id="pane-id-from-command-output"
model="provider/model"
task_prompt="Describe the bounded task and acceptance criteria."
herdr agent start "$agent_name" --kind omp --pane "$pane_id" -- --model "$model"
herdr agent prompt "$agent_name" "$task_prompt" --wait --timeout 120000
```

Herdr keeps the OMP subagent in its own pane and manages it through `herdr agent` commands. The `OMP_LOCAL_PI` flag makes its `omp` process use `notion local pi` while preserving the pane's original `$PWD`, so it works in the same checkout as the harness rather than in the Notion checkout. The agent has its own Pi session and receives the delegated prompt, not the parent OMP conversation, todos, or active-agent registry.

## Local terminal preferences

`setup-omp.sh` does not modify shell or terminal preferences. Add the following to `~/.config/ghostty/config.ghostty` to keep the Command+` quick terminal visible when it loses focus and match the iTerm Default profile's dark, translucent background:

```text
keybind = global:cmd+grave_accent=toggle_quick_terminal
quick-terminal-autohide = false
background = #15191F
background-opacity = 0.8450265957446809
background-opacity-cells = true
background-blur = 4
```

Ghostty requires a full restart on macOS for `background-opacity` changes. Native macOS fullscreen disables background opacity.

## OMP benchmarks

The retained benchmark runners are OMP-native:

- `scripts/benchmark-omp-model-pairs.mjs`
- `scripts/benchmark-omp-swift-implementers.mjs`
- `scripts/benchmark-omp-context-tools.mjs`

They share `scripts/omp-benchmark-runtime.mjs` and
`scripts/summarize-omp-paired-trials.mjs`. Model runs are explicit and manual
and may incur provider cost. Keep raw benchmark results outside this
repository (for example, under `/tmp`).

Run all deterministic profile and benchmark regression checks locally:

```bash
for test in $(printf '%s\n' scripts/test-*.mjs | LC_ALL=C sort); do
  bun "$test"
done
```

The deterministic benchmark checks are `scripts/test-omp-benchmark-runtime.mjs`,
`scripts/test-omp-benchmark-pricing.mjs`,
`scripts/test-benchmark-omp-context-tools.mjs`, and
`scripts/test-benchmark-output-containment.mjs`; the loop also runs
`scripts/test-omp-pi-config.mjs` for the OMP profile and does not invoke a
model benchmark.

## Verify changes

Run the focused deterministic test after changing the installer or managed profile:

```bash
bun scripts/test-omp-pi-config.mjs
```

The test validates all seven repository sources and their OMP frontmatter, installs each definition from its exact source content, preserves an unrelated user agent and unmanaged settings, checks explicit and discovered paths and file permissions, and verifies configuration plus managed-agent rollback on validation failure. It uses local stubs and does not make real model calls.
