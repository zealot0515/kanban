#!/usr/bin/env bash
# Run the current checkout as a local development version.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./overrides/task-customizations/run-dev.sh [--skip-install] [runtime options]

  --skip-install  Reuse installed dependencies; fail if either worktree is not installed
  -h, --help      Show this help

Runtime options are passed to the full-stack dev server, for example:
  --no-open
  --with-shutdown-cleanup
  --port 3484

The script starts the TypeScript runtime and Vite UI from this checkout, disables
automatic updates, and opens the local development UI unless --no-open is passed.
Press Ctrl-C to stop both processes.
USAGE
}

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

skip_install=false
dev_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) skip_install=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) dev_args+=("$1"); shift ;;
  esac
done

command -v node >/dev/null || fail 'Missing command: node'
command -v npm >/dev/null || fail 'Missing command: npm'
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || fail 'Node.js 22+ is required'

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

root_lock_indicator="$repo_root/node_modules/.package-lock.json"
web_lock_indicator="$repo_root/web-ui/node_modules/.package-lock.json"
if [[ "$skip_install" == false ]]; then
  if [[ ! -f "$root_lock_indicator" ]]; then
    printf 'Installing runtime dependencies...\n'
    npm ci --no-audit --no-fund
  fi
  if [[ ! -f "$web_lock_indicator" ]]; then
    printf 'Installing web UI dependencies...\n'
    npm --prefix "$repo_root/web-ui" ci --no-audit --no-fund
  fi
else
  [[ -f "$root_lock_indicator" ]] || fail 'Runtime dependencies are missing; remove --skip-install'
  [[ -f "$web_lock_indicator" ]] || fail 'Web UI dependencies are missing; remove --skip-install'
fi

export NODE_ENV=development
export KANBAN_NO_AUTO_UPDATE=1

printf 'Starting Kanban development version from %s\n' "$repo_root"
exec npm run dev:full -- "${dev_args[@]}"
