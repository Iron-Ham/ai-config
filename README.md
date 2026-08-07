# OMP Configuration

Personal configuration for [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi), including a safe global-profile installer, managed defaults, and a focused regression test.

## Setup

Herdr is required for delegated OMP agents. Install it before configuring this repository:

```bash
curl -fsSL https://herdr.dev/install.sh | sh
```

```bash
git clone git@github.com:Iron-Ham/ai-config.git ~/Developer/ai-config
cd ~/Developer/ai-config
./setup-omp.sh
```

`setup-omp.sh` requires `mise`. It installs OMP 17.1.4 when the installed runtime is older or invalid, and retains newer OMP versions. It discovers the profile path using `omp config path`, then merges the repository profile into the global configuration. Set `OMP_AGENT_DIR`, `PI_CODING_AGENT_DIR`, or `OMP_CONFIG_PATH` to select an explicit location. The installer creates private timestamped backups, writes atomically, validates the resulting roles, managed skills, and managed agents, and restores the previous configuration and managed files if validation fails.

The installer also symlinks the repository's `AGENTS.md` into the selected OMP global instruction location, `$OMP_AGENT_DIR/AGENTS.md`. It replaces a regular file only after backing it up, preserves an existing link to that repository source, replaces a dangling link left by moving the repository, and rejects a link that still resolves to another destination.

The installer copies the seven repository-managed agent definitions from `omp/agents/` into `$OMP_AGENT_DIR/agents`: `accessibility_auditor`, `code_reviewer`, `database_optimizer`, `evidence_analyst`, `evidence_reader`, `security_engineer`, and `software_architect`. It replaces only those known files, rejects symlinked managed paths, and leaves unrelated user agent definitions untouched.

The installer copies repository-managed skills from `.agents/skills/` and `skills/` into `$OMP_AGENT_DIR/skills`, replacing only matching skill directories and preserving unrelated user skills.

Optional macOS dependencies used by OMP's repository tools:

```bash
brew install ripgrep ast-grep
```

## Managed profile

`omp/omp.defaults.yml` is the source of truth for managed global defaults. On first install it supplies the model roles (`default`, `plan`, `smol`, `slow`, `tiny`, `commit`, and `advisor`), pins the generic `task` subagent to Terra High, disables automatic advisor use by default, enables the AST-grep integration, hides thinking blocks, and enables OMP's `xdev` tools with built-in documentation. The seven managed read-only agent definitions are sourced from `omp/agents/` and installed under the selected OMP agent directory. They contain no credentials; the merge keeps unrelated user configuration, custom task settings, unmanaged agent definitions, and the `default` model selected with `/model`.

Install these dispatchers in `~/.zshrc`, then start a new shell with `exec zsh`. Use `omp` rather than `pi`, `notion local pi`, or the `omp` binary directly: `omp` forces the local Notion runtime while using the global OMP profile installed by `setup-omp.sh`. That profile retains Terra High for the generic `task` subagent.

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
  pi "$@"
}
```

`omp` invokes the existing `pi()` function with a function-local `OMP_LOCAL_PI=true`, so `pi` uses `notion local pi` while retaining the original working directory and every argument boundary. `setup-omp.sh` installs the repository profile into OMP's global configuration; it seeds `modelRoles.default` only when absent.

`/model` changes the global `default` role and remains effective in new OMP sessions and after rerunning `setup-omp.sh`. `task`, `plan`, `smol`, `slow`, `tiny`, `commit`, and `advisor` remain independent role assignments. Start a new OMP session after changing a model; existing sessions retain the role map loaded at startup.

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

`setup-omp.sh` does not modify shell or terminal preferences. Add the following to `~/.config/ghostty/config.ghostty` to use BerkeleyMono Nerd Font Mono, keep the Command+` quick terminal visible when it loses focus, open it on the display containing the pointer, and match the iTerm Default profile's dark, translucent background:

```text
font-family = BerkeleyMono Nerd Font Mono
keybind = global:cmd+grave_accent=toggle_quick_terminal
quick-terminal-screen = mouse
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

Model and catalog calls use `notion local pi`. The runners launch the managed
wrapper outside the frozen benchmark checkout, preserve its normal managed-auth
locations, and isolate each OMP agent state directory and explicit benchmark
configuration. This prevents a historical checkout from triggering dependency
installation while retaining the managed provider catalog. OMP v17 JSON events
are normalized before timing and cost aggregation; provider-reported output
already includes reasoning tokens and must not be billed twice.

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

The test validates all seven repository agent sources and their OMP frontmatter, installs every repository skill from its exact source tree, preserves unrelated user skills and unmanaged settings, checks explicit and discovered paths and file permissions, and verifies configuration plus managed skill, agent, and instruction rollback on validation failure. It uses local stubs and does not make real model calls.
