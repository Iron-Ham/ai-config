#!/usr/bin/env bash
set -euo pipefail

# Install the repo-managed OMP profile without replacing unrelated user settings.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
OMP_BUN_VERSION="1.3.14"
OMP_MIN_VERSION="17.1.4"
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
MANAGED_SKILL_SOURCE_DIRS=(
  "$REPO_DIR/.agents/skills"
  "$REPO_DIR/skills"
)
GLOBAL_INSTRUCTION_SOURCE="$REPO_DIR/AGENTS.md"
MANAGED_MODEL_SOURCE_PATH="$REPO_DIR/omp/models.yml"

managed_agent_backup_paths=()
managed_agent_original_exists=()
managed_agent_dest_paths=()
managed_agent_temp_paths=()
managed_skill_names=()
managed_skill_source_paths=()
managed_skill_backup_paths=()
managed_skill_original_exists=()
managed_skill_dest_paths=()
managed_skill_temp_paths=()


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

validate_managed_skill_sources() {
  local source_dir source name index
  managed_skill_names=()
  managed_skill_source_paths=()
  for source_dir in "${MANAGED_SKILL_SOURCE_DIRS[@]}"; do
    if [ -L "$source_dir" ] || [ ! -d "$source_dir" ]; then
      die "managed OMP skill source directory is missing or symlinked: $source_dir"
    fi
    for source in "$source_dir"/*; do
      [ -d "$source" ] || continue
      if [ -L "$source" ]; then
        die "managed OMP skill source is symlinked: $source"
      fi
      name="$(basename "$source")"
      if [ -L "$source/SKILL.md" ] || [ ! -f "$source/SKILL.md" ]; then
        die "managed OMP skill source is missing or symlinked: $source/SKILL.md"
      fi
      for index in "${!managed_skill_names[@]}"; do
        if [ "${managed_skill_names[$index]}" = "$name" ]; then
          die "managed OMP skill name is defined more than once: $name"
        fi
      done
      managed_skill_names+=("$name")
      managed_skill_source_paths+=("$source")
    done
  done
  if [ "${#managed_skill_names[@]}" -eq 0 ]; then
    die "no managed OMP skill sources were found"
  fi
}

validate_global_instruction_source() {
  if [ -L "$GLOBAL_INSTRUCTION_SOURCE" ] || [ ! -f "$GLOBAL_INSTRUCTION_SOURCE" ]; then
    die "global OMP instruction source is missing or symlinked: $GLOBAL_INSTRUCTION_SOURCE"
  fi
}
validate_model_source() {
  if [ -L "$MANAGED_MODEL_SOURCE_PATH" ] || [ ! -f "$MANAGED_MODEL_SOURCE_PATH" ]; then
    die "managed OMP model source is missing or symlinked: $MANAGED_MODEL_SOURCE_PATH"
  fi
}


validate_managed_agent_sources
validate_managed_skill_sources
validate_global_instruction_source
validate_model_source


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
global_instruction_backup_path=""
global_instruction_original_exists=false
global_instruction_original_was_symlink=false
global_instruction_original_link_target=""
global_instruction_dest_path=""
global_instruction_temp_path=""
global_instruction_installed=false
model_config_path=""
model_config_backup_path=""
model_config_original_exists=false
model_config_changed=false


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

omp_version_at_least() {
  local candidate="$1"
  local minimum="$2"
  local candidate_major candidate_minor candidate_patch
  local minimum_major minimum_minor minimum_patch

  if [[ ! "$candidate" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)([-+].*)?$ ]]; then
    return 1
  fi
  candidate_major="${BASH_REMATCH[1]}"
  candidate_minor="${BASH_REMATCH[2]}"
  candidate_patch="${BASH_REMATCH[3]}"
  if [[ ! "$minimum" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    return 1
  fi
  minimum_major="${BASH_REMATCH[1]}"
  minimum_minor="${BASH_REMATCH[2]}"
  minimum_patch="${BASH_REMATCH[3]}"

  if ((10#$candidate_major != 10#$minimum_major)); then
    ((10#$candidate_major > 10#$minimum_major))
    return
  fi
  if ((10#$candidate_minor != 10#$minimum_minor)); then
    ((10#$candidate_minor > 10#$minimum_minor))
    return
  fi
  ((10#$candidate_patch >= 10#$minimum_patch))
}

ensure_omp() {
  local installed_version
  installed_version="$(run_omp --version 2>/dev/null || true)"
  installed_version="${installed_version#omp/}"
  if omp_version_at_least "$installed_version" "$OMP_MIN_VERSION"; then
    return
  fi

  echo "Installing @oh-my-pi/pi-coding-agent@$OMP_MIN_VERSION with Bun $OMP_BUN_VERSION"
  "$MISE_BIN" exec "bun@$OMP_BUN_VERSION" -- bun install --global "@oh-my-pi/pi-coding-agent@$OMP_MIN_VERSION"
  installed_version="$(run_omp --version 2>/dev/null || true)"
  installed_version="${installed_version#omp/}"
  if ! omp_version_at_least "$installed_version" "$OMP_MIN_VERSION"; then
    echo "ERROR  OMP $OMP_MIN_VERSION or newer was not installed" >&2
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
model_config_path="$OMP_AGENT_DIR/models.yml"
if [ "$MANAGED_MODEL_SOURCE_PATH" = "$model_config_path" ]; then
  die "managed OMP model destination overlaps its repository source: $model_config_path"
fi
if [ -L "$model_config_path" ]; then
  die "refusing to replace symlinked OMP model config: $model_config_path"
fi
if [ -e "$model_config_path" ] && [ ! -f "$model_config_path" ]; then
  die "OMP model config path is not a regular file: $model_config_path"
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

skills_dir="$OMP_AGENT_DIR/skills"
if [ -L "$skills_dir" ]; then
  die "refusing to use symlinked OMP skills directory: $skills_dir"
fi
if [ -e "$skills_dir" ] && [ ! -d "$skills_dir" ]; then
  die "OMP skills path is not a directory: $skills_dir"
fi
if [ ! -d "$skills_dir" ]; then
  mkdir -m 700 "$skills_dir"
fi


global_instruction_dest_path="$OMP_AGENT_DIR/AGENTS.md"
if [ "$GLOBAL_INSTRUCTION_SOURCE" = "$global_instruction_dest_path" ]; then
  die "global OMP instruction destination overlaps its repository source: $global_instruction_dest_path"
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
if [ -e "$model_config_path" ]; then
  model_config_original_exists=true
  model_config_backup_path="$backup_dir/models.yml.bak.$(date +%Y%m%d%H%M%S)"
  while [ -e "$model_config_backup_path" ] || [ -L "$model_config_backup_path" ]; do
    model_config_backup_path="$backup_dir/models.yml.bak.$(date +%Y%m%d%H%M%S).$RANDOM"
  done
  cp -p "$model_config_path" "$model_config_backup_path"
  chmod 600 "$model_config_backup_path"
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

next_skill_backup_path() {
  local name="$1"
  local backup="$backup_dir/skills-$name.bak.$(date +%Y%m%d%H%M%S)"
  local suffix=1
  while [ -e "$backup" ] || [ -L "$backup" ]; do
    backup="$backup_dir/skills-$name.bak.$(date +%Y%m%d%H%M%S).$suffix"
    suffix=$((suffix + 1))
  done
  printf '%s\n' "$backup"
}

next_global_instruction_backup_path() {
  local backup="$backup_dir/AGENTS.md.bak.$(date +%Y%m%d%H%M%S)"
  local suffix=1
  while [ -e "$backup" ] || [ -L "$backup" ]; do
    backup="$backup_dir/AGENTS.md.bak.$(date +%Y%m%d%H%M%S).$suffix"
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

prepare_managed_skills() {
  local index name destination backup source_dir
  for index in "${!managed_skill_names[@]}"; do
    name="${managed_skill_names[$index]}"
    destination="$skills_dir/$name"
    for source_dir in "${MANAGED_SKILL_SOURCE_DIRS[@]}"; do
      case "$destination/" in
        "$source_dir/"*)
          die "managed OMP skill destination overlaps its repository source: $destination"
          ;;
      esac
    done
    if [ -L "$destination" ]; then
      die "refusing to replace symlinked managed OMP skill: $destination"
    fi
    if [ -e "$destination" ] && [ ! -d "$destination" ]; then
      die "managed OMP skill destination is not a directory: $destination"
    fi
    managed_skill_temp_paths[$index]=""
    if [ -e "$destination" ]; then
      backup="$(next_skill_backup_path "$name")"
      cp -pR "$destination" "$backup"
      managed_skill_backup_paths[$index]="$backup"
      managed_skill_original_exists[$index]=true
    else
      managed_skill_backup_paths[$index]=""
      managed_skill_original_exists[$index]=false
    fi
    managed_skill_dest_paths[$index]="$destination"
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

install_managed_skills() {
  local index name source destination temporary
  for index in "${!managed_skill_names[@]}"; do
    name="${managed_skill_names[$index]}"
    source="${managed_skill_source_paths[$index]}"
    destination="${managed_skill_dest_paths[$index]}"
    temporary="$skills_dir/.$name.tmp.$$.$index"
    if [ -e "$temporary" ] || [ -L "$temporary" ]; then
      die "temporary managed OMP skill path already exists: $temporary"
    fi
    cp -R "$source" "$temporary"
    chmod -R u+rwX,go-rwx "$temporary"
    rm -rf "$destination"
    mv "$temporary" "$destination"
    managed_skill_temp_paths[$index]=""
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

validate_installed_skills() {
  local index name source destination
  for index in "${!managed_skill_names[@]}"; do
    name="${managed_skill_names[$index]}"
    source="${managed_skill_source_paths[$index]}"
    destination="${managed_skill_dest_paths[$index]}"
    if [ -L "$destination" ] || [ ! -d "$destination" ] || [ ! -f "$destination/SKILL.md" ]; then
      die "installed managed OMP skill does not match its repository source: $destination"
    fi
    if ! diff -qr "$source" "$destination" >/dev/null 2>&1; then
      die "installed managed OMP skill does not match its repository source: $destination"
    fi
  done
}

prepare_global_instructions() {
  local current_target
  if [ -L "$global_instruction_dest_path" ]; then
    current_target="$(readlink "$global_instruction_dest_path")"
    if [ "$current_target" = "$GLOBAL_INSTRUCTION_SOURCE" ]; then
      return
    fi
    if [ -e "$global_instruction_dest_path" ]; then
      die "refusing to replace non-dangling symlinked global OMP instructions: $global_instruction_dest_path"
    fi
    global_instruction_original_was_symlink=true
    global_instruction_original_link_target="$current_target"
    return
  fi
  if [ -e "$global_instruction_dest_path" ] && [ ! -f "$global_instruction_dest_path" ]; then
    die "global OMP instruction destination is not a regular file: $global_instruction_dest_path"
  fi
  if [ -e "$global_instruction_dest_path" ]; then
    global_instruction_backup_path="$(next_global_instruction_backup_path)"
    cp -p "$global_instruction_dest_path" "$global_instruction_backup_path"
    global_instruction_original_exists=true
  fi
}

install_global_instructions() {
  local temporary="$OMP_AGENT_DIR/.AGENTS.md.tmp.$$"
  if [ -L "$global_instruction_dest_path" ]; then
    if [ "$(readlink "$global_instruction_dest_path")" = "$GLOBAL_INSTRUCTION_SOURCE" ]; then
      return
    fi
    global_instruction_installed=true
    rm -f "$global_instruction_dest_path"
  fi
  if [ -e "$temporary" ] || [ -L "$temporary" ]; then
    die "temporary global OMP instruction path already exists: $temporary"
  fi
  global_instruction_temp_path="$temporary"
  ln -s "$GLOBAL_INSTRUCTION_SOURCE" "$temporary"
  mv "$temporary" "$global_instruction_dest_path"
  global_instruction_temp_path=""
  global_instruction_installed=true
}

validate_global_instructions() {
  if [ ! -L "$global_instruction_dest_path" ] ||
    [ "$(readlink "$global_instruction_dest_path")" != "$GLOBAL_INSTRUCTION_SOURCE" ]; then
    die "global OMP instructions do not link to the repository source: $global_instruction_dest_path"
  fi
}

cleanup_global_instruction_temporary_file() {
  if [ -n "$global_instruction_temp_path" ]; then
    rm -f "$global_instruction_temp_path"
  fi
}

cleanup_agent_temporary_files() {
  local temporary
  for temporary in "${managed_agent_temp_paths[@]}"; do
    if [ -n "$temporary" ]; then
      rm -f "$temporary"
    fi
  done
}

cleanup_skill_temporary_files() {
  local temporary
  for temporary in "${managed_skill_temp_paths[@]}"; do
    if [ -n "$temporary" ]; then
      rm -rf "$temporary"
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

restore_managed_skills() {
  local index destination
  cleanup_skill_temporary_files
  for index in "${!managed_skill_names[@]}"; do
    destination="${managed_skill_dest_paths[$index]:-}"
    [ -n "$destination" ] || continue
    rm -rf "$destination"
    if [ "${managed_skill_original_exists[$index]:-false}" = true ]; then
      cp -pR "${managed_skill_backup_paths[$index]}" "$destination"
    fi
  done
}

restore_global_instructions() {
  cleanup_global_instruction_temporary_file
  if [ "$global_instruction_installed" = false ]; then
    return
  fi
  rm -f "$global_instruction_dest_path"
  if [ "$global_instruction_original_was_symlink" = true ]; then
    ln -s "$global_instruction_original_link_target" "$global_instruction_dest_path"
  elif [ "$global_instruction_original_exists" = true ]; then
    cp -p "$global_instruction_backup_path" "$global_instruction_dest_path"
  fi
}
restore_model_config() {
  if [ "$model_config_changed" = false ]; then
    return
  fi
  if [ "$model_config_original_exists" = true ]; then
    cp -p "$model_config_backup_path" "$model_config_path"
    chmod 600 "$model_config_path"
  else
    rm -f "$model_config_path"
  fi
}


restore_on_failure() {
  local status="$?"
  local rollback_status=0
  trap - EXIT
  set +e
  if [ "$transaction_failed" = true ]; then
    restore_managed_skills || rollback_status=1
    restore_managed_agents || rollback_status=1
    restore_global_instructions || rollback_status=1
    restore_model_config || rollback_status=1

    if [ "$original_exists" = true ]; then
      cp -p "$backup_path" "$CONFIG_PATH" || rollback_status=1
      chmod 600 "$CONFIG_PATH" || rollback_status=1
    else
      rm -f "$CONFIG_PATH" || rollback_status=1
    fi
    if [ "$rollback_status" -eq 0 ]; then
      echo "ROLLBACK OMP setup failed; previous configuration, managed OMP models, skills, agents, and global instructions restored" >&2
    else
      echo "ERROR  OMP setup rollback could not restore every managed file" >&2
    fi
    cleanup_agent_temporary_files
    cleanup_skill_temporary_files
    cleanup_global_instruction_temporary_file
  fi
  if [ "$rollback_status" -ne 0 ]; then
    status=1
  fi
  exit "$status"
}
trap restore_on_failure EXIT
prepare_managed_skills
prepare_managed_agents
prepare_global_instructions
install_managed_skills
install_managed_agents
install_global_instructions

run_bun "$REPO_DIR/scripts/merge-omp-config.mjs" \
  "$REPO_DIR/omp/omp.defaults.yml" \
  "$CONFIG_PATH"
run_bun "$REPO_DIR/scripts/merge-omp-models.mjs" \
  "$MANAGED_MODEL_SOURCE_PATH" \
  "$model_config_path"
model_config_changed=true


validate_installed_skills
validate_installed_agents
PI_CODING_AGENT_DIR="$config_dir" run_omp config get modelRoles >/dev/null

transaction_failed=false
echo "OK     OMP profile installed at $CONFIG_PATH"
echo "       Managed OMP models, skills, agents, and global instructions were installed; unrelated settings were preserved."
echo "       No credentials were read or written."
