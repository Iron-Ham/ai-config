# OMP Configuration

Personal configuration for [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi), including a safe global-profile installer, managed defaults, and a focused regression test.

## Setup

```bash
git clone git@github.com:Iron-Ham/claude-config.git ~/Developer/claude-config
cd ~/Developer/claude-config
./setup-omp.sh
```

`setup-omp.sh` requires `mise`. It installs and verifies OMP 17.1.2 with Bun 1.3.14, discovers the profile path using `omp config path`, and merges the repository profile into the global configuration. Set `OMP_AGENT_DIR`, `PI_CODING_AGENT_DIR`, or `OMP_CONFIG_PATH` to select an explicit location. The installer creates private timestamped backups, writes atomically, validates the resulting roles and managed agents, and restores the previous configuration and managed agent files if validation fails.

The installer also copies the seven repository-managed agent definitions from `omp/agents/` into `$OMP_AGENT_DIR/agents`: `accessibility_auditor`, `code_reviewer`, `database_optimizer`, `evidence_analyst`, `evidence_reader`, `security_engineer`, and `software_architect`. It replaces only those known files, rejects symlinked managed paths, and leaves unrelated user agent definitions untouched.

Optional macOS dependencies used by OMP's repository tools:

```bash
brew install ripgrep ast-grep
```

## Managed profile

`omp/omp.defaults.yml` is the source of truth for the managed global profile. It sets global model roles (`default`, `plan`, `smol`, `slow`, `tiny`, `task`, `commit`, and `advisor`), enables the advisor and AST-grep integration, hides thinking blocks, and enables OMP's `xdev` tools with built-in documentation. The seven managed read-only agent definitions are sourced from `omp/agents/` and installed under the selected OMP agent directory. They contain no credentials; the merge keeps unrelated user configuration, custom task settings, and unmanaged agent definitions intact.

Use this dispatcher when work inside the local Notion checkout should run through its local wrapper; all other directories use global OMP. Explicit approval flags are preserved, and unattended invocations default to `--yolo`.

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

  if [[ "$PWD" == "$notion_next_dir" || "$PWD" == "$notion_next_dir/"* ]]; then
    _run_notion_local_or_command pi "${args[@]}"
    return
  fi

  command omp "${args[@]}"
}
```

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
