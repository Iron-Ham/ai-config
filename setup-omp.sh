#!/usr/bin/env bash
set -euo pipefail

# Install the repo-managed OMP profile without replacing unrelated user settings.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
OMP_BUN_VERSION="1.3.14"
OMP_VERSION="17.1.2"
MANAGED_AGENT_NAMES=(
  accessibility_auditor
  code_reviewer
  database_optimizer
  evidence_analyst
  evidence_reader
  security_engineer
  software_architect
)
MANAGED_AGENT_SOURCE_DIR="$REPO_DIR/omp/agents"
managed_agent_backup_paths=()
managed_agent_original_exists=()
managed_agent_dest_paths=()
managed_agent_temp_paths=()

die() {
  echo "ERROR  $*" >&2
  exit 1
}

validate_managed_agent_sources() {
  local name source
  if [ -L "$MANAGED_AGENT_SOURCE_DIR" ] || [ ! -d "$MANAGED_AGENT_SOURCE_DIR" ]; then
    die "managed OMP agent source directory is missing or symlinked: $MANAGED_AGENT_SOURCE_DIR"
  fi
  for name in "${MANAGED_AGENT_NAMES[@]}"; do
    source="$MANAGED_AGENT_SOURCE_DIR/$name.md"
    if [ -L "$source" ] || [ ! -f "$source" ]; then
      die "managed OMP agent source is missing or symlinked: $source"
    fi
  done
}

validate_managed_agent_sources
MISE_BIN="${OMP_MISE_BIN:-$(type -P mise || true)}"
omp_agent_dir_explicit=false
if [ -n "${OMP_AGENT_DIR+x}" ] || [ -n "${PI_CODING_AGENT_DIR+x}" ]; then
  omp_agent_dir_explicit=true
fi
OMP_AGENT_DIR="${OMP_AGENT_DIR:-${PI_CODING_AGENT_DIR:-$HOME/.omp/agent}}"
CONFIG_PATH="${OMP_CONFIG_PATH:-}"
backup_path=""
original_exists=false
transaction_failed=true

if [ ! -x "$MISE_BIN" ]; then
  echo "ERROR  mise is required for OMP setup" >&2
  exit 1
fi

run_omp() {
  "$MISE_BIN" exec "bun@$OMP_BUN_VERSION" -- omp "$@"
}

run_bun() {
  "$MISE_BIN" exec "bun@$OMP_BUN_VERSION" -- bun "$@"
}

ensure_omp() {
  if [ "$(run_omp --version 2>/dev/null || true)" = "omp/$OMP_VERSION" ]; then
    return
  fi

  echo "Installing @oh-my-pi/pi-coding-agent@$OMP_VERSION with Bun $OMP_BUN_VERSION"
  "$MISE_BIN" exec "bun@$OMP_BUN_VERSION" -- bun install --global "@oh-my-pi/pi-coding-agent@$OMP_VERSION"
  if [ "$(run_omp --version 2>/dev/null || true)" != "omp/$OMP_VERSION" ]; then
    echo "ERROR  OMP $OMP_VERSION was not installed" >&2
    exit 1
  fi
}

ensure_omp

if [ -z "$CONFIG_PATH" ] && [ "$omp_agent_dir_explicit" = false ]; then
  discovered_path="$(run_omp config path 2>/dev/null || true)"
  if [[ "$discovered_path" == /* || "$discovered_path" == ~/* ]] &&
    [[ "$discovered_path" != *$'\n'* ]]; then
    discovered_path="${discovered_path/#\~/$HOME}"
    if [ -d "$discovered_path" ]; then
      OMP_AGENT_DIR="$discovered_path"
    else
      CONFIG_PATH="$discovered_path"
      OMP_AGENT_DIR="$(dirname "$CONFIG_PATH")"
    fi
  fi
fi

if [ -z "$CONFIG_PATH" ]; then
  if [ -f "$OMP_AGENT_DIR/config.yml" ]; then
    CONFIG_PATH="$OMP_AGENT_DIR/config.yml"
  elif [ -f "$OMP_AGENT_DIR/config.yaml" ]; then
    CONFIG_PATH="$OMP_AGENT_DIR/config.yaml"
  else
    CONFIG_PATH="$OMP_AGENT_DIR/config.yml"
  fi
fi

case "$CONFIG_PATH" in
  /*) ;;
  *)
    die "OMP config path must be absolute: $CONFIG_PATH"
    ;;
esac

case "$OMP_AGENT_DIR" in
  /*) ;;
  *)
    die "OMP agent directory must be absolute: $OMP_AGENT_DIR"
    ;;
esac

if [ -L "$CONFIG_PATH" ]; then
  die "refusing to replace symlinked OMP config: $CONFIG_PATH"
fi
if [ -e "$CONFIG_PATH" ] && [ ! -f "$CONFIG_PATH" ]; then
  die "OMP config path is not a regular file: $CONFIG_PATH"
fi
if [ -L "$OMP_AGENT_DIR" ]; then
  die "refusing to use symlinked OMP agent directory: $OMP_AGENT_DIR"
fi
if [ -e "$OMP_AGENT_DIR" ] && [ ! -d "$OMP_AGENT_DIR" ]; then
  die "OMP agent directory is not a directory: $OMP_AGENT_DIR"
fi

config_dir="$(dirname "$CONFIG_PATH")"
if [ -L "$config_dir" ] || { [ -e "$config_dir" ] && [ ! -d "$config_dir" ]; }; then
  die "OMP config parent is not a directory: $config_dir"
fi
backup_dir="$config_dir/backups/setup-omp"
if [ -L "$backup_dir" ]; then
  die "refusing to use symlinked OMP backup directory: $backup_dir"
fi
if [ -e "$backup_dir" ] && [ ! -d "$backup_dir" ]; then
  die "OMP backup path is not a directory: $backup_dir"
fi
if [ ! -d "$config_dir" ]; then
  mkdir -m 700 -p "$config_dir"
fi
if [ ! -d "$backup_dir" ]; then
  mkdir -m 700 -p "$backup_dir"
fi
if [ ! -d "$OMP_AGENT_DIR" ]; then
  mkdir -m 700 -p "$OMP_AGENT_DIR"
fi

agents_dir="$OMP_AGENT_DIR/agents"
if [ -L "$agents_dir" ]; then
  die "refusing to use symlinked OMP agents directory: $agents_dir"
fi
if [ -e "$agents_dir" ] && [ ! -d "$agents_dir" ]; then
  die "OMP agents path is not a directory: $agents_dir"
fi
if [ ! -d "$agents_dir" ]; then
  mkdir -m 700 "$agents_dir"
fi

if [ -e "$CONFIG_PATH" ]; then
  original_exists=true
  backup_path="$backup_dir/$(basename "$CONFIG_PATH").bak.$(date +%Y%m%d%H%M%S)"
  while [ -e "$backup_path" ] || [ -L "$backup_path" ]; do
    backup_path="$backup_dir/$(basename "$CONFIG_PATH").bak.$(date +%Y%m%d%H%M%S).$RANDOM"
  done
  cp -p "$CONFIG_PATH" "$backup_path"
  chmod 600 "$backup_path"
fi

next_agent_backup_path() {
  local name="$1"
  local backup="$backup_dir/agents-$name.md.bak.$(date +%Y%m%d%H%M%S)"
  local suffix=1
  while [ -e "$backup" ] || [ -L "$backup" ]; do
    backup="$backup_dir/agents-$name.md.bak.$(date +%Y%m%d%H%M%S).$suffix"
    suffix=$((suffix + 1))
  done
  printf '%s\n' "$backup"
}

prepare_managed_agents() {
  local index name source destination backup
  for index in "${!MANAGED_AGENT_NAMES[@]}"; do
    name="${MANAGED_AGENT_NAMES[$index]}"
    source="$MANAGED_AGENT_SOURCE_DIR/$name.md"
    destination="$agents_dir/$name.md"
    if [ "$source" = "$destination" ]; then
      die "managed OMP agent destination overlaps its repository source: $destination"
    fi
    if [ -L "$destination" ]; then
      die "refusing to replace symlinked managed OMP agent: $destination"
    fi
    if [ -e "$destination" ] && [ ! -f "$destination" ]; then
      die "managed OMP agent destination is not a regular file: $destination"
    fi
    managed_agent_temp_paths[$index]=""
    if [ -e "$destination" ]; then
      backup="$(next_agent_backup_path "$name")"
      cp -p "$destination" "$backup"
      managed_agent_backup_paths[$index]="$backup"
      managed_agent_original_exists[$index]=true
    else
      managed_agent_backup_paths[$index]=""
      managed_agent_original_exists[$index]=false
    fi
    managed_agent_dest_paths[$index]="$destination"
  done
}

install_managed_agents() {
  local index name source destination temporary
  for index in "${!MANAGED_AGENT_NAMES[@]}"; do
    name="${MANAGED_AGENT_NAMES[$index]}"
    source="$MANAGED_AGENT_SOURCE_DIR/$name.md"
    destination="${managed_agent_dest_paths[$index]}"
    temporary="$agents_dir/.$name.md.tmp.$$.$index"
    if [ -e "$temporary" ] || [ -L "$temporary" ]; then
      die "temporary managed OMP agent path already exists: $temporary"
    fi
    managed_agent_temp_paths[$index]="$temporary"
    cp "$source" "$temporary"
    chmod 600 "$temporary"
    mv "$temporary" "$destination"
    managed_agent_temp_paths[$index]=""
  done
}

validate_installed_agents() {
  local index name source destination
  for index in "${!MANAGED_AGENT_NAMES[@]}"; do
    name="${MANAGED_AGENT_NAMES[$index]}"
    source="$MANAGED_AGENT_SOURCE_DIR/$name.md"
    destination="${managed_agent_dest_paths[$index]}"
    if [ -L "$destination" ] || [ ! -f "$destination" ] || ! cmp -s "$source" "$destination"; then
      die "installed managed OMP agent does not match its repository source: $destination"
    fi
  done
}

cleanup_agent_temporary_files() {
  local temporary
  for temporary in "${managed_agent_temp_paths[@]}"; do
    if [ -n "$temporary" ]; then
      rm -f "$temporary"
    fi
  done
}

restore_managed_agents() {
  local index destination
  cleanup_agent_temporary_files
  for index in "${!MANAGED_AGENT_NAMES[@]}"; do
    destination="${managed_agent_dest_paths[$index]:-}"
    [ -n "$destination" ] || continue
    rm -f "$destination"
    if [ "${managed_agent_original_exists[$index]:-false}" = true ]; then
      cp -p "${managed_agent_backup_paths[$index]}" "$destination"
    fi
  done
}

restore_on_failure() {
  local status="$?"
  local rollback_status=0
  trap - EXIT
  set +e
  if [ "$transaction_failed" = true ]; then
    restore_managed_agents || rollback_status=1
    if [ "$original_exists" = true ]; then
      cp -p "$backup_path" "$CONFIG_PATH" || rollback_status=1
      chmod 600 "$CONFIG_PATH" || rollback_status=1
    else
      rm -f "$CONFIG_PATH" || rollback_status=1
    fi
    if [ "$rollback_status" -eq 0 ]; then
      echo "ROLLBACK OMP setup failed; previous configuration and managed agents restored" >&2
    else
      echo "ERROR  OMP setup rollback could not restore every managed file" >&2
    fi
  else
    cleanup_agent_temporary_files
  fi
  if [ "$rollback_status" -ne 0 ]; then
    status=1
  fi
  exit "$status"
}
trap restore_on_failure EXIT

prepare_managed_agents
install_managed_agents

run_bun "$REPO_DIR/scripts/merge-omp-config.mjs" \
  "$REPO_DIR/omp/omp.defaults.yml" \
  "$CONFIG_PATH"

validate_installed_agents
PI_CODING_AGENT_DIR="$config_dir" run_omp config get modelRoles >/dev/null

transaction_failed=false
echo "OK     OMP profile installed at $CONFIG_PATH"
echo "       Managed OMP agents were installed; unrelated agents and settings were preserved."
echo "       No credentials were read or written."
